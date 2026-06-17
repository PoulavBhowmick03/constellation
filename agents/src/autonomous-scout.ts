// scout agent: pays skills and writes a defi decision digest
import "dotenv/config";
import {
  DemoRuntime,
  escapeTable,
  formatTokenAmount,
  log,
  parseArgs,
  skillIdFromEnv,
} from "./demo-kit.js";

const { dryRun, verbose } = parseArgs();

const SCOUT_CONFIG = {
  pricePerCall: process.env.SCOUT_PRICE_PER_CALL ?? "50000",
  minBalance: BigInt(process.env.SCOUT_MIN_BALANCE ?? "500000"),
  minAprDeltaPct: Number(process.env.SCOUT_MIN_APR_DELTA_PCT ?? "5"),
  maxGasUsd: Number(process.env.SCOUT_MAX_GAS_USD ?? "1"),
  fallbackMntPriceUsd: Number(process.env.SCOUT_FALLBACK_MNT_PRICE_USD ?? "0.7"),
} as const;

const SKILLS = {
  topPools: skillIdFromEnv("SCOUT_SKILL_TOP_POOLS", 6),
  swapPreview: skillIdFromEnv("SCOUT_SKILL_SWAP_PREVIEW", 7),
  aaveRates: skillIdFromEnv("SCOUT_SKILL_AAVE_RATES", 12),
  gasOracle: skillIdFromEnv("SCOUT_SKILL_GAS_ORACLE", 13),
  tokenPrices: skillIdFromEnv("SCOUT_SKILL_TOKEN_PRICES", 14),
};

interface Decision {
  action: "ENTER_POOL" | "STAY";
  reason: string;
  confidence: number;
  targetPool?: unknown;
  topPoolApr?: number;
  aaveSupplyApy?: number;
  gasUsd?: number;
}

function pickNumber(...vals: unknown[]): number {
  for (const v of vals) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = parseFloat(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return NaN;
}

function findPoolsArray(v: unknown, depth = 0): unknown[] | null {
  if (depth > 6 || !v || typeof v !== "object") return null;
  const obj = v as Record<string, unknown>;
  if (Array.isArray(obj.pools)) return obj.pools;
  for (const key of ["data", "result", "response", "payload"]) {
    const found = findPoolsArray(obj[key], depth + 1);
    if (found) return found;
  }
  return null;
}

function pickPoolApr(topPools: unknown): { apr: number; pool: unknown } {
  const pools = findPoolsArray(topPools);
  if (!pools) return { apr: NaN, pool: null };
  for (const c of pools) {
    if (!c || typeof c !== "object") continue;
    const r = c as Record<string, unknown>;
    const apr = pickNumber(
      r.total_apr,
      r.apr,
      r.apr24h,
      r.apy,
      r.apy24h,
      (r.day as Record<string, unknown>)?.apr,
    );
    if (Number.isFinite(apr) && apr > 0) return { apr, pool: r };
  }
  return { apr: NaN, pool: null };
}

function pickAaveSupplyApy(aave: unknown): number {
  if (!aave || typeof aave !== "object") return NaN;
  const obj = aave as Record<string, unknown>;
  const rates = obj.rates;
  if (Array.isArray(rates)) {
    const usdc = rates.find((r) => (r as Record<string, unknown>).symbol === "USDC") ?? rates[0];
    if (usdc && typeof usdc === "object") {
      const r = usdc as Record<string, unknown>;
      return pickNumber(r.supplyAPR, r.supplyApr, r.supplyAPY);
    }
  }
  return pickNumber(
    obj.supplyAPR,
    obj.supplyApr,
    obj.supplyAPY,
    (obj.USDC as Record<string, unknown>)?.supplyAPR,
  );
}

function pickGasUsd(gas: unknown, mntPriceUsd: number): number {
  if (!gas || typeof gas !== "object") return NaN;
  const obj = gas as Record<string, unknown>;
  const gasPrice = obj.gasPrice as Record<string, unknown> | undefined;
  const units = obj.estimatedGasUnits as Record<string, unknown> | undefined;
  const gwei = pickNumber(gasPrice?.gwei);
  const swapUnits = pickNumber(units?.swapDex);
  if (Number.isFinite(gwei) && Number.isFinite(swapUnits) && mntPriceUsd > 0) {
    return gwei * swapUnits * 1e-9 * mntPriceUsd;
  }
  return NaN;
}

function decide(inputs: { topPools: unknown; aaveRates: unknown; gas: unknown }): Decision {
  const { apr: poolApr, pool } = pickPoolApr(inputs.topPools);
  const aaveApy = pickAaveSupplyApy(inputs.aaveRates);
  const gasUsd = pickGasUsd(inputs.gas, SCOUT_CONFIG.fallbackMntPriceUsd);
  const apr = Number.isFinite(poolApr) ? poolApr : 0;
  const apy = Number.isFinite(aaveApy) ? aaveApy : 0;
  const gas = Number.isFinite(gasUsd) ? gasUsd : 0;
  const delta = apr - apy;
  const stay = (reason: string, confidence: number): Decision => ({
    action: "STAY",
    reason,
    confidence,
    topPoolApr: apr,
    aaveSupplyApy: apy,
    gasUsd: gas,
  });

  if (!Number.isFinite(poolApr) || apr === 0) {
    return stay("Could not read a top-pool APR from byreal-top-pools.", 40);
  }
  if (delta < SCOUT_CONFIG.minAprDeltaPct) {
    return stay(
      `Top Byreal APR (${apr.toFixed(2)}%) is only ${delta.toFixed(2)}pp above Aave USDC supply APY (${apy.toFixed(2)}%), below ${SCOUT_CONFIG.minAprDeltaPct}pp threshold.`,
      72,
    );
  }
  if (gas > SCOUT_CONFIG.maxGasUsd) {
    return stay(`Gas cost ($${gas.toFixed(2)}) too high vs expected near-term yield differential.`, 66);
  }

  return {
    action: "ENTER_POOL",
    reason: `Top Byreal pool yields ${apr.toFixed(2)}% vs Aave USDC ${apy.toFixed(2)}% (delta ${delta.toFixed(2)}pp). Gas ${gas.toFixed(2)} USD is negligible. Recommend rotating.`,
    confidence: 85,
    topPoolApr: apr,
    aaveSupplyApy: apy,
    gasUsd: gas,
    targetPool: pool,
  };
}

function distillSwapPreview(swap: unknown): Record<string, string | undefined> {
  if (!swap || typeof swap !== "object") return {};
  let cursor = swap as Record<string, unknown>;
  for (let i = 0; i < 4; i++) {
    if (
      cursor &&
      typeof cursor === "object" &&
      "data" in cursor &&
      typeof cursor.data === "object" &&
      cursor.data !== null &&
      !("outAmount" in cursor)
    ) {
      cursor = cursor.data as Record<string, unknown>;
    } else {
      break;
    }
  }
  const pick = (k: string): string | undefined => {
    const v = cursor[k];
    return typeof v === "string" || typeof v === "number" ? String(v) : undefined;
  };
  return {
    inAmount: pick("inAmount"),
    outAmount: pick("outAmount"),
    inputMint: pick("inputMint"),
    outputMint: pick("outputMint"),
    priceImpactPct: pick("priceImpactPct"),
    routerType: pick("routerType"),
    orderId: pick("orderId"),
  };
}

function buildDigest(runtime: DemoRuntime, finishedAt: Date, decision: Decision, swapPreview: unknown): string {
  const elapsedSec = Math.round((finishedAt.getTime() - runtime.startedAt.getTime()) / 1000);
  const runStatus = runtime.failures.length === 0 ? "complete" : "partial";
  const actionWord = decision.action === "ENTER_POOL" ? "ROTATE INTO BYREAL POOL" : "STAY";
  const lines: string[] = [];

  lines.push(`# LedgerForge Scout - ${actionWord} (${runStatus})`);
  lines.push("");
  lines.push(`> **TL;DR**: an autonomous agent paid for ${runtime.settlements.length} live market-data skills (${formatTokenAmount(runtime.totalSpent())} USDC, ${runtime.settlements.length * 5} Mantle mainnet txs in ${elapsedSec}s), analyzed the result, and concluded **${decision.action}** with ${decision.confidence}% confidence.`);
  lines.push("");
  lines.push("## Decision");
  lines.push("");
  lines.push(`**${decision.action}** - confidence ${decision.confidence}%`);
  lines.push("");
  lines.push(`> ${decision.reason}`);
  lines.push("");
  lines.push("| Signal | Value |");
  lines.push("|---|---|");
  lines.push(`| Top Byreal pool APR (24h) | ${decision.topPoolApr?.toFixed(2) ?? "n/a"}% |`);
  lines.push(`| Aave V3 USDC supply APY | ${decision.aaveSupplyApy?.toFixed(2) ?? "n/a"}% |`);
  lines.push(`| Est. swap gas cost | $${decision.gasUsd?.toFixed(2) ?? "n/a"} |`);
  lines.push("");
  lines.push(runtime.settlementSection());
  const failures = runtime.failureSection();
  if (failures) lines.push(failures);

  if (swapPreview !== null && swapPreview !== undefined) {
    const d = distillSwapPreview(swapPreview);
    lines.push("## Modeled swap (byreal-swap-preview)");
    lines.push("");
    lines.push("| Field | Value |");
    lines.push("|---|---|");
    if (d.inAmount) lines.push(`| In | \`${escapeTable(d.inAmount)}\`${d.inputMint ? ` of ${d.inputMint.slice(0, 12)}...` : ""} |`);
    if (d.outAmount) lines.push(`| Out | \`${escapeTable(d.outAmount)}\`${d.outputMint ? ` of ${d.outputMint.slice(0, 12)}...` : ""} |`);
    if (d.priceImpactPct) lines.push(`| Price impact | ${parseFloat(d.priceImpactPct).toFixed(2)}% |`);
    if (d.routerType) lines.push(`| Router | ${escapeTable(d.routerType)} |`);
    if (d.orderId) lines.push(`| Order ID | \`${escapeTable(d.orderId)}\` |`);
    lines.push("");
    lines.push("_(swap-preview only; no transaction was broadcast.)_");
    lines.push("");
  }

  lines.push(runtime.runDetailsSection(finishedAt, [
    `- **Decision thresholds:** min APR delta ${SCOUT_CONFIG.minAprDeltaPct}pp, max gas $${SCOUT_CONFIG.maxGasUsd}`,
  ]));
  lines.push("## Limitations");
  lines.push("");
  lines.push("- Research agent only: it recommends and previews; it does not execute trades.");
  lines.push("- Skill response parsing is defensive because upstream providers do not yet share a strict schema.");
  lines.push("- Gas USD uses a configurable MNT/USD fallback when the live price feed does not include MNT.");
  lines.push("");
  return lines.join("\n");
}

async function main(): Promise<void> {
  const runtime = new DemoRuntime({
    title: "LedgerForge Autonomous Scout - DeFi opportunity scanner",
    runsDir: "scout-runs",
    pricePerCall: SCOUT_CONFIG.pricePerCall,
    minBalance: SCOUT_CONFIG.minBalance,
    dryRun,
    verbose,
  });

  let decision: Decision = {
    action: "STAY",
    reason: "Scout did not reach the decision step.",
    confidence: 0,
  };
  let swapPreview: unknown = null;
  let topPools: unknown;
  let aaveRates: unknown;
  let prices: unknown;
  let gas: unknown;

  runtime.printHeader();
  const ready = await runtime.preflight(6);
  if (ready) {
    log("");
    log("scan market (3 paid skills, sequenced)");
    topPools = await runtime.pay<unknown>("market scan: byreal top pools", SKILLS.topPools, { query: { sortField: "apr24h", pageSize: "3" } });
    aaveRates = await runtime.pay<unknown>("market scan: aave rates", SKILLS.aaveRates, { query: { asset: "USDC" } });
    prices = await runtime.pay<unknown>("market scan: token prices", SKILLS.tokenPrices, { query: { tokens: "USDC,USDe" } });

    log("");
    log("gas estimate (1 paid skill)");
    gas = await runtime.pay<unknown>("gas estimate", SKILLS.gasOracle);

    log("");
    log("decision");
    try {
      decision = decide({ topPools, aaveRates, gas });
    } catch (err) {
      runtime.recordFailure("decision", err);
      decision = {
        action: "STAY",
        reason: "Decision logic failed; see partial-run failures.",
        confidence: 0,
      };
    }
    log(`Action:     ${decision.action}`);
    log(`Confidence: ${decision.confidence}%`);
    log(`Reason:     ${decision.reason}`);

    if (decision.action === "ENTER_POOL") {
      log("");
      log("model the swap (1 paid skill)");
      swapPreview = await runtime.pay<unknown>("swap preview", SKILLS.swapPreview, {
        body: {
          walletAddress: runtime.provider.address,
          inputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
          outputMint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
          amount: "100000000",
          slippage: "0.5",
        },
      });
    } else {
      log("");
      log("swap skipped (no rotation recommended)");
    }
  }

  const finishedAt = new Date();
  log("");
  log("--- Summary ---");
  log(`Settlements: ${runtime.settlements.length}`);
  log(`Failures:    ${runtime.failures.length}`);
  log(`Spent:       ${formatTokenAmount(runtime.totalSpent())} USDC`);
  log(`Decision:    ${decision.action} (${decision.confidence}%)`);

  runtime.writeArtifacts(
    "scout",
    buildDigest(runtime, finishedAt, decision, swapPreview),
    {
      config: SCOUT_CONFIG,
      skills: SKILLS,
      decision,
      market: { topPools, aaveRates, prices, gas, swapPreview },
    },
    finishedAt,
  );
  runtime.printProviderRecovery();
  if (runtime.failures.length > 0) process.exitCode = 1;
  log("");
  log("Done.");
}

main().catch((err) => {
  console.error("\nScout failed:");
  console.error(err);
  process.exit(1);
});
