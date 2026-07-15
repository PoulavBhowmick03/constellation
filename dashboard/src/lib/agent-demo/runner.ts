// Live orchestrator: drives an AgentSpec via @ishitaaaaw/x402-mantle.
// Each step is a `client.invoke()` call against Mantle mainnet; the user's
// MetaMask signs each EIP-712 payment. The orchestrator yields AgentEvents
// that the UI subscribes to.

import { LedgerForgeClient, type InvokeResult, type SettlementReceipt } from '@ishitaaaaw/x402-mantle'
import { type WalletClient, type Hex } from 'viem'
import type { AgentEvent, SettlementSummary } from './events'
import type { AgentSpec, AgentStepSpec } from './specs'
import { scoreOutput } from './scoring'

const FACILITATOR_URL =
  (process.env.NEXT_PUBLIC_FACILITATOR_URL ?? 'https://ledgerforge-facilitator.fly.dev').replace(/\/$/, '')

/** Async generator pattern lets the UI cancel mid-run by breaking the for-await loop. */
export async function* runLive<T>(
  spec: AgentSpec<T>,
  walletClient: WalletClient,
  options: { provider: `0x${string}` },
): AsyncIterable<AgentEvent> {
  const client = new LedgerForgeClient({ walletClient })
  yield { type: 'started' }

  const outputs: unknown[] = new Array(spec.steps.length).fill(undefined)
  const settlements: SettlementSummary[] = []
  let decision: T | undefined

  // Phase 1: run all steps NOT marked runsAfterDecision
  for (let i = 0; i < spec.steps.length; i++) {
    const step = spec.steps[i]
    if (step.runsAfterDecision) continue
    yield* invokeStep(client, spec, step, i, outputs, settlements, options)
  }

  decision = spec.decide(outputs)
  yield { type: 'decision', decision }

  // Phase 2: run any post-decision steps that match their shouldRun predicate
  for (let i = 0; i < spec.steps.length; i++) {
    const step = spec.steps[i]
    if (!step.runsAfterDecision) continue
    if (step.shouldRun && !step.shouldRun(outputs, decision)) {
      yield { type: 'step-skipped', stepIndex: i, reason: 'decision did not select this branch' }
      continue
    }
    yield* invokeStep(client, spec, step, i, outputs, settlements, options)
  }

  // Some specs (e.g. Scout) want to enrich the decision after a post-decision
  // step lands (e.g. the swap preview details).
  if (spec.enrichDecision) {
    const enriched = spec.enrichDecision(decision, outputs)
    if (enriched !== decision) {
      yield { type: 'decision', decision: enriched }
    }
  }

  yield {
    type: 'completed',
    totalSpent: spec.pricePerCall * BigInt(settlements.length),
    settlements,
  }
}

async function* invokeStep<T>(
  client: LedgerForgeClient,
  spec: AgentSpec<T>,
  step: AgentStepSpec,
  index: number,
  outputs: unknown[],
  settlements: SettlementSummary[],
  options: { provider: `0x${string}` },
): AsyncGenerator<AgentEvent> {
  yield { type: 'step-running', stepIndex: index }
  try {
    const t0 = Date.now()
    const result: InvokeResult = await client.invoke(step.skillId, {
      recipient: options.provider,
      amount: spec.pricePerCall,
      query: step.args.query,
      body: step.args.body,
    })
    const latencyMs = Date.now() - t0
    outputs[index] = result.output

    const score = scoreOutput(step.skillId, result.output, latencyMs)
    // Fire-and-forget: report computed score to facilitator so it gets written on-chain.
    void reportScore(step.skillId, score)

    const settlement = toSettlement(step, result, score)
    settlements.push(settlement)
    yield {
      type: 'step-settled',
      stepIndex: index,
      settlement,
      output: result.output,
    }
  } catch (err) {
    yield {
      type: 'step-failed',
      stepIndex: index,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

function toSettlement(step: AgentStepSpec, result: InvokeResult, score?: number): SettlementSummary {
  const r: SettlementReceipt = result.receipt
  return {
    skillId: step.skillId,
    skillName: step.label,
    jobId: r.escrowJobId ?? '?',
    pullTx: r.pullTxHash as Hex | undefined,
    createJobTx: r.createJobTxHash as Hex | undefined,
    completeJobTx: r.completeJobTxHash as Hex | undefined,
    skillRegistryRepTx: r.skillRegistryRepTxHash as Hex | undefined,
    erc8004FeedbackTx: r.erc8004FeedbackTxHash as Hex | undefined,
    explorerUrl: r.explorerUrl,
    score,
  }
}

async function reportScore(skillId: number, score: number): Promise<void> {
  try {
    await fetch(`${FACILITATOR_URL}/score`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ skillId, score }),
    })
  } catch {
    // non-critical — best-effort score reporting
  }
}
