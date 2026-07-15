import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { computeExpenseReport, computeRevenueReport, computeRunway, exportStatement } from "@constellation/indexer";
import {
  KyaMockService,
  TreasuryMockService,
  challengeMessage,
  mockAgentReports,
  walletGas,
  walletLabels,
  walletTransfers,
  walletWithHistory,
} from "../src/index.js";

const OWNER = privateKeyToAccount(
  "0x0000000000000000000000000000000000000000000000000000000000000001",
);

describe("golden wallet fixture", () => {
  const period = {
    from: "2026-06-15T00:00:00.000Z",
    to: "2026-07-15T23:59:59.999Z",
  };

  it("keeps the handoff numbers internally consistent", () => {
    const revenue = computeRevenueReport([...walletTransfers], period, walletLabels);
    const expense = computeExpenseReport([...walletTransfers], [...walletGas], period, walletLabels);
    const runway = computeRunway(walletWithHistory.okb_balance.amount, [...walletGas], new Date("2026-07-15T12:00:00.000Z"));
    const statement = exportStatement([...walletTransfers], [...walletGas], period, "csv");

    expect(revenue.tx_count).toBe(8);
    expect(revenue.totals).toEqual([{ token: "USDT", amount: "18400000", decimals: 6 }]);
    expect(revenue.by_counterparty[0]?.total.amount).toBe("6100000");
    expect(new Set(revenue.by_counterparty.map((item) => item.address)).size).toBe(6);
    expect(expense.totals).toEqual([{ token: "USDT", amount: "5100000", decimals: 6 }]);
    expect(expense.gas).toEqual({
      token: "OKB",
      amount: "217000000000000000",
      decimals: 18,
      tx_count: 7,
    });
    expect(runway.avg_daily_gas_7d.amount).toBe("31000000000000000");
    expect(runway.runway_days).toBe(13.3);
    expect(statement.row_count).toBe(18);
  });

  it("mirrors the EIP-191 challenge flow for the seeded wallet", async () => {
    const treasury = new TreasuryMockService(walletWithHistory, () => Date.parse("2026-07-15T12:00:00.000Z"));
    const challenge = await treasury.register_wallet({ address: walletWithHistory.address });
    if (!("challenge" in challenge)) throw new Error("expected challenge response");
    expect(challenge.challenge.message).toBe(
      challengeMessage(walletWithHistory.address, challenge.challenge.nonce),
    );
    const signature = await OWNER.signMessage({ message: challenge.challenge.message });
    const ok = await treasury.register_wallet({
      address: walletWithHistory.address,
      nonce: challenge.challenge.nonce,
      signature,
    });
    expect(ok).toEqual({
      ok: true,
      wallet_id: walletWithHistory.wallet_id,
      indexed_from_block: walletWithHistory.indexed_from_block,
    });
  });
});

describe("golden KYA fixtures", () => {
  it("preserves the required flags and score thresholds", async () => {
    expect(mockAgentReports.agent_good.score).toBe(85);
    expect(mockAgentReports.agent_good.flags).toEqual([]);
    expect(mockAgentReports.agent_transferred_identity.flags).toContain(
      "IDENTITY_TRANSFERRED_RECENTLY",
    );
    expect(
      mockAgentReports.agent_transferred_identity.components.identity_continuity.evidence
        .feedback_before_last_transfer,
    ).toBe(31);
    expect(mockAgentReports.agent_sybil_burst.score).toBeLessThan(50);
    expect(
      mockAgentReports.agent_sybil_burst.components.feedback_graph.evidence.top3_reviewer_share,
    ).toBeGreaterThan(0.6);
    expect(
      mockAgentReports.agent_sybil_burst.components.feedback_graph.evidence.max_share_72h_window,
    ).toBeGreaterThan(0.5);
  });

  it("supports both attestation shapes", async () => {
    const available = new KyaMockService("available");
    const roadmap = new KyaMockService("roadmap");
    const agentRef = { kind: "erc8004", chain: "eip155:8453", registry: mockAgentReports.agent_good.registrations[0]!.registry, agent_id: 42 } as const;

    const withZk = await available.attest_agent({ agent_ref: agentRef });
    const withoutZk = await roadmap.attest_agent({ agent_ref: agentRef });

    expect(withZk.zk.available).toBe(true);
    expect(withoutZk.zk).toEqual({ available: false, reason: "roadmap" });
  });
});
