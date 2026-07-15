import type { AgentEvidence, FeedbackEvent } from "./types.js";

const HOUR_MS = 60 * 60 * 1_000;

function address(value: number): `0x${string}` {
  return `0x${value.toString(16).padStart(40, "0")}`;
}

function feedbackSeries(
  count: number,
  reviewerCount: number,
  firstAt: string,
  spacingHours: number,
): FeedbackEvent[] {
  const start = Date.parse(firstAt);
  return Array.from({ length: count }, (_, index) => ({
    reviewer: address(1_000 + (index % reviewerCount)),
    at: new Date(start + index * spacingHours * HOUR_MS).toISOString(),
  }));
}

function activityDays(count: number, asOf: string): string[] {
  const end = Date.parse(asOf);
  return Array.from({ length: count }, (_, index) =>
    new Date(end - index * 24 * HOUR_MS).toISOString(),
  );
}

const asOf = "2026-07-15T12:00:00.000Z";

export const agentGood: AgentEvidence = {
  asOf,
  transfers: [],
  feedback: feedbackSeries(14, 7, "2026-06-12T12:00:00.000Z", 48),
  registration: {
    agentUriResolves: true,
    endpointsReachable: true,
    domainVerification: true,
    registeredAt: "2026-05-16T12:00:00.000Z",
  },
  activity: activityDays(10, asOf),
  registrations: [
    {
      chain: "eip155:8453",
      registry: address(8004),
      agent_id: 42,
    },
  ],
};

const transferAt = "2026-07-03T12:00:00.000Z";

export const agentTransferredIdentity: AgentEvidence = {
  asOf,
  transfers: [
    {
      tx: `0x${"ab".repeat(32)}`,
      at: transferAt,
      from: address(41),
      to: address(42),
    },
  ],
  feedback: feedbackSeries(12, 6, "2026-06-01T12:00:00.000Z", 48),
  registration: {
    agentUriResolves: true,
    endpointsReachable: true,
    domainVerification: true,
    registeredAt: "2026-03-17T12:00:00.000Z",
  },
  activity: activityDays(15, asOf),
  registrations: [
    {
      chain: "eip155:1",
      registry: address(8004),
      agent_id: 43,
    },
  ],
};

export const agentSybilBurst: AgentEvidence = {
  asOf,
  transfers: [],
  feedback: feedbackSeries(20, 1, asOf, 0),
  registration: {
    agentUriResolves: false,
    endpointsReachable: true,
    domainVerification: true,
    registeredAt: asOf,
  },
  activity: [],
  registrations: [
    {
      chain: "eip155:8453",
      registry: address(8004),
      agent_id: 44,
    },
  ],
};
