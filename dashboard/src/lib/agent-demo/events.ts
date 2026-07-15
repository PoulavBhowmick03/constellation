// Shared event-stream shape for both live and replay orchestrators.
// The timeline component subscribes to this stream and renders state machines
// per step. AgentEvent intentionally does not contain `Decision` because
// per-agent decision shapes differ (Scout: single object, Perps: per-position
// table, Spawn: verdict + remediations). Decisions are carried as `unknown`
// and rendered by an agent-specific React component picked up from the spec.

import type { Hex } from "viem";

export interface SettlementSummary {
  skillId: number;
  skillName: string;
  jobId: string;
  pullTx?: Hex;
  createJobTx?: Hex;
  completeJobTx?: Hex;
  skillRegistryRepTx?: Hex;
  erc8004FeedbackTx?: Hex;
  explorerUrl: string;
  /** Computed by the composite scorer after output is received. */
  score?: number;
}

export type AgentEvent =
  | { type: "started" }
  | { type: "step-running"; stepIndex: number }
  | { type: "step-settled"; stepIndex: number; settlement: SettlementSummary; output: unknown }
  | { type: "step-skipped"; stepIndex: number; reason: string }
  | { type: "step-failed"; stepIndex: number; error: string }
  | { type: "decision"; decision: unknown }
  | { type: "completed"; totalSpent: bigint; settlements: SettlementSummary[] }
  | { type: "aborted"; reason: string };
