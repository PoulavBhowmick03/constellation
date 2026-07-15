import { MOCK_PAYMENT_HEADER, MockPaymentAdapter } from "@constellation/payment-adapter";
import { KyaMockService, TreasuryMockService, walletWithHistory } from "@constellation/mocks";
import type { Statement } from "@constellation/indexer";

const kya = new KyaMockService("mixed");
const treasury = new TreasuryMockService();
const payments = new MockPaymentAdapter({
  prices: {},
  outboundMockCost: { token: "USDT", amount: "250000", decimals: 6 },
  now: () => Date.parse("2026-07-15T12:00:00.000Z"),
});

const vendors = [
  {
    name: "Good Vendor",
    agent_ref: {
      kind: "erc8004" as const,
      chain: "eip155:8453" as const,
      registry: "0x0000000000000000000000000000000000001f44" as const,
      agent_id: 42,
    },
  },
  {
    name: "Transferred Identity Vendor",
    agent_ref: {
      kind: "erc8004" as const,
      chain: "eip155:8453" as const,
      registry: "0x0000000000000000000000000000000000001f44" as const,
      agent_id: 43,
    },
  },
  {
    name: "Sybil Burst Vendor",
    agent_ref: {
      kind: "erc8004" as const,
      chain: "eip155:1" as const,
      registry: "0x0000000000000000000000000000000000001f44" as const,
      agent_id: 44,
    },
  },
];

function section(title: string) {
  console.log(`\n=== ${title} ===`);
}

function expectStatement(value: Statement | { readonly error: { readonly message: string } }): Statement {
  if ("error" in value) {
    throw new Error(value.error.message);
  }
  return value;
}

async function main() {
  section("Task");
  console.log("Prepare a treasury diligence memo for a new agent-tools budget.");

  section("Plan");
  console.log("plan -> source -> diligence -> procure -> qa -> assemble");

  section("KYA Verdicts");
  for (const vendor of vendors) {
    const report = await kya.check_agent({ agent_ref: vendor.agent_ref });
    console.log(
      `${vendor.name}: score=${report.score} flags=${report.flags.length === 0 ? "none" : report.flags.join(", ")}`,
    );
  }

  section("Procurement");
  const procurement = await payments.payAndCall(
    "mock://vendor/good",
    "deliver_memo",
    { task: "Prepare a treasury diligence memo", vendor: "Good Vendor" },
    { token: "USDT", amount: "500000", decimals: 6 },
  );
  if (!procurement.ok) {
    throw new Error(procurement.error.message);
  }
  console.log(
    `receipt=${procurement.receipt.id} tool=${procurement.receipt.tool} cost=${procurement.receipt.cost.amount}/${procurement.receipt.cost.decimals} ${procurement.receipt.cost.token}`,
  );

  section("Treasury");
  const runway = await treasury.get_runway({ wallet_id: walletWithHistory.wallet_id });
  const revenue = await treasury.get_revenue_report({
    wallet_id: walletWithHistory.wallet_id,
    period: { from: "2026-06-15T00:00:00.000Z", to: "2026-07-15T23:59:59.999Z" },
  });
  const statement = expectStatement(await treasury.export_statement({
    wallet_id: walletWithHistory.wallet_id,
    period: { from: "2026-06-15T00:00:00.000Z", to: "2026-07-15T23:59:59.999Z" },
    format: "md",
  }));
  console.log(`wallet_id=${walletWithHistory.wallet_id}`);
  console.log(`runway_days=${"runway_days" in runway ? runway.runway_days : "error"}`);
  console.log(`revenue_total=${"totals" in revenue ? revenue.totals[0]?.amount : "error"} USDT base units`);

  section("Payments");
  console.log(`inbound mock proof header: ${MOCK_PAYMENT_HEADER}: any`);
  console.log(`outbound receipt ref: ${procurement.receipt.id}`);

  section("Assembled Memo");
  console.log("Qualified vendor: Good Vendor");
  console.log("Rejected vendors: Transferred Identity Vendor, Sybil Burst Vendor");
  console.log("Treasury statement excerpt:");
  console.log(statement.content.split("\n").slice(0, 6).join("\n"));
}

void main();
