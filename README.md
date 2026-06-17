# LedgerForge

**The reputation-native agent service marketplace for Mantle Network.**

---

## What It Does

The agent economy has a trust problem. When an autonomous agent wants to hire another agent — for code generation, data analysis, API access, or any on-demand compute — there is no reliable way to know which providers are trustworthy, what they charge, or whether they will deliver. Existing service marketplaces use off-chain ratings that can be gamed, are siloed per platform, and carry no cryptographic weight. Agents have no persistent economic identity and no track record that follows them across deployments.

LedgerForge solves this with three parts: an HTTP-native x402 payment rail that makes AI agents first-class economic participants on Mantle, an on-chain `SkillRegistry` that gives every service provider a permanent ERC-8004 identity, and automatic reputation updates written to the blockchain after every successful job execution. Every payment is escrowed, every settlement is on-chain, and every reputation score is derived directly from provable execution history — not self-reported ratings.

Mantle is the right chain for this. MNT gas costs are low enough to make per-execution reputation writes economically viable (not just per-listing). The Mantle ecosystem natively includes Ethena USDe as a stablecoin — the primary payment token for LedgerForge. And Mantle's ERC-8004 standard provides exactly the agent identity and reputation primitives the system requires. No other L2 has this combination ready today.

---

## How It Works

```
Consumer Agent                            Mantle Network
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
     │  3. POST /pay  (EIP-3009 USDe sig)
     │ ──────────────────────────────────▶ Facilitator
     │                                     │
     │                                     │  x402Escrow.lock() ──▶ Mantle
     │                                     │  (funds locked on-chain)
     │
     │  4. Job forwarded to provider
     │ ──────────────────────────────────▶ Provider Agent
     │ ◀──────────────────────────────────
     │     result + proof
     │
     │  5. Facilitator settles
     │                                     │
     │                                     │  x402Escrow.release() ──▶ Mantle
     │                                     │  (USDe → provider, fee → facilitator)
     │                                     │
     │                                     │  ERC8004.recordExecution() ──▶ Mantle
     │                                     │  (reputation++ for provider)
     │
     │  6. Settlement receipt
     │ ◀──────────────────────────────────
```

---

## Architecture

### Smart Contracts (Mantle Mainnet)

| Contract | Address | Role |
|---|---|---|
| `SkillRegistry` | [`0x37041F257Bf8f1E201497Dc0BCDa1ae0d8317992`](https://mantlescan.xyz/address/0x37041F257Bf8f1E201497Dc0BCDa1ae0d8317992) | Registers skills as ERC-8004 identities; stores endpoint URL, accepted tokens, price-per-call |
| `x402Escrow` | [`0x1d550b555B3a2e124ef611b55965848d6be233a2`](https://mantlescan.xyz/address/0x1d550b555B3a2e124ef611b55965848d6be233a2) | Holds payment in escrow via EIP-3009; released by facilitator after job completion |
| `BazaarListings` | [`0xaB5a52C30D769A7Eae1474857A6180E71765CBAF`](https://mantlescan.xyz/address/0xaB5a52C30D769A7Eae1474857A6180E71765CBAF) | Stores listing display metadata (name, description, tags, logoURI) |
| ERC-8004 Identity Registry | [`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`](https://mantlescan.xyz/address/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432) | Canonical ERC-8004 identity registry on Mantle (v2, verified) |
| ERC-8004 Reputation Registry | [`0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`](https://mantlescan.xyz/address/0x8004BAa17C55a88189AE136b182e5fdA19dE9b63) | Canonical ERC-8004 reputation registry on Mantle (v2.0.0 ERC-1967 proxy) |

### Facilitator Server

The facilitator is a TypeScript/Express HTTP server that coordinates x402 payments. It validates the signed payment, moves funds through `x402Escrow`, forwards the job to the provider, and releases payment after completion. After settlement, it writes the result to the ERC-8004 Reputation Registry so the provider's on-chain score moves with real usage. The facilitator fee defaults to 20 bps / 0.2%.

**Honest about the trust model:** today a single facilitator operator (one EOA) performs settlement and writes reputation. This is a deliberate v1 trade-off, not a claim of decentralization — the operator is trusted to release escrow and record scores. What makes it credible rather than hand-wavy is that every step is verifiable on-chain: escrow lock/release, the payout, and each reputation write emit events anyone can audit on Mantlescan, and the skill servers independently verify the settlement transaction on-chain before doing paid work, so the operator cannot fabricate access or silently skip a payout. Decentralizing this single operator is the top roadmap item — see [Trust model & limitations](#trust-model--limitations).

### The Bazaar

The Bazaar is discovery. The Next.js frontend and API read listings from `BazaarListings` or the indexer DB, then sort by ERC-8004 reputation data. Ranking is read-only, so the sort formula can change without redeploying contracts. Consumers can filter by token, price, and category.

---

## Live Demo

All services are live on Mantle Mainnet. No setup required to observe.

| Service | URL |
|---|---|
| **Bazaar Dashboard** | [dashboard-xi-sooty-72.vercel.app](https://dashboard-xi-sooty-72.vercel.app) |
| **Bazaar API / Indexer** | [ledgerforge-indexer.fly.dev](https://ledgerforge-indexer.fly.dev) |
| **Facilitator** | [ledgerforge-facilitator.fly.dev](https://ledgerforge-facilitator.fly.dev) |
| **Spawn skill server** | [ledgerforge-spawn.fly.dev](https://ledgerforge-spawn.fly.dev) |
| **Byreal skill server** | [ledgerforge-byreal.fly.dev](https://ledgerforge-byreal.fly.dev) |
| **Mantle data skill server** | [ledgerforge-mantle.fly.dev](https://ledgerforge-mantle.fly.dev) |

### Proven on-chain: autonomous agent run

The LedgerForge Scout agent (`npm run scout`) ran live on Mantle Mainnet, paying for 5 skills sequentially and writing an ENTER_POOL decision with 85% confidence. Every settlement is verifiable on Mantlescan:

| # | Skill | escrowJobId | `completeJob` tx |
|---|-------|-------------|-----------------|
| 1 | byreal-top-pools | `11` | [0xe7656e52fe…](https://mantlescan.xyz/tx/0xe7656e52fe69718cee61e126efdad3c27f932762ca1b45817dacedb5bf2f0d33) |
| 2 | aave-v3-rates | `12` | [0x257289318a…](https://mantlescan.xyz/tx/0x257289318a8825b9e5325eedd64047254e1c408780ba935d92975d4cd7b15b06) |
| 3 | token-price-feed | `13` | [0x4be1efebab…](https://mantlescan.xyz/tx/0x4be1efebabf15dcb9e9a45684cdae057722e00ef1be3ecdfac9fb9fd5f8d9199) |
| 4 | mantle-gas-oracle | `14` | [0x985dbd374d…](https://mantlescan.xyz/tx/0x985dbd374d1ae880ac2e4005c44984af140a30078aee604c23eb1bfe93c06740) |
| 5 | byreal-swap-preview | `15` | [0xd55feeb0f3…](https://mantlescan.xyz/tx/0xd55feeb0f390d88353a42af480ab0c6e68f5d689501f424b6aba7990f8b5c7d1) |

Each row = 5 Mantle txs (pull -> createJob -> completeJob -> SkillRegistry rep -> ERC-8004 feedback). One agent run = **25 on-chain transactions**.

Current stats: **18 skills registered · 122 jobs settled · ~5.83 USDC total revenue** _(live as of 2026-06-14; always-current numbers at [`/stats`](https://ledgerforge-indexer.fly.dev/stats))_. Volume is intentionally small: these are real mainnet settlements at ~0.05 USDC/job driven by our own demo agents, not simulated activity. The point of the hackathon build is a working rail with verifiable on-chain receipts, not GMV.

---

## Quick Start

### Use the live deployment (no setup)

```bash
# Browse the skill registry
curl https://ledgerforge-indexer.fly.dev/skills | jq '.skills[] | {skillId, name, endpoint}'

# Check live job settlements
curl https://ledgerforge-indexer.fly.dev/jobs | jq '.[0]'

# Get payment details for a skill
curl "https://ledgerforge-facilitator.fly.dev/payment-details?skillId=11&amount=200000"

# Call a skill directly (simulated payment token)
curl "https://ledgerforge-mantle.fly.dev/mantle-tvl-monitor" \
  -H "Authorization: Bearer settled:0xyourtxhash:$(date +%s)"
```

### SDK usage

```bash
npm install @ishitaaaaw/x402-mantle
```

```typescript
import { LedgerForgeClient } from '@ishitaaaaw/x402-mantle'

const client = new LedgerForgeClient({
  facilitatorUrl: 'https://ledgerforge-facilitator.fly.dev',
  bazaarApiUrl: 'https://ledgerforge-indexer.fly.dev',
  privateKey: process.env.CONSUMER_PRIVATE_KEY,
  rpcUrl: 'https://rpc.mantle.xyz',
})

// Browse and pay for a skill in one call
const result = await client.invokeSkill(11, { query: 'top Mantle protocols by TVL' })
console.log(result.data)           // live TVL from DeFiLlama
console.log(result.settlementTxHash) // on-chain proof
```

### Run the demo agents

LedgerForge ships **three independent autonomous agents** on the same SDK: different domains, different decision shapes, one rail. Each agent pays for multiple skills, leaves on-chain proof for every settlement, and writes a markdown + JSON digest.

| Agent | Domain | Skills called | Decision shape | Live run |
|---|---|---|---|---|
| **Scout** | DeFi yield rotation | byreal-top-pools, aave-v3-rates, token-price-feed, mantle-gas-oracle, byreal-swap-preview | `ENTER_POOL` / `STAY` (with confidence + reasoning) | `npm run scout` |
| **Perps Coach** | Byreal perps trading | byreal-perps-signals × N, token-price-feed, mantle-gas-oracle | Per-position: `HOLD` / `REDUCE` / `TAKE_PROFIT` / `AVOID` | `npm run perps-coach` |
| **Spawn Auditor** | AI deploy provenance / audit | spawn-failure-analyst, lineage-context-builder, decision-hash-verifier | `APPROVE` / `BLOCK` with rationale + remediations | `npm run spawn-auditor` |

Each has a free dry-run variant (e.g. `npm run scout:dry-run`) that exercises the full pipeline without broadcasting. `npm run demos:dry-run` runs all three in sequence as an end-to-end smoke test.

```bash
cd agents
npm run demos:dry-run          # all three agents, no on-chain settlements
npm run scout                  # live: ~0.25 USDC, 25 Mantle txs, writes a digest
npm run perps-coach            # live: scans 3 positions, recommends actions
npm run spawn-auditor          # live: audits a Spawn deployment, verdicts APPROVE/BLOCK
```

Outputs land in `agents/scout-runs/`, `agents/perps-coach-runs/`, and `agents/spawn-auditor-runs/`. Each run produces a markdown digest for review and a parallel JSON file for parsing. Demo-provider keys are kept in memory and printed to stderr only; they never touch disk.

#### Worked example: Scout

The Scout agent is the most illustrative end-to-end demo of the rail. In ~2 minutes it:

1. Calls `byreal-top-pools` (paid): top Byreal CLMM pools by 24h APR
2. Calls `aave-v3-rates` (paid): Aave V3 USDC supply APY on Mantle
3. Calls `token-price-feed` (paid): live USDC/USDe stablecoin prices
4. Calls `mantle-gas-oracle` (paid): current swap gas cost in USD
5. **Decides**: if (top pool APR - Aave supply APY) > 5pp and gas < $1, ENTER_POOL
6. If ENTER_POOL: calls `byreal-swap-preview` (paid), models the rotation, captures price impact

That's 5 settlements × 5 mainnet txs each = **25 verifiable on-chain transactions** to produce one rebalance recommendation. Every settlement appears in the digest with paste-able mantlescan links for both the escrow `completeJob` payout and the ERC-8004 `giveFeedback` reputation write.

**Configure thresholds** via env vars: `SCOUT_PRICE_PER_CALL`, `SCOUT_MIN_APR_DELTA_PCT`, `SCOUT_MAX_GAS_USD`. Each agent has its own equivalent env block; see `agents/src/<agent>.ts` for the full list.

### Run the multi-agent client simulator

```bash
cd agents
npm run simulate-clients   # five personas, infinite loop, round scorecard
```

### Local development

```bash
git clone https://github.com/PoulavBhowmick03/ledgerforge
cd ledgerforge
cp .env.example .env
# Fill OPERATOR_PRIVATE_KEY and CONSUMER_PRIVATE_KEY; contracts are already deployed

cd indexer   && npm install && npm run dev &
cd facilitator && npm install && npm run dev &
cd dashboard   && npm install && npm run dev   # -> http://localhost:3000
```

See [AGENTS.md](./AGENTS.md) for the full runbook, Makefile targets, and known gotchas.

---

## Deployed Contracts

| Contract | Address | Mantlescan |
|---|---|---|
| SkillRegistry | `0x37041F257Bf8f1E201497Dc0BCDa1ae0d8317992` | [View](https://mantlescan.xyz/address/0x37041F257Bf8f1E201497Dc0BCDa1ae0d8317992) |
| x402Escrow | `0x1d550b555B3a2e124ef611b55965848d6be233a2` | [View](https://mantlescan.xyz/address/0x1d550b555B3a2e124ef611b55965848d6be233a2) |
| BazaarListings | `0xaB5a52C30D769A7Eae1474857A6180E71765CBAF` | [View](https://mantlescan.xyz/address/0xaB5a52C30D769A7Eae1474857A6180E71765CBAF) |
| ERC-8004 Reputation Registry | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` | [View](https://mantlescan.xyz/address/0x8004BAa17C55a88189AE136b182e5fdA19dE9b63) |
| ERC-8004 Identity Registry | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | [View](https://mantlescan.xyz/address/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432) |
| Deployer / Operator | `0xC0296012Cfbb0e6DF5dA7158B65Dbc46DD9650e0` | [View](https://mantlescan.xyz/address/0xC0296012Cfbb0e6DF5dA7158B65Dbc46DD9650e0) |

---

## Trust model & limitations

We would rather state this plainly than have a judge find it.

**What is trustless / verifiable today**
- **Payments.** Funds move through `x402Escrow` via EIP-3009. The consumer signs an exact-amount authorization; the operator cannot pull more than was signed.
- **Receipts.** Every job emits on-chain events — `createJob`, `completeJob`, the SkillRegistry reputation write, and the ERC-8004 feedback write. Anyone can reconstruct the full history from Mantle logs; the indexer is a convenience, not the source of truth.
- **Access.** Skill servers verify the settlement transaction on-chain (a real successful `completeJob` against `x402Escrow`) before doing paid work. The access token is not a forgeable string — free-riding requires an actual on-chain settlement.

**What is trusted today (the honest part)**
- A **single facilitator operator (one EOA)** decides that a job is complete, releases escrow, and writes the reputation update. It is the only reputation writer we use. A malicious or offline operator could refuse to settle, write a wrong score, or stall payouts. The on-chain trail makes such behaviour *detectable and disputable*, but does not yet *prevent* it.
- Reputation is **usage-derived, not stake-weighted**, so it reflects "did jobs settle," not "was the result good." Quality attestation is out of scope for v1.
- **Volume is small and operator-seeded.** The settlements are real, but they are produced by our own demo agents — there is no organic third-party demand yet.

**Roadmap to remove the trusted operator**
1. Threshold-signed settlement (M-of-N operator set) so no single key can release escrow or write reputation.
2. Optimistic completion with a challenge window: provider posts result + bond, escrow auto-releases unless challenged.
3. Staked reputation + slashing so a bad score carries economic weight.

## Tracks

| Track | Justification |
|---|---|
| **Agentic Wallets & Economy** (Byreal) | LedgerForge is payment infrastructure built specifically for autonomous agents: the x402 rail, EIP-3009 escrow, and per-execution stablecoin settlement are the core product — not a wrapper around an existing payment system |
| **AI DevTools** | The `@ishitaaaaw/x402-mantle` TypeScript SDK and the Bazaar discovery API are developer tools: any developer can register a skill and start monetizing an agent capability in under 10 minutes |

---

## Revenue Model

1. **Facilitator settlement fee** — 0.2% (20 basis points) taken from every settled job. Scales linearly with marketplace payment volume. No fees on failed or cancelled jobs.
2. **Listing fee** — Optional one-time MNT fee to register a skill in `BazaarListings`. Configurable per-deploy; set to zero for hackathon to bootstrap supply.
3. **Priority ranking boost** — Providers can stake MNT to boost their Bazaar ranking above the reputation-derived floor. Staking revenue goes to a DAO treasury (post-hackathon roadmap item).
4. **Hosted facilitator subscription** — Enterprise consumers using the `@ishitaaaaw/x402-mantle` SDK at high volume can subscribe to a rate-limited managed facilitator endpoint rather than self-hosting, paying a flat monthly fee.

---

## Team

| Name | Role |
|---|---|
| **Poulav Bhowmick** | Smart contracts, facilitator server, SDK |
| **Ishita** | Dashboard, agent integrations, design |
