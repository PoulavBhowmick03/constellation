'use client'
import Link from 'next/link'
import type { Skill } from '@/lib/types'
import TierBadge from './TierBadge'
import ReputationGauge from './ReputationGauge'
import AddressChip from './AddressChip'

interface SkillCardProps {
  skill: Skill
  onUse?: (skill: Skill) => void
}

export default function SkillCard({ skill, onUse }: SkillCardProps) {
  const isEmpty = skill.score === 0 && skill.jobs === 0

  return (
    <Link href={`/skill/${skill.id}`} style={{ display: 'block', textDecoration: 'none' }}>
      <div
        className="card card-hover card-pad-sm"
        style={{ display: 'flex', flexDirection: 'column', opacity: isEmpty ? 0.92 : 1, height: '100%' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <TierBadge tier={skill.tier} />
          <ReputationGauge score={isEmpty ? null : skill.score} size={56} strokeWidth={5} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <div className="t-display" style={{ fontSize: 19, lineHeight: 1.25, marginBottom: 4 }}>
            {skill.name}
          </div>
          <div style={{ fontFamily: 'var(--f-mono-2)', fontSize: 11, color: 'var(--lf-ink-3)', letterSpacing: '0.05em' }}>
            {skill.version}
          </div>
        </div>

        <p style={{
          fontSize: 13, color: 'var(--lf-ink-2)', margin: '0 0 20px', lineHeight: 1.5,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {skill.description}
        </p>

        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: '6px 14px',
          fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--lf-ink-2)', marginBottom: 16,
        }}>
          <span>{skill.jobs} jobs</span>
          <span style={{ color: 'var(--lf-ink-3)' }}>·</span>
          <span onClick={(e) => e.preventDefault()}>
            <AddressChip address={skill.owner} />
          </span>
          <span style={{ color: 'var(--lf-ink-3)' }}>·</span>
          <span>{skill.price === 0 ? 'free' : `${skill.price.toFixed(2)} USDC`}</span>
        </div>

        {isEmpty && (
          <div style={{ fontStyle: 'italic', fontSize: 12, color: 'var(--lf-amber)', marginBottom: 12 }}>
            New skill; no reputation yet
          </div>
        )}

        <div style={{ borderTop: '1px solid var(--lf-border)', paddingTop: 14, marginTop: 'auto' }}>
          <button
            onClick={(e) => { e.preventDefault(); onUse?.(skill) }}
            style={{
              color: 'var(--lf-accent)', fontSize: 13, fontWeight: 500,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            Use This Skill <span style={{ fontSize: 14 }}>→</span>
          </button>
        </div>
      </div>
    </Link>
  )
}
