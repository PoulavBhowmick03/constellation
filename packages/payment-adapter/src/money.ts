import type { Money } from "./types.js";

/** Parse a Money's base-unit amount to a bigint (throws on non-integer input). */
export function toBaseUnits(m: Money): bigint {
  if (!/^\d+$/.test(m.amount)) {
    throw new Error(`Money.amount must be a base-unit integer string, got "${m.amount}"`);
  }
  return BigInt(m.amount);
}

/**
 * True if `a` <= `b`. Requires the same token; different tokens are not
 * comparable, so we return false (the caller treats that as a budget failure
 * rather than silently letting an unlike-token spend through).
 */
export function lteMoney(a: Money, b: Money): boolean {
  if (a.token !== b.token) return false;
  const maxDec = Math.max(a.decimals, b.decimals);
  const av = toBaseUnits(a) * 10n ** BigInt(maxDec - a.decimals);
  const bv = toBaseUnits(b) * 10n ** BigInt(maxDec - b.decimals);
  return av <= bv;
}
