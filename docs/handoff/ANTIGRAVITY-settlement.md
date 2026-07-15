# Antigravity prompt — prove one real x402 settlement (buyer side)

You are the **buyer-side** agent: you hold the funded onchainos wallet + CLI. Your job
is to complete ONE real payment against the live Treasury endpoint and capture proof.

## Hard boundaries (read first)
- **Do NOT edit `packages/payment-adapter` or `apps/treasury/src`.** That is P1/Claude's
  lane and concurrent edits caused a deploy collision. If you think code is wrong, write
  it to `docs/status/AG1.md` and stop — do not change it.
- **Do NOT run `fly deploy`.** The endpoint is already live and correct
  (`https://constellationokx.fly.dev/mcp`, `PAYMENT_MODE=sdk`). Deploys are P1's.
- One payment only. **No looping / self-call pumping** (wash-trading rule).

## Preconditions (human-gated)
- Wallet `0x212e82dc1d13b991d5318d970963f5ddfd81a178` holds **≥ 0.15 USD₮0 on X Layer**
  (contract `0x779Ded0c9e1022225f8E0630b35a9b54bE713736`, chain 196). This is a
  self→self mechanics test (payer == payTo), so the 0.10 is not consumed, only held.

## Steps
1. **Get the challenge (real HTTP 402).** The server now returns a proper 402 with a
   base64 `PAYMENT-REQUIRED` header. Trigger it:
   ```bash
   curl -si -X POST https://constellationokx.fly.dev/mcp \
     -H 'Content-Type: application/json' \
     -H 'Accept: application/json, text/event-stream' \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_revenue_report","arguments":{"wallet_id":"w_probe","period":{}}}}'
   ```
   Copy the **`PAYMENT-REQUIRED`** header value (base64).
2. **Sign (v2 path).** Feed the **base64** challenge to the CLI so it takes the v2 path
   and returns a finished header (not a raw proof):
   ```bash
   onchainos payment pay --payload '<the base64 PAYMENT-REQUIRED value>'
   ```
   Capture `authorization_header` and `header_name` from the output.
3. **Replay with the signature** (substitute the REAL value — do not paste a placeholder):
   ```bash
   curl -s -X POST https://constellationokx.fly.dev/mcp \
     -H 'Content-Type: application/json' \
     -H 'Accept: application/json, text/event-stream' \
     -H '<header_name>: <authorization_header>' \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_revenue_report","arguments":{"wallet_id":"w_probe","period":{}}}}'
   ```
4. **Capture proof.** Success = HTTP 200 with two content blocks: the report (or
   `WALLET_NOT_FOUND` — fine, the receipt is still emitted), and a
   `{"x402Version":2,"PAYMENT-RESPONSE":"<base64>"}` block. Base64-decode PAYMENT-RESPONSE
   → get `transaction` (the tx hash), `network`, `payer`, `amount`.
5. **Verify on-chain.** Open `https://www.oklink.com/x-layer/tx/<hash>` — confirm status
   success and a USD₮0 transfer for 0.10.

## Report back (to docs/status/AG1.md and to the human)
- The tx hash, the decoded PAYMENT-RESPONSE JSON, and the oklink link.
- If it fails: the exact HTTP status + the decoded `PAYMENT-REQUIRED` reason. Common
  causes: stale authorization (re-run step 2 — it expires in 300s), or the header value
  was a placeholder.
