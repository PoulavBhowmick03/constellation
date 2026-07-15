# PROMPTS.md — Kickoff prompts

Paste as the first message of each agent's session. Fill the `<...>` slots first. Re-anchor long-running agents each morning with: "Re-read docs/INTERFACES.md and docs/PLAN.md, then continue your workstream from docs/status/<ID>.md."

---

## P1 — Poulav's Claude Code (Treasury listing + real x402)

```
You are workstream P1 in this repo. Read CLAUDE.md, README.md, docs/INTERFACES.md, and docs/PLAN.md fully before any code. Your ownership boundaries and stop-and-ask rules in CLAUDE.md are absolute.

Mission: get Treasury Copilot's OKX.AI listing SUBMITTED as early as possible. Scaffolding, the indexer port, the five MCP tools, the EIP-191 register_wallet flow, mock charging, and the Fly deploy artifacts are DONE (13/13 tests, local end-to-end smoke green — see docs/status/P1.md). What's left is the human-gated critical path plus the real x402 swap, and the 24h review clock means every hour before submission counts.

Context I owe you (fill/confirm before you rely on any of it):
- Confirmed public Treasury endpoint URL (https://…/mcp): <fill — is the Fly deploy actually live? P1.md's last entry still lists all 5 deploy steps as pending; confirm before assuming>
- Real x402 request/response shape captured from the OKX walkthrough against the live endpoint (does it match the skill-documented PAYMENT-REQUIRED / PAYMENT-SIGNATURE / PAYMENT-RESPONSE shape in P1.md?): <fill>
- Agent ID (newAgentId from ASP registration): <fill — human-only, only exists after registration under your wallet>
- A real X Layer wallet to hand-verify against OKLink: <fill>

Today, in order:
1. Confirm the deployed endpoint is live and reachable; record the URL in docs/status/P1.md. If it is not deployed yet, that is priority zero — deploy is `fly deploy --config fly.treasury.toml` (release_command auto-migrates); secrets are the verified X Layer config already in P1.md.
2. Support the human OKX walkthrough against the live endpoint: verify the real x402 surface matches the documented shape, and resolve the residual unknown (server-side settle — who redeems the EIP-3009/Permit2 auth). Note findings in P1.md.
3. Implement real payment-adapter `sdk` mode to the confirmed x402 shape — ONLY inside packages/payment-adapter. Flip Treasury from mock to real charging; re-run the end-to-end smoke against the live endpoint with a real (test-mode) payment. Wash-trading rule holds: no self-calls to inflate usage.
4. Index a real X Layer wallet and HAND-VERIFY get_revenue_report totals + by_counterparty against OKLink. Record wallet, block range, and numbers in P1.md. This is the Treasury DoD gate — do not let the listing go out claiming verified numbers until this passes.
5. Once 1–4 are green and the Agent ID is captured: write the listing submission checklist to P1.md and hand off to the human to submit (target: by midday July 16 UTC so review clears before the July 17 23:59 UTC deadline).

Open questions already logged in P1.md that need human sign-off before listing: the error envelope shape ({error:{code,message}} with codes BAD_SIGNATURE|NONCE_EXPIRED|BAD_REQUEST|WALLET_NOT_FOUND|PAYMENT_REQUIRED — INTERFACES only names the first two) and the two-phase register_wallet interpretation. See DOCSYNC.md for the flagged INTERFACES drift.

Rules that get us disqualified if broken: read-only (no transaction-sending code outside packages/payment-adapter), no invented addresses (env + TODO(unverified)), no secrets in the repo. End the session by appending Done/Blocked/Next/Questions to docs/status/P1.md.
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

Current state (from docs/status/P2.md): the scoring engine (four weighted components, six flag thresholds), fixture-backed handlers for all four KYA tools gated through packages/payment-adapter, and 15 tests are DONE and green. attest_agent already degrades to check_agent pricing with zk.available:false reason "roadmap". No live-chain collector, no MCP transport, no ZK yet. KYA is a CONDITIONAL fast-follow — it only lists if Treasury is live+approved with genuine slack before July 17 23:59 UTC (PLAN.md gate G2). Do not assume KYA ships; if Treasury needs help, Treasury wins.

Open item to fix IF/WHEN KYA proceeds (blocks listing, not fixtures): a reported scoring discrepancy — declared golden fixture scores may not match the weighted sum of their component scores, and every flag must be confirmed to fire on the right fixture (P2.md records agent_sybil_burst = 49 with REVIEWER_CONCENTRATION + BURST_FEEDBACK; verify that holds and that no flag is silently missing). Fix the fixtures/rubric so declared scores and component sums reconcile, and get both humans to sign off on the per-component point rubric documented in apps/kya/README.md (INTERFACES.md fixes weights + flag thresholds but NOT the internal rubric — this is an unfrozen decision, see DOCSYNC.md). Add/keep tests that assert the declared score equals the weighted component sum for every fixture.

If KYA proceeds, in order:
1. Reconcile the scoring discrepancy above; land rubric sign-off.
2. Wire live evidence: packages/erc8004 arrives from P1 IF KYA proceeds. Implement the live collector without modifying P1's package. ERC-8004 registry addresses for Ethereum + Base and X Layer availability are still unverified — use env + TODO(unverified), never guess.
3. packages/zk from CredAttest stays DEFERRED to the writeup (tiny model, EZKL circuit, Groth16/BN254, generated verifier, Foundry deploy — humans run deploys, never you, never CI). A single demonstrable proof for the roadmap link, not a per-call feature. Timebox hard; if it fights, it stays a slide and KYA ships heuristic-only.

Confirm request-shape assumption (P2.md Q4): check_agent and attest_agent take the same {agent_ref} request as get_flags — INTERFACES §2 only states it explicitly for get_flags. End every session with Done/Blocked/Next/Questions in docs/status/P2.md.
```

---

## I1 — Ishita's Claude Code (The Firm) — DORMANT

The Firm is narrative-only under the current plan. **Do not start this workstream.** Ishita's active hackathon workstream is **I2 (mocks/evals, Codex)** below, which is the higher-leverage job right now. If Treasury and KYA both ship clean and early and both humans agree to activate The Firm (see PLAN.md "The Firm activation"), the original I1 prompt is preserved in the earlier constellation-docs.zip and can be revived then. Until an explicit human GO, this slot stays empty.

Ishita: run **I2** as your primary. If you have a second Claude Code seat idle, the most useful thing it can do for the submission is pair with P1 on Treasury (indexer verification, report formatting, the demo scenario runner) — coordinate with Poulav rather than opening a new lane.

---

## I2 — Ishita's Codex (mocks, evals, demo harness)

```
You are workstream I2 in this repo. Read AGENTS.md, README.md, docs/INTERFACES.md, and docs/PLAN.md fully before any code. Ownership boundaries and stop-and-ask rules in AGENTS.md are absolute.

Mission: everyone else's velocity. But note the priority has shifted — Treasury (P1) is the keystone and its listing is the only hard deadline. Your mocks/evals are no longer on the critical path; the Treasury demo is recorded directly against the live endpoint.

Reality check before you start (verified by the DOC-SYNC pass, see DOCSYNC.md): as of July 15, packages/mocks, tests/, tools/demo, and docs/status/I2.md DO NOT EXIST in this repo, despite earlier claims they were built and passing. Treat them as not-started. Treasury's DoD is currently met by P1's hand-verification against OKLink plus its 13/13 in-package tests, not by an eval harness. Do not assume any of your prior deliverables are present — check the repo first.

In order, if I2 proceeds:
1. Dashboard integrity + install (cross-cutting, shared with AG1 who owns apps/dashboard — coordinate, don't duplicate): the demo dashboard displays fabricated "PROOF VERIFIED" / "SETTLED" / fake explorer-link content as if real. This is a correctness/integrity blocker, not cosmetic — it must be fixed or clearly labeled SIMULATED before ANY demo recording. Also fix the broken frozen-lockfile install. NOTE: apps/dashboard is not present in this repo (the only dashboard here is the legacy root ./dashboard @ledgerforge, a different LedgerForge lineage, out of the pnpm workspace). Confirm which dashboard the fix applies to before touching anything.
2. Once Treasury is live: point demo prep at the REAL deployment, not mocks — record the Treasury demo against the live https://…/mcp endpoint with real X Layer data. This is higher-leverage than building a mock harness now.
3. Only if there's slack and KYA/Firm work resumes: packages/mocks (every INTERFACES.md tool, identical schemas, MOCK_MODE=1, four golden fixtures agent_good / agent_transferred_identity / agent_sybil_burst / wallet_with_history, both attest_agent shapes; internally consistent numbers — sybil top-3 reviewer share > 0.60, transferred-identity feedback timestamps predate the transfer); tests/ (the three golden Firm evals); tools/demo (scenario runner).

Schema drift between any mocks you build and INTERFACES.md is a build-stopping bug; if the schema version bumps, your update ships in the same PR. End the session by appending Done/Blocked/Next/Questions to docs/status/I2.md (create it — it does not exist yet).
```

---

## AG1 — Antigravity (OPTIONAL demo dashboard; only on written GO)

```
You are workstream AG1 in this repo. This project does not assume you auto-load any config: explicitly read AGENTS.md, README.md, docs/INTERFACES.md, and docs/PLAN.md now, and treat the AG1 brief in AGENTS.md as binding.

Precondition (HARD): a human must have written GO in docs/status/AG1.md. As of July 15 that file does not exist and no GO has been given — ASK the human to confirm GO explicitly; do not assume it. The dashboard is FIRST CUT in the plan and the listing clock outranks it. If GO is absent, stop and say so.

Two known bugs must be fixed BEFORE any further dashboard feature work (both are blockers, not polish):
1. Fabricated data shown as real: the dashboard displays "PROOF VERIFIED" / "SETTLED" / fake explorer-link content as if genuine. This is a correctness/integrity issue — nothing may be recorded for a demo while unverified content reads as real. Either wire it to real read endpoints or clearly label it SIMULATED.
2. Broken frozen-lockfile install — fix so the app installs cleanly.

Also note: apps/dashboard does not currently exist in this repo (the only dashboard present is the legacy root ./dashboard @ledgerforge, a different LedgerForge lineage that is NOT in the Constellation pnpm workspace). Confirm with the human whether you are creating apps/dashboard fresh or reworking that legacy app before you touch anything, and record the answer in docs/status/AG1.md.

Mission (only after GO + the two fixes): apps/dashboard, a read-only Next.js viewer that makes the demo legible — KYA report cards with score breakdowns and flags, payment receipts with REAL X Layer explorer links (no fabrication), rendered treasury statement, and (narrative only) a Firm run timeline. Data sources: the read endpoints of the live Treasury/KYA, and run-log JSON if The Firm is ever built. No writes anywhere, no dependencies added to other packages, no edits outside apps/dashboard; bugs found elsewhere go in docs/status/AG1.md, not in patches. Optimize for screen-recording clarity: big type, one screen per demo beat. End the session by appending Done/Blocked/Next/Questions to docs/status/AG1.md (create it).
```
