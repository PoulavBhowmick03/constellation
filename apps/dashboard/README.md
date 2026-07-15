# Constellation dashboard

Read-only demo viewer for Constellation. Treasury calls are live; KYA and The
Firm remain explicitly labelled fixture/roadmap views.

## Run locally

```bash
pnpm -F @constellation/dashboard dev
```

The default Treasury target is `https://constellationokx.fly.dev/mcp`. Override
it with `NEXT_PUBLIC_TREASURY_MCP_URL`; see `.env.example`.

## MCP transport

Browsers cannot call the Fly endpoint directly because its current response
does not include CORS headers. `src/app/api/mcp/route.ts` is therefore a narrow,
same-origin POST proxy. It forwards only the JSON-RPC body and the MCP content
headers, preserves the upstream HTTP status, and returns `PAYMENT-REQUIRED` /
`PAYMENT-RESPONSE` headers when present.

`src/app/mcpClient.ts` parses the stateless streamable-HTTP response. For the
normal MCP success path it reads the single SSE `data:` envelope and parses
`result.content[0].text`. HTTP 402 and MCP-level `PAYMENT_REQUIRED` results are
returned as honest payment challenges; the dashboard never signs or submits a
payment.

## Live versus roadmap

- Live: `register_wallet` challenge and signature submission, `get_runway`, and
  paid-tool x402 challenge discovery.
- Not live: KYA fixture scorecards and The Firm workflow simulation.
- Deferred: browser wallet connection and x402 payment execution.

Build and check:

```bash
pnpm -F @constellation/dashboard lint
pnpm -F @constellation/dashboard build
```
