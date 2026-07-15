# DOCSYNC status

Temporary DOC-SYNC workstream. Job: reconcile `docs/PLAN.md`, `docs/PROMPTS.md`,
`README.md`, `docs/INTERFACES.md`, `CLAUDE.md`, `AGENTS.md` to the actual current
repo state. No application code touched (nothing under `apps/`, `packages/`,
`tests/`, or `dashboard/`).

## 2026-07-15

### Ground truth used
- Status files that ACTUALLY EXIST: `docs/status/P1.md`, `docs/status/P2.md`.
  (`.gitkeep` is the only other file in `docs/status/`.)
- Direct repo inspection of `apps/`, `packages/`, `pnpm-workspace.yaml`, and
  `git ls-files` / `git log`.

### Reconciled repo reality (what is actually here)
- `apps/treasury` — feature-complete behind mock charging; 13/13 tests; local
  end-to-end smoke green (per P1.md). Deploy artifacts `Dockerfile.treasury`,
  `fly.treasury.toml`, `.dockerignore` built and locally docker-verified.
- `apps/kya` — fixture-only scoring core + four transport-neutral handlers; 15
  tests; build green (per P2.md, `apps/kya/README.md`). No live-chain collector,
  no MCP transport.
- `apps/firm` — DORMANT; `pyproject.toml` uv stub only. No activation present.
- `packages/indexer` (X Layer port, 8/8 tests), `packages/erc8004` (identity
  client + reputation stub, 4/4 tests), `packages/payment-adapter` (mock only;
  `PAYMENT_MODE=sdk` deliberately throws — real x402 not implemented).
- Verified X Layer config in P1.md (on-chain `eth_call`, chainId 196): RPC
  `https://rpc.xlayer.tech`; USDT0 `0x779Ded0c9e1022225f8E0630b35a9b54bE713736`
  (6 dec); USDG `0x4ae46a509f6b1d9056937ba4500cb143933d2dc8` (6 dec).

### Files changed and why
1. **`docs/PLAN.md`** — Rewrote the day-by-day section for ~D9 reality with ~2.5
   days of runway. Added a "Where we actually are" reconciliation block. Compressed
   the D1–D11 calendar into an ordered critical path (confirm live endpoint → OKX
   walkthrough + Agent ID → real x402 swap → hand-verify vs OKLink → **submit
   listing** → demo/X post), front-loaded so the 24h review clock starts as early
   as possible (target: submit by ~midday Jul 16 UTC). Kept structure intact:
   listing flow, gates (relabeled G1=submit, G2=approved), cut order, Firm
   activation, golden evals, demo scenario. Strategy unchanged
   (Treasury-keystone / KYA-conditional / Firm-narrative). Marked I2's
   mocks/evals/demo and AG1's dashboard as NOT-in-repo so nothing plans against
   them.
2. **`docs/PROMPTS.md`** —
   - **P1**: replaced the scaffolding prompt with the current critical path (confirm
     live deploy, support OKX walkthrough, real payment-adapter `sdk` mode,
     hand-verify revenue vs OKLink, write the listing checklist). Carried forward the
     two open sign-off items (error envelope, two-phase register_wallet).
   - **P2**: kept conditional framing; added the open scoring-reconciliation item
     (declared golden scores vs weighted component sums; confirm every flag fires)
     and the rubric-sign-off requirement; noted engine + 15 tests already done.
   - **I2**: added a reality check (mocks/tests/tools/demo + `I2.md` do NOT exist);
     reprioritized to the dashboard integrity/lockfile fixes and pointing demo prep
     at the live Treasury; demoted building the mock harness to "only if slack."
   - **AG1**: made GO an explicit human-confirmation precondition (no `AG1.md`, no
     GO today); required the two known bugs (fabricated PROOF-VERIFIED/SETTLED/fake
     explorer links; frozen-lockfile install) fixed before feature work; noted
     `apps/dashboard` is absent and the legacy root `./dashboard` is a different
     lineage.
   - **I1**: unchanged — dormancy note confirmed still accurate.
3. **`README.md`** — Updated the entry status table (Treasury: feature-complete +
   deploy artifacts, listing not yet submitted; KYA: fixture-only + open scoring
   reconciliation; Firm: dormant stub) and the architecture status tags
   (`mocks`/`zk`/`swarm-utils`/`dashboard` marked NOT BUILT; `payment-adapter` mock
   only; treasury feature-complete; kya fixture-only). Product/strategy prose left
   intact — this was a status update, not a rewrite.
4. **`docs/INTERFACES.md`** — NOT edited (frozen). Drift noted below.
5. **`CLAUDE.md` / `AGENTS.md`** — NOT edited. Ownership matrices and
   non-negotiables are factually correct as lane policy. (Their per-agent *briefs*
   carry stale day/priority references — e.g. AGENTS.md "I2's mocks/evals are the
   immediate need," P2 brief "listing by D5" — but those are briefs, not the matrix
   or non-negotiables, so out of scope per the doc-sync rules. Flagging here rather
   than editing.)

### INTERFACES.md drift (flagged for humans — NOT silently changed)
The frozen contract (v0.1.0) is the law; these are gaps between it and what shipped.
Each needs a human decision (sign off, or amend INTERFACES with a version bump +
mocks update per its own change protocol):
1. **Treasury error envelope (unspecified in INTERFACES).** INTERFACES names error
   *codes* (`BAD_SIGNATURE`, `NONCE_EXPIRED` for register_wallet) but no envelope
   shape, and no codes for the other tools. `apps/treasury` implemented
   `{ error: { code, message } }` with codes `BAD_SIGNATURE | NONCE_EXPIRED |
   BAD_REQUEST | WALLET_NOT_FOUND | PAYMENT_REQUIRED`. The envelope + the three
   extra codes are additions not in the frozen doc. (P1.md Q1.)
2. **Two-phase `register_wallet`.** INTERFACES request is
   `{address, nonce, signature}` with no explicit nonce-issuance step. Treasury
   issues the nonce by calling the same tool without a signature. This challenge
   path is not in the frozen request schema. (P1.md Q3.)
3. **KYA per-component point rubric (unfrozen).** INTERFACES fixes the four weights
   and six flag thresholds but not the internal point rubric; `apps/kya` isolates a
   rubric in `src/scoring.ts` (documented in `apps/kya/README.md`). Not a schema
   change, but an unfrozen decision needing both humans' sign-off before KYA lists.
   (P2.md Q3.)
4. **KYA request-shape ambiguity.** INTERFACES §2 states `{agent_ref}` explicitly
   only for `get_flags`; `apps/kya` assumes `check_agent`/`attest_agent` take the
   same. Needs confirmation. (P2.md Q4.)
5. No drift on `attest_agent` degradation — KYA implements the
   `zk.available:false, reason:"roadmap"` at check_agent pricing exactly as frozen.

### CONTRADICTIONS between what a human told this session and repo/status ground truth
Surfaced here so they are not silently baked into the docs. The session brief was
told to "verify each against status files; if a status file contradicts, the status
file wins and flag the conflict." These lost the verification:
1. **"packages/mocks, tests/ (golden Firm evals), and tools/demo (I2's deliverables)
   are built and passing."** FALSE in this repo. None exist. `P1.md` line ~142
   explicitly states "packages/mocks (I2's lane) still doesn't exist." There is no
   `docs/status/I2.md`. Docs were written treating these as not-started.
2. **"apps/dashboard (AG1) exists but has known issues from a recent audit."** No
   `apps/dashboard` exists and there is no `docs/status/AG1.md`. The only dashboard
   in the tree is the legacy git-tracked `./dashboard` (`@ledgerforge/dashboard`),
   a LedgerForge/Celo-lineage Next.js app that is NOT in the Constellation
   `pnpm-workspace.yaml`. The fabricated-data + lockfile issues are recorded in the
   PROMPTS as blockers, but which dashboard they apply to is unconfirmed — flagged
   as an open item for AG1/I2 to resolve with a human.
3. **"A human has confirmed the Fly deploy is live."** `P1.md`'s latest entry
   (deploy seat) lists all five deploy steps (fly auth, provision Postgres, set
   secrets, `fly deploy`, register ASP) as human-gated and blocked, and records no
   live public URL. The session framing ("deploy just landed") was honored in the
   PLAN narrative, but "endpoint is live and reachable" is marked an OPEN ITEM
   pending a URL in P1.md. Needs P1 (or a human) to record the live URL.
4. **"KYA... at least one fixture is missing a flag it should trigger
   (BURST_FEEDBACK)."** Contradicted by `P2.md`, which records `agent_sybil_burst`
   = 49 with BOTH `REVIEWER_CONCENTRATION` and `BURST_FEEDBACK`. The other half of
   the claim ("declared golden scores don't match the weighted component sums") could
   NOT be verified from P2.md (it records final scores 86/67/49 but not the per-
   component breakdowns, and this session does not read/modify KYA code). Left as an
   open item to fix if KYA proceeds, phrased as "reconcile declared scores vs
   component sums and confirm every flag fires" rather than asserting a specific bug.
5. **Missing status files generally.** The brief said to read `I1.md`, `I2.md`,
   `AG1.md` as ground truth "for what's actually done." None exist. Ground truth was
   therefore taken from P1.md, P2.md, and direct repo inspection. Any statement in
   the source brief that depended on those three files is unverified.

### Note on git lineage (context, not a doc change)
Committed history (`git log`) is the LedgerForge → Celo fork
(`@ledgerforge/*`, Celo MAINNET 42220). The entire Constellation/OKX monorepo
(`apps/`, `packages/`, `docs/status/`, deploy artifacts) is UNTRACKED working-tree
on branch `migrate/celo`. So `git log` is NOT ground truth for Constellation
workstream state — status files + working tree are. Called out so a future agent
doesn't read the Celo commits as the current plan.

### Open items handed to humans / owning agents
- Record the live Treasury endpoint URL in P1.md (or confirm it isn't deployed).
- Confirm which dashboard (if any) the fabricated-data + lockfile fixes apply to.
- Sign off (or amend) the four INTERFACES drift items above before any listing.
- Confirm/deny the KYA declared-score-vs-component-sum reconciliation.
- Create the missing status files (`I1.md` dormant note, `I2.md`, `AG1.md`) if/when
  those workstreams act, so future ground truth exists.
