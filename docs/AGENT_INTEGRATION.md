# Can The Firm call Treasury Copilot?

Short answer: **architecturally yes, today no** — The Firm isn't built (`apps/firm` is an
empty uv project; INTERFACES.md §3 marks it `STATUS: DEFERRED`). This is what the wiring
looks like once it is, and what's already proven working in its place.

## The frozen contract point

INTERFACES.md §3's `ProvenanceAppendix` — attached to every deliverable The Firm
produces — has a field for exactly this:

```json
{
  "...": "...",
  "treasury_statement": "<export_statement md content>",
  "totals": { "spent": {...}, "budget": {...} }
}
```

The Firm's `assemble` node (the last stop in its `plan -> source -> diligence -> procure
-> qa -> assemble` graph) calls Treasury's paid `export_statement` tool, gets back a
markdown statement of the task's spend, and embeds it verbatim. That's the one specific,
frozen integration point — not a vague "they could talk to each other," a named field
with a named source.

## What calling Treasury actually requires

Treasury's paid tools are gated by x402: a caller sends a request, gets an HTTP 402 with
a signed challenge (network, price, payTo, asset), and must reply with a
`PAYMENT-SIGNATURE` header carrying a signed EIP-3009 `transferWithAuthorization` for
that exact challenge. Nothing custodial — the caller signs, OKX's facilitator verifies
and settles, funds move payer to treasury directly. Any agent with three things can call
it: a funded wallet, a private key, and code that can construct that signature.

That last part is the actual blocker for The Firm as specified. The Firm is Python
(LangGraph); OKX's Payment SDK is TypeScript-only. The I1 brief anticipated this
explicitly: *"if the human reports the A2A side of the Payment SDK is TypeScript-only, do
not rewrite in TS. Design the thin TS gateway boundary, write its spec into your status
file, and wait for human confirmation before building it."* That gateway is not built
either — `payAndCall` (the outbound half of `packages/payment-adapter`'s interface,
meant for exactly this) is implemented for the mock adapter only. In SDK mode it's a
stub:

```ts
// packages/payment-adapter/src/sdk.ts
async payAndCall<T>(...): Promise<PayAndCallResult<T>> {
  return { ok: false, error: { code: "NOT_IMPLEMENTED",
    message: "SDK mode implements inbound settlement only" } };
}
```

Treasury can **receive** real x402 payments today. Nothing in this repo can **send** one
programmatically yet.

## What's proven instead

Every real payment made against Treasury this session — the ones behind the exactly-once
delivery fixes and the settlement hashes in TRUST.md — was made the same way an
eventual Firm gateway would: probe the 402, sign an EIP-3009 authorization, replay with
the header, get the result. The tool that did the signing was OKX's own `onchainos` CLI
(`payment quote` → `payment pay`), driven by an agent (this session) reading the
challenge and deciding what to do with it.

That's not a simulation of agent-to-agent commerce — the same protocol, the same
facilitator, the same on-chain settlement The Firm would use, just with a human-directed
agent standing in for The Firm's not-yet-built payer node. It's the honest, currently-true
version of "an agent pays Treasury Copilot": real, on-chain, verifiable — just not
autonomous end-to-end yet.

## To make it real

1. Build the thin TS gateway: an HTTP endpoint that takes `(url, tool, args, budgetCap)`,
   does the quote/sign/settle cycle against a wallet it holds, and returns the result —
   i.e., implement `payAndCall` for real in SDK mode.
2. The Firm's `assemble` node calls that gateway instead of shelling out to a CLI.
3. Nothing about Treasury's side needs to change — it already can't tell the difference
   between a human-directed CLI call and a fully autonomous one. The x402 challenge
   doesn't know who's on the other end of the signature.
