import type { Money } from "@constellation/indexer";

export type ChainId = `eip155:${number}`;

export type MockAgentFixtureName =
  | "agent_good"
  | "agent_transferred_identity"
  | "agent_sybil_burst";

export type MockWalletFixtureName = "wallet_with_history";

export type MockFixtureName = MockAgentFixtureName | MockWalletFixtureName;

export interface AgentRefErc8004 {
  readonly kind: "erc8004";
  readonly chain: ChainId;
  readonly registry: `0x${string}`;
  readonly agent_id: number;
}

export interface AgentRefWallet {
  readonly kind: "wallet";
  readonly chain: ChainId;
  readonly address: `0x${string}`;
}

export type AgentRef = AgentRefErc8004 | AgentRefWallet;

export type KyaFlag =
  | "IDENTITY_TRANSFERRED_RECENTLY"
  | "REVIEWER_CONCENTRATION"
  | "BURST_FEEDBACK"
  | "UNREACHABLE_ENDPOINT"
  | "NO_DOMAIN_VERIFICATION"
  | "ZERO_HISTORY";

export interface AgentRegistration {
  readonly chain: ChainId;
  readonly registry: `0x${string}`;
  readonly agent_id: number;
}

export interface IdentityTransfer {
  readonly tx: `0x${string}`;
  readonly at: string;
  readonly from: `0x${string}`;
  readonly to: `0x${string}`;
}

export interface KyaReport {
  readonly score: number;
  readonly components: {
    readonly identity_continuity: {
      readonly score: number;
      readonly weight: number;
      readonly evidence: {
        readonly transfers: readonly IdentityTransfer[];
        readonly feedback_before_last_transfer: number;
        readonly days_since_last_transfer: number | null;
      };
    };
    readonly feedback_graph: {
      readonly score: number;
      readonly weight: number;
      readonly evidence: {
        readonly feedback_count: number;
        readonly distinct_reviewers: number;
        readonly top3_reviewer_share: number;
        readonly max_share_72h_window: number;
      };
    };
    readonly registration_hygiene: {
      readonly score: number;
      readonly weight: number;
      readonly evidence: {
        readonly agent_uri_resolves: boolean;
        readonly endpoints_reachable: boolean;
        readonly domain_verification: boolean;
      };
    };
    readonly longevity_activity: {
      readonly score: number;
      readonly weight: number;
      readonly evidence: {
        readonly registered_days: number;
        readonly active_days_30d: number;
      };
    };
  };
  readonly flags: readonly KyaFlag[];
  readonly registrations: readonly AgentRegistration[];
  readonly as_of: string;
}

export type AttestationResult =
  | (KyaReport & {
      readonly zk: {
        readonly available: true;
        readonly proof: `0x${string}`;
        readonly public_inputs: readonly string[];
        readonly model_commitment: `0x${string}`;
        readonly verifier: {
          readonly chain: ChainId;
          readonly address: `0x${string}`;
        };
        readonly scheme: "groth16-bn254-ezkl";
      };
    })
  | (KyaReport & {
      readonly zk: {
        readonly available: false;
        readonly reason: "roadmap";
      };
    });

export interface VerificationResult {
  readonly valid: boolean;
  readonly verifier: {
    readonly chain: ChainId;
    readonly address: `0x${string}`;
  } | null;
}

export interface MockWalletFixture {
  readonly name: MockWalletFixtureName;
  readonly address: `0x${string}`;
  readonly wallet_id: string;
  readonly indexed_from_block: number;
  readonly okb_balance: Money;
}

export interface RegisterChallenge {
  readonly challenge: {
    readonly nonce: string;
    readonly message: string;
    readonly expires_in_seconds: number;
  };
}

export interface RegisterOk {
  readonly ok: true;
  readonly wallet_id: string;
  readonly indexed_from_block: number;
}

export interface ToolError {
  readonly error: {
    readonly code:
      | "BAD_SIGNATURE"
      | "NONCE_EXPIRED"
      | "BAD_REQUEST"
      | "WALLET_NOT_FOUND"
      | "PAYMENT_REQUIRED";
    readonly message: string;
  };
}

export type AttestationMode = "available" | "roadmap" | "mixed";
