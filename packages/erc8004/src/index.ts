export type {
  AgentRef,
  IdentityRecord,
  IdentityTransfer,
  RegistryChain,
  RegistryError,
  RegistryResult,
} from "./types.js";
export { configFor, registryConfigs, type Erc8004Env, type RegistryConfig } from "./config.js";
export { IdentityClient, type IdentityClientOptions } from "./identity.js";
export { ReputationClient, type FeedbackItem } from "./reputation.js";
