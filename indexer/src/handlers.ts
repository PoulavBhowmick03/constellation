import { isAddress } from "viem";
import { BAZAAR_LISTINGS_ADDRESS, publicClient } from "./config.js";
import type { BazaarTier, SkillRecord } from "./db.js";

const SKILL_REGISTRY_ABI = [
  {
    name: "getSkill",
    type: "function",
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
    stateMutability: "view",
  },
  {
    name: "totalSkills",
    type: "function",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

const BAZAAR_LISTINGS_ABI = [
  {
    name: "listings",
    type: "function",
    inputs: [{ name: "skillId", type: "uint256" }],
    outputs: [
      { name: "skillId", type: "uint256" },
      { name: "owner", type: "address" },
      { name: "tier", type: "uint8" },
      { name: "paidUntil", type: "uint256" },
      { name: "listedAt", type: "uint256" },
      { name: "active", type: "bool" },
    ],
    stateMutability: "view",
  },
] as const;

const TIER_NAMES = ["FREE", "BASIC", "PRO"] as const;

function addressIsConfigured(address: `0x${string}` | undefined): address is `0x${string}` {
  return Boolean(address && isAddress(address));
}

async function fetchTier(skillId: number): Promise<{
  tier: BazaarTier;
  tierPaidUntil: number;
}> {
  if (!addressIsConfigured(BAZAAR_LISTINGS_ADDRESS)) {
    return { tier: "FREE", tierPaidUntil: 0 };
  }

  try {
    const listing = await publicClient.readContract({
      address: BAZAAR_LISTINGS_ADDRESS,
      abi: BAZAAR_LISTINGS_ABI,
      functionName: "listings",
      args: [BigInt(skillId)],
    });
    const [, , tier, paidUntil, listedAt, active] = listing;

    if (listedAt === 0n || !active) {
      return { tier: "FREE", tierPaidUntil: 0 };
    }

    return {
      tier: TIER_NAMES[tier] ?? "FREE",
      tierPaidUntil: Number(paidUntil),
    };
  } catch {
    return { tier: "FREE", tierPaidUntil: 0 };
  }
}

export async function fetchSkillFromChain(
  skillId: number,
  registryAddress: `0x${string}`,
): Promise<SkillRecord | null> {
  if (!addressIsConfigured(registryAddress)) return null;

  try {
    const skill = await publicClient.readContract({
      address: registryAddress,
      abi: SKILL_REGISTRY_ABI,
      functionName: "getSkill",
      args: [BigInt(skillId)],
    });

    const averageScore = skill.totalJobs > 0n ? Number(skill.totalScore / skill.totalJobs) : 0;
    const tier = await fetchTier(skillId);

    return {
      skillId: Number(skill.skillId),
      owner: skill.owner,
      name: skill.name,
      version: skill.version,
      endpoint: skill.endpoint,
      metadataURI: skill.metadataURI,
      erc8004AgentId: Number(skill.erc8004AgentId),
      registeredAt: Number(skill.registeredAt),
      totalJobs: Number(skill.totalJobs),
      averageScore,
      pricePerCallBps: Number(skill.pricePerCallBps),
      tier: tier.tier,
      tierPaidUntil: tier.tierPaidUntil,
      active: skill.active,
      lastUpdated: Date.now(),
    };
  } catch {
    return null;
  }
}

export async function fetchTotalSkills(registryAddress: `0x${string}`): Promise<number> {
  if (!addressIsConfigured(registryAddress)) return 0;

  try {
    const total = await publicClient.readContract({
      address: registryAddress,
      abi: SKILL_REGISTRY_ABI,
      functionName: "totalSkills",
    });
    return Number(total);
  } catch {
    return 0;
  }
}
