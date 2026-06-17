import express from "express";
import cors from "cors";
import helmet from "helmet";
import { decodeEventLog } from "viem";
import { verifyPaymentProof } from "./verifier.js";
import { settlePayment, scoreJob } from "./settler.js";
import { PORT, getOperatorWalletClient, publicClient, SKILL_REGISTRY_ADDRESS, PROVIDER_ADDRESS } from "./config.js";
import type { FacilitateRequest, FacilitateResponse } from "./types.js";

const REGISTER_SKILL_ABI = [
  {
    name: "registerSkill",
    type: "function",
    inputs: [
      { name: "name",            type: "string"  },
      { name: "version",         type: "string"  },
      { name: "endpoint",        type: "string"  },
      { name: "pricePerCallBps", type: "uint256" },
      { name: "requiresEscrow",  type: "bool"    },
      { name: "metadataURI",     type: "string"  },
    ],
    outputs: [{ name: "skillId", type: "uint256" }],
  },
  {
    type: "event",
    name: "SkillRegistered",
    inputs: [
      { name: "skillId",        type: "uint256", indexed: true  },
      { name: "owner",          type: "address", indexed: true  },
      { name: "name",           type: "string",  indexed: false },
      { name: "version",        type: "string",  indexed: false },
      { name: "erc8004AgentId", type: "uint256", indexed: false },
      { name: "timestamp",      type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
] as const;

const BAZAAR_LIST_ABI = [
  {
    type: "function",
    name: "list",
    inputs: [
      { name: "skillId", type: "uint256" },
      { name: "tier",    type: "uint8"   },
    ],
    outputs: [],
  },
] as const;

const TIER_UINT8: Record<string, number> = { PRO: 0, BASIC: 1, FREE: 2 };

const app = express();
app.use(express.json());
app.use(cors());
app.use(helmet());

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    network: "mantle",
    chainId: 5000,
    version: "1.0.0",
  });
});

app.get("/payment-details", (req, res) => {
  const { resource, skillId, amount, asset } = req.query;

  res.json({
    scheme: "exact",
    network: "eip155:5000",
    maxAmountRequired: amount ?? "1000000",
    resource: resource ?? "",
    description: "LedgerForge x402 payment on Mantle",
    mimeType: "application/json",
    payTo: PROVIDER_ADDRESS || process.env.OPERATOR_ADDRESS || "",
    maxTimeoutSeconds: 60,
    asset: asset ?? process.env.USDC_ADDRESS,
    skillId: parseInt((skillId as string) ?? "0"),
    extra: { name: "LedgerForge", version: "1.0.0" },
  });
});

app.post("/facilitate", async (req, res) => {
  const body = req.body as FacilitateRequest;

  if (!body.paymentDetails || !body.paymentProof) {
    res.status(400).json({
      success: false,
      error: "Missing paymentDetails or paymentProof",
    } as FacilitateResponse);
    return;
  }

  try {
    const { valid, error } = await verifyPaymentProof(
      body.paymentDetails,
      body.paymentProof
    );

    if (!valid) {
      res.status(402).json({ success: false, error } as FacilitateResponse);
      return;
    }

    const result = await settlePayment(body.paymentDetails, body.paymentProof);

    console.log(
      `settled job=${result.escrowJobId} skill=${body.paymentDetails.skillId} tx=${result.settlementTxHash}`
    );

    res.json({
      success: true,
      settlementTxHash: result.settlementTxHash,
      accessToken: `settled:${result.settlementTxHash}:${Date.now()}`,
      escrowJobId: result.escrowJobId,
      pullTxHash: result.pullTxHash,
      createJobTxHash: result.createJobTxHash,
      completeJobTxHash: result.completeJobTxHash,
      skillRegistryRepTxHash: result.skillRegistryRepTxHash,
      erc8004FeedbackTxHash: result.erc8004FeedbackTxHash,
      reputationScore: result.reputationScore,
    } as FacilitateResponse);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("settlement error:", message);
    res.status(500).json({ success: false, error: message } as FacilitateResponse);
  }
});

app.post("/score", async (req, res) => {
  const { skillId, score } = req.body as { skillId?: unknown; score?: unknown };
  const id = Number(skillId);
  const s = Number(score);
  if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(s)) {
    res.status(400).json({ error: "skillId (positive int) and score (0-100) are required" });
    return;
  }
  try {
    const result = await scoreJob(id, s);
    console.log(`/score skill=${id} score=${s}`);
    res.json({ success: true, ...result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("score error:", message);
    res.status(500).json({ error: message });
  }
});

app.post("/register", async (req, res) => {
  const { name, version, endpoint, price, escrow, metadataUri, tier } = req.body as {
    name?: string; version?: string; endpoint?: string;
    price?: string; escrow?: boolean; metadataUri?: string; tier?: string;
  };

  if (!name || !version || !endpoint) {
    res.status(400).json({ error: "name, version, and endpoint are required" });
    return;
  }
  if (!SKILL_REGISTRY_ADDRESS) {
    res.status(503).json({ error: "SKILL_REGISTRY_ADDRESS not configured on facilitator" });
    return;
  }

  const priceUnits = BigInt(Math.round(parseFloat(price ?? "0") * 1_000_000));
  const tierUint8 = TIER_UINT8[tier ?? "FREE"] ?? 2;

  try {
    const walletClient = getOperatorWalletClient();

    const txHash = await walletClient.writeContract({
      address: SKILL_REGISTRY_ADDRESS,
      abi: REGISTER_SKILL_ABI,
      functionName: "registerSkill",
      args: [name, version, endpoint, priceUnits, !!escrow, metadataUri ?? ""],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    let skillId = "0";
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== SKILL_REGISTRY_ADDRESS.toLowerCase()) continue;
      try {
        const decoded = decodeEventLog({ abi: REGISTER_SKILL_ABI, data: log.data, topics: log.topics });
        if (decoded.eventName === "SkillRegistered") {
          skillId = String((decoded.args as unknown as { skillId: bigint }).skillId);
          break;
        }
      } catch { /* skip unparseable logs */ }
    }

    const bazaarAddress = process.env.BAZAAR_LISTINGS_ADDRESS as `0x${string}` | undefined;
    if (bazaarAddress && tierUint8 < 2 && skillId !== "0") {
      try {
        const listTx = await walletClient.writeContract({
          address: bazaarAddress,
          abi: BAZAAR_LIST_ABI,
          functionName: "list",
          args: [BigInt(skillId), tierUint8],
        });
        await publicClient.waitForTransactionReceipt({ hash: listTx });
      } catch (err) {
        console.warn("bazaar listing failed:", err);
      }
    }

    console.log(`registered skill=${name} id=${skillId} tx=${txHash}`);
    res.json({ skillId, txHash });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("registration error:", message);
    res.status(500).json({ error: message });
  }
});

app.listen(PORT, () => {
  console.log(`facilitator listening on ${PORT}`);
  console.log("network: Mantle mainnet (chainId 5000)");
  console.log(`health: http://localhost:${PORT}/health`);
});

export default app;
