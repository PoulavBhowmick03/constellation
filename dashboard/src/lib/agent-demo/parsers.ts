// Pure parser helpers lifted from agents/src/autonomous-scout.ts.
// Duplicated rather than imported because the `agents/` package depends on
// dotenv/process.env at module load and is not browser-safe.

export function pickNumber(...vals: unknown[]): number {
  for (const v of vals) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = parseFloat(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return NaN;
}

export function findPoolsArray(v: unknown, depth = 0): unknown[] | null {
  if (depth > 6 || !v || typeof v !== "object") return null;
  const obj = v as Record<string, unknown>;
  if (Array.isArray(obj.pools)) return obj.pools;
  for (const key of ["data", "result", "response", "payload"]) {
    const found = findPoolsArray(obj[key], depth + 1);
    if (found) return found;
  }
  return null;
}

export function pickPoolApr(topPools: unknown): { apr: number; pool: unknown } {
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
      (r.day as Record<string, unknown> | undefined)?.apr,
    );
    if (Number.isFinite(apr) && apr > 0) return { apr, pool: r };
  }
  return { apr: NaN, pool: null };
}

export function pickAaveSupplyApy(aave: unknown): number {
  if (!aave || typeof aave !== "object") return NaN;
  const obj = aave as Record<string, unknown>;
  const rates = obj.rates;
  if (Array.isArray(rates)) {
    const usdc =
      rates.find((r) => (r as Record<string, unknown>).symbol === "USDC") ??
      rates[0];
    if (usdc && typeof usdc === "object") {
      const r = usdc as Record<string, unknown>;
      return pickNumber(r.supplyAPR, r.supplyApr, r.supplyAPY);
    }
  }
  return pickNumber(
    obj.supplyAPR,
    obj.supplyApr,
    obj.supplyAPY,
    (obj.USDC as Record<string, unknown> | undefined)?.supplyAPR,
  );
}

export function pickGasUsd(gas: unknown, mntPriceUsd: number): number {
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

export interface SwapPreviewDistilled {
  inAmount?: string;
  outAmount?: string;
  inputMint?: string;
  outputMint?: string;
  priceImpactPct?: string;
  routerType?: string;
  orderId?: string;
}

export function distillSwapPreview(swap: unknown): SwapPreviewDistilled {
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
