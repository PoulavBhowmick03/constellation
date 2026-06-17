'use client'
import type { SpawnDecision, AuditVerdict } from '@/lib/agent-demo/spawn'

const VERDICT_PALETTE: Record<AuditVerdict, { bg: string; ink: string }> = {
  APPROVE: { bg: 'var(--lf-green-bg)', ink: 'var(--lf-green)' },
  BLOCK: { bg: 'var(--lf-red-bg)', ink: 'var(--lf-red)' },
  NEEDS_REVIEW: { bg: 'var(--lf-amber-bg)', ink: 'var(--lf-amber)' },
}

interface Props {
  decision: SpawnDecision | undefined
  pending: boolean
}

export default function SpawnDecisionCard({ decision, pending }: Props) {
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
        Awaiting audit verdict…
      </div>
    )
  }
  if (!decision) return null

  const p = VERDICT_PALETTE[decision.verdict]

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
          background: p.bg,
          borderBottom: `1px solid ${p.ink}`,
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div>
          <div className="t-label" style={{ marginBottom: 4 }}>Audit verdict</div>
          <div
            className="t-display-heavy"
            style={{ fontSize: 28, color: p.ink, lineHeight: 1.1 }}
          >
            {decision.verdict}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="t-label">Confidence</div>
          <div className="t-mono" style={{ fontSize: 22, fontWeight: 600 }}>
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
          {decision.rationale}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 12,
            marginBottom: 16,
          }}
        >
          <Tile
            label="Decision hash"
            value={
              decision.verified === true
                ? 'verified ✓'
                : decision.verified === false
                  ? 'not found'
                  : 'unknown'
            }
          />
          <Tile label="Lineage context" value={`${decision.contextChars} chars`} />
          <Tile label="Post-mortems" value={String(decision.postMortemCount)} />
        </div>

        {decision.remediations.length > 0 && (
          <div>
            <div className="t-label" style={{ marginBottom: 8 }}>Remediations</div>
            <ul
              style={{
                margin: 0,
                paddingLeft: 18,
                fontSize: 13,
                color: 'var(--lf-ink-2)',
                lineHeight: 1.6,
              }}
            >
              {decision.remediations.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: '10px 14px',
        background: 'var(--lf-surface-2)',
        border: '1px solid var(--lf-border)',
        borderRadius: 8,
      }}
    >
      <div className="t-label" style={{ marginBottom: 4 }}>{label}</div>
      <div className="t-mono" style={{ fontSize: 14, fontWeight: 600 }}>
        {value}
      </div>
    </div>
  )
}
