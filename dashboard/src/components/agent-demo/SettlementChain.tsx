'use client'
import type { SettlementSummary } from '@/lib/agent-demo/events'

interface Props {
  settlements: SettlementSummary[]
}

const txCell = (
  label: string,
  hash: `0x${string}` | undefined,
): React.ReactNode => {
  if (!hash) return <span style={{ color: 'var(--lf-ink-3)' }}>—</span>
  return (
    <a
      href={`https://mantlescan.xyz/tx/${hash}`}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: 'var(--lf-ink-2)', textDecoration: 'underline dotted', whiteSpace: 'nowrap' }}
      title={label}
    >
      {hash.slice(0, 10)}…
    </a>
  )
}

export default function SettlementChain({ settlements }: Props) {
  if (settlements.length === 0) return null
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
          padding: '14px 20px',
          borderBottom: '1px solid var(--lf-border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <div className="t-label">On-chain settlement chain</div>
        <div
          style={{
            fontFamily: 'var(--f-mono)',
            fontSize: 12,
            color: 'var(--lf-ink-3)',
          }}
        >
          {settlements.length} settlement{settlements.length === 1 ? '' : 's'} ·{' '}
          {settlements.length * 5} mainnet txs
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontFamily: 'var(--f-mono-2)',
            fontSize: 12,
          }}
        >
          <thead>
            <tr style={{ color: 'var(--lf-ink-3)' }}>
              <th style={th}>#</th>
              <th style={th}>Skill</th>
              <th style={th}>jobId</th>
              <th style={th}>pull</th>
              <th style={th}>createJob</th>
              <th style={th}>completeJob</th>
              <th style={th}>SkillRegistry rep</th>
              <th style={th}>ERC-8004 feedback</th>
            </tr>
          </thead>
          <tbody>
            {settlements.map((s, i) => (
              <tr
                key={s.jobId + i}
                style={{
                  borderTop: '1px solid var(--lf-border)',
                  color: 'var(--lf-ink)',
                }}
              >
                <td style={td}>{i + 1}</td>
                <td style={td}>
                  <span style={{ color: 'var(--lf-ink-3)' }}>#{s.skillId}</span>{' '}
                  {s.skillName}
                </td>
                <td style={td}>{s.jobId}</td>
                <td style={td}>{txCell('pull', s.pullTx)}</td>
                <td style={td}>{txCell('createJob', s.createJobTx)}</td>
                <td style={td}>{txCell('completeJob', s.completeJobTx)}</td>
                <td style={td}>{txCell('SkillRegistry rep', s.skillRegistryRepTx)}</td>
                <td style={td}>{txCell('ERC-8004 feedback', s.erc8004FeedbackTx)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const th: React.CSSProperties = {
  textAlign: 'left',
  fontWeight: 500,
  textTransform: 'uppercase',
  fontSize: 10,
  letterSpacing: '0.08em',
  padding: '10px 14px',
}

const td: React.CSSProperties = {
  padding: '10px 14px',
  whiteSpace: 'nowrap',
}
