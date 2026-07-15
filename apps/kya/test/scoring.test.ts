import { describe, expect, it } from "vitest";

import {
  COMPONENT_WEIGHTS,
  agentGood,
  agentSybilBurst,
  agentTransferredIdentity,
  getFlags,
  scoreAgent,
} from "../src/index.js";
import type { AgentEvidence } from "../src/index.js";

describe("KYA golden agent fixtures", () => {
  it("keeps the frozen component weights", () => {
    expect(COMPONENT_WEIGHTS).toEqual({
      identity_continuity: 0.35,
      feedback_graph: 0.3,
      registration_hygiene: 0.2,
      longevity_activity: 0.15,
    });
  });

  it("scores agent_good near 85 with no flags and evidence on every component", () => {
    const report = scoreAgent(agentGood);

    expect(report.score).toBeGreaterThanOrEqual(80);
    expect(report.score).toBeLessThanOrEqual(90);
    expect(report.flags).toEqual([]);
    for (const component of Object.values(report.components)) {
      expect(component.evidence).toBeDefined();
    }
  });

  it("flags a recent identity transfer only when feedback predates it", () => {
    const report = scoreAgent(agentTransferredIdentity);

    expect(report.flags).toContain("IDENTITY_TRANSFERRED_RECENTLY");
    expect(report.components.identity_continuity).toMatchObject({
      score: 40,
      evidence: {
        feedback_before_last_transfer: 12,
        days_since_last_transfer: 12,
      },
    });
    expect(report.components.identity_continuity.evidence.transfers).toEqual(
      agentTransferredIdentity.transfers,
    );
  });

  it("scores agent_sybil_burst below 50 and trips both graph flags", () => {
    const report = scoreAgent(agentSybilBurst);

    expect(report.score).toBeLessThan(50);
    expect(report.flags).toEqual([
      "REVIEWER_CONCENTRATION",
      "BURST_FEEDBACK",
    ]);
    expect(report.components.feedback_graph).toMatchObject({
      score: 24,
      evidence: {
        feedback_count: 20,
        distinct_reviewers: 1,
        top3_reviewer_share: 1,
        max_share_72h_window: 1,
      },
    });
  });
});

describe("flag boundary rules", () => {
  it("does not flag a transfer without older feedback", () => {
    const evidence: AgentEvidence = {
      ...agentTransferredIdentity,
      feedback: agentTransferredIdentity.feedback.map((item) => ({
        ...item,
        at: "2026-07-04T12:00:00.000Z",
      })),
    };

    expect(getFlags(evidence)).not.toContain("IDENTITY_TRANSFERRED_RECENTLY");
  });

  it("uses the exact 30-day transfer boundary instead of a floored day count", () => {
    const evidence: AgentEvidence = {
      ...agentTransferredIdentity,
      transfers: agentTransferredIdentity.transfers.map((transfer) => ({
        ...transfer,
        at: "2026-06-15T11:59:59.999Z",
      })),
    };

    expect(getFlags(evidence)).not.toContain("IDENTITY_TRANSFERRED_RECENTLY");
  });

  it("requires at least ten feedback items for graph flags", () => {
    const evidence: AgentEvidence = {
      ...agentSybilBurst,
      feedback: agentSybilBurst.feedback.slice(0, 9),
    };

    expect(getFlags(evidence)).not.toContain("REVIEWER_CONCENTRATION");
    expect(getFlags(evidence)).not.toContain("BURST_FEEDBACK");
  });

  it("emits endpoint, domain, and zero-history flags from their exact facts", () => {
    const evidence: AgentEvidence = {
      ...agentGood,
      feedback: [],
      registration: {
        ...agentGood.registration,
        endpointsReachable: false,
        domainVerification: false,
        registeredAt: "2026-07-10T12:00:00.000Z",
      },
    };

    expect(getFlags(evidence)).toEqual([
      "UNREACHABLE_ENDPOINT",
      "NO_DOMAIN_VERIFICATION",
      "ZERO_HISTORY",
    ]);
  });

  it("rejects future evidence rather than silently scoring it", () => {
    const evidence: AgentEvidence = {
      ...agentGood,
      activity: ["2026-07-16T12:00:00.000Z"],
    };

    expect(() => scoreAgent(evidence)).toThrow("activity timestamp cannot be after asOf");
  });
});
