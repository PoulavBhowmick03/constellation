# KYA heuristic engine

This package currently contains a fixture-driven, read-only scoring core and
transport-neutral handlers for the four KYA MCP tools. The handlers gate calls
through `@constellation/payment-adapter`; they do not import a payment SDK. No
live-chain collector or MCP transport has been added yet.

Because the ZK roadmap proof is not available, `attest_agent` uses the
`check_agent` price and returns `zk.available:false`. `verify_attestation`
returns `valid:false` until a verifier is injected. No transaction is sent.

`docs/INTERFACES.md` v0.1.0 fixes the four component weights and six flag
thresholds, but does not prescribe the point rubric inside each component. The
rubric is therefore isolated in `src/scoring.ts`:

- identity continuity: 100 without reputation-bearing transfer history;
  otherwise the elapsed fraction of the 30-day continuity window;
- feedback graph: 20 points for feedback volume, 40 for distinct reviewers, 20
  for reviewer distribution, and 20 for temporal distribution;
- registration hygiene: 65 points for a resolvable agent URI, 20 for reachable
  endpoints, and 15 for domain verification;
- longevity/activity: 60 points over the first 90 registered days and 40 points
  over active days in the trailing 30-day window.

This is an implementation rubric, not a change to the frozen response schema.
It should be confirmed by both humans before KYA is listed.
