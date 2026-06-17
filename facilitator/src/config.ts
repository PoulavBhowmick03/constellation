import "dotenv/config";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const CELO_RPC = process.env.CELO_RPC ?? "https://alfajores-forno.celo-testnet.org";

export const celoChain = {
  id: Number(process.env.CELO_CHAIN_ID ?? 44787),
  name: "Celo Alfajores",
  network: "celo-alfajores",
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
  rpcUrls: {
    default: { http: [CELO_RPC] },
    public: { http: [CELO_RPC] },
  },
} as const;

export const publicClient = createPublicClient({
  chain: celoChain,
  transport: http(),
});

function _createOperatorClient() {
  const key = process.env.OPERATOR_PRIVATE_KEY;
  if (!key) throw new Error("OPERATOR_PRIVATE_KEY not set");
  const account = privateKeyToAccount(key as `0x${string}`);
  return createWalletClient({ account, chain: celoChain, transport: http() });
}

// Singleton — prevents nonce collisions from concurrent writeContract calls
// that would each fetch the same pending nonce independently.
let _operatorWalletClient: ReturnType<typeof _createOperatorClient> | undefined;

export function getOperatorWalletClient(): ReturnType<typeof _createOperatorClient> {
  return (_operatorWalletClient ??= _createOperatorClient());
}

// Serializes all on-chain writes (settlePayment + scoreJob) so concurrent
// /facilitate and /score requests never race on the operator nonce.
let _writeQueue: Promise<unknown> = Promise.resolve();

export function enqueueWrite<T>(fn: () => Promise<T>): Promise<T> {
  const next = _writeQueue.then(() => fn());
  // keep the chain alive even if fn throws
  _writeQueue = next.catch(() => undefined);
  return next;
}

export const SKILL_REGISTRY_ADDRESS =
  process.env.SKILL_REGISTRY_ADDRESS as `0x${string}`;
export const X402_ESCROW_ADDRESS =
  process.env.X402_ESCROW_ADDRESS as `0x${string}`;
export const ERC8004_REPUTATION_ADDRESS =
  (process.env.ERC8004_REPUTATION_REGISTRY as `0x${string}` | undefined);
export const FACILITATOR_FEE_BPS =
  parseInt(process.env.FACILITATOR_FEE_BPS ?? "20");
export const PORT = parseInt(process.env.FACILITATOR_PORT ?? "3001");

// provider wallet must differ from operator
export const PROVIDER_ADDRESS =
  (process.env.PROVIDER_ADDRESS ??
   process.env.SPAWN_PROVIDER_ADDRESS ??
   "") as `0x${string}`;

export const ALLOWED_TOKENS = new Set([
  // cUSD + USDC on Celo Alfajores
  (process.env.CUSD_ADDRESS ?? "0x874069fa1eb16d44d622f2e0ca25eea172369bc1").toLowerCase(),
  (process.env.USDC_ADDRESS ?? "0x2f25deb3848c207fc8e0c34035b3ba7fc157602b").toLowerCase(),
]);
