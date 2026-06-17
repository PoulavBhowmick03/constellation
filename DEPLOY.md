# Deploying LedgerForge to Celo Alfajores (testnet)

This is the **build + testnet** runbook. Celo mainnet (chainId 42220) is a separate,
manual step — do not broadcast to mainnet from automation.

## 0. Prerequisites

- [Foundry](https://book.getfoundry.sh/) (`forge`, `cast`)
- Node 20+ and `npm`
- A deployer EOA private key (testnet-only; never reuse a mainnet key)

## 1. Fund a deployer on Alfajores

1. Generate a key (or use an existing testnet-only one):
   ```bash
   cast wallet new
   ```
2. Fund it with testnet CELO (gas) + cUSD from the faucet:
   - https://faucet.celo.org  → paste the address, select **Alfajores**.
3. Confirm balance:
   ```bash
   cast balance <ADDRESS> --rpc-url https://alfajores-forno.celo-testnet.org
   ```

## 2. Configure env

```bash
cp .env.example .env
```

Fill in `.env` (this file is gitignored — never commit it):

| Var | Value |
|---|---|
| `DEPLOYER_PRIVATE_KEY` | the funded Alfajores key from step 1 |
| `CELO_RPC` | `https://alfajores-forno.celo-testnet.org` |
| `CELO_CHAIN_ID` | `44787` |
| `CELOSCAN_API_KEY` | from https://celoscan.io (for `--verify`) |
| `CUSD_ADDRESS` | `0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1` (default) |
| `USDC_ADDRESS` | `0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B` (default) |

## 3. Build & test

```bash
cd contracts
forge build
forge test            # expect 33 passing
```

## 4. Deploy

```bash
cd contracts
forge script script/Deploy.s.sol \
  --rpc-url https://alfajores-forno.celo-testnet.org \
  --private-key "$DEPLOYER_PRIVATE_KEY" \
  --broadcast --verify --etherscan-api-key "$CELOSCAN_API_KEY"
```

The script prints, on success:

```
SKILL_REGISTRY_ADDRESS=0x...
X402_ESCROW_ADDRESS=0x...
BAZAAR_LISTINGS_ADDRESS=0x...
```

## 5. Backfill addresses

Copy the three printed addresses into:

1. `.env` — `SKILL_REGISTRY_ADDRESS`, `X402_ESCROW_ADDRESS`, `BAZAAR_LISTINGS_ADDRESS`
2. `sdk/src/constants.ts` `DEFAULTS` (or rely on the env reads — the SDK already
   prefers env vars and falls back to the zero address until set)
3. The dashboard's `CONTRACTS` map / env (`dashboard/.env.local`)

Set `OPERATOR_ADDRESS` / `PROVIDER_ADDRESS`:
```bash
cast wallet address --private-key $OPERATOR_PRIVATE_KEY
```

## 6. Run the stack

```bash
cd facilitator && npm install && npm run dev
cd indexer     && npm install && npm run dev
cd dashboard   && npm install && npm run dev
```

Verify a skill registration and a settlement appear on
https://alfajores.celoscan.io.

## ERC-8004 note

No canonical ERC-8004 registry is assumed on Celo yet. `SkillRegistry` try/catches the
identity-registry call, so leaving `ERC8004_REPUTATION_REGISTRY` / `ERC8004_IDENTITY_REGISTRY`
blank yields local-only reputation. Fill them once a Celo ERC-8004 deployment exists.

## Mainnet (later, manual)

Celo mainnet is chainId `42220`, RPC `https://forno.celo.org`, explorer
`https://celoscan.io`, cUSD `0x765DE816845861e75A25fCA122bb6898B8B1282a`. Re-run step 4
with those values and a **funded mainnet key**. This is intentionally out of scope for the
automated/testnet flow.
