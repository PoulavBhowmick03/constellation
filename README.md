# Treasury Copilot

**On-chain bookkeeping for agent businesses — non-custodial, pay-per-call, live on X Layer.**

Autonomous agents are starting to earn and spend real money on-chain, and almost none of them
can answer a basic question their human operators need answered: *how much did I make this week,
who paid me, what did gas cost, and how long until I run out?* Treasury Copilot answers exactly
that. It reads a wallet's on-chain history and returns clean revenue, expense, gas, and runway
reports — the way a bookkeeper would, but as a service another agent can call and pay for per
request.

- [Live endpoint (A2MCP)](https://constellationokx.fly.dev/mcp)
- **OKX Agent ID:** `5863`
- **Network:** X Layer (`eip155:196`)
- **Settlement asset:** USD₮0 — `0x779Ded0c9e1022225f8E0630b35a9b54bE713736`
- **Payments:** x402 `exact` scheme over EIP-3009, settled by OKX's hosted facilitator
- **Custody:** none — the service never holds a key or your funds

---

## What it does

Treasury Copilot is an **A2MCP service**: a Model Context Protocol server that another agent
connects to, discovers tools on, and pays to use. It exposes five tools.

| Tool | Price | What you get |
|---|---|---|
| `register_wallet` | Free | Prove you own a wallet via an EIP-191 signature challenge; get a `wallet_id`. |
| `get_runway` | Free | Native OKB balance, average daily gas over the trailing 7 days, and estimated days of runway. |
| `get_revenue_report` | 0.10 USD₮0 | Incoming USDT/USDG totals for a period, grouped and ranked by counterparty (with labels). |
| `get_expense_report` | 0.10 USD₮0 | Outgoing totals by counterparty plus total OKB gas for the period. |
| `export_statement` | 0.20 USD₮0 | A full statement of transfers + gas for a period as CSV, JSON, or Markdown. |

The two free tools are the hook: any agent can register and check its runway at no cost. The paid
tools are where the real bookkeeping lives, and each paid call settles on-chain before the report
is returned.

## How payment works

A paid tool answers an unpaid call with an HTTP **402** carrying a standard x402
`PAYMENT-REQUIRED` challenge: the price, the asset, the recipient, and an EIP-3009
`transferWithAuthorization` to sign. The caller's agent signs it and replays the request with the
signed authorization. From there, OKX's **hosted facilitator** verifies the signature, submits the
transfer on X Layer, and waits for confirmation; only then does the tool return its result, along
with a `PAYMENT-RESPONSE` receipt (both as an HTTP header and an MCP content block) that carries
the on-chain transaction hash.

Two properties matter and are enforced end to end:

- **Non-custodial.** Payment moves directly from the caller to the treasury wallet via EIP-3009.
  Treasury Copilot holds no private key, never takes custody, and pays no gas — the facilitator
  does. There is no transaction-sending code anywhere in the product except the payment adapter.
- **Exactly-once, delivered.** Every settlement is recorded in a durable Postgres receipt store
  keyed by `payer:nonce:tool`, so a retried or duplicated request recovers the original result
  instead of paying twice, a settlement that confirms after a network timeout is still delivered
  (the server polls the facilitator's settle-status), and a proof bought for one tool can never be
  redirected to another.

### Proven live

Two real payments have settled on-chain against the live endpoint:

- `0xceaab66465959a25680c1efe6b37d71f0afea6cd115fd90a130288982280cc2b`
- `0x87f8674c5e53b754ea20b71a67972c2b49f1033530af7fd20c89d58a55a2617d`

Each moved 0.10 USD₮0 from a buyer wallet to the treasury and returned a signed receipt.

## Quickstart (calling the service)

```
POST https://constellationokx.fly.dev/mcp
Accept: application/json, text/event-stream
Content-Type: application/json

{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}
```

1. **Register** — call `register_wallet` with `{ address }`, sign the returned EIP-191 message,
   call again with `{ address, nonce, signature }`, and keep the `wallet_id`.
2. **Free reports** — call `get_runway` with your `wallet_id`.
3. **Paid reports** — call `get_revenue_report`/`get_expense_report`/`export_statement`. You'll get
   a 402; pay it via any x402 client (e.g. OKX's `onchainos payment pay`), then replay the call
   with the returned authorization header to receive the report and the settlement receipt.

## Architecture

```
constellation/
  packages/
    indexer/          X Layer chain indexer + ledger math (USDT/USDG transfers, gas, balances,
                      runway); Postgres schema + migrations; the settlement receipt store.
    payment-adapter/  The only code that touches payments. x402 challenge building, the OKX
                      facilitator adapter (verify + settle + timeout polling), the durable
                      SettlementStore, and a mock adapter for tests. Nothing else imports an SDK.
    erc8004/          ERC-8004 registry read clients (identity + reputation) for the KYA roadmap.
  apps/
    treasury/         The product. A stateless MCP server (Express + Streamable HTTP) exposing the
                      five tools, the EIP-191 registration flow, and the x402 payment preflight.
    dashboard/        A read-only demo viewer wired to the live endpoint (free-tool path).
    kya/              Roadmap: an agent trust-scoring service (fixture-only today).
```

Stack: TypeScript (strict) · pnpm workspaces · viem · Postgres · Model Context Protocol · deployed
on Fly.io. Money math and payment logic are unit-tested; the suite runs on every package.

## Principles

- **Read-only and non-custodial.** The service reads chain data and settles payments through OKX's
  facilitator. It never sends a transaction of its own and never holds funds.
- **No invented facts.** Contract addresses, RPC endpoints, and SDK behavior are verified on-chain
  or against the SDK, or they are configuration — never guessed.
- **No wash trading.** Usage is real external calls; the repo never scripts the service paying its
  own tools to inflate numbers.

## Roadmap

Treasury Copilot is the first of three services in the Constellation project. **KYA (Know Your
Agent)** scores an agent's trustworthiness before you hire it — ERC-8004 reputation reads, an
identity-transfer continuity flag, and sybil-graph forensics, with an explainable 0–100 score.
**The Firm** is the vision that ties them together: an orchestrator that hires agents, runs KYA
before every hire, pays via x402, and returns a provenance appendix. Treasury ships first because
it is the simplest to prove, the easiest to actually use in-market, and the natural probe for
everything that follows.

Planning and interface contracts live in `docs/PLAN.md` and `docs/INTERFACES.md`; per-workstream
status in `docs/status/`.
