# AG1 status

## 2026-07-15

GO

### Done
- Read `AGENTS.md`, `README.md`, `docs/INTERFACES.md`, `docs/PLAN.md`, and `docs/PROMPTS.md`.
- Created and initialized the status file `docs/status/AG1.md` with `GO`.
- Scaffolded `apps/dashboard` as a Next.js 14 + React 18 application, ensuring compatibility with the workspace Node.js 18.19.1 environment.
- Configured a dark-mode custom design system in `apps/dashboard/src/app/globals.css` with layout, glassmorphic panels, glowing borders, circular score dials, table formatting, and timeline animations.
- Implemented the local data engine in `apps/dashboard/src/app/data.ts` using the exact golden fixtures for `walletWithHistory` (revenue/expense reports, runway stats) and KYA agents (`agent_good`, `agent_transferred_identity`, `agent_sybil_burst`), along with three detailed simulation scenarios for The Firm.
- Developed the full dashboard interface in `apps/dashboard/src/app/page.tsx` including:
  1. **Treasury Copilot tab:** EIP-191 registration simulation, native OKB/gas runway estimation, paid report locks (revenue/expense), and bookkeeping table export.
  2. **KYA trust breakdown tab:** interactive agent reports, 0-100 score dials, evidence breakdowns, system flags, and ZKML proof toggle.
  3. **The Firm orchestrator tab:** interactive node-by-node timeline progress player, live execution console logs, and final Provenance Appendix formatting.
  4. **Payment trail dashboard:** paid x402 receipts linked to the X Layer explorer.
- Verified compilation and successfully built the optimized Next.js production build (`npx pnpm --filter @constellation/dashboard build`).
- Launched the dashboard dev server in the background, listening on default port 3000.

### Blocked
- None.

### Next
- Coordinate with Poulav and Ishita to record the demo video beats.
- Address any styling polish or additional mock scenario requests from the team.

### Questions for humans
- Is there any specific mock scenario or data point you would like added to the timeline or reports for the final recording?

## 2026-07-15 — live Treasury dashboard wiring

### Done
- Replaced the Treasury fixture interaction with real stateless MCP calls through `src/app/mcpClient.ts`.
- Added a narrow server-side `/api/mcp` proxy because the live Fly endpoint does not currently return browser CORS headers; the proxy preserves SSE bodies, HTTP status, and payment headers.
- Wired the live two-step `register_wallet` flow: real challenge nonce/message, manual wallet-signature paste, real registration response and `wallet_id`.
- Wired `get_runway` to render the live `okb_balance`, `avg_daily_gas_7d`, `runway_days`, and `as_of` response. Also supports pasting an existing registered `wallet_id` for the demo.
- Paid-tool buttons now request and display only the genuine HTTP 402 / `PAYMENT-REQUIRED` challenge. The dashboard never supplies a payment proof or claims settlement.
- Marked KYA as fixture/roadmap and The Firm as simulation at the panel level; removed fabricated proof verification, payment settlement, transaction hashes, and explorer links.
- Added `apps/dashboard/.env.example` and documented the proxy, environment variable, and live-versus-roadmap boundary in `apps/dashboard/README.md`.
- Reconciled the generated ESLint config with the repository's pinned Next.js 14 / ESLint 8 versions.
- Verified `pnpm -F @constellation/dashboard lint` and `pnpm -F @constellation/dashboard build` are green.
- Verified the built proxy against `https://constellationokx.fly.dev/mcp`: live challenge returned HTTP 200 SSE, live `get_runway` for registered wallet `w_d8887d2c37bb` returned HTTP 200 SSE, and `get_revenue_report` returned genuine HTTP 402 with a forwarded `PAYMENT-REQUIRED` header. No payment was attempted.

### Blocked
- Completing a fresh registration in the browser requires a human to sign the displayed EIP-191 message. Browser-wallet connection was intentionally not added; manual signing keeps wallet authority explicit and avoids adding a last-minute dependency.

### Next
- Open the dashboard, sign one live challenge in the demo wallet, and record the registration → runway sequence.
- Use the same real `wallet_id` to open each paid-tool panel and capture the live x402 challenge state on camera.

### Questions for humans
- Which human-controlled wallet should be used for the recorded registration signature?
