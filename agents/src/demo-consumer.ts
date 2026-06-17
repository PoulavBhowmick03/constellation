import "dotenv/config";
import { createWalletClient, getAddress, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { BazaarSkill, FacilitateResponse, X402PaymentDetails, X402PaymentProof } from "./types.js";

const MANTLE_RPC = process.env.MANTLE_RPC ?? "https://rpc.mantle.xyz";
const BAZAAR_API =
  process.env.BAZAAR_API_URL ?? process.env.NEXT_PUBLIC_BAZAAR_API ?? "http://localhost:3002";
const FACILITATOR_URL =
  process.env.FACILITATOR_URL ?? process.env.NEXT_PUBLIC_FACILITATOR_URL ?? "http://localhost:3001";

const mantleChain = {
  id: 5000,
  name: "Mantle",
  nativeCurrency: { name: "MNT", symbol: "MNT", decimals: 18 },
  rpcUrls: {
    default: { http: [MANTLE_RPC] },
    public: { http: [MANTLE_RPC] },
  },
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

async function discoverSpawnFailureAnalyst(): Promise<BazaarSkill> {
  const url = new URL("/skills", BAZAAR_API);
  url.searchParams.set("search", "spawn");

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Bazaar discovery failed with ${response.status}: ${await response.text()}`);
  }

  const skills = parseSkillList(await response.json());
  const skill = skills.find((candidate) => candidate.name === "spawn-failure-analyst");
  if (!skill) {
    throw new Error("spawn-failure-analyst was not returned by Bazaar /skills?search=spawn");
  }

  return skill;
}

function skillPrice(skill: BazaarSkill): bigint {
  const value = skill.priceUsdcUnits ?? skill.price ?? skill.pricePerCallBps ?? 500_000;
  return BigInt(value);
}

function skillId(skill: BazaarSkill): number {
  return Number(skill.skillId);
}

async function buildPaymentProof(skill: BazaarSkill): Promise<{
  paymentDetails: X402PaymentDetails;
  paymentProof: X402PaymentProof;
}> {
  const account = privateKeyToAccount(requiredEnv("CONSUMER_PRIVATE_KEY") as Hex);
  const walletClient = createWalletClient({
    account,
    chain: mantleChain,
    transport: http(MANTLE_RPC),
  });

  const amount = skillPrice(skill);
  const token = getAddress((skill.token ?? skill.asset ?? requiredAddress("USDC_ADDRESS")) as Address);
  const providerEndpoint = skill.endpoint;
  const providerAddress = requiredAddress("SPAWN_PROVIDER_ADDRESS");
  const operatorAddress = requiredAddress("OPERATOR_ADDRESS");
  const id = skillId(skill);
  const validBefore = Math.floor(Date.now() / 1000) + 300;
  const nonce = Date.now();

  const paymentDetails: X402PaymentDetails = {
    scheme: "exact",
    network: "eip155:5000",
    maxAmountRequired: amount.toString(),
    resource: providerEndpoint,
    description: "LedgerForge x402 payment for spawn-failure-analyst",
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
    domain: {
      name: "LedgerForge",
      version: "1",
      chainId: 5000,
      verifyingContract: requiredAddress("SKILL_REGISTRY_ADDRESS"),
    },
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

  return {
    paymentDetails,
    paymentProof: {
      scheme: "exact",
      network: "eip155:5000",
      payload: {
        signature,
        authorization,
      },
      reputationScore: 90,
    },
  };
}

async function facilitatePayment(
  paymentDetails: X402PaymentDetails,
  paymentProof: X402PaymentProof,
): Promise<FacilitateResponse> {
  const response = await fetch(new URL("/facilitate", FACILITATOR_URL), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ paymentDetails, paymentProof }),
  });
  const body = (await response.json()) as FacilitateResponse;

  if (!response.ok || !body.success || !body.accessToken) {
    throw new Error(body.error ?? `Facilitator returned ${response.status}`);
  }

  return body;
}

async function executeSkill(endpoint: string, accessToken: string): Promise<unknown> {
  const url = new URL(endpoint);
  url.searchParams.set("lineageKey", process.env.DEMO_LINEAGE_KEY ?? "demo-lineage");
  url.searchParams.set("generation", process.env.DEMO_GENERATION ?? "1");

  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Skill endpoint returned ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

async function main(): Promise<void> {
  const skill = await discoverSpawnFailureAnalyst();
  const price = skillPrice(skill);
  const score = skill.reputationScore ?? skill.score ?? 0;

  console.log(
    `found spawn-failure-analyst score=${score} price=${price} USDC units`,
  );
  console.log("building eip-712 payment intent...");
  const { paymentDetails, paymentProof } = await buildPaymentProof(skill);

  console.log("facilitating payment...");
  const facilitated = await facilitatePayment(paymentDetails, paymentProof);
  console.log(`settled ${facilitated.settlementTxHash}`);

  const accessToken = facilitated.accessToken;
  if (!accessToken) throw new Error("Facilitator did not return an access token");

  const result = await executeSkill(skill.endpoint, accessToken);
  console.log(`skill result: ${JSON.stringify(result, null, 2)}`);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`demo failed: ${message}`);
  process.exitCode = 1;
});
