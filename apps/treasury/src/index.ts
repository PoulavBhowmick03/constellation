import "dotenv/config";
import {
  XLAYER_CHAIN_ID,
  consumeNonce,
  getGas,
  getLabels,
  getLatestOkbBalance,
  getPublicClient,
  getSettlement,
  putSettlementResult,
  getTransfers,
  getWalletById,
  issueNonce,
  registerWallet,
  reserveSettlement,
  scanAllWallets,
  updateSettlement,
} from "@constellation/indexer";
import {
  createPaidRouteMiddleware,
  createPaymentAdapter,
  loadOkxCredentialsFromEnv,
} from "@constellation/payment-adapter";
import { createHandlers } from "./handlers.js";
import { PRICES } from "./prices.js";
import { TOOL_DESCRIPTORS } from "./descriptors.js";
import { createApp } from "./server.js";

const PORT = Number(process.env.TREASURY_PORT ?? 7801);
const NONCE_TTL = Number(process.env.REGISTER_NONCE_TTL_SECONDS ?? 600);
const ENV_START_BLOCK = Number(process.env.INDEXER_START_BLOCK ?? 0);
// How far back a wallet with no explicit start block is indexed from. Bounded so
// a fresh registration never triggers a genesis-to-head scan on the 100-block
// getLogs cap (~650k calls). ~200k X Layer blocks ≈ a few days of history.
const REGISTER_LOOKBACK_BLOCKS = Number(process.env.INDEXER_REGISTER_LOOKBACK ?? 200000);
// Background scan cadence. 0 disables the in-process loop (rely on an external
// cron/`pnpm index` instead). Default off in tests, on in production wiring.
const SCAN_INTERVAL_MS = Number(process.env.INDEXER_SCAN_INTERVAL_MS ?? 0);

/**
 * Resolve the block a newly registered wallet is indexed from. An explicit
 * INDEXER_START_BLOCK wins; otherwise index recent history only (head minus the
 * lookback), computed once at boot. Falls back to 0 if the chain read fails so
 * registration never hard-crashes on a flaky RPC.
 */
async function resolveStartBlock(): Promise<number> {
  if (ENV_START_BLOCK > 0) return ENV_START_BLOCK;
  try {
    // Timeout-bound: startup must never hang on a slow/flaky RPC (fly-proxy
    // marks the app unreachable if listen() is delayed past its socket check).
    const timeout = new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error("head lookup timed out")), 8000),
    );
    const head = Number(await Promise.race([getPublicClient().getBlockNumber(), timeout]));
    return Math.max(0, head - REGISTER_LOOKBACK_BLOCKS);
  } catch (err) {
    console.warn(`[treasury] head lookup failed, indexing new wallets from 0: ${(err as Error).message}`);
    return 0;
  }
}

/**
 * Background wallet-indexing loop. Re-entrancy guarded so a scan slower than the
 * interval can never overlap itself. Scans are idempotent (upsert), so a missed
 * or repeated tick is harmless. Disabled when SCAN_INTERVAL_MS is 0.
 */
function startScanLoop(): void {
  if (SCAN_INTERVAL_MS <= 0) {
    console.log("[treasury] background scan loop disabled (INDEXER_SCAN_INTERVAL_MS=0)");
    return;
  }
  let running = false;
  const tick = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      await scanAllWallets();
    } catch (err) {
      console.error("[treasury] scan loop error:", (err as Error).message);
    } finally {
      running = false;
    }
  };
  console.log(`[treasury] background scan loop every ${SCAN_INTERVAL_MS}ms`);
  void tick(); // kick once at boot
  setInterval(() => void tick(), SCAN_INTERVAL_MS).unref();
}

/** Paid services exposed over plain HTTP, mirrored from the listing registration. */
const PAID_SERVICE_ROUTES = [
  ["revenue-report", "get_revenue_report"],
  ["expense-report", "get_expense_report"],
  ["export-statement", "export_statement"],
  ["spend-preflight", "spend_preflight"],
] as const;

async function main(): Promise<void> {
  const startBlock = await resolveStartBlock();
  const paymentMode = (process.env.PAYMENT_MODE ?? "mock").toLowerCase();
  const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL ?? `http://localhost:${PORT}`;
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
      descriptors: TOOL_DESCRIPTORS,
      // Durable settlement store (Postgres): cross-machine idempotency + timeout
      // recovery + crash-safe delivery for sdk mode. Ignored in mock mode.
      settlementStore: {
        reserve: reserveSettlement,
        update: updateSettlement,
        get: getSettlement,
        putResult: putSettlementResult,
      },
    }),
    chainId: XLAYER_CHAIN_ID,
    startBlock,
    nonceTtlSeconds: NONCE_TTL,
    // OKX listing review requires the paid surface to be served by their own
    // SDK, not an equivalent hand-rolled implementation. Only constructed in
    // sdk mode, where real credentials exist; mock mode keeps the legacy path.
    ...(paymentMode === "sdk"
      ? {
          paidRouteMiddleware: createPaidRouteMiddleware({
            credentials: loadOkxCredentialsFromEnv(),
            settlementStore: {
              reserve: reserveSettlement,
              update: updateSettlement,
              get: getSettlement,
              putResult: putSettlementResult,
            },
            unpaidBody: (tool: string) => ({
              error: {
                code: "PAYMENT_REQUIRED",
                message: `payment required for "${tool}" — replay as POST with the payment header and JSON body args`,
              },
            }),
            routes: PAID_SERVICE_ROUTES.map(([slug, tool]) => ({
              // Verb-less pattern: compiles to verb "*" in the SDK so GET, HEAD
              // and OPTIONS probes are protected too. The listing validator
              // probes with GET, and browsers must reach the SDK paywall.
              pattern: `/services/${slug}`,
              tool,
              price: PRICES[tool]!,
              resource: `${PUBLIC_BASE_URL}/services/${slug}`,
              descriptor: TOOL_DESCRIPTORS[tool],
            })),
          }),
        }
      : {}),
  };

  createApp(deps).listen(PORT, () => {
    console.log(
      `[treasury] Treasury Copilot MCP on :${PORT}/mcp (payment mode: ${process.env.PAYMENT_MODE ?? "mock"}, new-wallet start block: ${startBlock})`,
    );
  });

  startScanLoop();
}

void main();
