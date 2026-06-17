# LedgerForge Demo Video Script (Option B: three-act demo)

**Target length:** 4:20-4:40. Hard cap 4:45.
**One-take, screen-recorded.** No talking head, no music, no slide deck. The product carries the demo.
**Recording setup:**
- Terminal in iTerm at 18pt font, ~120×30, in `~/Developer/ledgerforge/agents/`
- Browser tabs preloaded in this order: `https://www.npmjs.com/package/@ishitaaaaw/x402-mantle`, `https://mantlescan.xyz/address/0x1d550b555B3a2e124ef611b55965848d6be233a2`, `https://mantlescan.xyz/address/0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`
- Editor (VS Code) with Markdown preview, ready to open the latest digests from `agents/scout-runs/`, `agents/perps-coach-runs/`, and `agents/spawn-auditor-runs/`
- A snippet ready to paste/show: a short SDK code sample (see Shot 6)

The narration is written to be read straight from this page. Pauses are marked `[…]`. Total narration ≈ 580 words ≈ 3:50 at conversational pace; the remaining ~30-40s is action/scrolling/clicks.

---

## Shot 1: The vision hook (0:00-0:30)

**On screen:** terminal, clear, prompt visible. Or a blank-ish editor view of `agents/src/autonomous-scout.ts` zoomed out so the structure reads as "this is a real codebase." Don't show your face.

**Say:**

> "Autonomous agents can write code, run analysis, and call APIs. But they can't pay for things autonomously. Every existing payment rail, from Stripe to ACH to most crypto wallets, was built for humans with accounts, KYC, and monthly invoices."

> "Agents need something different: per-call payments, signed authorization with no stored credentials, on-chain proof of every transaction, and reputation that follows the agent across platforms. That's x402, the emerging standard for HTTP-native payments."

> "LedgerForge is the production rail for x402 on Mantle. To prove it works, I'm not going to run one agent. I'm going to run three, in three different domains, all on the same SDK."

---

## Shot 2: The setup (0:30-0:45)

**On screen:** terminal. Type `npm run scout` but don't press enter yet.

**Say:**

> "Three agents. Same SDK, same wallet, same payment rail. First, an autonomous DeFi scout that pays for live market data and recommends a rotation. One command."

[Hit enter.]

---

## Shot 3: Act 1, Scout (0:45-2:00)

**On screen:** Scout output streaming. Don't skip ahead; let the latency feel real. Narrate tighter than the lean version; this is Act 1 of three.

> ⚠ **Read live numbers off screen.** Job IDs and APRs change every run. Safe-to-quote constants: **85% confidence**, **20bps fee**, **0.0499/0.0001 USDC payout split**.

**Say (across the run):**

> "Pre-flight passes. Five paid skills in sequence: Byreal top pools, Aave V3 rates, token prices, gas oracle, and, if it decides to rotate, a swap preview."

[As each `✓` lands, brief tag-line:]

> "Byreal top pools. Job ID: [read off screen]. Aave V3 USDC supply. Token prices. Gas oracle."

[Decision line: speak slowly]

> "Top Byreal pool at [read percent]. Aave USDC at [read percent]. Huge delta. The agent recommends ENTER_POOL with eighty-five percent confidence. So it pays for one more skill: Byreal swap preview, to model the trade."

[Fifth `✓` lands:]

> "Five settlements, twenty-five Mantle transactions, two minutes, twenty-five cents. That's Act One."

---

## Shot 4: Act 2, Perps Coach (2:00-2:30)

**On screen:** clear the terminal (or split-pane). Type `npm run perps-coach` and run it.

**Say (across the run):**

> "Second agent, different domain entirely. The Perps Coach scans three open Byreal perps positions: BTC long, ETH long, SOL long. Then it issues a coaching recommendation for each: hold, reduce, take profit, or avoid."

[As paid signals settle:]

> "Three perps-signals skills, one token-price feed, one gas oracle. All paid through the same SDK, all settled on-chain."

[Decision table prints:]

> "Per-position decisions. Different verdicts per coin based on real Byreal signals. Same payment rail, completely different use case."

---

## Shot 5: Act 3, Spawn Auditor (2:30-3:00)

**On screen:** terminal. Run `npm run spawn-auditor`.

**Say (across the run):**

> "Third agent, zero finance. The Spawn Auditor verifies an AI deployment before it goes live. It pays for three independent analyzers: failure history, lineage context, and on-chain decision-hash verification. Then it issues an APPROVE or BLOCK verdict with remediations."

[Verdict prints:]

> "That's the demo. Three agents. DeFi research, perps coaching, AI deploy auditing. Same SDK, same wallet, same x402 rail. The platform isn't just one demo; it's a marketplace."

---

## Shot 6: Digest deep-dive + on-chain proof (3:00-3:40)

**On screen:** open the freshly written Scout digest in VS Code's Markdown preview (Cmd+Shift+V). Scroll to the **Settlements** table, then the **Reputation writes** table immediately below it.

**Say:**

> "Every run writes a markdown digest. TL;DR at top. Decision. Reasoning. Then the proof: every settlement with paste-able mantlescan links."

[Click the first `completeJob` link.]

> "Verify on-chain. Escrow contract paying the provider 0.0499 USDC, twenty-basis-point fee, skill ID in the event log. Real x402 settlement."

[Back to digest, click any ERC-8004 feedback link.]

> "And the reputation writes: every paid call updates the provider's portable reputation on the canonical ERC-8004 registry."

[Stay on the mantlescan tab a beat.]

> "And I'll be straight about the trust model: today one facilitator settles these jobs — that's the v1 trade-off, decentralizing it is the roadmap. But it's not 'trust me.' The skill servers refuse to run paid work unless they independently verify this exact settlement on-chain, and every step you're looking at is a public event anyone can audit. Trusted operator, verifiable receipts."

---

## Shot 7: The SDK as a product (3:40-4:10)

**On screen:** the **npm package page**: https://www.npmjs.com/package/@ishitaaaaw/x402-mantle

**Say:**

> "All three agents are built on this SDK, live on npm. One install."

[Switch to editor showing this snippet:]

```ts
import { LedgerForgeClient } from "@ishitaaaaw/x402-mantle";

const client = new LedgerForgeClient({ privateKey });
const skills = await client.listSkills({ minScore: 80 });
const { output, receipt } = await client.invoke(skills[0].skillId, {
  amount: "50000",                  // 0.05 USDC
  query: { asset: "USDC" },
});
console.log(receipt.escrowJobId, receipt.completeJobTxHash);
```

> "`listSkills` returns reputation-ranked services. `invoke` does the EIP-712 signing, the escrow custody, the settlement, and the reputation write in a single async call. Anyone with a Mantle wallet can build an autonomous agent that pays or earns through this rail."

---

## Shot 8: ERC-8004 + close (4:10-4:30)

**On screen:** mantlescan tab on the ERC-8004 Reputation Registry contract page (`0x8004BAa1…`). Let the address sit on screen.

**Say:**

> "Every settlement writes to ERC-8004, the canonical reputation standard. A skill's track record isn't locked to LedgerForge. Any other ERC-8004 marketplace can read the same reputation. We're not building a silo. We're building rails."

> "When a thousand agents pay a thousand skills every day across this rail, that's an economy. We're shipping it. LedgerForge."

[Stop recording.]

---

## Things to do BEFORE recording

1. **Top up the consumer wallet.** Three agents in one take ≈ ~0.75 USDC + ~0.15 MNT. Have ≥2 USDC and ≥0.3 MNT or you'll abort mid-recording.
2. **Verify all three live URLs.** Run `npm run demos:dry-run` once an hour before recording. This confirms wiring and warms the Fly cold-start on each skill server.
3. **Pre-fetch every browser tab.** Cold-starts during the recording look unprofessional.
4. **Pre-pick a Scout digest as a "safe" digest.** If perps-coach or spawn-auditor produces a weird-looking output (e.g. all HOLD), Shot 6 should open the Scout digest. It has the richest narrative.
5. **Make the SDK snippet file ready** at `~/scratch/sdk-snippet.ts` so Shot 7 is a single Cmd+Tab away.
6. **Clear scroll history**, terminal at 18pt, ~120×30, short prompt.

## Things to do AFTER recording

1. Trim aggressively between settlements in Shots 3-5. Keep enough latency visible to feel real, compress the rest.
2. End-card at 4:30: project name, GitHub URL, DoraHacks URL, your handle. 3-5 seconds, then black.
3. Total upload under 4:45.
4. Sound-off sanity check: story should land even if narration is gone.

## Fallback: 3:30 lean cut

If editing pushes past 4:45:

1. Drop **Shot 5 (Spawn Auditor)** entirely. Keep Scout + Perps Coach for the multi-agent story. Mention spawn-auditor in one sentence at Shot 8.
2. Or drop **Shot 4 (Perps Coach)** if Spawn fits the AI DevTools angle better for your panel.
3. Compress Shot 3's narration further and let visuals carry it.

The vision hook (Shot 1), the SDK shot (Shot 7), and the ERC-8004 close (Shot 8) are non-negotiable. Everything else can flex.

## Backup: pre-recorded runs

If you don't want to spend USDC on the take:

- Run all three agents ahead of time, capture the terminal output for Shots 3-5.
- Shot 6 reads a real digest file live.
- Shots 7-8 are unchanged.
- Judges still see real mainnet txs via mantlescan; only the terminal animation is pre-rendered.
