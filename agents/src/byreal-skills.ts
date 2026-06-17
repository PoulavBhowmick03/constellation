import "dotenv/config";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  getAddress,
  http,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { verifySettlementAccess } from "./skill-auth.js";

const _dirname = dirname(fileURLToPath(import.meta.url));
const REALCLAW_BIN = resolve(_dirname, "..", "node_modules", ".bin", "byreal-cli");
const PERPS_BIN = resolve(_dirname, "..", "node_modules", ".bin", "byreal-perps-cli");

const MANTLE_EXPLORER = process.env.MANTLE_EXPLORER ?? "https://mantlescan.xyz";
const MANTLE_RPC = process.env.MANTLE_RPC ?? "https://rpc.mantle.xyz";
const BYREAL_SKILL_PORT = Number(process.env.BYREAL_SKILL_PORT ?? "3006");
const LOCAL_SKILL_BASE_URL =
  process.env.BYREAL_SKILL_PUBLIC_URL ?? `http://localhost:${BYREAL_SKILL_PORT}`;

const mantleChain = {
  id: 5000,
  name: "Mantle",
  nativeCurrency: { name: "MNT", symbol: "MNT", decimals: 18 },
  rpcUrls: {
    default: { http: [MANTLE_RPC] },
    public: { http: [MANTLE_RPC] },
  },
} as const;

const SKILL_REGISTRY_ABI = [
  {
    type: "function",
    name: "registerSkill",
    stateMutability: "nonpayable",
    inputs: [
      { name: "name", type: "string" },
      { name: "version", type: "string" },
      { name: "endpoint", type: "string" },
      { name: "pricePerCallBps", type: "uint256" },
      { name: "requiresEscrow", type: "bool" },
      { name: "metadataURI", type: "string" },
    ],
    outputs: [{ name: "skillId", type: "uint256" }],
  },
  {
    type: "event",
    name: "SkillRegistered",
    inputs: [
      { name: "skillId", type: "uint256", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "name", type: "string", indexed: false },
      { name: "version", type: "string", indexed: false },
      { name: "erc8004AgentId", type: "uint256", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
] as const;

const BAZAAR_LISTINGS_ABI = [
  {
    type: "function",
    name: "list",
    stateMutability: "nonpayable",
    inputs: [
      { name: "skillId", type: "uint256" },
      { name: "tier", type: "uint8" },
    ],
    outputs: [],
  },
] as const;

interface ByrealSkillDef {
  name: string;
  version: string;
  description: string;
  endpointPath: string;
  priceUsdcUnits: bigint;
  requiresEscrow: boolean;
  metadataURI: string;
  tier: number;
}

interface RegisteredByrealSkill extends ByrealSkillDef {
  skillId: bigint;
  erc8004AgentId: bigint;
  registrationTxHash: Hex;
  listingTxHash: Hex;
  endpoint: string;
}

const BYREAL_SKILLS: ByrealSkillDef[] = [
  {
    name: "byreal-pool-analysis",
    version: "1.0.0",
    description:
      "Full CLMM pool analysis via Byreal RealClaw on Solana. Returns APR breakdown (fee + reward incentive), TVL, 24h volume, risk assessment, and range recommendations.",
    endpointPath: "/byreal/pool-analysis",
    priceUsdcUnits: 0n,
    requiresEscrow: false,
    metadataURI: "ipfs://ledgerforge/byreal/pool-analysis/v1",
    tier: 0,
  },
  {
    name: "byreal-top-pools",
    version: "1.0.0",
    description:
      "Top Byreal CLMM pools sorted by APR, TVL, or volume. Returns live pool data from Solana via Byreal RealClaw. Sort fields: apr24h, tvl, volume24h.",
    endpointPath: "/byreal/top-pools",
    priceUsdcUnits: 0n,
    requiresEscrow: false,
    metadataURI: "ipfs://ledgerforge/byreal/top-pools/v1",
    tier: 0,
  },
  {
    name: "byreal-swap-preview",
    version: "1.0.0",
    description:
      "Preview a Byreal DEX swap (dry-run). Returns price impact, expected output amount, and route details. No transaction generated. Requires walletAddress, inputMint, outputMint, amount.",
    endpointPath: "/byreal/swap-preview",
    priceUsdcUnits: 0n,
    requiresEscrow: false,
    metadataURI: "ipfs://ledgerforge/byreal/swap-preview/v1",
    tier: 0,
  },
  {
    name: "byreal-perps-signals",
    version: "1.0.0",
    description:
      "Byreal Hyperliquid perpetual futures trading signals. Returns technical analysis, trend indicators, and support/resistance levels for a given coin (e.g. BTC, ETH, SOL).",
    endpointPath: "/byreal/perps-signals",
    priceUsdcUnits: 0n,
    requiresEscrow: false,
    metadataURI: "ipfs://ledgerforge/byreal/perps-signals/v1",
    tier: 0,
  },
];

const publicClient = createPublicClient({
  chain: mantleChain,
  transport: http(MANTLE_RPC),
});

const SOLANA_ADDR_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const COIN_RE = /^[A-Z0-9]{1,10}$/;
const AMOUNT_RE = /^[0-9]+(\.[0-9]+)?$/;
const SORT_FIELD_RE = /^[a-z0-9_]{1,20}$/;
const EVM_ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const DEFAULT_SOLANA_WALLET = "11111111111111111111111111111111";
const LIMIT_RE = /^[0-9]{1,3}$/;

function validated(value: string, pattern: RegExp, name: string): string {
  if (!pattern.test(value)) throw new Error(`Invalid ${name}: "${value}"`);
  return value;
}

function runCLI(bin: string, args: string, timeoutMs = 15000): unknown {
  const raw = execSync(`${bin} ${args} -o json`, {
    timeout: timeoutMs,
    encoding: "utf-8",
    env: { ...process.env },
  });
  // CLIs may emit banner/warning text before the JSON block
  const start = raw.search(/[{[]/);
  if (start === -1) throw new Error(`No JSON in CLI output: ${raw.slice(0, 300)}`);
  return JSON.parse(raw.slice(start));
}

function getPoolAnalysis(poolAddress: string): unknown {
  const addr = validated(poolAddress, SOLANA_ADDR_RE, "poolAddress");
  return runCLI(REALCLAW_BIN, `pools analyze ${addr}`);
}

function getTopPools(sortField: string, pageSize: string): unknown {
  const field = validated(sortField, SORT_FIELD_RE, "sortField");
  const size = validated(pageSize, LIMIT_RE, "pageSize");
  return runCLI(REALCLAW_BIN, `pools list --sort-field ${field} --page-size ${size}`);
}

function exposeTopLevelPools(cliResult: unknown): unknown {
  if (
    typeof cliResult === "object" &&
    cliResult !== null &&
    "data" in cliResult &&
    typeof cliResult.data === "object" &&
    cliResult.data !== null &&
    "pools" in cliResult.data
  ) {
    const pools = Array.isArray(cliResult.data.pools)
      ? cliResult.data.pools.map((pool) => {
          if (typeof pool !== "object" || pool === null || !("id" in pool)) return pool;
          const id = String(pool.id);
          return { ...pool, address: id, poolAddress: id };
        })
      : cliResult.data.pools;
    return { ...cliResult, pools };
  }
  return cliResult;
}

function getSwapPreview(
  walletAddress: string,
  inputMint: string,
  outputMint: string,
  amount: string,
  slippage: string,
): unknown {
  const wallet = EVM_ADDR_RE.test(walletAddress)
    ? DEFAULT_SOLANA_WALLET
    : validated(walletAddress, SOLANA_ADDR_RE, "walletAddress");
  const inMint = validated(inputMint, SOLANA_ADDR_RE, "inputMint");
  const outMint = validated(outputMint, SOLANA_ADDR_RE, "outputMint");
  const amt = validated(amount, AMOUNT_RE, "amount");
  const slip = validated(slippage, AMOUNT_RE, "slippage");
  return runCLI(
    REALCLAW_BIN,
    `swap execute --wallet-address ${wallet} --input-mint ${inMint} --output-mint ${outMint} --amount ${amt} --slippage ${slip} --dry-run`,
    20000,
  );
}

function getPerpsSignals(coin: string): unknown {
  const c = validated(coin.toUpperCase(), COIN_RE, "coin");
  return runCLI(PERPS_BIN, `signal scan ${c}`, 20000);
}

function json(res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
  });
  res.end(
    JSON.stringify(body, (_, value) => (typeof value === "bigint" ? value.toString() : value)),
  );
}

function accessTokenIsValid(req: IncomingMessage) {
  return verifySettlementAccess(req.headers.authorization, publicClient);
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

export function startByrealSkillServer(): void {
  const server = createServer(async (req, res) => {
    try {
      // browser preflight for auth headers
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-headers": "Authorization, Content-Type",
          "access-control-max-age": "86400",
        });
        res.end();
        return;
      }

      if (!req.url) {
        json(res, 400, { error: "Missing URL" });
        return;
      }

      const url = new URL(
        req.url,
        `http://${req.headers.host ?? `localhost:${BYREAL_SKILL_PORT}`}`,
      );

      if (url.pathname === "/health") {
        json(res, 200, {
          status: "ok",
          service: "byreal-ledgerforge-skills",
          skills: ["pool-analysis", "top-pools", "swap-preview", "perps-signals"],
          binsReady: {
            realclaw: existsSync(REALCLAW_BIN),
            perps: existsSync(PERPS_BIN),
          },
        });
        return;
      }

      const auth = await accessTokenIsValid(req);
      if (!auth.ok) {
        json(res, 401, {
          error: "Missing or invalid LedgerForge settlement proof",
          hint: "Include 'Authorization: Bearer settled:<txHash>:<timestamp>' from a real x402Escrow settlement",
          reason: auth.reason,
        });
        return;
      }

      if (url.pathname === "/byreal/pool-analysis") {
        const poolAddress = url.searchParams.get("poolAddress");
        if (!poolAddress) {
          json(res, 400, { error: "poolAddress query param required" });
          return;
        }
        try {
          json(res, 200, {
            success: true,
            skill: "byreal-pool-analysis",
            data: getPoolAnalysis(poolAddress),
            executedAt: Date.now(),
            note: "Pool analysis via Byreal RealClaw on Solana CLMM",
          });
        } catch (poolErr) {
          const msg = poolErr instanceof Error ? poolErr.message : String(poolErr);
          const lower = msg.toLowerCase();
          const status = lower.includes("invalid") || lower.includes("not found") ? 400 : 500;
          json(res, status, {
            error: msg,
            hint: "Use a valid Solana CLMM pool address, e.g. from /byreal/top-pools",
          });
        }
        return;
      }

      if (url.pathname === "/byreal/top-pools") {
        const sortField = url.searchParams.get("sortField") ?? "apr24h";
        const pageSize = url.searchParams.get("pageSize") ?? "10";
        const topPools = getTopPools(sortField, pageSize);
        json(res, 200, {
          success: true,
          skill: "byreal-top-pools",
          data: exposeTopLevelPools(topPools),
          executedAt: Date.now(),
          note: "Top CLMM pools by APR via Byreal RealClaw",
        });
        return;
      }

      if (url.pathname === "/byreal/swap-preview") {
        let walletAddress: string | undefined;
        let inputMint: string | undefined;
        let outputMint: string | undefined;
        let amount: string | undefined;
        let slippage = "0.5";

        if (req.method === "POST") {
          const body = (await readBody(req)) as Record<string, string>;
          walletAddress = body.walletAddress;
          inputMint = body.inputMint;
          outputMint = body.outputMint;
          amount = body.amount;
          if (body.slippage) slippage = body.slippage;
        } else {
          walletAddress = url.searchParams.get("walletAddress") ?? undefined;
          inputMint = url.searchParams.get("inputMint") ?? undefined;
          outputMint = url.searchParams.get("outputMint") ?? undefined;
          amount = url.searchParams.get("amount") ?? undefined;
          slippage = url.searchParams.get("slippage") ?? "0.5";
        }

        if (!walletAddress || !inputMint || !outputMint || !amount) {
          json(res, 400, {
            error: "Required fields: walletAddress, inputMint, outputMint, amount",
            hint: "Send as GET query params or POST JSON body",
          });
          return;
        }
        json(res, 200, {
          success: true,
          skill: "byreal-swap-preview",
          data: getSwapPreview(walletAddress, inputMint, outputMint, amount, slippage),
          executedAt: Date.now(),
          note: "Swap preview via Byreal RealClaw (dry-run, no transaction generated)",
        });
        return;
      }

      if (url.pathname === "/byreal/perps-signals") {
        const coin = url.searchParams.get("coin") ?? "BTC";
        json(res, 200, {
          success: true,
          skill: "byreal-perps-signals",
          data: getPerpsSignals(coin),
          executedAt: Date.now(),
          note: `Perps signals for ${coin.toUpperCase()} via Byreal Hyperliquid integration`,
        });
        return;
      }

      json(res, 404, { error: "Unknown Byreal skill endpoint" });
    } catch (err) {
      json(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
  });

  server.listen(BYREAL_SKILL_PORT, () => {
    console.log(`byreal skills listening on http://localhost:${BYREAL_SKILL_PORT}`);
    console.log(`realclaw bin: ${REALCLAW_BIN}`);
    console.log(`perps bin: ${PERPS_BIN}`);
    console.log("endpoints require LedgerForge access tokens");
  });
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function requiredAddress(name: string): Address {
  return getAddress(requiredEnv(name));
}

function getWalletClient() {
  const account = privateKeyToAccount(requiredEnv("OPERATOR_PRIVATE_KEY") as Hex);
  return createWalletClient({ account, chain: mantleChain, transport: http(MANTLE_RPC) });
}

function endpointFor(skill: ByrealSkillDef): string {
  return new URL(skill.endpointPath, LOCAL_SKILL_BASE_URL).toString();
}

function txLink(txHash: Hex): string {
  return `${MANTLE_EXPLORER.replace(/\/$/, "")}/tx/${txHash}`;
}

export async function registerByrealSkills(): Promise<RegisteredByrealSkill[]> {
  const skillRegistryAddress = requiredAddress("SKILL_REGISTRY_ADDRESS");
  const bazaarListingsAddress = requiredAddress("BAZAAR_LISTINGS_ADDRESS");
  const walletClient = getWalletClient();
  const registered: RegisteredByrealSkill[] = [];

  for (const [index, skill] of BYREAL_SKILLS.entries()) {
    const endpoint = endpointFor(skill);

    const registrationTxHash = await walletClient.writeContract({
      address: skillRegistryAddress,
      abi: SKILL_REGISTRY_ABI,
      functionName: "registerSkill",
      args: [
        skill.name,
        skill.version,
        endpoint,
        skill.priceUsdcUnits,
        skill.requiresEscrow,
        skill.metadataURI,
      ],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash: registrationTxHash });
    const log = receipt.logs.find(
      (l) => l.address.toLowerCase() === skillRegistryAddress.toLowerCase(),
    );
    if (!log) throw new Error(`SkillRegistered event not found for ${skill.name}`);

    const decoded = decodeEventLog({ abi: SKILL_REGISTRY_ABI, data: log.data, topics: log.topics });
    const { skillId, erc8004AgentId } = decoded.args as {
      skillId: bigint;
      erc8004AgentId: bigint;
    };

    const listingTxHash = await walletClient.writeContract({
      address: bazaarListingsAddress,
      abi: BAZAAR_LISTINGS_ABI,
      functionName: "list",
      args: [skillId, skill.tier],
    });
    await publicClient.waitForTransactionReceipt({ hash: listingTxHash });

    registered.push({
      ...skill,
      skillId,
      erc8004AgentId,
      registrationTxHash,
      listingTxHash,
      endpoint,
    });

    console.log(
      `registered skill ${index + 1}: ${skill.name} id=${skillId} tx=${registrationTxHash}`,
    );
    console.log(`  registration: ${txLink(registrationTxHash)}`);
    console.log(`  listing:      ${txLink(listingTxHash)}`);
    console.log(`  ERC-8004 agentId: ${erc8004AgentId}`);
  }

  return registered;
}

if (process.argv.includes("--serve")) {
  startByrealSkillServer();
} else {
  registerByrealSkills().catch((err) => {
    console.error(
      `registration failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exitCode = 1;
  });
}
