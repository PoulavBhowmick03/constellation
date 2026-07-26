# Can The Firm call Treasury Copilot?

Correction to an earlier version of this doc: it claimed The Firm was unbuilt, based only
on this monorepo's own `apps/firm` (an empty stub — INTERFACES.md §3 does mark it
`STATUS: DEFERRED` here). That's true of *this repo's* copy. The real Firm is a separate,
live project at `~/Developer/firm` — a different repo entirely, not a subdirectory of this
one — and it's substantially built: deployed gateway, a working LangGraph pipeline, and a
**real, generic, working buyer-side x402 client already paying a real third-party agent.**

## What's actually proven, in the real Firm repo

`packages/procurer` (TypeScript) is a genuine x402 buyer implementation — parses a 402
challenge, selects an offer, assembles a signed EIP-3009 payment header, same protocol
Treasury's paid tools speak. It is not a mock and not OKLink-specific: `parseChallenge`,
`selectOffer`, `assembleV1PaymentHeader` operate on any x402 challenge from any resource.

It's proven against a real third party today: The Firm's Express product buys a raw price
series from **OKLink (Agent #2023)** for 15 base units over x402, live, on real money —
the README documents a specific settled call (`t_c6aaf880…`, ~12s). Idempotency under
retry is enforced on-chain via a derived EIP-3009 nonce. Refunds fire automatically on
failure, on real money, per the README.

So the premise of the original version of this doc — "nothing can send an x402 payment
programmatically yet" — was wrong. Something does, and it works.

## What's specifically true of the Treasury link

This is the part that's still accurate to flag. `apps/firm/src/firm/graph.py` has a
scaffolded but **not wired** call to Treasury:

```python
# config.py
enable_treasury_books: bool = False
treasury_books_url: str | None = Field(default=None)

# graph.py — build_provenance()
books_enabled = get_settings().enable_treasury_books
books_cost = Money.usdt(50_000) if books_enabled else Money.usdt(0)
...
tx="SIMULATED:treasury-books" if not books_enabled else "PENDING",
statement=(
    "Books by our own Treasury Copilot, disclosed as an intra-team payment."
    if books_enabled else
    "SIMULATED: no Treasury call was made and NO COST WAS INCURRED, so this "
    "line is 0 and the margin above reflects what The Firm actually retained."
),
```

Read this precisely, because the code is more honest than a casual read suggests:
- The flag defaults **off**. In that state the books line is genuinely zero cost — not
  hidden, stated as simulated in the provenance receipt itself.
- Flip it on and the cost accrues (0.05 USDT — the same price point as Treasury's
  `spend_preflight`) but the transaction is hardcoded to the **string** `"PENDING"`, not
  a real hash. `treasury_books_url` is defined and read into settings but never used to
  make an HTTP call anywhere in `graph.py`. Turning the flag on today would silently
  book a cost that was never actually paid — worth not doing until the call is wired.

This is the same gap the original doc found, just narrower than originally stated: the
*general capability* to pay an x402 endpoint is built and proven (against OKLink). The
specific wire-up to Treasury Copilot's endpoint is the missing piece, not the payer
machinery itself.

## To make it real

Given `packages/procurer` already does the hard part generically:

1. Point `treasury_books_url` at a real Treasury endpoint (`https://constellationokx.fly.dev/services/spend-preflight`
   or whichever tool is the right semantic fit for "books this job's spend" — worth a
   real decision, not a placeholder guess; `export_statement` is the one actually named
   in Treasury's own INTERFACES.md contract for this purpose).
2. In `build_provenance()` (or wherever the books step actually executes — this function
   only builds the receipt, the call itself needs a home), call `packages/procurer`'s
   existing quote → sign → settle flow against that URL, the same way the OKLink call
   already does.
3. Replace the hardcoded `"PENDING"` with the real settlement hash/receipt the procurer
   call returns.
4. Leave `enable_treasury_books` defaulting off until that's done — the current honesty
   about "simulated, zero cost" is the right behavior for an unwired call, not a bug to
   route around.

This is materially smaller than "build an x402 payer from scratch" — it's "point an
already-working payer at one more endpoint and stop hardcoding the receipt."
