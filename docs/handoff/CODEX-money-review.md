# Codex prompt — independent review of the x402 money path (pre-go-live)

Paste to Codex (fresh clone / read-only is fine). This is the highest-stakes code in
the repo: it verifies and settles real USD₮0 payments non-custodially via OKX's
facilitator. A wrong-charge or a bypass here costs us the OKX listing. Review for
**correctness and security only** — do not refactor, do not touch other lanes.

## Scope (read these, in order)
- `packages/payment-adapter/src/sdk.ts` — `SdkPaymentAdapter`, `validateExactPayload`, verify→settle flow, nonce guards, `createOkxExactProcessor` (OKX facilitator, `syncSettle:true`).
- `packages/payment-adapter/src/x402.ts` — `buildExactChallenge`, base64 carriers, `paymentRequirements`.
- `apps/treasury/src/server.ts` — the HTTP-402 preflight middleware and the `paidContent` sink.
- `apps/treasury/src/handlers.ts` — `gate()` and the `preflightResult` reuse.

## Questions to answer (with file:line evidence)
1. **Exactly-once settlement.** The preflight middleware calls `requirePayment` (which verifies + settles), stashes `preflightResult`, then the handler's `gate()` reuses it. Confirm settle can fire **at most once** per request and cannot be re-triggered by the handler path. Any code path that double-settles?
2. **Nonce replay across instances.** `SdkPaymentAdapter` dedups nonces in-memory (`inFlightNonces`, `settledNonces`). The Fly app runs **2 machines**, so those caches are per-instance. Is the on-chain EIP-3009 nonce the real single-use guard (so cross-instance replay still can't double-spend)? Confirm, and flag if the in-memory guard could ever *reject a legitimate first use* or *accept a true replay* that the chain wouldn't catch.
3. **Tool binding.** The signed EIP-3009 authorization binds `{from,to,value,nonce,validity}` but not the tool name. `get_revenue_report` and `get_expense_report` share a price (0.10). Can one paid authorization be consumed by a *different* same-priced tool? Trace whether nonce single-use makes this a non-issue or a real gap.
4. **Amount/asset/recipient binding.** Confirm `validateExactPayload` rejects any mismatch of network/asset/payTo/amount/timeout between the presented payload and the server-built challenge — before the facilitator is ever called.
5. **Validity window.** Check the `validAfter`/`validBefore` logic (`validBefore - now > maxTimeoutSeconds` rejection, expiry, not-yet-valid). Any off-by-one or timezone/seconds-vs-ms bug?
6. **Settlement acceptance.** `settle` result is accepted only on `success && status==="success" && isTxHash(transaction) && network match && payer match`. Confirm a `pending` or partial settle can never release the tool (the `pending` test exists — is the guard complete?).
7. **Error leakage.** Do facilitator error messages returned in the 402 challenge leak anything sensitive (keys, internal endpoints)?

## Output
A ranked list (most severe first) of concrete findings with `file:line`, each a one-line
defect statement + a failure scenario (inputs → wrong outcome). If it's clean, say so
explicitly per item. Do not open a PR; report findings as text.
