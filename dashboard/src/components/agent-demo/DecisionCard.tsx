'use client'
import type { ScoutDecision } from '@/lib/agent-demo/decide'

interface Props {
  decision: ScoutDecision | undefined
  pending: boolean
}

export default function ScoutDecisionCard({ decision, pending }: Props) {
  if (!decision && !pending) return null

  if (!decision && pending) {
    return (
      <div
        style={{
          background: 'var(--lf-surface)',
          border: '1px dashed var(--lf-border-strong)',
          borderRadius: 12,
          padding: '20px 24px',
          textAlign: 'center',
          color: 'var(--lf-ink-3)',
          fontFamily: 'var(--f-mono)',
          fontSize: 13,
        }}
      >
        Awaiting decision…
      </div>
    )
  }

  if (!decision) return null

  const enter = decision.action === 'ENTER_POOL'
  const accent = enter ? 'var(--lf-green)' : 'var(--lf-amber)'
  const bg = enter ? 'var(--lf-green-bg)' : 'var(--lf-amber-bg)'

  return (
    <div
      style={{
        background: 'var(--lf-surface)',
        border: '1px solid var(--lf-border)',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '18px 24px',
          background: bg,
          borderBottom: `1px solid ${accent}`,
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div>
          <div className="t-label" style={{ marginBottom: 4 }}>Decision</div>
          <div
            className="t-display-heavy"
            style={{ fontSize: 28, color: accent, lineHeight: 1.1 }}
          >
            {decision.action}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="t-label">Confidence</div>
          <div
            className="t-mono"
            style={{ fontSize: 22, fontWeight: 600 }}
          >
            {decision.confidence}%
          </div>
        </div>
      </div>
      <div style={{ padding: '16px 24px' }}>
        <div
          style={{
            color: 'var(--lf-ink-2)',
            fontSize: 14,
            lineHeight: 1.55,
            marginBottom: 16,
          }}
        >
          {decision.reason}
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 16,
            marginTop: 6,
          }}
        >
          <SignalTile
            label="Top Byreal APR (24h)"
            value={
              decision.topPoolApr !== undefined
                ? `${decision.topPoolApr.toFixed(2)}%`
                : '—'
            }
          />
          <SignalTile
            label="Aave V3 USDC supply"
            value={
              decision.aaveSupplyApy !== undefined
                ? `${decision.aaveSupplyApy.toFixed(2)}%`
                : '—'
            }
          />
          <SignalTile
            label="Est. swap gas"
            value={
              decision.gasUsd !== undefined
                ? `$${decision.gasUsd.toFixed(2)}`
                : '—'
            }
          />
        </div>

        {decision.swap && (
          <div
            style={{
              marginTop: 18,
              padding: '12px 14px',
              background: 'var(--lf-surface-2)',
              border: '1px solid var(--lf-border)',
              borderRadius: 8,
              fontSize: 12,
              fontFamily: 'var(--f-mono-2)',
              color: 'var(--lf-ink-2)',
            }}
          >
            <div className="t-label" style={{ marginBottom: 8 }}>Modeled swap</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 12, rowGap: 4 }}>
              {decision.swap.inAmount && (
                <>
                  <span style={{ color: 'var(--lf-ink-3)' }}>In</span>
                  <span>{decision.swap.inAmount}</span>
                </>
              )}
              {decision.swap.outAmount && (
                <>
                  <span style={{ color: 'var(--lf-ink-3)' }}>Out</span>
                  <span>{decision.swap.outAmount}</span>
                </>
              )}
              {decision.swap.priceImpactPct && (
                <>
                  <span style={{ color: 'var(--lf-ink-3)' }}>Price impact</span>
                  <span>{parseFloat(decision.swap.priceImpactPct).toFixed(2)}%</span>
                </>
              )}
              {decision.swap.routerType && (
                <>
                  <span style={{ color: 'var(--lf-ink-3)' }}>Router</span>
                  <span>{decision.swap.routerType}</span>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function SignalTile({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: '12px 14px',
        background: 'var(--lf-surface-2)',
        border: '1px solid var(--lf-border)',
        borderRadius: 8,
      }}
    >
      <div className="t-label" style={{ marginBottom: 6 }}>{label}</div>
      <div className="t-mono" style={{ fontSize: 18, fontWeight: 600 }}>
        {value}
      </div>
    </div>
  )
}
