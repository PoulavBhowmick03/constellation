/**
 * End-to-end test for the new escrow-wired settler.
 *
 * What it does:
 *   1. Generate a fresh burner address (= "provider" recipient for this test)
 *   2. Sign an EIP-712 payment from the CONSUMER wallet, with recipient=burner
 *      and amount=0.2 USDC
 *   3. POST to /facilitate on the locally-running facilitator
 *   4. Walk through the response: pullTx → createJobTx → completeJobTx → reputation txs
 *   5. Verify the burner actually received the provider payout from escrow
 *
 * Requires:
 *   - facilitator running on http://localhost:3001 (against Mantle mainnet)
 *   - .env has CONSUMER_PRIVATE_KEY with USDC + MNT, allowance to OPERATOR >= 0.2 USDC
 *
 * Run:
 *   node --env-file=../.env node_modules/.bin/tsx scripts/test_escrow_flow.ts
 */
import "dotenv/config";
import { createPublicClient, createWalletClient, http, formatUnits, type Hex } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";

const RPC = process.env.MANTLE_RPC ?? "https://rpc.mantle.xyz";
const FAC = process.env.LOCAL_FACILITATOR_URL ?? "http://localhost:3001";
const USDC = process.env.USDC_ADDRESS as Hex;
const OPER = process.env.OPERATOR_ADDRESS as Hex;
const SKILL_REGISTRY = process.env.SKILL_REGISTRY_ADDRESS as Hex;
const CONSUMER_KEY = process.env.CONSUMER_PRIVATE_KEY as Hex;
const SKILL_ID = 11; // mantle-tvl-monitor — exists on-chain
const AMOUNT = 200_000n; // 0.2 USDC

const mantle = {
  id: 5000, name: "Mantle", network: "mantle",
  nativeCurrency: { name: "MNT", symbol: "MNT", decimals: 18 },
  rpcUrls: { default: { http: [RPC] }, public: { http: [RPC] } },
} as const;

async function main() {
  if (!CONSUMER_KEY) throw new Error("CONSUMER_PRIVATE_KEY missing from .env");

  const publicClient = createPublicClient({ chain: mantle, transport: http() });
  const consumer = privateKeyToAccount(CONSUMER_KEY);
  const consumerWallet = createWalletClient({ account: consumer, chain: mantle, transport: http() });
  console.log("Consumer:", consumer.address);

  // 1. Fresh burner = "provider" for this test (≠ operator, so createJob won't revert)
  const burnerKey = generatePrivateKey();
  const burner = privateKeyToAccount(burnerKey).address;
  console.log("Burner provider:", burner);

  // 2. Get payment challenge from facilitator
  const challengeRes = await fetch(`${FAC}/payment-details?skillId=${SKILL_ID}&amount=${AMOUNT}&asset=${USDC}`);
  const challenge = await challengeRes.json();
  console.log("Challenge:", { payTo: challenge.payTo, asset: challenge.asset, amount: challenge.maxAmountRequired });

  // 3. Sign EIP-712 authorization (consumer pays burner via operator)
  const nonce = Date.now();
  const validBefore = Math.floor(Date.now() / 1000) + 300;
  const authorization = {
    from: consumer.address,
    to: burner,
    amount: AMOUNT.toString(),
    token: USDC,
    skillId: SKILL_ID,
    nonce,
    validBefore,
  };

  const signature = await consumerWallet.signTypedData({
    account: consumer,
    domain: {
      name: "LedgerForge", version: "1",
      chainId: 5000,
      verifyingContract: SKILL_REGISTRY,
    },
    types: {
      Payment: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "token", type: "address" },
        { name: "skillId", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "validBefore", type: "uint256" },
      ],
    },
    primaryType: "Payment",
    message: {
      from: consumer.address,
      to: burner,
      amount: AMOUNT,
      token: USDC,
      skillId: BigInt(SKILL_ID),
      nonce: BigInt(nonce),
      validBefore: BigInt(validBefore),
    },
  });

  const proof = {
    scheme: "exact",
    network: "eip155:5000",
    payload: { signature, authorization },
    reputationScore: 90,
  };

  // 4. POST to facilitator
  console.log("\nPOST /facilitate ...");
  const facRes = await fetch(`${FAC}/facilitate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ paymentDetails: challenge, paymentProof: proof }),
  });

  const body = await facRes.json();
  console.log("\nResponse:");
  console.log(JSON.stringify(body, null, 2));

  if (!body.success) {
    console.error("Settlement failed.");
    process.exit(1);
  }

  // 5. Verify burner received the payout
  const ERC20 = [{ name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] }];
  const burnerBalance = await publicClient.readContract({ address: USDC, abi: ERC20, functionName: "balanceOf", args: [burner] });
  console.log(`\nBurner USDC balance after settlement: ${formatUnits(burnerBalance, 6)}`);

  console.log("\nTx links:");
  console.log(`  pull       https://mantlescan.xyz/tx/${body.pullTxHash}`);
  console.log(`  createJob  https://mantlescan.xyz/tx/${body.createJobTxHash}`);
  console.log(`  completeJob https://mantlescan.xyz/tx/${body.completeJobTxHash}`);
  if (body.skillRegistryRepTxHash) console.log(`  SkillRegistry rep   https://mantlescan.xyz/tx/${body.skillRegistryRepTxHash}`);
  if (body.erc8004FeedbackTxHash) console.log(`  ERC-8004 feedback   https://mantlescan.xyz/tx/${body.erc8004FeedbackTxHash}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
