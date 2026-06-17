# LedgerForge — Celo mainnet deployment

**Deployed & verified on Celo mainnet (chainId 42220)** from
`0xC0296012Cfbb0e6DF5dA7158B65Dbc46DD9650e0` (deployer = operator = owner).

| Contract | Address | CeloScan |
|---|---|---|
| `SkillRegistry` | `0x526DAe5c605E45c55141CddEA7b6751E149fB894` | https://celoscan.io/address/0x526DAe5c605E45c55141CddEA7b6751E149fB894 |
| `x402Escrow` | `0xA89492AD59A9bac099604d0745268B1714F8BD4F` | https://celoscan.io/address/0xA89492AD59A9bac099604d0745268B1714F8BD4F |
| `BazaarListings` | `0x7d0982b178D3Ca2B6A59fFdeBcb41d9A7168341b` | https://celoscan.io/address/0x7d0982b178D3Ca2B6A59fFdeBcb41d9A7168341b |

All three contracts are source-verified on CeloScan.

**Tokens:** cUSD `0x765DE816845861e75A25fCA122bb6898B8B1282a`, native USDC
`0xcebA9300f2b948710d2653dD7B07f33A8B32118C`.

Addresses are wired into `sdk/src/constants.ts` `DEFAULTS`. To run the off-chain
services, set `SKILL_REGISTRY_ADDRESS` / `X402_ESCROW_ADDRESS` /
`BAZAAR_LISTINGS_ADDRESS` + `OPERATOR_PRIVATE_KEY` in `.env` (see `DEPLOY.md`).
