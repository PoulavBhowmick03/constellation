// Agent specs: ordered list of skill invocations + decision function.
// The same runner.ts + AgentRunTimeline consume all three.

import { decideScout, type ScoutDecision } from "./decide";
import { distillSwapPreview } from "./parsers";
import { DEFAULT_PERPS_POSITIONS, decidePerps, type PerpsDecision } from "./perps";
import { decideSpawnAudit, type SpawnDecision } from "./spawn";

export interface AgentStepSpec {
  skillId: number;
  label: string;
  args: { query?: Record<string, string>; body?: unknown };
  /** If true, this step runs ONLY after a decision has been made. */
  runsAfterDecision?: boolean;
  /** Returns true if this step should be invoked given prior outputs + decision. */
  shouldRun?: (priorOutputs: unknown[], decision?: unknown) => boolean;
}

export interface AgentSpec<DecisionT = unknown> {
  id: "scout" | "perps-coach" | "spawn-auditor";
  title: string;
  description: string;
  /** Per-skill price in token base units (e.g. 50000 = 0.05 USDC). */
  pricePerCall: bigint;
  steps: AgentStepSpec[];
  /** Compute the decision from settled step outputs (in spec order; skipped steps = undefined). */
  decide: (outputs: unknown[]) => DecisionT;
  /** After-decision steps (e.g. swap-preview) may want to re-derive enriched info — optional hook. */
  enrichDecision?: (decision: DecisionT, outputs: unknown[]) => DecisionT;
  /**
   * @deprecated Replay now matches settlements by skillId from the /jobs API
   * (see replay.ts). Hardcoded jobIds went stale whenever the indexer re-synced
   * its settlement history. Kept optional for backwards compatibility; unused.
   */
  pinnedReplayJobIds?: number[];
}

// ─── Scout ────────────────────────────────────────────────────────────────

export const SCOUT_SPEC: AgentSpec<ScoutDecision> = {
  id: "scout",
  title: "Scout",
  description:
    "DeFi yield-rotation scout. Pays for live Byreal pool APR, Aave V3 USDC supply rate, token prices, and gas estimates, then recommends ENTER_POOL or STAY with a confidence score.",
  pricePerCall: 50_000n, // 0.05 USDC
  steps: [
    {
      skillId: 6,
      label: "byreal-top-pools",
      args: { query: { sortField: "apr24h", pageSize: "3" } },
    },
    {
      skillId: 12,
      label: "aave-v3-rates",
      args: { query: { asset: "USDC" } },
    },
    {
      skillId: 14,
      label: "token-price-feed",
      args: { query: { tokens: "USDC,USDe" } },
    },
    {
      skillId: 13,
      label: "mantle-gas-oracle",
      args: {},
    },
    {
      skillId: 7,
      label: "byreal-swap-preview",
      args: {
        body: {
          // Solana mint addresses — Byreal CLI requires a Solana wallet shape
          // even when reading from EVM. The CLI generates a deterministic
          // demo wallet on its side when given a non-base58 placeholder, so
          // a sane default mint pair works for the demo.
          walletAddress: "9wFFAehUKbKfFLJBwgGsk7p5kQt8jrM8sPCkdrjL3Yfa",
          inputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
          outputMint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
          amount: "100000000",
          slippage: "0.5",
        },
      },
      runsAfterDecision: true,
      shouldRun: (_outputs, decision) =>
        (decision as ScoutDecision | undefined)?.action === "ENTER_POOL",
    },
  ],
  decide: (outputs) =>
    decideScout({
      topPools: outputs[0],
      aaveRates: outputs[1],
      gas: outputs[3],
    }),
  enrichDecision: (decision, outputs) => {
    const swap = outputs[4];
    if (swap === undefined) return decision;
    return { ...decision, swap: distillSwapPreview(swap) };
  },
};

// ─── Perps Coach ──────────────────────────────────────────────────────────

export const PERPS_COACH_SPEC: AgentSpec<PerpsDecision> = {
  id: "perps-coach",
  title: "Perps Coach",
  description:
    "Scans your open Byreal perps positions and issues a per-position coaching recommendation: HOLD, REDUCE, TAKE_PROFIT, or AVOID. Pulls live signals for each coin, plus token prices and gas context.",
  pricePerCall: 50_000n,
  steps: [
    // One byreal-perps-signals call per position. Default positions: BTC, ETH, SOL.
    ...DEFAULT_PERPS_POSITIONS.map((p) => ({
      skillId: 8,
      label: `byreal-perps-signals ${p.coin}:${p.side}`,
      args: { query: { coin: p.coin } },
    })),
    {
      skillId: 14,
      label: "token-price-feed",
      args: { query: { tokens: "USDC,USDe" } },
    },
    {
      skillId: 13,
      label: "mantle-gas-oracle",
      args: {},
    },
  ],
  decide: (outputs) => {
    // First N outputs (one per position) are the signal calls.
    const signalOutputs = outputs.slice(0, DEFAULT_PERPS_POSITIONS.length);
    return decidePerps(DEFAULT_PERPS_POSITIONS, signalOutputs);
  },
};

// ─── Spawn Auditor ────────────────────────────────────────────────────────

export const SPAWN_AUDITOR_SPEC: AgentSpec<SpawnDecision> = {
  id: "spawn-auditor",
  title: "Spawn Auditor",
  description:
    "Audits an AI deployment before promotion. Pays for three independent analyzers: failure history, lineage context, and on-chain decision-hash verification. Returns APPROVE / BLOCK / NEEDS_REVIEW with remediations.",
  pricePerCall: 50_000n,
  steps: [
    {
      skillId: 1,
      label: "spawn-failure-analyst",
      args: { query: { lineageKey: "agent-demo-lineage" } },
    },
    {
      skillId: 2,
      label: "lineage-context-builder",
      args: { query: { lineageKey: "agent-demo-lineage", generation: "2" } },
    },
    {
      skillId: 3,
      label: "decision-hash-verifier",
      args: {
        query: {
          contractAddress: "0x37041F257Bf8f1E201497Dc0BCDa1ae0d8317992",
          decisionHash: `0x${"deadbeef".repeat(8)}`,
        },
      },
    },
  ],
  decide: (outputs) =>
    decideSpawnAudit({
      failureAnalysis: outputs[0],
      lineageContext: outputs[1],
      verifier: outputs[2],
    }),
};

export const ALL_SPECS = [SCOUT_SPEC, PERPS_COACH_SPEC, SPAWN_AUDITOR_SPEC];
