# Treasury Copilot — OKX Listing Submission Pack

> Demo/X/form copy below is ready to use; tighten to your own voice before posting.
> The checklist and facts are ground truth as of the latest session.

## G1 listing checklist (DoD)

| Precondition | Status | Evidence |
|---|---|---|
| Public HTTPS MCP endpoint live | ✅ | `https://constellationokx.fly.dev/mcp`, `/health` = `{status:ok,tools:5}` |
| All 5 tools exposed | ✅ | `tools/list` returns register_wallet, get_runway, get_revenue_report, get_expense_report, export_statement |
| Free-tool path works E2E on live | ✅ | signed register → `w_d8887d2c37bb` → get_runway, all 200 on the deployed endpoint |
| Real x402 charging wired (sdk mode) | ✅ | deployed `PAYMENT_MODE=sdk`; OKX facilitator authenticated + verified a real payment (rejected only on zero balance) |
| Real HTTP 402 + `PAYMENT-REQUIRED` header | ✅ | preflight middleware; covered by `apps/treasury/test/server.test.ts` |
| Revenue numbers hand-verified vs chain | ✅ | wallet `0x77ef18adF35f62B2Ad442e4370cDbC7fe78B7dcC`, 11 inflows = 1076.156422 USDT; 2 tx cross-checked at receipt level (see P1.md) |
| Full paid call E2E (settle + deliver) | ✅ | replay returned the report + `PAYMENT-RESPONSE` + tx; treasury balance 0 → 0.20 USD₮0 over two payments |
| Confirmed settlement txs | ✅ | `0xceaab66465959a25680c1efe6b37d71f0afea6cd115fd90a130288982280cc2b`, `0x87f8674c5e53b754ea20b71a67972c2b49f1033530af7fd20c89d58a55a2617d` |
| Money path hardened (3 Codex reviews) | ✅ | durable Postgres receipt store keyed `payer:nonce:tool`, `settle/status` timeout polling + delivery, deliver-on-success, monotonic store, required resource binding, precheck-before-charge; 90 tests |
| Hardened code redeployed | ⏳ | `fly deploy --config fly.treasury.toml -a constellationokx && fly scale count 1` (fixes committed; redeploy to ship) |
| ASP listing complete | ⏳ | listing audit NOT READY: description needs 2-part structure + `wallet_id`; represent the 0.1/0.1/0.2 tiers; drop paid listings for free tools. Human-fixes in the OKX agent session, then re-audit. |
| Agent 5863 activated | 🟡 | registered, `approvalStatus:1` (not submitted). Activate after the listing audit passes. |
| INTERFACES drift signed off | ⏳ | 4 items need human sign-off (DOCSYNC.md) |

**To submit:** (1) redeploy the hardened code; (2) fix the ASP listing per the audit and
re-run it; (3) activate Agent 5863; (4) sign off the 4 INTERFACES items. The product itself
is proven end to end.

## Facts for the form
- **Service type:** A2MCP (read-only, non-custodial bookkeeping)
- **Endpoint:** `https://constellationokx.fly.dev/mcp`
- **Chain:** X Layer (eip155:196)
- **Settlement asset:** USD₮0 `0x779Ded0c9e1022225f8E0630b35a9b54bE713736` (6 dec), `exact` / EIP-3009
- **payTo:** `0x212e82dc1d13b991d5318d970963f5ddfd81a178`
- **Pricing (digits-only USDT):** get_revenue_report `0.1`, get_expense_report `0.1`, export_statement `0.2`; register_wallet + get_runway free
- **Agent ID:** `5863` (fill on the form once activated)

## Demo script (~90s)

The one line to open on: *an agent that does the books for other agents, and gets paid to do it.*

1. **(0–12s) The problem.** "Agents are starting to earn real money on-chain. Almost none of
   them can tell you how much they made, who paid them, or how long their gas lasts. Treasury
   Copilot does — and it's a service other agents pay to call."
2. **(12–28s) Register, no custody.** Call `register_wallet`, sign the EIP-191 challenge, get a
   `wallet_id`. "It proves I own the wallet with a signature. No keys handed over, no custody."
3. **(28–45s) The free hook.** Call `get_runway` — OKB balance, daily burn, days of runway.
   "Free, so any agent can check its own runway."
4. **(45–72s) The paid call, live.** Call `get_revenue_report`. Show the 402 challenge, pay
   0.10 USD₮0 through x402, replay, and the report comes back: totals and who paid me, ranked by
   counterparty. Cut to the settlement receipt and open the tx on the X Layer explorer.
5. **(72–90s) The point.** "Real chain data, priced per call, settled on-chain through OKX, fully
   non-custodial. That's an agent business with a P&L — and a bookkeeper it can afford."

## X thread (#OKXAI)

1/ Agents are earning on-chain but flying blind on their own books. So we built **Treasury
Copilot** for the OKX.AI Genesis Hackathon: ask "how much did I make this week, from whom, and
what's my runway" — it answers from live @XLayerOfficial data. Live now. 🧵

2/ It's an A2MCP service — five MCP tools another agent connects to and pays per call. Revenue,
expense, gas, and runway reports; exportable statements. Free to register and check runway; paid
tools cost cents.

3/ Payments are x402 over EIP-3009. Fully non-custodial: funds move buyer→treasury directly, OKX's
facilitator verifies and settles on X Layer, we never hold a key or take custody. Two real
settlements already confirmed on-chain. #OKXAI

4/ Live endpoint: constellationokx.fly.dev/mcp · OKX Agent ID 5863 · [demo video]. This is the
first of three — KYA (agent trust scoring) and The Firm (an orchestrator that hires, vets, and
pays agents) build on it.

## Google form answers

- **Project name:** Treasury Copilot (Constellation)
- **One-liner:** A non-custodial, pay-per-call bookkeeping service for agent businesses — revenue,
  expense, gas, and runway reports on X Layer, settled through OKX x402.
- **Service type / Agent ID:** A2MCP · `5863`
- **Endpoint:** `https://constellationokx.fly.dev/mcp`
- **What it does:** Agents earning and spending on-chain need to know their revenue, costs, and
  runway. Treasury Copilot reads a wallet's X Layer history and returns clean, counterparty-tagged
  reports and exportable statements. Register and check runway free; pay per call for the detailed
  reports.
- **How it uses OKX:** Paid tools answer with an x402 402; the caller signs an EIP-3009
  authorization; OKX's hosted facilitator verifies and settles on X Layer; the tool returns the
  report with a signed on-chain receipt. Non-custodial throughout — the service holds no key.
- **Proof:** two confirmed settlements —
  `0xceaab66465959a25680c1efe6b37d71f0afea6cd115fd90a130288982280cc2b`,
  `0x87f8674c5e53b754ea20b71a67972c2b49f1033530af7fd20c89d58a55a2617d`.
- **Demo link:** [fill]
- *Verify the exact field list against the live form.*
