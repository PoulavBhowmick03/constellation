# Treasury Copilot — OKX Listing Submission Pack

> Drafts below (demo narration, X thread, form prose) are **scaffolds to rewrite in
> your voice**, not final copy. The checklist + facts are ground truth.

## G1 listing checklist (DoD)

| Precondition | Status | Evidence |
|---|---|---|
| Public HTTPS MCP endpoint live | ✅ | `https://constellationokx.fly.dev/mcp`, `/health` = `{status:ok,tools:5}` |
| All 5 tools exposed | ✅ | `tools/list` returns register_wallet, get_runway, get_revenue_report, get_expense_report, export_statement |
| Free-tool path works E2E on live | ✅ | signed register → `w_d8887d2c37bb` → get_runway, all 200 on the deployed endpoint |
| Real x402 charging wired (sdk mode) | ✅ | deployed `PAYMENT_MODE=sdk`; OKX facilitator authenticated + verified a real payment (rejected only on zero balance) |
| Real HTTP 402 + `PAYMENT-REQUIRED` header | ✅ | preflight middleware; covered by `apps/treasury/test/server.test.ts` |
| Revenue numbers hand-verified vs chain | ✅ | wallet `0x77ef18adF35f62B2Ad442e4370cDbC7fe78B7dcC`, 11 inflows = 1076.156422 USDT; 2 tx cross-checked at receipt level (see P1.md) |
| One confirmed settlement tx | ✅ | **tx `0xceaab66465959a25680c1efe6b37d71f0afea6cd115fd90a130288982280cc2b`** — 0.10 USD₮0 buyer→treasury, confirmed on X Layer |
| Money path hardened (2 Codex reviews) | ✅ | durable Postgres settlement store, `settle/status` timeout polling, required resource tool-binding, precheck-before-charge, PAYMENT-RESPONSE header; 90 tests |
| Hardened code redeployed | ⏳ | needs `fly deploy` + `fly scale count 1` (fixes are committed, not yet live) |
| Agent ID captured | 🟡 | 5863 registered, **not activated** (24h clock not started) |
| INTERFACES drift signed off | ⏳ | 4 items need human sign-off (DOCSYNC.md) |
| Money-path independent review | ⏳ | Codex prompt handed off (CODEX-money-review.md) |

**Two blockers to submit-ready:** (1) fund wallet → one settlement tx; (2) human sign-off
on the 4 INTERFACES drift items. Everything else is green.

## Facts for the form
- **Service type:** A2MCP (read-only, non-custodial bookkeeping)
- **Endpoint:** `https://constellationokx.fly.dev/mcp`
- **Chain:** X Layer (eip155:196)
- **Settlement asset:** USD₮0 `0x779Ded0c9e1022225f8E0630b35a9b54bE713736` (6 dec), `exact` / EIP-3009
- **payTo:** `0x212e82dc1d13b991d5318d970963f5ddfd81a178`
- **Pricing (digits-only USDT):** get_revenue_report `0.1`, get_expense_report `0.1`, export_statement `0.2`; register_wallet + get_runway free
- **Agent ID:** `5863` (fill on the form once activated)

## Demo script (≤90s) — scaffold, rewrite in your voice
1. (0–10s) "This is Treasury Copilot — a non-custodial bookkeeping agent for X Layer. It reads your on-chain revenue and never touches your funds."
2. (10–25s) Register: sign the EIP-191 challenge, get a `wallet_id`. "I prove I own the wallet — no keys, no custody."
3. (25–45s) Free `get_runway`: OKB balance + burn + runway days.
4. (45–70s) Paid `get_revenue_report`: the x402 402 → pay 0.10 USD₮0 → the report: totals + who paid me, by counterparty. Show the `PAYMENT-RESPONSE` tx hash on oklink.
5. (70–90s) "Real X Layer data, priced per call, settled on-chain via OKX. That's an agent that earns its keep."

## X thread (#OKXAI) — scaffold
1/ Built Treasury Copilot for the OKX.AI Genesis Hackathon: a non-custodial bookkeeping agent on @XLayerOfficial. Ask it "how much did I make this week, from whom, and what's my runway" — it answers from real on-chain data. 🧵
2/ It's an A2MCP service: 5 MCP tools, priced per call, paid in USD₮0 via x402 (EIP-3009). No custody — funds move payer→payee directly, OKX's facilitator settles. #OKXAI
3/ Revenue math verified against live X Layer chain data; free runway hook; CSV/JSON/MD statements. Live endpoint, real payments. [demo video] [Agent ID 5863]

## Google form answers — scaffold (fill unknowns)
- Project name: Constellation — Treasury Copilot
- One-liner: Non-custodial, pay-per-call on-chain bookkeeping agent (A2MCP) on X Layer.
- Endpoint / Agent ID / demo link: (from Facts above once activated)
- What it does / how it uses OKX x402: (expand from the demo script)
- *TODO(unverified): exact form field list — fill against the actual form.*
