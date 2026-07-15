'use client'
import { useState, useEffect } from 'react'

function scoreColor(s: number | null): string {
  if (s == null) return 'var(--lf-border)'
  if (s >= 80) return 'var(--lf-green)'
  if (s >= 50) return 'var(--lf-amber)'
  return 'var(--lf-red)'
}

interface ReputationGaugeProps {
  score: number | null
  size?: number
  strokeWidth?: number
  animate?: boolean
}

export default function ReputationGauge({
  score,
  size = 64,
  strokeWidth = 6,
  animate = true,
}: ReputationGaugeProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const target = score == null ? 0 : Math.max(0, Math.min(100, score))
  const [drawn, setDrawn] = useState(animate ? 0 : target)

  useEffect(() => {
    if (!animate) {
      setDrawn(target)
      return
    }
    setDrawn(0)
    const start = performance.now()
    const dur = 800
    let raf: number
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur)
      const eased = 1 - Math.pow(1 - t, 3)
      setDrawn(target * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, animate])

  const dashOffset = circumference - (drawn / 100) * circumference
  const color = scoreColor(score)
  const fontSize = size >= 80 ? 22 : size >= 64 ? 17 : 13

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke="var(--lf-border)" strokeWidth={2} fill="none"
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={color} strokeWidth={strokeWidth} fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={score == null ? circumference : dashOffset}
          strokeLinecap="round"
          style={{ transition: 'stroke 0.2s' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--f-mono)', fontWeight: 500,
        fontSize, color: 'var(--lf-ink)',
      }}>
        {score == null ? '—' : Math.round(drawn)}
      </div>
    </div>
  )
}
