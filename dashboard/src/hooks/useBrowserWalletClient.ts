'use client'
import { useEffect, useState } from 'react'
import { createWalletClient, custom, type Address, type WalletClient } from 'viem'
import { mantle } from 'viem/chains'

/**
 * Builds a viem WalletClient from window.ethereum on demand. Returns null
 * until both: (a) the WalletContext has an account, and (b) window.ethereum
 * exists (it doesn't during SSR or before a wallet extension loads).
 *
 * The returned WalletClient.account is a JsonRpcAccount, NOT a
 * PrivateKeyAccount. viem accepts either at runtime; the SDK's internal
 * type cast `as PrivateKeyAccount` is a type-lie that doesn't affect
 * behavior — signTypedData and writeContract both route correctly via
 * the injected provider.
 */
export function useBrowserWalletClient(account: string | null): WalletClient | null {
  const [client, setClient] = useState<WalletClient | null>(null)

  useEffect(() => {
    if (!account || typeof window === 'undefined' || !window.ethereum) {
      setClient(null)
      return
    }
    const provider = window.ethereum as unknown as Parameters<typeof custom>[0]
    const wc = createWalletClient({
      account: account as Address,
      chain: mantle,
      transport: custom(provider),
    })
    setClient(wc)
  }, [account])

  return client
}
