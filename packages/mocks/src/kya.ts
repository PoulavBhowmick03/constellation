import {
  MOCK_PROOF,
  MOCK_PUBLIC_INPUTS,
  MOCK_VERIFIER,
  attestationWithZk,
  fixtureNameFromAgentRef,
  mockAgentReports,
} from "./fixtures.js";
import type {
  AgentRef,
  AttestationMode,
  AttestationResult,
  KyaReport,
  VerificationResult,
} from "./types.js";

export class KyaMockService {
  constructor(private readonly attestationMode: AttestationMode = "mixed") {}

  private report(agentRef: AgentRef): KyaReport {
    return mockAgentReports[fixtureNameFromAgentRef(agentRef)];
  }

  async get_flags(args: { agent_ref: AgentRef }) {
    const report = this.report(args.agent_ref);
    return { flags: report.flags, as_of: report.as_of };
  }

  async check_agent(args: { agent_ref: AgentRef }) {
    return this.report(args.agent_ref);
  }

  async attest_agent(args: { agent_ref: AgentRef }): Promise<AttestationResult> {
    const report = this.report(args.agent_ref);
    if (this.attestationMode === "available") {
      return attestationWithZk(report);
    }
    if (this.attestationMode === "roadmap") {
      return { ...report, zk: { available: false, reason: "roadmap" } };
    }
    return fixtureNameFromAgentRef(args.agent_ref) === "agent_good"
      ? attestationWithZk(report)
      : { ...report, zk: { available: false, reason: "roadmap" } };
  }

  async verify_attestation(args: {
    proof: `0x${string}`;
    public_inputs: readonly string[];
  }): Promise<VerificationResult> {
    const valid =
      args.proof === MOCK_PROOF &&
      args.public_inputs.length === MOCK_PUBLIC_INPUTS.length &&
      args.public_inputs.every((value, index) => value === MOCK_PUBLIC_INPUTS[index]);

    return valid
      ? { valid: true, verifier: { chain: "eip155:196", address: MOCK_VERIFIER } }
      : { valid: false, verifier: null };
  }
}
