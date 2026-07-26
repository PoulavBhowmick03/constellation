# Treasury Copilot — demo video script

Target runtime: **90–120 seconds**. Product demos die past 2 minutes. Cut anything that
isn't the hook, the proof, or the close.

Layout: screen recording, split terminal (left) + X Layer explorer (right), your voice
over it. No slides during the live section — slides bookend it (see the Gemini prompt).

Before recording: confirm current numbers (sold count, listing status, rating) with
`onchainos agent get-agents --agent-ids 5863` so nothing you say on camera is stale.
Swap the bracketed numbers below for whatever's true that day.

---

## [0:00–0:12] Hook — the problem, not the product

Don't open with "Treasury Copilot is a bookkeeping agent." Nobody's hook is a feature
list. Open with the failure mode it prevents.

> "Autonomous agents are starting to pay each other real money. Nobody's watching most
> of those payment paths. Charge-for-nothing, double-charges, replay bugs — they're
> common, and they're invisible until someone loses money."

On screen: nothing yet, or a plain terminal prompt. Let the line land before you type
anything.

## [0:12–0:22] The turn

> "So we built the one that doesn't lie about what it charged you for. Treasury Copilot —
> live on OKX, real settlements, and we're going to show you the money move on-chain
> right now, not a mockup."

Cut to the terminal.

## [0:22–0:55] Live proof — the thing that actually matters

Run `./demo.sh --live` (rehearsed dry-run beforehand with the plain `./demo.sh` so
you know the exact timing). Narrate OVER it, don't read it line by line:

> "This is a real agent hitting a paid endpoint. It gets a 402 — payment required —
> with a signed challenge: network, price, exactly who gets paid. No key custody on
> our side, ever. It signs an EIP-3009 authorization, OKX's facilitator settles it..."

**[cut to explorer, paste the tx hash the script just printed]**

> "...and there it is. Confirmed on X Layer. That's not a receipt we made up — that's
> a transaction anyone can look at."

If you have time, layer in ONE more distinct proof point instead of repeating the same
call:

> "Every one of these calls is exactly-once. Same payment replayed twice returns the
> same answer and charges nothing the second time — we don't just say that, we broke
> it once, found it live, and fixed it. That story's in the write-up if you want the
> receipts."

(This is your strongest differentiation beat. Most competing agents in this category
have never been tested against a real, asynchronous settlement — most have not found,
let alone fixed, the bug you're describing. Say it plainly, don't undersell it.)

## [0:55–1:15] Zoom out — why this is harder than it looks

> "The hard part isn't the API. It's that money movement on-chain is asynchronous —
> a payment can say 'pending' for real seconds before it's actually confirmed. Get
> that timing wrong and you either charge someone twice, or you charge them and give
> them nothing back. We found both of those failure modes against the real payment
> SDK, not in a mock — and fixed them before this went out."

On screen: quick cut to the test count / green CI, 1–2 seconds, not a dwell.

## [1:15–1:35] Traction, stated plainly

> "It's listed on OKX.AI, [N] sales, [rating]/5. Every paid tool — revenue reports,
> expense reports, exportable statements, a spend-preflight advisory — priced in
> USDT, non-custodial, and it works exactly like we just showed you, every time."

Only say "listed" if it's actually listed when you record. If it's mid-review, say:

> "It's on OKX.AI's marketplace, currently back in review after a small update —
> [N] sales and a [rating] rating before that."

Don't fudge this. A judge who checks the link and finds a mismatch with what you said
on camera costs you more than the honest version would have.

## [1:35–1:50] Close

> "Treasury Copilot. Real payments, real settlement, and the correctness guarantees
> most agent-to-agent commerce doesn't have yet. Repo's open, everything you just saw
> is reproducible."

On screen: repo URL, listing URL. Hold for 3 seconds. Cut.

---

## Delivery notes

- **Say numbers, not adjectives.** "0.05 USDT₮0, confirmed in under a minute" beats
  "cheap and fast." Judges remember specifics; they tune out superlatives.
- **Don't narrate the terminal.** If a viewer can read the screen, don't read it to
  them — say what it MEANS, not what it says.
- **The bug story is your best asset. Use it.** "We found this ourselves and fixed it"
  is a stronger trust signal than a clean demo with no story behind it — it's the one
  thing a competitor who hasn't stress-tested their payment path can't claim.
- **Cut ruthlessly.** If a section runs long in rehearsal, cut the middle explanation,
  never the live proof and never the close.
