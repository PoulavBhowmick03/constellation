export interface TransferRow {
  txHash: string;
  blockNumber: number;
  blockTime: string;
  token: string;
  decimals: number;
  from: string;
  to: string;
  amount: string;
  direction: 'in' | 'out';
  counterparty: string;
  label?: string;
}

export interface GasRow {
  txHash: string;
  blockNumber: number;
  blockTime: string;
  gasUsed: string;
  gasPrice: string;
  gasCost: string;
}

export interface Money {
  token: string;
  amount: string;
  decimals: number;
}

export interface MockWalletFixture {
  name: string;
  address: string;
  wallet_id: string;
  indexed_from_block: number;
  okb_balance: Money;
  avg_daily_gas_7d: Money;
  runway_days: number;
}

export interface KyaComponent {
  score: number;
  weight: number;
  evidence: any;
}

export interface KyaReport {
  score: number;
  components: {
    identity_continuity: KyaComponent;
    feedback_graph: KyaComponent;
    registration_hygiene: KyaComponent;
    longevity_activity: KyaComponent;
  };
  flags: string[];
  registrations: Array<{ chain: string; registry: string; agent_id: number }>;
  as_of: string;
  zk?: {
    available: boolean;
    reason?: string;
    proof?: string;
    public_inputs?: string[];
    model_commitment?: string;
    verifier?: { chain: string; address: string };
    scheme?: string;
  };
}

// 1. Treasury Data
export const walletWithHistory: MockWalletFixture = {
  name: "wallet_with_history",
  address: "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf",
  wallet_id: "w_wallet_with_history",
  indexed_from_block: 123,
  okb_balance: { token: "OKB", amount: "412000000000000000", decimals: 18 },
  avg_daily_gas_7d: { token: "OKB", amount: "31000000000000000", decimals: 18 },
  runway_days: 13.3,
};

export const walletLabels: Record<string, string> = {
  "0x00000000000000000000000000000000000003e9": "Alpha Research",
  "0x00000000000000000000000000000000000003ea": "Beta Routing",
  "0x00000000000000000000000000000000000003eb": "Gamma Insights",
  "0x00000000000000000000000000000000000003ec": "Delta Ops",
  "0x00000000000000000000000000000000000003ed": "Epsilon Labs",
  "0x00000000000000000000000000000000000003ee": "Zeta Foundry",
  "0x000000000000000000000000000000000000044d": "Infra Vendor",
  "0x000000000000000000000000000000000000044e": "Data Vendor",
  "0x000000000000000000000000000000000000044f": "Ops Vendor",
};

export const walletTransfers: TransferRow[] = [
  {
    txHash: "0xrev01",
    blockNumber: 101,
    blockTime: "2026-06-18T10:00:00.000Z",
    token: "USDT",
    decimals: 6,
    from: "0x00000000000000000000000000000000000003e9",
    to: walletWithHistory.address,
    amount: "3500000",
    direction: "in",
    counterparty: "0x00000000000000000000000000000000000003e9",
    label: "Alpha Research"
  },
  {
    txHash: "0xrev02",
    blockNumber: 102,
    blockTime: "2026-06-20T10:00:00.000Z",
    token: "USDT",
    decimals: 6,
    from: "0x00000000000000000000000000000000000003ea",
    to: walletWithHistory.address,
    amount: "1800000",
    direction: "in",
    counterparty: "0x00000000000000000000000000000000000003ea",
    label: "Beta Routing"
  },
  {
    txHash: "0xrev03",
    blockNumber: 103,
    blockTime: "2026-06-22T10:00:00.000Z",
    token: "USDT",
    decimals: 6,
    from: "0x00000000000000000000000000000000000003e9",
    to: walletWithHistory.address,
    amount: "2600000",
    direction: "in",
    counterparty: "0x00000000000000000000000000000000000003e9",
    label: "Alpha Research"
  },
  {
    txHash: "0xrev04",
    blockNumber: 104,
    blockTime: "2026-06-24T10:00:00.000Z",
    token: "USDT",
    decimals: 6,
    from: "0x00000000000000000000000000000000000003eb",
    to: walletWithHistory.address,
    amount: "2500000",
    direction: "in",
    counterparty: "0x00000000000000000000000000000000000003eb",
    label: "Gamma Insights"
  },
  {
    txHash: "0xrev05",
    blockNumber: 105,
    blockTime: "2026-06-27T10:00:00.000Z",
    token: "USDT",
    decimals: 6,
    from: "0x00000000000000000000000000000000000003ec",
    to: walletWithHistory.address,
    amount: "2000000",
    direction: "in",
    counterparty: "0x00000000000000000000000000000000000003ec",
    label: "Delta Ops"
  },
  {
    txHash: "0xrev06",
    blockNumber: 106,
    blockTime: "2026-06-30T10:00:00.000Z",
    token: "USDT",
    decimals: 6,
    from: "0x00000000000000000000000000000000000003ed",
    to: walletWithHistory.address,
    amount: "1800000",
    direction: "in",
    counterparty: "0x00000000000000000000000000000000000003ed",
    label: "Epsilon Labs"
  },
  {
    txHash: "0xrev07",
    blockNumber: 107,
    blockTime: "2026-07-03T10:00:00.000Z",
    token: "USDT",
    decimals: 6,
    from: "0x00000000000000000000000000000000000003ee",
    to: walletWithHistory.address,
    amount: "1700000",
    direction: "in",
    counterparty: "0x00000000000000000000000000000000000003ee",
    label: "Zeta Foundry"
  },
  {
    txHash: "0xrev08",
    blockNumber: 108,
    blockTime: "2026-07-05T10:00:00.000Z",
    token: "USDT",
    decimals: 6,
    from: "0x00000000000000000000000000000000000003ea",
    to: walletWithHistory.address,
    amount: "2500000",
    direction: "in",
    counterparty: "0x00000000000000000000000000000000000003ea",
    label: "Beta Routing"
  },
  {
    txHash: "0xexp01",
    blockNumber: 109,
    blockTime: "2026-06-25T12:00:00.000Z",
    token: "USDT",
    decimals: 6,
    from: walletWithHistory.address,
    to: "0x000000000000000000000000000000000000044d",
    amount: "2200000",
    direction: "out",
    counterparty: "0x000000000000000000000000000000000000044d",
    label: "Infra Vendor"
  },
  {
    txHash: "0xexp02",
    blockNumber: 110,
    blockTime: "2026-07-01T12:00:00.000Z",
    token: "USDT",
    decimals: 6,
    from: walletWithHistory.address,
    to: "0x000000000000000000000000000000000000044e",
    amount: "1500000",
    direction: "out",
    counterparty: "0x000000000000000000000000000000000000044e",
    label: "Data Vendor"
  },
  {
    txHash: "0xexp03",
    blockNumber: 111,
    blockTime: "2026-07-08T12:00:00.000Z",
    token: "USDT",
    decimals: 6,
    from: walletWithHistory.address,
    to: "0x000000000000000000000000000000000000044f",
    amount: "1400000",
    direction: "out",
    counterparty: "0x000000000000000000000000000000000000044f",
    label: "Ops Vendor"
  },
];

export const walletGas: GasRow[] = [
  { txHash: "0xgas01", blockNumber: 201, blockTime: "2026-07-09T08:00:00.000Z", gasUsed: "21000", gasPrice: "1476190476190", gasCost: "31000000000000000" },
  { txHash: "0xgas02", blockNumber: 202, blockTime: "2026-07-10T08:00:00.000Z", gasUsed: "21000", gasPrice: "1476190476190", gasCost: "31000000000000000" },
  { txHash: "0xgas03", blockNumber: 203, blockTime: "2026-07-11T08:00:00.000Z", gasUsed: "21000", gasPrice: "1476190476190", gasCost: "31000000000000000" },
  { txHash: "0xgas04", blockNumber: 204, blockTime: "2026-07-12T08:00:00.000Z", gasUsed: "21000", gasPrice: "1476190476190", gasCost: "31000000000000000" },
  { txHash: "0xgas05", blockNumber: 205, blockTime: "2026-07-13T08:00:00.000Z", gasUsed: "21000", gasPrice: "1476190476190", gasCost: "31000000000000000" },
  { txHash: "0xgas06", blockNumber: 206, blockTime: "2026-07-14T08:00:00.000Z", gasUsed: "21000", gasPrice: "1476190476190", gasCost: "31000000000000000" },
  { txHash: "0xgas07", blockNumber: 207, blockTime: "2026-07-15T08:00:00.000Z", gasUsed: "21000", gasPrice: "1476190476190", gasCost: "31000000000000000" },
];


// 2. KYA Reports
export const mockAgentReports: Record<string, KyaReport> = {
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
      { chain: "eip155:8453", registry: "0x0000000000000000000000000000000000001f44", agent_id: 42 },
    ],
    as_of: "2026-07-15T12:00:00.000Z",
    zk: {
      available: false,
      reason: "roadmap",
    }
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
              tx: "0xabababababababababababababababababababababababababababababababab",
              at: "2026-07-03T12:00:00.000Z",
              from: "0x0000000000000000000000000000000000000029",
              to: "0x000000000000000000000000000000000000002a",
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
      { chain: "eip155:8453", registry: "0x0000000000000000000000000000000000001f44", agent_id: 43 },
    ],
    as_of: "2026-07-15T12:00:00.000Z",
    zk: {
      available: false,
      reason: "roadmap",
    }
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
      { chain: "eip155:1", registry: "0x0000000000000000000000000000000000001f44", agent_id: 44 },
    ],
    as_of: "2026-07-15T12:00:00.000Z",
    zk: {
      available: false,
      reason: "roadmap",
    }
  },
};


// 3. The Firm Timeline Scenarios
export interface SimulationStep {
  nodeId: 'plan' | 'source' | 'diligence' | 'procure' | 'qa' | 'assemble' | 'no_qualified_vendor' | 'budget_breach' | 'halt_and_report';
  title: string;
  description: string;
  status: 'idle' | 'active' | 'completed' | 'failed';
  log: string;
  data?: any;
}

export interface SimulationScenario {
  id: string;
  name: string;
  description: string;
  steps: SimulationStep[];
  appendix?: any;
}

export const firmScenarios: SimulationScenario[] = [
  {
    id: "happy_path",
    name: "Happy Path Hire (agent_good)",
    description: "Orchestrator successfully plans, runs KYA diligence, hires agent_good, verifies output, and generates Provenance Appendix.",
    steps: [
      {
        nodeId: "plan",
        title: "Task Specification & Budgeting",
        description: "Specify task goal: 'Research OKX X Layer bridge rates and output report'. Set budget cap: 5.00 USDT.",
        status: "idle",
        log: `[00:01] Initializing Task Spec...
[00:02] Goal: Bridge market-rate analysis
[00:03] Budget Cap set to: 5.00 USDT (5000000 base units, decimals: 6)`,
        data: {
          subtask: {
            id: "st_01",
            goal: "Research OKX X Layer bridge rates and output report",
            budget_cap: { token: "USDT", amount: "5000000", decimals: 6 },
            deadline: "2026-07-16T12:00:00Z"
          }
        }
      },
      {
        nodeId: "source",
        title: "Vendor Discovery & Selection",
        description: "Scans marketplace for agents with capability 'research'. Found agent_good.",
        status: "idle",
        log: `[00:05] Scanning OKX Agent Marketplace for capability: 'research'
[00:08] Found Vendor: 'agent_good'
[00:09] Ref: { kind: 'erc8004', registry: '0x0000000000000000000000000000000000001f44', agent_id: 42 }
[00:10] Tool: 'research_rates', Pricing Hint: 'cheap'`,
        data: {
          vendor: {
            name: "Agent Good",
            agent_ref: { kind: "erc8004", chain: "eip155:8453", registry: "0x0000000000000000000000000000000000001f44", agent_id: 42 },
            tools: ["research_rates"],
            pricing_hint: "1.50 USDT"
          }
        }
      },
      {
        nodeId: "diligence",
        title: "KYA Trust Evaluation",
        description: "Fetch KYA report card. Target score >= 60, zero IDENTITY_TRANSFERRED_RECENTLY flags.",
        status: "idle",
        log: `[00:12] Querying KYA A2MCP endpoint check_agent...
[00:14] KYA Score: 85/100
[00:15] Components: Identity Continuity: 100, Feedback: 83, Hygiene: 100, Longevity: 49.
[00:16] Flags: None detected.
[00:17] Diligence check: PASSED. Proceeding to procurement.`,
        data: {
          kya_summary: {
            score: 85,
            flags: [],
            action: "APPROVED"
          }
        }
      },
      {
        nodeId: "procure",
        title: "Illustrative Procurement Decision",
        description: "Preview where a future orchestrator would request payment approval. No call or transaction is executed.",
        status: "idle",
        log: `[SIMULATION] Payment decision point reached.
[SIMULATION] No payment authorization created.
[SIMULATION] No A2MCP payload dispatched.
[SIMULATION] No transaction or receipt exists.`,
        data: {
          simulation_only: true,
          receipt: null,
        }
      },
      {
        nodeId: "qa",
        title: "Quality Assurance Verification",
        description: "Run automated tests against vendor output report.",
        status: "idle",
        log: `[00:28] Retesting vendor deliverable report file...
[00:29] Criteria 1 (Data completeness): PASSED
[00:30] Criteria 2 (JSON syntax): PASSED
[00:31] Criteria 3 (X Layer specific gas tables): PASSED
[00:32] QA Outcome: 5/5 criteria passed. Output verified.`,
        data: {
          qa_results: {
            criteria_passed: 5,
            criteria_total: 5,
            notes: "All bridge rate checks verified."
          }
        }
      },
      {
        nodeId: "assemble",
        title: "Provenance Assembly & Output",
        description: "Assemble final deliverables. Attach the Provenance Appendix containing receipts and KYA logs.",
        status: "idle",
        log: `[00:35] Formatting Provenance Appendix...
[00:36] Appending KYA report summary.
[00:37] Appending procurement receipts.
[00:38] Appending export statement references.
[00:40] Task complete. Output dispatched to user.`,
        data: {}
      }
    ],
    appendix: {
      task: "Research OKX X Layer bridge rates and output report",
      subtasks: [
        { id: "st_01", goal: "Research OKX X Layer bridge rates and output report", budget_cap: { token: "USDT", amount: "5000000", decimals: 6 } }
      ],
      hires: [
        { subtask_id: "st_01", vendor: { name: "Agent Good", agent_ref: { kind: "erc8004", chain: "eip155:8453", agent_id: 42 } }, kya_summary: { score: 85, flags: [] } }
      ],
      receipts: [],
      qa: [
        { subtask_id: "st_01", criteria_passed: 5, criteria_total: 5, notes: "All bridge rate checks verified." }
      ],
      treasury_statement: `# Treasury Bookkeeping Statement
Period: 2026-06-15 to 2026-07-15
Wallet ID: w_wallet_with_history

Total Inflow: 18.40 USDT (8 transfers)
Total Outflow: 5.10 USDT (3 transfers)
Gas Fees: 0.217 OKB (7 transactions)`,
      totals: {
        spent: { token: "USDT", amount: "1500000", decimals: 6 },
        budget: { token: "USDT", amount: "5000000", decimals: 6 }
      }
    }
  },
  {
    id: "diligence_halt",
    name: "Diligence Reject (agent_transferred_identity)",
    description: "Diligence block trips because vendor agent_transferred_identity has IDENTITY_TRANSFERRED_RECENTLY flag.",
    steps: [
      {
        nodeId: "plan",
        title: "Task Specification",
        description: "Specify task: 'Execute cross-chain arbitrage trace'. Set budget cap: 10.00 USDT.",
        status: "idle",
        log: `[00:01] Specifying subtask...
[00:02] Goal: Arbitrage tracing
[00:03] Budget Cap set to: 10.00 USDT (10000000 base units, decimals: 6)`
      },
      {
        nodeId: "source",
        title: "Vendor Discovery",
        description: "Scans marketplace. Selects agent_transferred_identity.",
        status: "idle",
        log: `[00:05] Scanning marketplace...
[00:07] Found vendor 'agent_transferred_identity'
[00:08] Ref: { kind: 'erc8004', registry: '0x0000000000000000000000000000000000001f44', agent_id: 43 }`
      },
      {
        nodeId: "diligence",
        title: "KYA Diligence Run",
        description: "Fetch KYA report. Check against DiligencePolicy.",
        status: "idle",
        log: `[00:10] Requesting check_agent report from KYA A2MCP...
[00:12] Kya report returned: Score 62
[00:13] !!! FLAG DETECTED: IDENTITY_TRANSFERRED_RECENTLY
[00:14] Diligence Policy configuration: Block if flag present for jobs > 1.00 USDT (Job budget is 10.00 USDT)
[00:15] Diligence check: FAILED. Halting hire sequence.`
      },
      {
        nodeId: "no_qualified_vendor",
        title: "Exception Triggered",
        description: "Fallback mechanism: Check for qualified secondary vendors. None found.",
        status: "idle",
        log: `[00:17] Exception: no_qualified_vendor.
[00:18] Querying secondary vendors list...
[00:20] No alternative vendors found for cap: 'research'.`
      },
      {
        nodeId: "halt_and_report",
        title: "Halt and Report",
        description: "Process terminates. Write error dump to user.",
        status: "idle",
        log: `[00:22] Triggering Halt...
[00:23] Compiling exception report.
[00:24] Error Code: DILIGENCE_FAILURE
[00:25] Details: Vendor (ID: 43) blocked due to recent identity transfer. Run aborted.`,
        data: {
          error: {
            code: "DILIGENCE_FAILURE",
            reason: "IDENTITY_TRANSFERRED_RECENTLY detected on vendor agent_transferred_identity. Policy blocks execution above 1.00 USDT."
          }
        }
      }
    ]
  },
  {
    id: "budget_breach",
    name: "Budget Cap Breach (Halt)",
    description: "Procurement halts because vendor price exceeds remaining task budget cap.",
    steps: [
      {
        nodeId: "plan",
        title: "Task Specification",
        description: "Specify task: 'Verify RPC availability'. Set tight budget cap: 1.00 USDT.",
        status: "idle",
        log: `[00:01] Specifying subtask...
[00:02] Goal: RPC health check
[00:03] Budget Cap set to: 1.00 USDT (1000000 base units, decimals: 6)`
      },
      {
        nodeId: "source",
        title: "Vendor Discovery",
        description: "Scans marketplace. Found agent_good.",
        status: "idle",
        log: `[00:05] Scanning marketplace...
[00:07] Found vendor 'agent_good'
[00:08] Tool price: 1.50 USDT`
      },
      {
        nodeId: "diligence",
        title: "KYA Diligence Run",
        description: "KYA check passes (score 85, no flags).",
        status: "idle",
        log: `[00:10] Requesting check_agent report...
[00:11] Score 85. Flags: None.
[00:12] Diligence: PASSED.`
      },
      {
        nodeId: "procure",
        title: "Procurement Evaluation",
        description: "Evaluate cost against budget. Cost: 1.50 USDT, Budget: 1.00 USDT.",
        status: "idle",
        log: `[00:14] Checking budget compliance...
[00:15] Vendor Cost: 1.50 USDT. Remaining Budget Cap: 1.00 USDT.
[00:16] !!! BREACH DETECTED: Cost exceeds budget cap.
[00:17] Halting procurement.`
      },
      {
        nodeId: "budget_breach",
        title: "Exception Triggered",
        description: "Trigger budget_breach exception edge.",
        status: "idle",
        log: `[00:19] Exception: budget_breach.
[00:20] Reporting cost anomaly to coordinator...`
      },
      {
        nodeId: "halt_and_report",
        title: "Halt and Report",
        description: "Terminate run and return budget breach logs.",
        status: "idle",
        log: `[00:22] Triggering Halt...
[00:23] Error Code: BUDGET_BREACH_HALT
[00:24] Details: Required cost (1.50 USDT) exceeds cap limit (1.00 USDT).`,
        data: {
          error: {
            code: "BUDGET_BREACH_HALT",
            reason: "Procurement of tool research_rates from agent_good costs 1.50 USDT, breaching subtask budget cap of 1.00 USDT."
          }
        }
      }
    ]
  }
];
