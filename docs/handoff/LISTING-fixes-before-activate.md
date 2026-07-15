# ASP #5863 listing — fixes required before activation

Codex's read-only listing audit returned **NOT READY**. The endpoint and payments are
correct and proven; these are listing-metadata gaps to fix in the OKX agent session (the
logged-in owner wallet), then re-audit, then activate. Nothing here is a code change.

## What already passes
- Agent #5863, role ASP, owner `0x212e…a178`; name `Treasury Copilot`; avatar uploaded.
- One service `Treasury MCP`, type A2MCP, endpoint exactly `https://constellationokx.fly.dev/mcp`.
- Not yet submitted (`approvalStatus:1`) / not listed — good, we control activation.
- Health `{status:ok,tools:5}`; `tools/list` returns all five tools; endpoint stable.

## Fix 1 — description: two parts, and say `wallet_id` (not "wallet address")
Set the service/agent description to two lines:
1. *Read-only bookkeeping for agent businesses on X Layer: revenue, expense, gas, and runway
   reports plus exportable statements, tagged by counterparty.*
2. *You provide: a registered `wallet_id` (from register_wallet) and an optional reporting
   period; statement export also takes a format (csv/json/md).*

## Fix 2 — represent the pricing tiers (0.1 / 0.1 / 0.2)
The single generic service at `0.1` under-represents the 0.20 export. List the paid tools as
separate A2MCP services on the same endpoint:
- `Revenue Report` — A2MCP, fee `"0.1"`, `https://constellationokx.fly.dev/mcp`
- `Expense Report` — A2MCP, fee `"0.1"`, same endpoint
- `Export Statement` — A2MCP, fee `"0.2"`, same endpoint

Do **not** create paid listings for `register_wallet` or `get_runway` — they are free.

Caveat: it is possible OKX treats the listing fee as a nominal headline and the endpoint's
x402 402 as the authoritative price. If the agent refuses multiple same-endpoint services,
fall back to one service whose description states the per-tool prices explicitly. Fix 1 and
the re-audit are unconditional either way.

## Then
1. Re-run the read-only listing audit (docs/handoff/CODEX-listing-audit.md) — every row PASS.
2. Activate: `onchainos agent activate --agent-id 5863 --preferred-language en` (starts the
   24h review clock; the on-chain endpoint URL is permanent).
