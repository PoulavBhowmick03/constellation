# PROMPTS.md — Kickoff prompts

Paste as the first message of each agent's session. Fill the `<...>` slots first. Re-anchor long-running agents each morning with: "Re-read docs/INTERFACES.md and docs/PLAN.md, then continue your workstream from docs/status/<ID>.md."

---

## P1 — Poulav's Claude Code (Treasury listing + real x402)

```
You are workstream P1 in this repo. Read CLAUDE.md, README.md, docs/INTERFACES.md, and docs/PLAN.md fully before any code. Your ownership boundaries and stop-and-ask rules in CLAUDE.md are absolute.

Mission: get Treasury Copilot's OKX.AI listing SUBMITTED as early as possible. Scaffolding, the indexer port, the five MCP tools, the EIP-191 register_wallet flow, mock charging (13/13 tests, local e2e smoke green), the Fly deploy artifacts, the on-chain-verified X Layer config, and the EIP-3009 settlement design are DONE — see docs/status/P1.md. The 24h review clock means every hour before submission counts.

FIRST, reconcile the tree: your deploy + real-x402 work (Dockerfile.treasury, fly.treasury.toml, verified USDT0/USDG addresses, packages/payment-adapter/src/x402.ts) is on branch migrate/celo and is NOT on main. main has no deployable Treasury. Merge/rebase that work onto main (or deploy from the branch and record which) before anything lists.

Context I owe you (fill/confirm before relying on it):
- Confirmed public Treasury endpoint URL (https://…/mcp): <fill — is the Fly deploy actually live? No status file records a URL yet>
- Real x402 shape captured from the OKX walkthrough vs the skill-documented PAYMENT-REQUIRED/PAYMENT-SIGNATURE/PAYMENT-RESPONSE shape: <fill>
- Agent ID (newAgentId from ASP registration): <fill — human-only, exists only after registration under your wallet>
- A real X Layer wallet to hand-verify against OKLink: <fill>

Today, in order:
1. Merge the deploy+x402 branch onto main; finish real EIP-3009 `exact` settlement in packages/payment-adapter/src/x402.ts (payer signs transferWithAuthorization, funds move payer→payTo — the custodial facilitator settler stays rejected as non-custodial-violating).
2. Deploy: `fly deploy --config fly.treasury.toml` (release_command auto-migrates; secrets are the verified X Layer config). Confirm the endpoint is live and reachable; record the URL in docs/status/P1.md.
3. Support the human OKX walkthrough against the live endpoint; verify the real x402 surface; resolve the residual unknown (who redeems the EIP-3009 auth on-chain). Note findings in P1.md.
4. Flip Treasury from mock to real x402; re-run the end-to-end smoke against the live endpoint with a real (test-mode) payment. Wash-trading rule holds: no self-calls to inflate usage.
5. Index a real X Layer wallet and HAND-VERIFY get_revenue_report totals + by_counterparty against OKLink. Record wallet, block range, numbers in P1.md. Treasury DoD gate — do not let the listing claim verified numbers until this passes.
6. Once 1–5 are green and the Agent ID is captured: write the listing submission checklist to P1.md; hand to the human to submit (target: midday July 16 UTC so review clears before July 17 23:59 UTC).

Open questions already in P1.md needing human sign-off before listing: the error envelope ({error:{code,message}} with codes BAD_SIGNATURE|NONCE_EXPIRED|BAD_REQUEST|WALLET_NOT_FOUND|PAYMENT_REQUIRED — INTERFACES only names the first two) and the two-phase register_wallet interpretation. See DOCSYNC.md for flagged INTERFACES drift.

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

Current state (docs/status/P2.md): the scoring engine (four weighted components, six flag thresholds), fixture-backed handlers for all four KYA tools gated through packages/payment-adapter, and 15 tests are DONE and green. attest_agent already degrades to check_agent pricing with zk.available:false reason "roadmap". Fixtures: agent_good 86/no-flags, agent_transferred_identity 67/IDENTITY_TRANSFERRED_RECENTLY, agent_sybil_burst 49/REVIEWER_CONCENTRATION+BURST_FEEDBACK. No live-chain collector, no MCP transport, no ZK. KYA is CONDITIONAL — it only lists if Treasury is live+approved with genuine slack before July 17 23:59 UTC (PLAN.md gate G2). Do not assume KYA ships; if Treasury needs help, Treasury wins.

Open item to fix IF/WHEN KYA proceeds (blocks listing, not fixtures): confirm every declared golden fixture score equals the weighted sum of its component scores, and that every flag fires on the intended fixture. Add/keep tests asserting declared_score == weighted_component_sum for each fixture. Then get both humans to sign off on the per-component point rubric documented in apps/kya/README.md — INTERFACES.md fixes weights + flag thresholds but NOT the internal rubric, so it's an unfrozen decision (see DOCSYNC.md).

If KYA proceeds, in order:
1. Reconcile the score/flag check above; land rubric sign-off.
2. Wire live evidence: packages/erc8004 (already built by P1) supplies the reads. Implement the live collector without modifying P1's package. ERC-8004 registry addresses for Ethereum + Base and X Layer availability are still unverified — use env + TODO(unverified), never guess.
3. packages/zk from CredAttest stays DEFERRED to the writeup (tiny model, EZKL circuit, Groth16/BN254, generated verifier, Foundry deploy — humans run deploys, never you, never CI). A single demonstrable proof for the roadmap link, not a per-call feature. Timebox hard; if it fights, it stays a slide and KYA ships heuristic-only.

Confirm the request-shape assumption (P2.md Q4): check_agent and attest_agent take the same {agent_ref} request as get_flags — INTERFACES §2 only states it explicitly for get_flags. End every session with Done/Blocked/Next/Questions in docs/status/P2.md.
```

---

## I1 — Ishita's Claude Code (The Firm) — DORMANT

The Firm is narrative-only under the current plan. **Do not start this workstream.** Ishita's active hackathon workstream is **I2 (mocks/evals, Codex)** below, which is the higher-leverage job right now. If Treasury and KYA both ship clean and early and both humans agree to activate The Firm (see PLAN.md "The Firm activation"), the original I1 prompt is preserved in the earlier constellation-docs.zip and can be revived then. Until an explicit human GO, this slot stays empty.

Ishita: run **I2** as your primary. If you have a second Claude Code seat idle, the most useful thing it can do for the submission is pair with P1 on Treasury (indexer verification, report formatting, the demo scenario runner) — coordinate with Poulav rather than opening a new lane.

---

## I2 — Ishita's Codex (mocks, evals, demo harness)

```
You are workstream I2 in this repo. Read AGENTS.md, README.md, docs/INTERFACES.md, and docs/PLAN.md fully before any code. Ownership boundaries and stop-and-ask rules in AGENTS.md are absolute.

Current state (docs/status/I2.md): DONE and passing — packages/mocks (mock MCP server + golden fixtures, 4 tests), tests/ (three golden Firm evals: diligence rejection, budget halt, provenance completeness, 3 tests), tools/demo (CLI scenario runner). Priority has since shifted: Treasury (P1) is the keystone and its listing is the only hard deadline. Your mocks/evals are no longer on the critical path; the Treasury demo is recorded directly against the live endpoint.

Now, in order:
1. Highest-leverage help right now — the AG1 dashboard (apps/dashboard, built) renders SIMULATED data ("PROOF VERIFIED"/"SETTLED"/x402 explorer links from fixtures + simulation scenarios) as if real. That's a correctness/integrity blocker for any recording. Coordinate with AG1 (whose lane apps/dashboard is): either wire it to real read endpoints or clearly label it SIMULATED before ANY demo. Also confirm/fix the reported frozen-lockfile install bug. Do NOT edit apps/dashboard yourself if AG1 is active — pair, don't collide.
2. Once Treasury is live: point demo prep at the REAL deployment — the Treasury demo runs against the live https://…/mcp with real X Layer data, not mocks. This is higher-leverage than more mock work.
3. Keep mocks/evals in lockstep with any schema change: if INTERFACES.md version bumps or P1 changes Treasury's error envelope/report formatting, your mock outputs update in the same PR. Schema drift between mocks and INTERFACES.md is a build-stopping bug.

End every session by appending Done/Blocked/Next/Questions to docs/status/I2.md.
```

---

## AG1 — Antigravity (OPTIONAL demo dashboard; only on written GO)

```
You are workstream AG1 in this repo. This project does not assume you auto-load any config: explicitly read AGENTS.md, README.md, docs/INTERFACES.md, and docs/PLAN.md now, and treat the AG1 brief in AGENTS.md as binding.

Precondition: GO must be present in docs/status/AG1.md. GO was recorded and apps/dashboard is already scaffolded and builds. Do NOT expand scope or add features on the assumption of continued GO — the listing clock outranks the dashboard, and any NEW scope needs a human to confirm GO still stands. If asked to expand, ask first.

TWO KNOWN BUGS must be fixed BEFORE any further dashboard feature work (both blockers, not polish):
1. Fabricated data shown as real: the dashboard renders "PROOF VERIFIED" / "SETTLED" / x402 explorer-link content driven by fixtures and simulation scenarios, presented as if genuine. This is a correctness/integrity issue — nothing may be recorded while simulated content reads as real. Either wire it to the real Treasury/KYA read endpoints, or clearly and visibly label it SIMULATED. AG1.md does not record this as fixed; treat it as OPEN.
2. The reported frozen-lockfile install bug — confirm and fix so the app installs cleanly. AG1.md does not record this as fixed; treat it as OPEN.

Mission (maintenance, after the two fixes): apps/dashboard is a read-only Next.js viewer that makes the demo legible — KYA report cards with score breakdowns and flags, payment receipts with REAL X Layer explorer links (no fabrication), rendered treasury statement, and (narrative only) a Firm run timeline. Once Treasury is live, prefer real read endpoints over fixtures for anything shown on camera. No writes anywhere, no dependencies added to other packages, no edits outside apps/dashboard; bugs found elsewhere go in docs/status/AG1.md, not in patches. Optimize for screen-recording clarity: big type, one screen per demo beat. End the session by appending Done/Blocked/Next/Questions to docs/status/AG1.md.
```
