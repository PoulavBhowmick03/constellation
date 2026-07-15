'use client'

interface Props {
  liveDisabled: boolean
  liveLabel: string
  running: boolean
  onRunLive: () => void
  onRunReplay: () => void
  onReset: () => void
  hasResult: boolean
}

export default function RunControls({
  liveDisabled,
  liveLabel,
  running,
  onRunLive,
  onRunReplay,
  onReset,
  hasResult,
}: Props) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        flexWrap: 'wrap',
      }}
    >
      <button
        type="button"
        disabled={liveDisabled || running}
        onClick={onRunLive}
        style={{
          ...primaryBtn,
          opacity: liveDisabled || running ? 0.5 : 1,
          cursor: liveDisabled || running ? 'not-allowed' : 'pointer',
        }}
      >
        {liveLabel}
      </button>
      <button
        type="button"
        disabled={running}
        onClick={onRunReplay}
        style={{
          ...secondaryBtn,
          opacity: running ? 0.5 : 1,
          cursor: running ? 'not-allowed' : 'pointer',
        }}
      >
        Watch demo (replay)
      </button>
      {hasResult && !running && (
        <button
          type="button"
          onClick={onReset}
          style={{
            ...ghostBtn,
          }}
        >
          Reset
        </button>
      )}
    </div>
  )
}

const primaryBtn: React.CSSProperties = {
  fontFamily: 'var(--f-mono)',
  fontSize: 13,
  letterSpacing: '0.02em',
  padding: '12px 22px',
  borderRadius: 999,
  background: 'var(--lf-ink)',
  color: 'white',
  fontWeight: 600,
}

const secondaryBtn: React.CSSProperties = {
  fontFamily: 'var(--f-mono)',
  fontSize: 13,
  letterSpacing: '0.02em',
  padding: '12px 22px',
  borderRadius: 999,
  background: 'var(--lf-surface)',
  color: 'var(--lf-ink)',
  border: '1px solid var(--lf-border-strong)',
  fontWeight: 500,
}

const ghostBtn: React.CSSProperties = {
  fontFamily: 'var(--f-mono)',
  fontSize: 12,
  padding: '10px 18px',
  borderRadius: 999,
  background: 'transparent',
  color: 'var(--lf-ink-2)',
  fontWeight: 500,
}
