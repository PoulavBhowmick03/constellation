import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import type { GasRow, TransferRow } from "@constellation/indexer";
import { MOCK_PAYMENT_HEADER, MockPaymentAdapter } from "@constellation/payment-adapter";
import {
  createHandlers,
  isToolError,
  type RegisterChallenge,
  type RegisterOk,
} from "../src/handlers.js";
import { PRICES } from "../src/prices.js";
import { MemoryLedger } from "./memory.js";

const OWNER = privateKeyToAccount(
  "0x0000000000000000000000000000000000000000000000000000000000000001",
);
const STRANGER = privateKeyToAccount(
  "0x0000000000000000000000000000000000000000000000000000000000000002",
);

const PAID = { headers: { [MOCK_PAYMENT_HEADER]: "any" } };

function makeHandlers(opts: { clock?: () => number } = {}) {
  const clock = opts.clock ?? Date.now;
  const ledger = new MemoryLedger(clock);
  const handlers = createHandlers({
    ledger,
    payments: new MockPaymentAdapter({ prices: PRICES }),
    chainId: 196,
    startBlock: 0,
    nonceTtlSeconds: 600,
    now: () => new Date(clock()),
  });
  return { ledger, handlers };
}

/** Full happy-path registration; returns the wallet_id. */
async function register(handlers: ReturnType<typeof createHandlers>): Promise<string> {
  const challenge = (await handlers.register_wallet({
    address: OWNER.address,
  })) as RegisterChallenge;
  const signature = await OWNER.signMessage({ message: challenge.challenge.message });
  const done = (await handlers.register_wallet({
    address: OWNER.address,
    nonce: challenge.challenge.nonce,
    signature,
  })) as RegisterOk;
  expect(done.ok).toBe(true);
  return done.wallet_id;
}

function transfer(
  walletId: string,
  wallet: string,
  p: Partial<TransferRow> & { direction: "in" | "out"; counterparty: string; amount: string },
): TransferRow {
  return {
    walletId,
    txHash: p.txHash ?? `0x${p.counterparty.slice(2, 6)}${p.amount}`,
    logIndex: p.logIndex ?? 0,
    blockNumber: p.blockNumber ?? 1,
    blockTime: p.blockTime ?? "2026-07-10T00:00:00.000Z",
    token: p.token ?? "USDT",
    tokenAddress: p.tokenAddress ?? "0xtoken",
    decimals: p.decimals ?? 6,
    from: p.direction === "in" ? p.counterparty : wallet,
    to: p.direction === "in" ? wallet : p.counterparty,
    amount: p.amount,
    direction: p.direction,
    counterparty: p.counterparty,
  };
}

function gasRow(walletId: string, p: Partial<GasRow> & { gasCost: string }): GasRow {
  return {
    walletId,
    txHash: p.txHash ?? `0xgas${p.gasCost}`,
    blockNumber: p.blockNumber ?? 1,
    blockTime: p.blockTime ?? "2026-07-10T00:00:00.000Z",
    gasUsed: p.gasUsed ?? "21000",
    gasPrice: p.gasPrice ?? "1",
    gasCost: p.gasCost,
  };
}

describe("register_wallet (EIP-191 challenge flow)", () => {
  it("registers with a valid signature over the server challenge", async () => {
    const { handlers } = makeHandlers();
    const walletId = await register(handlers);
    expect(walletId).toMatch(/^w_/);
  });

  it("rejects a signature from the wrong key with BAD_SIGNATURE", async () => {
    const { handlers } = makeHandlers();
    const challenge = (await handlers.register_wallet({
      address: OWNER.address,
    })) as RegisterChallenge;
    const signature = await STRANGER.signMessage({ message: challenge.challenge.message });
    const res = await handlers.register_wallet({
      address: OWNER.address,
      nonce: challenge.challenge.nonce,
      signature,
    });
    expect(isToolError(res) && res.error.code).toBe("BAD_SIGNATURE");
  });

  it("burns the nonce on a failed attempt (retry gets NONCE_EXPIRED)", async () => {
    const { handlers } = makeHandlers();
    const challenge = (await handlers.register_wallet({
      address: OWNER.address,
    })) as RegisterChallenge;
    const bad = await STRANGER.signMessage({ message: challenge.challenge.message });
    await handlers.register_wallet({
      address: OWNER.address,
      nonce: challenge.challenge.nonce,
      signature: bad,
    });
    const good = await OWNER.signMessage({ message: challenge.challenge.message });
    const res = await handlers.register_wallet({
      address: OWNER.address,
      nonce: challenge.challenge.nonce,
      signature: good,
    });
    expect(isToolError(res) && res.error.code).toBe("NONCE_EXPIRED");
  });

  it("rejects an expired nonce (10-minute TTL)", async () => {
    let t = Date.parse("2026-07-15T00:00:00Z");
    const { handlers } = makeHandlers({ clock: () => t });
    const challenge = (await handlers.register_wallet({
      address: OWNER.address,
    })) as RegisterChallenge;
    const signature = await OWNER.signMessage({ message: challenge.challenge.message });
    t += 601_000; // one second past the TTL
    const res = await handlers.register_wallet({
      address: OWNER.address,
      nonce: challenge.challenge.nonce,
      signature,
    });
    expect(isToolError(res) && res.error.code).toBe("NONCE_EXPIRED");
  });

  it("rejects a malformed address with BAD_REQUEST", async () => {
    const { handlers } = makeHandlers();
    const res = await handlers.register_wallet({ address: "not-an-address" });
    expect(isToolError(res) && res.error.code).toBe("BAD_REQUEST");
  });
});

describe("payment gating (mock x402)", () => {
  it("refuses paid tools without payment, with price attached", async () => {
    const { handlers } = makeHandlers();
    const walletId = await register(handlers);
    for (const call of [
      () => handlers.get_revenue_report({ wallet_id: walletId, period: {} }),
      () => handlers.get_expense_report({ wallet_id: walletId, period: {} }),
      () => handlers.export_statement({ wallet_id: walletId, period: {}, format: "csv" }),
    ]) {
      const res = await call();
      expect(isToolError(res) && res.error.code).toBe("PAYMENT_REQUIRED");
    }
  });

  it("keeps free tools free", async () => {
    const { handlers } = makeHandlers();
    const walletId = await register(handlers);
    const res = await handlers.get_runway({ wallet_id: walletId });
    expect(isToolError(res)).toBe(false);
  });
});

describe("reports (money math)", () => {
  async function seeded() {
    const { handlers, ledger } = makeHandlers();
    const walletId = await register(handlers);
    const wallet = (await ledger.getWalletById(walletId))!.address;
    const A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const C = "0xcccccccccccccccccccccccccccccccccccccccc";
    ledger.transfers.push(
      transfer(walletId, wallet, { direction: "in", counterparty: A, amount: "6100000", txHash: "0xa1" }),
      transfer(walletId, wallet, { direction: "in", counterparty: A, amount: "2900000", txHash: "0xa2" }),
      transfer(walletId, wallet, { direction: "in", counterparty: B, amount: "9400000", txHash: "0xb1" }),
      transfer(walletId, wallet, { direction: "out", counterparty: C, amount: "1500000", txHash: "0xc1" }),
      // Outside the queried period: must not count.
      transfer(walletId, wallet, {
        direction: "in", counterparty: B, amount: "50000000",
        blockTime: "2026-06-01T00:00:00.000Z", txHash: "0xold",
      }),
    );
    ledger.gas.push(
      gasRow(walletId, { gasCost: "31000000000000000", txHash: "0xg1" }),
      gasRow(walletId, { gasCost: "9000000000000000", txHash: "0xg2" }),
    );
    ledger.labels.set(A, "Acme Agent Co");
    return { handlers, ledger, walletId, A, B, C };
  }
  const period = { from: "2026-07-01T00:00:00Z", to: "2026-07-14T00:00:00Z" };

  it("get_revenue_report sums inflows by counterparty with labels", async () => {
    const { handlers, walletId, A, B } = await seeded();
    const res = (await handlers.get_revenue_report({ wallet_id: walletId, period }, PAID)) as any;
    expect(res.tx_count).toBe(3);
    expect(res.totals).toEqual([{ token: "USDT", amount: "18400000", decimals: 6 }]);
    // Largest counterparty first: B (9.4) then A (9.0).
    expect(res.by_counterparty[0]).toMatchObject({ address: B, tx_count: 1 });
    expect(res.by_counterparty[0].total.amount).toBe("9400000");
    expect(res.by_counterparty[1]).toMatchObject({
      address: A, label: "Acme Agent Co", tx_count: 2,
    });
    expect(res.by_counterparty[1].total.amount).toBe("9000000");
  });

  it("get_expense_report includes outflows and total gas", async () => {
    const { handlers, walletId, C } = await seeded();
    const res = (await handlers.get_expense_report({ wallet_id: walletId, period }, PAID)) as any;
    expect(res.tx_count).toBe(1);
    expect(res.totals).toEqual([{ token: "USDT", amount: "1500000", decimals: 6 }]);
    expect(res.by_counterparty[0].address).toBe(C);
    expect(res.gas).toEqual({
      token: "OKB", amount: "40000000000000000", decimals: 18, tx_count: 2,
    });
  });

  it("export_statement csv includes every row in the period plus header", async () => {
    const { handlers, walletId } = await seeded();
    const res = (await handlers.export_statement(
      { wallet_id: walletId, period, format: "csv" },
      PAID,
    )) as any;
    // 4 transfers in period + 2 gas rows.
    expect(res.row_count).toBe(6);
    expect(res.format).toBe("csv");
    const lines = res.content.split("\n");
    expect(lines[0]).toBe("kind,time,tx,token,direction,amount,decimals,counterparty");
    expect(lines).toHaveLength(7);
  });

  it("returns WALLET_NOT_FOUND for an unregistered wallet_id on every tool", async () => {
    const { handlers } = makeHandlers();
    for (const call of [
      () => handlers.get_runway({ wallet_id: "w_nope" }),
      () => handlers.get_revenue_report({ wallet_id: "w_nope", period: {} }, PAID),
      () => handlers.get_expense_report({ wallet_id: "w_nope", period: {} }, PAID),
      () => handlers.export_statement({ wallet_id: "w_nope", period: {}, format: "md" }, PAID),
    ]) {
      const res = await call();
      expect(isToolError(res) && res.error.code).toBe("WALLET_NOT_FOUND");
    }
  });
});

describe("get_runway", () => {
  it("computes runway from balance and trailing-7d gas", async () => {
    const clockAt = Date.parse("2026-07-15T00:00:00Z");
    const { handlers, ledger } = makeHandlers({ clock: () => clockAt });
    const walletId = await register(handlers);
    ledger.balances.set(walletId, "7000000000000000000"); // 7 OKB
    // 0.7 OKB gas inside the window → avg daily 0.1 OKB → 70 days runway.
    ledger.gas.push(
      gasRow(walletId, { gasCost: "700000000000000000", blockTime: "2026-07-12T00:00:00.000Z" }),
      // Outside the 7d window: ignored.
      gasRow(walletId, {
        gasCost: "999000000000000000", blockTime: "2026-07-01T00:00:00.000Z", txHash: "0xgold",
      }),
    );
    const res = (await handlers.get_runway({ wallet_id: walletId })) as any;
    expect(res.okb_balance.amount).toBe("7000000000000000000");
    expect(res.avg_daily_gas_7d.amount).toBe("100000000000000000");
    expect(res.runway_days).toBe(70);
    expect(res.as_of).toBe("2026-07-15T00:00:00.000Z");
  });

  it("reports null runway and zero balance when nothing is indexed yet", async () => {
    const { handlers } = makeHandlers();
    const walletId = await register(handlers);
    const res = (await handlers.get_runway({ wallet_id: walletId })) as any;
    expect(res.okb_balance.amount).toBe("0");
    expect(res.runway_days).toBeNull();
  });
});
