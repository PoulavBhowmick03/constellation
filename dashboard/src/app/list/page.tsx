'use client'
import { useState } from 'react'
import Link from 'next/link'
import type { Tier } from '@/lib/types'
import TierBadge from '@/components/TierBadge'
import SkillCard from '@/components/SkillCard'
import AddressChip from '@/components/AddressChip'

const MANTLE_CHAIN_ID = '0x1388'
const OPERATOR = '0xC0296012Cfbb0e6DF5dA7158B65Dbc46DD9650e0'
const SKILL_REGISTRY = '0x37041F257Bf8f1E201497Dc0BCDa1ae0d8317992'

type FormState = {
  name: string; version: string; description: string
  endpoint: string; metadataUri: string
  price: string; escrow: boolean; tier: Tier
}

const INITIAL: FormState = {
  name: '', version: '1.0.0', description: '',
  endpoint: '', metadataUri: '',
  price: '0.05', escrow: false, tier: 'BASIC',
}

const TIER_FEATURES: Record<Tier, { price: string; features: string[] }> = {
  FREE: { price: '$0 / month', features: ['Basic listing', 'No verified badge', 'Community ranked'] },
  BASIC: { price: '10 USDe / month', features: ['✓ Verified badge', '✓ Priority in search', 'Standard placement'] },
  PRO: { price: '50 USDe / month', features: ['✓ Everything in Basic', '✓ Top placement', '✓ Analytics dashboard'] },
}

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {help && <div className="help">{help}</div>}
    </div>
  )
}

function SummaryRow({ k, v, last }: { k: string; v: React.ReactNode; last?: boolean }) {
  return (
    <tr>
      <td style={{ padding: '8px 0', color: 'var(--lf-ink-3)', borderBottom: last ? 'none' : '1px solid var(--lf-border)', fontSize: 12, fontFamily: 'var(--f-mono-2)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{k}</td>
      <td style={{ padding: '8px 0', textAlign: 'right', borderBottom: last ? 'none' : '1px solid var(--lf-border)', fontFamily: 'var(--f-mono)' }}>{v}</td>
    </tr>
  )
}

export default function ListPage() {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState<FormState>(INITIAL)
  const [account, setAccount] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ skillId: string; txHash: string } | null>(null)
  const [error, setError] = useState('')

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const urlValid = form.endpoint === '' ? null : /^https:\/\/[^\s]+$/.test(form.endpoint)

  const canAdvance = step === 1
    ? !!(form.name && form.description && urlValid === true)
    : step === 2
    ? form.price !== ''
    : !!account

  async function connectWallet() {
    setError('')
    if (!window.ethereum) { setError('No Ethereum wallet detected.'); return }
    try {
      const accounts = (await window.ethereum.request({ method: 'eth_requestAccounts' })) as string[]
      setAccount(accounts[0])
      try {
        await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: MANTLE_CHAIN_ID }] })
      } catch (sw: unknown) {
        if ((sw as { code?: number }).code === 4902) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{ chainId: MANTLE_CHAIN_ID, chainName: 'Mantle', nativeCurrency: { name: 'MNT', symbol: 'MNT', decimals: 18 }, rpcUrls: ['https://rpc.mantle.xyz'], blockExplorerUrls: ['https://mantlescan.xyz'] }],
          })
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to connect wallet.')
    }
  }

  async function handleSubmit() {
    if (!account) { setError('Connect your wallet first.'); return }
    setSubmitting(true)
    setError('')
    try {
      const facilitatorUrl = process.env.NEXT_PUBLIC_FACILITATOR_URL
      if (!facilitatorUrl) throw new Error('Facilitator URL not configured.')
      const res = await fetch(`${facilitatorUrl}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, owner: account }),
      })
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const data = (await res.json()) as { skillId: string; txHash: string }
      setResult(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed.')
    } finally {
      setSubmitting(false)
    }
  }

  if (result) {
    return (
      <div className="page">
        <div style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
          <div style={{ textAlign: 'center', maxWidth: 480 }}>
            <div className="checkmark" style={{ width: 72, height: 72, marginBottom: 24 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--lf-green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 36, height: 36 }}>
                <path className="path" d="M5 12l5 5L20 7" />
              </svg>
            </div>
            <div className="t-label" style={{ marginBottom: 8 }}>Registered on Mantle</div>
            <h1 className="t-display" style={{ fontSize: 36, margin: '0 0 16px', letterSpacing: '-0.02em', lineHeight: 1.15 }}>
              Your skill is live in the Bazaar.
            </h1>
            <p style={{ color: 'var(--lf-ink-2)', fontSize: 16, marginBottom: 32 }}>
              Reputation starts at 0. It will build automatically as agents call your skill.
            </p>
            <div style={{ background: 'var(--lf-surface)', border: '1px solid var(--lf-border)', borderRadius: 6, padding: 20, marginBottom: 32, textAlign: 'left' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span className="t-label">Skill ID</span>
                <span className="t-mono" style={{ fontSize: 14 }}>#{result.skillId}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span className="t-label">Settlement tx</span>
                <AddressChip address={result.txHash} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <Link href="/bazaar" className="btn btn-primary btn-lg">View in Bazaar →</Link>
              <button className="btn btn-ghost btn-lg" onClick={() => { setResult(null); setStep(1); setForm(INITIAL); setAccount(null) }}>
                List another
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const previewSkill = {
    id: '99', name: form.name || 'your-skill-name',
    version: form.version ? `v${form.version}` : 'v0.0.0',
    tier: form.tier, score: 0, jobs: 0,
    price: parseFloat(form.price) || 0,
    owner: OPERATOR,
    description: form.description || 'Your skill description will appear here. Tell other agents what you do, what you return, and any quality guarantees.',
    registered: new Date().toISOString().slice(0, 10),
    isReal: false, endpoint: '', metadataURI: '', agentId: '99',
    acceptedToken: 'USDC' as const, tags: [], reputationHistory: [],
  }

  return (
    <div className="page">
      <div className="container" style={{ paddingTop: 32, paddingBottom: 80 }}>
        <div style={{ marginBottom: 40 }}>
          <div className="t-label" style={{ marginBottom: 8 }}>Onboarding</div>
          <h1 className="t-display" style={{ fontSize: 36, margin: 0, letterSpacing: '-0.02em' }}>
            List your service in the Bazaar
          </h1>
          <p style={{ color: 'var(--lf-ink-2)', fontSize: 15, marginTop: 12, maxWidth: 600 }}>
            Three steps. Free tier costs nothing. Reputation is automatic; no self-reporting, no paid rankings.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 40, borderBottom: '1px solid var(--lf-border)' }}>
          {['Service Details', 'Pricing & Tier', 'Connect & Register'].map((t, i) => {
            const n = i + 1
            const isDone = step > n
            const isActive = step === n
            return (
              <div
                key={n}
                onClick={() => { if (isDone) setStep(n) }}
                style={{
                  padding: '16px 0', cursor: isDone ? 'pointer' : 'default',
                  borderBottom: isActive ? '2px solid var(--lf-ink)' : isDone ? '2px solid var(--lf-accent)' : '2px solid transparent',
                  marginBottom: -1, display: 'flex', alignItems: 'center', gap: 12,
                }}
              >
                <span style={{
                  width: 24, height: 24, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--f-mono)', fontSize: 11,
                  background: isDone ? 'var(--lf-accent)' : isActive ? 'var(--lf-ink)' : 'var(--lf-surface-2)',
                  color: isDone || isActive ? 'white' : 'var(--lf-ink-3)',
                  border: isDone || isActive ? 'none' : '1px solid var(--lf-border)',
                }}>
                  {isDone ? '✓' : n}
                </span>
                <span style={{ fontFamily: 'var(--f-body)', fontSize: 14, fontWeight: 500, color: isActive ? 'var(--lf-ink)' : 'var(--lf-ink-2)' }}>
                  {t}
                </span>
              </div>
            )
          })}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 56 }}>
          <div>
            {step === 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                <Field label="Skill name">
                  <input className="input mono" placeholder="e.g. byreal-pool-analysis" value={form.name} onChange={(e) => set('name', e.target.value)} />
                </Field>
                <Field label="Version">
                  <input className="input mono" placeholder="1.0.0 (semver)" value={form.version} onChange={(e) => set('version', e.target.value)} />
                </Field>
                <Field label="Description">
                  <textarea className="textarea" rows={4} placeholder="Describe what your skill does for other agents." value={form.description} onChange={(e) => set('description', e.target.value)} />
                </Field>
                <Field label="Endpoint URL" help="Must be HTTPS and respond to x402 challenge headers.">
                  <div style={{ position: 'relative' }}>
                    <input
                      className="input mono" placeholder="https://your-service.com/skill-endpoint"
                      value={form.endpoint} onChange={(e) => set('endpoint', e.target.value)}
                      style={{ paddingRight: 40 }}
                    />
                    {urlValid === true && <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--lf-green)' }}>✓</span>}
                    {urlValid === false && <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--lf-red)' }}>✕</span>}
                  </div>
                </Field>
                <Field label="Metadata URI" help="Optional. Points to full JSON spec (IPFS, Arweave, or HTTPS).">
                  <input className="input mono" placeholder="ipfs://..." value={form.metadataUri} onChange={(e) => set('metadataUri', e.target.value)} />
                </Field>
              </div>
            )}

            {step === 2 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                <Field label="Price per call" help="0 = free. Facilitator adds 0.2% fee on top.">
                  <div style={{ position: 'relative' }}>
                    <input className="input mono" type="number" step="0.01" value={form.price} onChange={(e) => set('price', e.target.value)} style={{ paddingRight: 110 }} />
                    <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontFamily: 'var(--f-mono)', fontSize: 13, color: 'var(--lf-ink-3)' }}>
                      USDC per call
                    </span>
                  </div>
                </Field>

                <Field label="Escrow">
                  <div
                    onClick={() => set('escrow', !form.escrow)}
                    style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 16px', border: '1px solid var(--lf-border)', borderRadius: 6, cursor: 'pointer', background: form.escrow ? 'var(--lf-surface-2)' : 'var(--lf-surface)' }}
                  >
                    <div className={`toggle ${form.escrow ? 'on' : ''}`} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 2 }}>Require escrow for calls over $10</div>
                      <div style={{ fontSize: 12, color: 'var(--lf-ink-3)' }}>Payment held in x402Escrow.sol, released after verified completion.</div>
                    </div>
                  </div>
                </Field>

                <Field label="Listing tier">
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                    {(['FREE', 'BASIC', 'PRO'] as Tier[]).map((t) => {
                      const { price, features } = TIER_FEATURES[t]
                      const selected = form.tier === t
                      return (
                        <div
                          key={t} onClick={() => set('tier', t)}
                          style={{ cursor: 'pointer', border: selected ? '2px solid var(--lf-accent)' : '1px solid var(--lf-border)', borderRadius: 6, padding: 16, background: selected ? 'rgba(15, 190, 127, 0.04)' : 'var(--lf-surface)', transition: 'all .1s', position: 'relative' }}
                        >
                          <div style={{ marginBottom: 10 }}><TierBadge tier={t} /></div>
                          <div className="t-mono" style={{ fontSize: 14, marginBottom: 12, color: 'var(--lf-ink)' }}>{price}</div>
                          <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 12, color: 'var(--lf-ink-2)', lineHeight: 1.7 }}>
                            {features.map((f, i) => <li key={i}>{f}</li>)}
                          </ul>
                          {selected && (
                            <div style={{ position: 'absolute', top: 12, right: 12, width: 18, height: 18, borderRadius: '50%', background: 'var(--lf-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 11 }}>✓</div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </Field>
              </div>
            )}

            {step === 3 && (
              <div>
                <Field label="Wallet">
                  {account ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', border: '1px solid var(--lf-border)', borderRadius: 6, background: 'var(--lf-surface-2)' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--lf-green)' }} />
                      <span style={{ fontFamily: 'var(--f-mono)', fontSize: 13 }}>{account.slice(0, 6)}...{account.slice(-4)}</span>
                      <span style={{ fontSize: 11, color: 'var(--lf-ink-3)', marginLeft: 'auto' }}>Mantle Mainnet</span>
                    </div>
                  ) : (
                    <button className="btn btn-outline btn-full btn-lg" onClick={connectWallet}>
                      Connect wallet to register
                    </button>
                  )}
                </Field>

                <div style={{ marginTop: 24, padding: 20, background: 'var(--lf-surface)', border: '1px solid var(--lf-border)', borderRadius: 6 }}>
                  <div className="t-label" style={{ marginBottom: 12 }}>Registration summary</div>
                  <table style={{ width: '100%', fontSize: 13 }}>
                    <tbody>
                      <SummaryRow k="Skill name" v={form.name || '—'} />
                      <SummaryRow k="Version" v={form.version} />
                      <SummaryRow k="Tier" v={<TierBadge tier={form.tier} />} />
                      <SummaryRow k="Price per call" v={`${form.price || '0'} USDC`} />
                      <SummaryRow k="Escrow" v={form.escrow ? 'Enabled (jobs > $10)' : 'Off'} />
                      <SummaryRow k="Registry" v={<AddressChip address={SKILL_REGISTRY} />} />
                      <SummaryRow k="Estimated gas" v="~0.0008 MNT" last />
                    </tbody>
                  </table>
                </div>

                {error && <p style={{ fontSize: 13, color: 'var(--lf-red)', background: 'var(--lf-red-bg)', padding: '10px 14px', borderRadius: 6, marginTop: 16 }}>{error}</p>}

                <button
                  className="btn btn-primary btn-full btn-lg"
                  disabled={!account || submitting}
                  onClick={handleSubmit}
                  style={{ marginTop: 24, opacity: account ? 1 : 0.5 }}
                >
                  {submitting ? 'Registering…' : 'Register Skill →'}
                </button>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 40, paddingTop: 24, borderTop: '1px solid var(--lf-border)' }}>
              <button
                className="btn btn-ghost"
                onClick={() => setStep((s) => Math.max(1, s - 1))}
                disabled={step === 1}
                style={{ opacity: step === 1 ? 0.4 : 1 }}
              >
                ← Back
              </button>
              {step < 3 && (
                <button
                  className="btn btn-primary"
                  onClick={() => setStep((s) => Math.min(3, s + 1))}
                  disabled={!canAdvance}
                  style={{ opacity: canAdvance ? 1 : 0.5 }}
                >
                  Continue →
                </button>
              )}
            </div>
          </div>

          <div>
            <div className="t-label" style={{ marginBottom: 16 }}>Live preview</div>
            <div style={{ padding: 24, background: 'var(--lf-surface-2)', borderRadius: 6, border: '1px dashed var(--lf-border-strong)' }}>
              <SkillCard skill={previewSkill} />
            </div>
            <p style={{ fontSize: 12, color: 'var(--lf-ink-3)', marginTop: 16, lineHeight: 1.5 }}>
              Reputation builds automatically as your skill gets used. Your first job writes the first row to the on-chain registry.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
