# Deploying LedgerForge to Celo Mainnet

Celo mainnet (chainId **42220**), RPC `https://forno.celo.org`, explorer
`https://celoscan.io`. **This spends real funds and is irreversible** — double-check the
deployer balance and token addresses before broadcasting.

## 0. Prerequisites

- [Foundry](https://book.getfoundry.sh/) (`forge`, `cast`)
- A funded Celo mainnet deployer key (real CELO for gas)
- A CeloScan API key (https://celoscan.io) for contract verification

## 1. Configure env

```bash
cp .env.example .env
```

Fill `.env` (gitignored — never commit):

| Var | Value |
|---|---|
| `DEPLOYER_PRIVATE_KEY` | funded Celo mainnet key |
| `CELO_RPC` | `https://forno.celo.org` |
| `CELO_CHAIN_ID` | `42220` |
| `CELOSCAN_API_KEY` | from celoscan.io |
| `CUSD_ADDRESS` | `0x765DE816845861e75A25fCA122bb6898B8B1282a` (default) |
| `USDC_ADDRESS` | `0xcebA9300f2b948710d2653dD7B07f33A8B32118C` (default) |

Check the deployer balance first:
```bash
cast balance <DEPLOYER_ADDRESS> --rpc-url https://forno.celo.org --ether
```

## 2. Build & test

```bash
cd contracts
forge build
forge test            # expect 33 passing
```

## 3. Deploy (broadcasts real transactions)

```bash
cd contracts
forge script script/Deploy.s.sol \
  --rpc-url https://forno.celo.org \
  --private-key "$DEPLOYER_PRIVATE_KEY" \
  --broadcast --verify --etherscan-api-key "$CELOSCAN_API_KEY"
```

Prints on success:
```
SKILL_REGISTRY_ADDRESS=0x...
X402_ESCROW_ADDRESS=0x...
BAZAAR_LISTINGS_ADDRESS=0x...
```

## 4. Backfill addresses

Copy the three addresses into:
1. `.env` — `SKILL_REGISTRY_ADDRESS`, `X402_ESCROW_ADDRESS`, `BAZAAR_LISTINGS_ADDRESS`
2. `sdk/src/constants.ts` `DEFAULTS` (or rely on the env reads)
3. `dashboard/.env.local` (`CONTRACTS` map)

Set `OPERATOR_ADDRESS` / `PROVIDER_ADDRESS` (must differ):
```bash
cast wallet address --private-key $OPERATOR_PRIVATE_KEY
```

## 5. Run the stack

```bash
cd facilitator && npm install && npm run dev
cd indexer     && npm install && npm run dev
cd dashboard   && npm install && npm run dev
```

Verify a skill registration + a settlement on https://celoscan.io.

## Tokens (Celo mainnet)

- cUSD `0x765DE816845861e75A25fCA122bb6898B8B1282a`
- USDC (native, Circle) `0xcebA9300f2b948710d2653dD7B07f33A8B32118C`

## ERC-8004 note

No canonical ERC-8004 registry is assumed on Celo. `SkillRegistry` try/catches the
identity-registry call, so leaving `ERC8004_REPUTATION_REGISTRY` /
`ERC8004_IDENTITY_REGISTRY` blank yields local-only reputation.
