import type { Metadata } from 'next'
import './globals.css'
import Nav from '@/components/Nav'
import { WalletProvider } from '@/context/WalletContext'

export const metadata: Metadata = {
  title: 'LedgerForge Bazaar - Agent Services on Mantle',
  description:
    'The first reputation-native agent service marketplace on Mantle. Discover, pay for, and rate AI agent services with on-chain reputation.',
  icons: {
    icon: '/favicon.png',
    apple: '/favicon-512.png',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Boldonse&family=Big+Shoulders+Display:wght@400;600;700&family=DM+Mono:ital,wght@0,400;0,500;1,400&family=DM+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <WalletProvider>
          <Nav />
          <main>{children}</main>
        </WalletProvider>
      </body>
    </html>
  )
}
