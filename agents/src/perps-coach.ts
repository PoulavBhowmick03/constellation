// perps coach: pays byreal signals and writes a position digest
import "dotenv/config";
import {
  DemoRuntime,
  escapeTable,
  formatTokenAmount,
  parseArgs,
  skillIdFromEnv,
} from "./demo-kit.js";

type Side = "LONG" | "SHORT";
type CoachAction = "HOLD" | "TAKE_PROFIT" | "REDUCE" | "AVOID";

interface Position {
  coin: string;
  side: Side;
}

interface PositionDecision {
  coin: string;
  side: Side;
  action: CoachAction;
  confidence: number;
  rationale: string;
  bullishSignals: number;
  bearishSignals: number;
}

const { dryRun, verbose } = parseArgs();

const PERPS_CONFIG = {
  pricePerCall: process.env.PERPS_COACH_PRICE_PER_CALL ?? "50000",
  minBalance: BigInt(process.env.PERPS_COACH_MIN_BALANCE ?? "500000"),
  positions: parsePositions(process.env.PERPS_COACH_POSITIONS ?? "BTC:LONG,ETH:LONG,SOL:LONG"),
} as const;

const SKILLS = {
  perpsSignals: skillIdFromEnv("PERPS_SKILL_PERPS_SIGNALS", 8),
  tokenPrices: skillIdFromEnv("PERPS_SKILL_TOKEN_PRICES", 14),
  gasOracle: skillIdFromEnv("PERPS_SKILL_GAS_ORACLE", 13),
};

function parsePositions(raw: string): Position[] {
  const parsed = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [coinRaw, sideRaw] = part.split(":");
      const coin = (coinRaw ?? "").trim().toUpperCase();
      const side = (sideRaw ?? "LONG").trim().toUpperCase();
      if (!/^[A-Z0-9]{1,10}$/.test(coin)) {
        throw new Error(`Invalid PERPS_COACH_POSITIONS coin: ${part}`);
      }
      if (side !== "LONG" && side !== "SHORT") {
        throw new Error(`Invalid PERPS_COACH_POSITIONS side: ${part}`);
      }
      return { coin, side: side as Side };
    });
  if (parsed.length === 0) throw new Error("PERPS_COACH_POSITIONS produced no positions");
  return parsed;
}

function textOf(value: unknown): string {
  try {
    return JSON.stringify(value).toLowerCase();
  } catch {
    return String(value).toLowerCase();
  }
}

function countTerms(text: string, terms: string[]): number {
  return terms.reduce((count, term) => count + (text.includes(term) ? 1 : 0), 0);
}

function decidePosition(position: Position, signal: unknown): PositionDecision {
  if (!signal || (typeof signal === "object" && "dryRun" in signal)) {
    return {
      ...position,
      action: "HOLD",
      confidence: 35,
      rationale: "Dry-run or missing signal; no live risk change observed.",
      bullishSignals: 0,
      bearishSignals: 0,
    };
  }

  const text = textOf(signal);
  const bullish = countTerms(text, ["bullish", "buy", "long", "uptrend", "support", "positive", "momentum"]);
  const bearish = countTerms(text, ["bearish", "sell", "short", "downtrend", "resistance", "negative", "weak"]);
  const profit = countTerms(text, ["take profit", "target", "overbought", "extended", "exhaustion"]);
  const risk = countTerms(text, ["stop", "liquidation", "volatile", "risk", "breakdown", "breakout against"]);
  const aligned = position.side === "LONG" ? bullish - bearish : bearish - bullish;

  if (risk > 1 || aligned <= -2) {
    return {
      ...position,
      action: "REDUCE",
      confidence: 78,
      rationale: `${position.side} exposure is fighting the signal mix (${bullish} bullish / ${bearish} bearish) with elevated risk terms.`,
      bullishSignals: bullish,
      bearishSignals: bearish,
    };
  }

  if (profit > 0 && aligned >= 1) {
    return {
      ...position,
      action: "TAKE_PROFIT",
      confidence: 72,
      rationale: `${position.side} signal is still aligned, but profit-taking language appeared in the perps scan.`,
      bullishSignals: bullish,
      bearishSignals: bearish,
    };
  }

  if (aligned >= 0) {
    return {
      ...position,
      action: "HOLD",
      confidence: aligned > 0 ? 68 : 55,
      rationale: `${position.side} exposure is not contradicted by the current perps scan.`,
      bullishSignals: bullish,
      bearishSignals: bearish,
    };
  }

  return {
    ...position,
    action: "AVOID",
    confidence: 60,
    rationale: `Signal mix is weak for a fresh ${position.side} entry; wait for cleaner confirmation.`,
    bullishSignals: bullish,
    bearishSignals: bearish,
  };
}

function buildDigest(
  runtime: DemoRuntime,
  finishedAt: Date,
  decisions: PositionDecision[],
  context: { signals: Record<string, unknown>; prices: unknown; gas: unknown },
): string {
  const elapsedSec = Math.round((finishedAt.getTime() - runtime.startedAt.getTime()) / 1000);
  const runStatus = runtime.failures.length === 0 ? "complete" : "partial";
  const reduceCount = decisions.filter((d) => d.action === "REDUCE").length;
  const takeProfitCount = decisions.filter((d) => d.action === "TAKE_PROFIT").length;
  const headline =
    reduceCount > 0 ? "REDUCE RISK" :
    takeProfitCount > 0 ? "TAKE PROFIT" :
    "HOLD";
  const lines: string[] = [];

  lines.push(`# LedgerForge Perps Coach - ${headline} (${runStatus})`);
  lines.push("");
  lines.push(`> **TL;DR**: an autonomous agent paid for ${runtime.settlements.length} live skills (${formatTokenAmount(runtime.totalSpent())} USDC, ${runtime.settlements.length * 5} Mantle mainnet txs in ${elapsedSec}s) and generated position-level Byreal perps coaching.`);
  lines.push("");
  lines.push("## Coaching decisions");
  lines.push("");
  lines.push("| Position | Action | Confidence | Signal mix | Rationale |");
  lines.push("|---|---|---:|---|---|");
  for (const decision of decisions) {
    lines.push(`| ${decision.coin} ${decision.side} | **${decision.action}** | ${decision.confidence}% | ${decision.bullishSignals} bullish / ${decision.bearishSignals} bearish | ${escapeTable(decision.rationale)} |`);
  }
  lines.push("");
  lines.push("## Market context");
  lines.push("");
  lines.push(`- Perps scans requested for: ${PERPS_CONFIG.positions.map((p) => `${p.coin}:${p.side}`).join(", ")}`);
  lines.push("- Settlement token context requested from token-price-feed for USDC and USDe.");
  lines.push("- Gas context requested from mantle-gas-oracle.");
  lines.push("");
  lines.push(runtime.settlementSection());
  const failures = runtime.failureSection();
  if (failures) lines.push(failures);
  lines.push(runtime.runDetailsSection(finishedAt, [
    `- **Positions:** ${PERPS_CONFIG.positions.map((p) => `${p.coin}:${p.side}`).join(", ")}`,
  ]));
  lines.push("## Limitations");
  lines.push("");
  lines.push("- Coaching only: this agent does not place, close, or modify perps positions.");
  lines.push("- Signal parsing is heuristic because Byreal perps output can vary by market and CLI version.");
  lines.push("- Token-price and gas calls provide execution context, not direct BTC/ETH/SOL spot pricing.");
  lines.push("");

  void context;
  return lines.join("\n");
}

async function main(): Promise<void> {
  const runtime = new DemoRuntime({
    title: "LedgerForge Perps Coach - Byreal perps signal demo",
    runsDir: "perps-coach-runs",
    pricePerCall: PERPS_CONFIG.pricePerCall,
    minBalance: PERPS_CONFIG.minBalance,
    dryRun,
    verbose,
  });

  runtime.printHeader();
  const signals: Record<string, unknown> = {};
  let prices: unknown;
  let gas: unknown;
  const decisions: PositionDecision[] = [];

  const ready = await runtime.preflight(PERPS_CONFIG.positions.length + 2);
  if (ready) {
    console.log("");
    console.log("[" + new Date().toISOString().slice(11, 19) + "] perps scans");
    for (const position of PERPS_CONFIG.positions) {
      signals[position.coin] = await runtime.pay<unknown>(
        `perps signal: ${position.coin}`,
        SKILLS.perpsSignals,
        { query: { coin: position.coin } },
      );
    }

    console.log("");
    console.log("[" + new Date().toISOString().slice(11, 19) + "] settlement and gas context");
    prices = await runtime.pay<unknown>("settlement token prices", SKILLS.tokenPrices, { query: { tokens: "USDC,USDe" } });
    gas = await runtime.pay<unknown>("gas oracle", SKILLS.gasOracle);

    console.log("");
    console.log("[" + new Date().toISOString().slice(11, 19) + "] coaching decisions");
    for (const position of PERPS_CONFIG.positions) {
      const decision = decidePosition(position, signals[position.coin]);
      decisions.push(decision);
      console.log("[" + new Date().toISOString().slice(11, 19) + `] ${position.coin} ${position.side}: ${decision.action} (${decision.confidence}%)`);
    }
  }

  const finishedAt = new Date();
  console.log("");
  console.log("[" + new Date().toISOString().slice(11, 19) + "] --- Summary ---");
  console.log("[" + new Date().toISOString().slice(11, 19) + `] Settlements: ${runtime.settlements.length}`);
  console.log("[" + new Date().toISOString().slice(11, 19) + `] Failures:    ${runtime.failures.length}`);
  console.log("[" + new Date().toISOString().slice(11, 19) + `] Spent:       ${formatTokenAmount(runtime.totalSpent())} USDC`);

  runtime.writeArtifacts(
    "perps-coach",
    buildDigest(runtime, finishedAt, decisions, { signals, prices, gas }),
    {
      config: PERPS_CONFIG,
      skills: SKILLS,
      decisions,
      context: { signals, prices, gas },
    },
    finishedAt,
  );
  runtime.printProviderRecovery();
  if (runtime.failures.length > 0) process.exitCode = 1;
  console.log("");
  console.log("[" + new Date().toISOString().slice(11, 19) + "] Done.");
}

main().catch((err) => {
  console.error("\nPerps Coach failed:");
  console.error(err);
  process.exit(1);
});
