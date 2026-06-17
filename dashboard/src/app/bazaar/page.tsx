'use client'
import { useState, useMemo } from 'react'
import { useBazaarData } from '@/hooks/useBazaarData'
import SkillCard from '@/components/SkillCard'
import MockDataBanner from '@/components/MockDataBanner'
import PaymentModal from '@/components/PaymentModal'
import type { FilterTier, SortKey, Skill } from '@/lib/types'

const TIERS: FilterTier[] = ['ALL', 'PRO', 'BASIC', 'FREE']

export default function BazaarPage() {
  const { skills, isMockData, loading } = useBazaarData()
  const [query, setQuery] = useState('')
  const [tier, setTier] = useState<FilterTier>('ALL')
  const [minScore, setMinScore] = useState(0)
  const [sort, setSort] = useState<SortKey>('reputation')
  const [paySkill, setPaySkill] = useState<Skill | null>(null)

  const filtered = useMemo(() => {
    let list = skills.slice()
    if (query) {
      const q = query.toLowerCase()
      list = list.filter((s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q))
    }
    if (tier !== 'ALL') list = list.filter((s) => s.tier === tier)
    list = list.filter((s) => s.score >= minScore)
    if (sort === 'reputation') list.sort((a, b) => b.score - a.score)
    else if (sort === 'jobs') list.sort((a, b) => b.jobs - a.jobs)
    else if (sort === 'price-low') list.sort((a, b) => a.price - b.price)
    else list.sort((a, b) => parseInt(b.id) - parseInt(a.id))
    return list
  }, [skills, query, tier, minScore, sort])

  const avgScore = skills.length
    ? Math.round(skills.reduce((a, s) => a + s.score, 0) / skills.length)
    : 0

  return (
    <div className="page">
      {isMockData && <MockDataBanner />}
      {paySkill && <PaymentModal skill={paySkill} onClose={() => setPaySkill(null)} />}

      <div className="container">
        <div className="page-header">
          <div>
            <div className="t-label" style={{ marginBottom: 8 }}>Discovery</div>
            <h1>The Bazaar</h1>
          </div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 13, color: 'var(--lf-ink-2)', textAlign: 'right' }}>
            {skills.length} skills · avg score{' '}
            <span style={{ color: 'var(--lf-ink)' }}>{avgScore}/100</span>{' '}
            · last job 4m ago
          </div>
        </div>

        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 280px', position: 'relative' }}>
              <svg
                width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--lf-ink-3)' }}
              >
                <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
              </svg>
              <input
                className="input mono"
                placeholder="Search skills by name or capability..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ paddingLeft: 38, background: 'var(--lf-surface-2)' }}
              />
            </div>

            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '0 14px', height: 42, background: 'var(--lf-surface-2)',
              border: '1px solid var(--lf-border)', borderRadius: 6, minWidth: 240,
            }}>
              <span className="t-label" style={{ margin: 0, fontSize: 10 }}>Min score</span>
              <input
                type="range" min="0" max="100" value={minScore}
                onChange={(e) => setMinScore(Number(e.target.value))}
                style={{ flex: 1, accentColor: 'var(--lf-accent)' }}
              />
              <span style={{ fontFamily: 'var(--f-mono)', fontSize: 13, color: 'var(--lf-ink)', minWidth: 28, textAlign: 'right' }}>
                {minScore}
              </span>
            </div>

            <select
              className="input mono"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              style={{ width: 220, background: 'var(--lf-surface-2)', cursor: 'pointer' }}
            >
              <option value="reputation">Sort: By Reputation</option>
              <option value="jobs">Sort: Most Jobs</option>
              <option value="price-low">Sort: Price Low → High</option>
              <option value="newest">Sort: Newest</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {TIERS.map((t) => (
              <button
                key={t}
                className={`pill ${tier === t ? 'active' : ''}`}
                onClick={() => setTier(t)}
              >
                {t}
                <span style={{ marginLeft: 8, opacity: 0.6 }}>
                  {t === 'ALL' ? skills.length : skills.filter((s) => s.tier === t).length}
                </span>
              </button>
            ))}
            <div style={{ flex: 1 }} />
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--lf-ink-3)' }}>
              Showing {filtered.length} of {skills.length}
            </div>
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, paddingBottom: 80 }}>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="card" style={{ height: 280, opacity: 0.4 }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '96px 20px',
            border: '1px dashed var(--lf-border)', borderRadius: 8,
          }}>
            <div className="t-display" style={{ fontSize: 22, marginBottom: 8 }}>
              No skills match your filters
            </div>
            <p style={{ color: 'var(--lf-ink-3)', fontSize: 14, marginBottom: 20 }}>
              Try widening the score range or selecting a different tier.
            </p>
            <button
              onClick={() => { setQuery(''); setTier('ALL'); setMinScore(0) }}
              style={{ color: 'var(--lf-accent)', fontSize: 14, fontWeight: 500 }}
            >
              Clear filters →
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, paddingBottom: 80 }}>
            {filtered.map((s) => (
              <SkillCard key={s.id} skill={s} onUse={() => setPaySkill(s)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
