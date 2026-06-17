# AGENTS.md — LedgerForge Build Bible

> This file is the authoritative reference for any AI agent or contributor working in this repo.
> Keep it up to date whenever addresses, env vars, or decisions change.

---

## 1. Project Description

LedgerForge is three-layer reputation-native agent service marketplace infrastructure for Mantle Network: an HTTP-native x402 stablecoin payment rail (first on Mantle), an on-chain `SkillRegistry` that gives every agent service provider a permanent ERC-8004 identity, and a discovery Bazaar that ranks services by provable on-chain execution history.

---

## 2. Hackathon Context

| Field | Value |
|---|---|
| Hackathon | Mantle Turing Test Hackathon 2026 — AI Awakening, Phase 2 |
| Deadline | **June 15, 2026** |
| Primary track | Agentic Wallets & Economy (Byreal-sponsored) |
| Secondary track | AI DevTools |
| Chain | Mantle Mainnet — chainId `5000` |
| Prize pool | TBD — check hackathon portal |
| Judge panel | TBD — check hackathon portal |

**Why this project fits the tracks:**
- *Agentic Wallets & Economy*: x402 is payment infrastructure specifically for autonomous agents — the escrow, stablecoin settlement, and per-execution economics are the core product.
- *AI DevTools*: `@ishitaaaaw/x402-mantle` SDK and the Bazaar discovery API let any developer register an agent skill and monetize it in minutes.

---

## 3. Architecture Overview

Three layers, each with a distinct trust model and deployment footprint.

### Layer 1 — x402 Facilitator (off-chain HTTP server)

The facilitator implements the x402 "HTTP payment channel" spec. Flow:

1. Consumer agent sends a standard HTTP request to a provider endpoint.
2. Provider (or facilitator proxy) responds `402 Payment Required` with a signed payment challenge.
3. Consumer signs an EIP-3009 `transferWithAuthorization` for USDe or USDC and POSTs it to the facilitator.
4. Facilitator validates the signature, locks funds in `x402Escrow` on-chain, and forwards the job to the provider.
5. Provider executes the job and returns a result + proof to the facilitator.
6. Facilitator calls `x402Escrow.release()` (net of fee) and writes `recordExecution()` to the ERC-8004 Reputation Registry.
7. Facilitator returns the settlement receipt to the consumer.

**Key invariant:** The facilitator is the only party that needs to be on the ERC-8004 reputation operator allowlist. Neither the consumer nor the SkillRegistry contract need allowlist access.

### Layer 2 — Smart Contracts (Mantle Mainnet)

| Contract | Role |
|---|---|
| `SkillRegistry` | Registers agent skills as ERC-8004 identities; stores endpoint URL, accepted tokens, price-per-call |
| `x402Escrow` | Holds payment during job execution via EIP-3009; released by the trusted facilitator operator |
| `BazaarListings` | Stores display metadata (name, description, tags, logoURI) linked to SkillRegistry by skillId |

`BazaarListings` never writes reputation — that is the facilitator's job via the external ERC-8004 registry.

### Layer 3 — Bazaar (read-only discovery)

The Bazaar frontend and API read skill listings from `BazaarListings` (or the indexer's local SQLite DB for speed) and sort them by ERC-8004 reputation score. Ranking is purely read-only — no contract writes needed to compute or display rankings. The sort formula can be updated without redeploying contracts.

---

## 4. Deployed Contract Addresses

Deployed to Mantle Mainnet (chainId 5000) — 2026-05-26.
Deployer / operator: `0xC0296012Cfbb0e6DF5dA7158B65Dbc46DD9650e0`

| Contract | Address | Mantlescan |
|---|---|---|
| SkillRegistry | `0x37041F257Bf8f1E201497Dc0BCDa1ae0d8317992` | https://mantlescan.xyz/address/0x37041F257Bf8f1E201497Dc0BCDa1ae0d8317992 |
| x402Escrow | `0x1d550b555B3a2e124ef611b55965848d6be233a2` | https://mantlescan.xyz/address/0x1d550b555B3a2e124ef611b55965848d6be233a2 |
| BazaarListings | `0xaB5a52C30D769A7Eae1474857A6180E71765CBAF` | https://mantlescan.xyz/address/0xaB5a52C30D769A7Eae1474857A6180E71765CBAF |

---

## 5. External Contract Addresses on Mantle

| Name | Address | Notes |
|---|---|---|
| ERC-8004 Identity Registry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | **May have no bytecode** — use try/catch on every call (see §10) |
| ERC-8004 Reputation Registry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` | Facilitator operator wallet must be on allowlist before writes succeed |
| USDe (Ethena) | `0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34` | Primary payment token; verify EIP-3009 support (see §10) |
| USDC on Mantle | `0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9` | Fallback token; verify EIP-3009 support (see §10) |
| Mantle RPC | `https://rpc.mantle.xyz` | chainId 5000; native gas token is MNT (not ETH) |

---

## 6. Environment Variables

See `.env.example` for all variables with inline descriptions. Full reference:

| Variable | Required | Description |
|---|---|---|
| `MANTLE_RPC` | yes | Mantle JSON-RPC endpoint (`https://rpc.mantle.xyz`) |
| `MANTLE_CHAIN_ID` | yes | Must be `5000` |
| `MANTLE_EXPLORER` | no | `https://mantlescan.xyz` — used for log output links |
| `DEPLOYER_PRIVATE_KEY` | deploy only | Wallet used for `forge script --broadcast` |
| `OPERATOR_PRIVATE_KEY` | yes | Facilitator hot wallet; must be on ERC-8004 reputation allowlist |
| `SKILL_REGISTRY_ADDRESS` | post-deploy | Fill after `forge script` succeeds |
| `X402_ESCROW_ADDRESS` | post-deploy | Fill after `forge script` succeeds |
| `BAZAAR_LISTINGS_ADDRESS` | post-deploy | Fill after `forge script` succeeds |
| `ERC8004_IDENTITY_REGISTRY` | yes | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| `ERC8004_REPUTATION_REGISTRY` | yes | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |
| `USDE_ADDRESS` | yes | `0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34` |
| `USDC_ADDRESS` | yes | `0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9` |
| `FACILITATOR_PORT` | yes | HTTP port for facilitator server (default: `3001`) |
| `FACILITATOR_FEE_BPS` | yes | Fee in basis points deducted before provider payout (default: `20` = 0.2%) |
| `FACILITATOR_MIN_AMOUNT` | yes | Minimum payment in token base units (default: `100` = 0.0001 USDC) |
| `BAZAAR_API_PORT` | yes | HTTP port for the Bazaar API (default: `3002`) |
| `NEXT_PUBLIC_FACILITATOR_URL` | yes | Public URL of the facilitator (consumed by dashboard client) |
| `NEXT_PUBLIC_BAZAAR_API` | yes | Public URL of the Bazaar API (consumed by dashboard client) |
| `MANTLESCAN_API_KEY` | deploy only | From https://mantlescan.xyz/myapikey — needed for `forge verify-contract` |

---

## 7. Build and Test Commands

```bash
# ── Prerequisites ──────────────────────────────────────────────────────────────
# Install Foundry:  curl -L https://foundry.paradigm.xyz | bash && foundryup
# Install Node 20+: https://nodejs.org
# Install pnpm:     npm i -g pnpm

# ── Root setup ─────────────────────────────────────────────────────────────────
cp .env.example .env   # fill in real values before running anything

# ── Contracts ──────────────────────────────────────────────────────────────────
cd contracts
forge install                           # install forge-std and other deps
forge build                             # compile all contracts
forge test                              # run all Forge tests
forge test -vvv                         # verbose (shows traces on failure)
forge coverage                          # coverage report
forge script script/Deploy.s.sol \
  --rpc-url $MANTLE_RPC \
  --broadcast \
  --verify \
  --etherscan-api-key $MANTLESCAN_API_KEY   # deploy + verify on mantlescan

# ── Facilitator ────────────────────────────────────────────────────────────────
cd ../facilitator
npm install
npm run dev          # hot-reload with tsx watch (dev)
npm run build        # compile to dist/
npm start            # run compiled server

# ── Indexer ────────────────────────────────────────────────────────────────────
cd ../indexer
npm install
npm run dev          # hot-reload (dev)
npm run build && npm start

# ── SDK ────────────────────────────────────────────────────────────────────────
cd ../sdk
npm install
npm run build        # compile to dist/ with declarations

# ── Dashboard ──────────────────────────────────────────────────────────────────
cd ../dashboard
npm install
npm run dev          # Next.js dev server at http://localhost:3000
npm run build && npm start

# ── Demo Agents ────────────────────────────────────────────────────────────────
cd ../agents
npm install
npm run spawn-skills      # register first listings (needs deployed contracts)
npm run demo-consumer     # end-to-end payment smoke test
```

---

## 8. File Map

### Contracts

| File | Purpose |
|---|---|
| `contracts/src/SkillRegistry.sol` | Registers agent skills as ERC-8004 identities; stores endpoint, token, price-per-call |
| `contracts/src/x402Escrow.sol` | EIP-3009 escrow for in-flight payments; released by facilitator after job completion |
| `contracts/src/BazaarListings.sol` | Display metadata for the Bazaar UI; ranking reads ERC-8004 externally, no writes here |
| `contracts/src/interfaces/IERC8004Identity.sol` | Minimal interface for the ERC-8004 Identity Registry (`0x8004A818...`) |
| `contracts/src/interfaces/IERC8004Reputation.sol` | Minimal interface for the ERC-8004 Reputation Registry (`0x8004B663...`) |
| `contracts/test/SkillRegistry.t.sol` | Forge unit tests for SkillRegistry |
| `contracts/test/x402Escrow.t.sol` | Forge unit tests for x402Escrow |
| `contracts/test/BazaarListings.t.sol` | Forge unit tests for BazaarListings |
| `contracts/script/Deploy.s.sol` | Deployment script: SkillRegistry → x402Escrow → BazaarListings, in order |
| `contracts/foundry.toml` | Foundry config: Solidity 0.8.20, optimizer on, Mantle RPC, mantlescan verification |

### Facilitator (`@ledgerforge/facilitator`)

| File | Purpose |
|---|---|
| `facilitator/src/server.ts` | Express server: `GET /health`, `POST /pay`, `POST /settle`, `GET /job/:id` |
| `facilitator/src/verifier.ts` | Validates EIP-3009 authorization sigs and provider job-completion proofs |
| `facilitator/src/settler.ts` | Calls `x402Escrow.release()` then `ERC8004Reputation.recordExecution()` after settlement |
| `facilitator/src/types.ts` | Shared types: `PaymentRequest`, `EscrowLock`, `JobResult`, `SettlementReceipt` |
| `facilitator/src/config.ts` | Loads `.env`, validates all required vars, exports typed `config` singleton |

### Indexer (`@ledgerforge/indexer`)

| File | Purpose |
|---|---|
| `indexer/src/index.ts` | Entry point: starts viem `watchContractEvent` for SkillRegistry, x402Escrow, BazaarListings |
| `indexer/src/handlers.ts` | Event handlers: `SkillRegistered`, `JobSettled`, `ReputationUpdated` |
| `indexer/src/db.ts` | SQLite persistence: skills, settlements, reputation_snapshots; query helpers for Bazaar API |

### SDK (`@ishitaaaaw/x402-mantle`)

| File | Purpose |
|---|---|
| `sdk/src/index.ts` | Package entry: re-exports `LedgerForgeClient` and all public types |
| `sdk/src/client.ts` | `listSkills()`, `initiate()`, `pay()`, `pollStatus()`, `verifyReceipt()` |
| `sdk/src/types.ts` | Public types: `SkillListing`, `PaymentChallenge`, `JobHandle`, `Receipt` |
| `sdk/src/utils.ts` | EIP-3009 sig builder, token amount formatting, address checksumming |

### Dashboard (`@ledgerforge/dashboard`)

| File | Purpose |
|---|---|
| `dashboard/src/app/page.tsx` | Landing page: hero, value prop, CTA to `/bazaar` |
| `dashboard/src/app/bazaar/page.tsx` | Skill discovery grid sorted by ERC-8004 reputation; filter by token/price/tags |
| `dashboard/src/app/skill/[id]/page.tsx` | Skill detail: metadata, reputation history chart, "Hire" button |
| `dashboard/src/app/list/page.tsx` | Form to register a new skill in SkillRegistry + BazaarListings |
| `dashboard/src/app/jobs/page.tsx` | Real-time feed of active and completed jobs from the indexer API |

### Agents (demo)

| File | Purpose |
|---|---|
| `agents/src/spawn-skills.ts` | Registers Spawn Protocol capabilities as the first Bazaar listings |
| `agents/src/demo-consumer.ts` | End-to-end demo: discover → pay → poll → verify receipt |
| `agents/src/types.ts` | Shared types for demo agent scripts |

---

## 9. Critical Technical Decisions

### 1. Facilitator is a standalone HTTP server, not a smart contract

The x402 spec treats payment coordination as an HTTP-layer concern (RFC-style 402 response codes). A contract-based facilitator would require every job request to touch the chain twice (lock + release) with no ability to validate off-chain job results. The HTTP server approach: lower gas costs, richer error handling, and direct compatibility with the x402 reference implementation from Coinbase.

### 2. Facilitator owns ERC-8004 reputation writes (not SkillRegistry)

The ERC-8004 Reputation Registry requires callers to be on an operator allowlist. Having `SkillRegistry` call `recordExecution` would require putting the registry contract address on the allowlist — which depends on the ERC-8004 deployer granting it. Instead, the facilitator operator wallet writes reputation after each settlement. Only one address needs allowlist access, and it's controlled by us.

### 3. EIP-3009 `transferWithAuthorization` for gasless consumer payments

Standard ERC-20 requires an `approve` transaction before the escrow can pull tokens — two on-chain txs for the consumer. EIP-3009 lets the consumer sign an off-chain message; the facilitator submits the lock transaction. Consumer's on-chain footprint for payment initiation: zero. Only the facilitator pays gas for the lock.

### 4. Bazaar ranking is read-only (no on-chain writes)

`BazaarListings.sol` stores display metadata only. The Bazaar sort algorithm lives in the API/frontend and reads ERC-8004 reputation via `getReputation()`. This means ranking logic can be iterated (new weights, decay functions, stake-boost) without redeploying any contract.

### 5. x402 V1 (per-request), not V2 (session)

The x402 V2 spec adds session tokens for amortizing payment overhead across multiple requests. V2 implementation adds complexity (session management, token expiry, revocation). For hackathon scope, we implement V1: one payment challenge per request. V2 is a post-hackathon extension.

### 6. USDe as primary token, USDC as fallback

USDe (Ethena) is the first-class payment token — it aligns with the Mantle/Ethena ecosystem partnership and is the stablecoin most relevant to the Byreal track judges. USDC is a fallback for providers or consumers who prefer it. Both must be verified to implement EIP-3009 on Mantle before `verifier.ts` is written.

### 7. Facilitator uses EIP-712 + standard transferFrom, not EIP-3009 (implementation decision)

During facilitator implementation, EIP-3009 `transferWithAuthorization` was replaced with EIP-712 typed-data signing + standard ERC-20 `approve`/`transferFrom`. Reason: EIP-3009 support on Mantle-deployed USDe/USDC was not confirmed at implementation time (see §10 gotcha), and the EIP-712 path is unambiguously supported by all ERC-20 tokens. Trade-off: consumers must submit one `approve` tx before the first payment, adding an on-chain step. This is acceptable for hackathon scope. EIP-3009 path can be added to `verifier.ts` once token support is confirmed via `cast call`.

### 8. Indexer doubles as the Bazaar HTTP API server

The indexer (`@ledgerforge/indexer`) serves both the chain event listener role and the Bazaar API (`GET /skills`, `GET /stats`, `GET /jobs`) on `BAZAAR_API_PORT`. This avoids running a separate API server process. The SQLite DB is the single source of truth for all dashboard data. If the indexer is down, the dashboard falls back to hardcoded demo data automatically.

### 9. BazaarListings tier enum drives Bazaar sort order

The indexer's `fetchSkillTier()` reads `BazaarListings.listings(skillId)` to get the uint8 tier enum and maps it to `FREE | BASIC | PRO`. The `getSkillsSortedByReputation()` DB query sorts PRO → BASIC → FREE first, then by average ERC-8004 reputation score within each tier. Tier data is cached in SQLite and kept in sync via `Listed`, `TierUpgraded`, and `Renewed` contract events.

---

## 10. Known Limitations and Gotchas

### CRITICAL: ERC-8004 Identity Registry may have no bytecode

`0x8004A818BFB912233c491871b3d84c89A494BD9e` on Mantle mainnet may still be undeployed or have no code at that address. **Before any call**, check:

```typescript
const code = await publicClient.getBytecode({ address: ERC8004_IDENTITY });
if (!code || code === '0x') {
  // registry not deployed — skip identity registration, continue with local tracking
}
```

Wrap all identity registry calls in try/catch. See Spawn Protocol's reference implementation for a working fallback pattern. The Reputation Registry at `0x8004B663...` may have the same issue — verify both before building.

### EIP-3009 support: verify before building verifier.ts

`transferWithAuthorization(from, to, value, validAfter, validBefore, nonce, v, r, s)` is NOT part of the ERC-20 standard. To verify:

```bash
# Check selector 0xe3ee160e is present on USDe
cast code 0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34 --rpc-url https://rpc.mantle.xyz | grep -c e3ee160e
```

If either token doesn't support EIP-3009, fall back to the standard `approve` + `transferFrom` flow.

### x402 V2 session support not implemented

Consumers or tooling expecting x402 V2 session tokens will not be compatible with this facilitator. Document this clearly in the SDK README.

### Mantle gas token is MNT, not ETH

All `estimateGas` calls and gas cost displays must treat the native token as MNT. MNT price differs from ETH — never assume 1:1. Use `publicClient.estimateGas()` and display in MNT with the MNT/USD price feed.

### Facilitator fee is deducted before provider settlement

`FACILITATOR_FEE_BPS` basis points are taken from the locked amount before releasing the remainder to the provider. Example: 100 USDC job at 20 bps → provider receives 99.80 USDC, facilitator keeps 0.20 USDC. Providers must price their services accounting for this.

### Operator allowlist for ERC-8004 reputation writes

The facilitator's `OPERATOR_PRIVATE_KEY` wallet must be added to the ERC-8004 Reputation Registry's allowlist before any `recordExecution` call will succeed. Contact the ERC-8004 registry operator (Mantle team / ERC-8004 deployer) with the operator wallet address to request allowlist addition. **Do this early** — it is a dependency blocker for the full payment flow.

### Single operator trust model (hackathon scope)

There is currently one trusted facilitator operator. The operator can theoretically refuse to settle, write incorrect reputation, or front-run payments. A decentralized operator set (e.g., multiple keyholders or a threshold signature scheme) is out of scope for the hackathon.

---

## 11. Security Considerations

| Risk | Mitigation |
|---|---|
| Private key exposure | `DEPLOYER_PRIVATE_KEY` and `OPERATOR_PRIVATE_KEY` must never be committed. Rotate immediately if exposed. |
| EIP-3009 replay attack | `x402Escrow` must track used nonces per-user. Reuse of a nonce must revert. |
| Reentrancy in escrow | Use checks-effects-interactions pattern or OpenZeppelin `ReentrancyGuard` on `release()` and `cancel()`. |
| Signature malleability | Use OpenZeppelin `ECDSA.recover()` (rejects high-s sigs) in contracts and `viem`'s `recoverAddress` in the facilitator. |
| EIP-3009 front-running | Set `validBefore` to ≤ 5 minutes from signing time. Tight validity windows prevent mempool front-running. |
| Amount overflow/underflow | Use Solidity 0.8.x built-in checked arithmetic. Validate `amount > FACILITATOR_MIN_AMOUNT` in the facilitator before submitting the lock tx. |
| Operator key compromise | The operator wallet can write arbitrary reputation. For production: use a hardware wallet or HSM. For hackathon: use a dedicated throwaway key, not the deployer key. |
| Dust attacks | `FACILITATOR_MIN_AMOUNT` enforces a minimum payment to prevent griefing via high-frequency micro-payments. |

---

## 12. Deployment Runbook

```bash
# Step 1 — Configure environment
cp .env.example .env
# Edit .env: fill DEPLOYER_PRIVATE_KEY, OPERATOR_PRIVATE_KEY, MANTLESCAN_API_KEY
# Ensure deployer wallet has MNT for gas

# Step 2 — Build and test contracts
cd contracts
forge install    # installs forge-std
forge build
forge test       # all tests must pass before deploy

# Step 3 — Deploy to Mantle Mainnet
forge script script/Deploy.s.sol \
  --rpc-url $MANTLE_RPC \
  --broadcast \
  --verify \
  --etherscan-api-key $MANTLESCAN_API_KEY
# Note the deployed addresses in the console output

# Step 4 — Update configuration with deployed addresses
# In .env: SKILL_REGISTRY_ADDRESS=0x... X402_ESCROW_ADDRESS=0x... BAZAAR_LISTINGS_ADDRESS=0x...
# In AGENTS.md §4: replace <!-- DEPLOY: address --> placeholders
# In README.md Deployed Contracts table: same

# Step 5 — Get operator wallet added to ERC-8004 allowlist
# Run: cast wallet address --private-key $OPERATOR_PRIVATE_KEY
# Share that address with the ERC-8004 registry operator to request allowlist addition
# Verify: cast call 0x8004B663056A597Dffe9eCcC1965A193B7388713 "isAllowedRecorder(address)(bool)" <operator>

# Step 6 — Verify EIP-3009 support on tokens
# USDe: cast call 0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34 "DOMAIN_SEPARATOR()(bytes32)" --rpc-url $MANTLE_RPC
# USDC: same check on 0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9

# Step 7 — Start the indexer
cd indexer && npm run build && npm start &

# Step 8 — Start the facilitator
cd facilitator && npm run build && npm start &

# Step 9 — Seed initial listings
cd agents && npm run spawn-skills

# Step 10 — Deploy dashboard
cd dashboard && npm run build
# Deploy to Vercel; set NEXT_PUBLIC_FACILITATOR_URL + NEXT_PUBLIC_BAZAAR_API in Vercel env
# Or: npm start for self-hosted

# Step 11 — Smoke test
cd agents && npm run demo-consumer
# Should: discover a skill, pay, receive settlement receipt, see reputation increment on-chain
```

---

## 13. What Is Complete vs Pending

### Complete ✅

**Scaffold & Config**
- [x] Project scaffold and full directory structure
- [x] `AGENTS.md` (this file) — updated to reflect implementation
- [x] `README.md`
- [x] `.env.example` with all required variables and descriptions
- [x] `.gitignore` — covers node_modules, dist, .next, contracts/out, contracts/cache, contracts/lib, SQLite DB files, secrets

**Contracts (26 Forge tests passing)**
- [x] `contracts/foundry.toml` — Foundry config with Mantle RPC and mantlescan verification
- [x] `contracts/src/interfaces/IERC8004Identity.sol` — ERC-8004 identity interface
- [x] `contracts/src/interfaces/IERC8004Reputation.sol` — ERC-8004 reputation interface
- [x] `contracts/src/SkillRegistry.sol` — full implementation (ERC-8004 identity registration, getSkill, totalSkills)
- [x] `contracts/src/x402Escrow.sol` — full implementation (EIP-712 lock, release, cancel, ReentrancyGuard)
- [x] `contracts/src/BazaarListings.sol` — full implementation (list, tierUpgrade, renew, tier enum)
- [x] `contracts/script/Deploy.s.sol` — deployment script (SkillRegistry → x402Escrow → BazaarListings in order)
- [x] `contracts/test/SkillRegistry.t.sol` — Forge unit tests
- [x] `contracts/test/x402Escrow.t.sol` — Forge unit tests
- [x] `contracts/test/BazaarListings.t.sol` — Forge unit tests
- [x] `forge install` — forge-std and openzeppelin-contracts installed in `contracts/lib/`

**Facilitator** (note: uses EIP-712 + transferFrom, not EIP-3009 — see §9.7)
- [x] `facilitator/src/config.ts` — env validation, typed config singleton
- [x] `facilitator/src/types.ts` — PaymentRequest, EscrowLock, JobResult, SettlementReceipt
- [x] `facilitator/src/verifier.ts` — EIP-712 typed-data sig validation + job proof verification
- [x] `facilitator/src/settler.ts` — x402Escrow.release() + ERC-8004 reputation write
- [x] `facilitator/src/server.ts` — Express: GET /health, POST /pay, POST /settle, GET /job/:id, POST /register

**Indexer + Bazaar API**
- [x] `indexer/src/config.ts` — viem publicClient (Mantle), contract addresses
- [x] `indexer/src/db.ts` — SQLite schema (skills, settlements, reputation_snapshots) + query helpers; `getSkillsSortedByReputation()` sorts PRO → BASIC → FREE then by avg score
- [x] `indexer/src/handlers.ts` — `syncAllSkills()` on startup; `fetchSkillTier()` reads BazaarListings tier enum; handlers for SkillRegistered, JobCompleted, Listed, TierUpgraded, Renewed
- [x] `indexer/src/index.ts` — viem `watchContractEvent` for all SkillRegistry + BazaarListings events; also serves Bazaar HTTP API (GET /skills, GET /stats, GET /jobs) on BAZAAR_API_PORT

**Dashboard** (5 routes, 0 TypeScript errors, 0 hardcoded localhost)
- [x] `dashboard/next.config.ts`, `tailwind.config.ts`, `postcss.config.js` — Tailwind v3, IBM Plex Mono + Syne fonts, 4-color light-mode system
- [x] `dashboard/src/app/globals.css` + `layout.tsx` — root layout with fonts and Nav
- [x] `dashboard/src/lib/types.ts` — Skill, Stats, Job, Tier types
- [x] `dashboard/src/hooks/useBazaarData.ts` — polls /skills (15s), /stats (30s), /jobs (15s); falls back to 4 demo skills; isMockData flag
- [x] `dashboard/src/components/Nav.tsx` — sticky header
- [x] `dashboard/src/components/MockDataBanner.tsx` — amber banner when API unreachable
- [x] `dashboard/src/components/TierBadge.tsx` — PRO (violet) / BASIC (blue) / FREE (zinc)
- [x] `dashboard/src/components/ReputationGauge.tsx` — pure SVG circular progress (0–100)
- [x] `dashboard/src/components/SkillCard.tsx` — bazaar grid card
- [x] `dashboard/src/components/StatsBar.tsx` — three stat cards with skeleton loading
- [x] `dashboard/src/components/PaymentModal.tsx` — 5-step wallet flow (connect → switch to Mantle → pay → success/error)
- [x] `dashboard/src/app/page.tsx` — landing page (hero, stats, feature cards, CTA footer)
- [x] `dashboard/src/app/bazaar/page.tsx` — search + tier filter + score slider + sort; 3-col grid
- [x] `dashboard/src/app/skill/[id]/page.tsx` — metadata, Chart.js reputation bar chart, masked endpoint, payment modal, job feed
- [x] `dashboard/src/app/list/page.tsx` — register form (name/version/endpoint/price/escrow/metadataURI/tier); wallet-connect flow
- [x] `dashboard/src/app/jobs/page.tsx` — live polling table with score pills and mantlescan tx links

**Demo Agents**
- [x] `agents/src/types.ts` — shared script types
- [x] `agents/src/spawn-skills.ts` — registers 3 Spawn Protocol skills in SkillRegistry + BazaarListings; `--serve` flag runs a port-3003 skill endpoint server
- [x] `agents/src/demo-consumer.ts` — end-to-end demo: discover skill → build EIP-712 payment proof → POST /facilitate → execute skill with access token
- [x] `agents/tsconfig.json` — local TypeScript config

---

### Shipped since this plan ✅

**SDK (`@ishitaaaaw/x402-mantle`)** — implemented and published to npm (`0.1.0`)
- [x] `sdk/src/client.ts` — `LedgerForgeClient` (listSkills, invoke, callSkill, settlement receipts)
- [x] `sdk/src/utils.ts` — EIP-712/EIP-3009 sig builder, token amount formatting
- [x] `sdk/src/types.ts` — public types (SkillListing, PaymentChallenge, SettlementReceipt)

**Operations** — done
- [x] Contracts deployed + verified on Mantle mainnet (addresses in §4)
- [x] ERC-8004 Identity + Reputation registries wired (canonical `0x8004…` addresses)
- [x] Indexer + facilitator live on Fly.io; dashboard live on Vercel
- [x] Skills seeded; demo agents (Scout / Perps Coach / Spawn Auditor) settle end-to-end on mainnet

### Genuinely remaining (roadmap, not done)

- [ ] **Remove the single trusted operator** — threshold-signed settlement (M-of-N) so no one key can release escrow or write reputation. This is the headline limitation; see the Trust model section of the README.
- [ ] Optimistic completion with a challenge window (provider posts result + bond; auto-release unless challenged).
- [ ] Staked reputation + slashing so scores carry economic weight rather than only "did it settle."
- [ ] Quality attestation (today reputation is usage-derived, not result-graded).
- [ ] Organic third-party demand — current volume is real but operator-seeded.
- [ ] Update README.md with real contract addresses and tx hashes
- [ ] Record 3-minute demo video for DoraHacks submission
