# PROMPTS.md — Kickoff prompts

Paste as the first message of each agent's session. Fill the `<...>` slots first. Re-anchor long-running agents each morning with: "Re-read docs/INTERFACES.md and docs/PLAN.md, then continue your workstream from docs/status/<ID>.md."

---

## P1 — Poulav's Claude Code (chain data + Treasury)

```
You are workstream P1 in this repo. Read CLAUDE.md, README.md, docs/INTERFACES.md, and docs/PLAN.md fully before any code. Your ownership boundaries and stop-and-ask rules in CLAUDE.md are absolute.

Mission: Treasury Copilot live and submitted for OKX.AI listing by end of July 9. It is the review probe for our other two entries, so schedule beats elegance.

Context you need from me now:
- LedgerForge indexer source: <path-or-repo-url>
- OKX Payment SDK docs: <paste-or-path>  (if I have not provided this yet, build payment-adapter against the mock implementation and list every assumption in docs/status/P1.md)
- X Layer RPC + USDT/USDG token addresses: <fill-or-mark-unverified>

Today (D1/D2), in order:
1. Scaffold the monorepo exactly per README.md (pnpm workspaces; apps/firm as an empty uv project stub).
2. Port the indexer: retarget to X Layer eip155:196, track ERC-20 Transfers for USDT/USDG on registered wallets, OKB balance snapshots, per-tx gas. Ledger schema per CLAUDE.md P1 brief. Migrations + docker compose for Postgres.
3. apps/treasury MCP server: the five tools from INTERFACES.md section 1, exactly, including the EIP-191 register_wallet nonce flow.
4. packages/payment-adapter: interface + mock implementation. Nothing outside this package may import the SDK, including your own code.
5. Verify get_revenue_report against a real X Layer wallet by hand against the explorer; record the wallet and numbers in docs/status/P1.md.

Rules that will get us disqualified if broken: read-only (no transaction-sending code), no invented addresses (env + TODO(unverified)), no secrets in the repo. End the session by appending Done/Blocked/Next/Questions to docs/status/P1.md.
```

---

## P2 — Poulav's Codex (KYA engine + ZK)

```
You are workstream P2 in this repo. Read AGENTS.md, README.md, docs/INTERFACES.md, and docs/PLAN.md fully before any code. Ownership boundaries and stop-and-ask rules in AGENTS.md are absolute.

Mission: build KYA's heuristic scoring engine so it is READY, but understand KYA is a CONDITIONAL fast-follow — it only lists if Treasury (P1) is live and clean by July 12/13 (see PLAN.md gates G1/G2). Do not assume KYA ships. The ZK tier is DEFERRED to the writeup by default: you produce a working proof to link as a roadmap item, NOT a listed product feature. If Treasury needs help, Treasury wins.

Context you need from me now:
- CredAttest EZKL pipeline source: <path-or-repo-url>
- ERC-8004 registry addresses for Ethereum + Base: <fill-or-mark-unverified; official EIP-8004 references are the source of truth>
- Note: registration on OKX uses OKX Agent Identity, not a BYO ERC-8004 identity. KYA READS ERC-8004 as a data source; it is not our identity primitive. Confirm whether ERC-8004 exists on X Layer (unknown) — if not, read cross-chain from Ethereum/Base.

Today (D1/D2), in order:
1. apps/kya scoring engine: four components, six flags, weights exactly per INTERFACES.md section 2, as pure functions over an AgentEvidence struct. Unit tests against the golden fixtures BEFORE any chain code. agent_transferred_identity must trip IDENTITY_TRANSFERRED_RECENTLY with correct evidence; agent_sybil_burst must score below 50. This is the whole differentiator — explainable score + identity-transfer flag — so make it clean.
2. Only after the engine is solid: begin packages/zk from CredAttest (tiny model, EZKL circuit, Groth16/BN254, generated verifier, Foundry deploy script — humans run deploys, never you, never CI). Target is a single demonstrable proof for the writeup, not a per-call production feature. Timebox hard; if it fights, it stays a roadmap slide and KYA ships heuristic-only.
3. Stub the MCP server for the four KYA tools with charging via packages/payment-adapter (import only). attest_agent returns zk.available:false by default.

packages/erc8004 arrives from P1 around July 9 IF KYA proceeds; until then everything runs on fixtures. Do not block on it. End every session with Done/Blocked/Next/Questions in docs/status/P2.md.
```

---

## I1 — Ishita's Claude Code (The Firm) — DORMANT

The Firm is narrative-only under the current plan. **Do not start this workstream.** Ishita's active hackathon workstream is **I2 (mocks/evals, Codex)** below, which is the higher-leverage job right now. If Treasury and KYA both ship clean and early and both humans agree to activate The Firm (see PLAN.md "The Firm activation"), the original I1 prompt is preserved in the earlier constellation-docs.zip and can be revived then. Until an explicit human GO, this slot stays empty.

Ishita: run **I2** as your primary. If you have a second Claude Code seat idle, the most useful thing it can do for the submission is pair with P1 on Treasury (indexer verification, report formatting, the demo scenario runner) — coordinate with Poulav rather than opening a new lane.

---

## I2 — Ishita's Codex (mocks, evals, demo harness)

```
You are workstream I2 in this repo. Read AGENTS.md, README.md, docs/INTERFACES.md, and docs/PLAN.md fully before any code. Ownership boundaries and stop-and-ask rules in AGENTS.md are absolute.

Mission: everyone else's velocity. I1 can only work today because your mocks exist; The Firm only ships on July 13 if your evals pass it.

Today (D1/D2), in order:
1. packages/mocks: an MCP server implementing EVERY tool in INTERFACES.md with identical schemas, switched by MOCK_MODE=1, serving the four golden fixtures (agent_good, agent_transferred_identity, agent_sybil_burst, wallet_with_history). Include both attest_agent shapes (zk available true and false). Make fixture numbers internally consistent: the sybil fixture's top-3 reviewer share must actually exceed 0.60, the transferred-identity fixture's feedback timestamps must predate its transfer.
2. tests/: the three golden eval tasks from docs/PLAN.md as one-command automated checks against The Firm (diligence rejection, budget halt, provenance completeness). These gate the Firm's listing submission on July 13.
3. tools/demo: a scenario runner that executes the demo spine and pretty-prints the run (task, plan, per-vendor KYA verdicts, payments with references, assembled memo) cleanly enough to screen-record as-is.

Schema drift between your mocks and INTERFACES.md is a build-stopping bug; if the schema file version bumps, your update ships in the same PR. End the session by appending Done/Blocked/Next/Questions to docs/status/I2.md.
```

---

## AG1 — Antigravity (OPTIONAL demo dashboard; only on written GO)

```
You are workstream AG1 in this repo. This project does not assume you auto-load any config: explicitly read AGENTS.md, README.md, docs/INTERFACES.md, and docs/PLAN.md now, and treat the AG1 brief in AGENTS.md as binding.

Precondition: a human has written GO in docs/status/AG1.md. If that line is absent, stop and say so.

Mission: apps/dashboard, a read-only Next.js viewer that makes our three 90-second demo videos legible: Firm run timeline with nodes lighting up as they execute, KYA report cards with score breakdowns and flags, payment receipts with X Layer explorer links, rendered treasury statement. Data sources: The Firm's run-log JSON and the read endpoints of KYA/Treasury. No writes anywhere, no dependencies added to other packages, no edits outside apps/dashboard; bugs found elsewhere go in docs/status/AG1.md, not in patches. Optimize for screen-recording clarity over feature count: big type, one screen per demo beat. End the session by appending Done/Blocked/Next/Questions to docs/status/AG1.md.
```
