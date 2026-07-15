// Composite reputation scorer: latency (30) + completeness (40) + signal quality (30) = 100.
// Used by runner.ts after each skill invocation to report a dynamic score to the facilitator.

import { pickNumber, findPoolsArray, pickPoolApr, pickAaveSupplyApy } from './parsers'

// Thresholds are settlement-aware: a full invoke() call includes 3 on-chain
// Mantle txs (pull, createJob, completeJob) which typically take 15-35s total.
function scoreLatency(ms: number): number {
  if (ms < 12_000) return 30   // fast settlement + skill
  if (ms < 22_000) return 25   // normal block times
  if (ms < 35_000) return 20   // slightly slow
  if (ms < 55_000) return 13   // slow but acceptable
  return 7
}

function scoreBySkill(
  skillId: number,
  output: unknown,
): { completeness: number; signalQuality: number } {
  if (!output || typeof output !== 'object') return { completeness: 0, signalQuality: 0 }
  const obj = output as Record<string, unknown>

  // byreal-top-pools
  if (skillId === 6) {
    const pools = findPoolsArray(output)
    if (!pools || pools.length === 0) return { completeness: 8, signalQuality: 4 }
    const { apr } = pickPoolApr(output)
    return {
      completeness: 40,
      signalQuality:
        Number.isFinite(apr) && apr > 0 && apr < 500 ? 30
        : Number.isFinite(apr) && apr > 0 ? 15
        : 8,
    }
  }

  // aave-v3-rates
  if (skillId === 12) {
    const rate = pickAaveSupplyApy(output)
    return {
      completeness: Number.isFinite(rate) ? 40 : obj.rates ? 22 : 8,
      signalQuality:
        Number.isFinite(rate) && rate > 0 && rate < 50 ? 30
        : Number.isFinite(rate) && rate > 0 ? 16
        : 6,
    }
  }

  // token-price-feed
  if (skillId === 14) {
    const hasPrices = !!(obj.prices || obj.data || (obj as Record<string, unknown>).USDC)
    return { completeness: hasPrices ? 40 : 14, signalQuality: hasPrices ? 26 : 8 }
  }

  // mantle-gas-oracle
  if (skillId === 13) {
    const gasPrice = obj.gasPrice as Record<string, unknown> | undefined
    const gwei = pickNumber(gasPrice?.gwei, obj.gasPriceGwei)
    const hasData = !!(gasPrice || obj.gas || Object.keys(obj).length > 0)
    return {
      completeness: gasPrice ? 38 : hasData ? 24 : 8,
      signalQuality:
        Number.isFinite(gwei) && gwei > 0 && gwei < 1000 ? 28
        : hasData ? 14
        : 6,
    }
  }

  // byreal-swap-preview
  if (skillId === 7) {
    const inner = (typeof obj.data === 'object' && obj.data ? obj.data : obj) as Record<string, unknown>
    const hasOut = !!inner.outAmount
    const impact = parseFloat(String(inner.priceImpactPct ?? '99'))
    return {
      completeness: hasOut ? 40 : 10,
      signalQuality:
        !Number.isNaN(impact) && impact < 0.5 ? 30
        : !Number.isNaN(impact) && impact < 2 ? 22
        : 12,
    }
  }

  // byreal-perps-signals
  if (skillId === 8) {
    const hasSignal = !!(obj.signal || obj.signals || obj.funding || obj.data)
    return { completeness: hasSignal ? 38 : 12, signalQuality: hasSignal ? 26 : 8 }
  }

  // spawn-failure-analyst, lineage-context-builder, decision-hash-verifier
  if (skillId >= 1 && skillId <= 3) {
    const keys = Object.keys(obj)
    return {
      completeness: keys.length >= 3 ? 38 : keys.length >= 1 ? 24 : 6,
      signalQuality: keys.length >= 3 ? 26 : keys.length >= 1 ? 14 : 4,
    }
  }

  // unknown skill — generic field-presence check
  const keys = Object.keys(obj)
  return { completeness: keys.length > 0 ? 28 : 8, signalQuality: keys.length > 0 ? 18 : 6 }
}

export function scoreOutput(skillId: number, output: unknown, latencyMs: number): number {
  const latency = scoreLatency(latencyMs)
  const { completeness, signalQuality } = scoreBySkill(skillId, output)
  return Math.min(100, latency + completeness + signalQuality)
}
