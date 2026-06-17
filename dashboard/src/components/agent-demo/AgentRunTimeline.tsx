'use client'
import type { AgentSpec } from '@/lib/agent-demo/specs'
import type { StepState } from '@/hooks/useAgentRun'

interface Props {
  // Accept any AgentSpec — the timeline only reads `id`, `title`, `steps`.
  spec: AgentSpec<unknown>
  steps: StepState[]
}

export default function AgentRunTimeline({ spec, steps }: Props) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        background: 'var(--lf-surface)',
        border: '1px solid var(--lf-border)',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      {spec.steps.map((stepSpec, i) => {
        const step = steps[i] ?? { status: 'queued' as const }
        const isLast = i === spec.steps.length - 1
        return (
          <TimelineRow
            key={i}
            index={i}
            label={stepSpec.label}
            skillId={stepSpec.skillId}
            step={step}
            divider={!isLast}
          />
        )
      })}
    </div>
  )
}

function TimelineRow({
  index,
  label,
  skillId,
  step,
  divider,
}: {
  index: number
  label: string
  skillId: number
  step: StepState
  divider: boolean
}) {
  const status = step.status

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '18px 20px',
        borderBottom: divider ? '1px solid var(--lf-border)' : 'none',
        background:
          status === 'running'
            ? 'linear-gradient(90deg, var(--lf-accent-bg) 0%, var(--lf-surface) 100%)'
            : 'transparent',
        transition: 'background 0.2s',
      }}
    >
      <StatusBadge index={index} status={status} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: 'var(--f-mono)',
            fontSize: 14,
            fontWeight: 500,
            color: status === 'queued' ? 'var(--lf-ink-3)' : 'var(--lf-ink)',
            display: 'flex',
            alignItems: 'baseline',
            gap: 10,
          }}
        >
          <span style={{ color: 'var(--lf-ink-3)' }}>#{skillId}</span>
          <span>{label}</span>
        </div>
        <SubText step={step} />
      </div>
      <StepActions step={step} />
    </div>
  )
}

function StatusBadge({ index, status }: { index: number; status: StepState['status'] }) {
  const size = 26
  const base: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontFamily: 'var(--f-mono)',
    flexShrink: 0,
    fontWeight: 600,
  }
  if (status === 'queued') {
    return (
      <div
        style={{
          ...base,
          background: 'var(--lf-surface-2)',
          color: 'var(--lf-ink-3)',
          border: '1px solid var(--lf-border)',
        }}
      >
        {index + 1}
      </div>
    )
  }
  if (status === 'running') {
    return (
      <div
        style={{
          ...base,
          background: 'var(--lf-accent-bg)',
          color: 'var(--lf-accent-2)',
          border: '1px solid var(--lf-accent)',
        }}
      >
        <Spinner />
      </div>
    )
  }
  if (status === 'done') {
    return (
      <div style={{ ...base, background: 'var(--lf-accent)', color: 'white' }}>
        <CheckIcon />
      </div>
    )
  }
  if (status === 'failed') {
    return (
      <div style={{ ...base, background: 'var(--lf-red)', color: 'white' }}>
        ✕
      </div>
    )
  }
  // skipped
  return (
    <div
      style={{
        ...base,
        background: 'transparent',
        color: 'var(--lf-ink-3)',
        border: '1px dashed var(--lf-border)',
      }}
    >
      –
    </div>
  )
}

function SubText({ step }: { step: StepState }) {
  const subStyle: React.CSSProperties = {
    fontSize: 12,
    color: 'var(--lf-ink-3)',
    marginTop: 3,
    fontFamily: 'var(--f-mono-2)',
  }
  switch (step.status) {
    case 'queued':
      return <div style={subStyle}>queued</div>
    case 'running':
      return <div style={{ ...subStyle, color: 'var(--lf-accent-2)' }}>signing in MetaMask...</div>
    case 'done':
      if (step.settlement) {
        return (
          <div style={subStyle}>
            jobId <span style={{ color: 'var(--lf-ink-2)' }}>{step.settlement.jobId}</span>{' '}
            · {step.settlement.completeJobTx?.slice(0, 12)}…
          </div>
        )
      }
      return <div style={subStyle}>settled</div>
    case 'failed':
      return (
        <div style={{ ...subStyle, color: 'var(--lf-red)' }}>
          {step.error ?? 'failed'}
        </div>
      )
    case 'skipped':
      return <div style={subStyle}>skipped — {step.skipReason}</div>
  }
}

function StepActions({ step }: { step: StepState }) {
  if (step.status !== 'done' || !step.settlement) return null
  const tx = step.settlement.completeJobTx
  if (!tx) return null
  return (
    <a
      href={`https://mantlescan.xyz/tx/${tx}`}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        fontSize: 11,
        fontFamily: 'var(--f-mono)',
        padding: '6px 10px',
        borderRadius: 6,
        border: '1px solid var(--lf-border)',
        color: 'var(--lf-ink-2)',
        whiteSpace: 'nowrap',
      }}
    >
      view tx ↗
    </a>
  )
}

function Spinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
      <path
        d="M22 12a10 10 0 00-10-10"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 12 12"
          to="360 12 12"
          dur="0.8s"
          repeatCount="indefinite"
        />
      </path>
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
      <path
        d="M5 13l4 4L19 7"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
