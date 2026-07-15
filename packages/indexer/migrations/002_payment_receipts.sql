-- Durable settlement receipts for x402 sdk-mode payments.
-- Keyed by the EIP-3009 nonce (payer:nonce) so a retried or cross-machine
-- duplicate of the same authorization recovers the original outcome instead of
-- re-charging. This is the source of truth the in-memory nonce cache only
-- fast-paths. See packages/payment-adapter SettlementStore.
CREATE TABLE IF NOT EXISTS payment_receipts (
  nonce_key   TEXT PRIMARY KEY,
  status      TEXT NOT NULL CHECK (status IN ('pending', 'settled', 'failed')),
  transaction TEXT,
  payer       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
