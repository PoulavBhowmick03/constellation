import type { Address, Hex, PrivateKeyAccount, WalletClient } from "viem";

export type BazaarTier = "FREE" | "BASIC" | "PRO";

export interface SkillListing {
  skillId: number;
  owner: Address;
  name: string;
  version: string;
  endpoint: string;
  metadataURI: string;
  erc8004AgentId: number;
  registeredAt: number;
  totalJobs: number;
  averageScore: number;
  tier: BazaarTier;
  tierPaidUntil: number;
  active: boolean;
  lastUpdated: number;
}

export interface ListSkillsFilter {
  tier?: BazaarTier;
  minScore?: number;
  search?: string;
}

export interface PaymentChallenge {
  scheme: "exact";
  network: `eip155:${number}`;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: Address;
  maxTimeoutSeconds: number;
  asset: Address;
  skillId: number;
  extra?: { name: string; version: string };
}

export interface PaymentAuthorization {
  from: Address;
  to: Address;
  amount: string;
  token: Address;
  skillId: number;
  nonce: number;
  validBefore: number;
}

export interface PaymentProof {
  scheme: "exact";
  network: `eip155:${number}`;
  payload: {
    signature: Hex;
    authorization: PaymentAuthorization;
  };
  reputationScore?: number;
}

export interface SettlementReceipt {
  success: boolean;
  settlementTxHash: Hex;
  accessToken: string;
  explorerUrl: string;
  escrowJobId?: string;
  pullTxHash?: Hex;
  createJobTxHash?: Hex;
  completeJobTxHash?: Hex;
  skillRegistryRepTxHash?: Hex;
  erc8004FeedbackTxHash?: Hex;
  reputationScore?: number;
}

export interface InvokeResult<T = unknown> {
  skillId: number;
  skillName: string;
  output: T;
  receipt: SettlementReceipt;
}

export type SignerInput =
  | { privateKey: Hex; account?: never; walletClient?: never }
  | { account: PrivateKeyAccount; privateKey?: never; walletClient?: never }
  | { walletClient: WalletClient; account?: never; privateKey?: never };

export type LedgerForgeConfig = Partial<SignerInput> & {
  bazaarUrl?: string;
  facilitatorUrl?: string;
  rpcUrl?: string;
  chainId?: number;
  skillRegistry?: Address;
  operatorAddress?: Address;
  paymentTokens?: Record<string, Address>;
  explorerUrl?: string;
};

export interface CallSkillOptions {
  method?: "GET" | "POST";
  query?: Record<string, string | number | boolean>;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface InvokeOptions extends CallSkillOptions {
  recipient?: Address;
  token?: Address | "USDC" | "USDe";
  amount?: bigint | number | string;
  validForSeconds?: number;
  reputationScore?: number;
}
