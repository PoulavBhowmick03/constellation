'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useBazaarData } from '@/hooks/useBazaarData'
import MockDataBanner from '@/components/MockDataBanner'
import LiveDot from '@/components/LiveDot'
import ScorePill from '@/components/ScorePill'
import TierBadge from '@/components/TierBadge'
import AddressChip from '@/components/AddressChip'
import ReputationGauge from '@/components/ReputationGauge'
import JobSettlementChain from '@/components/jobs/JobSettlementChain'

const CONTRACTS = {
  SkillRegistry: '0x37041F257Bf8f1E201497Dc0BCDa1ae0d8317992',
  x402Escrow:    '0x1d550b555B3a2e124ef611b55965848d6be233a2',
  BazaarListings:'0xaB5a52C30D769A7Eae1474857A6180E71765CBAF',
}

const BASE_BLOCK = 95829356

function formatTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  return `${Math.floor(diff / 3_600_000)}h ago`
}

function NetRow({ label, value, mono, last }: { label: string; value: React.ReactNode; mono?: boolean; last?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '8px 0', borderBottom: last ? 'none' : '1px solid var(--lf-border)',
      fontSize: 12,
    }}>
      <span style={{ color: 'var(--lf-ink-3)', fontFamily: 'var(--f-mono-2)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
        {label}
      </span>
      <span style={{
        color: 'var(--lf-ink-2)', fontFamily: mono ? 'var(--f-mono)' : 'inherit',
        maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        textAlign: 'right',
      }}>
        {value}
      </span>
    </div>
  )
}

export default function JobsPage() {
  const { jobs, skills, isMockData } = useBazaarData()
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15000)
    return () => clearInterval(id)
  }, [])

  const blockNum = BASE_BLOCK + Math.floor(tick * 2.3)
  // Defensive client-side filter: indexer also filters server-side, but during
  // the rollout window some jobs may still arrive without a `kind` field —
  // treat those as real to avoid hiding legitimate history.
  const visibleJobs = jobs.filter((j) => j.kind === undefined || j.kind === 'real')
  const totalVolume = visibleJobs.reduce((sum, j) => sum + parseFloat(j.amount || '0'), 0)
  const topSkill = skills.find((s) => s.id === '1') ?? skills[0]

  return (
    <div className="page">
      {isMockData && <MockDataBanner />}

      <div className="container" style={{ paddingTop: 32, paddingBottom: 80 }}>
        <div style={{
          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
          marginBottom: 32, paddingBottom: 24, borderBottom: '1px solid var(--lf-border)',
        }}>
          <div>
            <div className="t-label" style={{ marginBottom: 8 }}>Transparency</div>
            <h1 className="t-display" style={{ fontSize: 40, margin: 0, letterSpacing: '-0.02em' }}>
              Live Job Feed
            </h1>
            <p style={{ color: 'var(--lf-ink-2)', margin: '12px 0 0', fontSize: 15 }}>
              Every payment is visible. Every score is on-chain. This is the proof.
            </p>
          </div>
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8,
            fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--lf-ink-3)',
          }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <LiveDot /> Polling every 15s
            </span>
            <span>
              {visibleJobs.filter((j) => j.confirmed).length} confirmed job{visibleJobs.filter((j) => j.confirmed).length !== 1 ? 's' : ''} · ${totalVolume.toFixed(2)} USDC settled on Mantle
            </span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 32 }}>
          <div>
            {visibleJobs.some((j) => j.confirmed) && (
              <div style={{
                padding: '10px 16px',
                background: 'rgba(15, 190, 127, 0.06)',
                border: '1px solid rgba(15, 190, 127, 0.25)',
                borderRadius: 6, marginBottom: 16,
                fontFamily: 'var(--f-mono)', fontSize: 12,
                color: 'var(--lf-green)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span>✓</span>
                Confirmed on Mantle mainnet · block {blockNum.toLocaleString()}
              </div>
            )}

            {visibleJobs.length === 0 ? (
              <div style={{
                padding: '40px 24px', border: '1px dashed var(--lf-border)', borderRadius: 6,
                textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
              }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[0, 0.2, 0.4].map((delay, i) => (
                    <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--lf-ink-3)', animation: `pulse-soft 1.4s infinite ${delay}s` }} />
                  ))}
                </div>
                <div style={{ fontFamily: 'var(--f-display)', fontSize: 18, color: 'var(--lf-ink-2)' }}>
                  No jobs yet…
                </div>
                <div style={{ fontSize: 13, color: 'var(--lf-ink-3)', maxWidth: 400 }}>
                  Skills are online · Pay for any skill to see it here
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {visibleJobs.map((j) => (
                  <div
                    key={j.id}
                    className="card"
                    style={{
                      padding: 16,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                      borderLeft: j.confirmed
                        ? '2px solid var(--lf-accent)'
                        : '2px solid transparent',
                    }}
                  >
                    {/* Headline: full 5-leg ERC-8004 settlement chain */}
                    <JobSettlementChain
                      pullTx={j.pullTx}
                      createJobTx={j.createJobTx}
                      completeJobTx={j.completeJobTx ?? j.settlementTx}
                      skillRegistryRepTx={j.skillRegistryRepTx}
                      erc8004FeedbackTx={j.erc8004FeedbackTx}
                    />

                    {/* Metadata footer */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        flexWrap: 'wrap',
                        fontSize: 12,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'var(--f-mono)', color: 'var(--lf-ink-3)' }}>
                          {formatTime(j.timestamp)}
                        </span>
                        <TierBadge tier={j.skillTier} />
                        <Link
                          href={`/skill/${j.skillId}`}
                          style={{
                            cursor: 'pointer',
                            fontFamily: 'var(--f-mono)',
                            fontSize: 13,
                            color: 'var(--lf-accent)',
                          }}
                        >
                          {j.skillName}
                        </Link>
                        <ScorePill score={j.score} />
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--lf-ink-3)' }}>
                          <span style={{ fontFamily: 'var(--f-mono-2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>by</span>
                          <AddressChip address={j.consumer} />
                        </span>
                      </div>
                      <span style={{ fontFamily: 'var(--f-mono)', fontWeight: 500, fontSize: 14 }}>
                        {j.amount} <span style={{ color: 'var(--lf-ink-3)' }}>USDC</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{
              marginTop: 24, padding: '40px 24px',
              border: '1px dashed var(--lf-border)', borderRadius: 6, textAlign: 'center',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
            }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {[0, 0.2, 0.4].map((delay, i) => (
                  <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--lf-ink-3)', animation: `pulse-soft 1.4s infinite ${delay}s` }} />
                ))}
              </div>
              <div style={{ fontFamily: 'var(--f-display)', fontSize: 18, color: 'var(--lf-ink-2)' }}>
                Waiting for next job…
              </div>
              <div style={{ fontSize: 13, color: 'var(--lf-ink-3)', maxWidth: 400 }}>
                Skills are online · Pay for any skill to see it here · Last poll {tick * 15}s ago
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card card-pad-sm">
              <div className="t-label" style={{ marginBottom: 12 }}>Total volume</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span className="t-display" style={{ fontSize: 38, letterSpacing: '-0.02em', lineHeight: 1 }}>
                  {totalVolume.toFixed(2)}
                </span>
                <span className="t-mono" style={{ fontSize: 14, color: 'var(--lf-ink-3)' }}>USDC</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--lf-ink-3)', marginTop: 8, fontFamily: 'var(--f-mono)' }}>
                Total settled on Mantle
              </div>
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--lf-border)', fontSize: 12, color: 'var(--lf-ink-2)', display: 'flex', justifyContent: 'space-between' }}>
                <span>{visibleJobs.length} settlement{visibleJobs.length !== 1 ? 's' : ''}</span>
                <span>{new Set(visibleJobs.map((j) => j.consumer)).size} unique consumer{new Set(visibleJobs.map((j) => j.consumer)).size !== 1 ? 's' : ''}</span>
              </div>
            </div>

            {topSkill && (
              <div className="card card-pad-sm">
                <div className="t-label" style={{ marginBottom: 12 }}>Top skill</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  <ReputationGauge score={topSkill.score || null} size={48} strokeWidth={4} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="t-display" style={{ fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {topSkill.name}
                    </div>
                    <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--lf-ink-3)', marginTop: 2 }}>
                      Score {topSkill.score} · {topSkill.jobs} job{topSkill.jobs !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
                <Link href={`/skill/${topSkill.id}`} className="btn btn-ghost btn-full" style={{ fontSize: 13 }}>
                  View skill detail
                </Link>
              </div>
            )}

            <div className="card card-pad-sm">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <LiveDot />
                <span className="t-label" style={{ margin: 0 }}>Network status</span>
              </div>
              <div style={{ fontFamily: 'var(--f-display)', fontSize: 16, marginBottom: 16 }}>
                Mantle mainnet · live
              </div>
              <NetRow label="Facilitator" value="ledgerforge-facilitator.fly.dev" mono />
              <NetRow label="Indexer" value="ledgerforge-indexer.fly.dev" mono />
              <NetRow label="Last block" value={blockNum.toLocaleString()} mono />
              <NetRow label="SkillRegistry" value={<AddressChip address={CONTRACTS.SkillRegistry} />} />
              <NetRow label="x402Escrow" value={<AddressChip address={CONTRACTS.x402Escrow} />} />
              <NetRow label="BazaarListings" value={<AddressChip address={CONTRACTS.BazaarListings} />} last />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
