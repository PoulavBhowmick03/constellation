import "dotenv/config";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const mantleChain = {
  id: 5000,
  name: "Mantle",
  network: "mantle",
  nativeCurrency: { name: "MNT", symbol: "MNT", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.MANTLE_RPC ?? "https://rpc.mantle.xyz"] },
    public: { http: [process.env.MANTLE_RPC ?? "https://rpc.mantle.xyz"] },
  },
} as const;

export const publicClient = createPublicClient({
  chain: mantleChain,
  transport: http(),
});

function _createOperatorClient() {
  const key = process.env.OPERATOR_PRIVATE_KEY;
  if (!key) throw new Error("OPERATOR_PRIVATE_KEY not set");
  const account = privateKeyToAccount(key as `0x${string}`);
  return createWalletClient({ account, chain: mantleChain, transport: http() });
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
  (process.env.USDE_ADDRESS ?? "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34").toLowerCase(),
  (process.env.USDC_ADDRESS ?? "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9").toLowerCase(),
]);
