'use client'
import { useState, useEffect, useCallback } from 'react'
import type { Skill, Stats, Job, Tier } from '@/lib/types'

const MOCK_SKILLS: Skill[] = [
  {
    id: '9',
    name: 'hackathon-scout',
    version: 'v1.0.0',
    tier: 'BASIC',
    score: 0,
    jobs: 0,
    price: 0.10,
    owner: '0xC0296012Cfbb0e6DF5dA7158B65Dbc46DD9650e0',
    description: 'Searches GitHub for hackathon project submissions by keyword or ecosystem tag. Returns project names, descriptions, tech stack, stars, and repo links. Discover Mantle, ETHGlobal, and Web3 hackathon builds.',
    registered: '2026-05-26',
    isReal: true,
    endpoint: 'http://localhost:3005/hackathon-scout',
    metadataURI: 'ipfs://ledgerforge/mantle/hackathon-scout/v1',
    agentId: '9',
    acceptedToken: 'USDC',
    tags: ['hackathon', 'github', 'discovery', 'web3'],
    reputationHistory: [],
  },
  {
    id: '1',
    name: 'spawn-failure-analyst',
    version: 'v1.0.0',
    tier: 'PRO',
    score: 90,
    jobs: 1,
    price: 0.50,
    owner: '0xC0296012Cfbb0e6DF5dA7158B65Dbc46DD9650e0',
    description: 'Forensic analysis of failed agent spawns. Returns root-cause hypotheses ranked by likelihood, with on-chain lineage proof for each diagnostic.',
    registered: '2026-05-26',
    isReal: true,
    endpoint: 'https://ledgerforge-spawn.fly.dev',
    metadataURI: 'ipfs://QmSpawnFailureAnalyst',
    agentId: '1',
    acceptedToken: 'USDC',
    tags: ['forensics', 'agents', 'diagnostics'],
    reputationHistory: [],
  },
  {
    id: '2',
    name: 'lineage-context-builder',
    version: 'v0.4.1',
    tier: 'BASIC',
    score: 0,
    jobs: 0,
    price: 0.10,
    owner: '0xC0296012Cfbb0e6DF5dA7158B65Dbc46DD9650e0',
    description: 'Reconstructs parent-child execution lineage for any agent run. Returns Merkle-verified context window suitable for downstream reasoning.',
    registered: '2026-05-25',
    isReal: true,
    endpoint: 'https://ledgerforge-lineage.fly.dev',
    metadataURI: 'ipfs://QmLineageContextBuilder',
    agentId: '2',
    acceptedToken: 'USDC',
    tags: ['lineage', 'context', 'merkle'],
    reputationHistory: [],
  },
  {
    id: '3',
    name: 'decision-hash-verifier',
    version: 'v1.0.0',
    tier: 'FREE',
    score: 0,
    jobs: 0,
    price: 0.00,
    owner: '0xC0296012Cfbb0e6DF5dA7158B65Dbc46DD9650e0',
    description: 'Verifies an agent decision against its claimed input commitments. Returns boolean + cryptographic witness, no trust required.',
    registered: '2026-05-25',
    isReal: true,
    endpoint: 'https://ledgerforge-decision.fly.dev',
    metadataURI: 'ipfs://QmDecisionHashVerifier',
    agentId: '3',
    acceptedToken: 'USDC',
    tags: ['verification', 'cryptography', 'decisions'],
    reputationHistory: [],
  },
  {
    id: '4',
    name: 'byreal-pool-analysis',
    version: 'v1.0.0',
    tier: 'PRO',
    score: 94,
    jobs: 847,
    price: 0.05,
    owner: '0x37041F257Bf8f1E201497Dc0BCDa1ae0d8317992',
    description: 'Real-time liquidity and slippage analytics for Byreal pools. Returns optimal route + price impact + MEV exposure for any swap intent.',
    registered: '2026-03-12',
    isReal: false,
    endpoint: '',
    metadataURI: '',
    agentId: '4',
    acceptedToken: 'USDC',
    tags: ['defi', 'liquidity', 'byreal'],
    reputationHistory: [],
  },
  {
    id: '5',
    name: 'mantle-tx-classifier',
    version: 'v2.1.0',
    tier: 'BASIC',
    score: 76,
    jobs: 312,
    price: 0.02,
    owner: '0xaB5a52C30D769A7Eae1474857A6180E71765CBAF',
    description: 'Labels Mantle transactions by intent: swap, bridge, governance, MEV, transfer. Trained on ground truth from 2M labeled txs.',
    registered: '2026-04-02',
    isReal: false,
    endpoint: '',
    metadataURI: '',
    agentId: '5',
    acceptedToken: 'USDC',
    tags: ['classification', 'mantle', 'transactions'],
    reputationHistory: [],
  },
  {
    id: '6',
    name: 'allora-prompt-router',
    version: 'v0.9.2',
    tier: 'BASIC',
    score: 82,
    jobs: 198,
    price: 0.08,
    owner: '0x1d550b555B3a2e124ef611b55965848d6be233a2',
    description: 'Routes a natural-language inference request to the cheapest Allora topic that satisfies it. Returns topic ID + expected accuracy.',
    registered: '2026-04-18',
    isReal: false,
    endpoint: '',
    metadataURI: '',
    agentId: '6',
    acceptedToken: 'USDC',
    tags: ['allora', 'routing', 'inference'],
    reputationHistory: [],
  },
  {
    id: '7',
    name: 'attestation-summarizer',
    version: 'v0.2.0',
    tier: 'FREE',
    score: 41,
    jobs: 28,
    price: 0.00,
    owner: '0x37041F257Bf8f1E201497Dc0BCDa1ae0d8317992',
    description: 'Summarizes a chain of EAS attestations into human-readable provenance. Returns 200-word digest + confidence score.',
    registered: '2026-05-08',
    isReal: false,
    endpoint: '',
    metadataURI: '',
    agentId: '7',
    acceptedToken: 'USDC',
    tags: ['attestation', 'eas', 'summarization'],
    reputationHistory: [],
  },
]

const MOCK_STATS: Stats = {
  totalSkills: 4,
  totalJobsExecuted: 1,
  averageReputationScore: 90,
}

const MOCK_JOBS: Job[] = [
  {
    id: 'job-1',
    skillId: '1',
    skillName: 'spawn-failure-analyst',
    skillTier: 'PRO',
    consumer: '0xC0296012Cfbb0e6DF5dA7158B65Dbc46DD9650e0',
    score: 90,
    settlementTx: '0x7f27c6562d6a8e3f4b1c9e8a47b2f31d6c50a8e9b1f3c2d4e5a6b7c8d9e0f1a2c656',
    amount: '0.50',
    timestamp: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
    confirmed: true,
  },
]

interface RawSkillRecord {
  skillId: number
  owner: string
  name: string
  version: string
  endpoint: string
  metadataURI: string
  erc8004AgentId: number | string
  registeredAt: number
  totalJobs: number
  averageScore: number
  pricePerCallBps?: number
  tier: Tier
  tierPaidUntil?: number
  active?: boolean
}

interface RawStatsResponse {
  totalSkills?: number
  totalJobs?: number
  avgReputationScore?: number
  totalJobsExecuted?: number
  averageReputationScore?: number
}

function normalizeSkill(raw: RawSkillRecord): Skill {
  return {
    id: String(raw.skillId),
    name: raw.name,
    version: raw.version,
    endpoint: raw.endpoint,
    metadataURI: raw.metadataURI,
    owner: raw.owner,
    price: raw.pricePerCallBps ? raw.pricePerCallBps / 1_000_000 : 0.05,
    acceptedToken: 'USDC',
    score: raw.averageScore ?? 0,
    jobs: raw.totalJobs ?? 0,
    tier: raw.tier ?? 'FREE',
    agentId: String(raw.erc8004AgentId ?? ''),
    description: '',
    tags: [],
    registered: raw.registeredAt
      ? new Date(raw.registeredAt * 1000).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10),
    isReal: true,
    reputationHistory: [],
  }
}

function normalizeStats(raw: RawStatsResponse): Stats {
  return {
    totalSkills: raw.totalSkills ?? 0,
    totalJobsExecuted: raw.totalJobsExecuted ?? raw.totalJobs ?? 0,
    averageReputationScore: raw.averageReputationScore ?? raw.avgReputationScore ?? 0,
  }
}

// Default to the live indexer so the deployed dashboard pulls real on-chain
// data even when NEXT_PUBLIC_BAZAAR_API is not set in the host environment.
const API_BASE = process.env.NEXT_PUBLIC_BAZAAR_API ?? 'https://ledgerforge-indexer.fly.dev'

async function apiFetch<T>(path: string): Promise<T> {
  if (!API_BASE) throw new Error('NEXT_PUBLIC_BAZAAR_API not set')
  const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<T>
}

export function useBazaarData() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [isMockData, setIsMockData] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadSkills = useCallback(async () => {
    try {
      const raw = await apiFetch<{ skills?: RawSkillRecord[] } | RawSkillRecord[]>('/skills')
      const records: RawSkillRecord[] = Array.isArray(raw)
        ? raw
        : ((raw as { skills?: RawSkillRecord[] }).skills ?? [])
      setSkills(records.map(normalizeSkill))
      setIsMockData(false)
    } catch {
      setSkills(MOCK_SKILLS)
      setIsMockData(true)
    }
  }, [])

  const loadStats = useCallback(async () => {
    try {
      const raw = await apiFetch<RawStatsResponse>('/stats')
      setStats(normalizeStats(raw))
    } catch {
      setStats(MOCK_STATS)
    }
  }, [])

  const loadJobs = useCallback(async () => {
    try {
      const raw = await apiFetch<Job[]>('/jobs')
      setJobs(Array.isArray(raw) ? raw : [])
    } catch {
      setJobs(MOCK_JOBS)
    }
  }, [])

  useEffect(() => {
    Promise.all([loadSkills(), loadStats(), loadJobs()]).finally(() => setLoading(false))

    const si = setInterval(loadSkills, 15_000)
    const ti = setInterval(loadStats, 30_000)
    const ji = setInterval(loadJobs, 15_000)

    return () => {
      clearInterval(si)
      clearInterval(ti)
      clearInterval(ji)
    }
  }, [loadSkills, loadStats, loadJobs])

  return { skills, stats, jobs, isMockData, loading }
}
