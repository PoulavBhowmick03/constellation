/**
 * LedgerForge SDK — quickstart
 *
 * Demonstrates discovery → sign → settle → execute against the live mainnet
 * deployment. Discovery + signing run with a throwaway key. The full invoke()
 * step requires:
 *
 *   1. A Mantle wallet funded with MNT (gas) and USDC
 *   2. The wallet has approved the LedgerForge operator to spend USDC
 *      — this script calls approveOperator() if allowance is insufficient
 *
 * Set WALLET_PRIVATE_KEY=0x... in env to run the full flow.
 */
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { formatUnits } from "viem";
import { LedgerForgeClient, formatTokenAmount } from "../src/index.js";

async function discover() {
  const client = new LedgerForgeClient();
  console.log("\n[1] Discovery — listing all live skills\n");

  const all = await client.listSkills();
  console.log(`Found ${all.length} skills:`);
  for (const skill of all.slice(0, 8)) {
    console.log(
      `  #${skill.skillId.toString().padStart(2)} | ${skill.tier.padEnd(5)} | ${skill.name.padEnd(28)} score=${skill.averageScore} jobs=${skill.totalJobs}`,
    );
  }

  const byreal = await client.listSkills({ search: "byreal" });
  console.log(`\nByreal skills only: ${byreal.length}`);
}

async function signPaymentWithoutSubmitting() {
  console.log("\n[2] Building + signing a payment authorization (does NOT broadcast)\n");

  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);

  const client = new LedgerForgeClient({ privateKey });
  console.log(`Signer:  ${account.address}`);

  const skill = await client.getSkill(11); // mantle-tvl-monitor
  console.log(`Target:  #${skill.skillId} ${skill.name}`);

  const challenge = await client.getPaymentChallenge(skill.skillId, {
    resource: skill.endpoint,
    amount: "200000", // 0.2 USDC units
  });
  console.log(`Challenge: payTo=${challenge.payTo} asset=${challenge.asset} amount=${challenge.maxAmountRequired}`);

  const proof = await client.signPayment(challenge, { recipient: skill.owner });
  console.log(`Signed:  ${proof.payload.signature.slice(0, 18)}... (length ${proof.payload.signature.length})`);
  console.log(`Auth:    skillId=${proof.payload.authorization.skillId} nonce=${proof.payload.authorization.nonce}`);
}

async function invokeIfFunded() {
  const fundedKey = process.env.WALLET_PRIVATE_KEY as `0x${string}` | undefined;
  if (!fundedKey) {
    console.log(
      "\n[3] Full invoke() skipped — set WALLET_PRIVATE_KEY=0x... to a Mantle wallet with USDC to run it.",
    );
    return;
  }

  console.log("\n[3] Running full invoke() — pays for a skill end-to-end\n");
  const client = new LedgerForgeClient({ privateKey: fundedKey });
  console.log(`Signer:  ${client.address}`);

  // Pre-flight: confirm balance + allowance, approve if needed
  const balance = await client.getBalance("USDC");
  const allowance = await client.getAllowance("USDC");
  console.log(`Balance: ${formatTokenAmount(balance)} USDC`);
  console.log(`Allowance to operator: ${formatUnits(allowance, 6)} USDC`);

  const minRequired = 1_000_000n; // 1 USDC
  if (balance < minRequired) {
    console.log(`\n  ✗ Wallet needs at least ${formatUnits(minRequired, 6)} USDC on Mantle. Skipping.`);
    return;
  }

  if (allowance < minRequired) {
    console.log("\n  → Allowance too low. Approving operator (one-time setup)...");
    const approval = await client.approveOperator("USDC");
    console.log(`  ✓ Approved: ${approval.explorerUrl}`);
  }

  const result = await client.invoke<{ data: unknown }>(11, {
    amount: "200000", // 0.2 USDC
  });

  console.log(`\nSkill:   #${result.skillId} ${result.skillName}`);
  console.log(`Tx:      ${result.receipt.explorerUrl}`);
  console.log(`Token:   ${result.receipt.accessToken}`);
  console.log(`Output:  ${JSON.stringify(result.output).slice(0, 240)}...`);
}

async function main() {
  await discover();
  await signPaymentWithoutSubmitting();
  await invokeIfFunded();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("\nQuickstart failed:");
  console.error(err);
  process.exitCode = 1;
});
