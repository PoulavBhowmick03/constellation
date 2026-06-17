'use client'
import { useState, useEffect } from 'react'
import { createPublicClient, encodeFunctionData, http, type Address } from 'viem'
import { mantle } from 'viem/chains'
import type { Skill } from '@/lib/types'
import { useWallet } from '@/context/WalletContext'
import ReputationGauge from './ReputationGauge'
import TierBadge from './TierBadge'
import AddressChip from './AddressChip'

const SKILL_REGISTRY    = '0x37041F257Bf8f1E201497Dc0BCDa1ae0d8317992' as const
const USDC_ADDRESS      = '0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9' as const
const OPERATOR_ADDRESS  = '0xC0296012Cfbb0e6DF5dA7158B65Dbc46DD9650e0' as const
const USDC_DECIMALS     = 6
const MAX_UINT256       = 2n ** 256n - 1n

const ERC20_ABI = [
  { type: 'function', name: 'allowance', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ type: 'bool' }] },
] as const

interface PaymentModalProps {
  skill: Skill
  onClose: () => void
  onSuccess?: (txHash: string | null) => void
}

type Step = 'review' | 'signing' | 'processing' | 'success' | 'error'

const STEP_INDEX: Record<Step, number> = {
  review: 1, signing: 2, processing: 3, success: 4, error: 4,
}

export default function PaymentModal({ skill, onClose, onSuccess }: PaymentModalProps) {
  const { account, connect, connecting } = useWallet()
  const [step, setStep] = useState<Step>('review')
  const [txHash, setTxHash] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  const fee = (skill.price * 0.002).toFixed(4)
  const providerCut = (skill.price * 0.998).toFixed(4)
  const stepIdx = STEP_INDEX[step]

  const rawAmount = Math.round(skill.price * Math.pow(10, USDC_DECIMALS))
  const amountBaseUnits = BigInt(rawAmount > 0 ? rawAmount : 50_000)

  const [allowance, setAllowance] = useState<bigint | null>(null)
  const [approving, setApproving] = useState(false)
  const [approveErr, setApproveErr] = useState('')
  const hasAllowance = allowance != null && allowance >= amountBaseUnits

  useEffect(() => {
    if (!account) { setAllowance(null); return }
    let cancelled = false
    const publicClient = createPublicClient({ chain: mantle, transport: http() })
    publicClient.readContract({
      address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'allowance',
      args: [account as Address, OPERATOR_ADDRESS],
    })
      .then((a) => { if (!cancelled) setAllowance(a) })
      .catch(() => { if (!cancelled) setAllowance(0n) })
    return () => { cancelled = true }
  }, [account])

  async function handleApprove() {
    if (!account) return
    setApproveErr('')
    setApproving(true)
    try {
      const data = encodeFunctionData({
        abi: ERC20_ABI, functionName: 'approve',
        args: [OPERATOR_ADDRESS, MAX_UINT256],
      })
      const hash = await window.ethereum!.request({
        method: 'eth_sendTransaction',
        params: [{ from: account, to: USDC_ADDRESS, data }],
      }) as `0x${string}`
      const publicClient = createPublicClient({ chain: mantle, transport: http() })
      await publicClient.waitForTransactionReceipt({ hash })
      const a = await publicClient.readContract({
        address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'allowance',
        args: [account as Address, OPERATOR_ADDRESS],
      })
      setAllowance(a)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Approve failed.'
      setApproveErr(msg.toLowerCase().includes('user rejected') ? 'Approval rejected.' : msg)
    } finally {
      setApproving(false)
    }
  }

  async function handlePay() {
    setErrorMsg('')

    let payer = account
    if (!payer) {
      try {
        await connect()
        // context update is async
        const accounts = await window.ethereum!.request({ method: 'eth_accounts' }) as string[]
        payer = accounts[0]
        if (!payer) throw new Error('No account after connect.')
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : 'Wallet connection failed.')
        setStep('error')
        return
      }
    }

    setStep('signing')

    try {
      const facilitatorUrl = process.env.NEXT_PUBLIC_FACILITATOR_URL
      if (!facilitatorUrl) throw new Error('NEXT_PUBLIC_FACILITATOR_URL not set.')

      // default 0.05 if price missing
      const rawAmount = Math.round(skill.price * Math.pow(10, USDC_DECIMALS))
      const amountBaseUnits = String(rawAmount > 0 ? rawAmount : 50_000)
      const detailsRes = await fetch(
        `${facilitatorUrl}/payment-details?skillId=${skill.id}&amount=${amountBaseUnits}&asset=${USDC_ADDRESS}&resource=/skills/${skill.id}`
      )
      if (!detailsRes.ok) throw new Error(`Could not fetch payment details: HTTP ${detailsRes.status}`)
      const paymentDetails = await detailsRes.json()

      const nonce = Math.floor(Math.random() * 1_000_000_000)
      const validBefore = Math.floor(Date.now() / 1000) + 60

      const typedData = {
        domain: {
          name: 'LedgerForge',
          version: '1',
          chainId: 5000,
          verifyingContract: SKILL_REGISTRY,
        },
        types: {
          EIP712Domain: [
            { name: 'name',              type: 'string'  },
            { name: 'version',           type: 'string'  },
            { name: 'chainId',           type: 'uint256' },
            { name: 'verifyingContract', type: 'address' },
          ],
          Payment: [
            { name: 'from',        type: 'address' },
            { name: 'to',         type: 'address' },
            { name: 'amount',     type: 'uint256' },
            { name: 'token',      type: 'address' },
            { name: 'skillId',    type: 'uint256' },
            { name: 'nonce',      type: 'uint256' },
            { name: 'validBefore',type: 'uint256' },
          ],
        },
        primaryType: 'Payment',
        message: {
          from:        payer,
          to:          paymentDetails.payTo as string,
          amount:      amountBaseUnits,
          token:       USDC_ADDRESS,
          skillId:     String(parseInt(skill.id)),
          nonce:       String(nonce),
          validBefore: String(validBefore),
        },
      }

      const signature = await window.ethereum!.request({
        method: 'eth_signTypedData_v4',
        params: [payer, JSON.stringify(typedData)],
      }) as `0x${string}`

      setStep('processing')

      const paymentProof = {
        scheme: 'exact' as const,
        network: 'eip155:5000' as const,
        payload: {
          signature,
          authorization: {
            from:        payer as `0x${string}`,
            to:          paymentDetails.payTo as `0x${string}`,
            amount:      amountBaseUnits,
            token:       USDC_ADDRESS,
            skillId:     parseInt(skill.id),
            nonce,
            validBefore,
          },
        },
      }

      const facilitateRes = await fetch(`${facilitatorUrl}/facilitate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentDetails, paymentProof }),
      })

      const receipt = await facilitateRes.json() as { success: boolean; settlementTxHash?: string; error?: string }

      if (!facilitateRes.ok || !receipt.success) {
        throw new Error(receipt.error ?? `Facilitation failed: HTTP ${facilitateRes.status}`)
      }

      const hash = receipt.settlementTxHash ?? null
      setTxHash(hash)
      setStep('success')
      onSuccess?.(hash)

    } catch (err: unknown) {
      // rejected signature returns to review
      if (err instanceof Error && err.message.toLowerCase().includes('user rejected')) {
        setErrorMsg('Signature rejected. Hit "Sign payment" again when ready.')
        setStep('review')
        return
      }
      setErrorMsg(err instanceof Error ? err.message : 'Payment failed.')
      setStep('error')
    }
  }

  return (
    <div
      className="modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="modal" style={{ position: 'relative' }}>
        <button className="modal-close" onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="6" y1="6" x2="18" y2="18" /><line x1="6" y1="18" x2="18" y2="6" />
          </svg>
        </button>

        <div className="progress-bar">
          {[1, 2, 3, 4].map((n) => (
            <span key={n} className={`seg ${stepIdx > n ? 'done' : stepIdx === n ? 'active' : ''}`} />
          ))}
        </div>

        <div className="t-label" style={{ marginBottom: 6 }}>
          Step {Math.min(stepIdx, 4)} of 4 ·{' '}
          {step === 'review' ? 'Review' : step === 'signing' ? 'Sign' : step === 'processing' ? 'Settle' : step === 'success' ? 'Done' : 'Error'}
        </div>

        {step === 'review' && (
          <StepReview
            skill={skill} fee={fee} providerCut={providerCut}
            connected={!!account} account={account}
            onPay={handlePay} onCancel={onClose} connecting={connecting}
            allowanceKnown={allowance != null}
            hasAllowance={hasAllowance}
            approving={approving}
            approveErr={approveErr}
            onApprove={handleApprove}
          />
        )}
        {step === 'signing' && <StepSigning />}
        {step === 'processing' && <StepProcessing />}
        {step === 'success' && <StepSuccess tx={txHash} skill={skill} onClose={onClose} />}
        {step === 'error' && (
          <StepError
            message={errorMsg}
            onRetry={() => { setErrorMsg(''); setStep('review') }}
            onCancel={onClose}
          />
        )}
      </div>
    </div>
  )
}

function StepReview({
  skill, fee, providerCut, connected, account, onPay, onCancel, connecting,
  allowanceKnown, hasAllowance, approving, approveErr, onApprove,
}: {
  skill: Skill; fee: string; providerCut: string
  connected: boolean; account: string | null
  onPay: () => void; onCancel: () => void; connecting: boolean
  allowanceKnown: boolean; hasAllowance: boolean
  approving: boolean; approveErr: string
  onApprove: () => void
}) {
  const needsApproval = connected && allowanceKnown && !hasAllowance
  return (
    <>
      <h2 className="t-display" style={{ fontSize: 24, margin: '0 0 20px', letterSpacing: '-0.01em' }}>
        Access {skill.name}
      </h2>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: 16,
        background: 'var(--lf-surface-2)', border: '1px solid var(--lf-border)',
        borderRadius: 6, marginBottom: 24,
      }}>
        <ReputationGauge score={skill.score === 0 ? null : skill.score} size={48} strokeWidth={4} />
        <div style={{ flex: 1 }}>
          <div className="t-mono" style={{ fontSize: 14, color: 'var(--lf-ink)' }}>
            {skill.score === 0 ? 'No reputation yet' : `${skill.score}/100`}
          </div>
          <div style={{ fontSize: 12, color: 'var(--lf-ink-3)', fontFamily: 'var(--f-mono)', marginTop: 2 }}>
            {skill.jobs} job{skill.jobs !== 1 ? 's' : ''} completed
          </div>
        </div>
        <TierBadge tier={skill.tier} />
      </div>

      <div style={{ textAlign: 'center', padding: '16px 0', marginBottom: 12 }}>
        <div className="t-label" style={{ marginBottom: 8 }}>Total payment</div>
        <div className="t-mono" style={{ fontSize: 42, fontWeight: 500, letterSpacing: '-0.02em', color: 'var(--lf-ink)' }}>
          {skill.price.toFixed(2)} <span style={{ fontSize: 18, color: 'var(--lf-ink-3)' }}>USDC</span>
        </div>
      </div>

      <div style={{
        padding: '12px 0', borderTop: '1px solid var(--lf-border)',
        borderBottom: '1px solid var(--lf-border)', marginBottom: 20,
        fontFamily: 'var(--f-mono)', fontSize: 12,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: 'var(--lf-ink-2)' }}>
          <span>→ Provider</span><span>{providerCut} USDC</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: 'var(--lf-ink-3)' }}>
          <span>→ Facilitator fee (0.2%)</span><span>{fee} USDC</span>
        </div>
      </div>

      {connected && account ? (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
          background: 'var(--lf-accent-bg)', border: '1px solid rgba(15,190,127,0.3)',
          borderRadius: 6, fontFamily: 'var(--f-mono)', fontSize: 12,
          color: 'var(--lf-accent-2)', marginBottom: 20,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--lf-accent)', flexShrink: 0 }} />
          {account.slice(0, 6)}…{account.slice(-4)}
          <span style={{ marginLeft: 'auto', color: 'var(--lf-ink-3)' }}>Mantle</span>
        </div>
      ) : (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
          background: 'var(--lf-surface-2)', border: '1px solid var(--lf-border)',
          borderRadius: 6, fontSize: 12, color: 'var(--lf-ink-3)', marginBottom: 20,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--lf-border-strong)', flexShrink: 0 }} />
          No wallet connected · will prompt on sign
        </div>
      )}

      {needsApproval && (
        <div style={{
          padding: '10px 12px', marginBottom: 12,
          background: 'var(--lf-amber-bg, rgba(255,176,32,0.08))',
          border: '1px solid var(--lf-amber, rgba(255,176,32,0.4))',
          borderRadius: 6, fontFamily: 'var(--f-mono)', fontSize: 11,
          color: 'var(--lf-ink-2)',
        }}>
          One-time setup: approve the facilitator operator to pull USDC.
          No funds move until you sign the next step.
        </div>
      )}
      {approveErr && (
        <div style={{
          padding: '8px 12px', marginBottom: 12, borderRadius: 6,
          background: 'var(--lf-red-bg)', color: 'var(--lf-red)',
          fontFamily: 'var(--f-mono)', fontSize: 11,
        }}>
          {approveErr}
        </div>
      )}

      {!connected ? (
        <button className="btn btn-primary btn-full btn-lg" onClick={onPay} disabled={connecting}>
          {connecting ? 'Connecting…' : 'Connect Wallet'}
        </button>
      ) : needsApproval ? (
        <button className="btn btn-primary btn-full btn-lg" onClick={onApprove} disabled={approving}>
          {approving ? 'Approving…' : 'Approve operator (one-time)'}
        </button>
      ) : (
        <button
          className="btn btn-primary btn-full btn-lg"
          onClick={onPay}
          disabled={!allowanceKnown}
        >
          {!allowanceKnown ? 'Checking allowance…' : 'Sign payment'}
        </button>
      )}
      <div style={{ textAlign: 'center', marginTop: 12 }}>
        <button onClick={onCancel} style={{ color: 'var(--lf-ink-3)', fontSize: 13 }}>Cancel</button>
      </div>
    </>
  )
}

function StepSigning() {
  return (
    <div style={{ textAlign: 'center', padding: '32px 0' }}>
      <div className="spinner" style={{ margin: '0 auto 24px' }} />
      <h3 className="t-display" style={{ fontSize: 20, margin: '0 0 8px' }}>
        Signing EIP-712 payment intent…
      </h3>
      <p style={{ color: 'var(--lf-ink-3)', fontSize: 13, margin: '0 0 24px', lineHeight: 1.5 }}>
        Check your wallet; a signature request has been sent.<br />
        No gas required. No tokens moved yet.
      </p>
      <div style={{
        display: 'inline-block', fontFamily: 'var(--f-mono)', fontSize: 11,
        padding: '6px 12px', background: 'var(--lf-surface-2)',
        border: '1px solid var(--lf-border)', borderRadius: 4, color: 'var(--lf-ink-2)',
      }}>
        Domain: LedgerForge · v1 · chainId 5000
      </div>
    </div>
  )
}

function StepProcessing() {
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setProgress((p) => Math.min(95, p + 4)), 100)
    return () => clearInterval(id)
  }, [])
  return (
    <div style={{ textAlign: 'center', padding: '32px 0' }}>
      <h3 className="t-display" style={{ fontSize: 20, margin: '0 0 8px' }}>
        Settling on Mantle…
      </h3>
      <p style={{ color: 'var(--lf-ink-3)', fontSize: 13, margin: '0 0 28px' }}>
        Facilitator is verifying your signature and transferring USDC.
      </p>
      <div style={{ height: 4, background: 'var(--lf-border)', borderRadius: 4, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ height: '100%', width: `${progress}%`, background: 'var(--lf-accent)', transition: 'width .12s' }} />
      </div>
      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--lf-ink-3)', display: 'flex', justifyContent: 'space-between' }}>
        <span>verify proof</span><span>→ transferFrom</span><span>→ writeScore</span>
      </div>
    </div>
  )
}

function StepSuccess({ tx, skill, onClose }: { tx: string | null; skill: Skill; onClose: () => void }) {
  const accessToken = tx ? `lfx_${tx.slice(2, 18)}` : `lfx_${skill.id}_mock`
  const endpoint = `https://ledgerforge-${skill.name.slice(0, 6).toLowerCase()}.fly.dev/v1/skills/${skill.id}/run`
  const [copied, setCopied] = useState(false)

  function copyToken() {
    navigator.clipboard.writeText(accessToken).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  return (
    <div style={{ textAlign: 'center', padding: '24px 0' }}>
      <div className="checkmark">
        <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path className="path" d="M5 12l5 5L20 7" />
        </svg>
      </div>
      <h3 className="t-display" style={{ fontSize: 22, margin: '0 0 8px' }}>Payment settled</h3>
      <p style={{ color: 'var(--lf-ink-2)', fontSize: 13, margin: '0 0 20px', lineHeight: 1.5 }}>
        Confirmed on Mantle mainnet. Scroll down to try your skill.
      </p>

      <div style={{
        padding: 16, background: 'var(--lf-surface-2)', border: '1px solid var(--lf-border)',
        borderRadius: 6, marginBottom: 16, textAlign: 'left',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        {tx && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="t-label" style={{ margin: 0 }}>Settlement tx</span>
            <AddressChip address={tx} />
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="t-label" style={{ margin: 0 }}>Endpoint</span>
          <span className="t-mono" style={{ fontSize: 11, color: 'var(--lf-accent)' }}>
            …{skill.id}/run
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="t-label" style={{ margin: 0 }}>Access token</span>
          <button
            onClick={copyToken}
            style={{
              fontFamily: 'var(--f-mono)', fontSize: 11, color: copied ? 'var(--lf-accent)' : 'var(--lf-ink-2)',
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            }}
          >
            {accessToken.slice(0, 16)}… {copied ? '✓ copied' : '⎘'}
          </button>
        </div>
      </div>

      <button className="btn btn-primary btn-full btn-lg" onClick={onClose}>
        Try it now ↓
      </button>
    </div>
  )
}

function StepError({ message, onRetry, onCancel }: { message: string; onRetry: () => void; onCancel: () => void }) {
  return (
    <div style={{ textAlign: 'center', padding: '24px 0' }}>
      <div style={{
        width: 56, height: 56, margin: '0 auto 16px', borderRadius: '50%',
        background: 'var(--lf-red-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--lf-red)" strokeWidth="2.5" strokeLinecap="round">
          <line x1="6" y1="6" x2="18" y2="18" /><line x1="6" y1="18" x2="18" y2="6" />
        </svg>
      </div>
      <h3 className="t-display" style={{ fontSize: 22, margin: '0 0 8px' }}>Payment could not settle</h3>
      <p style={{ color: 'var(--lf-ink-2)', fontSize: 13, margin: '0 0 8px', lineHeight: 1.5 }}>
        {message}
      </p>
      <div style={{
        fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--lf-ink-3)',
        padding: 10, background: 'var(--lf-surface-2)', borderRadius: 4,
        marginBottom: 24, textAlign: 'left',
      }}>
        No funds were transferred. Wallet was not charged.
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <button className="btn btn-ghost btn-full" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary btn-full" onClick={onRetry}>Retry</button>
      </div>
    </div>
  )
}
