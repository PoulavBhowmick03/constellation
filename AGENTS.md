# AGENTS.md

You are one of several coding agents working in this monorepo in parallel. Your kickoff prompt tells you which workstream you are: **P2**, **I2**, or **AG1**. Read `README.md`, `docs/INTERFACES.md`, and `docs/PLAN.md` before writing any code. The rules here mirror `CLAUDE.md`; both files are binding on all agents.

**Current priority (read this first):** The submission is **Treasury Copilot** (P1's lane, Claude Code). **P2/KYA is a conditional fast-follow** — build the scoring engine on fixtures so it is *ready*, but it only lists if Treasury is live and clean by D6/D7 (see PLAN.md gates). Do not treat KYA's listing as certain, and do not let it compete with Treasury for shared help. The ZK tier is deferred to the writeup by default. **I2's mocks/evals for Treasury are the immediate need**; KYA fixtures second.

**Status (Jul 15, night):** Treasury is **LIVE** (`https://constellationokx.fly.dev/mcp`, real x402). **Real on-chain settlement CONFIRMED** (tx `0xceaab66…`, 0.10 USD₮0). Money path hardened after two Codex reviews: durable Postgres settlement store, timeout `settle/status` polling, required resource tool-binding, precheck-before-charge. 90 tests green. Dashboard wired to live endpoint (free path). Repos consolidated on `origin/main` (mocks/tests/dashboard preserved). Remaining: redeploy hardened code + `fly scale count 1`, activate Agent 5863, demo + form. See `docs/status/P1.md`.

## Ownership matrix (hard boundaries)

| Workstream | Owns (may create/edit) | Must never edit |
|---|---|---|
| P2 (Codex, Poulav) | `packages/zk`, `apps/kya` | `apps/treasury`, `apps/firm`, `packages/indexer`, `packages/erc8004` (read/import only), `packages/mocks` |
| I2 (Codex, Ishita) | `packages/mocks`, `tests/`, `tools/demo` | all `apps/*`, all other `packages/*` |
| AG1 (Antigravity, optional) | `apps/dashboard` only | everything else |

Shared read-only: `docs/INTERFACES.md` (the law), `README.md`, `docs/PLAN.md`. Schema objections go to `docs/status/<YOUR-ID>.md`; you stop, you never patch the schema or code around it.

## Non-negotiables

1. Build exactly to `docs/INTERFACES.md`, including error shapes and `zk.available:false` degradation.
2. Read-only, non-custodial products. The single transaction-sending artifact in the entire repo is P2's Foundry deploy script for the auto-generated verifier, run by a human, never in CI.
3. Never invent facts. Unverified addresses/endpoints/SDK behavior become env vars + `TODO(unverified)` + a status-file line. Wrong payment or chain guesses cost us the listing.
4. No secrets in the repo; everything in `.env.example`.
5. Wash-trading rule: no scripts where our agents pay our own tools in loops. Charging is tested on SDK test mode or mocks only.
6. Conventional commits, branch per workstream (`p2/*`, `i2/*`, `ag1/*`), humans merge to main.

## Session protocol

End every session by appending to `docs/status/<YOUR-ID>.md`: `## <date>` + Done / Blocked / Next / Questions for humans. Hit a stop-and-ask condition (SDK contradiction, unverifiable fact, anything transaction-sending, cross-lane temptation): log it immediately, switch to an unblocked task.

---

## P2 brief — KYA engine + ZK pipeline

Mission: KYA's heuristic tier submitted for listing by D5 (July 11). The ZK layer is the differentiator AND the designated cut: a hard timebox from D5 to D6 midday. If the pipeline fights back, `attest_agent` ships with `zk.available:false` and the entry still stands. Do not let ZK ambition delay the heuristic listing by one hour.

Scope, in order:
1. Scoring engine in `apps/kya`: the four components, six flags, and weights exactly as INTERFACES.md defines them. Pure functions over a `AgentEvidence` input struct; fully unit-tested against the four golden fixtures BEFORE any live chain reads. Explainability is the product: every component returns its evidence.
2. Live evidence collection via `packages/erc8004` (P1 delivers by D3; until then, fixtures). Identity-continuity is the headline: walk ERC-721 Transfer history of the identity token, correlate against feedback timestamps.
3. MCP server exposing `get_flags`, `check_agent`, `attest_agent`, `verify_attestation`, charging through `packages/payment-adapter` (import only; never modify it).
4. `packages/zk`: port the CredAttest EZKL pipeline (human provides the source path). Target: a deliberately tiny model (logistic regression or small MLP over the ~10 evidence features), circuit, Groth16/BN254 proving, `ezkl`-generated Solidity verifier, Foundry deploy script for X Layer. Proof generation runs server-side per `attest_agent` call; measure and log proving time on D5, and if p95 exceeds 60 seconds, raise it in status rather than silently shipping a timeout.
5. Model commitment published in the repo and in the tool response so third parties can check which model scored them.

Definition of done: all four fixtures produce the expected scores/flags; `agent_transferred_identity` trips `IDENTITY_TRANSFERRED_RECENTLY` with correct evidence; listing checklist in your status file by D5.

## I2 brief — Mocks, evals, demo harness

Mission: everyone else's velocity. I1 can only start on D1 because your mocks exist; the team can only trust The Firm because your evals gate it.

Scope, in order:
1. `packages/mocks`: an MCP server implementing every tool in INTERFACES.md with the four named golden fixtures, switched by `MOCK_MODE=1`. Include both `zk.available` shapes for `attest_agent`. Schema drift between mocks and INTERFACES.md is a build-stopping bug; when the file versions bump, mocks update in the same PR (humans will route the change through you).
2. Eval harness in `tests/`: the three golden tasks from PLAN.md as automated checks against The Firm (diligence rejection, budget halt, provenance completeness). Runnable one-command: this is the D7 gate for The Firm's listing submission.
3. `tools/demo`: a scenario runner that executes the demo spine end to end and pretty-prints the run (task, plan, KYA verdicts per vendor, payments with references, assembled memo). Output should be clean enough to screen-record directly; that is its purpose.
4. Fixture realism: seed `wallet_with_history` and the three agent fixtures with internally consistent numbers (the sybil fixture's reviewer concentration must actually exceed 0.60, etc.). Evals assert on those numbers.

## AG1 brief — Demo dashboard (OPTIONAL, first cut)

Do not begin unless a human writes GO in `docs/status/AG1.md` (decision D6). Mission: a read-only Next.js viewer that makes the 90-second videos legible: Firm run timeline (nodes lighting up), KYA report cards with score breakdowns, payment receipts with explorer links, treasury statement render. Consumes only: The Firm's run-log JSON, KYA/Treasury read endpoints. Zero writes, zero core dependencies, zero edits outside `apps/dashboard`. If you find a bug elsewhere, report it in status; do not fix it.
