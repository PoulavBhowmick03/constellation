# Migration: Mantle → Celo

This repo is a fork of LedgerForge (Mantle build, `ledgerforge@34117fe`) ported to
**Celo mainnet**. The original Mantle repo is untouched. This document tracks
what changed and what remains.

## Target chain

| | Mantle (origin) | Celo (this repo) | Celo mainnet (later) |
|---|---|---|---|
| chainId | 5000 | **42220** | 42220 |
| RPC | rpc.mantle.xyz | forno.celo.org | forno.celo.org |
| Explorer | mantlescan.xyz | celoscan.io | celoscan.io |
| Native | MNT | CELO | CELO |
| Stable | USDe / USDC | cUSD / USDC | cUSD / USDC |

## Done ✅

- **Contracts** (`contracts/`): pure-EVM Solidity ported as-is. `Deploy.s.sol` token
  constants are now env-driven (`CUSD_ADDRESS`/`USDC_ADDRESS`, default Celo mainnet).
  `foundry.toml` verify config → CeloScan (mainnet). **`forge build` + 33
  `forge test` green.**
- **SDK** (`sdk/`): renamed `@ishitaaaaw/x402-mantle` → `@poulav/x402-celo`. viem
  `mantle` → `celo` (cast to `Chain` to absorb Celo's custom block formatters).
  Chain constants, RPC, explorer, tokens → Celo. EIP-712 domain chainId env-driven.
  **`tsc` build green.**
- **Facilitator** (`facilitator/`) + **Indexer** (`indexer/`): `mantleChain` → `celoChain`
  (id 42220, CELO native, forno RPC). EIP-712 verifier chainId env-driven. Allowed tokens
  → cUSD/USDC.
- **Dashboard** (`dashboard/`): wallet add/switch → Celo (`0xa4ec`, CELO,
  forno, celoscan). PaymentModal/useBrowserWalletClient/PreflightBanner viem chain →
  `celo`, EIP-712 chainId 42220. Explorer links → celoscan.io. Funding
  prompts → faucet.celo.org. **`tsc --noEmit` green.**
- **Agents** (`agents/`, 7 skill/demo files): inline `mantleChain` → `celoChain`, chain
  config + explorer links ported. **`tsc --noEmit` green.**
- **`.env.example`**: reframed for Celo; ERC-8004 left blank (graceful fallback).
- **README**: reframed for Celo + Superteam; fabricated Mantle addresses/tx hashes
  removed (deployment marked pending — see `DEPLOY.md`).

## Remaining

- **Testnet deploy** — gated on a funded Celo mainnet key (see `DEPLOY.md`). Once deployed,
  backfill addresses into `.env` / SDK constants / dashboard, and replace the README
  "pending" notes with real CeloScan links.
- **Branding strings left intact on purpose** (they are keys that must stay consistent
  across services / replay matching, or are infra names — rename as a deliberate, tested
  step, not a blind find-replace):
  - skill IDs: `mantle-tvl-monitor`, `mantle-gas-oracle`, `mantle-tx-classifier`
  - skill server file `agents/src/mantle-skills.ts` + `MANTLE_SKILL_*` env vars
  - fly app names (`ledgerforge-mantle.fly.dev`) and the `--lf-mantle` CSS color var
- **ERC-8004** — no canonical registry assumed on Celo; reputation is local-only until a
  registry address is configured.
- **cUSD vs EIP-3009** — escrow uses ERC-20 `transferFrom` (approve-based), not EIP-3009
  `transferWithAuthorization`; README wording updated to match. Confirm cUSD/USDC approve
  flow end-to-end against the live testnet deploy.
