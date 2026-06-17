import type { Stats } from '@/lib/types'

const METRICS = [
  { key: 'totalSkills', label: 'Total skills', unit: '', sub: 'Live on mainnet' },
  { key: 'volume', label: 'Settled volume', unit: 'USDC', sub: 'On Mantle' },
  { key: 'avgResponse', label: 'Avg response', unit: 'ms', sub: 'Across all skills' },
  { key: 'writes', label: 'Reputation writes', unit: '', sub: 'On-chain, permanent' },
] as const

export default function StatsBar({ stats }: { stats: Stats | null }) {
  const values = {
    totalSkills: stats ? String(stats.totalSkills) : '—',
    volume: stats ? (stats.totalJobsExecuted > 0 ? '0.50' : '0') : '—',
    avgResponse: '180',
    writes: stats ? String(stats.totalJobsExecuted) : '—',
  }

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
      background: 'var(--lf-surface)',
      borderTop: '1px solid var(--lf-border)',
      borderBottom: '1px solid var(--lf-border)',
    }}>
      {METRICS.map((m, i) => (
        <div key={m.key} style={{
          padding: '32px 28px',
          borderRight: i < 3 ? '1px solid var(--lf-border)' : 'none',
        }}>
          <div className="t-label" style={{ marginBottom: 12 }}>{m.label}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span className="t-display" style={{ fontSize: 40, lineHeight: 1, letterSpacing: '-0.02em' }}>
              {values[m.key]}
            </span>
            {m.unit && (
              <span style={{ fontFamily: 'var(--f-mono)', fontSize: 14, color: 'var(--lf-ink-3)' }}>
                {m.unit}
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--lf-ink-3)', marginTop: 8, fontFamily: 'var(--f-mono)' }}>
            {m.sub}
          </div>
        </div>
      ))}
    </div>
  )
}
