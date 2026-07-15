export type Tier = 'FREE' | 'BASIC' | 'PRO'
export type AcceptedToken = 'USDC' | 'USDe'

export interface Skill {
  id: string
  name: string
  version: string
  endpoint: string
  metadataURI: string
  owner: string
  price: number
  acceptedToken: AcceptedToken
  score: number
  jobs: number
  tier: Tier
  agentId: string
  description: string
  tags: string[]
  registered: string
  isReal: boolean
  reputationHistory: ReputationPoint[]
}

export interface ReputationPoint {
  timestamp: string
  score: number
  jobId: string
}

export interface Stats {
  totalSkills: number
  totalJobsExecuted: number
  averageReputationScore: number
}

export interface Job {
  id: string
  skillId: string
  skillName: string
  skillTier: Tier
  consumer: string
  score: number
  settlementTx: string
  amount: string
  timestamp: string
  confirmed?: boolean
  /**
   * Five-leg ERC-8004 settlement chain. All five may be absent ("" or
   * undefined) for legacy / unconfirmed jobs — render dimmed in that case.
   */
  pullTx?: string
  createJobTx?: string
  completeJobTx?: string
  skillRegistryRepTx?: string
  erc8004FeedbackTx?: string
  /** Indexer-side classification: real on-chain job vs. system/synthetic. */
  kind?: 'real' | 'system'
}

export type SortKey = 'reputation' | 'jobs' | 'newest' | 'price-low'
export type FilterTier = 'ALL' | Tier
