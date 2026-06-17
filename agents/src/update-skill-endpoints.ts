import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  http,
  isAddress,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const MANTLE_RPC = process.env.MANTLE_RPC ?? "https://rpc.mantle.xyz";
const MANTLE_EXPLORER = process.env.MANTLE_EXPLORER ?? "https://mantlescan.xyz";

const mantleChain = {
  id: 5000,
  name: "Mantle",
  nativeCurrency: { name: "MNT", symbol: "MNT", decimals: 18 },
  rpcUrls: {
    default: { http: [MANTLE_RPC] },
    public: { http: [MANTLE_RPC] },
  },
} as const;

const REGISTRY_ABI = [
  {
    type: "function",
    name: "totalSkills",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getSkill",
    stateMutability: "view",
    inputs: [{ name: "skillId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "skillId", type: "uint256" },
          { name: "owner", type: "address" },
          { name: "name", type: "string" },
          { name: "version", type: "string" },
          { name: "endpoint", type: "string" },
          { name: "pricePerCallBps", type: "uint256" },
          { name: "requiresEscrow", type: "bool" },
          { name: "metadataURI", type: "string" },
          { name: "erc8004AgentId", type: "uint256" },
          { name: "registeredAt", type: "uint256" },
          { name: "totalJobs", type: "uint256" },
          { name: "totalScore", type: "uint256" },
          { name: "active", type: "bool" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "updateSkill",
    stateMutability: "nonpayable",
    inputs: [
      { name: "skillId", type: "uint256" },
      { name: "endpoint", type: "string" },
      { name: "pricePerCallBps", type: "uint256" },
      { name: "metadataURI", type: "string" },
    ],
    outputs: [],
  },
] as const;

const BASE_URL_MAP: [string, string][] = [
  ["http://localhost:3003", "https://ledgerforge-spawn.fly.dev"],
  ["http://localhost:3004", "https://ledgerforge-spawn.fly.dev"],
  ["http://localhost:3005", "https://ledgerforge-mantle.fly.dev"],
  ["http://localhost:3006", "https://ledgerforge-byreal.fly.dev"],
];

function remapEndpoint(endpoint: string): string | null {
  for (const [localBase, flyBase] of BASE_URL_MAP) {
    if (endpoint.startsWith(localBase)) {
      return flyBase + endpoint.slice(localBase.length);
    }
  }
  if (endpoint.includes("localhost") || endpoint.includes("127.0.0.1")) {
    return null;
  }
  return endpoint;
}

function txLink(hash: Hex): string {
  return `${MANTLE_EXPLORER}/tx/${hash}`;
}

function requiredEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
}

async function main() {
  const registryAddress = requiredEnv("SKILL_REGISTRY_ADDRESS") as Address;
  const privateKey = requiredEnv("OPERATOR_PRIVATE_KEY") as Hex;
  const operatorAddress = requiredEnv("OPERATOR_ADDRESS") as Address;

  if (!isAddress(registryAddress)) throw new Error("SKILL_REGISTRY_ADDRESS is not a valid address");

  const transport = http(MANTLE_RPC);
  const publicClient = createPublicClient({ chain: mantleChain, transport });
  const account = privateKeyToAccount(privateKey);
  const walletClient = createWalletClient({ account, chain: mantleChain, transport });

  const total = Number(
    await publicClient.readContract({
      address: registryAddress,
      abi: REGISTRY_ABI,
      functionName: "totalSkills",
    }),
  );

  console.log(`\nSkillRegistry: ${registryAddress}`);
  console.log(`Total skills:  ${total}`);
  console.log(`Operator:      ${operatorAddress}\n`);

  interface SkillResult {
    skillId: bigint;
    owner: Address;
    name: string;
    version: string;
    endpoint: string;
    pricePerCallBps: bigint;
    requiresEscrow: boolean;
    metadataURI: string;
    erc8004AgentId: bigint;
    registeredAt: bigint;
    totalJobs: bigint;
    totalScore: bigint;
    active: boolean;
  }

  const toUpdate: { skillId: number; currentEndpoint: string; newEndpoint: string; price: bigint; metadataURI: string }[] = [];
  const skipped: { skillId: number; endpoint: string; reason: string }[] = [];

  for (let i = 1; i <= total; i++) {
    const result = (await publicClient.readContract({
      address: registryAddress,
      abi: REGISTRY_ABI,
      functionName: "getSkill",
      args: [BigInt(i)],
    })) as SkillResult;

    const { owner, endpoint, pricePerCallBps, metadataURI, active } = result;

    if (owner.toLowerCase() !== operatorAddress.toLowerCase()) {
      skipped.push({ skillId: i, endpoint, reason: "not owned by operator" });
      continue;
    }
    if (!active) {
      skipped.push({ skillId: i, endpoint, reason: "inactive" });
      continue;
    }

    const newEndpoint = remapEndpoint(endpoint);

    if (newEndpoint === null) {
      skipped.push({ skillId: i, endpoint, reason: "unknown localhost port; manual fix needed" });
      continue;
    }
    if (newEndpoint === endpoint) {
      console.log(`  skill ${i}: already correct -> ${endpoint}`);
      continue;
    }

    toUpdate.push({ skillId: i, currentEndpoint: endpoint, newEndpoint, price: pricePerCallBps, metadataURI });
  }

  if (toUpdate.length === 0) {
    console.log("\nAll endpoints already point to Fly.io. Nothing to do.");
    if (skipped.length > 0) {
      console.log("\nSkipped:");
      for (const s of skipped) console.log(`  skill ${s.skillId}: ${s.reason} (${s.endpoint})`);
    }
    return;
  }

  console.log(`\n${toUpdate.length} skill(s) to update:\n`);
  for (const s of toUpdate) {
    console.log(`  skill ${s.skillId}:`);
    console.log(`    from: ${s.currentEndpoint}`);
    console.log(`    to:   ${s.newEndpoint}`);
  }

  console.log("\nSending transactions...\n");

  for (const s of toUpdate) {
    const hash = await walletClient.writeContract({
      address: registryAddress,
      abi: REGISTRY_ABI,
      functionName: "updateSkill",
      args: [BigInt(s.skillId), s.newEndpoint, s.price, s.metadataURI],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`  skill ${s.skillId} updated ✓`);
    console.log(`    ${txLink(hash)}`);
    console.log(`    gas used: ${receipt.gasUsed}`);
  }

  console.log(`\nDone. ${toUpdate.length} skill(s) updated on-chain.`);

  if (skipped.length > 0) {
    console.log("\nSkipped (not updated):");
    for (const s of skipped) console.log(`  skill ${s.skillId}: ${s.reason}`);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
