export interface X402PaymentDetails {
  scheme: "exact";
  network: `eip155:${number}`;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: `0x${string}`;
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
    signature: `0x${string}`;
    authorization: {
      from: `0x${string}`;
      to: `0x${string}`;
      amount: string;
      token: `0x${string}`;
      skillId: number;
      nonce: number;
      validBefore: number;
    };
  };
  reputationScore?: number;
}

export interface FacilitateRequest {
  paymentDetails: X402PaymentDetails;
  paymentProof: X402PaymentProof;
}

export interface SettlementResult {
  settlementTxHash: `0x${string}`;
  pullTxHash: `0x${string}`;
  createJobTxHash: `0x${string}`;
  completeJobTxHash: `0x${string}`;
  escrowJobId: string;
  skillRegistryRepTxHash?: `0x${string}`;
  erc8004FeedbackTxHash?: `0x${string}`;
  reputationScore: number;
}

export interface FacilitateResponse {
  success: boolean;
  settlementTxHash?: `0x${string}`;
  accessToken?: string;
  escrowJobId?: string;
  pullTxHash?: `0x${string}`;
  createJobTxHash?: `0x${string}`;
  completeJobTxHash?: `0x${string}`;
  skillRegistryRepTxHash?: `0x${string}`;
  erc8004FeedbackTxHash?: `0x${string}`;
  reputationScore?: number;
  error?: string;
}
