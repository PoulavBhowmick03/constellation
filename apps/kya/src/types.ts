export type ChainId = `eip155:${number}`;

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

export interface FeedbackEvent {
  readonly reviewer: `0x${string}`;
  readonly at: string;
}

export interface RegistrationEvidenceInput {
  readonly agentUriResolves: boolean;
  readonly endpointsReachable: boolean;
  readonly domainVerification: boolean;
  readonly registeredAt: string;
}

/** Raw, collector-independent facts consumed by the pure scoring engine. */
export interface AgentEvidence {
  readonly asOf: string;
  readonly transfers: readonly IdentityTransfer[];
  readonly feedback: readonly FeedbackEvent[];
  readonly registration: RegistrationEvidenceInput;
  /** ISO timestamps; duplicate UTC calendar days count once. */
  readonly activity: readonly string[];
  readonly registrations: readonly AgentRegistration[];
}

export type KyaFlag =
  | "IDENTITY_TRANSFERRED_RECENTLY"
  | "REVIEWER_CONCENTRATION"
  | "BURST_FEEDBACK"
  | "UNREACHABLE_ENDPOINT"
  | "NO_DOMAIN_VERIFICATION"
  | "ZERO_HISTORY";

export interface IdentityContinuityEvidence {
  readonly transfers: readonly IdentityTransfer[];
  readonly feedback_before_last_transfer: number;
  readonly days_since_last_transfer: number | null;
}

export interface FeedbackGraphEvidence {
  readonly feedback_count: number;
  readonly distinct_reviewers: number;
  readonly top3_reviewer_share: number;
  readonly max_share_72h_window: number;
}

export interface RegistrationHygieneEvidence {
  readonly agent_uri_resolves: boolean;
  readonly endpoints_reachable: boolean;
  readonly domain_verification: boolean;
}

export interface LongevityActivityEvidence {
  readonly registered_days: number;
  readonly active_days_30d: number;
}

export interface ScoredComponent<Evidence> {
  readonly score: number;
  readonly weight: number;
  readonly evidence: Evidence;
}

export interface KyaComponents {
  readonly identity_continuity: ScoredComponent<IdentityContinuityEvidence>;
  readonly feedback_graph: ScoredComponent<FeedbackGraphEvidence>;
  readonly registration_hygiene: ScoredComponent<RegistrationHygieneEvidence>;
  readonly longevity_activity: ScoredComponent<LongevityActivityEvidence>;
}

export interface KyaReport {
  readonly score: number;
  readonly components: KyaComponents;
  readonly flags: readonly KyaFlag[];
  readonly registrations: readonly AgentRegistration[];
  readonly as_of: string;
}
