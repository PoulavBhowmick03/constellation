# Constellation

ASPs for the OKX.AI Genesis Hackathon (July 3 to 17, 2026). The primary submission is **Treasury Copilot**, one tight, fully-shipped, listed-early A2MCP service. KYA is a conditional fast-follow; The Firm is demo narrative, not a build target. This ordering is deliberate and is the result of descoping a three-ASP plan that was over-scoped for a two-person, 11-day window.

| Entry | Codename | Type | Status (as of Jul 15, eve) | Primary tracks |
|---|---|---|---|---|
| C | **Treasury Copilot** | A2MCP | **THE SUBMISSION. LIVE at `https://constellationokx.fly.dev/mcp` with real x402 charging (`PAYMENT_MODE=sdk`). OKX facilitator auth + payment verify PROVEN on-chain (rejected only on zero balance); real HTTP 402 + `PAYMENT-REQUIRED`; free path (register→runway) verified E2E on the live endpoint; revenue math hand-verified against live X Layer data; 77 tests green. Remaining: one FUNDED settlement tx (funding-gated), 4 INTERFACES sign-offs, activate Agent 5863, demo + form.** | Finance Copilot, Best Product, Revenue Rocket (upside) |
| B | **KYA: Know Your Agent** | A2MCP | Conditional fast-follow (only if Treasury is live+approved with slack — gate G2). Fixture-only: scoring core + handlers + 15 tests; no live-chain collector, no MCP transport. Open scoring reconciliation before listing. ZK deferred to writeup. | Creative Genius, Finance Copilot |
| A | **The Firm** | A2A | Narrative only. DORMANT (uv stub only). A slide and a vision, not a listed deliverable, unless everything else is done early. | (story for Creative Genius) |

> **⚠️ Repo-split note (Jul 15):** the working Treasury implementation (real x402 `payment-adapter`, live deploy, 77 tests) currently lives on the `migrate/celo` lineage (this tree), which has **no shared git history** with `origin/main` (constellation.git). `origin/main` separately holds `packages/mocks`, `tests/` golden evals, and `apps/dashboard` (I2/AG1 work) but an **older mock-only** `payment-adapter`/`treasury`. These two lineages must be reconciled onto one main — see `docs/status/P1.md`.

## Why this ordering (read before touching the plan)

Two AI reviews and a primary-source check of the OKX ASP onboarding flow converged on one message: **one thing shipped and actually used beats three things half-built.** The failure mode we are avoiding is the classic two-person hackathon over-scope that ends with one demo-able slice, one broken dependency, and one stub, with no clean live demo and a listing that never passed review.

Treasury Copilot is the keystone (not KYA) because:
- It is the simplest to ship: a read-only indexer port, no scoring model, no ZK, no A2A escrow.
- It has the only real in-window usage story. Its customers are the other hackathon teams, all of whom have unaccounted agent revenue right now, reachable in the OKX builder channels. Usage drives Revenue Rocket and category signal; nothing else we could build gets called in time.
- It is A2MCP: settled per call, **no arbitration, no dispute exposure** (arbitration is A2A-only on this platform).
- It is the listing-review probe anyway, so listing it first costs nothing extra.

KYA is more differentiated and more interesting, but it is a harder ship and its usage depends on marketplace volume that does not exist yet in week two. It earns its slot only as a fast-follow once the primary is safe.

## Products

**Treasury Copilot (the submission).** Read-only bookkeeping for agent businesses: revenue/expense/gas reports tagged by counterparty, runway estimates, exportable statements. Reuses the LedgerForge indexer. Strictly read-only and non-custodial, which is also the fastest path through listing review.

**KYA (conditional fast-follow).** Trust checks before hiring: ERC-8004 reputation reads, an ERC-721 identity-transfer continuity flag (reputation that changed wallets), sybil/feedback-graph forensics, an explainable 0 to 100 score. The zkML attestation tier (CredAttest EZKL pipeline) is **deferred to the writeup as a roadmap item with a working proof link**, not shipped in the listing. Judges in a 290+ submission hackathon will not inspect a ZK circuit during review; the differentiation must be the explainable score and the identity-transfer flag, not the proof.

**The Firm (narrative).** The orchestrator that hires agents, runs KYA before each hire, and returns a provenance appendix. Kept as the vision that frames the demo and the X post. Not a listed A2A deliverable unless Treasury and KYA are both done and clean with days to spare.

## Platform facts (verified from the OKX ASP tutorial, correcting earlier assumptions)

- Registration is agent-prompt-driven through **Onchain OS** (`npx skills add okx/onchainos-skills`), logged into the **Agentic Wallet** with email. The primary identity is **OKX Agent Identity**, not a bring-your-own ERC-8004 identity. The **Agent ID** required by the submission form is issued during registration/listing and appears in the agent conversation window; capture it then.
- Paid A2MCP endpoints must be **x402-compliant**; the OKX Payment SDK is *recommended, not required*. This is directly in scope of the team's LedgerForge x402 experience and is the main reason the payment integration is lower-risk for this team than for most.
- **A2MCP has no arbitration and no dispute path.** It settles instantly per call. Arbitration, the 5% bounty deposit, and on-chain ratings are **A2A-only**. Treasury and KYA therefore never touch the evaluator network.
- Review runs within 24 hours of listing, result sent to the wallet email and the agent window.

## Architecture

```
constellation/
  packages/
    indexer/          X Layer chain indexer (port of LedgerForge indexer)   [BUILT - X Layer port, 8/8 tests; aggregators hand-verified on live chain]
    erc8004/          ERC-8004 registry readers, chain-agnostic EVM (port)   [BUILT - identity client + reputation stub, 4/4 tests]
    zk/               EZKL pipeline (port of CredAttest tooling)             [NOT BUILT - deferred to writeup proof only]
    swarm-utils/      Coordinator/state glue harvested from Spawn            [NOT BUILT - dormant, only if The Firm is built]
    payment-adapter/  THIN wrapper around x402 endpoint (OKX SDK optional)   [BUILT - real OKX x402 sdk mode LIVE (exact/EIP-3009, non-custodial via OKX facilitator); mock default; 33 tests]
    mocks/            Mock MCP server + golden fixtures per INTERFACES.md     [BUILT on origin/main lineage; NOT in this tree - see repo-split note]
  apps/
    treasury/         THE SUBMISSION. MCP server. TypeScript.                [LIVE + DEPLOYED - real x402 charging; 17 tests; facilitator verify proven on-chain]
    kya/              Conditional. MCP server + scoring engine. TypeScript.  [FIXTURE-ONLY - scoring core + handlers + 15 tests; no live reads/transport]
    firm/             Narrative only. LangGraph app. Python.                 [DORMANT - uv stub only]
    dashboard/        Optional read-only demo viewer.                        [BUILT on origin/main lineage; NOT in this tree - see repo-split note]
  docs/
    INTERFACES.md     Tool schemas. Treasury + KYA sections are law; Firm section is deferred.
    PLAN.md           Day-by-day plan around Treasury-as-keystone.
    PROMPTS.md        Kickoff prompts. I1 (The Firm) is dormant until explicitly activated.
    status/           Per-agent session logs.
  CLAUDE.md / AGENTS.md   Rules + role briefs.
```

Stack: pnpm workspaces + TypeScript + viem; Postgres via docker compose; ezkl + Foundry only if the ZK proof is built for the writeup demo. Deploy: Fly.io.

## Harvest, don't port

Reuse components, never repositories. LedgerForge indexer retargets to X Layer (the keystone reuse). ERC-8004 readers port if KYA proceeds. The x402 facilitator is **shelved** (x402-compliant endpoint is what's needed, not a whole facilitator). CredAttest EZKL tooling is used only to produce the roadmap proof, not the listed product. Spawn glue stays dormant.

## Hard rules

- INTERFACES.md Treasury and KYA sections are law after D1 freeze. Changes need both humans' sign-off plus a same-PR mocks update.
- Treasury and KYA are read-only and non-custodial. No transaction-sending code outside `packages/payment-adapter` and (only if built) the one Foundry verifier-deploy script.
- No secrets in code; `.env.example` documents every variable.
- Unverified facts are `TODO(unverified)` + an unknowns-register entry, never invented.
- **Wash-trading rule:** no scripted self-calls to pump usage numbers. Real external calls only.

## Prize logic, honestly

Best Product, Finance Copilot, and Creative Genius are judged on quality and fit, which we control. Revenue Rocket is upside from Treasury's cohort demand, never a target. Social Buzz is dry for this content; if pursued, it needs a hook, not just technical posts. The listing gate is the real deadline; an unapproved ASP is an invalid submission.
