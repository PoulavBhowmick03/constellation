'use client'
import type { PerpsDecision, PerpsAction } from '@/lib/agent-demo/perps'

const ACTION_COLOR: Record<PerpsAction, { bg: string; ink: string }> = {
  HOLD: { bg: 'var(--lf-green-bg)', ink: 'var(--lf-green)' },
  TAKE_PROFIT: { bg: 'var(--lf-amber-bg)', ink: 'var(--lf-amber)' },
  REDUCE: { bg: 'var(--lf-red-bg)', ink: 'var(--lf-red)' },
  AVOID: { bg: 'var(--lf-surface-2)', ink: 'var(--lf-ink-2)' },
}

interface Props {
  decision: PerpsDecision | undefined
  pending: boolean
}

export default function PerpsDecisionCard({ decision, pending }: Props) {
  if (!decision && pending) {
    return <PendingShell />
  }
  if (!decision) return null

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
          background: 'var(--lf-surface-2)',
          borderBottom: '1px solid var(--lf-border)',
        }}
      >
        <div className="t-label" style={{ marginBottom: 4 }}>Verdict</div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: 16,
          }}
        >
          <div
            className="t-display-heavy"
            style={{ fontSize: 28, lineHeight: 1.1 }}
          >
            {decision.headline}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="t-label">Min confidence</div>
            <div className="t-mono" style={{ fontSize: 22, fontWeight: 600 }}>
              {decision.confidence}%
            </div>
          </div>
        </div>
        <div
          style={{
            color: 'var(--lf-ink-2)',
            fontSize: 14,
            lineHeight: 1.55,
            marginTop: 10,
          }}
        >
          {decision.reason}
        </div>
      </div>

      <div style={{ padding: 4 }}>
        {decision.positions.map((p) => {
          const c = ACTION_COLOR[p.action]
          return (
            <div
              key={p.coin + p.side}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '14px 20px',
                borderBottom: '1px solid var(--lf-border)',
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--f-mono)',
                  fontWeight: 600,
                  fontSize: 14,
                  width: 80,
                }}
              >
                {p.coin}{' '}
                <span style={{ color: 'var(--lf-ink-3)', fontWeight: 400 }}>
                  {p.side}
                </span>
              </div>
              <div
                style={{
                  background: c.bg,
                  color: c.ink,
                  padding: '4px 12px',
                  borderRadius: 6,
                  fontFamily: 'var(--f-mono)',
                  fontSize: 12,
                  fontWeight: 600,
                  minWidth: 110,
                  textAlign: 'center',
                }}
              >
                {p.action}
              </div>
              <div
                style={{
                  fontFamily: 'var(--f-mono-2)',
                  fontSize: 12,
                  color: 'var(--lf-ink-3)',
                  width: 96,
                  whiteSpace: 'nowrap',
                }}
              >
                {p.bullishSignals}↑ / {p.bearishSignals}↓
              </div>
              <div
                style={{
                  flex: 1,
                  fontSize: 12,
                  color: 'var(--lf-ink-2)',
                  lineHeight: 1.55,
                }}
              >
                {p.rationale}
              </div>
              <div
                style={{
                  fontFamily: 'var(--f-mono)',
                  fontSize: 13,
                  color: 'var(--lf-ink-2)',
                  fontWeight: 500,
                  width: 50,
                  textAlign: 'right',
                }}
              >
                {p.confidence}%
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PendingShell() {
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
      Awaiting per-position coaching…
    </div>
  )
}
