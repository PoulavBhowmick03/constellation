'use client'
import { useCallback, useRef, useState } from 'react'
import type { AgentEvent, SettlementSummary } from '@/lib/agent-demo/events'

export type StepStatus = 'queued' | 'running' | 'done' | 'failed' | 'skipped'

export interface StepState {
  status: StepStatus
  settlement?: SettlementSummary
  output?: unknown
  error?: string
  skipReason?: string
}

export type RunPhase = 'idle' | 'running' | 'completed' | 'failed' | 'aborted'

export interface AgentRunState {
  phase: RunPhase
  steps: StepState[]
  decision: unknown
  totalSpent: bigint
  settlements: SettlementSummary[]
  error?: string
}

const initial = (stepCount: number): AgentRunState => ({
  phase: 'idle',
  steps: Array.from({ length: stepCount }, () => ({ status: 'queued' as StepStatus })),
  decision: undefined,
  totalSpent: 0n,
  settlements: [],
})

/**
 * Drives an async iterable of AgentEvents into React state. Handles cancel
 * via an internal ref flag that the caller can flip with `abort()`.
 */
export function useAgentRun(stepCount: number) {
  const [state, setState] = useState<AgentRunState>(() => initial(stepCount))
  const abortRef = useRef(false)

  const reset = useCallback(() => {
    abortRef.current = false
    setState(initial(stepCount))
  }, [stepCount])

  const run = useCallback(
    async (events: AsyncIterable<AgentEvent>) => {
      abortRef.current = false
      setState({ ...initial(stepCount), phase: 'running' })

      try {
        for await (const ev of events) {
          if (abortRef.current) {
            setState((s) => ({ ...s, phase: 'aborted' }))
            return
          }
          setState((s) => applyEvent(s, ev))
        }
      } catch (err) {
        setState((s) => ({
          ...s,
          phase: 'failed',
          error: err instanceof Error ? err.message : String(err),
        }))
      }
    },
    [stepCount],
  )

  const abort = useCallback(() => {
    abortRef.current = true
  }, [])

  return { state, run, reset, abort }
}

function applyEvent(s: AgentRunState, ev: AgentEvent): AgentRunState {
  switch (ev.type) {
    case 'started':
      return { ...s, phase: 'running' }
    case 'step-running': {
      const steps = s.steps.slice()
      steps[ev.stepIndex] = { ...steps[ev.stepIndex], status: 'running' }
      return { ...s, steps }
    }
    case 'step-settled': {
      const steps = s.steps.slice()
      steps[ev.stepIndex] = {
        status: 'done',
        settlement: ev.settlement,
        output: ev.output,
      }
      return { ...s, steps }
    }
    case 'step-skipped': {
      const steps = s.steps.slice()
      steps[ev.stepIndex] = { status: 'skipped', skipReason: ev.reason }
      return { ...s, steps }
    }
    case 'step-failed': {
      const steps = s.steps.slice()
      steps[ev.stepIndex] = {
        ...steps[ev.stepIndex],
        status: 'failed',
        error: ev.error,
      }
      return { ...s, steps, phase: 'failed', error: ev.error }
    }
    case 'decision':
      return { ...s, decision: ev.decision }
    case 'completed':
      return {
        ...s,
        phase: 'completed',
        totalSpent: ev.totalSpent,
        settlements: ev.settlements,
      }
    case 'aborted':
      return { ...s, phase: 'aborted' }
  }
}
