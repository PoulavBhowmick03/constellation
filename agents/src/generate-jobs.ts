import "dotenv/config";
import { createWalletClient, getAddress, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { BazaarSkill, FacilitateResponse, X402PaymentDetails, X402PaymentProof } from "./types.js";

/**
 * Populates the /jobs feed with REAL settled x402 jobs against existing paid
 * skills. Each job is a genuine on-chain settlement (transferFrom + fee +
 * recordJobCompletion -> JobCompleted event -> indexer settlement row).
 *
 * The demo consumer wallet doubles as provider/operator, so each settlement is
 * a self-transfer (net-zero USDC, only gas), letting us run a batch cheaply.
 *
 * Usage: node --env-file=../.env node_modules/.bin/tsx src/generate-jobs.ts
 * Env knobs: JOB_AMOUNT_UNITS (default 10000 = 0.01 USDC), JOB_SKILL_IDS
 * (comma-separated; default a spread of public paid skills).
 */

const MANTLE_RPC = process.env.MANTLE_RPC ?? "https://rpc.mantle.xyz";
const MANTLE_EXPLORER = process.env.MANTLE_EXPLORER ?? "https://mantlescan.xyz";
const BAZAAR_API =
  process.env.BAZAAR_API_URL ?? process.env.NEXT_PUBLIC_BAZAAR_API ?? "https://ledgerforge-indexer.fly.dev";
const FACILITATOR_URL =
  process.env.FACILITATOR_URL ?? process.env.NEXT_PUBLIC_FACILITATOR_URL ?? "https://ledgerforge-facilitator.fly.dev";
const AMOUNT_UNITS = BigInt(process.env.JOB_AMOUNT_UNITS ?? "10000"); // 0.01 USDC
const DEFAULT_SKILL_IDS = [13, 14, 11, 12, 15, 10, 1];

const mantleChain = {
  id: 5000,
  name: "Mantle",
  nativeCurrency: { name: "MNT", symbol: "MNT", decimals: 18 },
  rpcUrls: { default: { http: [MANTLE_RPC] }, public: { http: [MANTLE_RPC] } },
} as const;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
function requiredAddress(name: string): Address {
  return getAddress(requiredEnv(name));
}

function parseSkillList(payload: unknown): BazaarSkill[] {
  if (Array.isArray(payload)) return payload as BazaarSkill[];
  if (typeof payload === "object" && payload !== null && "skills" in payload) {
    return (payload as { skills: BazaarSkill[] }).skills;
  }
  if (typeof payload === "object" && payload !== null && "data" in payload) {
    return (payload as { data: BazaarSkill[] }).data;
  }
  return [];
}

async function discoverSkills(): Promise<BazaarSkill[]> {
  const response = await fetch(new URL("/skills", BAZAAR_API));
  if (!response.ok) throw new Error(`Bazaar /skills failed ${response.status}`);
  return parseSkillList(await response.json());
}

async function settleJob(
  skill: BazaarSkill,
  amount: bigint,
  score: number,
  index: number,
): Promise<FacilitateResponse> {
  const account = privateKeyToAccount(requiredEnv("CONSUMER_PRIVATE_KEY") as Hex);
  const walletClient = createWalletClient({ account, chain: mantleChain, transport: http(MANTLE_RPC) });

  const token = getAddress((skill.token ?? skill.asset ?? requiredAddress("USDC_ADDRESS")) as Address);
  const providerAddress = requiredAddress("SPAWN_PROVIDER_ADDRESS");
  const operatorAddress = requiredAddress("OPERATOR_ADDRESS");
  const id = Number(skill.skillId);
  const validBefore = Math.floor(Date.now() / 1000) + 300;
  const nonce = Date.now() * 1000 + index; // unique per job

  const paymentDetails: X402PaymentDetails = {
    scheme: "exact",
    network: "eip155:5000",
    maxAmountRequired: amount.toString(),
    resource: skill.endpoint,
    description: `LedgerForge x402 payment for ${skill.name}`,
    mimeType: "application/json",
    payTo: operatorAddress,
    maxTimeoutSeconds: 60,
    asset: token,
    skillId: id,
    extra: { name: "LedgerForge", version: "1.0.0" },
  };

  const authorization = {
    from: account.address,
    to: providerAddress,
    amount: amount.toString(),
    token,
    skillId: id,
    nonce,
    validBefore,
  };

  const signature = await walletClient.signTypedData({
    account,
    domain: { name: "LedgerForge", version: "1", chainId: 5000, verifyingContract: requiredAddress("SKILL_REGISTRY_ADDRESS") },
    types: {
      Payment: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "token", type: "address" },
        { name: "skillId", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "validBefore", type: "uint256" },
      ],
    },
    primaryType: "Payment",
    message: {
      from: authorization.from,
      to: authorization.to,
      amount,
      token,
      skillId: BigInt(id),
      nonce: BigInt(nonce),
      validBefore: BigInt(validBefore),
    },
  });

  const proof: X402PaymentProof = {
    scheme: "exact",
    network: "eip155:5000",
    payload: { signature, authorization },
    reputationScore: score,
  };

  // Bound the request: settlement waits for on-chain confirmation and can be
  // slow, but an unbounded fetch hangs the whole batch if a response stalls.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(process.env.JOB_FETCH_TIMEOUT_MS ?? "150000"));
  let response: Response;
  try {
    response = await fetch(new URL("/facilitate", FACILITATOR_URL), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paymentDetails, paymentProof: proof }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  const body = (await response.json()) as FacilitateResponse;
  if (!response.ok || !body.success) {
    throw new Error(body.error ?? `Facilitator returned ${response.status}`);
  }
  return body;
}

function txLink(hash?: string): string {
  return hash ? `${MANTLE_EXPLORER.replace(/\/$/, "")}/tx/${hash}` : "(no tx)";
}

async function main(): Promise<void> {
  const ids = (process.env.JOB_SKILL_IDS?.split(",").map((s) => Number(s.trim())) ?? DEFAULT_SKILL_IDS);
  // Optional per-job amounts (base units), paired by index with JOB_SKILL_IDS.
  // Falls back to a single JOB_AMOUNT_UNITS for every job when unset.
  const amounts = process.env.JOB_AMOUNTS?.split(",").map((s) => BigInt(s.trim()));
  const scores = [92, 88, 95, 78, 84, 90, 81, 76, 94, 83];

  const all = await discoverSkills();
  const targets = ids
    .map((id) => all.find((s) => Number(s.skillId) === id))
    .filter((s): s is BazaarSkill => Boolean(s) && !String(s!.endpoint).includes("localhost"));

  if (targets.length === 0) throw new Error("No reachable paid skills found to target");

  let ok = 0;
  let volume = 0n;
  console.log(`generating ${targets.length} settled jobs\n`);
  for (const [index, skill] of targets.entries()) {
    const score = scores[index % scores.length];
    const amount = amounts?.[index] ?? AMOUNT_UNITS;
    try {
      const settled = await settleJob(skill, amount, score, index);
      ok++;
      volume += amount;
      console.log(
        `✓ job ${index + 1}: ${skill.name} (skillId ${skill.skillId}) amount=${(Number(amount) / 1e6).toFixed(2)} USDC score=${score}`,
      );
      console.log(`    settlement: ${txLink(settled.settlementTxHash)}`);
    } catch (err) {
      console.warn(`✗ job ${index + 1}: ${skill.name} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log(`\n${ok}/${targets.length} jobs settled, ${(Number(volume) / 1e6).toFixed(2)} USDC volume added. Refresh the /jobs feed.`);
}

main().catch((err) => {
  console.error(`generate-jobs failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
