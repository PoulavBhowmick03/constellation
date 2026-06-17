import "dotenv/config";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  formatGwei,
  getAddress,
  http,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { verifySettlementAccess } from "./skill-auth.js";

const MANTLE_EXPLORER = process.env.MANTLE_EXPLORER ?? "https://mantlescan.xyz";
const MANTLE_RPC = process.env.MANTLE_RPC ?? "https://rpc.mantle.xyz";
const MANTLE_SKILL_PORT = Number(process.env.MANTLE_SKILL_PORT ?? "3005");
const LOCAL_SKILL_BASE_URL =
  process.env.MANTLE_SKILL_BASE_URL ?? `http://localhost:${MANTLE_SKILL_PORT}`;

const USDE_ADDRESS = (
  process.env.USDE_ADDRESS ?? "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34"
) as Address;
const USDC_ADDRESS = (
  process.env.USDC_ADDRESS ?? "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9"
) as Address;

const AAVE_V3_POOL_ADDRESS = "0xCFa5aE7c2CE8Fadc6426C1ff872cA45378Fb7cF3" as const;

const KNOWN_TOKENS: Record<string, Address> = {
  USDe: USDE_ADDRESS,
  USDC: USDC_ADDRESS,
};

interface MantleSkillDef {
  name: string;
  version: string;
  description: string;
  endpointPath: string;
  priceUsdcUnits: bigint;
  requiresEscrow: boolean;
  metadataURI: string;
  tier: number;
}

interface RegisteredMantleSkill extends MantleSkillDef {
  skillId: bigint;
  erc8004AgentId: bigint;
  registrationTxHash: Hex;
  listingTxHash: Hex;
  endpoint: string;
}

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

const AAVE_V3_POOL_ABI = [
  {
    type: "function",
    name: "getReserveData",
    stateMutability: "view",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "configuration", type: "uint256" },
          { name: "liquidityIndex", type: "uint128" },
          { name: "currentLiquidityRate", type: "uint128" },
          { name: "variableBorrowIndex", type: "uint128" },
          { name: "currentVariableBorrowRate", type: "uint128" },
          { name: "currentStableBorrowRate", type: "uint128" },
          { name: "lastUpdateTimestamp", type: "uint40" },
          { name: "aTokenAddress", type: "address" },
          { name: "stableDebtTokenAddress", type: "address" },
          { name: "variableDebtTokenAddress", type: "address" },
          { name: "interestRateStrategyAddress", type: "address" },
          { name: "id", type: "uint8" },
        ],
      },
    ],
  },
] as const;

const MANTLE_SKILLS: MantleSkillDef[] = [
  {
    name: "hackathon-scout",
    version: "1.0.0",
    description:
      "Searches GitHub for hackathon project submissions by keyword or ecosystem tag. Returns project names, descriptions, tech stack, stars, and repo links. Discover Mantle, ETHGlobal, and Web3 hackathon builds.",
    endpointPath: "/hackathon-scout",
    priceUsdcUnits: 100_000n,
    requiresEscrow: false,
    metadataURI: "ipfs://ledgerforge/mantle/hackathon-scout/v1",
    tier: 0,
  },
  {
    name: "mantle-tvl-monitor",
    version: "1.0.0",
    description:
      "Returns current TVL for the Mantle chain and the top 10 protocols by TVL. Data sourced from DeFiLlama; no API key required.",
    endpointPath: "/mantle-tvl-monitor",
    priceUsdcUnits: 200_000n,
    requiresEscrow: false,
    metadataURI: "ipfs://ledgerforge/mantle/tvl-monitor/v1",
    tier: 0,
  },
  {
    name: "aave-v3-rates",
    version: "1.0.0",
    description:
      "Returns live Aave V3 supply and variable borrow APR for USDe and USDC on Mantle, read directly from the on-chain Pool contract.",
    endpointPath: "/aave-v3-rates",
    priceUsdcUnits: 300_000n,
    requiresEscrow: false,
    metadataURI: "ipfs://ledgerforge/mantle/aave-v3-rates/v1",
    tier: 0,
  },
  {
    name: "mantle-gas-oracle",
    version: "1.0.0",
    description:
      "Returns current gas price and base fee on Mantle with estimated costs (in gwei) for common operation types. Read from the live RPC.",
    endpointPath: "/mantle-gas-oracle",
    priceUsdcUnits: 50_000n,
    requiresEscrow: false,
    metadataURI: "ipfs://ledgerforge/mantle/gas-oracle/v1",
    tier: 0,
  },
  {
    name: "token-price-feed",
    version: "1.0.0",
    description:
      "Returns USD prices for tokens on Mantle. Accepts known symbols (USDe, USDC) or any 0x contract address. Sourced from DeFiLlama Coins API.",
    endpointPath: "/token-price-feed",
    priceUsdcUnits: 150_000n,
    requiresEscrow: false,
    metadataURI: "ipfs://ledgerforge/mantle/token-price-feed/v1",
    tier: 0,
  },
  {
    name: "defi-protocol-stats",
    version: "1.0.0",
    description:
      "Returns TVL, 24h/7d change, and chain breakdown for any DeFi protocol by its DeFiLlama slug (e.g. merchant-moe, agni-finance, init-capital).",
    endpointPath: "/defi-protocol-stats",
    priceUsdcUnits: 200_000n,
    requiresEscrow: false,
    metadataURI: "ipfs://ledgerforge/mantle/defi-protocol-stats/v1",
    tier: 0,
  },
];

const publicClient = createPublicClient({
  chain: mantleChain,
  transport: http(MANTLE_RPC),
});

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

function endpointFor(skill: MantleSkillDef): string {
  return new URL(skill.endpointPath, LOCAL_SKILL_BASE_URL).toString();
}

function txLink(txHash: Hex): string {
  return `${MANTLE_EXPLORER.replace(/\/$/, "")}/tx/${txHash}`;
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

async function getMantleTvl() {
  const [chainsRes, protocolsRes] = await Promise.all([
    fetch("https://api.llama.fi/v2/chains"),
    fetch("https://api.llama.fi/protocols"),
  ]);
  if (!chainsRes.ok) throw new Error(`DeFiLlama chains API ${chainsRes.status}`);
  if (!protocolsRes.ok) throw new Error(`DeFiLlama protocols API ${protocolsRes.status}`);

  const chains = (await chainsRes.json()) as Array<{
    name: string;
    tvl: number;
    change_1d?: number;
    change_7d?: number;
  }>;
  const protocols = (await protocolsRes.json()) as Array<{
    name: string;
    slug: string;
    tvl: number;
    chains: string[];
    category?: string;
    change_1d?: number;
    change_7d?: number;
  }>;

  const mantle = chains.find((c) => c.name.toLowerCase() === "mantle");
  const topProtocols = protocols
    .filter((p) => p.chains.some((c) => c.toLowerCase() === "mantle"))
    .sort((a, b) => (b.tvl ?? 0) - (a.tvl ?? 0))
    .slice(0, 10)
    .map((p) => ({
      name: p.name,
      slug: p.slug,
      tvl: p.tvl,
      change1d: p.change_1d ?? null,
      change7d: p.change_7d ?? null,
      category: p.category ?? null,
    }));

  return {
    chain: "Mantle",
    tvl: mantle?.tvl ?? null,
    totalTvl: mantle?.tvl ?? null,
    change1d: mantle?.change_1d ?? null,
    change7d: mantle?.change_7d ?? null,
    topProtocols,
    source: "DeFiLlama",
    timestamp: new Date().toISOString(),
  };
}

const RAY = 10n ** 27n;

function rayToApr(ray: bigint): number {
  return Number((ray * 10000n) / RAY) / 100;
}

async function getAaveV3Rates(asset: "USDe" | "USDC" | "all") {
  const symbols = asset === "all" ? (["USDe", "USDC"] as const) : ([asset] as const);

  const results = await Promise.all(
    symbols.map(async (symbol) => {
      const address = KNOWN_TOKENS[symbol];
      const data = await publicClient.readContract({
        address: AAVE_V3_POOL_ADDRESS,
        abi: AAVE_V3_POOL_ABI,
        functionName: "getReserveData",
        args: [address],
      });
      return {
        symbol,
        address,
        supplyApr: rayToApr(data.currentLiquidityRate),
        supplyAPR: rayToApr(data.currentLiquidityRate),
        variableBorrowApr: rayToApr(data.currentVariableBorrowRate),
        borrowAPR: rayToApr(data.currentVariableBorrowRate),
        lastUpdated: new Date(Number(data.lastUpdateTimestamp) * 1000).toISOString(),
      };
    }),
  );

  return {
    protocol: "Aave V3",
    network: "Mantle",
    poolAddress: AAVE_V3_POOL_ADDRESS,
    rates: results,
    source: "on-chain",
    timestamp: new Date().toISOString(),
  };
}

async function getMantleGasOracle() {
  const [gasPrice, block] = await Promise.all([
    publicClient.getGasPrice(),
    publicClient.getBlock({ blockTag: "latest" }),
  ]);

  const baseFee = block.baseFeePerGas ?? 0n;

  return {
    network: "Mantle",
    gasPrice: { wei: gasPrice.toString(), gwei: formatGwei(gasPrice) },
    baseFee: { wei: baseFee.toString(), gwei: formatGwei(baseFee) },
    blockNumber: block.number?.toString() ?? null,
    estimatedGasUnits: {
      transfer: "21000",
      erc20Transfer: "65000",
      swapDex: "150000",
      contractDeploy: "500000",
    },
    source: "Mantle RPC",
    timestamp: new Date().toISOString(),
  };
}

async function getTokenPrices(tokens: string[]) {
  const coinIds = tokens.map((t) => {
    const addr = KNOWN_TOKENS[t] ?? (t.startsWith("0x") ? t : null);
    if (!addr) {
      throw new Error(`Unknown token "${t}". Use a symbol (USDe, USDC) or a 0x address.`);
    }
    return `mantle:${addr}`;
  });

  const res = await fetch(`https://coins.llama.fi/prices/current/${coinIds.join(",")}`);
  if (!res.ok) throw new Error(`DeFiLlama coins API ${res.status}`);

  const data = (await res.json()) as {
    coins: Record<
      string,
      { decimals?: number; symbol?: string; price: number; timestamp: number; confidence?: number }
    >;
  };

  const prices = Object.entries(data.coins).map(([coinId, info]) => ({
    symbol: info.symbol ?? coinId.replace("mantle:", ""),
    address: coinId.replace("mantle:", ""),
    priceUsd: info.price,
    confidence: info.confidence ?? null,
    updatedAt: new Date(info.timestamp * 1000).toISOString(),
  }));

  return {
    network: "Mantle",
    prices,
    source: "DeFiLlama",
    timestamp: new Date().toISOString(),
  };
}

async function getDefiProtocolStats(protocol: string) {
  const slug = protocol.toLowerCase().replace(/\s+/g, "-");
  const res = await fetch(`https://api.llama.fi/protocol/${encodeURIComponent(slug)}`);
  if (res.status === 404) throw new Error(`Protocol "${slug}" not found on DeFiLlama`);
  if (!res.ok) throw new Error(`DeFiLlama protocol API ${res.status}`);

  const data = (await res.json()) as {
    name: string;
    slug: string;
    tvl: number;
    category?: string;
    description?: string;
    change_1d?: number;
    change_7d?: number;
    currentChainTvls?: Record<string, number>;
  };

  return {
    name: data.name,
    slug: data.slug,
    category: data.category ?? null,
    description: data.description ?? null,
    globalTvl: data.tvl,
    mantleTvl: data.currentChainTvls?.Mantle ?? null,
    change1d: data.change_1d ?? null,
    change7d: data.change_7d ?? null,
    source: "DeFiLlama",
    timestamp: new Date().toISOString(),
  };
}

const HACKATHON_QUERY_RE = /^[\w\s\-.,:+#@]{1,80}$/;

async function getHackathonProjects(query: string, limitStr: string): Promise<unknown> {
  if (!HACKATHON_QUERY_RE.test(query)) throw new Error(`Invalid query: "${query}"`);
  const limit = Math.min(25, Math.max(1, parseInt(limitStr, 10) || 10));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const q = encodeURIComponent(`${query} hackathon`);
    const res = await fetch(
      `https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=${limit}`,
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "LedgerForge-HackathonScout/1.0",
        },
        signal: controller.signal,
      },
    );

    if (res.status === 403) throw new Error("GitHub rate limit hit (10 req/min unauthenticated). Wait 60s and retry.");
    if (res.status === 422) throw new Error("Invalid search query. Use simpler keywords.");
    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);

    type GHRepo = {
      name: string; full_name: string; description: string | null;
      html_url: string; stargazers_count: number; language: string | null;
      topics: string[]; created_at: string; owner: { login: string };
    };

    const data = (await res.json()) as { total_count: number; items: GHRepo[] };

    return {
      skill: "hackathon-scout",
      query,
      totalFound: data.total_count,
      returned: data.items.length,
      projects: data.items.map((r) => ({
        name: r.name,
        repo: r.full_name,
        description: r.description ?? "(no description)",
        url: r.html_url,
        stars: r.stargazers_count,
        language: r.language,
        topics: r.topics,
        author: r.owner.login,
        createdAt: r.created_at.slice(0, 10),
      })),
      source: "GitHub Search API",
      timestamp: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function startMantleSkillServer(): void {
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
        `http://${req.headers.host ?? `localhost:${MANTLE_SKILL_PORT}`}`,
      );

      if (url.pathname === "/health") {
        json(res, 200, {
          status: "ok",
          service: "mantle-ledgerforge-skills",
          skills: [
            "hackathon-scout",
            "mantle-tvl-monitor",
            "aave-v3-rates",
            "mantle-gas-oracle",
            "token-price-feed",
            "defi-protocol-stats",
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

      if (url.pathname === "/mantle-tvl-monitor") {
        json(res, 200, await getMantleTvl());
        return;
      }

      if (url.pathname === "/aave-v3-rates") {
        const p = url.searchParams.get("asset") ?? "all";
        const asset = p === "USDe" || p === "USDC" ? p : "all";
        json(res, 200, await getAaveV3Rates(asset));
        return;
      }

      if (url.pathname === "/mantle-gas-oracle") {
        json(res, 200, await getMantleGasOracle());
        return;
      }

      if (url.pathname === "/token-price-feed") {
        const tokensParam = url.searchParams.get("tokens") ?? "USDe,USDC";
        const tokens = tokensParam
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
        if (tokens.length === 0) {
          json(res, 400, { error: "tokens parameter is required (e.g. ?tokens=USDe,USDC)" });
          return;
        }
        json(res, 200, await getTokenPrices(tokens));
        return;
      }

      if (url.pathname === "/defi-protocol-stats") {
        const protocol = url.searchParams.get("protocol");
        if (!protocol) {
          json(res, 400, {
            error: "protocol parameter is required (e.g. ?protocol=merchant-moe)",
          });
          return;
        }
        json(res, 200, await getDefiProtocolStats(protocol));
        return;
      }

      if (url.pathname === "/hackathon-scout") {
        const query = url.searchParams.get("query") ?? "mantle ethglobal";
        const limit = url.searchParams.get("limit") ?? "10";
        json(res, 200, await getHackathonProjects(query, limit));
        return;
      }

      json(res, 404, { error: "Unknown Mantle skill endpoint" });
    } catch (err) {
      json(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
  });

  server.listen(MANTLE_SKILL_PORT, () => {
    console.log(`mantle skills listening on http://localhost:${MANTLE_SKILL_PORT}`);
    console.log("endpoints require LedgerForge access tokens");
  });
}

export async function registerMantleSkills(): Promise<RegisteredMantleSkill[]> {
  const skillRegistryAddress = requiredAddress("SKILL_REGISTRY_ADDRESS");
  const bazaarListingsAddress = requiredAddress("BAZAAR_LISTINGS_ADDRESS");
  const walletClient = getWalletClient();
  const registered: RegisteredMantleSkill[] = [];

  for (const [index, skill] of MANTLE_SKILLS.entries()) {
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
  startMantleSkillServer();
} else {
  registerMantleSkills().catch((err) => {
    console.error(`registration failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
}
