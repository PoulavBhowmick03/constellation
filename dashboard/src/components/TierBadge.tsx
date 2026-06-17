import type { Tier } from '@/lib/types'

export default function TierBadge({ tier }: { tier: Tier }) {
  const cls = tier === 'PRO' ? 'tier-pro' : tier === 'BASIC' ? 'tier-basic' : 'tier-free'
  const label = tier === 'FREE' ? 'Free' : tier
  return <span className={`tier ${cls}`}>{label}</span>
}
