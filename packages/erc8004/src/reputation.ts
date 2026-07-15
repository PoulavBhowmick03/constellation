import type { RegistryConfig } from "./config.js";
import type { RegistryResult } from "./types.js";

/** Shape KYA consumes; mirrors the evidence fields in INTERFACES.md §2. */
export interface FeedbackItem {
  reviewer: string;
  score: number;
  at: string; // ISO-8601 UTC
  tx: string;
}

/**
 * DELIBERATE STUB. The ERC-8004 reputation registry's ABI (event/method names
 * for feedback) is TODO(unverified): unlike the identity side, there is no
 * safe standard subset to code against, and inventing event signatures would
 * produce silently-empty (i.e. wrong) reputation reads. Every call returns
 * ABI_UNVERIFIED until a human verifies the ABI against a real deployment and
 * replaces this implementation. KYA must treat ABI_UNVERIFIED as "component
 * unavailable", not as zero feedback. See docs/status/P1.md.
 */
export class ReputationClient {
  private constructor(private readonly config: RegistryConfig) {}

  static fromConfig(config: RegistryConfig): ReputationClient | null {
    if (!config.rpcUrl || !config.reputationRegistry) return null;
    return new ReputationClient(config);
  }

  async feedbackFor(_agentId: number): Promise<RegistryResult<FeedbackItem[]>> {
    return {
      ok: false,
      error: {
        code: "ABI_UNVERIFIED",
        message:
          "ERC-8004 reputation registry ABI has not been human-verified; refusing to guess. " +
          `Registry configured for ${this.config.chain}: ${this.config.reputationRegistry}.`,
      },
    };
  }
}
