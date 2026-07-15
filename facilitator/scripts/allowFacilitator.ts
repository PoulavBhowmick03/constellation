/**
 * One-time setup: authorize the operator wallet as a facilitator on x402Escrow.
 *
 * The deploy script doesn't call allowFacilitator(), so until this runs the
 * settler's completeJob() call would revert with NotAllowedFacilitator().
 *
 * Must be run from the contract DEPLOYER private key (the escrow owner).
 *
 * Usage:
 *   cd facilitator && node --env-file=../.env node_modules/.bin/tsx scripts/allowFacilitator.ts
 */
import "dotenv/config";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ESCROW_ABI = [
  {
    name: "allowFacilitator",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "f", type: "address" }],
    outputs: [],
  },
  {
    name: "allowedFacilitators",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const mantle = {
  id: 5000,
  name: "Mantle",
  network: "mantle",
  nativeCurrency: { name: "MNT", symbol: "MNT", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mantle.xyz"] }, public: { http: ["https://rpc.mantle.xyz"] } },
} as const;

async function main() {
  const escrowAddress = process.env.X402_ESCROW_ADDRESS as `0x${string}`;
  const operator = process.env.OPERATOR_ADDRESS as `0x${string}`;
  const deployerKey = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;

  if (!escrowAddress || !operator || !deployerKey) {
    throw new Error("X402_ESCROW_ADDRESS, OPERATOR_ADDRESS, and DEPLOYER_PRIVATE_KEY must be set in .env");
  }

  const publicClient = createPublicClient({ chain: mantle, transport: http() });
  const account = privateKeyToAccount(deployerKey);
  const walletClient = createWalletClient({ account, chain: mantle, transport: http() });

  console.log(`[allowFacilitator] escrow=${escrowAddress}`);
  console.log(`[allowFacilitator] operator=${operator}`);
  console.log(`[allowFacilitator] deployer=${account.address}`);

  const already = await publicClient.readContract({
    address: escrowAddress,
    abi: ESCROW_ABI,
    functionName: "allowedFacilitators",
    args: [operator],
  });
  if (already) {
    console.log("[allowFacilitator] Already allowed — nothing to do.");
    return;
  }

  console.log("[allowFacilitator] Sending allowFacilitator(operator)...");
  const hash = await walletClient.writeContract({
    address: escrowAddress,
    abi: ESCROW_ABI,
    functionName: "allowFacilitator",
    args: [operator],
  });
  console.log(`[allowFacilitator] tx: https://mantlescan.xyz/tx/${hash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`[allowFacilitator] mined: status=${receipt.status} block=${receipt.blockNumber}`);

  const after = await publicClient.readContract({
    address: escrowAddress,
    abi: ESCROW_ABI,
    functionName: "allowedFacilitators",
    args: [operator],
  });
  console.log(`[allowFacilitator] post-state allowedFacilitators[operator]=${after}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
