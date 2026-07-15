# DOCSYNC status

Temporary DOC-SYNC workstream. Job: reconcile `docs/PLAN.md`, `docs/PROMPTS.md`,
`README.md`, `docs/INTERFACES.md`, `CLAUDE.md`, `AGENTS.md` to the actual current
state of the canonical repo (`origin/main`). No application code touched.

## 2026-07-15

### Repo-topology finding (READ THIS FIRST — it bit an earlier pass)
There are **two divergent trees with no shared git history**:
- **`origin/main`** (`PoulavBhowmick03/constellation`) — the **canonical** repo. Has
  all workstreams: `apps/{treasury,kya,firm,dashboard}`,
  `packages/{indexer,erc8004,payment-adapter,mocks}`, `tests/`, `tools/demo`, and all
  five status files (`P1,P2,I1,I2,AG1`).
- **P1's active workspace** (local dir on branch `migrate/celo`, also pushed to
  `origin/migrate/celo` on the constellation repo as an **orphan branch**) — a
  LedgerForge→Celo fork carrying the Constellation docs plus **only P1's slice**
  (treasury, kya, indexer, erc8004, payment-adapter) and, crucially, P1's **newer
  deploy + x402 work that is NOT on `main`**.

Neither tree is a superset. This doc-sync targets `origin/main` and was written from
a worktree checked out at `origin/main` (branch `docs/sync`), leaving P1's active
workspace untouched.

### What each tree uniquely has
- **Only on `main`:** `packages/mocks`, `tests/`, `tools/demo` (I2, passing);
  `apps/dashboard` (AG1, built); status files `I1.md`, `I2.md`, `AG1.md`.
- **Only on P1's branch:** `Dockerfile.treasury`, `fly.treasury.toml`, `fly.toml`,
  `.dockerignore`; the on-chain-verified X Layer config (USDT0
  `0x779Ded…3736`, USDG `0x4ae4…2dc8`); the documented x402 server shape; the
  EIP-3009 `exact` settlement decision + in-progress `packages/payment-adapter/src/x402.ts`;
  and a `P1.md` ~80 lines longer than main's (deploy + walkthrough + settlement
  sections).

**Consequence for the humans:** `main` currently has **no deployable Treasury**
(no Fly/Docker artifacts, no verified addresses). Step zero before listing is to
**merge/rebase P1's `migrate/celo` deploy+x402 work onto `main`** (or deploy from
that branch and record which). This is now called out at the top of PLAN.md.

### Reconciled repo reality (canonical `main` + P1 branch)
- `apps/treasury` — feature-complete behind mock charging; 13/13 tests; local e2e
  smoke green (P1.md). Deploy/x402 on branch only (above).
- `apps/kya` — fixture-only scoring core + four handlers; 15 tests. Fixtures:
  `agent_good` 86/no-flags, `agent_transferred_identity` 67/`IDENTITY_TRANSFERRED_RECENTLY`,
  `agent_sybil_burst` 49/`REVIEWER_CONCENTRATION`+`BURST_FEEDBACK`. No live reads/transport.
- `apps/firm` — DORMANT uv stub; no GO anywhere.
- `apps/dashboard` — built (AG1, GO recorded). OPEN integrity issue (below).
- `packages/{indexer(8/8),erc8004(4/4),payment-adapter(mock; real x402 on branch),mocks(4)}`.
- `tests/` — 3 golden Firm evals passing. `tools/demo` — CLI runner.

### Files changed and why (all in the `docs/sync` worktree, branch off `main`)
1. **`docs/PLAN.md`** — Rewrote day-by-day to ~D9 reality with ~2.5 days runway and
   the 24h review clock as the binding constraint. Added a "Where we actually are"
   block and made **merging P1's deploy+x402 branch onto `main`** the explicit step
   zero. Kept structure (listing flow, gates, cut order, Firm activation, golden
   evals, demo) and strategy (Treasury-keystone / KYA-conditional / Firm-narrative).
2. **`docs/PROMPTS.md`** — P1 → merge branch + deploy + OKX walkthrough + real
   EIP-3009 x402 + hand-verify vs OKLink + submit. P2 → conditional; open
   score==weighted-sum check + rubric sign-off. I2 → deliverables done; help fix the
   dashboard integrity issue (with AG1) + point demo at live Treasury; keep
   mocks/evals in schema-lockstep. AG1 → GO already recorded; the two known bugs must
   be fixed before further feature work; don't expand scope without re-confirming GO.
   I1 → unchanged (dormancy confirmed accurate; I1.md itself confirms no GO).
3. **`README.md`** — Updated entry status table + architecture tags to real status;
   added a supporting-workstreams note (I2 built; AG1 built with the OPEN integrity
   bug). Product/strategy prose left intact.
4. **`docs/INTERFACES.md`** — NOT edited (frozen). Drift noted below.
5. **`CLAUDE.md` / `AGENTS.md`** — NOT edited. Ownership matrices + non-negotiables
   are factually correct. (Their per-agent briefs carry stale day/priority references,
   e.g. "listing by D5", but those are briefs, not the matrix/non-negotiables — out of
   scope; flagged here rather than edited.)

### INTERFACES.md drift (flagged for humans — NOT silently changed)
1. **Treasury error envelope unspecified.** INTERFACES names codes (`BAD_SIGNATURE`,
   `NONCE_EXPIRED`) but no envelope and no codes for the other tools. Treasury ships
   `{error:{code,message}}` with `BAD_SIGNATURE|NONCE_EXPIRED|BAD_REQUEST|WALLET_NOT_FOUND|PAYMENT_REQUIRED`.
   (P1.md Q1.)
2. **Two-phase `register_wallet`.** INTERFACES request is `{address,nonce,signature}`
   with no nonce-issuance step; Treasury issues the nonce via the same tool called
   without a signature. (P1.md Q3.)
3. **KYA per-component rubric unfrozen.** INTERFACES fixes weights + flag thresholds
   but not the internal point rubric; `apps/kya` documents one in `README.md`. Needs
   both humans' sign-off before KYA lists. (P2.md Q3.)
4. **KYA request-shape ambiguity.** INTERFACES §2 states `{agent_ref}` explicitly only
   for `get_flags`; KYA assumes `check_agent`/`attest_agent` take the same. (P2.md Q4.)
5. `attest_agent` degradation matches the frozen contract exactly (no drift).

### Open items / things a human told a previous agent that need surfacing
1. **"Deploy is live."** No status file records a public URL, and the deploy artifacts
   aren't on `main`. Treat live-reachability as unconfirmed until a URL lands in P1.md.
2. **Dashboard fabricated-data + lockfile bugs.** Reported by an audit; `AG1.md` says
   "Blocked: None" and records NO fix. Per "don't assume fixed unless a status file
   says so," both remain OPEN. `data.ts` uses golden fixtures + simulation scenarios,
   and receipts link to the X Layer explorer — consistent with the audit's concern
   that simulated content is shown as real. Fix or label SIMULATED before recording.
3. **KYA "declared scores don't match weighted sums / missing BURST_FEEDBACK."** The
   BURST_FEEDBACK half is CONTRADICTED by P2.md (`agent_sybil_burst` = 49 with both
   `REVIEWER_CONCENTRATION` and `BURST_FEEDBACK`). The weighted-sum half could not be
   verified from P2.md (component breakdowns not recorded; this pass does not read/edit
   KYA code). Left as a reconcile-and-confirm open item, phrased as
   "declared_score == weighted_component_sum for every fixture," not an asserted bug.
4. **The orphan branch `origin/migrate/celo`.** An earlier doc-sync pass ran against
   P1's fork tree (mistaking it for canonical), wrote a now-superseded DOCSYNC there,
   and pushed two commits to the constellation repo as `origin/migrate/celo` (unrelated
   history to `main`). Per human instruction it is being LEFT in place to salvage P1's
   deploy artifacts from; it should be deleted once those land on `main` properly.

### Handoff
- These doc updates live on branch `docs/sync` (off `origin/main`), pushed for a PR
  into `main`. Humans merge to `main`; agents never do.
- Biggest single action for the humans: merge P1's deploy+x402 work onto `main` so a
  deployable Treasury exists in the canonical repo, then run the listing flow.
