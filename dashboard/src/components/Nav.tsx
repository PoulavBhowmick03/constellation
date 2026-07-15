'use client'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useWallet } from '@/context/WalletContext'

function truncAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

export default function Nav() {
  const path = usePathname()
  const { account, connecting, connect, disconnect } = useWallet()

  return (
    <header className="nav">
      <Link href="/" className="nav-brand" style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Image
          src="/logo-light-lockup.png"
          alt="LedgerForge"
          width={210}
          height={69}
          priority
          style={{ objectFit: 'contain' }}
        />
      </Link>

      <nav className="nav-links">
        {[
          { href: '/bazaar', label: 'The Bazaar' },
          { href: '/jobs', label: 'Job Feed' },
          { href: '/agent-demo', label: 'Agent Demo' },
          { href: '/list', label: 'List a Skill' },
        ].map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={`nav-link${path.startsWith(href) ? ' active' : ''}`}
          >
            {label}
          </Link>
        ))}
      </nav>

      <div className="nav-right">
        {account ? (
          <button
            onClick={disconnect}
            title="Click to disconnect"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              height: 34, padding: '0 12px',
              background: 'var(--lf-accent-bg)', color: 'var(--lf-accent-2)',
              border: '1px solid rgba(15,190,127,0.3)', borderRadius: 6,
              fontFamily: 'var(--f-mono)', fontSize: 12, fontWeight: 500,
              cursor: 'pointer', transition: 'all .1s',
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--lf-accent)', flexShrink: 0 }} />
            {truncAddr(account)}
          </button>
        ) : (
          <button
            onClick={connect}
            disabled={connecting}
            className="btn btn-primary"
            style={{ height: 34, fontSize: 13, opacity: connecting ? 0.7 : 1 }}
          >
            {connecting ? 'Connecting…' : 'Connect Wallet'}
          </button>
        )}
        <Link href="/bazaar" className="btn btn-outline" style={{ height: 34, fontSize: 13 }}>
          Browse →
        </Link>
      </div>
    </header>
  )
}
