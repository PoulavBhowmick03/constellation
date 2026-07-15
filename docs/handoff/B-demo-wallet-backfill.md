# B — index a real demo wallet so paid reports show real numbers

## What's verified (by P1, no DB needed)
- `computeRevenueReport` produces correct totals on real X Layer USD₮0 data (receipt-level cross-check; see P1.md).
- `scan.ts`'s `to`/`from` getLogs filters (chunked at the 100-block cap) return the correct inbound/outbound transfers for a real wallet.
- Recent-block backfill knob exists: `INDEXER_START_BLOCK` → registration sets `indexedFromBlock` → `scanWallet` scans `[indexedFromBlock, head]` only. So a demo wallet indexes recent history, not 65M blocks from genesis.

## What's blocked (needs a human)
1. **A demo wallet you own that HAS USD₮0 history on X Layer.** `register_wallet` requires the owner's EIP-191 signature, so it must be a wallet you can sign for. (The OKX agent wallet `0x212e82dc…` had 0 balance/history — a fresh wallet gives an empty report.)
2. **The prod `DATABASE_URL`** (Neon, a Fly secret) to backfill into the deployed DB.
3. Local full-pipeline run also needs Postgres (`docker compose up -d db`) — docker was down in P1's session.

## Runbook (you run)
Pick a recent start block to keep the scan fast (X Layer ~1s blocks; 5000 blocks ≈ 50 getLogs calls):
```bash
# 1. head block for reference
#    (any X Layer explorer, or: cast block-number --rpc-url https://rpc.xlayer.tech)
# 2. register your history-bearing wallet via the LIVE endpoint (two-phase EIP-191),
#    OR locally with the same DATABASE_URL.
# 3. backfill just that wallet's recent history into prod:
INDEXER_START_BLOCK=<head-5000> \
XLAYER_RPC=https://rpc.xlayer.tech \
USDT_ADDRESS=0x779Ded0c9e1022225f8E0630b35a9b54bE713736 \
USDG_ADDRESS=0x4ae46a509f6b1d9056937ba4500cb143933d2dc8 \
DATABASE_URL='<prod Neon url>' \
pnpm -F @constellation/indexer index
```
`run.ts` scans every registered wallet to head and upserts (safe to re-run). After it finishes,
`get_revenue_report` / `get_expense_report` on the live endpoint return REAL numbers for that wallet.

## Recommendation
For the demo, set `INDEXER_START_BLOCK` to a window that actually contains your wallet's transfers.
If the wallet's history is older than a few thousand blocks, either lower the start block (slower scan)
or use a wallet with recent activity. Keep the scan bounded — a full-genesis scan on the 100-block cap
is ~650k calls and will not finish in demo time.
