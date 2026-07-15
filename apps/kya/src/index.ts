export { agentGood, agentSybilBurst, agentTransferredIdentity } from "./fixtures.js";
export {
  COMPONENT_WEIGHTS,
  getFlags,
  scoreAgent,
  scoreFeedbackGraph,
  scoreIdentityContinuity,
  scoreLongevityActivity,
  scoreRegistrationHygiene,
} from "./scoring.js";
export {
  KYA_ROADMAP_PRICES,
  KYA_TOOL_NAMES,
  KyaToolServer,
  PaymentRequiredError,
} from "./server.js";
export type {
  AgentRef,
  AgentRequest,
  AttestationVerifier,
  EvidenceSource,
  RoadmapAttestation,
  VerificationResult,
  VerifierReference,
  VerifyAttestationRequest,
} from "./server.js";
export type * from "./types.js";
