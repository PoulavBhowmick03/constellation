import { describe, expect, it } from "vitest";
import {
  computeExpenseReport,
  computeRevenueReport,
  computeRunway,
  exportStatement,
} from "../src/ledger.js";
import type { GasRow, TransferRow } from "../src/types.js";

const WALLET = "w_test";
const CP = {
  A: "0xAAAa000000000000000000000000000000000001",
  B: "0xBBBb000000000000000000000000000000000002",
  C: "0xCCCc000000000000000000000000000000000003",
  D: "0xDDDd000000000000000000000000000000000004",
  E: "0xEEEe000000000000000000000000000000000005",
  F: "0xFFFf000000000000000000000000000000000006",
  G: "0x1111000000000000000000000000000000000007",
  H: "0x2222000000000000000000000000000000000008",
};

let seq = 0;
function transfer(
  direction: "in" | "out",
  counterparty: string,
  amount: string,
  token: "USDT" | "USDG",
  blockTime: string,
): TransferRow {
  seq += 1;
  return {
    walletId: WALLET,
    txHash: `0xtx${seq.toString().padStart(4, "0")}`,
    logIndex: 0,
    blockNumber: 1000 + seq,
    blockTime,
    token,
    tokenAddress: token === "USDT" ? "0xusdt" : "0xusdg",
    decimals: 6,
    from: direction === "in" ? counterparty : "0xself",
    to: direction === "in" ? "0xself" : counterparty,
    amount,
    direction,
    counterparty,
  };
}

// 30-day window ending 2026-07-15. Inflows from 6 counterparties (A..F) in USDT,
// plus one USDG inflow from A, matching the `wallet_with_history` fixture shape.
const T = "2026-07-01T12:00:00Z";
const transfers: TransferRow[] = [
  transfer("in", CP.A, "1000000", "USDT", T), // 1.00
  transfer("in", CP.A, "2000000", "USDT", T), // 2.00  (A total USDT = 3.00, 2 txs)
  transfer("in", CP.B, "5000000", "USDT", T), // 5.00
  transfer("in", CP.C, "500000", "USDT", T), // 0.50
  transfer("in", CP.D, "4000000", "USDT", T), // 4.00
  transfer("in", CP.E, "1500000", "USDT", T), // 1.50
  transfer("in", CP.F, "2500000", "USDT", T), // 2.50
  transfer("in", CP.A, "1000000", "USDG", T), // 1.00 USDG
  transfer("out", CP.G, "1000000", "USDT", T), // expense 1.00
  transfer("out", CP.H, "250000", "USDT", T), // expense 0.25
];

// Gas: 7 txs inside the trailing-7-day window (each 0.031 OKB) + 1 older tx.
const GAS_31 = "31000000000000000"; // 0.031 OKB in wei
const gas: GasRow[] = [
  ...["2026-07-09", "2026-07-10", "2026-07-11", "2026-07-12", "2026-07-13", "2026-07-14", "2026-07-15"].map(
    (d, i) => ({
      walletId: WALLET,
      txHash: `0xgas${i}`,
      blockNumber: 2000 + i,
      blockTime: `${d}T00:00:00Z`,
      gasUsed: "31000000000",
      gasPrice: "1000000",
      gasCost: GAS_31,
    }),
  ),
  {
    walletId: WALLET,
    txHash: "0xgasold",
    blockNumber: 1999,
    blockTime: "2026-06-01T00:00:00Z",
    gasUsed: "9000000000",
    gasPrice: "1000000",
    gasCost: "9000000000000000", // 0.009 OKB, outside the 7d runway window
  },
];

const PERIOD = { from: "2026-06-01T00:00:00Z", to: "2026-07-16T00:00:00Z" };

describe("computeRevenueReport", () => {
  const r = computeRevenueReport(transfers, PERIOD);

  it("sums inflow totals per token", () => {
    expect(r.totals).toEqual([
      { token: "USDG", amount: "1000000", decimals: 6 },
      { token: "USDT", amount: "16500000", decimals: 6 }, // 3+5+0.5+4+1.5+2.5
    ]);
  });

  it("counts every inflow transfer", () => {
    expect(r.tx_count).toBe(8);
  });

  it("groups by (counterparty, token), largest first", () => {
    expect(r.by_counterparty[0]).toMatchObject({
      address: CP.B,
      total: { token: "USDT", amount: "5000000", decimals: 6 },
      tx_count: 1,
    });
    const aUsdt = r.by_counterparty.find(
      (c) => c.address === CP.A && c.total.token === "USDT",
    );
    expect(aUsdt?.total.amount).toBe("3000000");
    expect(aUsdt?.tx_count).toBe(2);
    expect(aUsdt?.tx_refs).toHaveLength(2);
  });

  it("attaches labels when present", () => {
    const labelled = computeRevenueReport(
      transfers,
      PERIOD,
      new Map([[CP.B.toLowerCase(), "Acme Corp"]]),
    );
    const b = labelled.by_counterparty.find((c) => c.address === CP.B);
    expect(b?.label).toBe("Acme Corp");
  });
});

describe("computeExpenseReport", () => {
  const e = computeExpenseReport(transfers, gas, PERIOD);

  it("sums outflows and gas", () => {
    expect(e.totals).toEqual([{ token: "USDT", amount: "1250000", decimals: 6 }]);
    // 7 * 0.031 + 0.009 = 0.226 OKB
    expect(e.gas).toEqual({
      token: "OKB",
      amount: "226000000000000000",
      decimals: 18,
      tx_count: 8,
    });
  });
});

describe("computeRunway", () => {
  it("computes avg daily gas over the trailing 7d and a runway estimate", () => {
    const r = computeRunway("412000000000000000", gas, new Date("2026-07-15T12:00:00Z"));
    // 7 * 0.031 = 0.217 OKB; /7 = 0.031 OKB/day exactly (old tx excluded).
    expect(r.avg_daily_gas_7d.amount).toBe("31000000000000000");
    expect(r.okb_balance.amount).toBe("412000000000000000");
    expect(r.runway_days).toBeCloseTo(13.3, 1);
  });

  it("returns null runway when there is no gas history", () => {
    const r = computeRunway("412000000000000000", [], new Date("2026-07-15T12:00:00Z"));
    expect(r.avg_daily_gas_7d.amount).toBe("0");
    expect(r.runway_days).toBeNull();
  });
});

describe("exportStatement", () => {
  it("produces csv/json/md with a consistent row count", () => {
    const csv = exportStatement(transfers, gas, PERIOD, "csv");
    const json = exportStatement(transfers, gas, PERIOD, "json");
    const md = exportStatement(transfers, gas, PERIOD, "md");
    // 8 inflows + 2 outflows + 8 gas rows in period = 18
    expect(csv.row_count).toBe(18);
    expect(json.row_count).toBe(18);
    expect(md.row_count).toBe(18);
    expect(csv.content.split("\n")).toHaveLength(19); // header + 18
    expect(JSON.parse(json.content)).toHaveLength(18);
    expect(md.content).toContain("| kind | time |");
  });
});
