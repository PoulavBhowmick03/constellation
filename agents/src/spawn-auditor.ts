// spawn auditor: pays lineage skills and writes an audit digest
import "dotenv/config";
import { getAddress, type Address, type Hex } from "viem";
import {
  DemoRuntime,
  escapeTable,
  formatTokenAmount,
  parseArgs,
  skillIdFromEnv,
} from "./demo-kit.js";

type AuditVerdict = "APPROVE" | "BLOCK" | "NEEDS_REVIEW";

interface AuditDecision {
  verdict: AuditVerdict;
  confidence: number;
  rationale: string;
  remediations: string[];
  verified: boolean | null;
  contextChars: number;
  postMortemCount: number;
}

const { dryRun, verbose } = parseArgs();
const DEFAULT_DECISION_HASH = `0x${"deadbeef".repeat(8)}` as Hex;
const DEFAULT_CONTRACT_ADDRESS = "0x37041F257Bf8f1E201497Dc0BCDa1ae0d8317992" as Address;

const SPAWN_CONFIG = {
  pricePerCall: process.env.SPAWN_AUDITOR_PRICE_PER_CALL ?? "50000",
  minBalance: BigInt(process.env.SPAWN_AUDITOR_MIN_BALANCE ?? "500000"),
  lineageKey: process.env.SPAWN_AUDITOR_LINEAGE_KEY ?? "agent-demo-lineage",
  generation: process.env.SPAWN_AUDITOR_GENERATION ?? "2",
  contractAddress: getAddress(process.env.SPAWN_AUDITOR_CONTRACT_ADDRESS ?? process.env.SKILL_REGISTRY_ADDRESS ?? DEFAULT_CONTRACT_ADDRESS),
  decisionHash: normalizeDecisionHash(process.env.SPAWN_AUDITOR_DECISION_HASH ?? DEFAULT_DECISION_HASH),
} as const;

const SKILLS = {
  failureAnalyst: skillIdFromEnv("SPAWN_SKILL_FAILURE_ANALYST", 1),
  lineageContext: skillIdFromEnv("SPAWN_SKILL_LINEAGE_CONTEXT", 2),
  decisionVerifier: skillIdFromEnv("SPAWN_SKILL_DECISION_VERIFIER", 3),
};

function normalizeDecisionHash(raw: string): Hex {
  const body = raw.startsWith("0x") ? raw.slice(2) : raw;
  if (!/^[0-9a-fA-F]{64}$/.test(body)) {
    throw new Error("SPAWN_AUDITOR_DECISION_HASH must be a 32-byte hex string");
  }
  return `0x${body}` as Hex;
}

function textOf(value: unknown): string {
  try {
    return JSON.stringify(value).toLowerCase();
  } catch {
    return String(value).toLowerCase();
  }
}

function pickContextLength(context: unknown): number {
  if (!context || typeof context !== "object") return 0;
  const obj = context as Record<string, unknown>;
  return typeof obj.context === "string" ? obj.context.length : 0;
}

function countPostMortems(failureAnalysis: unknown): number {
  if (!failureAnalysis || typeof failureAnalysis !== "object") return 0;
  const obj = failureAnalysis as Record<string, unknown>;
  if (Array.isArray(obj.postMortems)) return obj.postMortems.length;
  if (Array.isArray(obj.ancestors)) return obj.ancestors.length;
  const data = obj.data;
  if (data && typeof data === "object") return countPostMortems(data);
  return 0;
}

function verifierValue(verifier: unknown): boolean | null {
  if (!verifier || typeof verifier !== "object") return null;
  const obj = verifier as Record<string, unknown>;
  return typeof obj.verified === "boolean" ? obj.verified : null;
}

function decideAudit(inputs: {
  failureAnalysis: unknown;
  lineageContext: unknown;
  verifier: unknown;
  failureCount: number;
}): AuditDecision {
  const verified = verifierValue(inputs.verifier);
  const contextChars = pickContextLength(inputs.lineageContext);
  const postMortemCount = countPostMortems(inputs.failureAnalysis);
  const text = textOf(inputs.failureAnalysis);
  const criticalTerms = ["exploit", "critical", "compromise", "unsafe", "drain", "reentrancy"];

  if (criticalTerms.some((term) => text.includes(term))) {
    return {
      verdict: "BLOCK",
      confidence: 84,
      rationale: "Failure analysis contains critical safety language; deployment should be blocked until remediated.",
      remediations: [
        "Review the critical failure records before promotion.",
        "Regenerate lineage context after remediation.",
        "Re-run decision-hash verification with the final deployment hash.",
      ],
      verified,
      contextChars,
      postMortemCount,
    };
  }

  if (verified === true && contextChars > 0 && inputs.failureCount === 0) {
    return {
      verdict: "APPROVE",
      confidence: postMortemCount > 0 ? 76 : 86,
      rationale: "Decision hash is present on-chain and lineage context is available for operator review.",
      remediations: postMortemCount > 0
        ? ["Carry forward the listed lineage constraints into the deployment runbook."]
        : ["Archive this audit digest with the deployment record."],
      verified,
      contextChars,
      postMortemCount,
    };
  }

  if (verified === false) {
    return {
      verdict: "NEEDS_REVIEW",
      confidence: 68,
      rationale: "The decision hash was not found in the scanned on-chain range. This is expected for the default demo hash, but it blocks automatic approval.",
      remediations: [
        "Provide a known deployment decision hash through SPAWN_AUDITOR_DECISION_HASH.",
        "Confirm the contract address points to the ChildAgent or deployment contract that emitted the decision event.",
        "Re-run the auditor before promotion.",
      ],
      verified,
      contextChars,
      postMortemCount,
    };
  }

  return {
    verdict: "NEEDS_REVIEW",
    confidence: 45,
    rationale: "Audit inputs were incomplete because one or more paid skills failed or returned no verifier field.",
    remediations: [
      "Check partial-run failures in this digest.",
      "Re-run once the affected Spawn skill endpoint is healthy.",
    ],
    verified,
    contextChars,
    postMortemCount,
  };
}

function buildDigest(
  runtime: DemoRuntime,
  finishedAt: Date,
  decision: AuditDecision,
  raw: { failureAnalysis: unknown; lineageContext: unknown; verifier: unknown },
): string {
  const elapsedSec = Math.round((finishedAt.getTime() - runtime.startedAt.getTime()) / 1000);
  const runStatus = runtime.failures.length === 0 ? "complete" : "partial";
  const lines: string[] = [];

  lines.push(`# LedgerForge Spawn Auditor - ${decision.verdict} (${runStatus})`);
  lines.push("");
  lines.push(`> **TL;DR**: an autonomous auditor paid ${runtime.settlements.length} Spawn skills (${formatTokenAmount(runtime.totalSpent())} USDC, ${runtime.settlements.length * 5} Mantle mainnet txs in ${elapsedSec}s) and produced a **${decision.verdict}** verdict with ${decision.confidence}% confidence.`);
  lines.push("");
  lines.push("## Audit verdict");
  lines.push("");
  lines.push(`**${decision.verdict}** - confidence ${decision.confidence}%`);
  lines.push("");
  lines.push(`> ${decision.rationale}`);
  lines.push("");
  lines.push("| Signal | Value |");
  lines.push("|---|---|");
  lines.push(`| Decision hash verified | ${decision.verified === null ? "unknown" : String(decision.verified)} |`);
  lines.push(`| Lineage context size | ${decision.contextChars} chars |`);
  lines.push(`| Post-mortems found | ${decision.postMortemCount} |`);
  lines.push("");
  lines.push("## Remediation list");
  lines.push("");
  for (const item of decision.remediations) {
    lines.push(`- ${item}`);
  }
  lines.push("");
  lines.push("## Audit inputs");
  lines.push("");
  lines.push(`- **Lineage key:** \`${escapeTable(SPAWN_CONFIG.lineageKey)}\``);
  lines.push(`- **Generation:** \`${escapeTable(SPAWN_CONFIG.generation)}\``);
  lines.push(`- **Contract:** [\`${SPAWN_CONFIG.contractAddress}\`](https://mantlescan.xyz/address/${SPAWN_CONFIG.contractAddress})`);
  lines.push(`- **Decision hash:** \`${SPAWN_CONFIG.decisionHash.slice(0, 14)}...\``);
  lines.push("");
  lines.push(runtime.settlementSection());
  const failures = runtime.failureSection();
  if (failures) lines.push(failures);
  lines.push(runtime.runDetailsSection(finishedAt, [
    `- **Lineage key:** ${SPAWN_CONFIG.lineageKey}`,
    `- **Decision hash:** ${SPAWN_CONFIG.decisionHash.slice(0, 14)}...`,
  ]));
  lines.push("## Limitations");
  lines.push("");
  lines.push("- Auditor only: this agent does not promote, deploy, or mutate Spawn contracts.");
  lines.push("- Default hash is intentionally unknown, so demo runs usually produce NEEDS_REVIEW.");
  lines.push("- ERC-8004 identity/reputation availability depends on the live Mantle registry state.");
  lines.push("");

  void raw;
  return lines.join("\n");
}

async function main(): Promise<void> {
  const runtime = new DemoRuntime({
    title: "LedgerForge Spawn Auditor - AI DevTools demo",
    runsDir: "spawn-auditor-runs",
    pricePerCall: SPAWN_CONFIG.pricePerCall,
    minBalance: SPAWN_CONFIG.minBalance,
    dryRun,
    verbose,
  });

  runtime.printHeader();
  let failureAnalysis: unknown;
  let lineageContext: unknown;
  let verifier: unknown;
  let decision: AuditDecision = {
    verdict: "NEEDS_REVIEW",
    confidence: 0,
    rationale: "Spawn Auditor did not reach the decision step.",
    remediations: ["Check preflight and partial-run failures."],
    verified: null,
    contextChars: 0,
    postMortemCount: 0,
  };

  const ready = await runtime.preflight(3);
  if (ready) {
    console.log("");
    console.log("[" + new Date().toISOString().slice(11, 19) + "] lineage and failure analysis");
    failureAnalysis = await runtime.pay<unknown>("spawn failure analysis", SKILLS.failureAnalyst, {
      query: { lineageKey: SPAWN_CONFIG.lineageKey, generation: SPAWN_CONFIG.generation },
    });
    lineageContext = await runtime.pay<unknown>("lineage context", SKILLS.lineageContext, {
      query: { lineageKey: SPAWN_CONFIG.lineageKey },
    });

    console.log("");
    console.log("[" + new Date().toISOString().slice(11, 19) + "] decision hash verification");
    verifier = await runtime.pay<unknown>("decision hash verification", SKILLS.decisionVerifier, {
      query: {
        contractAddress: SPAWN_CONFIG.contractAddress,
        decisionHash: SPAWN_CONFIG.decisionHash,
      },
    });

    console.log("");
    console.log("[" + new Date().toISOString().slice(11, 19) + "] audit verdict");
    decision = decideAudit({
      failureAnalysis,
      lineageContext,
      verifier,
      failureCount: runtime.failures.length,
    });
    console.log("[" + new Date().toISOString().slice(11, 19) + `] Verdict:    ${decision.verdict}`);
    console.log("[" + new Date().toISOString().slice(11, 19) + `] Confidence: ${decision.confidence}%`);
    console.log("[" + new Date().toISOString().slice(11, 19) + `] Rationale:  ${decision.rationale}`);
  }

  const finishedAt = new Date();
  console.log("");
  console.log("[" + new Date().toISOString().slice(11, 19) + "] --- Summary ---");
  console.log("[" + new Date().toISOString().slice(11, 19) + `] Settlements: ${runtime.settlements.length}`);
  console.log("[" + new Date().toISOString().slice(11, 19) + `] Failures:    ${runtime.failures.length}`);
  console.log("[" + new Date().toISOString().slice(11, 19) + `] Spent:       ${formatTokenAmount(runtime.totalSpent())} USDC`);
  console.log("[" + new Date().toISOString().slice(11, 19) + `] Verdict:     ${decision.verdict} (${decision.confidence}%)`);

  runtime.writeArtifacts(
    "spawn-auditor",
    buildDigest(runtime, finishedAt, decision, { failureAnalysis, lineageContext, verifier }),
    {
      config: {
        ...SPAWN_CONFIG,
        decisionHash: `${SPAWN_CONFIG.decisionHash.slice(0, 14)}...`,
      },
      skills: SKILLS,
      decision,
      raw: { failureAnalysis, lineageContext, verifier },
    },
    finishedAt,
  );
  runtime.printProviderRecovery();
  if (runtime.failures.length > 0) process.exitCode = 1;
  console.log("");
  console.log("[" + new Date().toISOString().slice(11, 19) + "] Done.");
}

main().catch((err) => {
  console.error("\nSpawn Auditor failed:");
  console.error(err);
  process.exit(1);
});
