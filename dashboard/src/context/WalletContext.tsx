'use client'
import { createContext, useContext, useState, useCallback } from 'react'

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
      on: (event: string, handler: (...args: unknown[]) => void) => void
    }
  }
}

const CELO_CHAIN_ID = '0xaef3'

interface WalletContextType {
  account: string | null
  connecting: boolean
  error: string
  connect: () => Promise<void>
  disconnect: () => void
}

const WalletContext = createContext<WalletContextType>({
  account: null, connecting: false, error: '',
  connect: async () => {}, disconnect: () => {},
})

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')

  const connect = useCallback(async () => {
    setError('')
    if (!window.ethereum) {
      setError('No Ethereum wallet detected. Install MetaMask or a compatible wallet.')
      return
    }
    setConnecting(true)
    try {
      const accounts = (await window.ethereum.request({ method: 'eth_requestAccounts' })) as string[]
      setAccount(accounts[0])
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: CELO_CHAIN_ID }],
        })
      } catch (sw: unknown) {
        if ((sw as { code?: number }).code === 4902) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: CELO_CHAIN_ID, chainName: 'Celo Alfajores',
              nativeCurrency: { name: 'CELO', symbol: 'CELO', decimals: 18 },
              rpcUrls: ['https://alfajores-forno.celo-testnet.org'],
              blockExplorerUrls: ['https://alfajores.celoscan.io'],
            }],
          })
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Connection failed.')
    } finally {
      setConnecting(false)
    }
  }, [])

  const disconnect = useCallback(() => { setAccount(null); setError('') }, [])

  return (
    <WalletContext.Provider value={{ account, connecting, error, connect, disconnect }}>
      {children}
    </WalletContext.Provider>
  )
}

export function useWallet() {
  return useContext(WalletContext)
}
