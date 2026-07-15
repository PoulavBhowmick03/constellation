'use client'
import { useState } from 'react'

function truncAddr(a: string, head = 6, tail = 4) {
  if (!a) return ''
  if (a.length <= head + tail) return a
  return `${a.slice(0, head)}...${a.slice(-tail)}`
}

interface AddressChipProps {
  address: string
  head?: number
  tail?: number
}

export default function AddressChip({ address, head = 6, tail = 4 }: AddressChipProps) {
  const [copied, setCopied] = useState(false)

  function copy(e: React.MouseEvent) {
    e.stopPropagation()
    navigator.clipboard?.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  return (
    <span className="addr" onClick={copy} title={address}>
      {truncAddr(address, head, tail)}
      <span className="ext">↗</span>
      {copied && <span className="toast">Copied!</span>}
    </span>
  )
}
