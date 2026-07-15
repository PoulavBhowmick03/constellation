import type {
  PaymentAdapter,
  PaymentContext,
  RequirePaymentResult,
} from "@constellation/payment-adapter";

import { getFlags, scoreAgent } from "./scoring.js";
import type { AgentEvidence, ChainId, KyaReport } from "./types.js";

export const KYA_TOOL_NAMES = [
  "get_flags",
  "check_agent",
  "attest_agent",
  "verify_attestation",
] as const;

export const KYA_ROADMAP_PRICES = Object.freeze({
  get_flags: { token: "USDT", amount: "20000", decimals: 6 },
  check_agent: { token: "USDT", amount: "250000", decimals: 6 },
  // Contract requirement: a degraded attestation charges check_agent pricing.
  attest_agent: { token: "USDT", amount: "250000", decimals: 6 },
  verify_attestation: null,
} as const);

export type AgentRef =
  | {
      readonly kind: "erc8004";
      readonly chain: ChainId;
      readonly registry: `0x${string}`;
      readonly agent_id: number;
    }
  | {
      readonly kind: "wallet";
      readonly chain: ChainId;
      readonly address: `0x${string}`;
    };

export interface EvidenceSource {
  getEvidence(agentRef: AgentRef): Promise<AgentEvidence>;
}

export interface VerifierReference {
  readonly chain: ChainId;
  readonly address: `0x${string}`;
}

export type VerificationResult =
  | { readonly valid: true; readonly verifier: VerifierReference }
  | { readonly valid: false; readonly verifier: null };

export interface AttestationVerifier {
  verify(
    proof: `0x${string}`,
    publicInputs: readonly string[],
  ): Promise<VerificationResult>;
}

export interface AgentRequest {
  readonly agent_ref: AgentRef;
}

export interface VerifyAttestationRequest {
  readonly proof: `0x${string}`;
  readonly public_inputs: readonly string[];
}

export type RoadmapAttestation = KyaReport & {
  readonly zk: {
    readonly available: false;
    readonly reason: "roadmap";
  };
};

/**
 * Keeps payment challenges out of successful tool response schemas. The MCP or
 * HTTP transport maps this error to its x402 response when that surface lands.
 */
export class PaymentRequiredError extends Error {
  readonly payment: RequirePaymentResult;

  constructor(payment: RequirePaymentResult) {
    super(payment.challenge?.reason ?? "payment required");
    this.name = "PaymentRequiredError";
    this.payment = payment;
  }
}

export class KyaToolServer {
  constructor(
    private readonly payments: PaymentAdapter,
    private readonly evidence: EvidenceSource,
    private readonly verifier?: AttestationVerifier,
  ) {}

  private async requirePayment(
    tool: (typeof KYA_TOOL_NAMES)[number],
    context: PaymentContext,
  ): Promise<void> {
    const payment = await this.payments.requirePayment(tool, context);
    if (payment.status !== "paid") {
      throw new PaymentRequiredError(payment);
    }
  }

  async getFlags(
    request: AgentRequest,
    paymentContext: PaymentContext = {},
  ): Promise<{ readonly flags: ReturnType<typeof getFlags>; readonly as_of: string }> {
    await this.requirePayment("get_flags", paymentContext);
    const evidence = await this.evidence.getEvidence(request.agent_ref);
    return {
      flags: getFlags(evidence),
      as_of: new Date(evidence.asOf).toISOString(),
    };
  }

  async checkAgent(
    request: AgentRequest,
    paymentContext: PaymentContext = {},
  ): Promise<KyaReport> {
    await this.requirePayment("check_agent", paymentContext);
    return scoreAgent(await this.evidence.getEvidence(request.agent_ref));
  }

  async attestAgent(
    request: AgentRequest,
    paymentContext: PaymentContext = {},
  ): Promise<RoadmapAttestation> {
    await this.requirePayment("attest_agent", paymentContext);
    const report = scoreAgent(await this.evidence.getEvidence(request.agent_ref));
    return {
      ...report,
      zk: { available: false, reason: "roadmap" },
    };
  }

  async verifyAttestation(
    request: VerifyAttestationRequest,
    paymentContext: PaymentContext = {},
  ): Promise<VerificationResult> {
    await this.requirePayment("verify_attestation", paymentContext);
    if (this.verifier === undefined) {
      return { valid: false, verifier: null };
    }
    return this.verifier.verify(request.proof, request.public_inputs);
  }
}
