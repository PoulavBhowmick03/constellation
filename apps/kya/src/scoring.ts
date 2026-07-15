import type {
  AgentEvidence,
  FeedbackGraphEvidence,
  IdentityContinuityEvidence,
  KyaComponents,
  KyaFlag,
  KyaReport,
  LongevityActivityEvidence,
  RegistrationHygieneEvidence,
  ScoredComponent,
} from "./types.js";

const DAY_MS = 24 * 60 * 60 * 1_000;
const WINDOW_72H_MS = 72 * 60 * 60 * 1_000;

export const COMPONENT_WEIGHTS = Object.freeze({
  identity_continuity: 0.35,
  feedback_graph: 0.3,
  registration_hygiene: 0.2,
  longevity_activity: 0.15,
} as const);

function timestamp(value: string, label: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new RangeError(`${label} must be a valid ISO-8601 timestamp`);
  }
  return parsed;
}

function elapsedDays(earlier: number, later: number, label: string): number {
  if (earlier > later) {
    throw new RangeError(`${label} cannot be after asOf`);
  }
  return (later - earlier) / DAY_MS;
}

function roundScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

interface IdentityFacts {
  readonly evidence: IdentityContinuityEvidence;
  readonly lastTransferAgeDays: number | null;
}

function identityFacts(evidence: AgentEvidence): IdentityFacts {
  const asOf = timestamp(evidence.asOf, "asOf");
  const transfers = evidence.transfers
    .map((transfer) => ({ transfer, at: timestamp(transfer.at, "transfer.at") }))
    .sort((a, b) => a.at - b.at);

  for (const transfer of transfers) {
    elapsedDays(transfer.at, asOf, "transfer.at");
  }

  const lastTransfer = transfers.at(-1);
  if (lastTransfer === undefined) {
    return {
      evidence: {
        transfers: [],
        feedback_before_last_transfer: 0,
        days_since_last_transfer: null,
      },
      lastTransferAgeDays: null,
    };
  }

  const feedbackBefore = evidence.feedback.filter((item) => {
    const feedbackAt = timestamp(item.at, "feedback.at");
    elapsedDays(feedbackAt, asOf, "feedback.at");
    return feedbackAt < lastTransfer.at;
  }).length;
  const lastTransferAgeDays = elapsedDays(
    lastTransfer.at,
    asOf,
    "transfer.at",
  );

  return {
    evidence: {
      transfers: transfers.map(({ transfer }) => ({ ...transfer })),
      feedback_before_last_transfer: feedbackBefore,
      days_since_last_transfer: Math.floor(lastTransferAgeDays),
    },
    lastTransferAgeDays,
  };
}

function feedbackFacts(evidence: AgentEvidence): FeedbackGraphEvidence {
  const asOf = timestamp(evidence.asOf, "asOf");
  const reviewerCounts = new Map<string, number>();
  const eventTimes = evidence.feedback
    .map((item) => {
      const at = timestamp(item.at, "feedback.at");
      elapsedDays(at, asOf, "feedback.at");
      const reviewer = item.reviewer.toLowerCase();
      reviewerCounts.set(reviewer, (reviewerCounts.get(reviewer) ?? 0) + 1);
      return at;
    })
    .sort((a, b) => a - b);

  const feedbackCount = eventTimes.length;
  const top3Count = [...reviewerCounts.values()]
    .sort((a, b) => b - a)
    .slice(0, 3)
    .reduce((sum, count) => sum + count, 0);

  let largestWindow = 0;
  let left = 0;
  for (let right = 0; right < eventTimes.length; right += 1) {
    const rightTime = eventTimes[right];
    if (rightTime === undefined) continue;
    while (
      left <= right &&
      eventTimes[left] !== undefined &&
      rightTime - eventTimes[left]! > WINDOW_72H_MS
    ) {
      left += 1;
    }
    largestWindow = Math.max(largestWindow, right - left + 1);
  }

  return {
    feedback_count: feedbackCount,
    distinct_reviewers: reviewerCounts.size,
    top3_reviewer_share: ratio(top3Count, feedbackCount),
    max_share_72h_window: ratio(largestWindow, feedbackCount),
  };
}

function registrationFacts(
  evidence: AgentEvidence,
): RegistrationHygieneEvidence {
  return {
    agent_uri_resolves: evidence.registration.agentUriResolves,
    endpoints_reachable: evidence.registration.endpointsReachable,
    domain_verification: evidence.registration.domainVerification,
  };
}

function longevityFacts(evidence: AgentEvidence): LongevityActivityEvidence {
  const asOf = timestamp(evidence.asOf, "asOf");
  const registeredAt = timestamp(
    evidence.registration.registeredAt,
    "registration.registeredAt",
  );
  const registeredDays = Math.floor(
    elapsedDays(registeredAt, asOf, "registration.registeredAt"),
  );

  const windowStart = asOf - 30 * DAY_MS;
  const activeDates = new Set<string>();
  for (const value of evidence.activity) {
    const activeAt = timestamp(value, "activity timestamp");
    elapsedDays(activeAt, asOf, "activity timestamp");
    if (activeAt >= windowStart) {
      activeDates.add(new Date(activeAt).toISOString().slice(0, 10));
    }
  }

  return {
    registered_days: registeredDays,
    active_days_30d: activeDates.size,
  };
}

export function scoreIdentityContinuity(
  evidence: AgentEvidence,
): ScoredComponent<IdentityContinuityEvidence> {
  const facts = identityFacts(evidence);
  const hasReputationBearingTransfer =
    facts.lastTransferAgeDays !== null &&
    facts.evidence.feedback_before_last_transfer > 0;
  const score = hasReputationBearingTransfer
    ? roundScore((facts.lastTransferAgeDays! / 30) * 100)
    : 100;

  return {
    score,
    weight: COMPONENT_WEIGHTS.identity_continuity,
    evidence: facts.evidence,
  };
}

export function scoreFeedbackGraph(
  evidence: AgentEvidence,
): ScoredComponent<FeedbackGraphEvidence> {
  const facts = feedbackFacts(evidence);
  if (facts.feedback_count === 0) {
    return {
      score: 0,
      weight: COMPONENT_WEIGHTS.feedback_graph,
      evidence: facts,
    };
  }

  const volume = Math.min(facts.feedback_count / 10, 1) * 20;
  const reviewerDiversity = Math.min(facts.distinct_reviewers / 10, 1) * 40;
  const reviewerDistribution = (1 - facts.top3_reviewer_share) * 20;
  const temporalDistribution = (1 - facts.max_share_72h_window) * 20;

  return {
    score: roundScore(
      volume + reviewerDiversity + reviewerDistribution + temporalDistribution,
    ),
    weight: COMPONENT_WEIGHTS.feedback_graph,
    evidence: facts,
  };
}

export function scoreRegistrationHygiene(
  evidence: AgentEvidence,
): ScoredComponent<RegistrationHygieneEvidence> {
  const facts = registrationFacts(evidence);
  const score =
    (facts.agent_uri_resolves ? 65 : 0) +
    (facts.endpoints_reachable ? 20 : 0) +
    (facts.domain_verification ? 15 : 0);

  return {
    score,
    weight: COMPONENT_WEIGHTS.registration_hygiene,
    evidence: facts,
  };
}

export function scoreLongevityActivity(
  evidence: AgentEvidence,
): ScoredComponent<LongevityActivityEvidence> {
  const facts = longevityFacts(evidence);
  const registrationMaturity = Math.min(facts.registered_days / 90, 1) * 60;
  const recentActivity = Math.min(facts.active_days_30d / 30, 1) * 40;

  return {
    score: roundScore(registrationMaturity + recentActivity),
    weight: COMPONENT_WEIGHTS.longevity_activity,
    evidence: facts,
  };
}

export function getFlags(evidence: AgentEvidence): readonly KyaFlag[] {
  const identity = identityFacts(evidence);
  const feedback = feedbackFacts(evidence);
  const registration = registrationFacts(evidence);
  const longevity = longevityFacts(evidence);
  const flags: KyaFlag[] = [];

  if (
    identity.lastTransferAgeDays !== null &&
    identity.lastTransferAgeDays <= 30 &&
    identity.evidence.feedback_before_last_transfer > 0
  ) {
    flags.push("IDENTITY_TRANSFERRED_RECENTLY");
  }
  if (
    feedback.feedback_count >= 10 &&
    feedback.top3_reviewer_share > 0.6
  ) {
    flags.push("REVIEWER_CONCENTRATION");
  }
  if (
    feedback.feedback_count >= 10 &&
    feedback.max_share_72h_window > 0.5
  ) {
    flags.push("BURST_FEEDBACK");
  }
  if (!registration.endpoints_reachable) {
    flags.push("UNREACHABLE_ENDPOINT");
  }
  if (!registration.domain_verification) {
    flags.push("NO_DOMAIN_VERIFICATION");
  }
  if (feedback.feedback_count === 0 && longevity.registered_days < 7) {
    flags.push("ZERO_HISTORY");
  }

  return flags;
}

export function scoreAgent(evidence: AgentEvidence): KyaReport {
  const components: KyaComponents = {
    identity_continuity: scoreIdentityContinuity(evidence),
    feedback_graph: scoreFeedbackGraph(evidence),
    registration_hygiene: scoreRegistrationHygiene(evidence),
    longevity_activity: scoreLongevityActivity(evidence),
  };
  const weightedScore = Object.values(components).reduce(
    (sum, component) => sum + component.score * component.weight,
    0,
  );

  return {
    score: roundScore(weightedScore),
    components,
    flags: getFlags(evidence),
    registrations: evidence.registrations.map((registration) => ({
      ...registration,
    })),
    as_of: new Date(timestamp(evidence.asOf, "asOf")).toISOString(),
  };
}
