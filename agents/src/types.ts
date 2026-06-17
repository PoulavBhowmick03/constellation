import type { Address, Hex } from "viem";

export interface SpawnSkillDefinition {
  name: string;
  version: string;
  description: string;
  endpointPath: string;
  priceUsdcUnits: bigint;
  requiresEscrow: boolean;
  metadataURI: string;
}

export interface RegisteredSpawnSkill extends SpawnSkillDefinition {
  skillId: bigint;
  erc8004AgentId: bigint;
  registrationTxHash: Hex;
  listingTxHash: Hex;
  endpoint: string;
}

export interface BazaarSkill {
  skillId: number | string | bigint;
  name: string;
  version?: string;
  endpoint: string;
  price?: string | number | bigint;
  priceUsdcUnits?: string | number | bigint;
  pricePerCallBps?: string | number | bigint;
  score?: number;
  reputationScore?: number;
  token?: Address;
  asset?: Address;
  requiresEscrow?: boolean;
}

export interface X402PaymentDetails {
  scheme: "exact";
  network: "eip155:5000";
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: Address;
  maxTimeoutSeconds: number;
  asset: Address;
  skillId: number;
  extra?: {
    name: string;
    version: string;
  };
}

export interface X402PaymentProof {
  scheme: "exact";
  network: "eip155:5000";
  payload: {
    signature: Hex;
    authorization: {
      from: Address;
      to: Address;
      amount: string;
      token: Address;
      skillId: number;
      nonce: number;
      validBefore: number;
    };
  };
  reputationScore?: number;
}

export interface FacilitateResponse {
  success: boolean;
  settlementTxHash?: Hex;
  accessToken?: string;
  error?: string;
}
