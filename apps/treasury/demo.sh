#!/usr/bin/env bash
# Treasury Copilot — live demo script.
#
# Run this in one terminal pane; keep an X Layer explorer open in the other
# (https://www.oklink.com/x-layer) so tx hashes printed here can be pasted
# straight in.
#
# Modes:
#   ./demo.sh            dry run — health, free tools, and the 402 challenge
#                         shape. Spends nothing. Safe to rehearse repeatedly.
#   ./demo.sh --live     also makes ONE real paid call (spend_preflight,
#                         0.05 USD₮0) via the onchainos CLI and prints the
#                         resulting on-chain settlement hash.
#
# Requires: curl, python3, and (for --live) the onchainos CLI logged in with
# a funded X Layer wallet as the active account.

set -euo pipefail

BASE="${TREASURY_BASE_URL:-https://constellationokx.fly.dev}"
LIVE=false
[[ "${1:-}" == "--live" ]] && LIVE=true

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
dim() { printf '\033[2m%s\033[0m\n' "$1"; }
step() { echo; bold "── $1 ──"; }
run() { dim "\$ $*"; eval "$@"; }

step "1. Health check"
run "curl -s ${BASE}/health"
echo

step "2. Free tools — no payment required"
dim "Runway check for a registered wallet (OKB balance, gas burn, days remaining):"
run "curl -s -X POST ${BASE}/services/runway \
  -H 'content-type: application/json' \
  -d '{\"wallet_id\":\"w_1b3f5ecf3694\"}' | python3 -m json.tool"

step "3. Paid tool, unpaid request — the x402 challenge"
dim "Every paid call starts with an HTTP 402 and a signed PAYMENT-REQUIRED"
dim "challenge: network, price, payTo, and (via the bazaar extension) the"
dim "argument schema a buying agent needs to construct its next call."
HEADERS_FILE=$(mktemp)
curl -s -D "$HEADERS_FILE" -o /dev/null -X POST "${BASE}/services/spend-preflight" \
  -H 'content-type: application/json' -d '{}'
echo
dim "Status + headers:"
grep -iE "^(HTTP|payment-required):" "$HEADERS_FILE" | head -1
echo
dim "Decoded challenge:"
grep -i "^payment-required:" "$HEADERS_FILE" | sed 's/^[Pp]ayment-[Rr]equired: //' | tr -d '\r' \
  | base64 -d | python3 -m json.tool
rm -f "$HEADERS_FILE"

step "4. Same request, sent as a browser — the OKX SDK paywall"
dim "The official OKX Payment SDK serves an HTML paywall to browser requests"
dim "and JSON to API clients from the exact same route. No hand-rolled shim."
curl -s -o /tmp/treasury-demo-paywall.html -w "HTTP %{http_code}, content-type: %{content_type}\n" \
  -X POST "${BASE}/services/revenue-report" \
  -H 'accept: text/html,application/xhtml+xml' \
  -H 'user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/126'
dim "(saved to /tmp/treasury-demo-paywall.html — open it in a browser to show the rendered page)"

if [[ "$LIVE" != "true" ]]; then
  step "Dry run complete"
  echo "Re-run with --live to make one real paid call (0.05 USD₮0) and show a"
  echo "confirmed on-chain settlement."
  exit 0
fi

step "5. LIVE — paying for spend_preflight (0.05 USD₮0)"
dim "Quoting the endpoint (probes the 402, checks balance, does not sign):"
QUOTE=$(onchainos payment quote "${BASE}/services/spend-preflight" --method POST --param amount=50000)
echo "$QUOTE" | python3 -m json.tool
PAYMENT_ID=$(echo "$QUOTE" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['paymentId'])")

dim "Signing and settling via the OKX facilitator (non-custodial — we never"
dim "hold a key; this signs an EIP-3009 transferWithAuthorization and the"
dim "facilitator submits it):"
RESULT=$(onchainos payment pay --payment-id "$PAYMENT_ID" --selected-index 0 --param amount=50000 --yes)
echo "$RESULT" | python3 -m json.tool

TX_HASH=$(echo "$RESULT" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['txHash'])")
echo
bold "Settled on-chain:"
echo "  tx:       ${TX_HASH}"
echo "  explorer: https://www.oklink.com/x-layer/tx/${TX_HASH}"

step "6. Exactly-once — replaying the SAME payment authorization"
dim "A second call with the identical signed header re-delivers the ORIGINAL"
dim "result from the ORIGINAL receipt — no second charge, no recomputation."
dim "(This can't be triggered from this script — the CLI signs a fresh nonce"
dim "per call by design. To show it live: capture one PAYMENT-SIGNATURE"
dim "header with a proxy/tcpdump and curl it twice.)"

step "Demo complete"
echo "Treasury: 0x212e82dc1d13b991d5318d970963f5ddfd81a178"
echo "Explorer: https://www.oklink.com/x-layer/address/0x212e82dc1d13b991d5318d970963f5ddfd81a178"
