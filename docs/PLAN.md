# PLAN.md — July 7 to July 17, 2026 (Treasury-as-keystone)

Deadline: Google form by **July 17, 23:59 UTC**. The real deadline is earlier: the ASP must pass OKX listing review (**up to 24h after listing**) and be live. **Submit Treasury's listing as early as possible — with ~2.5 days left, the 24h review clock is now the single tightest constraint in the plan. It outranks demo polish, KYA, and everything narrative.**

Strategy (unchanged): ONE complete, listed, used product (Treasury Copilot) beats three half-built ones. KYA is a conditional fast-follow; The Firm is narrative. Do not let B or A steal hours from getting Treasury's listing submitted.

Workstreams: P1 (Poulav, Claude Code), P2 (Poulav, Codex), I2 (Ishita, Codex), I1 (Ishita, Claude Code — DORMANT until activated), AG1 (Antigravity — optional, not GO).

## Where we actually are (as of Wed July 15, ~D9)

Ground truth is `docs/status/P1.md` and `docs/status/P2.md`. Reconciled repo state:

- **Treasury (apps/treasury): feature-complete behind mock charging.** All five INTERFACES.md tools, two-phase EIP-191 `register_wallet` (server nonce, 10-min TTL, burn-on-attempt), Postgres wiring, 13/13 unit tests, and a full local end-to-end smoke (initialize → register → free runway → `PAYMENT_REQUIRED` → paid report → CSV export) all green.
- **Deploy artifacts built and locally verified:** `Dockerfile.treasury`, `fly.treasury.toml` (auto-migrating `release_command`), `.dockerignore`. `docker build` → `docker run` → `/health` = `{status:ok,tools:5}` and MCP `initialize` handshake pass inside the container.
- **Live deploy: OPEN ITEM.** The session lead reports the Fly deploy is live, but `docs/status/P1.md`'s latest entry still lists all five deploy steps (fly auth, provision Postgres, set secrets, `fly deploy`, register ASP) as human-gated and does not record a live deploy. **Treat "endpoint is live and reachable" as unconfirmed until P1.md (or a human) records the public URL.** First action below resolves this.
- **Verified X Layer config (on-chain `eth_call`, chainId 196):** RPC `https://rpc.xlayer.tech`; USDT0 `0x779Ded0c9e1022225f8E0630b35a9b54bE713736` (6 dec, OKX `exact` settlement rail); USDG `0x4ae46a509f6b1d9056937ba4500cb143933d2dc8` (6 dec, `aggr_deferred` rail). Set as Fly secrets, never committed.
- **packages/indexer:** X Layer port, schema + idempotent migrations, 8/8 money-math tests. **packages/payment-adapter:** `MockPaymentAdapter` + `createPaymentAdapter` that *throws* on `PAYMENT_MODE=sdk` (real x402 path is a deliberate stub, not yet implemented). **packages/erc8004:** ERC-721 identity read client + reputation stub (`ABI_UNVERIFIED`), 4/4 tests.
- **KYA (apps/kya): fixture-only.** Scoring core + four transport-neutral handlers, 15 tests, build green. No live-chain collector, no MCP transport. Open scoring question — see gate G2.
- **The Firm (apps/firm): DORMANT** — uv stub (`pyproject.toml`) only. No activation. Do not change.
- **NOT PRESENT in this repo (flagged, see DOCSYNC.md):** `packages/mocks`, `tests/` golden evals, `tools/demo`, `apps/dashboard`, and status files `I1.md` / `I2.md` / `AG1.md`. The "known facts" handed to this doc-sync session claimed these were built and passing; the repo and P1.md contradict that. **Do not plan as if I2's mocks/evals/demo harness or AG1's dashboard exist.** The Treasury demo can be recorded directly against the live endpoint without them.

## The listing flow (human-gated, run FIRST — this is the whole critical path now)

Most of the x402 surface is already discovered from the installed `okx-agent-payments-protocol` skill (see P1.md): our paid endpoint answers **HTTP 402** with header `PAYMENT-REQUIRED` = base64 JSON `{x402Version:2, resource, accepts:[{scheme:"exact", network:"eip155:196", asset:<USDT0>, payTo:<wallet>, maxAmountRequired, extra}]}`; inbound payment on `PAYMENT-SIGNATURE` (v2) / `X-PAYMENT` (v1); success → 200 + `PAYMENT-RESPONSE`. ASP registers as service type **A2MCP**, fees in USDT digits-only (`"0.1"/"0.1"/"0.2"`), endpoint must be public `https://`, permanent on-chain. **Agent ID = `newAgentId`** from `onchainos agent create`, only produced after the human registers under their logged-in wallet.

Still required, all human-only:
1. Confirm the deployed `https://…/mcp` endpoint is live and reachable (resolves the OPEN ITEM above).
2. Run the OKX walkthrough against the live endpoint; confirm the real 402/x402 request/response shape matches what the skill documented (**residual unknown: server-side settle — who redeems the EIP-3009/Permit2 auth on-chain**).
3. Register the A2MCP ASP with the deployed URL and **capture the Agent ID** for the form.

## Day by day (compressed to the runway that's left)

The original D1–D11 calendar is collapsed. What matters now is the ordered critical path below, front-loaded so the 24h review clock starts as early as possible.

**Wed Jul 15 (today, afternoon/evening) — get the endpoint provably live + walkthrough.**
- P1/human: confirm live deploy (step 1 above); paste the public URL into P1.md. If not yet deployed, this is the top priority — `fly deploy --config fly.treasury.toml` (release_command auto-migrates), secrets already known.
- P1/human: run the OKX walkthrough against the live endpoint (steps 2–3). Capture the real x402 shape and the **Agent ID**. Record both in P1.md.
- P1: begin the real payment-adapter `sdk` mode against the confirmed x402 shape (only `packages/payment-adapter` may touch it).

**Wed Jul 15 evening → Thu Jul 16 morning — hand-verify + wire real charging.**
- P1: index one real X Layer wallet; **hand-verify `get_revenue_report` totals + `by_counterparty` against OKLink** by hand. Record the wallet, block range, and numbers in P1.md. This is a Treasury DoD gate — do not submit the listing claiming verified numbers until this passes.
- P1: finish payment-adapter `sdk` mode; flip Treasury from mock to real x402; re-run the end-to-end smoke against the live endpoint with a real (test-mode) payment. Wash-trading rule still applies — no self-calls to pump usage.

**GATE G1 — Thu Jul 16, target by ~12:00 UTC: SUBMIT TREASURY FOR LISTING.**
- Precondition: live endpoint reachable, real charging wired, revenue numbers hand-verified, Agent ID captured. Submitting by midday Jul 16 leaves the full 24h review window to clear before the Jul 17 23:59 UTC deadline.
- If any precondition is not met, **that is the whole hackathon** — drop KYA, demo polish, and everything else and close it. Do not start KYA.
- The moment the listing is submitted, the 24h clock is running; everything after this is done in the shadow of it.

**Thu Jul 16 afternoon — demo + submission assets (parallel to review).**
- Record the Treasury demo (≤90s) directly against the live endpoint: ASP owner asks "how much did I make this week, from whom, and what's my runway" → clean report on camera, real X Layer data. (No dependency on I2's demo harness, which is not in the repo.)
- Draft the X thread (#OKXAI) and the Google form answers. Fill the Agent ID.

**GATE G2 — Fri Jul 17 morning: is Treasury APPROVED and getting real calls?**
- If YES and clean AND there is genuine slack before 23:59 UTC: KYA *may* proceed heuristic-only. Blocking pre-req: resolve KYA's open scoring question first (declared golden scores vs. weighted component sums; confirm all six flags fire on the right fixtures — see `docs/status/P2.md` and DOCSYNC.md). P1 hands `packages/erc8004` to P2; P2 wires live reads. Realistically this window is thin — KYA listing is upside, not a target.
- If NO (still in review, or issues): all hands on the Treasury submission + demo. KYA does not ship. This is a fine, complete outcome.

**Fri Jul 17, by 23:59 UTC — submit the Google form(s). Do not wait.**
- Submit Treasury's form as soon as the listing is approved (or at the latest safe moment if review is still pending — a submitted form with a pending-approval listing beats missing the deadline). Post the X thread.

## Cut order (fixed)
1. AG1 dashboard (not in repo; not GO — see PROMPTS.md).
2. The Firm (narrative-only; never enters the build unless Treasury AND KYA are done and clean with slack to spare).
3. KYA entirely (Treasury alone is a valid, complete submission).
4. KYA's ZK tier (already deferred to writeup by default).
5. Never cut: Treasury shipping, its listing submission, the x402 integration, the wash-trading rule.

## The Firm activation (explicit, unlikely)
Only if Treasury is live+used AND KYA is live+clean AND both humans agree there is genuine slack. Then I1 wakes from PROMPTS.md. With ~2.5 days and the review clock dominating, the default expectation is firmly: this does not happen, and The Firm stays a demo slide. That is by design.

## Golden evals (I2 owns — NOT YET BUILT in this repo)
The eval harness (`tests/`) and mock fixtures (`packages/mocks`) do not exist in the repo yet (see DOCSYNC.md). Treasury's DoD is instead met by the P1 hand-verification against OKLink above plus the 13/13 in-package tests. If I2's harness lands, the eval targets remain:
- Treasury (must pass before G1 listing): revenue report numbers match a hand-verified real wallet; runway math correct; export produces valid csv/json/md.
- KYA (only if it proceeds, before G2): `agent_transferred_identity` trips `IDENTITY_TRANSFERRED_RECENTLY`; `agent_sybil_burst` scores < 50 with `REVIEWER_CONCENTRATION` + `BURST_FEEDBACK`; every component returns evidence.

## Demo scenario
Treasury (the submission): an ASP owner asks "how much did I make this week, from whom, and what's my runway." Clean report on camera, real X Layer data, live endpoint.
KYA (if live): catching a bought (transferred) identity before a hire.
The Firm (narrative only): a slide showing the vision — an agent that runs KYA before it pays, with a provenance appendix. Spoken, not necessarily built.
