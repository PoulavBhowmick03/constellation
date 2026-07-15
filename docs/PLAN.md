# PLAN.md — July 7 to July 17, 2026 (Treasury-as-keystone)

Deadline: Google form by July 17, 23:59 UTC. The real deadline is earlier: the ASP must pass OKX listing review (within 24h of listing) and be live. Submit Treasury's listing as early as possible.

Strategy: ONE complete, listed, used product (Treasury Copilot) beats three half-built ones. KYA is a conditional fast-follow; The Firm is narrative. Do not let B or A steal days from Treasury polish and usage-driving.

Workstreams: P1 (Poulav, Claude Code), P2 (Poulav, Codex), I2 (Ishita, Codex), I1 (Ishita, Claude Code — DORMANT until activated), AG1 (Antigravity — optional).

## The listing flow (humans, D1, before agents go far)

Run the real OKX flow so we learn the true payment/x402 surface — this is the last load-bearing unknown:
1. Install a host agent (Claude Code or Codex), then `npx skills add okx/onchainos-skills --yes -g`, open a new session.
2. `Log in to Agentic Wallet on Onchain OS with my email` (email ready — review results go there).
3. Register a minimal A2MCP ASP: `Help me register an A2MCP ASP on OKX.AI using OKX Agent Identity from Onchain OS`.
4. Inspect what x402 endpoint shape it expects. Report that surface back — it defines `packages/payment-adapter`.
5. Capture the **Agent ID** from the conversation window when it appears; it goes in the submission form.

## Day by day

**D1 Tue Jul 7** — Bootstrap + unknowns. Humans run the listing flow above; resolve x402 endpoint shape, X Layer USDT/USDG addresses, and whether ERC-8004 is on X Layer. Freeze INTERFACES.md (Treasury + KYA sections) EOD.
P1: monorepo scaffold, indexer port started, `.env.example`. P2: KYA scoring engine on fixtures (only so it's ready IF KYA proceeds; Treasury has priority for any shared help). I2: mocks server v0 with the wallet + agent fixtures.

**D2 Wed Jul 8** — Treasury core. P1: indexer -> ledger schema -> Treasury MCP tools end to end on X Layer reads; payment-adapter v0 against the real x402 shape from D1. I2: eval fixtures for Treasury reports (numbers verifiable against explorer).

**D3 Thu Jul 9** — Treasury complete + charging. P1: real x402 charging wired; all five Treasury tools live; verify get_revenue_report against a real wallet by hand.

**D4 Fri Jul 10** — **SUBMIT TREASURY FOR LISTING.** GATE G1 (EOD): is Treasury feature-complete and submitted? If NO, this is the whole hackathon — drop everything else and fix it. Do not start KYA.

**D5 Sat Jul 11** — Treasury hardening + listing review response. Begin driving usage: post in OKX builder channels ("free runway check for every hackathon ASP"). P2 may continue KYA on fixtures but nothing lists yet.

**D6 Sun Jul 12** — Treasury live and being called. GATE G2: is Treasury APPROVED and getting real calls? 
- If YES and clean: KYA proceeds (heuristic-only). P1 hands `packages/erc8004` to P2; P2 wires KYA to live reads.
- If NO: all hands on Treasury usage + demo. KYA does not ship. This is a fine outcome.

**D7 Mon Jul 13** — If KYA proceeding: SUBMIT KYA FOR LISTING (heuristic tier; ZK is writeup-only). If not: Treasury demo polish.

**D8 Tue Jul 14** — Usage push + record Treasury demo (<=90s). If KYA live, record its demo too.

**D9 Wed Jul 15** — Draft X post(s) and form answers. Capture Agent ID(s).

**D10 Thu Jul 16** — Post X thread(s) with #OKXAI, submit Google form(s). Do not wait for D11.

**D11 Fri Jul 17** — Buffer only.

## Cut order (fixed)
1. AG1 dashboard.
2. The Firm (already narrative-only; never enters the build unless Treasury AND KYA are done and clean by D8).
3. KYA entirely (Treasury alone is a valid, complete submission).
4. KYA's ZK tier (already deferred to writeup by default).
5. Never cut: Treasury shipping, its listing submission, the x402 integration, the wash-trading rule.

## The Firm activation (explicit, unlikely)
Only if by end of D8 Treasury is live+used AND KYA is live+clean AND both humans agree there is genuine slack. Then I1 wakes from PROMPTS.md. Default expectation: this does not happen, and The Firm stays a demo slide. That is by design.

## Golden evals (I2 owns)
Treasury (must pass before D4 listing): revenue report numbers match a hand-verified real wallet; runway math correct; export produces valid csv/json/md.
KYA (only if it proceeds, before D7): agent_transferred_identity trips IDENTITY_TRANSFERRED_RECENTLY; agent_sybil_burst scores < 50; every component returns evidence.

## Demo scenario
Treasury (the submission): an ASP owner asks "how much did I make this week, from whom, and what's my runway." Clean report on camera, real X Layer data.
KYA (if live): catching a bought (transferred) identity before a hire.
The Firm (narrative only): a slide showing the vision — an agent that runs KYA before it pays, with a provenance appendix. Spoken, not necessarily built.
