# Codex prompt — wire the demo dashboard to the LIVE Treasury endpoint (Option A)

You are working in `apps/dashboard` ONLY (AG1's lane). Do not edit `apps/treasury`,
`packages/*`, or anything else — if you find a bug outside, note it in `docs/status/AG1.md`.

## Context
`apps/dashboard` is today a 100% static mock: `src/app/data.ts` is hardcoded fixtures and
`payAndFetch(tool)` in `src/app/page.tsx` just flips a local React flag — no network. The
real product is the live MCP server at `https://constellationokx.fly.dev/mcp` (stateless
streamable-HTTP JSON-RPC; POST a `tools/call`, parse the SSE `data:` line). This makes the
demo look fake. Fix that for the FREE, no-payment path so the dashboard proves the backend
is genuinely live on camera.

## Scope (in order)
1. Add a small client (`src/app/mcpClient.ts`) that POSTs JSON-RPC to a configurable
   `NEXT_PUBLIC_TREASURY_MCP_URL` (default `https://constellationokx.fly.dev/mcp`), sends
   `Accept: application/json, text/event-stream`, and parses the single SSE `data:` line into
   the tool result (`JSON.parse(payload.result.content[0].text)`). Handle the 402 shape too
   (result.content may carry `error.payment`).
2. Make the **register_wallet** demo real: call the tool with `{address}` → show the returned
   challenge (nonce + message); let the user paste a signature (or wire a browser wallet if
   trivial) → call again with `{address,nonce,signature}` → show the real `wallet_id`. If a
   wallet connect is non-trivial, at minimum call the challenge step live and label the sign
   step as "sign in your wallet".
3. Make **get_runway** real: call it live with the registered `wallet_id`, render the actual
   `okb_balance` / `avg_daily_gas_7d` / `runway_days` from the response.
4. For the PAID tools (get_revenue_report etc.): do NOT fake a payment. Either (a) call live,
   render the real 402 challenge, and show "payment required — pay via OKX x402" (honest), or
   (b) keep them clearly labelled as illustrative if no funded buyer exists. Never render a
   fabricated "PAID"/"SETTLED"/fake tx hash — that is a disqualifying integrity risk.
5. Keep the KYA and Firm panels clearly marked "mock / roadmap" — they are not live.

## Constraints
- No fabricated settlement, proofs, or explorer links anywhere. Real data or an honest
  "not yet live" state.
- CORS: the live server may not send CORS headers; if browser calls are blocked, add a tiny
  Next.js route handler (`app/api/mcp/route.ts`) that proxies to the endpoint server-side.
  Document this in the PR.
- `.env.example`: add `NEXT_PUBLIC_TREASURY_MCP_URL` with a comment.

## Done when
`pnpm -F @constellation/dashboard build` passes, and register_wallet + get_runway show REAL
responses from the live endpoint in the browser. Report what's live vs. still-mock in
`docs/status/AG1.md`.
