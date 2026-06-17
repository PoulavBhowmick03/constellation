#!/usr/bin/env node
/**
 * LedgerForge × Elfa AI Skills
 * Three Elfa intelligence skills registered as x402-monetized
 * LedgerForge Bazaar listings on Mantle mainnet.
 *
 * Skills:
 *   1. elfa-trending-tokens     — trending tokens by social volume
 *   2. elfa-smart-mentions      — smart wallet mentions for keywords
 *   3. elfa-trending-narratives — emerging narrative clusters
 *
 * Implementation note: the official @elfa-ai/sdk (v2.3.4) is installed, but it
 * only ships typed methods for some of the endpoints we wrap and has no
 * trending-narratives method. To keep one uniform call mechanism across all
 * three skills — mirroring how byreal-skills.ts uses execSync uniformly for
 * every skill — we call the Elfa v2 REST API directly with fetch.
 *
 * Live-API endpoint mapping (verified against https://api.elfa.ai on 2026-06-07):
 *   elfa-trending-tokens     -> GET /v2/aggregations/trending-tokens
 *   elfa-smart-mentions      -> GET /v2/data/keyword-mentions       (the
 *       keyword-accepting endpoint; /v2/data/top-mentions requires a single
 *       `ticker`, not comma-separated keywords)
 *   elfa-trending-narratives -> GET /v2/aggregations/trending-cas/twitter
 *       (Elfa exposes no trending-narratives route; trending contract
 *       addresses surfacing on X/Twitter is the live analog)
 *
 * Usage:
 *   Register + list on Mantle: node ... src/elfa-skills.ts
 *   Run skill server:          node ... src/elfa-skills.ts --serve
 */

import "dotenv/config";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
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

const MANTLE_EXPLORER = process.env.MANTLE_EXPLORER ?? "https://mantlescan.xyz";
const MANTLE_RPC = process.env.MANTLE_RPC ?? "https://rpc.mantle.xyz";
const ELFA_SKILL_PORT = Number(process.env.ELFA_SKILL_PORT ?? "3007");
const ELFA_SKILL_BASE =
  process.env.ELFA_SKILL_PUBLIC_URL ?? `http://localhost:${ELFA_SKILL_PORT}`;
const ELFA_API_BASE = process.env.ELFA_API_BASE ?? "https://api.elfa.ai";

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

interface ElfaSkillDef {
  name: string;
  version: string;
  endpoint: string;
  pricePerCallBps: bigint;
  requiresEscrow: boolean;
  metadataURI: string;
  displayDescription: string;
}

interface RegisteredElfaSkill extends ElfaSkillDef {
  skillId: bigint;
  erc8004AgentId: bigint;
  registrationTxHash: Hex;
  listingTxHash: Hex;
}

const ELFA_SKILLS: ElfaSkillDef[] = [
  {
    name: "elfa-trending-tokens",
    version: "1.0.0",
    endpoint: `${ELFA_SKILL_BASE}/elfa/trending-tokens`,
    pricePerCallBps: 0n,
    requiresEscrow: false,
    metadataURI: "ipfs://ledgerforge/elfa/trending-tokens/v1",
    displayDescription:
      "Real-time trending tokens by social mention volume via Elfa AI. " +
      "Returns tokens ranked by mindshare score across X/Twitter. " +
      "Supports 1h, 4h, 24h time windows.",
  },
  {
    name: "elfa-smart-mentions",
    version: "1.0.0",
    endpoint: `${ELFA_SKILL_BASE}/elfa/smart-mentions`,
    pricePerCallBps: 0n,
    requiresEscrow: false,
    metadataURI: "ipfs://ledgerforge/elfa/smart-mentions/v1",
    displayDescription:
      "Smart wallet mention search via Elfa AI. " +
      "Filters mentions to high-signal accounts only. " +
      "Pass comma-separated keywords to query.",
  },
  {
    name: "elfa-trending-narratives",
    version: "1.0.0",
    endpoint: `${ELFA_SKILL_BASE}/elfa/trending-narratives`,
    pricePerCallBps: 0n,
    requiresEscrow: false,
    metadataURI: "ipfs://ledgerforge/elfa/trending-narratives/v1",
    displayDescription:
      "Emerging narrative clusters from X/Twitter via Elfa AI. " +
      "Returns trending contract addresses and the tokens driving them across X. " +
      "Ideal for AI agents making narrative-aware DeFi decisions.",
  },
];

const publicClient = createPublicClient({
  chain: mantleChain,
  transport: http(MANTLE_RPC),
});

// ── Validation ─────────────────────────────────────────────────────────────
const TIME_WINDOW_RE = /^(1h|4h|24h)$/;
const KEYWORDS_RE = /^[a-zA-Z0-9,\s\-.]+$/;

function validated(value: string, pattern: RegExp, name: string): string {
  if (!pattern.test(value)) throw new Error(`Invalid ${name}: "${value}"`);
  return value;
}

function validatedInt(value: string, min: number, max: number, name: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`Invalid ${name}: "${value}" (must be an integer ${min}-${max})`);
  }
  return n;
}

function validatedFloat(value: string, min: number, max: number, name: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new Error(`Invalid ${name}: "${value}" (must be a number ${min}-${max})`);
  }
  return n;
}

// ── Elfa API access ──────────────────────────────────────────────────────────
function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function requiredAddress(name: string): Address {
  return getAddress(requiredEnv(name));
}

async function runWithTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs = 15000,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function callElfa(
  path: string,
  params: Record<string, string | number>,
  timeoutMs = 15000,
): Promise<unknown> {
  const apiKey = requiredEnv("ELFA_API_KEY");
  const url = new URL(path, ELFA_API_BASE);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  return runWithTimeout(async (signal) => {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { "x-elfa-api-key": apiKey, accept: "application/json" },
        signal,
      });
    } catch (err) {
      const message =
        err instanceof Error && err.name === "AbortError"
          ? `Elfa API request timed out after ${timeoutMs}ms`
          : err instanceof Error
            ? err.message
            : String(err);
      throw new Error(`Upstream Elfa API unavailable: ${message}`);
    }
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Upstream Elfa API error ${response.status}: ${text.slice(0, 300)}`);
    }
    return response.json();
  }, timeoutMs);
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────
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

function statusForError(message: string): number {
  const lower = message.toLowerCase();
  if (lower.includes("invalid") || lower.includes("required")) return 400;
  if (lower.includes("upstream elfa api")) return 502;
  return 500;
}

export function startElfaSkillServer(): void {
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
        `http://${req.headers.host ?? `localhost:${ELFA_SKILL_PORT}`}`,
      );

      if (url.pathname === "/health") {
        json(res, 200, {
          status: "ok",
          service: "elfa-ledgerforge-skills",
          credits: "20000 bonus credits (expires 2026-07-01)",
          skills: [
            "elfa-trending-tokens",
            "elfa-smart-mentions",
            "elfa-trending-narratives",
          ],
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

      if (url.pathname === "/elfa/trending-tokens") {
        const timeWindow = validated(
          url.searchParams.get("timeWindow") ?? "4h",
          TIME_WINDOW_RE,
          "timeWindow",
        );
        const pageSize = validatedInt(
          url.searchParams.get("pageSize") ?? "10",
          1,
          50,
          "pageSize",
        );
        const data = await callElfa("/v2/aggregations/trending-tokens", {
          timeWindow,
          pageSize,
        });
        json(res, 200, {
          success: true,
          skill: "elfa-trending-tokens",
          data,
          executedAt: Date.now(),
          note: "Trending tokens by social mention volume via Elfa AI",
        });
        return;
      }

      if (url.pathname === "/elfa/smart-mentions") {
        const rawKeywords = url.searchParams.get("keywords");
        if (!rawKeywords) {
          json(res, 400, {
            error: "keywords query param required",
            hint: "Pass comma-separated symbols or terms, e.g. keywords=USDe,mETH,Mantle",
          });
          return;
        }
        if (rawKeywords.length > 200) {
          throw new Error("Invalid keywords: must be 200 characters or fewer");
        }
        const keywords = validated(rawKeywords, KEYWORDS_RE, "keywords");
        const limit = validatedInt(url.searchParams.get("limit") ?? "10", 1, 50, "limit");
        const minEngagement = validatedFloat(
          url.searchParams.get("minEngagement") ?? "0.3",
          0.0,
          1.0,
          "minEngagement",
        );
        const timeWindow = validated(
          url.searchParams.get("timeWindow") ?? "24h",
          TIME_WINDOW_RE,
          "timeWindow",
        );
        // /v2/data/keyword-mentions is the keyword-accepting endpoint; minEngagement
        // is validated for API compatibility but tolerated/ignored upstream.
        const data = await callElfa("/v2/data/keyword-mentions", {
          keywords,
          limit,
          timeWindow,
          minEngagement,
        });
        json(res, 200, {
          success: true,
          skill: "elfa-smart-mentions",
          data,
          executedAt: Date.now(),
          note: "Smart wallet mentions via Elfa AI — high-signal accounts only",
        });
        return;
      }

      if (url.pathname === "/elfa/trending-narratives") {
        const timeWindow = validated(
          url.searchParams.get("timeWindow") ?? "4h",
          TIME_WINDOW_RE,
          "timeWindow",
        );
        const pageSize = validatedInt(
          url.searchParams.get("pageSize") ?? "10",
          1,
          50,
          "pageSize",
        );
        const data = await callElfa("/v2/aggregations/trending-cas/twitter", {
          timeWindow,
          pageSize,
        });
        json(res, 200, {
          success: true,
          skill: "elfa-trending-narratives",
          data,
          executedAt: Date.now(),
          note: "Emerging narrative clusters from X/Twitter via Elfa AI",
        });
        return;
      }

      json(res, 404, { error: "Unknown Elfa skill endpoint" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      json(res, statusForError(message), { error: message });
    }
  });

  server.listen(ELFA_SKILL_PORT, () => {
    console.log(`elfa skills listening on http://localhost:${ELFA_SKILL_PORT}`);
    console.log(`elfa api base: ${ELFA_API_BASE}`);
    console.log("endpoints require LedgerForge access tokens");
  });
}

// ── Registration ─────────────────────────────────────────────────────────────
function getWalletClient() {
  const account = privateKeyToAccount(requiredEnv("OPERATOR_PRIVATE_KEY") as Hex);
  return createWalletClient({ account, chain: mantleChain, transport: http(MANTLE_RPC) });
}

function txLink(txHash: Hex): string {
  return `${MANTLE_EXPLORER.replace(/\/$/, "")}/tx/${txHash}`;
}

export async function registerElfaSkills(): Promise<RegisteredElfaSkill[]> {
  const skillRegistryAddress = requiredAddress("SKILL_REGISTRY_ADDRESS");
  const bazaarListingsAddress = requiredAddress("BAZAAR_LISTINGS_ADDRESS");
  const walletClient = getWalletClient();
  const registered: RegisteredElfaSkill[] = [];

  for (const [index, skill] of ELFA_SKILLS.entries()) {
    const registrationTxHash = await walletClient.writeContract({
      address: skillRegistryAddress,
      abi: SKILL_REGISTRY_ABI,
      functionName: "registerSkill",
      args: [
        skill.name,
        skill.version,
        skill.endpoint,
        skill.pricePerCallBps,
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
      args: [skillId, 0],
    });
    await publicClient.waitForTransactionReceipt({ hash: listingTxHash });

    registered.push({
      ...skill,
      skillId,
      erc8004AgentId,
      registrationTxHash,
      listingTxHash,
    });

    console.log(
      `Registered skill ${index + 1}: ${skill.name} | skillId: ${skillId} | tx: ${registrationTxHash}`,
    );
    console.log(`  registration: ${txLink(registrationTxHash)}`);
    console.log(`  listing:      ${txLink(listingTxHash)}`);
    console.log(`  ERC-8004 agentId: ${erc8004AgentId}`);
  }

  return registered;
}

if (process.argv.includes("--serve")) {
  startElfaSkillServer();
} else {
  registerElfaSkills().catch((err) => {
    console.error(`registration failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
}
