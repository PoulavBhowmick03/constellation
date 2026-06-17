// Perps Coach decision logic lifted from agents/src/perps-coach.ts (pure TS).

export type PerpsSide = 'LONG' | 'SHORT'
export type PerpsAction = 'HOLD' | 'TAKE_PROFIT' | 'REDUCE' | 'AVOID'

export interface PerpsPosition {
  coin: string
  side: PerpsSide
}

export interface PositionDecision {
  coin: string
  side: PerpsSide
  action: PerpsAction
  confidence: number
  rationale: string
  bullishSignals: number
  bearishSignals: number
}

export interface PerpsDecision {
  positions: PositionDecision[]
  headline: 'HOLD' | 'REDUCE RISK' | 'TAKE PROFIT'
  /** Aggregate confidence: lowest of all positions, since the weakest decision sets the floor. */
  confidence: number
  reason: string
}

export const DEFAULT_PERPS_POSITIONS: PerpsPosition[] = [
  { coin: 'BTC', side: 'LONG' },
  { coin: 'ETH', side: 'LONG' },
  { coin: 'SOL', side: 'LONG' },
]

function textOf(value: unknown): string {
  try {
    return JSON.stringify(value).toLowerCase()
  } catch {
    return String(value).toLowerCase()
  }
}

function countTerms(text: string, terms: string[]): number {
  return terms.reduce((c, t) => c + (text.includes(t) ? 1 : 0), 0)
}

export function decidePerpsPosition(
  position: PerpsPosition,
  signal: unknown,
): PositionDecision {
  if (!signal) {
    return {
      ...position,
      action: 'HOLD',
      confidence: 35,
      rationale: 'No signal available; defaulting to HOLD with low confidence.',
      bullishSignals: 0,
      bearishSignals: 0,
    }
  }

  const text = textOf(signal)
  const bullish = countTerms(text, [
    'bullish', 'buy', 'long', 'uptrend', 'support', 'positive', 'momentum',
  ])
  const bearish = countTerms(text, [
    'bearish', 'sell', 'short', 'downtrend', 'resistance', 'negative', 'weak',
  ])
  const profit = countTerms(text, [
    'take profit', 'target', 'overbought', 'extended', 'exhaustion',
  ])
  const risk = countTerms(text, [
    'stop', 'liquidation', 'volatile', 'risk', 'breakdown', 'breakout against',
  ])
  const aligned = position.side === 'LONG' ? bullish - bearish : bearish - bullish

  if (risk > 1 || aligned <= -2) {
    return {
      ...position,
      action: 'REDUCE',
      confidence: 78,
      rationale: `${position.side} exposure is fighting the signal mix (${bullish} bullish / ${bearish} bearish) with elevated risk terms.`,
      bullishSignals: bullish,
      bearishSignals: bearish,
    }
  }

  if (profit > 0 && aligned >= 1) {
    return {
      ...position,
      action: 'TAKE_PROFIT',
      confidence: 72,
      rationale: `${position.side} signal still aligned, but profit-taking language appeared in the perps scan.`,
      bullishSignals: bullish,
      bearishSignals: bearish,
    }
  }

  if (aligned >= 0) {
    return {
      ...position,
      action: 'HOLD',
      confidence: aligned > 0 ? 68 : 55,
      rationale: `${position.side} exposure is not contradicted by the current perps scan.`,
      bullishSignals: bullish,
      bearishSignals: bearish,
    }
  }

  return {
    ...position,
    action: 'AVOID',
    confidence: 60,
    rationale: `Signal mix is weak for a fresh ${position.side} entry; wait for cleaner confirmation.`,
    bullishSignals: bullish,
    bearishSignals: bearish,
  }
}

export function decidePerps(
  positions: PerpsPosition[],
  signals: unknown[],
): PerpsDecision {
  const decisions = positions.map((p, i) => decidePerpsPosition(p, signals[i]))
  const reduceCount = decisions.filter((d) => d.action === 'REDUCE').length
  const takeProfitCount = decisions.filter((d) => d.action === 'TAKE_PROFIT').length
  const headline: PerpsDecision['headline'] =
    reduceCount > 0 ? 'REDUCE RISK' : takeProfitCount > 0 ? 'TAKE PROFIT' : 'HOLD'
  const confidence = decisions.length
    ? Math.min(...decisions.map((d) => d.confidence))
    : 0
  const reason =
    reduceCount > 0
      ? `${reduceCount} position(s) flagged for risk reduction; lower exposure before continuing.`
      : takeProfitCount > 0
        ? `${takeProfitCount} position(s) approaching profit-taking language; consider trimming.`
        : 'No positions contradicted by current Byreal signals; HOLD across the book.'
  return { positions: decisions, headline, confidence, reason }
}
