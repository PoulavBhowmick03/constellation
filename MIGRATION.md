# Migration: Mantle → Celo

This repo is a fork of LedgerForge (Mantle build, `ledgerforge@34117fe`) ported to
**Celo Alfajores testnet**. The original Mantle repo is untouched. This document tracks
what changed and what remains.

## Target chain

| | Mantle (origin) | Celo Alfajores (this repo) | Celo mainnet (later) |
|---|---|---|---|
| chainId | 5000 | **44787** | 42220 |
| RPC | rpc.mantle.xyz | alfajores-forno.celo-testnet.org | forno.celo.org |
| Explorer | mantlescan.xyz | alfajores.celoscan.io | celoscan.io |
| Native | MNT | CELO | CELO |
| Stable | USDe / USDC | cUSD / USDC | cUSD / USDC |

## Done ✅

- **Contracts** (`contracts/`): pure-EVM Solidity ported as-is. `Deploy.s.sol` token
  constants are now env-driven (`CUSD_ADDRESS`/`USDC_ADDRESS`, default Alfajores).
  `foundry.toml` verify config → CeloScan (alfajores + mainnet). **`forge build` + 33
  `forge test` green.**
- **SDK** (`sdk/`): renamed `@ishitaaaaw/x402-mantle` → `@ishitaaaaw/x402-celo`. viem
  `mantle` → `celoAlfajores` (cast to `Chain` to absorb Celo's custom block formatters).
  Chain constants, RPC, explorer, tokens → Celo. EIP-712 domain chainId env-driven.
  **`tsc` build green.**
- **Facilitator** (`facilitator/`) + **Indexer** (`indexer/`): `mantleChain` → `celoChain`
  (id 44787, CELO native, forno RPC). EIP-712 verifier chainId env-driven. Allowed tokens
  → cUSD/USDC.
- **Dashboard** (`dashboard/`): wallet add/switch → Celo Alfajores (`0xaef3`, CELO,
  forno, celoscan). PaymentModal/useBrowserWalletClient/PreflightBanner viem chain →
  `celoAlfajores`, EIP-712 chainId 44787. Explorer links → alfajores.celoscan.io. Funding
  prompts → faucet.celo.org. **`tsc --noEmit` green.**
- **Agents** (`agents/`, 7 skill/demo files): inline `mantleChain` → `celoChain`, chain
  config + explorer links ported. **`tsc --noEmit` green.**
- **`.env.example`**: reframed for Celo; ERC-8004 left blank (graceful fallback).
- **README**: reframed for Celo + Superteam; fabricated Mantle addresses/tx hashes
  removed (deployment marked pending — see `DEPLOY.md`).

## Remaining

- **Testnet deploy** — gated on a funded Alfajores key (see `DEPLOY.md`). Once deployed,
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
