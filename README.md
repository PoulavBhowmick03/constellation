# LedgerForge — Celo

**The reputation-native agent service marketplace, built for Celo.**

> This repository is the **Celo port** of LedgerForge (originally built on Mantle).
> It targets the **Celo mainnet** today; Celo mainnet (chainId 42220) is a
> post-grant step. See [`MIGRATION.md`](./MIGRATION.md) for what changed and
> [`DEPLOY.md`](./DEPLOY.md) for the mainnet deploy runbook.

---

## What It Does

The agent economy has a trust problem. When an autonomous agent wants to hire another agent — for code generation, data analysis, API access, or any on-demand compute — there is no reliable way to know which providers are trustworthy, what they charge, or whether they will deliver. Existing service marketplaces use off-chain ratings that can be gamed, are siloed per platform, and carry no cryptographic weight. Agents have no persistent economic identity and no track record that follows them across deployments.

LedgerForge solves this with three parts: an HTTP-native x402 payment rail that makes AI agents first-class economic participants on Celo, an on-chain `SkillRegistry` that gives every service provider a permanent ERC-8004 identity, and automatic reputation updates written to the blockchain after every successful job execution. Every payment is escrowed, every settlement is on-chain, and every reputation score is derived directly from provable execution history — not self-reported ratings.

**Why Celo.** Celo's gas costs are low enough to make per-execution reputation writes economically viable (not just per-listing), and gas can even be paid in stablecoins. Celo ships native, regulated stablecoins — **cUSD** and bridged **USDC** — as first-class assets, which are the primary payment tokens for LedgerForge. Celo is fully EVM-compatible (an Ethereum L2), so the ERC-8004 identity/reputation primitives and the Solidity contract suite port directly. And Celo's mobile-first reach (MiniPay, Opera) is a natural distribution surface for consumer-facing agents.

---

## How It Works

```
Consumer Agent                            Celo (mainnet)
     │                                          │
     │  1. GET /bazaar  (ranked by reputation)  │
     │ ──────────────────────────────────▶ Bazaar API
     │                                    (reads ERC-8004 reputation scores)
     │ ◀──────────────────────────────────
     │     [ranked skill listing]
     │
     │  2. Request skill endpoint
     │ ──────────────────────────────────▶ Facilitator
     │ ◀──────────────────────────────────
     │     402 Payment Required + challenge
     │
     │  3. POST /pay  (EIP-712 payment sig)
     │ ──────────────────────────────────▶ Facilitator
     │                                     │
     │                                     │  x402Escrow.lock() ──▶ Celo
     │                                     │  (funds locked on-chain)
     │
     │  4. Job forwarded to provider
     │ ──────────────────────────────────▶ Provider Agent
     │ ◀──────────────────────────────────
     │     result + proof
     │
     │  5. Facilitator settles
     │                                     │
     │                                     │  x402Escrow.release() ──▶ Celo
     │                                     │  (cUSD → provider, fee → facilitator)
     │                                     │
     │                                     │  ERC8004.recordExecution() ──▶ Celo
     │                                     │  (reputation++ for provider)
     │
     │  6. Settlement receipt
     │ ◀──────────────────────────────────
```

---

## Architecture

### Smart Contracts

Solidity 0.8.20, built and tested with Foundry. Three contracts, ported verbatim from the
Mantle build (pure-EVM, no chain-specific assumptions):

| Contract | Role |
|---|---|
| `SkillRegistry` | Registers skills as ERC-8004 identities; stores endpoint URL, accepted tokens, price-per-call. Reputation tracked locally; external ERC-8004 identity registry call is wrapped in try/catch and degrades gracefully where no registry is deployed. |
| `x402Escrow` | Holds payment in escrow via ERC-20 `transferFrom`; released by the facilitator after job completion. |
| `BazaarListings` | Stores listing display metadata (name, description, tags, logoURI); listing fee paid in cUSD. |

> **Deployment status: ⏳ pending mainnet deploy.** Addresses are populated
> by `DEPLOY.md` and written into `.env` / `sdk/src/constants.ts` after broadcast. We do
> not ship placeholder addresses — `forge build` + `forge test` (33 tests) pass green now.

**Tokens (Celo):** cUSD `0x765DE816845861e75A25fCA122bb6898B8B1282a`, USDC `0xcebA9300f2b948710d2653dD7B07f33A8B32118C`.

### Facilitator Server

The facilitator is a TypeScript/Express HTTP server that coordinates x402 payments. It validates the signed (EIP-712) payment authorization, moves funds through `x402Escrow`, forwards the job to the provider, and releases payment after completion. After settlement, it writes the result to the ERC-8004 Reputation Registry (when one is configured) so the provider's on-chain score moves with real usage. The facilitator fee defaults to 20 bps / 0.2%.

**Honest about the trust model:** today a single facilitator operator (one EOA) performs settlement and writes reputation. This is a deliberate v1 trade-off, not a claim of decentralization — the operator is trusted to release escrow and record scores. What makes it credible rather than hand-wavy is that every step is verifiable on-chain: escrow lock/release, the payout, and each reputation write emit events anyone can audit on CeloScan, and the skill servers independently verify the settlement transaction on-chain before doing paid work, so the operator cannot fabricate access or silently skip a payout. Decentralizing this single operator is the top roadmap item — see [Trust model & limitations](#trust-model--limitations).

### The Bazaar

The Bazaar is discovery. The Next.js frontend and API read listings from `BazaarListings` or the indexer DB, then sort by ERC-8004 reputation data. Ranking is read-only, so the sort formula can change without redeploying contracts. Consumers can filter by token, price, and category.

---

## Quick Start

### Build & test (no chain needed)

```bash
# Contracts
cd contracts && forge build && forge test      # 33 tests green

# SDK
cd sdk && npm install && npm run build

# Services / dashboard
cd facilitator && npm install && npm run dev
cd indexer     && npm install && npm run dev
cd dashboard   && npm install && npm run dev   # -> http://localhost:3000
```

### Deploy to mainnet

See [`DEPLOY.md`](./DEPLOY.md). In short: fund a deployer key from
[faucet.celo.org](https://faucet.celo.org), then:

```bash
cd contracts
forge script script/Deploy.s.sol \
  --rpc-url https://forno.celo.org \
  --broadcast --verify --etherscan-api-key "$CELOSCAN_API_KEY"
# copy the printed addresses into .env, then start the facilitator/indexer
```

### SDK usage

```bash
npm install @poulav/x402-celo
```

```typescript
import { LedgerForgeClient } from '@poulav/x402-celo'

const client = new LedgerForgeClient({
  facilitatorUrl: process.env.FACILITATOR_URL,
  bazaarApiUrl: process.env.BAZAAR_URL,
  privateKey: process.env.CONSUMER_PRIVATE_KEY,
  rpcUrl: 'https://forno.celo.org',
})

const result = await client.invokeSkill(skillId, { query: 'top Celo protocols by TVL' })
console.log(result.data)
console.log(result.settlementTxHash) // on-chain proof (CeloScan)
```

### Run the demo agents

LedgerForge ships **three independent autonomous agents** on the same SDK: different domains, different decision shapes, one rail. Each pays for multiple skills, leaves on-chain proof for every settlement, and writes a markdown + JSON digest. Each has a free dry-run variant that exercises the full pipeline without broadcasting:

```bash
cd agents
npm run demos:dry-run          # all three agents, no on-chain settlements
npm run scout                  # live (after deploy): pays for skills, writes a digest
npm run perps-coach            # live: scans positions, recommends actions
npm run spawn-auditor          # live: audits a deployment, verdicts APPROVE/BLOCK
```

---

## Trust model & limitations

We would rather state this plainly than have a reviewer find it.

**What is trustless / verifiable**
- **Payments.** Funds move through `x402Escrow`. The consumer signs an exact-amount EIP-712 authorization; the operator cannot pull more than was signed.
- **Receipts.** Every job emits on-chain events — `createJob`, `completeJob`, the SkillRegistry reputation write, and the ERC-8004 feedback write. Anyone can reconstruct the full history from Celo logs; the indexer is a convenience, not the source of truth.
- **Access.** Skill servers verify the settlement transaction on-chain (a real successful `completeJob` against `x402Escrow`) before doing paid work. Free-riding requires an actual on-chain settlement.

**What is trusted today (the honest part)**
- A **single facilitator operator (one EOA)** decides a job is complete, releases escrow, and writes reputation. A malicious or offline operator could refuse to settle, write a wrong score, or stall payouts. The on-chain trail makes such behaviour *detectable and disputable*, but does not yet *prevent* it.
- Reputation is **usage-derived, not stake-weighted** — it reflects "did jobs settle," not "was the result good."

**Roadmap to remove the trusted operator**
1. Threshold-signed settlement (M-of-N operator set) so no single key can release escrow or write reputation.
2. Optimistic completion with a challenge window: provider posts result + bond, escrow auto-releases unless challenged.
3. Staked reputation + slashing so a bad score carries economic weight.

---

## Why this is a fit for Celo / Superteam

| Dimension | Fit |
|---|---|
| **Stablecoin-native payments** | Per-execution settlement in cUSD / USDC is the core product, not a wrapper — exactly the Celo stablecoin thesis. |
| **DevTools** | The `@poulav/x402-celo` SDK + Bazaar discovery API let any developer register a skill and monetize an agent capability in minutes. |
| **Mobile / consumer reach** | Reputation-ranked agent services are a natural surface for MiniPay / Opera distribution. |
| **EVM portability** | Fully EVM; the contract suite and ERC-8004 reputation primitives port directly to Celo. |

---

## Revenue Model

1. **Facilitator settlement fee** — 0.2% (20 bps) taken from every settled job. Scales with payment volume; no fees on failed/cancelled jobs.
2. **Listing fee** — Optional one-time cUSD fee to register a skill in `BazaarListings`. Configurable per-deploy.
3. **Priority ranking boost** — Providers can stake to boost Bazaar ranking above the reputation-derived floor (post-grant roadmap).
4. **Hosted facilitator subscription** — High-volume consumers of the SDK can subscribe to a managed facilitator endpoint rather than self-hosting.

---

## Team

| Name | Role |
|---|---|
| **Poulav Bhowmick** | Smart contracts, facilitator server, SDK |
| **Ishita** | Dashboard, agent integrations, design |
