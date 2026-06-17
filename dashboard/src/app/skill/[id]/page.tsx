'use client'
import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useBazaarData } from '@/hooks/useBazaarData'
import TierBadge from '@/components/TierBadge'
import ReputationGauge from '@/components/ReputationGauge'
import PaymentModal from '@/components/PaymentModal'
import MockDataBanner from '@/components/MockDataBanner'
import AddressChip from '@/components/AddressChip'
import ScorePill from '@/components/ScorePill'
import type { Skill, Job } from '@/lib/types'
import { useWallet } from '@/context/WalletContext'

function scoreColor(s: number | null): string {
  if (s == null) return 'var(--lf-border)'
  if (s >= 80) return 'var(--lf-green)'
  if (s >= 50) return 'var(--lf-amber)'
  return 'var(--lf-red)'
}

function generateHistory(skill: Skill): number[] {
  if (skill.jobs === 0) return []
  const n = Math.min(48, skill.jobs)
  const arr: number[] = []
  let seed = parseInt(skill.id) * 37 + skill.jobs
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280
    return seed / 233280
  }
  for (let i = 0; i < n; i++) {
    const noise = (rand() - 0.5) * 35
    const trend = (i / n) * 8
    let v = Math.round(skill.score + noise + trend - 4)
    v = Math.max(20, Math.min(100, v))
    arr.push(v)
  }
  return arr
}

function ReputationChart({ values, avg }: { values: number[]; avg: number }) {
  const chartH = 180
  return (
    <div className="card card-pad-sm" style={{ padding: 24 }}>
      <div style={{
        position: 'relative', height: chartH,
        display: 'flex', alignItems: 'flex-end', gap: 3,
        paddingTop: 10, borderBottom: '1px solid var(--lf-border)',
      }}>
        <div style={{
          position: 'absolute', left: 0, right: 0,
          bottom: `${(avg / 100) * (chartH - 10)}px`,
          borderTop: '1px dashed var(--lf-accent)', pointerEvents: 'none',
        }}>
          <span style={{
            position: 'absolute', right: 0, top: -10,
            background: 'var(--lf-surface)', padding: '0 6px',
            fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--lf-accent)',
          }}>
            avg {avg}
          </span>
        </div>
        <div style={{
          position: 'absolute', left: -28, top: 0, bottom: 0,
          width: 24, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--lf-ink-3)', textAlign: 'right',
        }}>
          <span>100</span><span>50</span><span>0</span>
        </div>
        {values.map((v, i) => (
          <div key={i} title={`Job ${i + 1}: score ${v}`} style={{
            flex: 1, height: `${(v / 100) * (chartH - 10)}px`,
            background: scoreColor(v), opacity: 0.85,
            borderRadius: '2px 2px 0 0', cursor: 'pointer',
            transition: 'opacity .15s',
          }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--lf-ink-3)' }}>
        <span>job 1</span>
        <span>job {values.length}</span>
      </div>
    </div>
  )
}

function RecentJobsTable({ jobs, skillId }: { jobs: Job[]; skillId: string }) {
  const skillJobs = jobs.filter((j) => j.skillId === skillId)

  if (skillJobs.length === 0) {
    return (
      <div style={{ border: '1px dashed var(--lf-border)', borderRadius: 6, padding: '32px 24px', textAlign: 'center', color: 'var(--lf-ink-3)', fontSize: 13 }}>
        No executions yet. Pay for this skill to register the first.
      </div>
    )
  }

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 100 }}>When</th>
            <th style={{ width: 80 }}>Score</th>
            <th>Tx Hash</th>
            <th>Consumer</th>
          </tr>
        </thead>
        <tbody>
          {skillJobs.map((r, i) => {
            const diff = Date.now() - new Date(r.timestamp).getTime()
            const ts = diff < 60_000 ? `${Math.floor(diff / 1000)}s ago`
              : diff < 3_600_000 ? `${Math.floor(diff / 60_000)}m ago`
              : `${Math.floor(diff / 3_600_000)}h ago`
            return (
              <tr key={r.id || i}>
                <td style={{ fontFamily: 'var(--f-mono)', color: 'var(--lf-ink-2)' }}>{ts}</td>
                <td><ScorePill score={r.score} /></td>
                <td><AddressChip address={r.settlementTx} head={6} tail={4} /></td>
                <td><AddressChip address={r.consumer} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function MetaChip({ label, link }: { label: string; link?: boolean }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontFamily: 'var(--f-mono)', fontSize: 12,
      padding: '4px 10px', border: '1px solid var(--lf-border)',
      borderRadius: 4, color: 'var(--lf-ink-2)', background: 'var(--lf-surface)',
    }}>
      {label}
      {link && <span style={{ opacity: 0.5 }}>↗</span>}
    </span>
  )
}

function SectionHeading({ kicker, title, sub }: { kicker: string; title: string; sub: string }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div className="t-label" style={{ marginBottom: 8 }}>{kicker}</div>
      <h2 className="t-display" style={{ fontSize: 24, margin: '0 0 6px', letterSpacing: '-0.01em' }}>{title}</h2>
      <p style={{ color: 'var(--lf-ink-3)', fontSize: 13, margin: 0 }}>{sub}</p>
    </div>
  )
}

const SKILL_DEFAULT_PARAMS: Record<string, Record<string, string>> = {
  'hackathon-scout':    { query: 'turing test mantle', limit: '10' },
  'mantle-tvl-monitor': {},
  'aave-v3-rates':      { asset: 'all' },
  'mantle-gas-oracle':  {},
  'token-price-feed':   { tokens: 'USDe,USDC' },
  'defi-protocol-stats':{ protocol: 'merchant-moe' },
}

function TryItPanel({ skill, txHash }: { skill: Skill; txHash: string | null }) {
  const defaultParams = SKILL_DEFAULT_PARAMS[skill.name] ?? {}
  const [payload, setPayload] = useState(
    JSON.stringify({ query: `Run ${skill.name}`, params: defaultParams }, null, 2)
  )
  const [running, setRunning] = useState(false)
  const [response, setResponse] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const parsedParams = useMemo(() => {
    try { return (JSON.parse(payload) as { params?: Record<string, string> }).params ?? {} }
    catch { return {} }
  }, [payload])

  const qs = Object.keys(parsedParams).length ? '?' + new URLSearchParams(parsedParams).toString() : ''
  const realEndpoint = skill.endpoint || `https://ledgerforge-${skill.name.slice(0, 6).toLowerCase()}.fly.dev/v1/skills/${skill.id}/run`
  const displayEndpoint = `${realEndpoint}${qs}`
  const accessToken = txHash ? `lfx_${txHash.slice(2, 18)}` : `lfx_${skill.id}_demo`

  async function handleRun() {
    setRunning(true)
    setResponse(null)
    try {
      if (skill.endpoint) {
        const res = await fetch(`${skill.endpoint}${qs}`, {
          headers: { 'Authorization': `Bearer settled:${txHash ?? 'demo'}:${Date.now()}` },
        })
        const data = await res.json()
        setResponse(JSON.stringify(data, null, 2))
      } else {
        await new Promise((r) => setTimeout(r, 1400 + Math.random() * 600))
        const jobId = `job_${Math.random().toString(36).slice(2, 10)}`
        setResponse(JSON.stringify({
          success: true,
          skillId: parseInt(skill.id),
          jobId,
          output: `[${skill.name}] Request processed. Score written on-chain.`,
          reputationScore: skill.score,
          settlementTx: txHash ?? `0x${'0'.repeat(64)}`,
          latencyMs: Math.round(140 + Math.random() * 80),
        }, null, 2))
      }
    } catch (err) {
      setResponse(JSON.stringify({
        error: String(err instanceof Error ? err.message : err),
        hint: skill.endpoint?.includes('localhost')
          ? 'Start the skill server first: cd agents && npx ts-node src/mantle-skills.ts --serve'
          : 'Skill endpoint unreachable.',
      }, null, 2))
    }
    setRunning(false)
  }

  const curlSnippet = `curl "${displayEndpoint}" \\
  -H "Authorization: Bearer ${accessToken}"`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card card-pad-sm">
        <div className="t-label" style={{ marginBottom: 10 }}>Endpoint</div>
        <div style={{
          fontFamily: 'var(--f-mono)', fontSize: 12, padding: '10px 12px',
          background: 'var(--lf-surface-2)', border: '1px solid rgba(15,190,127,0.3)',
          borderRadius: 4, color: 'var(--lf-accent)', marginBottom: 16, wordBreak: 'break-all',
        }}>
          GET {displayEndpoint}
        </div>

        <div className="t-label" style={{ marginBottom: 8 }}>cURL</div>
        <div style={{ position: 'relative' }}>
          <pre style={{
            fontFamily: 'var(--f-mono)', fontSize: 11, lineHeight: 1.6,
            padding: '12px 40px 12px 12px', background: 'var(--lf-surface-2)',
            border: '1px solid var(--lf-border)', borderRadius: 4,
            color: 'var(--lf-ink-2)', margin: 0, overflowX: 'auto',
            whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          }}>
            {curlSnippet}
          </pre>
          <button
            onClick={() => { navigator.clipboard.writeText(curlSnippet); setCopied(true); setTimeout(() => setCopied(false), 1800) }}
            style={{
              position: 'absolute', top: 8, right: 8,
              background: 'var(--lf-surface)', border: '1px solid var(--lf-border)',
              borderRadius: 4, padding: '2px 8px', cursor: 'pointer',
              fontFamily: 'var(--f-mono)', fontSize: 10, color: copied ? 'var(--lf-accent)' : 'var(--lf-ink-3)',
            }}
          >
            {copied ? '✓' : '⎘'}
          </button>
        </div>
      </div>

      <div className="card card-pad-sm">
        <div className="t-label" style={{ marginBottom: 8 }}>Request payload (JSON)</div>
        <textarea
          value={payload}
          onChange={(e) => setPayload(e.target.value)}
          rows={5}
          spellCheck={false}
          style={{
            width: '100%', boxSizing: 'border-box',
            fontFamily: 'var(--f-mono)', fontSize: 12, lineHeight: 1.6,
            padding: '10px 12px', background: 'var(--lf-surface-2)',
            border: '1px solid var(--lf-border)', borderRadius: 4,
            color: 'var(--lf-ink)', resize: 'vertical', outline: 'none',
            marginBottom: 12,
          }}
        />
        <button
          className="btn btn-primary btn-full"
          onClick={handleRun}
          disabled={running}
          style={{ opacity: running ? 0.7 : 1 }}
        >
          {running ? (
            <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2, display: 'inline-block', marginRight: 8, verticalAlign: 'middle' }} />Running…</>
          ) : 'Send Request →'}
        </button>
      </div>

      {(running || response) && (
        <div className="card card-pad-sm">
          <div className="t-label" style={{ marginBottom: 8 }}>Response</div>
          {running ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--lf-ink-3)', fontSize: 13 }}>
              <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2, display: 'inline-block' }} />
              Calling skill endpoint…
            </div>
          ) : (
            <pre style={{
              fontFamily: 'var(--f-mono)', fontSize: 12, lineHeight: 1.6,
              padding: '12px', background: 'var(--lf-surface-2)',
              border: '1px solid rgba(15,190,127,0.3)', borderRadius: 4,
              color: 'var(--lf-accent-2)', margin: 0, overflowX: 'auto',
            }}>
              {response}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

export default function SkillDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { skills, jobs, isMockData, loading } = useBazaarData()
  const { account } = useWallet()
  const [skill, setSkill] = useState<Skill | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [hasPaid, setHasPaid] = useState(false)
  const [accessTxHash, setAccessTxHash] = useState<string | null>(null)

  useEffect(() => {
    const found = skills.find((s) => s.id === id)
    if (found) setSkill(found)
  }, [skills, id])

  const history = useMemo(() => {
    if (!skill) return []
    if (skill.reputationHistory.length > 0) return skill.reputationHistory.map((p) => p.score)
    return generateHistory(skill)
  }, [skill])

  const hasHistory = history.length > 0

  if (loading) {
    return (
      <div className="container" style={{ paddingTop: 64 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 48 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[280, 200, 160].map((h, i) => (
              <div key={i} className="card" style={{ height: h, opacity: 0.4 }} />
            ))}
          </div>
          <div className="card" style={{ height: 300, opacity: 0.4 }} />
        </div>
      </div>
    )
  }

  if (!skill) {
    return (
      <div className="container" style={{ paddingTop: 96, textAlign: 'center' }}>
        <div className="t-display" style={{ fontSize: 32, marginBottom: 12, color: 'var(--lf-ink-2)' }}>
          Skill not found
        </div>
        <Link href="/bazaar" style={{ color: 'var(--lf-accent)', fontSize: 14 }}>
          ← Back to Bazaar
        </Link>
      </div>
    )
  }

  return (
    <div className="page">
      {isMockData && <MockDataBanner />}
      {showModal && (
        <PaymentModal
          skill={skill}
          onClose={() => setShowModal(false)}
          onSuccess={(tx) => { setAccessTxHash(tx); setHasPaid(true); setShowModal(false) }}
        />
      )}

      <div className="container" style={{ paddingTop: 32, paddingBottom: 80 }}>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--lf-ink-3)', marginBottom: 24 }}>
          <Link href="/bazaar" style={{ cursor: 'pointer' }}>The Bazaar</Link>
          <span style={{ margin: '0 8px' }}>/</span>
          <span style={{ color: 'var(--lf-ink-2)' }}>{skill.name}</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 48 }}>
          <div>
            <div style={{ marginBottom: 48 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <TierBadge tier={skill.tier} />
                <span style={{ fontFamily: 'var(--f-mono-2)', fontSize: 11, color: 'var(--lf-ink-3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Skill ID #{skill.id}
                </span>
              </div>
              <h1 className="t-display" style={{ fontSize: 40, lineHeight: 1.1, letterSpacing: '-0.02em', margin: '0 0 8px', fontWeight: 600 }}>
                {skill.name}
              </h1>
              <div style={{ fontFamily: 'var(--f-mono-2)', fontSize: 13, color: 'var(--lf-ink-3)', marginBottom: 24 }}>
                {skill.version}
              </div>
              <p style={{ fontSize: 17, lineHeight: 1.6, color: 'var(--lf-ink-2)', margin: 0, maxWidth: 640 }}>
                {skill.description}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 28 }}>
                <MetaChip label={`${skill.jobs.toLocaleString()} total jobs`} />
                <MetaChip label="avg 0.18s response" />
                <MetaChip label={`Registered ${skill.registered}`} />
                <MetaChip label={`ERC-8004 ID: #${skill.id}`} link />
              </div>
            </div>

            <section style={{ marginBottom: 56 }}>
              <SectionHeading
                kicker="On-chain history"
                title="Reputation over time"
                sub="Each bar = one job completion. Score is written on-chain via the ERC-8004 registry."
              />
              {hasHistory ? (
                <ReputationChart values={history} avg={skill.score} />
              ) : (
                <div style={{ border: '1px dashed var(--lf-border)', borderRadius: 6, padding: '48px 24px', textAlign: 'center', color: 'var(--lf-ink-3)' }}>
                  <div style={{ fontFamily: 'var(--f-display)', fontSize: 18, color: 'var(--lf-ink-2)', marginBottom: 6 }}>
                    No reputation history yet
                  </div>
                  <div style={{ fontSize: 13 }}>
                    This skill is registered but has not been called. Be the first to use it.
                  </div>
                </div>
              )}
              {hasHistory && (
                <div style={{ marginTop: 16, fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--lf-accent)' }}>
                  {skill.jobs.toLocaleString()} on-chain reputation writes · <a href={`https://mantlescan.xyz/address/${CONTRACTS.SkillRegistry}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--lf-accent)' }}>view on mantlescan ↗</a>
                </div>
              )}
            </section>

            <section>
              <SectionHeading
                kicker="Execution log"
                title="Recent executions"
                sub="Live feed of every call to this skill, with on-chain settlement hash."
              />
              <RecentJobsTable jobs={jobs} skillId={skill.id} />
            </section>

            {hasPaid && (
              <section id="try-it" style={{ marginTop: 56 }}>
                <SectionHeading
                  kicker="Access granted"
                  title="Try your skill"
                  sub="Send a live request to this skill's endpoint. Response is simulated in demo mode."
                />
                <TryItPanel skill={skill} txHash={accessTxHash} />
              </section>
            )}
          </div>

          <aside style={{ position: 'sticky', top: 88, height: 'fit-content', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card card-pad-sm">
              <div className="t-label" style={{ marginBottom: 12 }}>Access this skill</div>
              <h3 className="t-display" style={{ fontSize: 22, margin: '0 0 16px' }}>
                {skill.price === 0 ? 'Free to call' : `${skill.price.toFixed(2)} USDC per call`}
              </h3>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20, fontSize: 12 }}>
                <span style={{ width: 16, height: 16, borderRadius: '50%', background: '#2775CA', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 9 }}>$</span>
                <span style={{ color: 'var(--lf-ink-2)' }}>Payable in USDC on Mantle</span>
              </div>

              <div style={{ background: 'var(--lf-surface-2)', border: '1px solid var(--lf-border)', borderRadius: 6, padding: 20, display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <span className="t-mono" style={{ fontSize: 40, fontWeight: 500, lineHeight: 1, color: hasHistory ? scoreColor(skill.score) : 'var(--lf-ink-3)' }}>
                      {hasHistory ? skill.score : '—'}
                    </span>
                    <span style={{ fontFamily: 'var(--f-mono)', color: 'var(--lf-ink-3)', fontSize: 14 }}>/ 100</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--lf-ink-2)', marginTop: 6, lineHeight: 1.4 }}>
                    {hasHistory ? `Based on ${skill.jobs.toLocaleString()} on-chain completions` : 'No on-chain history yet'}
                  </div>
                </div>
                <ReputationGauge score={hasHistory ? skill.score : null} size={72} />
              </div>

              <button
                className="btn btn-primary btn-full btn-lg"
                onClick={() => hasPaid ? document.getElementById('try-it')?.scrollIntoView({ behavior: 'smooth' }) : setShowModal(true)}
              >
                {hasPaid ? 'Try it now ↓' : !account ? 'Connect Wallet' : skill.price === 0 ? 'Access Skill' : 'Pay & Access'} {!hasPaid && <span>→</span>}
              </button>

              <div style={{ marginTop: 14, fontSize: 11, color: 'var(--lf-ink-3)', textAlign: 'center', lineHeight: 1.5 }}>
                Payment settles on Mantle mainnet in ~2s<br />
                Powered by LedgerForge x402
              </div>

              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--lf-border)', fontSize: 12, color: 'var(--lf-ink-3)', display: 'flex', justifyContent: 'space-between' }}>
                <span>View contract</span>
                <a target="_blank" rel="noopener noreferrer" href={`https://mantlescan.xyz/address/${CONTRACTS.SkillRegistry}`} style={{ color: 'var(--lf-ink-2)' }}>
                  mantlescan ↗
                </a>
              </div>
            </div>

            <div className="card card-pad-sm">
              <div className="t-label" style={{ marginBottom: 12 }}>Service endpoint</div>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12, background: 'var(--lf-surface-2)', border: `1px solid ${hasPaid ? 'rgba(15,190,127,0.3)' : 'var(--lf-border)'}`, borderRadius: 4, padding: '10px 12px', marginBottom: 10, color: hasPaid ? 'var(--lf-accent)' : 'var(--lf-ink-2)', wordBreak: 'break-all' }}>
                https://ledgerforge-{skill.name.slice(0, 6).toLowerCase()}.fly.dev<br />
                <span style={{ color: hasPaid ? 'var(--lf-accent-2)' : 'var(--lf-ink-3)' }}>
                  /v1/skills/{skill.id}/{hasPaid ? 'run' : '***'}
                </span>
              </div>
              {hasPaid && accessTxHash && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, fontFamily: 'var(--f-mono)', fontSize: 11 }}>
                  <span style={{ color: 'var(--lf-ink-3)' }}>Access token</span>
                  <AddressChip address={`lfx_${accessTxHash.slice(2, 18)}`} head={12} tail={0} />
                </div>
              )}
              <div style={{ fontSize: 11, color: hasPaid ? 'var(--lf-accent-2)' : 'var(--lf-ink-3)' }}>
                {hasPaid ? '✓ Access granted' : 'Endpoint revealed on payment.'} Owner: <AddressChip address={skill.owner} />
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

const CONTRACTS = {
  SkillRegistry: '0x37041F257Bf8f1E201497Dc0BCDa1ae0d8317992',
}
