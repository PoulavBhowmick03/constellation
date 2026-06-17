import { ALLOWED_TOKENS, publicClient } from "./config.js";
import type { X402PaymentDetails, X402PaymentProof } from "./types.js";

// nonce store for the demo server
const usedNonces = new Map<string, number>();

setInterval(() => {
  const now = Math.floor(Date.now() / 1000);
  for (const [key, expiry] of usedNonces.entries()) {
    if (expiry < now) usedNonces.delete(key);
  }
}, 5 * 60 * 1000);

export const ERC20_ABI = [
  {
    name: "allowance",
    type: "function",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    name: "balanceOf",
    type: "function",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

export async function verifyPaymentProof(
  details: X402PaymentDetails,
  proof: X402PaymentProof
): Promise<{ valid: boolean; error?: string }> {
  const auth = proof.payload.authorization;
  const FACILITATOR = process.env.OPERATOR_ADDRESS as `0x${string}`;

  if (!ALLOWED_TOKENS.has(auth.token.toLowerCase())) {
    return {
      valid: false,
      error:
        `Token ${auth.token} is not an allowed payment token. ` +
        "Allowed: USDe and USDC on Mantle mainnet only.",
    };
  }

  if (!ALLOWED_TOKENS.has(details.asset.toLowerCase())) {
    return {
      valid: false,
      error: `Payment asset ${details.asset} is not an allowed token`,
    };
  }

  if (BigInt(auth.amount) < BigInt(details.maxAmountRequired)) {
    return { valid: false, error: "Payment amount too small" };
  }

  const now = Math.floor(Date.now() / 1000);
  if (now > auth.validBefore) {
    return { valid: false, error: "Payment proof expired" };
  }

  const domain = {
    name: "LedgerForge",
    version: "1",
    chainId: 5000,
    verifyingContract: process.env.SKILL_REGISTRY_ADDRESS as `0x${string}`,
  } as const;

  const types = {
    Payment: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "token", type: "address" },
      { name: "skillId", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "validBefore", type: "uint256" },
    ],
  } as const;

  const message = {
    from: auth.from,
    to: auth.to as `0x${string}`,
    amount: BigInt(auth.amount),
    token: auth.token,
    skillId: BigInt(auth.skillId),
    nonce: BigInt(auth.nonce),
    validBefore: BigInt(auth.validBefore),
  };

  let isValid = false;
  try {
    isValid = await publicClient.verifyTypedData({
      address: auth.from,
      domain,
      types,
      primaryType: "Payment",
      message,
      signature: proof.payload.signature,
    });
  } catch {
    return { valid: false, error: "Invalid payment signature" };
  }

  if (!isValid) {
    return { valid: false, error: "Invalid payment signature" };
  }

  if (details.skillId !== auth.skillId) {
    return {
      valid: false,
      error: `skillId mismatch: details has ${details.skillId}, signed auth has ${auth.skillId}`,
    };
  }

  if (details.asset.toLowerCase() !== auth.token.toLowerCase()) {
    return {
      valid: false,
      error: `Token mismatch: details.asset ${details.asset}, signed auth.token ${auth.token}`,
    };
  }

  if (details.maxAmountRequired !== auth.amount) {
    return {
      valid: false,
      error: `Amount mismatch: details requires ${details.maxAmountRequired}, signed ${auth.amount}`,
    };
  }

  const nonceKey = `${auth.from.toLowerCase()}:${auth.nonce}`;
  if (usedNonces.has(nonceKey)) {
    return {
      valid: false,
      error: "Nonce already used - payment proof cannot be replayed",
    };
  }

  const allowance = await publicClient.readContract({
    address: auth.token,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [auth.from, FACILITATOR],
  });

  if (allowance < BigInt(auth.amount)) {
    return {
      valid: false,
      error:
        `Insufficient allowance. Have ${allowance}, need ${auth.amount}. ` +
        `Consumer must call approve(${FACILITATOR}, amount) first.`,
    };
  }

  const balance = await publicClient.readContract({
    address: auth.token,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [auth.from],
  });

  if (balance < BigInt(auth.amount)) {
    return { valid: false, error: "Insufficient payer balance" };
  }

  return { valid: true };
}

export { usedNonces };
