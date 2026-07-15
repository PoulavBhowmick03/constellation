'use client'
import { useMemo, useState } from 'react'
import { type Address, formatUnits } from 'viem'
import { useWallet } from '@/context/WalletContext'
import { useBrowserWalletClient } from '@/hooks/useBrowserWalletClient'
import { useAgentRun } from '@/hooks/useAgentRun'
import { runLive } from '@/lib/agent-demo/runner'
import { runReplay } from '@/lib/agent-demo/replay'
import {
  SCOUT_SPEC,
  PERPS_COACH_SPEC,
  SPAWN_AUDITOR_SPEC,
  type AgentSpec,
} from '@/lib/agent-demo/specs'
import type { ScoutDecision } from '@/lib/agent-demo/decide'
import type { PerpsDecision } from '@/lib/agent-demo/perps'
import type { SpawnDecision } from '@/lib/agent-demo/spawn'
import PreflightBanner from '@/components/agent-demo/PreflightBanner'
import RunControls from '@/components/agent-demo/RunControls'
import AgentRunTimeline from '@/components/agent-demo/AgentRunTimeline'
import ScoutDecisionCard from '@/components/agent-demo/DecisionCard'
import PerpsDecisionCard from '@/components/agent-demo/PerpsDecisionCard'
import SpawnDecisionCard from '@/components/agent-demo/SpawnDecisionCard'
import SettlementChain from '@/components/agent-demo/SettlementChain'
import AddressChip from '@/components/AddressChip'

// Provider recipient for live runs. The x402Escrow contract reverts if
// provider == msg.sender, so this MUST be different from the operator.
const DEMO_PROVIDER_ADDRESS =
  (process.env.NEXT_PUBLIC_DEMO_PROVIDER_ADDRESS as Address | undefined) ??
  ('0xEa5081b84103A2cCc727334dF2fe978148500BB4' as Address)

type AgentId = 'scout' | 'perps-coach' | 'spawn-auditor'

interface AgentTabConfig {
  id: AgentId
  label: string
  subtitle: string
  spec: AgentSpec<unknown>
}

const TABS: AgentTabConfig[] = [
  { id: 'scout', label: 'Scout', subtitle: 'DeFi yield rotation', spec: SCOUT_SPEC as unknown as AgentSpec<unknown> },
  { id: 'perps-coach', label: 'Perps Coach', subtitle: 'Byreal perps', spec: PERPS_COACH_SPEC as unknown as AgentSpec<unknown> },
  { id: 'spawn-auditor', label: 'Spawn Auditor', subtitle: 'AI deploy audit', spec: SPAWN_AUDITOR_SPEC as unknown as AgentSpec<unknown> },
]

const RAW_SPECS = {
  scout: SCOUT_SPEC,
  'perps-coach': PERPS_COACH_SPEC,
  'spawn-auditor': SPAWN_AUDITOR_SPEC,
} as const

export default function AgentDemoPage() {
  const [activeAgent, setActiveAgent] = useState<AgentId>('scout')

  const activeTab = TABS.find((t) => t.id === activeAgent) ?? TABS[0]
  const spec = activeTab.spec

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '40px 24px 80px' }}>
      <Header />
      <AgentTabs active={activeAgent} onChange={setActiveAgent} />
      {/* Key the inner component on agent id so all state resets across tabs */}
      <AgentRunner
        key={activeAgent}
        agentId={activeAgent}
        spec={spec}
      />
    </div>
  )
}

function AgentRunner({
  agentId,
  spec,
}: {
  agentId: AgentId
  spec: AgentSpec<unknown>
}) {
  const [preflightReady, setPreflightReady] = useState(false)

  const { account, connect, connecting } = useWallet()
  const walletClient = useBrowserWalletClient(account)
  const { state, run, reset } = useAgentRun(spec.steps.length)

  const requiredUsdc = useMemo(
    () => spec.pricePerCall * BigInt(spec.steps.length),
    [spec],
  )

  const running = state.phase === 'running'
  const hasResult =
    state.phase === 'completed' || state.phase === 'failed' || state.phase === 'aborted'

  const liveDisabled = !account || !walletClient || !preflightReady
  const liveLabel = !account
    ? 'Connect MetaMask to run live'
    : !preflightReady
      ? 'Run with MetaMask (preflight required)'
      : 'Run with MetaMask'

  const description = (
    <p
      style={{
        margin: '8px 0 0',
        color: 'var(--lf-ink-2)',
        fontSize: 14,
        lineHeight: 1.55,
      }}
    >
      {spec.description}
    </p>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {description}
      <WalletStrip account={account} connecting={connecting} onConnect={connect} />

      <PreflightBanner
        account={account as Address | null}
        walletClient={walletClient}
        requiredUsdc={requiredUsdc}
        onReadyChange={setPreflightReady}
      />

      <RunControls
        liveDisabled={liveDisabled}
        liveLabel={liveLabel}
        running={running}
        onRunLive={() => {
          if (!walletClient || !account) return
          reset()
          // Cast: the union of per-agent specs can't unify on a single T,
          // but the runner only reads steps/pricePerCall/decide/enrichDecision
          // and yields events with `decision: unknown`.
          const raw = RAW_SPECS[agentId] as unknown as AgentSpec<unknown>
          void run(
            runLive(raw, walletClient, { provider: DEMO_PROVIDER_ADDRESS }),
          )
        }}
        onRunReplay={() => {
          reset()
          const raw = RAW_SPECS[agentId] as unknown as AgentSpec<unknown>
          void run(runReplay(raw))
        }}
        onReset={reset}
        hasResult={hasResult}
      />

      <RunSummary state={state} requiredUsdc={requiredUsdc} />

      <AgentRunTimeline spec={spec} steps={state.steps} />

      <DecisionDispatch
        agentId={agentId}
        decision={state.decision}
        pending={running && state.decision === undefined}
      />

      {state.settlements.length > 0 && (
        <SettlementChain settlements={state.settlements} />
      )}
    </div>
  )
}

function DecisionDispatch({
  agentId,
  decision,
  pending,
}: {
  agentId: AgentId
  decision: unknown
  pending: boolean
}) {
  // Replay mode emits a placeholder decision: { action: 'REPLAY', ... }
  if (decision && typeof decision === 'object' && 'action' in decision && (decision as { action: string }).action === 'REPLAY') {
    return <ReplayNotice decision={decision as { action: string; reason: string }} />
  }

  switch (agentId) {
    case 'scout':
      return <ScoutDecisionCard decision={decision as ScoutDecision | undefined} pending={pending} />
    case 'perps-coach':
      return <PerpsDecisionCard decision={decision as PerpsDecision | undefined} pending={pending} />
    case 'spawn-auditor':
      return <SpawnDecisionCard decision={decision as SpawnDecision | undefined} pending={pending} />
  }
}

function ReplayNotice({ decision }: { decision: { reason: string } }) {
  return (
    <div
      style={{
        background: 'var(--lf-surface)',
        border: '1px solid var(--lf-border)',
        borderRadius: 12,
        padding: '18px 24px',
      }}
    >
      <div className="t-label" style={{ marginBottom: 6 }}>Replay mode</div>
      <div style={{ color: 'var(--lf-ink-2)', fontSize: 14, lineHeight: 1.55 }}>
        {decision.reason}
      </div>
    </div>
  )
}

function Header() {
  return (
    <div style={{ marginBottom: 28 }}>
      <div className="t-label" style={{ marginBottom: 8 }}>
        Agent demo · /agent-demo
      </div>
      <h1
        className="t-display-heavy"
        style={{ fontSize: 42, lineHeight: 1.05, margin: 0 }}
      >
        Watch an autonomous agent
        <br />
        buy skills live on Mantle.
      </h1>
      <p
        style={{
          marginTop: 14,
          maxWidth: 680,
          color: 'var(--lf-ink-2)',
          fontSize: 15,
          lineHeight: 1.55,
        }}
      >
        Three autonomous agents — one rail. Run any of them with your own
        MetaMask wallet on Mantle mainnet, or watch a recorded run if you
        don&apos;t want to fund a wallet.
      </p>
    </div>
  )
}

function AgentTabs({
  active,
  onChange,
}: {
  active: AgentId
  onChange: (id: AgentId) => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        marginBottom: 28,
        background: 'var(--lf-surface)',
        border: '1px solid var(--lf-border)',
        borderRadius: 12,
        padding: 8,
      }}
    >
      {TABS.map((t) => {
        const isActive = active === t.id
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            style={{
              flex: 1,
              padding: '12px 14px',
              borderRadius: 8,
              background: isActive ? 'var(--lf-ink)' : 'transparent',
              color: isActive ? 'white' : 'var(--lf-ink-2)',
              textAlign: 'left',
              transition: 'all .15s',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--f-mono)',
                fontSize: 14,
                fontWeight: 600,
                marginBottom: 2,
              }}
            >
              {t.label}
            </div>
            <div
              style={{
                fontSize: 11,
                color: isActive ? 'rgba(255,255,255,0.65)' : 'var(--lf-ink-3)',
                fontFamily: 'var(--f-mono-2)',
              }}
            >
              {t.subtitle}
            </div>
          </button>
        )
      })}
    </div>
  )
}

function WalletStrip({
  account,
  connecting,
  onConnect,
}: {
  account: string | null
  connecting: boolean
  onConnect: () => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 18px',
        background: 'var(--lf-surface)',
        border: '1px solid var(--lf-border)',
        borderRadius: 10,
      }}
    >
      <div className="t-label" style={{ minWidth: 80 }}>Wallet</div>
      {account ? (
        <AddressChip address={account} />
      ) : (
        <button
          type="button"
          onClick={onConnect}
          disabled={connecting}
          style={{
            fontFamily: 'var(--f-mono)',
            fontSize: 13,
            padding: '10px 18px',
            borderRadius: 999,
            background: 'var(--lf-ink)',
            color: 'white',
            fontWeight: 600,
          }}
        >
          {connecting ? 'Connecting…' : 'Connect MetaMask'}
        </button>
      )}
    </div>
  )
}

function RunSummary({
  state,
  requiredUsdc,
}: {
  state: ReturnType<typeof useAgentRun>['state']
  requiredUsdc: bigint
}) {
  if (state.phase === 'idle') return null

  const status =
    state.phase === 'running'
      ? 'Running…'
      : state.phase === 'completed'
        ? `Complete — ${state.settlements.length} settlements, ${formatUnits(state.totalSpent, 6)} USDC spent`
        : state.phase === 'failed'
          ? `Failed: ${state.error ?? 'unknown error'}`
          : 'Aborted'

  return (
    <div
      style={{
        padding: '10px 16px',
        background: 'var(--lf-surface-2)',
        border: '1px solid var(--lf-border)',
        borderRadius: 8,
        fontFamily: 'var(--f-mono)',
        fontSize: 13,
        color: 'var(--lf-ink-2)',
        display: 'flex',
        justifyContent: 'space-between',
      }}
    >
      <span>{status}</span>
      <span style={{ color: 'var(--lf-ink-3)' }}>
        budget {formatUnits(requiredUsdc, 6)} USDC
      </span>
    </div>
  )
}
