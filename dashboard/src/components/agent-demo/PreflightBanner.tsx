'use client'
import { useEffect, useState } from 'react'
import {
  createPublicClient,
  http,
  formatUnits,
  type Address,
  type Hex,
  type WalletClient,
} from 'viem'
import { mantle } from 'viem/chains'

// Mantle mainnet constants
const USDC_ADDRESS = '0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9' as const
const OPERATOR_ADDRESS = '0xC0296012Cfbb0e6DF5dA7158B65Dbc46DD9650e0' as const

const ERC20_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const

interface Props {
  account: Address | null
  walletClient: WalletClient | null
  /** Minimum USDC the user needs in base units (6 decimals). */
  requiredUsdc: bigint
  onReadyChange?: (ready: boolean) => void
}

interface State {
  loading: boolean
  balance: bigint
  allowance: bigint
  error?: string
  approving: boolean
  approveTx?: Hex
}

export default function PreflightBanner({
  account,
  walletClient,
  requiredUsdc,
  onReadyChange,
}: Props) {
  const [state, setState] = useState<State>({
    loading: false,
    balance: 0n,
    allowance: 0n,
    approving: false,
  })

  // Re-read balance + allowance whenever the account changes or the user
  // approves. Done with a plain publicClient so we don't require the user's
  // walletClient to read.
  useEffect(() => {
    if (!account) return
    const publicClient = createPublicClient({ chain: mantle, transport: http() })
    setState((s) => ({ ...s, loading: true, error: undefined }))
    Promise.all([
      publicClient.readContract({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [account],
      }),
      publicClient.readContract({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [account, OPERATOR_ADDRESS],
      }),
    ])
      .then(([balance, allowance]) => {
        setState((s) => ({ ...s, loading: false, balance, allowance }))
      })
      .catch((err: unknown) => {
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : 'pre-flight read failed',
        }))
      })
  }, [account, state.approveTx])

  const hasBalance = state.balance >= requiredUsdc
  const hasAllowance = state.allowance >= requiredUsdc
  const ready = !!account && hasBalance && hasAllowance && !state.approving

  useEffect(() => {
    onReadyChange?.(ready)
  }, [ready, onReadyChange])

  if (!account) return null
  if (state.loading) {
    return (
      <Banner color="muted">
        <span>Reading wallet balance and allowance…</span>
      </Banner>
    )
  }
  if (state.error) {
    return (
      <Banner color="red">
        <span>Pre-flight read failed: {state.error}</span>
      </Banner>
    )
  }

  if (!hasBalance) {
    const need = formatUnits(requiredUsdc, 6)
    const have = formatUnits(state.balance, 6)
    return (
      <Banner color="amber">
        <span>
          Wallet needs at least <b>{need} USDC</b> on Mantle to run the demo (you have {have}).
        </span>
        <a
          href="https://app.mantle.xyz/bridge"
          target="_blank"
          rel="noopener noreferrer"
          style={pillLink}
        >
          Bridge USDC ↗
        </a>
      </Banner>
    )
  }

  if (!hasAllowance) {
    return (
      <Banner color="amber">
        <span>
          Approve the LedgerForge operator to spend USDC. One-time setup; can be unlimited or capped.
        </span>
        <button
          type="button"
          disabled={state.approving || !walletClient}
          onClick={async () => {
            if (!walletClient || !account) return
            try {
              setState((s) => ({ ...s, approving: true, error: undefined }))
              const txHash = await walletClient.writeContract({
                account,
                chain: mantle,
                address: USDC_ADDRESS,
                abi: ERC20_ABI,
                functionName: 'approve',
                args: [OPERATOR_ADDRESS, BigInt(2) ** BigInt(256) - 1n],
              })
              setState((s) => ({ ...s, approving: false, approveTx: txHash }))
            } catch (err: unknown) {
              setState((s) => ({
                ...s,
                approving: false,
                error: err instanceof Error ? err.message : 'approve failed',
              }))
            }
          }}
          style={{
            ...pillButton,
            opacity: state.approving ? 0.6 : 1,
            cursor: state.approving ? 'wait' : 'pointer',
          }}
        >
          {state.approving ? 'Approving…' : 'Approve operator'}
        </button>
      </Banner>
    )
  }

  return (
    <Banner color="green">
      <span>
        Wallet is ready. Balance: <b>{formatUnits(state.balance, 6)} USDC</b>. Operator approved.
      </span>
    </Banner>
  )
}

function Banner({
  color,
  children,
}: {
  color: 'green' | 'amber' | 'red' | 'muted'
  children: React.ReactNode
}) {
  const palette = {
    green: { bg: 'var(--lf-green-bg)', border: 'var(--lf-green)', ink: 'var(--lf-ink)' },
    amber: { bg: 'var(--lf-amber-bg)', border: 'var(--lf-amber)', ink: 'var(--lf-ink)' },
    red: { bg: 'var(--lf-red-bg)', border: 'var(--lf-red)', ink: 'var(--lf-ink)' },
    muted: { bg: 'var(--lf-surface-2)', border: 'var(--lf-border)', ink: 'var(--lf-ink-2)' },
  }[color]
  return (
    <div
      style={{
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        color: palette.ink,
        borderRadius: 10,
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        fontSize: 14,
      }}
    >
      {children}
    </div>
  )
}

const pillButton: React.CSSProperties = {
  fontFamily: 'var(--f-mono)',
  fontSize: 12,
  padding: '8px 14px',
  borderRadius: 999,
  background: 'var(--lf-ink)',
  color: 'white',
  fontWeight: 600,
  whiteSpace: 'nowrap',
}

const pillLink: React.CSSProperties = {
  fontFamily: 'var(--f-mono)',
  fontSize: 12,
  padding: '8px 14px',
  borderRadius: 999,
  background: 'var(--lf-ink)',
  color: 'white',
  fontWeight: 600,
  whiteSpace: 'nowrap',
}
