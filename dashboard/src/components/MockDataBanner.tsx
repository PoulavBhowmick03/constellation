'use client'
import { useState } from 'react'

export default function MockDataBanner() {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null
  return (
    <div className="mock-banner">
      <span>
        <span style={{ marginRight: 8 }}>⚠</span>
        Demo mode: Bazaar API unreachable. Showing sample data.
      </span>
      <button onClick={() => setDismissed(true)}>✕</button>
    </div>
  )
}
