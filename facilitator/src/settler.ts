import { decodeEventLog, maxUint256, type Hex } from "viem";
import {
  getOperatorWalletClient,
  publicClient,
  SKILL_REGISTRY_ADDRESS,
  X402_ESCROW_ADDRESS,
  FACILITATOR_FEE_BPS,
  ERC8004_REPUTATION_ADDRESS,
  PROVIDER_ADDRESS,
  enqueueWrite,
} from "./config.js";
import type { X402PaymentDetails, X402PaymentProof, SettlementResult } from "./types.js";
import { usedNonces } from "./verifier.js";

const ERC20_ABI = [
  {
    name: "transferFrom", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "allowance", type: "function", stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "approve", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const X402_ESCROW_ABI = [
  {
    name: "createJob", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "provider",          type: "address" },
      { name: "token",             type: "address" },
      { name: "amount",            type: "uint256" },
      { name: "skillId",           type: "uint256" },
      { name: "jobSpecURI",        type: "string"  },
      { name: "facilitatorFeeBps", type: "uint256" },
    ],
    outputs: [{ name: "jobId", type: "uint256" }],
  },
  {
    name: "completeJob", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "event", name: "JobCreated", anonymous: false,
    inputs: [
      { name: "jobId",    type: "uint256", indexed: true  },
      { name: "consumer", type: "address", indexed: true  },
      { name: "provider", type: "address", indexed: true  },
      { name: "skillId",  type: "uint256", indexed: false },
      { name: "amount",   type: "uint256", indexed: false },
      { name: "token",    type: "address", indexed: false },
    ],
  },
  {
    type: "event", name: "JobCompleted", anonymous: false,
    inputs: [
      { name: "jobId",          type: "uint256", indexed: true  },
      { name: "paidToProvider", type: "uint256", indexed: false },
      { name: "fee",            type: "uint256", indexed: false },
    ],
  },
] as const;

const SKILL_REGISTRY_ABI = [
  {
    name: "recordJobCompletion", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "skillId",         type: "uint256" },
      { name: "reputationScore", type: "uint8"   },
    ],
    outputs: [],
  },
] as const;

const ERC8004_REPUTATION_ABI = [
  {
    name: "giveFeedback", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "agentId",     type: "uint256" },
      { name: "scoreScaled", type: "int128"  },
      { name: "decimals",    type: "uint8"   },
      { name: "tag1",        type: "string"  },
      { name: "tag2",        type: "string"  },
      { name: "fileuri",     type: "string"  },
      { name: "filehash",    type: "string"  },
      { name: "extra",       type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

const ZERO_BYTES32: Hex = "0x0000000000000000000000000000000000000000000000000000000000000000";

export function settlePayment(
  _details: X402PaymentDetails,
  proof: X402PaymentProof
): Promise<SettlementResult> {
  return enqueueWrite(() => _settlePayment(_details, proof));
}

async function _settlePayment(
  _details: X402PaymentDetails,
  proof: X402PaymentProof
): Promise<SettlementResult> {
  const walletClient = getOperatorWalletClient();
  const operator = walletClient.account.address;
  const auth = proof.payload.authorization;
  const totalAmount = BigInt(auth.amount);
  // contract rejects provider==caller
  const rawProvider = auth.to as `0x${string}`;
  const provider: `0x${string}` =
    rawProvider.toLowerCase() === operator.toLowerCase() && PROVIDER_ADDRESS
      ? PROVIDER_ADDRESS
      : rawProvider;

  if (!X402_ESCROW_ADDRESS) {
    throw new Error("X402_ESCROW_ADDRESS not configured; cannot settle via escrow");
  }

  const pullTx = await walletClient.writeContract({
    address: auth.token,
    abi: ERC20_ABI,
    functionName: "transferFrom",
    args: [auth.from, operator, totalAmount],
  });
  await publicClient.waitForTransactionReceipt({ hash: pullTx });
  console.log(`pulled ${totalAmount} tx=${pullTx}`);

  const allowance = await publicClient.readContract({
    address: auth.token,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [operator, X402_ESCROW_ADDRESS],
  });
  if (allowance < totalAmount) {
    const approveTx = await walletClient.writeContract({
      address: auth.token,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [X402_ESCROW_ADDRESS, maxUint256],
    });
    await publicClient.waitForTransactionReceipt({ hash: approveTx });
    console.log(`approved escrow token=${auth.token} tx=${approveTx}`);
  }

  // keep the real consumer available to the indexer
  const jobSpecURI = `x402://skill/${auth.skillId}/consumer/${auth.from.toLowerCase()}/nonce/${auth.nonce}`;
  const createJobTx = await walletClient.writeContract({
    address: X402_ESCROW_ADDRESS,
    abi: X402_ESCROW_ABI,
    functionName: "createJob",
    args: [
      provider,
      auth.token,
      totalAmount,
      BigInt(auth.skillId),
      jobSpecURI,
      BigInt(FACILITATOR_FEE_BPS),
    ],
  });
  const createReceipt = await publicClient.waitForTransactionReceipt({ hash: createJobTx });

  let escrowJobId = 0n;
  for (const log of createReceipt.logs) {
    if (log.address.toLowerCase() !== X402_ESCROW_ADDRESS.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({ abi: X402_ESCROW_ABI, data: log.data, topics: log.topics });
      if (decoded.eventName === "JobCreated") {
        escrowJobId = (decoded.args as unknown as { jobId: bigint }).jobId;
        break;
      }
    } catch {
      /* skip unparseable */
    }
  }
  if (escrowJobId === 0n) {
    throw new Error(`createJob succeeded but JobCreated event not found in tx ${createJobTx}`);
  }
  console.log(`escrow job=${escrowJobId} tx=${createJobTx}`);

  const completeTx = await walletClient.writeContract({
    address: X402_ESCROW_ADDRESS,
    abi: X402_ESCROW_ABI,
    functionName: "completeJob",
    args: [escrowJobId],
  });
  await publicClient.waitForTransactionReceipt({ hash: completeTx });
  console.log(`complete job=${escrowJobId} tx=${completeTx}`);

  const nonceKey = `${auth.from.toLowerCase()}:${auth.nonce}`;
  usedNonces.set(nonceKey, Number(auth.validBefore));

  const score =
    proof.reputationScore !== undefined
      ? Math.max(0, Math.min(100, Math.round(proof.reputationScore)))
      : 75;
  let skillRegistryRepTx: Hex | undefined;
  if (SKILL_REGISTRY_ADDRESS && auth.skillId) {
    try {
      skillRegistryRepTx = await walletClient.writeContract({
        address: SKILL_REGISTRY_ADDRESS,
        abi: SKILL_REGISTRY_ABI,
        functionName: "recordJobCompletion",
        args: [BigInt(auth.skillId), score],
      });
      await publicClient.waitForTransactionReceipt({ hash: skillRegistryRepTx });
      console.log(`rep write skill=${auth.skillId} score=${score} tx=${skillRegistryRepTx}`);
    } catch (err) {
      console.warn("rep write failed:", err);
    }
  }

  let erc8004Tx: Hex | undefined;
  if (ERC8004_REPUTATION_ADDRESS && auth.skillId) {
    try {
      erc8004Tx = await walletClient.writeContract({
        address: ERC8004_REPUTATION_ADDRESS,
        abi: ERC8004_REPUTATION_ABI,
        functionName: "giveFeedback",
        args: [
          BigInt(auth.skillId),
          BigInt(score),
          0,
          "ledgerforge",
          "x402-settle",
          "",
          "",
          ZERO_BYTES32,
        ],
      });
      await publicClient.waitForTransactionReceipt({ hash: erc8004Tx });
      console.log(`erc8004 feedback skill=${auth.skillId} score=${score} tx=${erc8004Tx}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`erc8004 feedback failed: ${msg.slice(0, 200)}`);
    }
  }

  return {
    settlementTxHash: completeTx,
    pullTxHash: pullTx,
    createJobTxHash: createJobTx,
    completeJobTxHash: completeTx,
    escrowJobId: escrowJobId.toString(),
    skillRegistryRepTxHash: skillRegistryRepTx,
    erc8004FeedbackTxHash: erc8004Tx,
    reputationScore: score,
  };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function isNonceError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("nonce") || msg.includes("underpriced") || msg.includes("replacement");
}

/** Called after a skill execution to write the output-derived score on-chain. */
export function scoreJob(
  skillId: number,
  score: number,
): Promise<{ skillRegistryRepTxHash?: Hex; erc8004FeedbackTxHash?: Hex }> {
  return enqueueWrite(() => _scoreJob(skillId, score));
}

async function _scoreJob(
  skillId: number,
  score: number,
): Promise<{ skillRegistryRepTxHash?: Hex; erc8004FeedbackTxHash?: Hex }> {
  const walletClient = getOperatorWalletClient();
  const clamped = Math.max(0, Math.min(100, Math.round(score)));

  let skillRegistryRepTx: Hex | undefined;
  if (SKILL_REGISTRY_ADDRESS && skillId) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        skillRegistryRepTx = await walletClient.writeContract({
          address: SKILL_REGISTRY_ADDRESS,
          abi: SKILL_REGISTRY_ABI,
          functionName: "recordJobCompletion",
          args: [BigInt(skillId), clamped],
        });
        await publicClient.waitForTransactionReceipt({ hash: skillRegistryRepTx });
        console.log(`score update skill=${skillId} score=${clamped} tx=${skillRegistryRepTx}`);
        break;
      } catch (err) {
        if (isNonceError(err) && attempt < 2) {
          await sleep(2000 * (attempt + 1));
          continue;
        }
        console.warn("scoreJob recordJobCompletion failed:", err instanceof Error ? err.message.slice(0, 120) : err);
        break;
      }
    }
  }

  let erc8004Tx: Hex | undefined;
  if (ERC8004_REPUTATION_ADDRESS && skillId) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        erc8004Tx = await walletClient.writeContract({
          address: ERC8004_REPUTATION_ADDRESS,
          abi: ERC8004_REPUTATION_ABI,
          functionName: "giveFeedback",
          args: [BigInt(skillId), BigInt(clamped), 0, "ledgerforge", "x402-score", "", "", ZERO_BYTES32],
        });
        await publicClient.waitForTransactionReceipt({ hash: erc8004Tx });
        console.log(`score erc8004 skill=${skillId} score=${clamped} tx=${erc8004Tx}`);
        break;
      } catch (err) {
        if (isNonceError(err) && attempt < 2) {
          await sleep(2000 * (attempt + 1));
          continue;
        }
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`scoreJob giveFeedback failed: ${msg.slice(0, 120)}`);
        break;
      }
    }
  }

  return { skillRegistryRepTxHash: skillRegistryRepTx, erc8004FeedbackTxHash: erc8004Tx };
}
