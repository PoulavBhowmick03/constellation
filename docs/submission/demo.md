# Treasury Copilot — Launch / Demo Script

> This is a **spoken** script for the ≤90-second demo video required by the OKX.AI
> Genesis Hackathon (Step 3). Record it screen-first: your voice over the dashboard
> and a terminal. Everything shown here is **real** — real X Layer data, real x402
> settlements, real on-chain receipts. Nothing is mocked or staged.
>
> Tune the wording to your own voice before recording. Target beats: **Best Product**
> (completeness + user value), **Creative Genius** (the "its first client is itself"
> angle), and **Social Buzz** (a clean, shareable story).

---

## The one line to open on

> *"AI agents are starting to earn real money on-chain. None of them can do their own books. So I built the accountant — and it's an agent other agents pay to call."*

---

## Beat sheet (with timings)

### 0:00 – 0:12 — The problem (talk over the dashboard landing on a wallet)
> "On OKX.AI right now, the top agents have thousands of paid orders. They're real
> businesses. But ask any of them a simple question — *how much did I make this week,
> who paid me, how long does my gas last* — and none of them can answer. There's no
> bookkeeper for the agent economy. That's what Treasury Copilot is."

**On screen:** the dashboard cockpit — wallet card, runway gauge, insights panel.

### 0:12 – 0:26 — Register, no custody
> "First, I connect a wallet. It's non-custodial — I prove I own it by signing a
> challenge, EIP-191. No private key ever leaves the wallet, the service never takes
> custody of anything."

**On screen:** click *Connect wallet* → sign the challenge → a `wallet_id` comes back.
Say the phrase **"no keys, no custody"** out loud — reviewers are watching for exactly this.

### 0:26 – 0:42 — The free hook
> "Runway is free, so any agent can check its own health. Here's the OKB balance,
> the daily burn, and how many days of gas are left — and Copilot doesn't just dump
> numbers, it tells me what they mean: *runway is healthy* or *you have 11 days, top up*."

**On screen:** `get_runway` result + the plain-language insight line. Point at the
insight — that's the "Copilot," not just a report.

### 0:42 – 1:12 — The paid call, live and on-chain
> "Now the real thing. I ask for a revenue report. The service replies *402, payment
> required* — one-tenth of a cent... one-tenth of a dollar in USD₮0. I approve it, my
> wallet signs, and OKX's facilitator settles it on X Layer. Watch —"

**On screen, in order:**
1. Trigger `get_revenue_report` → the **402 / PAYMENT-REQUIRED** challenge appears.
2. Approve → the payment settles.
3. The report comes back: **totals, ranked by who paid me**, counterparty-tagged.
4. Open the **settlement receipt** → click through to the **transaction on OKLink**.

> "That's a real transaction on X Layer. The report only came back *because* the
> payment settled — pay, then deliver, atomically. It's been hardened so you can never
> be charged without getting your report."

### 1:12 – 1:30 — The kicker (Creative Genius)
> "Here's my favorite part. Treasury Copilot has real revenue — from real agents paying
> to use it. So I pointed it at its *own* wallet. Its first customer... is itself. This
> is an agent business that can read its own P&L, priced per call, settled through OKX,
> fully non-custodial. That's the whole pitch: give the agent economy the one tool every
> real business has — books it can trust."

**On screen:** the treasury's own wallet report showing the USD₮0 it has earned from
settlements → end on the shareable **/card**.

---

## Hard rules while recording
- **Show, don't claim.** Every "settled" / "verified" must be a real click-through to a
  real tx. Do not show any number you can't open on OKLink. (The dashboard is wired to
  the live endpoint; the two hardcoded receipts are genuine on-chain txs.)
- Say **"non-custodial"** and **"settled on X Layer through OKX"** explicitly — those are
  the phrases the reviewers score on.
- Keep it under 90s. If you overrun, cut the runway beat (0:26–0:42), not the paid call.

## Real facts you can point to (all verifiable)
- **Live endpoint:** `https://constellationokx.fly.dev/mcp` (5 tools: register_wallet,
  get_runway, get_revenue_report, get_expense_report, export_statement).
- **OKX Agent ID:** 5863 (Treasury Copilot, ASP, X Layer / chain 196).
- **Pricing:** revenue 0.1 · expense 0.1 · statement 0.2 USD₮0; register + runway free.
- **Settlement asset:** USD₮0 `0x779Ded0c9e1022225f8E0630b35a9b54bE713736`, `exact`/EIP-3009.
- **Treasury (payTo):** `0x212e82dc1d13b991d5318d970963f5ddfd81a178`.
- **Three confirmed on-chain settlements** (open any on OKLink X Layer):
  - `0xceaab66465959a25680c1efe6b37d71f0afea6cd115fd90a130288982280cc2b`
  - `0x87f8674c5e53b754ea20b71a67972c2b49f1033530af7fd20c89d58a55a2617d`
  - `0xf2e0d581f9182ac759bd7c5d52d877f661a9239263be71894b43336996797fe1`
  - One of these was paid by a **cold, external agent** — not us — which is genuine
    third-party usage, not a scripted self-call.
