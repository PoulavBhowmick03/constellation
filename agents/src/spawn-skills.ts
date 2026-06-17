import "dotenv/config";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  getAddress,
  http,
  parseAbiItem,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { verifySettlementAccess } from "./skill-auth.js";
import type { RegisteredSpawnSkill, SpawnSkillDefinition } from "./types.js";

const MANTLE_EXPLORER = process.env.MANTLE_EXPLORER ?? "https://mantlescan.xyz";
const MANTLE_RPC = process.env.MANTLE_RPC ?? "https://rpc.mantle.xyz";
const SPAWN_AGENT_PORT = Number(process.env.SPAWN_AGENT_PORT ?? "3003");
const LOCAL_SKILL_BASE_URL =
  process.env.SPAWN_SKILL_BASE_URL ?? `http://localhost:${SPAWN_AGENT_PORT}`;

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

const DECISION_EVENT_ABIS = [
  parseAbiItem("event AgentDecisionExecuted(bytes32 indexed decisionHash, uint8 actionType, uint256 amountBps)"),
  parseAbiItem("event AgentDecisionExecuted(bytes32 indexed decisionHash, uint8 actionType, uint16 amountBps)"),
  parseAbiItem("event AgentDecisionExecuted(bytes32 indexed decisionHash, uint256 actionType, uint256 amountBps)"),
];

const SPAWN_SKILLS: readonly SpawnSkillDefinition[] = [
  {
    name: "spawn-failure-analyst",
    version: "1.0.0",
    description:
      "Given a Spawn Protocol lineage key and generation number, returns the structured failure post-mortem - why the agent was terminated, its position at termination, and the specific constraints passed to its successor.",
    endpointPath: "/spawn-failure-analyst",
    priceUsdcUnits: 500_000n,
    requiresEscrow: false,
    metadataURI: "ipfs://ledgerforge/spawn/failure-analyst/v1",
  },
  {
    name: "lineage-context-builder",
    version: "1.0.0",
    description:
      "Given a lineage key, fetches all ancestor post-mortems from IPFS and returns them formatted as a Venice AI system prompt context block.",
    endpointPath: "/lineage-context-builder",
    priceUsdcUnits: 1_000_000n,
    requiresEscrow: false,
    metadataURI: "ipfs://ledgerforge/spawn/lineage-context-builder/v1",
  },
  {
    name: "decision-hash-verifier",
    version: "1.0.0",
    description:
      "Given a ChildAgent contract address and decision hash, verifies on-chain that the hash matches a recorded AgentDecisionExecuted event.",
    endpointPath: "/decision-hash-verifier",
    priceUsdcUnits: 250_000n,
    requiresEscrow: false,
    metadataURI: "ipfs://ledgerforge/spawn/decision-hash-verifier/v1",
  },
] as const;

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
  return createWalletClient({
    account,
    chain: mantleChain,
    transport: http(MANTLE_RPC),
  });
}

function endpointFor(skill: SpawnSkillDefinition): string {
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
  res.end(JSON.stringify(body, (_, value) => (typeof value === "bigint" ? value.toString() : value)));
}

async function readSpawnLineage(lineageKey: string, generation?: string): Promise<unknown> {
  const spawnApiUrl = requiredEnv("SPAWN_API_URL");
  const url = new URL(`/api/lineage/${encodeURIComponent(lineageKey)}`, spawnApiUrl);
  if (generation) url.searchParams.set("generation", generation);

  let response: Response;
  try {
    response = await fetch(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Upstream Spawn API unavailable: ${message}`);
  }
  if (!response.ok) {
    throw new Error(`Upstream Spawn API unavailable: ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

function demoSpawnFailureAnalysis(lineageKey: string) {
  return {
    lineageKey,
    postMortems: [
      {
        generation: 1,
        strategy: "aggressive-rebalance",
        terminationReason: "slippage exceeded 3%",
        lessons: ["Use tighter slippage bounds on low-liquidity pools"],
      },
      {
        generation: 2,
        strategy: "passive-hold",
        terminationReason: "opportunity cost too high",
        lessons: ["Dynamic rebalancing outperforms passive hold in volatile conditions"],
      },
    ],
    source: "demo",
    note: "Spawn Protocol upstream unavailable - returning demo lineage data",
  };
}

function demoSpawnLineageContext(lineageKey: string) {
  return {
    lineageKey,
    context: [
      "<spawn_lineage_context>",
      `lineage_key: ${lineageKey}`,
      "instruction: Inherit useful failure constraints from this Spawn Protocol lineage.",
      "ancestor_post_mortems:",
      JSON.stringify([{ generation: 1, lessons: ["Avoid unbounded slippage"] }]),
      "</spawn_lineage_context>",
    ].join("\n"),
    source: "demo",
  };
}

function formatVeniceContext(lineageKey: string, lineage: unknown): string {
  const records = Array.isArray(lineage)
    ? lineage
    : typeof lineage === "object" && lineage !== null && "postMortems" in lineage
      ? (lineage as { postMortems: unknown }).postMortems
      : typeof lineage === "object" && lineage !== null && "ancestors" in lineage
        ? (lineage as { ancestors: unknown }).ancestors
        : lineage;

  return [
    "<spawn_lineage_context>",
    `lineage_key: ${lineageKey}`,
    "instruction: Inherit useful failure constraints from this Spawn Protocol lineage. Do not repeat terminated strategies.",
    "ancestor_post_mortems:",
    JSON.stringify(records, null, 2),
    "</spawn_lineage_context>",
  ].join("\n");
}

function accessTokenIsValid(req: IncomingMessage) {
  return verifySettlementAccess(req.headers.authorization, publicClient);
}

const DECISION_LOOKBACK_BLOCKS = 200_000n;
const DECISION_CHUNK_SIZE = 5_000n;

async function verifyDecisionHash(contractAddress: Address, decisionHash: Hex) {
  const latest = await publicClient.getBlockNumber();
  const oldest = latest > DECISION_LOOKBACK_BLOCKS ? latest - DECISION_LOOKBACK_BLOCKS : 0n;

  for (const event of DECISION_EVENT_ABIS) {
    let toBlock = latest;
    while (toBlock >= oldest) {
      const fromBlock = toBlock > DECISION_CHUNK_SIZE ? toBlock - DECISION_CHUNK_SIZE + 1n : 0n;
      const logs = await publicClient.getLogs({
        address: contractAddress,
        event,
        args: { decisionHash },
        fromBlock: fromBlock < oldest ? oldest : fromBlock,
        toBlock,
      });

      if (logs.length > 0) {
        const log = logs[0];
        const decoded = decodeEventLog({
          abi: [event],
          data: log.data,
          topics: log.topics,
        });
        const args = decoded.args as {
          actionType?: number | bigint;
          amountBps?: number | bigint;
        };
        return {
          verified: true,
          actionType: args.actionType?.toString() ?? null,
          amountBps: args.amountBps?.toString() ?? null,
          blockNumber: log.blockNumber?.toString() ?? null,
          txHash: log.transactionHash,
        };
      }

      if (fromBlock <= oldest) break;
      toBlock = fromBlock - 1n;
    }
  }

  return {
    verified: false,
    actionType: null,
    amountBps: null,
    blockNumber: null,
    txHash: null,
    scannedRange: { fromBlock: oldest.toString(), toBlock: latest.toString() },
  };
}

export async function registerSpawnSkills(): Promise<RegisteredSpawnSkill[]> {
  const skillRegistryAddress = requiredAddress("SKILL_REGISTRY_ADDRESS");
  const bazaarListingsAddress = requiredAddress("BAZAAR_LISTINGS_ADDRESS");
  const walletClient = getWalletClient();

  const registered: RegisteredSpawnSkill[] = [];

  for (const [index, skill] of SPAWN_SKILLS.entries()) {
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

    const registrationReceipt = await publicClient.waitForTransactionReceipt({
      hash: registrationTxHash,
    });
    const registrationLog = registrationReceipt.logs.find(
      (log) => log.address.toLowerCase() === skillRegistryAddress.toLowerCase(),
    );
    if (!registrationLog) {
      throw new Error(`SkillRegistered event not found for ${skill.name}`);
    }

    const decoded = decodeEventLog({
      abi: SKILL_REGISTRY_ABI,
      data: registrationLog.data,
      topics: registrationLog.topics,
    });
    const args = decoded.args as {
      skillId: bigint;
      erc8004AgentId: bigint;
    };

    const listingTxHash = await walletClient.writeContract({
      address: bazaarListingsAddress,
      abi: BAZAAR_LISTINGS_ABI,
      functionName: "list",
      args: [args.skillId, 0],
    });
    await publicClient.waitForTransactionReceipt({ hash: listingTxHash });

    registered.push({
      ...skill,
      skillId: args.skillId,
      erc8004AgentId: args.erc8004AgentId,
      registrationTxHash,
      listingTxHash,
      endpoint,
    });

    console.log(
      `registered skill ${index + 1}: ${skill.name} id=${args.skillId} tx=${registrationTxHash}`,
    );
    console.log(`  registration: ${txLink(registrationTxHash)}`);
    console.log(`  listing:      ${txLink(listingTxHash)}`);
    console.log(`  ERC-8004 agentId: ${args.erc8004AgentId}`);
  }

  return registered;
}

export function startSpawnSkillServer(): void {
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

      const url = new URL(req.url, `http://${req.headers.host ?? `localhost:${SPAWN_AGENT_PORT}`}`);
      if (url.pathname === "/health") {
        json(res, 200, { status: "ok", service: "spawn-ledgerforge-skills" });
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

      if (url.pathname === "/spawn-failure-analyst") {
        const lineageKey = url.searchParams.get("lineageKey");
        const generation = url.searchParams.get("generation") ?? undefined;
        if (!lineageKey) {
          json(res, 400, { error: "lineageKey is required" });
          return;
        }

        let postMortem: unknown;
        try {
          postMortem = await readSpawnLineage(lineageKey, generation);
        } catch {
          postMortem = demoSpawnFailureAnalysis(lineageKey);
        }
        json(res, 200, postMortem);
        return;
      }

      if (url.pathname === "/lineage-context-builder") {
        const lineageKey = url.searchParams.get("lineageKey");
        if (!lineageKey) {
          json(res, 400, { error: "lineageKey is required" });
          return;
        }

        let lineage: unknown;
        try {
          lineage = await readSpawnLineage(lineageKey);
        } catch {
          json(res, 200, demoSpawnLineageContext(lineageKey));
          return;
        }
        json(res, 200, {
          lineageKey,
          context: formatVeniceContext(lineageKey, lineage),
        });
        return;
      }

      if (url.pathname === "/decision-hash-verifier") {
        const contractAddress = url.searchParams.get("contractAddress");
        const decisionHash = url.searchParams.get("decisionHash");
        if (!contractAddress || !decisionHash) {
          json(res, 400, { error: "contractAddress and decisionHash are required" });
          return;
        }
        const hexBody = decisionHash.startsWith("0x") ? decisionHash.slice(2) : decisionHash;
        if (hexBody.length !== 64 || !/^[0-9a-fA-F]+$/.test(hexBody)) {
          json(res, 400, {
            error: "decisionHash must be a 32-byte hex string (0x + 64 hex chars)",
          });
          return;
        }
        const normalizedHash = (`0x${hexBody}`) as Hex;

        const result = await verifyDecisionHash(getAddress(contractAddress), normalizedHash);
        json(res, 200, result);
        return;
      }

      json(res, 404, { error: "Unknown Spawn skill endpoint" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isSpawnUpstreamError = message.includes("Upstream Spawn API unavailable");
      json(
        res,
        isSpawnUpstreamError ? 502 : 500,
        isSpawnUpstreamError
          ? { error: "Upstream Spawn API unavailable", fallback: true }
          : { error: message },
      );
    }
  });

  server.listen(SPAWN_AGENT_PORT, () => {
    console.log(`spawn skills listening on http://localhost:${SPAWN_AGENT_PORT}`);
    console.log("endpoints require LedgerForge access tokens");
  });
}

if (process.argv.includes("--serve")) {
  startSpawnSkillServer();
} else {
  registerSpawnSkills().catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`registration failed: ${message}`);
    process.exitCode = 1;
  });
}
