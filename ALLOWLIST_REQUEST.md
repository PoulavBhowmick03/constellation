# ERC-8004 Reputation Registry — Allowlist Request (and important findings)

> **TL;DR / Critical update before sending outreach.** Investigation strongly suggests
> the premise of this request is wrong. The address in `.env`
> (`0x8004B663…7388713`) is the **Mantle Sepolia testnet** Reputation Registry — it has
> **zero bytecode on Mantle mainnet**, so `recordJobCompletion` was never going to
> hit a real contract there. The actual **Mantle mainnet** Reputation Registry per
> the official `erc-8004/erc-8004-contracts` README is at
> **`0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`** — it is deployed, verified,
> and `giveFeedback(...)` is **permissionless** (no allowlist). Read
> *“Investigation findings”* below before contacting anyone.

---

## 1. Drafted outreach message (use **only** if you still want to engage Mantle/8004 team)

> Hi Mantle / ERC-8004 team —
>
> We’re building **LedgerForge**, a reputation-native agent service marketplace and the first x402 implementation on Mantle, submitted to the **Mantle Turing Test Hackathon 2026** (deadline June 15). Live dashboard: <https://dashboard-xi-sooty-72.vercel.app>, facilitator: <https://ledgerforge-facilitator.fly.dev>, indexer: <https://ledgerforge-indexer.fly.dev>. Our `SkillRegistry` (`0x37041F257Bf8f1E201497Dc0BCDa1ae0d8317992`) already imports `IERC8004Reputation` and is wired to write feedback after every settled x402 job.
>
> Two quick asks: (1) **Could you confirm the canonical Mantle mainnet address** for the ERC-8004 Reputation Registry? Our env points to `0x8004B663056A597Dffe9eCcC1965A193B7388713` (from earlier docs) but that address has no bytecode on mainnet; the `erc-8004/erc-8004-contracts` README lists `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` instead. (2) If the registry uses any operator allowlist / authorized-recorder pattern, please add our facilitator operator wallet **`0xC0296012Cfbb0e6DF5dA7158B65Dbc46DD9650e0`** so reputation writes succeed before the June 15 submission deadline.
>
> Happy to share contracts, deploy txs, or hop on a call. Thanks!
> — LedgerForge team

*(4 sentences across two paragraphs; trim/expand as needed.)*

---

## 2. Contact channels — direct, clickable links

### Mantle Network (most likely to action a hackathon ask)
| Channel | URL | Notes |
| --- | --- | --- |
| Discord (official) | <https://discord.gg/mantle> / <https://discord.com/invite/0xmantle> | Use the **DEV ZONE → support ticket** flow, or ping DevRel |
| Hackathon Telegram | <https://t.me/MantleTuringTestHackathon> | Dedicated Turing Test 2026 channel — fastest path for hackathon issues |
| Mantle community Telegram | <https://t.me/mantlenetwork> | General community |
| X (Twitter) | <https://x.com/Mantle_Official> / <https://x.com/0xMantle> | DM not guaranteed |
| DevHub (hackathon HQ) | <https://devhub.mantle.xyz/> | Lists DevRel contacts |
| DoraHacks portal | <https://dorahacks.io/hackathon/mantleturingtesthackathon2026> | File a support ticket on the hackathon page |
| Hackathon DevRel (Finn) | <mailto:finn.li@mantle.xyz> | Primary hackathon dev contact |
| Hackathon DevRel (Stella) | <mailto:stella.zhou@mantle.xyz> | Backup hackathon dev contact |
| General contact | <mailto:contact@mantle.xyz> | Slow / generic |
| GitHub org | <https://github.com/mantlenetworkio> | Open an issue against the most relevant repo |

### ERC-8004 standard maintainers
| Channel | URL | Notes |
| --- | --- | --- |
| Team email | <mailto:team@8004.org> | Listed on 8004.org as primary contact |
| Project site | <https://www.8004.org> | Trustless Autonomous Agents on Open Protocols |
| Contracts repo | <https://github.com/erc-8004/erc-8004-contracts> | Source of truth for deployment addresses |
| File an issue | <https://github.com/erc-8004/erc-8004-contracts/issues/new> | Best-paper-trail option |
| EIP discussion | <https://ethereum-magicians.org/t/erc-8004-trustless-agents/25098> | For spec-level questions |
| EIP page | <https://eips.ethereum.org/EIPS/eip-8004> | The standard itself |
| Marco De Rossi (lead) | <https://medium.com/survival-tech/the-story-behind-erc-8004-next-steps-ec46c18d1879> | Blog — DM via Medium or X if needed |

---

## 3. Investigation findings

### 3.1 Does `0x8004B663056A597Dffe9eCcC1965A193B7388713` have bytecode? — **No.**
```
$ cast code 0x8004B663056A597Dffe9eCcC1965A193B7388713 --rpc-url https://rpc.mantle.xyz
0x         (3 bytes incl. "0x" — i.e. empty)
$ cast balance ...    -> 0
$ cast nonce   ...    -> 0
```
Probing common access-control selectors all returned the same error:
`contract … does not have any code` for: `owner()`, `admin()`, `authority()`,
`isAllowedRecorder(address)`, `isOperator(address)`, `getFeedbackCount(uint256)`.
Mantlescan confirms 0 MNT, no internal txs, no history. The address has
**never been touched** on Mantle mainnet.

The sibling identity registry referenced in `.env`
(`0x8004A818BFB912233c491871b3d84c89A494BD9e`) is also bytecode-free on
mainnet. Both addresses **are deployed on Mantle Sepolia testnet** instead
(per the official README at `erc-8004/erc-8004-contracts`).

### 3.2 Where is the **real** Mantle mainnet Reputation Registry?
Per `github.com/erc-8004/erc-8004-contracts/README.md`:

| Network | IdentityRegistry | ReputationRegistry |
| --- | --- | --- |
| **Mantle Mainnet** | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` |
| Mantle Testnet (Sepolia) | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | `0x8004B663056A597Dffe9eCcC1965A193B7388713` ← what's in `.env` |

Verified live on mainnet RPC:
```
$ cast call 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63 "owner()(address)"     --rpc-url https://rpc.mantle.xyz
0x547289319C3e6aedB179C0b8e8aF0B5ACd062603
$ cast call 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63 "getVersion()(string)" --rpc-url https://rpc.mantle.xyz
"2.0.0"
$ cast call 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63 "getIdentityRegistry()(address)" --rpc-url https://rpc.mantle.xyz
0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
```

### 3.3 Does the real registry have an `addOperator` / allowlist? — **No.**
Source: `contracts/ReputationRegistryUpgradeable.sol` in `erc-8004/erc-8004-contracts` (385 lines, UUPS upgradeable, Ownable). Relevant external functions:

- `giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)` — **permissionless**, the *only* check is `!isAuthorizedOrOwner(msg.sender, agentId)` to prevent self-feedback.
- `revokeFeedback`, `appendResponse` — caller-scoped (your own feedback only).
- `readFeedback`, `getSummary`, `readAllFeedback`, `getClients`, `getLastIndex`, `getResponseCount` — view functions.
- `initialize(address identityRegistry_)` and `_authorizeUpgrade` — `onlyOwner` (the owner is `0x547289319C3e6aedB179C0b8e8aF0B5ACd062603`, an EOA).

**There is no `addOperator`, `setAllowlist`, `setRecorder`, `grantRole`, or any registrar pattern. Anyone can call `giveFeedback` already.** The "allowlist" never existed in this standard.

### 3.4 Then what *actually* gates `recordJobCompletion`?
The facilitator calls `recordJobCompletion(uint256 skillId, uint8 reputationScore)`
on **LedgerForge’s own `SkillRegistry`** (`0x37041F257Bf8f1E201497Dc0BCDa1ae0d8317992`),
not on the ERC-8004 registry. That contract gates the call with its own
`allowedFacilitators` mapping (set by `allowFacilitator(address)` which is
`onlyOwner`). On-chain check:

```
$ cast call 0x37041F257Bf8f1E201497Dc0BCDa1ae0d8317992 "owner()(address)" --rpc-url https://rpc.mantle.xyz
0xC0296012Cfbb0e6DF5dA7158B65Dbc46DD9650e0       ← deployer == operator

$ cast call 0x37041F257Bf8f1E201497Dc0BCDa1ae0d8317992 "allowedFacilitators(address)(bool)" \
            0xC0296012Cfbb0e6DF5dA7158B65Dbc46DD9650e0 --rpc-url https://rpc.mantle.xyz
true                                              ← already allowlisted

$ cast call 0x37041F257Bf8f1E201497Dc0BCDa1ae0d8317992 "totalSkills()(uint256)" --rpc-url https://rpc.mantle.xyz
15
```

**Conclusion:** the facilitator operator wallet is already on the only
allowlist that exists in this stack. If `recordJobCompletion` is failing
silently in production, it is almost certainly **not** an allowlist issue —
look at gas, the `whenNotPaused` modifier, `SkillNotActive` (skill must be
`active`), `SkillNotFound` (id out of range), or `InvalidScore` (>100).
And `SkillRegistry.recordJobCompletion` itself never calls into the ERC-8004
registry — it just updates local storage and emits `JobCompleted`. So the
state of `0x8004B663…` has no effect on whether that call reverts.

### 3.5 Self-call attempt
We **did not** broadcast a transaction. There is no function on
`0x8004B663…` to call (zero bytecode → any tx becomes a plain MNT transfer,
which would only waste gas). The operator wallet has 6.44 MNT and nonce 57
on mainnet, so it is funded and active and *could* sign anything we asked
it to — but nothing useful exists to send to. A self-call against the real
mainnet registry (`0x8004BAa17…`) is unnecessary because `giveFeedback`
already accepts unauthenticated callers.

---

## 4. Recommended next steps (in order)

### Step 0 (probably the only step you need) — fix the env, not the allowlist
1. Update `.env` and any infra secrets:
   ```
   ERC8004_IDENTITY_REGISTRY=0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
   ERC8004_REPUTATION_REGISTRY=0x8004BAa17C55a88189AE136b182e5fdA19dE9b63
   ```
2. Update the `@dev Canonical address on Mantle: …` comments in
   `contracts/src/interfaces/IERC8004Identity.sol` and
   `…/IERC8004Reputation.sol`, plus the
   `address public constant ERC8004_IDENTITY = …` in
   `contracts/src/SkillRegistry.sol` (currently still pointing at the
   testnet address).
3. Re-deploy `SkillRegistry` (or pause+migrate skills) so the
   `ERC8004_IDENTITY` constant points at the real mainnet identity
   registry. The interface mismatch is bigger: the actual ABI is
   `giveFeedback(uint256, int128, uint8, string, string, string, string, bytes32)`,
   **not** the `giveFeedback(uint256, uint8, string, string)` currently in
   `IERC8004Reputation.sol`. Update the interface and any caller before
   relying on it.
4. Confirm `recordJobCompletion` succeeds end-to-end with `totalJobs` and
   `totalScore` incrementing in `SkillRegistry`, and `JobCompleted` events
   showing up in the indexer. (The operator wallet is *already* in
   `allowedFacilitators` — verified above.)

### Step 1 — only if you still want confirmation from upstream
**Fastest single channel:** post in the Mantle Turing Test Hackathon
Telegram (<https://t.me/MantleTuringTestHackathon>) and ping `@finn` for a
20-second sanity check on the canonical mainnet address. If no response
within 24 h, email <mailto:finn.li@mantle.xyz> and CC
<mailto:stella.zhou@mantle.xyz> with the drafted message in section 1.
For the standard-side confirmation, open a public issue at
<https://github.com/erc-8004/erc-8004-contracts/issues/new> titled
*“Confirm canonical Mantle mainnet ReputationRegistry address”* — that
creates a paper trail you can cite in the hackathon submission.

### Step 2 — community discoverability (low priority)
Drop a one-liner in the Mantle Discord `#dev-zone` (<https://discord.gg/mantle>)
linking the GitHub issue so other Turing Test teams hit the same fix.

---

*Last updated: 2026-05-28. All on-chain checks against `https://rpc.mantle.xyz` (chain id 5000).*
