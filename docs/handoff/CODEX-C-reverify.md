# Codex prompt — RE-VERIFY the x402 money path after P1's fixes (Option C, round 2)

Your first review (see findings below) found 4 HIGH + 2 MEDIUM issues. P1 (Claude) is fixing
them in `packages/payment-adapter` and `apps/treasury`. This is the verification pass: confirm
each is actually fixed, and hunt for regressions or new holes the fixes introduce. Read-only
review; report findings with `file:line`, do not edit.

## The findings that must be re-checked (confirm FIXED or still-open)
1. **Replay across 2 Fly machines (was HIGH).** In-memory nonce cache was process-local.
   Check: is there now a durable shared store (Postgres) keyed unique on
   `(network, asset, payer, nonce)` with settlement status + delivered result, OR has the app
   been constrained to a single machine? Confirm two concurrent machines can no longer both
   settle the same authorization, and that a crash after settle can recover the result.
2. **Payment not bound to tool (was HIGH).** Revenue proof (price 100000) was replayable on
   expense (same price). Check: does the server now compare the payload's `resource` URL
   byte-for-byte against the freshly generated tool challenge before verify/settle? Is there a
   regression test (revenue-proof-on-expense must be rejected)?
3. **Settle before request validation (was HIGH).** Preflight settled before Zod/wallet checks,
   so an invalid `wallet_id` or bad `format` charged then failed. Check: are preconditions
   (wallet exists, args valid) now checked BEFORE settlement, or is the result persisted so a
   confirmed payment is recoverable? No charge-without-result path should remain.
4. **Pending/timeout poisons the nonce (was HIGH).** `rememberNonce` fired on any tx hash
   before the success check, so a `status:"timeout"` settle consumed the nonce and blocked
   retry. Check: nonce is now consumed ONLY after confirmed `success`/`status==="success"`;
   pending/timeout is persisted separately and remains safely retryable (or polled).
5. **PAYMENT-RESPONSE only in MCP content, not the HTTP header (was MEDIUM).** Check whether a
   real `PAYMENT-RESPONSE` HTTP response header is now set on success (for standard OKX
   clients), in addition to any MCP content block.
6. **Mock mode emits a malformed x402 header (was MEDIUM).** The 402 preflight encoded the
   mock's string-`accepts` challenge as x402 v2. Check: the x402 402 path now only runs for
   real (array-`accepts`) challenges / sdk mode, and mock mode no longer serves a
   structurally-invalid `PAYMENT-REQUIRED` header.

## Output
Per item: FIXED / PARTIAL / OPEN, with `file:line` evidence and a one-line justification.
Then: any NEW issue the fixes introduced, ranked. Verdict: is `PAYMENT_MODE=sdk` now safe to
run in production (and on how many machines)? One sentence, no hedging.
