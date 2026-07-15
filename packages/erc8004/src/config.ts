import type { RegistryChain } from "./types.js";

/**
 * Registry deployments come ONLY from env. TODO(unverified): no official
 * ERC-8004 registry address has been human-verified for any chain yet — see
 * docs/status/P1.md "Questions for humans". An unset value disables that
 * chain's reads with NOT_CONFIGURED rather than guessing.
 */
export interface RegistryConfig {
  chain: RegistryChain;
  rpcUrl?: string;
  identityRegistry?: string;
  reputationRegistry?: string;
}

export interface Erc8004Env {
  ETHEREUM_RPC?: string;
  BASE_RPC?: string;
  ERC8004_IDENTITY_REGISTRY_ETH?: string;
  ERC8004_REPUTATION_REGISTRY_ETH?: string;
  ERC8004_IDENTITY_REGISTRY_BASE?: string;
  ERC8004_REPUTATION_REGISTRY_BASE?: string;
}

export function registryConfigs(env: Erc8004Env = process.env as Erc8004Env): RegistryConfig[] {
  return [
    {
      chain: "eip155:1",
      rpcUrl: env.ETHEREUM_RPC || undefined,
      identityRegistry: env.ERC8004_IDENTITY_REGISTRY_ETH || undefined,
      reputationRegistry: env.ERC8004_REPUTATION_REGISTRY_ETH || undefined,
    },
    {
      chain: "eip155:8453",
      rpcUrl: env.BASE_RPC || undefined,
      identityRegistry: env.ERC8004_IDENTITY_REGISTRY_BASE || undefined,
      reputationRegistry: env.ERC8004_REPUTATION_REGISTRY_BASE || undefined,
    },
  ];
}

export function configFor(
  chain: RegistryChain,
  env?: Erc8004Env,
): RegistryConfig | undefined {
  return registryConfigs(env).find((c) => c.chain === chain);
}
