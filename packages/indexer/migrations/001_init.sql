-- Constellation Treasury ledger — initial schema.
-- Amounts are stored as NUMERIC(78,0): base units, wide enough for a uint256
-- (max uint256 has 78 decimal digits). Never store money as float.

CREATE TABLE IF NOT EXISTS wallets (
  id                 TEXT PRIMARY KEY,               -- w_<hex>
  address            TEXT NOT NULL UNIQUE,           -- EIP-55 checksummed
  chain_id           INTEGER NOT NULL,               -- 196 (X Layer)
  indexed_from_block BIGINT NOT NULL,
  last_indexed_block BIGINT NOT NULL DEFAULT 0,
  registered_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ERC-20 Transfer events (USDT/USDG) where a registered wallet is sender or
-- recipient. `direction` is relative to the wallet; `counterparty` is the other
-- side.
CREATE TABLE IF NOT EXISTS transfers (
  id            BIGSERIAL PRIMARY KEY,
  wallet_id     TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  tx_hash       TEXT NOT NULL,
  log_index     INTEGER NOT NULL,
  block_number  BIGINT NOT NULL,
  block_time    TIMESTAMPTZ NOT NULL,
  token         TEXT NOT NULL,                       -- symbol: USDT | USDG
  token_address TEXT NOT NULL,
  decimals      INTEGER NOT NULL,
  from_address  TEXT NOT NULL,
  to_address    TEXT NOT NULL,
  amount        NUMERIC(78,0) NOT NULL,              -- base units
  direction     TEXT NOT NULL CHECK (direction IN ('in','out')),
  counterparty  TEXT NOT NULL,
  UNIQUE (wallet_id, tx_hash, log_index)
);
CREATE INDEX IF NOT EXISTS transfers_wallet_time_idx ON transfers (wallet_id, block_time);
CREATE INDEX IF NOT EXISTS transfers_counterparty_idx ON transfers (wallet_id, counterparty);

-- Per-tx native OKB gas paid by a registered wallet (wallet is tx.from).
CREATE TABLE IF NOT EXISTS gas_spend (
  id            BIGSERIAL PRIMARY KEY,
  wallet_id     TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  tx_hash       TEXT NOT NULL,
  block_number  BIGINT NOT NULL,
  block_time    TIMESTAMPTZ NOT NULL,
  gas_used      NUMERIC(78,0) NOT NULL,
  gas_price     NUMERIC(78,0) NOT NULL,              -- effective gas price (wei)
  gas_cost      NUMERIC(78,0) NOT NULL,              -- gas_used * gas_price (wei OKB)
  UNIQUE (wallet_id, tx_hash)
);
CREATE INDEX IF NOT EXISTS gas_wallet_time_idx ON gas_spend (wallet_id, block_time);

-- Native OKB balance snapshots at a block.
CREATE TABLE IF NOT EXISTS balance_snapshots (
  id            BIGSERIAL PRIMARY KEY,
  wallet_id     TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  block_number  BIGINT NOT NULL,
  block_time    TIMESTAMPTZ NOT NULL,
  okb_balance   NUMERIC(78,0) NOT NULL,              -- wei
  UNIQUE (wallet_id, block_number)
);

-- Optional human labels for counterparties, surfaced in reports.
CREATE TABLE IF NOT EXISTS counterparty_tags (
  address    TEXT PRIMARY KEY,                       -- lowercased address
  label      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Server-issued EIP-191 challenge nonces for register_wallet (10-minute TTL).
-- Lives with the ledger DB because the Treasury MCP server has no store of its
-- own and migrations are owned by packages/indexer.
CREATE TABLE IF NOT EXISTS register_nonces (
  nonce      TEXT PRIMARY KEY,
  address    TEXT NOT NULL,
  issued_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  used       BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS register_nonces_expiry_idx ON register_nonces (expires_at);
