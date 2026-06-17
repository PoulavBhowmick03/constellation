// Replay orchestrator: emits the same AgentEvent stream as runner.ts but
// reads its data from the indexer's /jobs API instead of making real
// payments. Designed for judges who don't have a Mantle wallet.

import type { AgentEvent, SettlementSummary } from './events'
import type { AgentSpec } from './specs'

const BAZAAR_API =
  process.env.NEXT_PUBLIC_BAZAAR_API ?? 'https://ledgerforge-indexer.fly.dev'

interface JobRecord {
  jobId: string
  skillId: string
  skillName: string
  consumer: string
  provider: string
  settlementTx: string
  createJobTx?: string
  completeJobTx?: string
  amount: string
  feeAmount: string
  token: 'USDC' | 'USDe'
  blockNumber: number
  timestamp: string
  confirmed: boolean
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Async iterable that mirrors runner.runLive but with simulated pacing. */
export async function* runReplay<T>(
  spec: AgentSpec<T>,
  opts: { stepDelayMs?: number } = {},
): AsyncIterable<AgentEvent> {
  const stepDelay = opts.stepDelayMs ?? 1500

  yield { type: 'started' }

  // Fetch all candidate jobs once. /jobs returns most-recent-first.
  let allJobs: JobRecord[]
  try {
    const res = await fetch(`${BAZAAR_API}/jobs?limit=500`)
    if (!res.ok) throw new Error(`indexer /jobs returned ${res.status}`)
    allJobs = (await res.json()) as JobRecord[]
  } catch (err) {
    yield {
      type: 'aborted',
      reason: `Failed to load historical run: ${err instanceof Error ? err.message : 'unknown error'}`,
    }
    return
  }

  // Match settlements by skillId rather than hardcoded jobIds: the indexer's
  // settlement history is rebuilt from chain events and jobIds are not stable
  // across re-syncs, so pinned ids go stale. We group the most-recent settled
  // jobs per skill and consume one per step — this also handles a spec that
  // calls the same skill multiple times (e.g. perps signals for BTC/ETH/SOL).
  const jobsBySkillId = new Map<string, JobRecord[]>()
  for (const job of allJobs) {
    const key = String(job.skillId)
    if (!jobsBySkillId.has(key)) jobsBySkillId.set(key, [])
    jobsBySkillId.get(key)!.push(job)
  }

  const matchableSteps = spec.steps.filter(
    (step) => (jobsBySkillId.get(String(step.skillId))?.length ?? 0) > 0,
  ).length
  if (matchableSteps === 0) {
    yield {
      type: 'aborted',
      reason:
        "No historical settlements found for this agent's skills yet — run it live with MetaMask to generate them.",
    }
    return
  }

  const settlements: SettlementSummary[] = []
  const outputs: unknown[] = new Array(spec.steps.length).fill(undefined)

  // Walk steps in spec order, consuming the newest unused settled job for each
  // step's skillId. Steps with no remaining settlement are emitted as skipped.
  for (let i = 0; i < spec.steps.length; i++) {
    const queue = jobsBySkillId.get(String(spec.steps[i].skillId))
    if (!queue || queue.length === 0) {
      yield {
        type: 'step-skipped',
        stepIndex: i,
        reason: `no settled job found for skillId ${spec.steps[i].skillId}`,
      }
      continue
    }

    yield { type: 'step-running', stepIndex: i }
    await sleep(stepDelay)

    const job = queue.shift()!

    const settlement: SettlementSummary = {
      skillId: spec.steps[i].skillId,
      skillName: spec.steps[i].label,
      jobId: job.jobId,
      pullTx: undefined, // /jobs only surfaces createJob + completeJob today
      createJobTx: job.createJobTx as `0x${string}` | undefined,
      completeJobTx: (job.completeJobTx || job.settlementTx) as `0x${string}` | undefined,
      // Reputation tx hashes aren't in /jobs payload — accept undefined.
      skillRegistryRepTx: undefined,
      erc8004FeedbackTx: undefined,
      explorerUrl: `https://mantlescan.xyz/tx/${job.completeJobTx || job.settlementTx}`,
    }
    settlements.push(settlement)
    // Replay can't reconstruct the skill's raw output JSON since the indexer
    // doesn't store it. Decision rendering after a replay run shows the
    // ENTER_POOL/STAY label with reasoning derived from spec-level hints in
    // the future; for v1 we just synthesize a stub so the UI can render
    // "decision: REPLAY — see live mode for full decision logic".
    outputs[i] = { __replay: true }

    yield {
      type: 'step-settled',
      stepIndex: i,
      settlement,
      output: outputs[i],
    }
  }

  // Synthesize a placeholder decision — the real `decide()` needs the live
  // skill outputs which we don't have. Replay mode emphasises the on-chain
  // proof; for the decision rationale, point the user at live mode.
  yield {
    type: 'decision',
    decision: {
      action: 'REPLAY',
      reason:
        'Replay mode shows historical on-chain settlements. Run live with MetaMask to see the agent\'s decision logic on fresh market data.',
      confidence: 100,
    },
  }

  yield {
    type: 'completed',
    totalSpent: spec.pricePerCall * BigInt(settlements.length),
    settlements,
  }
}
