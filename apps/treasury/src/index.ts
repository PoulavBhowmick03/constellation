import "dotenv/config";
import {
  XLAYER_CHAIN_ID,
  consumeNonce,
  getGas,
  getLabels,
  getLatestOkbBalance,
  getSettlement,
  getTransfers,
  getWalletById,
  issueNonce,
  registerWallet,
  reserveSettlement,
  updateSettlement,
} from "@constellation/indexer";
import { createPaymentAdapter } from "@constellation/payment-adapter";
import { createHandlers } from "./handlers.js";
import { PRICES } from "./prices.js";
import { createApp } from "./server.js";

const PORT = Number(process.env.TREASURY_PORT ?? 7801);
const NONCE_TTL = Number(process.env.REGISTER_NONCE_TTL_SECONDS ?? 600);
const START_BLOCK = Number(process.env.INDEXER_START_BLOCK ?? 0);

const deps = {
  ledger: {
    registerWallet,
    getWalletById,
    getTransfers,
    getGas,
    getLatestOkbBalance,
    getLabels,
    issueNonce,
    consumeNonce,
  },
  payments: createPaymentAdapter({
    prices: PRICES,
    // Durable settlement store (Postgres): cross-machine idempotency + timeout
    // recovery + crash-safe delivery for sdk mode. Ignored in mock mode.
    settlementStore: {
      reserve: reserveSettlement,
      update: updateSettlement,
      get: getSettlement,
    },
  }),
  chainId: XLAYER_CHAIN_ID,
  startBlock: START_BLOCK,
  nonceTtlSeconds: NONCE_TTL,
};

createApp(deps).listen(PORT, () => {
  console.log(
    `[treasury] Treasury Copilot MCP on :${PORT}/mcp (payment mode: ${process.env.PAYMENT_MODE ?? "mock"})`,
  );
});
