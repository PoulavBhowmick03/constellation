/** Chains KYA reads registries on. X Layer availability is unconfirmed. */
export type RegistryChain = "eip155:1" | "eip155:8453";

/** agent_ref, exactly per docs/INTERFACES.md conventions. */
export type AgentRef =
  | { kind: "erc8004"; chain: string; registry: string; agent_id: number }
  | { kind: "wallet"; chain: string; address: string };

/** One ERC-721 Transfer of the identity token — the continuity signal KYA scores. */
export interface IdentityTransfer {
  tx: string;
  at: string; // ISO-8601 UTC
  from: string;
  to: string;
  blockNumber: number;
}

export interface IdentityRecord {
  chain: RegistryChain;
  registry: string;
  agentId: number;
  owner: string;
  /** Full transfer history of the identity token, oldest first (mint included). */
  transfers: IdentityTransfer[];
}

/** Error shape for reads that cannot be performed honestly. */
export type RegistryError =
  | { code: "NOT_CONFIGURED"; message: string }
  | { code: "ABI_UNVERIFIED"; message: string }
  | { code: "READ_FAILED"; message: string };

export type RegistryResult<T> = { ok: true; value: T } | { ok: false; error: RegistryError };
