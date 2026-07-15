import { describe, expect, it } from "vitest";

import {
  KYA_ROADMAP_PRICES,
  KYA_TOOL_NAMES,
  KyaToolServer,
  PaymentRequiredError,
  agentGood,
} from "../src/index.js";
import type { AgentRef, EvidenceSource } from "../src/index.js";
import type {
  Money,
  PaymentAdapter,
  PaymentContext,
  PayAndCallResult,
  RequirePaymentResult,
} from "@constellation/payment-adapter";

const agentRef: AgentRef = {
  kind: "erc8004",
  chain: "eip155:8453",
  registry: agentGood.registrations[0]!.registry,
  agent_id: agentGood.registrations[0]!.agent_id,
};

class FixtureEvidenceSource implements EvidenceSource {
  async getEvidence(): Promise<typeof agentGood> {
    return agentGood;
  }
}

class RecordingPayments implements PaymentAdapter {
  readonly calls: string[] = [];

  constructor(private readonly paid: boolean) {}

  async requirePayment(
    tool: string,
    _context: PaymentContext,
  ): Promise<RequirePaymentResult> {
    this.calls.push(tool);
    return this.paid
      ? { status: "paid", price: null, receiptId: "test_receipt" }
      : {
          status: "payment_required",
          price: { token: "USDT", amount: "1", decimals: 6 },
          challenge: { reason: "payment required", accepts: "test" },
        };
  }

  async payAndCall<T>(
    _endpoint: string,
    _tool: string,
    _args: unknown,
    _budgetCap: Money,
  ): Promise<PayAndCallResult<T>> {
    return {
      ok: false,
      error: { code: "NOT_IMPLEMENTED", message: "not used by KYA" },
    };
  }
}

describe("KYA tool server stub", () => {
  it("exposes the four frozen KYA tool names", () => {
    expect(KYA_TOOL_NAMES).toEqual([
      "get_flags",
      "check_agent",
      "attest_agent",
      "verify_attestation",
    ]);
  });

  it("uses check_agent pricing for roadmap attestations", () => {
    expect(KYA_ROADMAP_PRICES.attest_agent).toEqual(
      KYA_ROADMAP_PRICES.check_agent,
    );
  });

  it("gates each handler through payment-adapter", async () => {
    const payments = new RecordingPayments(true);
    const server = new KyaToolServer(payments, new FixtureEvidenceSource());

    await server.getFlags({ agent_ref: agentRef });
    await server.checkAgent({ agent_ref: agentRef });
    await server.attestAgent({ agent_ref: agentRef });
    await server.verifyAttestation({ proof: "0x01", public_inputs: [] });

    expect(payments.calls).toEqual(KYA_TOOL_NAMES);
  });

  it("returns the full report with explicit ZK roadmap degradation", async () => {
    const server = new KyaToolServer(
      new RecordingPayments(true),
      new FixtureEvidenceSource(),
    );

    const response = await server.attestAgent({ agent_ref: agentRef });

    expect(response.score).toBe(86);
    expect(response.components.identity_continuity.evidence).toBeDefined();
    expect(response.zk).toEqual({ available: false, reason: "roadmap" });
  });

  it("does not claim an absent roadmap proof is valid", async () => {
    const server = new KyaToolServer(
      new RecordingPayments(true),
      new FixtureEvidenceSource(),
    );

    await expect(
      server.verifyAttestation({ proof: "0x01", public_inputs: [] }),
    ).resolves.toEqual({ valid: false, verifier: null });
  });

  it("stops before scoring when payment is missing", async () => {
    const server = new KyaToolServer(
      new RecordingPayments(false),
      new FixtureEvidenceSource(),
    );

    await expect(server.checkAgent({ agent_ref: agentRef })).rejects.toBeInstanceOf(
      PaymentRequiredError,
    );
  });
});
