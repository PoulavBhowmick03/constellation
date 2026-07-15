import type { GasRow, TransferRow } from "@constellation/indexer";
import type {
  AgentRef,
  AttestationResult,
  KyaReport,
  MockAgentFixtureName,
  MockWalletFixture,
} from "./types.js";

function address(value: number): `0x${string}` {
  return `0x${value.toString(16).padStart(40, "0")}`;
}

export const MOCK_AS_OF = "2026-07-15T12:00:00.000Z";
export const MOCK_REGISTRY = address(8004);
export const MOCK_VERIFIER = address(9100);
export const MOCK_MODEL_COMMITMENT = `0x${"12".repeat(32)}` as const;
export const MOCK_PROOF = `0x${"34".repeat(32)}` as const;
export const MOCK_PUBLIC_INPUTS = ["62", "12", "44"] as const;

export const walletWithHistory: MockWalletFixture = {
  name: "wallet_with_history",
  address: "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf",
  wallet_id: "w_wallet_with_history",
  indexed_from_block: 123,
  okb_balance: { token: "OKB", amount: "412000000000000000", decimals: 18 },
};

const counterparties = {
  alpha: address(1001),
  beta: address(1002),
  gamma: address(1003),
  delta: address(1004),
  epsilon: address(1005),
  zeta: address(1006),
  infra: address(1101),
  data: address(1102),
  ops: address(1103),
} as const;

export const walletLabels = new Map<string, string>([
  [counterparties.alpha.toLowerCase(), "Alpha Research"],
  [counterparties.beta.toLowerCase(), "Beta Routing"],
  [counterparties.gamma.toLowerCase(), "Gamma Insights"],
  [counterparties.delta.toLowerCase(), "Delta Ops"],
  [counterparties.epsilon.toLowerCase(), "Epsilon Labs"],
  [counterparties.zeta.toLowerCase(), "Zeta Foundry"],
  [counterparties.infra.toLowerCase(), "Infra Vendor"],
  [counterparties.data.toLowerCase(), "Data Vendor"],
  [counterparties.ops.toLowerCase(), "Ops Vendor"],
]);

function transfer(
  params: Omit<TransferRow, "walletId">,
): TransferRow {
  return { walletId: walletWithHistory.wallet_id, ...params };
}

function gas(params: Omit<GasRow, "walletId">): GasRow {
  return { walletId: walletWithHistory.wallet_id, ...params };
}

export const walletTransfers: readonly TransferRow[] = [
  transfer({
    txHash: "0xrev01",
    logIndex: 0,
    blockNumber: 101,
    blockTime: "2026-06-18T10:00:00.000Z",
    token: "USDT",
    tokenAddress: "0xusdt",
    decimals: 6,
    from: counterparties.alpha,
    to: walletWithHistory.address,
    amount: "3500000",
    direction: "in",
    counterparty: counterparties.alpha,
  }),
  transfer({
    txHash: "0xrev02",
    logIndex: 0,
    blockNumber: 102,
    blockTime: "2026-06-20T10:00:00.000Z",
    token: "USDT",
    tokenAddress: "0xusdt",
    decimals: 6,
    from: counterparties.beta,
    to: walletWithHistory.address,
    amount: "1800000",
    direction: "in",
    counterparty: counterparties.beta,
  }),
  transfer({
    txHash: "0xrev03",
    logIndex: 0,
    blockNumber: 103,
    blockTime: "2026-06-22T10:00:00.000Z",
    token: "USDT",
    tokenAddress: "0xusdt",
    decimals: 6,
    from: counterparties.alpha,
    to: walletWithHistory.address,
    amount: "2600000",
    direction: "in",
    counterparty: counterparties.alpha,
  }),
  transfer({
    txHash: "0xrev04",
    logIndex: 0,
    blockNumber: 104,
    blockTime: "2026-06-24T10:00:00.000Z",
    token: "USDT",
    tokenAddress: "0xusdt",
    decimals: 6,
    from: counterparties.gamma,
    to: walletWithHistory.address,
    amount: "2500000",
    direction: "in",
    counterparty: counterparties.gamma,
  }),
  transfer({
    txHash: "0xrev05",
    logIndex: 0,
    blockNumber: 105,
    blockTime: "2026-06-27T10:00:00.000Z",
    token: "USDT",
    tokenAddress: "0xusdt",
    decimals: 6,
    from: counterparties.delta,
    to: walletWithHistory.address,
    amount: "2000000",
    direction: "in",
    counterparty: counterparties.delta,
  }),
  transfer({
    txHash: "0xrev06",
    logIndex: 0,
    blockNumber: 106,
    blockTime: "2026-06-30T10:00:00.000Z",
    token: "USDT",
    tokenAddress: "0xusdt",
    decimals: 6,
    from: counterparties.epsilon,
    to: walletWithHistory.address,
    amount: "1800000",
    direction: "in",
    counterparty: counterparties.epsilon,
  }),
  transfer({
    txHash: "0xrev07",
    logIndex: 0,
    blockNumber: 107,
    blockTime: "2026-07-03T10:00:00.000Z",
    token: "USDT",
    tokenAddress: "0xusdt",
    decimals: 6,
    from: counterparties.zeta,
    to: walletWithHistory.address,
    amount: "1700000",
    direction: "in",
    counterparty: counterparties.zeta,
  }),
  transfer({
    txHash: "0xrev08",
    logIndex: 0,
    blockNumber: 108,
    blockTime: "2026-07-05T10:00:00.000Z",
    token: "USDT",
    tokenAddress: "0xusdt",
    decimals: 6,
    from: counterparties.beta,
    to: walletWithHistory.address,
    amount: "2500000",
    direction: "in",
    counterparty: counterparties.beta,
  }),
  transfer({
    txHash: "0xexp01",
    logIndex: 0,
    blockNumber: 109,
    blockTime: "2026-06-25T12:00:00.000Z",
    token: "USDT",
    tokenAddress: "0xusdt",
    decimals: 6,
    from: walletWithHistory.address,
    to: counterparties.infra,
    amount: "2200000",
    direction: "out",
    counterparty: counterparties.infra,
  }),
  transfer({
    txHash: "0xexp02",
    logIndex: 0,
    blockNumber: 110,
    blockTime: "2026-07-01T12:00:00.000Z",
    token: "USDT",
    tokenAddress: "0xusdt",
    decimals: 6,
    from: walletWithHistory.address,
    to: counterparties.data,
    amount: "1500000",
    direction: "out",
    counterparty: counterparties.data,
  }),
  transfer({
    txHash: "0xexp03",
    logIndex: 0,
    blockNumber: 111,
    blockTime: "2026-07-08T12:00:00.000Z",
    token: "USDT",
    tokenAddress: "0xusdt",
    decimals: 6,
    from: walletWithHistory.address,
    to: counterparties.ops,
    amount: "1400000",
    direction: "out",
    counterparty: counterparties.ops,
  }),
];

export const walletGas: readonly GasRow[] = [
  gas({
    txHash: "0xgas01",
    blockNumber: 201,
    blockTime: "2026-07-09T08:00:00.000Z",
    gasUsed: "21000",
    gasPrice: "1476190476190",
    gasCost: "31000000000000000",
  }),
  gas({
    txHash: "0xgas02",
    blockNumber: 202,
    blockTime: "2026-07-10T08:00:00.000Z",
    gasUsed: "21000",
    gasPrice: "1476190476190",
    gasCost: "31000000000000000",
  }),
  gas({
    txHash: "0xgas03",
    blockNumber: 203,
    blockTime: "2026-07-11T08:00:00.000Z",
    gasUsed: "21000",
    gasPrice: "1476190476190",
    gasCost: "31000000000000000",
  }),
  gas({
    txHash: "0xgas04",
    blockNumber: 204,
    blockTime: "2026-07-12T08:00:00.000Z",
    gasUsed: "21000",
    gasPrice: "1476190476190",
    gasCost: "31000000000000000",
  }),
  gas({
    txHash: "0xgas05",
    blockNumber: 205,
    blockTime: "2026-07-13T08:00:00.000Z",
    gasUsed: "21000",
    gasPrice: "1476190476190",
    gasCost: "31000000000000000",
  }),
  gas({
    txHash: "0xgas06",
    blockNumber: 206,
    blockTime: "2026-07-14T08:00:00.000Z",
    gasUsed: "21000",
    gasPrice: "1476190476190",
    gasCost: "31000000000000000",
  }),
  gas({
    txHash: "0xgas07",
    blockNumber: 207,
    blockTime: "2026-07-15T08:00:00.000Z",
    gasUsed: "21000",
    gasPrice: "1476190476190",
    gasCost: "31000000000000000",
  }),
];

export const KYA_COMPONENT_WEIGHTS = Object.freeze({
  identity_continuity: 0.35,
  feedback_graph: 0.3,
  registration_hygiene: 0.2,
  longevity_activity: 0.15,
} as const);

const agentReports = {
  agent_good: {
    score: 85,
    components: {
      identity_continuity: {
        score: 100,
        weight: 0.35,
        evidence: {
          transfers: [],
          feedback_before_last_transfer: 0,
          days_since_last_transfer: null,
        },
      },
      feedback_graph: {
        score: 83,
        weight: 0.3,
        evidence: {
          feedback_count: 18,
          distinct_reviewers: 11,
          top3_reviewer_share: 0.39,
          max_share_72h_window: 0.22,
        },
      },
      registration_hygiene: {
        score: 100,
        weight: 0.2,
        evidence: {
          agent_uri_resolves: true,
          endpoints_reachable: true,
          domain_verification: true,
        },
      },
      longevity_activity: {
        score: 49,
        weight: 0.15,
        evidence: {
          registered_days: 46,
          active_days_30d: 22,
        },
      },
    },
    flags: [],
    registrations: [
      { chain: "eip155:8453", registry: MOCK_REGISTRY, agent_id: 42 },
    ],
    as_of: MOCK_AS_OF,
  },
  agent_transferred_identity: {
    score: 62,
    components: {
      identity_continuity: {
        score: 40,
        weight: 0.35,
        evidence: {
          transfers: [
            {
              tx: `0x${"ab".repeat(32)}` as const,
              at: "2026-07-03T12:00:00.000Z",
              from: address(41),
              to: address(42),
            },
          ],
          feedback_before_last_transfer: 31,
          days_since_last_transfer: 12,
        },
      },
      feedback_graph: {
        score: 70,
        weight: 0.3,
        evidence: {
          feedback_count: 44,
          distinct_reviewers: 9,
          top3_reviewer_share: 0.71,
          max_share_72h_window: 0.55,
        },
      },
      registration_hygiene: {
        score: 85,
        weight: 0.2,
        evidence: {
          agent_uri_resolves: true,
          endpoints_reachable: true,
          domain_verification: false,
        },
      },
      longevity_activity: {
        score: 60,
        weight: 0.15,
        evidence: {
          registered_days: 45,
          active_days_30d: 22,
        },
      },
    },
    flags: [
      "IDENTITY_TRANSFERRED_RECENTLY",
      "REVIEWER_CONCENTRATION",
      "NO_DOMAIN_VERIFICATION",
    ],
    registrations: [
      { chain: "eip155:8453", registry: MOCK_REGISTRY, agent_id: 43 },
    ],
    as_of: MOCK_AS_OF,
  },
  agent_sybil_burst: {
    score: 31,
    components: {
      identity_continuity: {
        score: 100,
        weight: 0.35,
        evidence: {
          transfers: [],
          feedback_before_last_transfer: 0,
          days_since_last_transfer: null,
        },
      },
      feedback_graph: {
        score: 24,
        weight: 0.3,
        evidence: {
          feedback_count: 20,
          distinct_reviewers: 2,
          top3_reviewer_share: 0.9,
          max_share_72h_window: 0.8,
        },
      },
      registration_hygiene: {
        score: 65,
        weight: 0.2,
        evidence: {
          agent_uri_resolves: true,
          endpoints_reachable: false,
          domain_verification: true,
        },
      },
      longevity_activity: {
        score: 0,
        weight: 0.15,
        evidence: {
          registered_days: 3,
          active_days_30d: 0,
        },
      },
    },
    flags: [
      "REVIEWER_CONCENTRATION",
      "BURST_FEEDBACK",
      "UNREACHABLE_ENDPOINT",
    ],
    registrations: [
      { chain: "eip155:1", registry: MOCK_REGISTRY, agent_id: 44 },
    ],
    as_of: MOCK_AS_OF,
  },
} satisfies Record<MockAgentFixtureName, KyaReport>;

export const mockAgentReports = agentReports;

const walletToFixture = new Map<string, MockAgentFixtureName>([
  [address(601).toLowerCase(), "agent_good"],
  [address(602).toLowerCase(), "agent_transferred_identity"],
  [address(603).toLowerCase(), "agent_sybil_burst"],
]);

const registryToFixture = new Map<number, MockAgentFixtureName>([
  [42, "agent_good"],
  [43, "agent_transferred_identity"],
  [44, "agent_sybil_burst"],
]);

export function fixtureNameFromAgentRef(agentRef: AgentRef): MockAgentFixtureName {
  if (agentRef.kind === "erc8004") {
    const name = registryToFixture.get(agentRef.agent_id);
    if (name !== undefined) return name;
  } else {
    const name = walletToFixture.get(agentRef.address.toLowerCase());
    if (name !== undefined) return name;
  }
  return "agent_good";
}

export function attestationWithZk(report: KyaReport): AttestationResult {
  return {
    ...report,
    zk: {
      available: true,
      proof: MOCK_PROOF,
      public_inputs: [...MOCK_PUBLIC_INPUTS],
      model_commitment: MOCK_MODEL_COMMITMENT,
      verifier: { chain: "eip155:196", address: MOCK_VERIFIER },
      scheme: "groth16-bn254-ezkl",
    },
  };
}
