# Trust model and known limits — Treasury Copilot

What this service guarantees, what it does not, and where it can fail. Written
so a buyer (human or agent) can decide how much weight to put on its output
without reading the source.

Live: `https://constellationokx.fly.dev` · X Layer (`eip155:196`) · OKX agent 5863

---

## 1. What we never touch

**Non-custodial.** We hold no private key for any buyer, and none for the
payments themselves. Settlement is EIP-3009 `transferWithAuthorization`: the
buyer signs an authorization, OKX's facilitator submits it, and the tokens move
directly from buyer to our treasury address. We cannot move a buyer's funds, and
we cannot forge an authorization.

**Read-only.** Every tool reads indexed chain data and returns a report. No tool
in this service sends a transaction, approves a spend, or mutates any balance.
The only transaction-sending code in the repo is a Foundry deploy script in a
different workstream.

**No key material in the repo.** Credentials are Fly secrets. `.env.example`
documents every variable by name with no values.

---

## 2. What "exactly once" actually means

A paid call is identified by `payer : EIP-3009 nonce : tool`. Against that key:

- **The charge happens at most once.** The authorization is reserved with a
  single atomic `INSERT ... ON CONFLICT DO NOTHING` before settlement, so two
  concurrent requests — including on two machines — cannot both settle it.
- **The result is computed at most once.** The first delivery under a settlement
  is cached and is what every replay returns. A replay does no indexer work.
- **A replay returns the original answer, not a fresh one.** This matters most
  for `spend_preflight`, which is balance- and time-sensitive: without the cache
  the same receipt could vouch for two genuinely different decisions.
- **Nothing is charged for a call we cannot fulfil.** Format, amount, period and
  wallet are validated *before* settlement.
- **Delivery follows confirmation, not submission.** If settlement returns
  `timeout` with a transaction hash we poll `settle/status` for up to 25s and
  deliver on success, rather than leaving a paid buyer with nothing.

Equality on replay is semantic, not byte-for-byte: results are stored as JSONB,
which may normalise key order. Every value that carries meaning — money as
base-unit integer strings, ISO timestamps — survives exactly.

### Where that guarantee stops

- If the process dies **between settlement and the cache write**, the receipt is
  durable but the result is not. The next replay recomputes and caches. The
  buyer is charged once and served; the answer may reflect a later ledger state.
- The cache is **write-once by design**. A result that was wrong because the
  index was incomplete stays as delivered. Buy a new call for a new answer.
- Settlement is confirmed by the facilitator. We do not independently verify the
  transaction against a second node.

---

## 3. Data quality — read this before trusting a number

**Our indexer is the source of truth, and it is not the chain.** Reports are
built from ERC-20 `Transfer` logs collected by our own indexer over a single
JSON-RPC endpoint, in 100-block `getLogs` pages.

- **History is bounded.** A newly registered wallet is backfilled
  `INDEXER_REGISTER_LOOKBACK` blocks (default 200,000 ≈ 4–5 days on X Layer),
  not from genesis. A wallet funded before that window shows only partial
  history. This is a deliberate bound: an unbounded backfill would be ~650k RPC
  calls per registration.
- **We say so when we know.** A wallet whose outflows are indexed but whose
  funding inflows are not produces a negative computed balance, which is
  impossible on-chain. `spend_preflight` detects this, reports
  `not fully indexed`, downgrades to `warn` instead of a false
  `INSUFFICIENT_BALANCE`, and suppresses every policy cap it cannot honestly
  evaluate. Amount-only caps still apply.
- **No reorg handling, no finality wait, no proofs.** We trust the RPC endpoint.
  A node that lags, drops logs, or serves a reorged view produces a report that
  is wrong without being flagged.
- **Tracked tokens only.** USDT/USDG (addresses from env) plus native OKB for
  gas. Any other asset is invisible to every report.

If you need numbers you can settle disputes with, reconcile against a block
explorer. These reports are for operating decisions, not for audit.

---

## 4. `spend_preflight` is advisory. It authorises nothing.

It projects your balance and burn-rate runway past a proposed spend and checks
that against optional caps you supply. It returns `allow`, `warn`, or `deny`.

**A `deny` is a recommendation, not a block.** The tool cannot stop a spend, does
not hold a key, and has no view of pending transactions or off-chain
commitments. Treating its output as an authorization gate is a misuse: an agent
that spends only on `allow` is still fully responsible for that spend, and one
that has already broadcast a transaction gains nothing from a later `deny`.

Runway is derived from mean daily outflow over a trailing 7 days in the token
being spent. A wallet with no outflow history has no runway estimate, and we
return `null` rather than a fabricated number.

---

## 5. Abuse resistance

- **Paid tools are throttled by price.** Flooding them costs the caller USD₮0
  per call. They are deliberately *not* rate limited: a 429 on a call someone
  already settled would be the worst failure mode this service has.
- **Free tools are rate limited** (token bucket, default burst 30 then 1/s,
  keyed on `Fly-Client-IP`, which fly-proxy overwrites and a client cannot
  forge). `register_wallet` schedules real indexer work, so this is the one free
  operation worth protecting. `X-Forwarded-For` is client-controlled and is not
  consulted.
- **Auto-registration happens only after settlement.** Omitting `wallet_id`
  defaults to the paying wallet, and an unknown payer is registered. That
  registration is deliberately post-settlement: doing it earlier would let an
  unpaid caller with a forged payment header trigger unbounded backfills. This
  ordering was a real bug, caught by its own test, before it shipped.
- **Payer identity is a signature, not a claim.** The EIP-3009 authorization is
  signed by the payer, which is the same standard of proof our EIP-191
  `register_wallet` challenge demands. The claimed payer is decoded from an
  unverified header *only* to pre-plan defaults; it never grants access.
- **Receipts are bound per tool.** A settlement for one tool cannot be replayed
  against another — the tool name is part of the key.

---

## 6. Availability

Single Fly machine in one region (`sin`), `auto_stop_machines` off,
`min_machines_running = 1`, with a health check. There is **no redundancy**: a
machine failure takes the service offline until it restarts.

The 402 path depends on OKX's facilitator being reachable — it supplies the
supported payment kinds. If the facilitator is down we cannot issue a valid
challenge, and paid calls are unavailable. Free tools are unaffected. An earlier
hand-rolled implementation could build a challenge locally; that fallback was
given up deliberately when OKX's listing review required their official SDK to
own the payment surface.

The receipt store is Postgres. If it is unreachable, the service **fails open**
on the money path: a store read failure falls through to the facilitator, which
re-verifies independently. That trades a possible extra recomputation for never
blocking a payable request.

---

## 7. Things we would fix with more time

Listed because a limit you can read is worth more than one you discover.

1. Verify settlement against a second RPC node rather than trusting the
   facilitator's word alone.
2. Reorg-aware indexing with a finality lag, instead of trusting head.
3. Multi-region deployment; today one machine is a single point of failure.
4. Deep historical backfill on demand, so a wallet older than the lookback
   window can get complete numbers.
5. Cache the result *inside* the settlement transaction, closing the narrow
   crash window in §2.
