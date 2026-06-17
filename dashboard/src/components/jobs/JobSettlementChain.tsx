'use client'
import type React from 'react'

/**
 * Visualises the 5-leg ERC-8004 settlement chain for a single job:
 *
 *   Pull → Create → Complete → Rep → ERC-8004
 *
 * Each segment is a mantlescan link when a tx hash is present, and a dimmed
 * "—" / "pending" otherwise. Built as a sibling of agent-demo/SettlementChain
 * (which renders an aggregated table) so /agent-demo is zero-regression.
 */

export interface JobSettlementChainProps {
  pullTx?: string
  createJobTx?: string
  completeJobTx?: string
  skillRegistryRepTx?: string
  erc8004FeedbackTx?: string
}

interface Segment {
  label: string
  hash?: string
  /** Headline highlight (ERC-8004 = the canonical claim) */
  accent?: boolean
}

const MANTLESCAN_TX = 'https://mantlescan.xyz/tx/'

function isPresent(hash: string | undefined): hash is string {
  return !!hash && hash !== '' && hash !== '0x' && !/^0x0+$/.test(hash)
}

function Pending(): React.ReactElement {
  return (
    <span
      style={{
        color: 'var(--lf-ink-3)',
        fontFamily: 'var(--f-mono)',
        fontSize: 11,
        opacity: 0.55,
      }}
      title="not yet recorded on-chain"
    >
      —
    </span>
  )
}

function SegmentCell({ seg, last }: { seg: Segment; last: boolean }): React.ReactElement {
  const present = isPresent(seg.hash)
  const accentColor = seg.accent ? 'var(--lf-accent)' : 'var(--lf-ink-2)'
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        padding: '6px 10px',
        borderRight: last ? 'none' : '1px solid var(--lf-border)',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        background: seg.accent && present ? 'rgba(15, 190, 127, 0.06)' : 'transparent',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--f-mono-2)',
          fontSize: 9,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: seg.accent ? 'var(--lf-accent)' : 'var(--lf-ink-3)',
          opacity: present ? 1 : 0.6,
        }}
      >
        {seg.label}
      </span>
      <span
        style={{
          fontFamily: 'var(--f-mono)',
          fontSize: 11,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {present ? (
          <a
            href={`${MANTLESCAN_TX}${seg.hash}`}
            target="_blank"
            rel="noopener noreferrer"
            title={`${seg.label} · ${seg.hash}`}
            style={{
              color: accentColor,
              textDecoration: 'underline dotted',
              textUnderlineOffset: 2,
            }}
          >
            {(seg.hash as string).slice(0, 8)}…
          </a>
        ) : (
          <Pending />
        )}
      </span>
    </div>
  )
}

export default function JobSettlementChain(props: JobSettlementChainProps): React.ReactElement {
  const segments: Segment[] = [
    { label: 'Pull',      hash: props.pullTx },
    { label: 'Create',    hash: props.createJobTx },
    { label: 'Complete',  hash: props.completeJobTx },
    { label: 'Rep',       hash: props.skillRegistryRepTx },
    { label: 'ERC-8004',  hash: props.erc8004FeedbackTx, accent: true },
  ]

  return (
    <div
      role="group"
      aria-label="On-chain settlement chain"
      style={{
        display: 'flex',
        alignItems: 'stretch',
        border: '1px solid var(--lf-border)',
        borderRadius: 6,
        overflow: 'hidden',
        background: 'var(--lf-surface, transparent)',
        width: '100%',
      }}
    >
      {segments.map((seg, i) => (
        <SegmentCell key={seg.label} seg={seg} last={i === segments.length - 1} />
      ))}
    </div>
  )
}
