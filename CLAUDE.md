# CLAUDE.md

You are one of several coding agents working in this monorepo in parallel. Your kickoff prompt tells you which workstream you are: **P1** or **I1**. Read `README.md`, `docs/INTERFACES.md`, and `docs/PLAN.md` before writing any code.

**Current priority (read this first):** The submission is **Treasury Copilot**. P1 is the critical path. **I1 (The Firm) is DORMANT** — do not begin unless a human has explicitly activated it per PLAN.md; if you are I1 and no activation is present, stop and say so. KYA (P2's lane) is a conditional fast-follow, not guaranteed to ship.

**Status (Jul 15, night):** Treasury is **LIVE** at `https://constellationokx.fly.dev/mcp`, `PAYMENT_MODE=sdk`. **A real x402 settlement is CONFIRMED on-chain** — tx `0xceaab66465959a25680c1efe6b37d71f0afea6cd115fd90a130288982280cc2b` (0.10 USD₮0, buyer→treasury, X Layer). Money path hardened after two Codex reviews: durable Postgres settlement store (`payment_receipts`) with atomic cross-machine reserve, `settle/status` polling for timeout recovery, tool-binding via required `resource`, precheck-before-charge (wallet/format/period), PAYMENT-RESPONSE header. 84→90 tests green. **Remaining before submit:** redeploy the hardened code + `fly scale count 1`; activate Agent 5863; demo + form; optional Codex re-verify round 3. Dashboard (`apps/dashboard`) is now wired to the live endpoint for the free path (Codex A). Repos are consolidated on `origin/main`. See `docs/status/P1.md`.

## Ownership matrix (hard boundaries)

| Workstream | Owns (may create/edit) | Must never edit |
|---|---|---|
| P1 (Claude Code, Poulav) | `packages/indexer`, `packages/erc8004`, `packages/payment-adapter`, `apps/treasury` | `apps/firm`, `apps/kya`, `packages/zk`, `packages/mocks` |
| I1 (Claude Code, Ishita) | `apps/firm`, `packages/swarm-utils` | everything under `packages/*` except swarm-utils, `apps/treasury`, `apps/kya` |

Shared read-only for all agents: `docs/INTERFACES.md` (the law), `README.md`, `docs/PLAN.md`. If you believe a schema is wrong, write your objection to `docs/status/<YOUR-ID>.md` and stop that thread of work. Do not change the schema. Do not code around it.

## Non-negotiables

1. `docs/INTERFACES.md` is frozen. Build exactly to it, including error shapes and the `zk.available:false` degradation path.
2. Treasury and KYA are read-only and non-custodial. The only code allowed to touch the OKX Payment SDK lives in `packages/payment-adapter`. The only transaction-sending script in the repo is the Foundry deploy for the generated KYA verifier (P2's lane, not yours).
3. Never invent facts. Contract addresses, RPC endpoints, SDK method names: if unverified, use an env var, mark `TODO(unverified)`, add a line to your status file. A wrong guess about payments or chain config costs us the listing.
4. No secrets in the repo. Every env var documented in `.env.example` with a one-line comment.
5. Wash-trading rule: never write scripts that have our own agents call our own paid tools in a loop. Test charging against the SDK's test mode or mocks.

## Environment and commands

- Node 20+, pnpm workspaces. `pnpm i`, `pnpm -F <pkg> dev|test|build`.
- `apps/firm` is Python 3.12 + uv + LangGraph: `uv sync`, `uv run pytest`, `uv run python -m firm.cli`.
- Postgres: `docker compose up -d db`. Migrations live with `packages/indexer`.
- TypeScript strict mode. Vitest. Money math and KYA score components require unit tests; a PR touching either without tests is incomplete.
- Conventional commits. Branch per workstream: `p1/*`, `i1/*`. Humans merge to main; you never do.

## Session protocol

End every session by appending to `docs/status/<YOUR-ID>.md`:
`## <date>` then four short sections: Done / Blocked / Next / Questions for humans. If you hit a stop-and-ask condition mid-session, write it there immediately and move to an unblocked task.

Stop-and-ask conditions (all workstreams): Payment SDK reality contradicts INTERFACES.md; a needed address/endpoint is unverifiable; any task would require sending a transaction; any temptation to edit outside your lane.

---

## P1 brief — Chain data + Treasury (critical path)

Mission: Treasury Copilot live and submitted for OKX listing by end of D3 (July 9). It is the review probe for all three entries; its schedule outranks elegance.

Scope, in order:
1. Scaffold the monorepo exactly as in README (pnpm workspaces; `apps/firm` as an empty uv project for I1 to fill).
2. Port the LedgerForge indexer (the human will give you the source path). Retarget: X Layer (`eip155:196`), tracked events = ERC-20 Transfer for USDT/USDG (addresses from env) in/out of registered wallets, native OKB balance snapshots, per-tx gas. Ledger schema: `wallets`, `transfers`, `gas_spend`, `balance_snapshots`, `counterparty_tags`.
3. `apps/treasury`: MCP server exposing exactly the five tools in INTERFACES.md, including the EIP-191 `register_wallet` challenge flow (server-issued nonce, 10-minute expiry).
4. `packages/payment-adapter`: define the interface now (`requirePayment(tool, ctx)` inbound, `payAndCall(endpoint, tool, args, budgetCap)` outbound), implement a mock, then the real SDK once the human supplies docs. Nothing outside this package imports the SDK.
5. `packages/erc8004`: registry read clients (identity, reputation, transfer history) for Ethereum + Base, addresses from env. Hand to P2 by D3.

Definition of done for the D1 to D3 window: `wallet_with_history`-equivalent real wallet returns correct `get_revenue_report` numbers verified against a block explorer by hand; all five tools live behind mock charging; listing submission checklist written to your status file.

## I1 brief — The Firm

Mission: the six-node graph (`plan, source, diligence, procure, qa, assemble`) running end to end on `packages/mocks` from D1, swapping to live KYA/Treasury as they come up. Passing all three golden evals in `docs/PLAN.md` is your definition of done, not feature count.

Scope, in order:
1. `apps/firm` as a uv project. Pydantic models mirroring INTERFACES.md section 3 exactly.
2. LangGraph state machine with checkpointing after every node (port the checkpoint/retry patterns from Spawn via `packages/swarm-utils`; the human will give you the source path). Exception edges are first-class: `no_qualified_vendor` and `budget_breach` are demo features, not error handling.
3. Budget guards as middleware: hard per-task and per-vendor caps checked before every procurement call. This is what OKX listing review will probe on an autonomously-spending agent; make the guardrails visible and loggable.
4. Sourcing node: marketplace discovery if unknown 3 resolves positive, else the curated vendor registry (a checked-in JSON I2 helps you seed).
5. Diligence node: enforce DiligencePolicy exactly, including the attestation-fallback logging.
6. Assembly: ProvenanceAppendix complete per the golden eval, treasury statement fetched via `export_statement`.

Language note: if the human reports the A2A side of the Payment SDK is TypeScript-only, do not rewrite in TS. Design the thin TS gateway boundary, write its spec into your status file, and wait for human confirmation before building it.
