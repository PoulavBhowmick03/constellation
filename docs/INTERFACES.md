# INTERFACES.md — Frozen contracts

Status: DRAFT until end of Day 1 (July 7), then FROZEN.
Change protocol after freeze: written sign-off from both Poulav and Ishita, version bump below, and the matching `packages/mocks` update in the same PR. Agents may propose changes in `docs/status/`, never apply them.

Version: 0.1.0

Conventions: all money amounts are strings in token base units plus a `decimals` field. All timestamps ISO-8601 UTC. `agent_ref` identifies an agent either by ERC-8004 registration or by wallet.

```json
// agent_ref
{ "kind": "erc8004", "chain": "eip155:1", "registry": "0x...", "agent_id": 42 }
{ "kind": "wallet",  "chain": "eip155:196", "address": "0x..." }
```

Chain IDs: Ethereum `eip155:1`, Base `eip155:8453`, X Layer `eip155:196` (verify RPC endpoints Day 1; do not hardcode third-party RPCs without checking).

---

## 1. Treasury Copilot (apps/treasury) — A2MCP

Auth model: caller proves wallet ownership once via EIP-191 challenge, then queries that wallet.

### register_wallet (free)
Request: `{ "address": "0x...", "nonce": "<server-issued>", "signature": "0x..." }`
Response: `{ "ok": true, "wallet_id": "w_...", "indexed_from_block": 123 }`
Errors: `BAD_SIGNATURE`, `NONCE_EXPIRED`.

### get_runway (free — the hook)
Request: `{ "wallet_id": "w_..." }`
Response:
```json
{
  "okb_balance": {"amount": "412000000000000000", "decimals": 18},
  "avg_daily_gas_7d": {"amount": "31000000000000000", "decimals": 18},
  "runway_days": 13.2,
  "as_of": "2026-07-09T10:00:00Z"
}
```

### get_revenue_report (paid, placeholder 0.10 USDT)
Request: `{ "wallet_id": "w_...", "period": {"from": "...", "to": "..."} }`
Response:
```json
{
  "totals": [{"token": "USDT", "amount": "18400000", "decimals": 6}],
  "by_counterparty": [
    {"address": "0x...", "label": null, "tx_count": 12,
     "total": {"token": "USDT", "amount": "6100000", "decimals": 6},
     "tx_refs": ["0x..."]}
  ],
  "tx_count": 37
}
```

### get_expense_report (paid, placeholder 0.10 USDT)
Same shape as revenue plus `"gas": {"token": "OKB", "amount": "...", "decimals": 18, "tx_count": 51}`.

### export_statement (paid, placeholder 0.20 USDT)
Request: `{ "wallet_id": "w_...", "period": {...}, "format": "csv" | "json" | "md" }`
Response: `{ "format": "csv", "content": "<inline>", "row_count": 88 }`

Non-negotiables: read-only; tracks USDT/USDG ERC-20 transfers + native OKB on X Layer (token contract addresses via env, `TODO(unverified)` until Day 1 check); never returns data for unproven wallets.

---

## 2. KYA (apps/kya) — A2MCP

### get_flags (cheap, placeholder 0.02 USDT)
Request: `{ "agent_ref": {...} }`
Response: `{ "flags": ["IDENTITY_TRANSFERRED_RECENTLY", ...], "as_of": "..." }`

### check_agent (paid, placeholder 0.25 USDT)
Response:
```json
{
  "score": 62,
  "components": {
    "identity_continuity": {"score": 40, "weight": 0.35,
      "evidence": {"transfers": [{"tx": "0x...", "at": "...", "from": "0x...", "to": "0x..."}],
                   "feedback_before_last_transfer": 31, "days_since_last_transfer": 12}},
    "feedback_graph": {"score": 70, "weight": 0.30,
      "evidence": {"feedback_count": 44, "distinct_reviewers": 9,
                   "top3_reviewer_share": 0.71, "max_share_72h_window": 0.55}},
    "registration_hygiene": {"score": 85, "weight": 0.20,
      "evidence": {"agent_uri_resolves": true, "endpoints_reachable": true,
                   "domain_verification": false}},
    "longevity_activity": {"score": 60, "weight": 0.15,
      "evidence": {"registered_days": 45, "active_days_30d": 22}}
  },
  "flags": ["IDENTITY_TRANSFERRED_RECENTLY", "REVIEWER_CONCENTRATION"],
  "registrations": [{"chain": "eip155:8453", "registry": "0x...", "agent_id": 42}],
  "as_of": "..."
}
```

Flag definitions (v0.1.0):
- `IDENTITY_TRANSFERRED_RECENTLY`: ERC-721 transfer of the identity token within 30 days AND feedback existed before the transfer.
- `REVIEWER_CONCENTRATION`: top 3 reviewers account for > 60% of feedback (min 10 feedback items).
- `BURST_FEEDBACK`: > 50% of feedback within any 72h window (min 10 items).
- `UNREACHABLE_ENDPOINT`: a declared service endpoint fails to respond.
- `NO_DOMAIN_VERIFICATION`: no valid `.well-known` registration proof.
- `ZERO_HISTORY`: no feedback and registered < 7 days.

Score = weighted sum of components, integer 0 to 100. Weights fixed as above for the hackathon. Explainability is a feature: every component ships evidence.

### attest_agent (premium, placeholder 2.00 USDT)
Everything in `check_agent`, plus:
```json
"zk": {
  "available": true,
  "proof": "0x...", "public_inputs": ["..."],
  "model_commitment": "0x...",
  "verifier": {"chain": "eip155:196", "address": "0x..."},
  "scheme": "groth16-bn254-ezkl"
}
```
Graceful degradation is part of the contract: if the ZK layer is cut, `"zk": {"available": false, "reason": "roadmap"}` and the tool still returns the full report at check_agent pricing. The Firm and the mocks MUST handle both shapes.

### verify_attestation (free)
Request: `{ "proof": "0x...", "public_inputs": [...] }` → `{ "valid": true, "verifier": {...} }`

---

## 3. The Firm (apps/firm) — internal contracts

> STATUS: DEFERRED. The Firm is narrative-only per README/PLAN. This section is retained as reference for the demo story and for a possible post-hackathon build, but nothing here is a listing deliverable and no agent should build against it unless The Firm is explicitly activated (see PLAN.md "The Firm activation"). Treasury (section 1) and KYA (section 2) are the active, frozen contracts.


### SubtaskSpec
```json
{ "id": "st_01", "goal": "...", "inputs": {...},
  "acceptance_criteria": ["...", "..."],
  "budget_cap": {"token": "USDT", "amount": "500000", "decimals": 6},
  "deadline": "...", "preferred_capabilities": ["research", "data"] }
```

### VendorRecord
```json
{ "agent_ref": {...}, "name": "...", "tools": ["..."],
  "pricing_hint": "...", "kya": {"score": 78, "flags": []},
  "source": "marketplace" | "curated" }
```

### DiligencePolicy (defaults)
```json
{ "min_score": 60,
  "hard_block_flags": ["IDENTITY_TRANSFERRED_RECENTLY"],
  "hard_block_above": {"token": "USDT", "amount": "1000000", "decimals": 6},
  "require_attestation_above": {"token": "USDT", "amount": "5000000", "decimals": 6} }
```
Meaning: never hire below 60; never hire a transferred identity for jobs above 1 USDT; require ZK attestation above 5 USDT (falls back to check_agent if zk unavailable, logged in provenance).

### ProcurementReceipt
```json
{ "subtask_id": "st_01", "vendor": {...}, "mode": "a2mcp" | "a2a_escrow",
  "tool": "check_agent", "cost": {"token": "USDT", "amount": "250000", "decimals": 6},
  "tx_ref": "0x... | sdk_receipt_id", "status": "paid" | "escrowed" | "released" }
```

### ProvenanceAppendix (attached to every deliverable)
```json
{ "task": "...", "subtasks": [SubtaskSpec...],
  "hires": [{"subtask_id": "...", "vendor": {...}, "kya_summary": {...}}],
  "receipts": [ProcurementReceipt...],
  "qa": [{"subtask_id": "...", "criteria_passed": 4, "criteria_total": 5, "notes": "..."}],
  "treasury_statement": "<export_statement md content>",
  "totals": {"spent": {...}, "budget": {...}} }
```

Graph nodes (fixed v0.1.0): `plan -> source -> diligence -> procure -> qa -> assemble`, with exception edges: `no_qualified_vendor -> (in_house | partial_with_explanation)`, `budget_breach -> halt_and_report`. Checkpoint state after every node.

---

## 4. packages/mocks

A mock MCP server exposing every tool above with identical schemas, switched by `MOCK_MODE=1`. Golden fixtures (names are load-bearing; evals reference them):
- `agent_good` — score ~85, no flags.
- `agent_transferred_identity` — recent transfer, feedback predates it. Must trip the hard block.
- `agent_sybil_burst` — REVIEWER_CONCENTRATION + BURST_FEEDBACK, score < 50.
- `wallet_with_history` — 30 days of USDT inflows from 6 counterparties + gas spend, for Treasury fixtures.

Mocks are I2's property and must track this file exactly. Schema drift between mocks and INTERFACES.md is a build-stopping bug.
