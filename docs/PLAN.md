# PLAN.md — July 7 to July 17, 2026 (Treasury-as-keystone)

Deadline: Google form by **July 17, 23:59 UTC**. The real deadline is earlier: the ASP must pass OKX listing review (**up to 24h after listing**) and be live. **Submit Treasury's listing as early as possible — with ~2.5 days left, the 24h review clock is now the single tightest constraint in the plan. It outranks demo polish, KYA, and everything narrative.**

Strategy (unchanged): ONE complete, listed, used product (Treasury Copilot) beats three half-built ones. KYA is a conditional fast-follow; The Firm is narrative. Do not let B or A steal hours from getting Treasury's listing submitted.

Workstreams: P1 (Poulav, Claude Code), P2 (Poulav, Codex), I2 (Ishita, Codex), I1 (Ishita, Claude Code — DORMANT until activated), AG1 (Antigravity — optional, GO given).

## Where we actually are (as of Wed July 15, ~D9)

Ground truth is `docs/status/{P1,P2,I1,I2,AG1}.md`. Reconciled state:

- **Treasury (apps/treasury): feature-complete behind mock charging** — all five INTERFACES.md tools, two-phase EIP-191 `register_wallet` (server nonce, 10-min TTL, burn-on-attempt), Postgres wiring, 13/13 unit tests, full local end-to-end smoke green. This is on `main`.
- **⚠️ Deploy + real-x402 work is NOT on `main` yet — it lives on P1's unmerged branch.** `main` has **no** `Dockerfile.treasury`, `fly.treasury.toml`, or verified X Layer addresses, so Treasury is **not deployable from `main` as-is**. P1's active workspace (branch `migrate/celo`, also pushed to `origin/migrate/celo`) holds: the Fly/Docker deploy artifacts (locally docker-verified: `/health` = `{status:ok,tools:5}`, MCP `initialize` OK), the **on-chain-verified X Layer config**, the documented x402 server shape, and in-progress **real EIP-3009 `exact` settlement** (`packages/payment-adapter/src/x402.ts`). **Step zero for the humans: merge/rebase P1's deploy+x402 work onto `main` (or deploy from that branch) — nothing lists until this is reconciled.**
- **Verified X Layer config (on-chain `eth_call`, chainId 196; on P1's branch, not `main`):** RPC `https://rpc.xlayer.tech`; USDT0 `0x779Ded0c9e1022225f8E0630b35a9b54bE713736` (6 dec, OKX `exact` rail); USDG `0x4ae46a509f6b1d9056937ba4500cb143933d2dc8` (6 dec, `aggr_deferred` rail). Set as Fly secrets, never committed.
- **Settlement decision (P1, on branch):** the harvested custodial `facilitator` settler is **rejected** (hot wallet + escrow + OKB gas violates Treasury's non-custodial rule). Correct path is `exact` = EIP-3009 `transferWithAuthorization` (payer signs, funds move payer→payTo directly). This is being implemented in `packages/payment-adapter/src/x402.ts`.
- **Live deploy: OPEN ITEM.** The session lead reports the Fly deploy is live, but no status file records a public URL, and the deploy artifacts aren't on `main`. **Treat "endpoint is live and reachable" as unconfirmed until a human records the URL in `P1.md`.**
- **packages/indexer** (X Layer port, 8/8 tests), **packages/erc8004** (ERC-721 identity client + `ABI_UNVERIFIED` reputation stub, 4/4 tests), **packages/payment-adapter** (mock done; real `sdk`/x402 mode in progress on branch).
- **KYA (apps/kya): fixture-only, on `main`.** Scoring core + four transport-neutral handlers, 15 tests. Fixtures: `agent_good` 86/no-flags, `agent_transferred_identity` 67/`IDENTITY_TRANSFERRED_RECENTLY`, `agent_sybil_burst` 49/`REVIEWER_CONCENTRATION`+`BURST_FEEDBACK`. No live-chain collector, no MCP transport. Open scoring/rubric sign-off (gate G2, below).
- **I2 (mocks/evals/demo): DONE on `main`.** `packages/mocks` (mock MCP server + golden fixtures, 4 tests), `tests/` (three golden Firm evals: diligence rejection, budget halt, provenance completeness, 3 tests), `tools/demo` (CLI scenario runner). All build + pass locally.
- **AG1 (apps/dashboard): built on `main`, GO given.** Next.js viewer with Treasury/KYA/Firm/payment tabs, production build verified. **⚠️ Integrity issue (from audit, NOT recorded as fixed in `AG1.md`): the dashboard renders simulated data — "PROOF VERIFIED"/"SETTLED"/x402 explorer links driven by fixtures + simulation scenarios — as if real.** This must be wired to real read endpoints or clearly labeled **SIMULATED before any demo recording** — treat as a correctness/integrity blocker, not cosmetic. A reported frozen-lockfile install bug is likewise unconfirmed-fixed. Both are OPEN until `AG1.md` records a fix.
- **The Firm (apps/firm): DORMANT** — uv stub only, no GO in any status file. Do not change.

## The listing flow (human-gated, run FIRST — this is the critical path now)

Most of the x402 surface is already discovered (see `P1.md` on the branch): paid endpoint answers **HTTP 402** with header `PAYMENT-REQUIRED` = base64 JSON `{x402Version:2, resource, accepts:[{scheme:"exact", network:"eip155:196", asset:<USDT0>, payTo:<wallet>, maxAmountRequired, extra}]}`; inbound payment on `PAYMENT-SIGNATURE` (v2) / `X-PAYMENT` (v1); success → 200 + `PAYMENT-RESPONSE`. ASP registers as service type **A2MCP**, fees in USDT digits-only (`"0.1"/"0.1"/"0.2"`), endpoint must be public `https://`, permanent on-chain. **Agent ID = `newAgentId`** from `onchainos agent create`, only produced after the human registers under their logged-in wallet.

Still required, all human-only:
0. **Merge P1's deploy+x402 branch onto `main`** (step zero above) so a deployable Treasury exists in the canonical repo.
1. Confirm the deployed `https://…/mcp` endpoint is live and reachable; record the URL in `P1.md`.
2. Run the OKX walkthrough against the live endpoint; confirm the real 402/x402 shape matches (**residual unknown: server-side settle of the EIP-3009 authorization**).
3. Register the A2MCP ASP with the deployed URL and **capture the Agent ID**.

## Day by day (compressed to the runway that's left)

The original D1–D11 calendar is collapsed. What matters now is the ordered critical path, front-loaded so the 24h review clock starts as early as possible.

**Wed Jul 15 (today) — converge the code, get the endpoint provably live.**
- Humans/P1: merge P1's `migrate/celo` deploy+x402 work onto `main`. Finish real EIP-3009 `exact` settlement in `packages/payment-adapter/src/x402.ts`.
- P1/human: `fly deploy --config fly.treasury.toml` (release_command auto-migrates; secrets are the verified X Layer config). Confirm live URL → `P1.md`.
- P1/human: run the OKX walkthrough against the live endpoint; capture the real x402 shape and the **Agent ID** → `P1.md`.

**Wed Jul 15 evening → Thu Jul 16 morning — hand-verify + real charging.**
- P1: index one real X Layer wallet; **hand-verify `get_revenue_report` totals + `by_counterparty` against OKLink**. Record wallet, block range, numbers in `P1.md`. Treasury DoD gate — do not submit claiming verified numbers until this passes.
- P1: flip Treasury from mock to real x402; re-run the end-to-end smoke against the live endpoint with a real (test-mode) payment. Wash-trading rule holds — no self-calls to pump usage.

**GATE G1 — Thu Jul 16, target ~12:00 UTC: SUBMIT TREASURY FOR LISTING.**
- Precondition: branch merged, live endpoint reachable, real charging wired, revenue hand-verified, Agent ID captured. Submitting by midday Jul 16 leaves the full 24h review window before the Jul 17 23:59 UTC deadline.
- If any precondition is unmet, **that is the whole hackathon** — drop KYA, demo polish, everything else and close it. Do not start KYA.
- The moment the listing is submitted, the 24h clock is running.

**Thu Jul 16 afternoon — demo + submission assets (parallel to review).**
- Record the Treasury demo (≤90s) against the live endpoint with real X Layer data. If the AG1 dashboard is used on camera, its fabricated-data issue MUST be fixed or labeled SIMULATED first (see above).
- Draft the X thread (#OKXAI) and Google form answers. Fill the Agent ID.

**GATE G2 — Fri Jul 17 morning: is Treasury APPROVED and getting real calls?**
- If YES and clean AND there is genuine slack before 23:59 UTC: KYA *may* proceed heuristic-only. Blocking pre-req: land the KYA rubric sign-off and confirm each fixture's declared score reconciles with its weighted component sum and every flag fires (see `P2.md` and DOCSYNC.md). P1 hands `packages/erc8004` to P2; P2 wires live reads. Realistically this window is thin — KYA listing is upside, not a target.
- If NO (still in review, or issues): all hands on the Treasury submission + demo. KYA does not ship. A complete, valid outcome.

**Fri Jul 17, by 23:59 UTC — submit the Google form(s). Do not wait.**
- Submit Treasury's form as soon as the listing is approved (or at the latest safe moment if review is still pending). Post the X thread.

## Cut order (fixed)
1. AG1 dashboard (built, but demo-optional; fix the integrity issue or don't put it on camera).
2. The Firm (narrative-only; never enters the build unless Treasury AND KYA are done and clean with slack to spare).
3. KYA entirely (Treasury alone is a valid, complete submission).
4. KYA's ZK tier (already deferred to writeup by default).
5. Never cut: Treasury shipping, its listing submission, the x402 integration, the wash-trading rule.

## The Firm activation (explicit, unlikely)
Only if Treasury is live+used AND KYA is live+clean AND both humans agree there is genuine slack. Then I1 wakes from PROMPTS.md. With ~2.5 days and the review clock dominating, the default expectation is firmly: this does not happen, and The Firm stays a demo slide. By design.

## Golden evals (I2 owns — BUILT and passing on `main`)
- Treasury (must pass before G1 listing): revenue report numbers match a hand-verified real wallet (P1's OKLink check above); runway math correct; export produces valid csv/json/md. I2's fixtures back these; the live hand-verification is still P1's gate.
- The Firm evals (`tests/`, 3 passing): diligence rejection, budget halt, provenance completeness — deterministic scenario-runner gates for if/when The Firm is activated.
- KYA (only if it proceeds, before G2): `agent_transferred_identity` trips `IDENTITY_TRANSFERRED_RECENTLY`; `agent_sybil_burst` scores < 50 with `REVIEWER_CONCENTRATION`+`BURST_FEEDBACK`; every component returns evidence; declared score == weighted component sum for every fixture.

## Demo scenario
Treasury (the submission): an ASP owner asks "how much did I make this week, from whom, and what's my runway." Clean report on camera, real X Layer data, live endpoint.
KYA (if live): catching a bought (transferred) identity before a hire.
The Firm (narrative only): a slide showing the vision — an agent that runs KYA before it pays, with a provenance appendix. Spoken, not necessarily built.
