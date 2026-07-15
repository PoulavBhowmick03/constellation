"use client";

import { useEffect, useRef, useState } from "react";
import { firmScenarios, mockAgentReports, type KyaReport } from "./data";
import {
  callTreasuryTool,
  DEFAULT_TREASURY_MCP_URL,
  type McpPaymentRequired,
} from "./mcpClient";

type Tab = "treasury" | "kya" | "firm";
type PaidTool = "get_revenue_report" | "get_expense_report" | "export_statement";

type RegistrationChallenge = {
  challenge: { nonce: string; message: string; expires_in_seconds: number };
};

type RegistrationResult = {
  ok: true;
  wallet_id: string;
  indexed_from_block: number;
};

type AtomicAmount = { token?: string; amount: string; decimals: number };

type RunwayResult = {
  okb_balance: AtomicAmount;
  avg_daily_gas_7d: AtomicAmount;
  runway_days: number | null;
  as_of: string;
};

type PaidProbe =
  | { kind: "payment_required"; challenge: McpPaymentRequired }
  | { kind: "live_response"; data: unknown };

const PAID_TOOLS: Array<{ tool: PaidTool; title: string; price: string }> = [
  { tool: "get_revenue_report", title: "Revenue Report", price: "0.10 USDT" },
  { tool: "get_expense_report", title: "Expense Report", price: "0.10 USDT" },
  { tool: "export_statement", title: "Statement Export", price: "0.20 USDT" },
];

const COMPONENT_LABELS: Record<keyof KyaReport["components"], string> = {
  identity_continuity: "Identity continuity",
  feedback_graph: "Feedback graph",
  registration_hygiene: "Registration hygiene",
  longevity_activity: "Longevity & activity",
};

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("treasury");
  const endpoint = process.env.NEXT_PUBLIC_TREASURY_MCP_URL ?? DEFAULT_TREASURY_MCP_URL;

  const [address, setAddress] = useState("");
  const [challenge, setChallenge] = useState<RegistrationChallenge["challenge"] | null>(null);
  const [signature, setSignature] = useState("");
  const [registration, setRegistration] = useState<RegistrationResult | null>(null);
  const [walletId, setWalletId] = useState("");
  const [runway, setRunway] = useState<RunwayResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [treasuryError, setTreasuryError] = useState<string | null>(null);
  const [paidProbes, setPaidProbes] = useState<Partial<Record<PaidTool, PaidProbe>>>({});

  const [activeAgent, setActiveAgent] = useState<keyof typeof mockAgentReports>("agent_good");
  const agentReport = mockAgentReports[activeAgent] as KyaReport;

  const [activeScenarioId, setActiveScenarioId] = useState("happy_path");
  const scenario = firmScenarios.find((item) => item.id === activeScenarioId) ?? firmScenarios[0];
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [playState, setPlayState] = useState<"idle" | "playing" | "paused">("idle");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setCurrentStepIndex(0);
    setPlayState("idle");
    if (timerRef.current) clearInterval(timerRef.current);
  }, [activeScenarioId]);

  useEffect(() => {
    if (playState !== "playing") {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      setCurrentStepIndex((previous) => {
        if (previous >= scenario.steps.length - 1) {
          setPlayState("paused");
          return previous;
        }
        return previous + 1;
      });
    }, 1800);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [playState, scenario.steps.length]);

  async function requestChallenge() {
    if (!/^0x[0-9a-fA-F]{40}$/.test(address.trim())) {
      setTreasuryError("Enter a valid 0x wallet address before requesting a challenge.");
      return;
    }
    setBusy("challenge");
    setTreasuryError(null);
    setChallenge(null);
    setRegistration(null);
    setRunway(null);
    try {
      const response = await callTreasuryTool<RegistrationChallenge | { error: unknown }>(
        "register_wallet",
        { address: address.trim() },
      );
      if (response.kind === "payment_required") {
        throw new Error("The free register_wallet tool unexpectedly requested payment.");
      }
      const error = readToolError(response.data);
      if (error) throw new Error(error);
      if (!isRegistrationChallenge(response.data)) {
        throw new Error("register_wallet returned an unexpected challenge shape");
      }
      setChallenge(response.data.challenge);
    } catch (error) {
      setTreasuryError(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function submitRegistration() {
    if (!challenge || signature.trim().length === 0) {
      setTreasuryError("Sign the exact live challenge message in your wallet, then paste the signature.");
      return;
    }
    setBusy("register");
    setTreasuryError(null);
    try {
      const response = await callTreasuryTool<RegistrationResult | { error: unknown }>(
        "register_wallet",
        {
          address: address.trim(),
          nonce: challenge.nonce,
          signature: signature.trim(),
        },
      );
      if (response.kind === "payment_required") {
        throw new Error("The free register_wallet tool unexpectedly requested payment.");
      }
      const error = readToolError(response.data);
      if (error) throw new Error(error);
      if (!isRegistrationResult(response.data)) {
        throw new Error("register_wallet returned an unexpected registration shape");
      }
      setRegistration(response.data);
      setWalletId(response.data.wallet_id);
      await fetchRunway(response.data.wallet_id);
    } catch (error) {
      setTreasuryError(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function fetchRunway(id = walletId.trim()) {
    if (!id) {
      setTreasuryError("Register a wallet or paste an existing registered wallet_id first.");
      return;
    }
    setBusy("runway");
    setTreasuryError(null);
    setRunway(null);
    try {
      const response = await callTreasuryTool<RunwayResult | { error: unknown }>("get_runway", {
        wallet_id: id,
      });
      if (response.kind === "payment_required") {
        throw new Error("The free get_runway tool unexpectedly requested payment.");
      }
      const error = readToolError(response.data);
      if (error) throw new Error(error);
      if (!isRunwayResult(response.data)) {
        throw new Error("get_runway returned an unexpected result shape");
      }
      setWalletId(id);
      setRunway(response.data);
    } catch (error) {
      setTreasuryError(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function probePaidTool(tool: PaidTool) {
    if (!walletId.trim()) {
      setTreasuryError("A registered wallet_id is required to request the live payment challenge.");
      return;
    }
    setBusy(tool);
    setTreasuryError(null);
    try {
      const args =
        tool === "export_statement"
          ? { wallet_id: walletId.trim(), period: {}, format: "json" }
          : { wallet_id: walletId.trim(), period: {} };
      const response = await callTreasuryTool<unknown>(tool, args);
      setPaidProbes((previous) => ({
        ...previous,
        [tool]:
          response.kind === "payment_required"
            ? { kind: "payment_required", challenge: response }
            : { kind: "live_response", data: response.data },
      }));
    } catch (error) {
      setTreasuryError(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="gridBackground" />
      <div className="appContainer">
        <header className="header">
          <div className="logoArea">
            <div className="logoText">CONSTELLATION</div>
            <div className="badge"><span className="pulseDot" /> TREASURY LIVE</div>
          </div>
          <nav className="tabsContainer" aria-label="Product views">
            <TabButton active={activeTab === "treasury"} onClick={() => setActiveTab("treasury")}>Treasury Copilot</TabButton>
            <TabButton active={activeTab === "kya"} onClick={() => setActiveTab("kya")}>KYA — Roadmap</TabButton>
            <TabButton active={activeTab === "firm"} onClick={() => setActiveTab("firm")}>The Firm — Simulation</TabButton>
          </nav>
        </header>

        {activeTab === "treasury" && (
          <main className="dashboardGrid">
            <section className="card">
              <div className="cardHeader">
                <div>
                  <h1 className="cardTitle"><span className="textGreen">●</span> Live Treasury MCP</h1>
                  <p className="cardSubtitle">Every value in this panel comes from the deployed backend.</p>
                </div>
                <span className="flagBadge flagGreen">LIVE DATA</span>
              </div>

              <div className="endpointBar">
                <span className="textMuted">MCP endpoint</span>
                <code>{endpoint}</code>
              </div>

              {treasuryError && <div className="notice noticeError">{treasuryError}</div>}

              <div className="sectionBlock">
                <div className="sectionHeading">
                  <div><span className="stepNumber">1</span><strong>Request a live EIP-191 challenge</strong></div>
                  <span className="textMuted">Free</span>
                </div>
                <label className="fieldLabel" htmlFor="wallet-address">Wallet address</label>
                <div className="inputRow">
                  <input
                    id="wallet-address"
                    className="textInput mono"
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                    placeholder="0x…"
                    autoComplete="off"
                  />
                  <button className="btn btnPrimary" onClick={requestChallenge} disabled={busy !== null}>
                    {busy === "challenge" ? "Calling live MCP…" : "Request challenge"}
                  </button>
                </div>

                {challenge && (
                  <div className="liveResult">
                    <div className="resultHeader"><span className="textGreen">LIVE RESPONSE</span><span>expires in {challenge.expires_in_seconds}s</span></div>
                    <div className="keyValue"><span>Nonce</span><code>{challenge.nonce}</code></div>
                    <label className="fieldLabel" htmlFor="challenge-message">Sign this exact message in your wallet</label>
                    <textarea id="challenge-message" className="textArea mono" readOnly value={challenge.message} rows={4} />
                  </div>
                )}
              </div>

              <div className="sectionBlock">
                <div className="sectionHeading">
                  <div><span className="stepNumber">2</span><strong>Sign in your wallet and register</strong></div>
                  <span className="flagBadge flagOrange">NO WALLET CONNECTED</span>
                </div>
                <p className="helperText">This dashboard never invents a signature. Sign the message above using your wallet, then paste the real EIP-191 signature here.</p>
                <label className="fieldLabel" htmlFor="wallet-signature">Wallet signature</label>
                <textarea
                  id="wallet-signature"
                  className="textArea mono"
                  value={signature}
                  onChange={(event) => setSignature(event.target.value)}
                  placeholder="0x…"
                  rows={3}
                  disabled={!challenge}
                />
                <button className="btn btnPrimary" onClick={submitRegistration} disabled={!challenge || busy !== null}>
                  {busy === "register" ? "Verifying live signature…" : "Submit live registration"}
                </button>

                {registration && (
                  <div className="notice noticeSuccess">
                    <strong>LIVE REGISTRATION CONFIRMED</strong>
                    <span>wallet_id: <code>{registration.wallet_id}</code></span>
                    <span>indexed from block: {registration.indexed_from_block}</span>
                  </div>
                )}
              </div>

              <div className="sectionBlock">
                <div className="sectionHeading">
                  <div><span className="stepNumber">3</span><strong>Fetch live runway</strong></div>
                  <span className="textMuted">Free</span>
                </div>
                <p className="helperText">Use the wallet_id returned above, or paste an already registered live wallet_id.</p>
                <div className="inputRow">
                  <input
                    className="textInput mono"
                    value={walletId}
                    onChange={(event) => setWalletId(event.target.value)}
                    placeholder="w_…"
                    autoComplete="off"
                  />
                  <button className="btn btnPrimary" onClick={() => fetchRunway()} disabled={busy !== null}>
                    {busy === "runway" ? "Fetching live data…" : "Get live runway"}
                  </button>
                </div>

                {runway && (
                  <div className="liveResult">
                    <div className="resultHeader"><span className="textGreen">LIVE CHAIN-DERIVED RESPONSE</span><span>{runway.as_of}</span></div>
                    <div className="statGrid">
                      <Metric label="Native OKB balance" value={formatAtomic(runway.okb_balance, "OKB")} tone="green" />
                      <Metric label="Average daily gas (7d)" value={formatAtomic(runway.avg_daily_gas_7d, "OKB")} tone="purple" />
                    </div>
                    <div className="runwayValue">
                      <span>Estimated runway</span>
                      <strong>{runway.runway_days === null ? "N/A — no recent gas spend" : `${runway.runway_days} days`}</strong>
                    </div>
                  </div>
                )}
              </div>
            </section>

            <aside className="card">
              <div className="cardHeader">
                <div>
                  <h2 className="cardTitle">Paid tools</h2>
                  <p className="cardSubtitle">Request the genuine x402 challenge. This dashboard cannot pay.</p>
                </div>
              </div>
              <div className="notice noticeWarning">
                <strong>NO PAYMENT WILL BE SENT</strong>
                <span>No payment signature, settlement claim, transaction hash, or explorer link is generated here.</span>
              </div>
              <div className="paidToolList">
                {PAID_TOOLS.map(({ tool, title, price }) => {
                  const probe = paidProbes[tool];
                  return (
                    <div className="paidToolCard" key={tool}>
                      <div className="paidToolTitle"><div><strong>{title}</strong><code>{tool}</code></div><span>{price}</span></div>
                      <button className="btn btnSecondary" onClick={() => probePaidTool(tool)} disabled={!walletId.trim() || busy !== null}>
                        {busy === tool ? "Requesting…" : "Request live payment challenge"}
                      </button>
                      {probe?.kind === "payment_required" && (
                        <div className="paymentChallenge">
                          <strong>PAYMENT REQUIRED — PAY VIA OKX x402</strong>
                          <span>{probe.challenge.message}</span>
                          <pre>{JSON.stringify(probe.challenge.payment, null, 2)}</pre>
                        </div>
                      )}
                      {probe?.kind === "live_response" && (
                        <div className="paymentChallenge">
                          <strong>LIVE RESPONSE — NO PAYMENT SUBMITTED BY DASHBOARD</strong>
                          <pre>{JSON.stringify(probe.data, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </aside>
          </main>
        )}

        {activeTab === "kya" && (
          <main>
            <IntegrityBanner>KYA MOCK / ROADMAP — fixture scores only; no live ERC-8004 data and no verifier call.</IntegrityBanner>
            <div className="dashboardGrid">
              <section className="card">
                <div className="cardHeader">
                  <div><h1 className="cardTitle">KYA fixture scorecard</h1><p className="cardSubtitle">Illustrative heuristic output, not a live product response.</p></div>
                  <select className="selectInput" value={activeAgent} onChange={(event) => setActiveAgent(event.target.value as keyof typeof mockAgentReports)}>
                    <option value="agent_good">agent_good</option>
                    <option value="agent_transferred_identity">agent_transferred_identity</option>
                    <option value="agent_sybil_burst">agent_sybil_burst</option>
                  </select>
                </div>
                <div className="componentList">
                  {(Object.keys(agentReport.components) as Array<keyof KyaReport["components"]>).map((key) => {
                    const component = agentReport.components[key];
                    return (
                      <div key={key}>
                        <div className="componentRow"><span>{COMPONENT_LABELS[key]} ({Math.round(component.weight * 100)}%)</span><strong>{component.score}/100</strong></div>
                        <div className="componentBarContainer"><div className="componentBar bgPurple" style={{ width: `${component.score}%` }} /></div>
                        <pre className="evidenceBlock">{JSON.stringify(component.evidence, null, 2)}</pre>
                      </div>
                    );
                  })}
                </div>
              </section>
              <aside className="card scoreCard">
                <span className="flagBadge flagOrange">FIXTURE SCORE — NOT LIVE ERC-8004 DATA</span>
                <div className="scoreCircle" style={{ background: `radial-gradient(var(--bg-surface-solid) 60%, transparent 62%), conic-gradient(var(--color-purple) ${agentReport.score}%, rgba(255,255,255,0.03) ${agentReport.score}%)`, borderRadius: "50%" }}>
                  <span className="scoreValue">{agentReport.score}</span>
                </div>
                <div className="flagList">
                  {agentReport.flags.length === 0 ? <span className="flagBadge flagGreen">FIXTURE: NO FLAGS</span> : agentReport.flags.map((flag) => <span className="flagBadge flagRed" key={flag}>{flag}</span>)}
                </div>
                <div className="notice noticeWarning"><strong>ZK TIER: ROADMAP</strong><span>No proof is shown and no verifier was called.</span></div>
              </aside>
            </div>
          </main>
        )}

        {activeTab === "firm" && (
          <main>
            <IntegrityBanner>THE FIRM SIMULATION — no orchestrator, marketplace call, payment, or transaction was executed.</IntegrityBanner>
            <div className="dashboardGrid">
              <section className="card">
                <div className="cardHeader">
                  <div><h1 className="cardTitle">Illustrative workflow timeline</h1><p className="cardSubtitle">Roadmap fixture playback only.</p></div>
                  <select className="selectInput" value={activeScenarioId} onChange={(event) => setActiveScenarioId(event.target.value)}>
                    {firmScenarios.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
                  </select>
                </div>
                <div className="timelineWrapper">
                  <div className="timelineConnector" />
                  <div className="timelineConnectorProgress" style={{ height: `${(currentStepIndex / Math.max(1, scenario.steps.length - 1)) * 95}%` }} />
                  {scenario.steps.map((step, index) => (
                    <div className="timelineNode" key={`${step.nodeId}-${index}`}>
                      <div className={`nodeDot ${index < currentStepIndex ? "nodeDotCompleted" : index === currentStepIndex ? "nodeDotActive" : ""}`}>{index + 1}</div>
                      <div className={`nodeContent ${index === currentStepIndex ? "nodeContentActive" : ""}`}>
                        <div className="nodeTitle"><span>{step.title}</span><span className="nodeStatusLabel">{index < currentStepIndex ? "Previewed" : index === currentStepIndex ? "Viewing" : "Queued"}</span></div>
                        <p className="nodeDesc">{step.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="controlsRow">
                  <button className="btn btnSecondary" onClick={() => setCurrentStepIndex((value) => Math.max(0, value - 1))} disabled={currentStepIndex === 0 || playState === "playing"}>Back</button>
                  <button className="btn btnPrimary" onClick={() => setPlayState(playState === "playing" ? "paused" : "playing")} disabled={currentStepIndex === scenario.steps.length - 1}>{playState === "playing" ? "Pause fixture" : "Play fixture"}</button>
                  <button className="btn btnSecondary" onClick={() => setCurrentStepIndex((value) => Math.min(scenario.steps.length - 1, value + 1))} disabled={currentStepIndex === scenario.steps.length - 1 || playState === "playing"}>Next</button>
                  <button className="btn btnSecondary" onClick={() => { setCurrentStepIndex(0); setPlayState("idle"); }}>Reset</button>
                </div>
              </section>
              <aside className="card">
                <div className="cardHeader"><div><h2 className="cardTitle">Fixture notes</h2><p className="cardSubtitle">Not an execution log.</p></div></div>
                <div className="notice noticeWarning"><strong>SIMULATION — NO ORCHESTRATOR EXECUTED</strong><span>These steps illustrate intended control flow only.</span></div>
                <div className="terminal"><div className="terminalHeader"><span>roadmap_preview.txt</span></div><p>{scenario.steps[currentStepIndex]?.description}</p></div>
                <div className="notice"><strong>NO RECEIPTS GENERATED</strong><span>No procurement payment, KYA call, treasury export, or provenance artifact is represented as real.</span></div>
              </aside>
            </div>
          </main>
        )}
      </div>
    </>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button className={`tabButton ${active ? "tabActive" : ""}`} onClick={onClick}>{children}</button>;
}

function IntegrityBanner({ children }: { children: React.ReactNode }) {
  return <div className="integrityBanner"><span className="flagBadge flagOrange">NOT LIVE</span><strong>{children}</strong></div>;
}

function Metric({ label, value, tone }: { label: string; value: string; tone: "green" | "purple" }) {
  return <div className="statItem"><div className={`statValue ${tone === "green" ? "textGreen" : "textPurple"}`}>{value}</div><div className="statLabel">{label}</div></div>;
}

function formatAtomic(value: AtomicAmount, fallbackToken: string): string {
  if (!/^\d+$/.test(value.amount) || !Number.isInteger(value.decimals) || value.decimals < 0) return value.amount;
  const padded = value.amount.padStart(value.decimals + 1, "0");
  const split = padded.length - value.decimals;
  const whole = padded.slice(0, split);
  const fraction = value.decimals === 0 ? "" : padded.slice(split).replace(/0+$/, "").slice(0, 6);
  return `${whole}${fraction ? `.${fraction}` : ""} ${value.token ?? fallbackToken}`;
}

function readToolError(value: unknown): string | null {
  if (!isRecord(value) || !isRecord(value.error)) return null;
  return typeof value.error.message === "string" ? value.error.message : "Treasury tool returned an error";
}

function isRegistrationChallenge(value: unknown): value is RegistrationChallenge {
  return isRecord(value) && isRecord(value.challenge) && typeof value.challenge.nonce === "string" && typeof value.challenge.message === "string" && typeof value.challenge.expires_in_seconds === "number";
}

function isRegistrationResult(value: unknown): value is RegistrationResult {
  return isRecord(value) && value.ok === true && typeof value.wallet_id === "string" && typeof value.indexed_from_block === "number";
}

function isRunwayResult(value: unknown): value is RunwayResult {
  return isRecord(value) && isAtomicAmount(value.okb_balance) && isAtomicAmount(value.avg_daily_gas_7d) && (typeof value.runway_days === "number" || value.runway_days === null) && typeof value.as_of === "string";
}

function isAtomicAmount(value: unknown): value is AtomicAmount {
  return isRecord(value) && typeof value.amount === "string" && typeof value.decimals === "number";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected dashboard error";
}
