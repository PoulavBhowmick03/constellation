"use client";

import { useEffect, useRef, useState } from "react";
import { firmScenarios, mockAgentReports, type KyaReport } from "./data";
import {
  callTreasuryTool,
  DEFAULT_TREASURY_MCP_URL,
  type McpPaymentRequired,
} from "./mcpClient";

type View = "treasury" | "kya" | "firm";
type PaidTool = "get_revenue_report" | "get_expense_report" | "export_statement";
type Format = "csv" | "json" | "md";

type RegistrationChallenge = { challenge: { nonce: string; message: string; expires_in_seconds: number } };
type RegistrationResult = { ok: true; wallet_id: string; indexed_from_block: number };
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

// Two REAL, on-chain-confirmed settlements against the live endpoint. These are
// genuine (buyer -> treasury, 0.10 USD₮0 each) — not fabricated demo data.
const REAL_SETTLEMENTS = [
  {
    tx: "0x87f8674c5e53b754ea20b71a67972c2b49f1033530af7fd20c89d58a55a2617d",
    payer: "0xc0296012cfbb0e6df5da7158b65dbc46dd9650e0",
    tool: "get_revenue_report",
  },
  {
    tx: "0xceaab66465959a25680c1efe6b37d71f0afea6cd115fd90a130288982280cc2b",
    payer: "0x212e82dc1d13b991d5318d970963f5ddfd81a178",
    tool: "get_revenue_report",
  },
];
const EXPLORER = "https://www.oklink.com/x-layer/tx/";

const PAID_TOOLS: Array<{ tool: PaidTool; title: string; price: string }> = [
  { tool: "get_revenue_report", title: "Revenue Report", price: "0.10 USD₮0" },
  { tool: "get_expense_report", title: "Expense Report", price: "0.10 USD₮0" },
  { tool: "export_statement", title: "Statement Export", price: "0.20 USD₮0" },
];

const COMPONENT_LABELS: Record<keyof KyaReport["components"], string> = {
  identity_continuity: "Identity continuity",
  feedback_graph: "Feedback graph",
  registration_hygiene: "Registration hygiene",
  longevity_activity: "Longevity & activity",
};

export default function Home() {
  const [view, setView] = useState<View>("treasury");
  const endpoint = process.env.NEXT_PUBLIC_TREASURY_MCP_URL ?? DEFAULT_TREASURY_MCP_URL;

  const [address, setAddress] = useState("");
  const [challenge, setChallenge] = useState<RegistrationChallenge["challenge"] | null>(null);
  const [signature, setSignature] = useState("");
  const [registration, setRegistration] = useState<RegistrationResult | null>(null);
  const [walletId, setWalletId] = useState("");
  const [runway, setRunway] = useState<RunwayResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paidProbes, setPaidProbes] = useState<Partial<Record<PaidTool, PaidProbe>>>({});
  const [format, setFormat] = useState<Format>("csv");
  const [receiptOpen, setReceiptOpen] = useState(false);

  const [activeAgent, setActiveAgent] = useState<keyof typeof mockAgentReports>("agent_good");
  const agentReport = mockAgentReports[activeAgent] as KyaReport;

  const [activeScenarioId, setActiveScenarioId] = useState("happy_path");
  const scenario = firmScenarios.find((i) => i.id === activeScenarioId) ?? firmScenarios[0];
  const [stepIndex, setStepIndex] = useState(0);
  const [playState, setPlayState] = useState<"idle" | "playing" | "paused">("idle");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setStepIndex(0);
    setPlayState("idle");
    if (timerRef.current) clearInterval(timerRef.current);
  }, [activeScenarioId]);

  useEffect(() => {
    if (playState !== "playing") {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      setStepIndex((p) => {
        if (p >= scenario.steps.length - 1) {
          setPlayState("paused");
          return p;
        }
        return p + 1;
      });
    }, 1800);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [playState, scenario.steps.length]);

  async function requestChallenge() {
    if (!/^0x[0-9a-fA-F]{40}$/.test(address.trim())) {
      setError("Enter a valid 0x wallet address before requesting a challenge.");
      return;
    }
    setBusy("challenge");
    setError(null);
    setChallenge(null);
    setRegistration(null);
    setRunway(null);
    try {
      const res = await callTreasuryTool<RegistrationChallenge | { error: unknown }>("register_wallet", {
        address: address.trim(),
      });
      if (res.kind === "payment_required") throw new Error("register_wallet unexpectedly requested payment.");
      const e = readToolError(res.data);
      if (e) throw new Error(e);
      if (!isRegistrationChallenge(res.data)) throw new Error("Unexpected challenge shape");
      setChallenge(res.data.challenge);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function submitRegistration() {
    if (!challenge || signature.trim().length === 0) {
      setError("Sign the live challenge message in your wallet, then paste the signature.");
      return;
    }
    setBusy("register");
    setError(null);
    try {
      const res = await callTreasuryTool<RegistrationResult | { error: unknown }>("register_wallet", {
        address: address.trim(),
        nonce: challenge.nonce,
        signature: signature.trim(),
      });
      if (res.kind === "payment_required") throw new Error("register_wallet unexpectedly requested payment.");
      const e = readToolError(res.data);
      if (e) throw new Error(e);
      if (!isRegistrationResult(res.data)) throw new Error("Unexpected registration shape");
      setRegistration(res.data);
      setWalletId(res.data.wallet_id);
      await fetchRunway(res.data.wallet_id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function fetchRunway(id = walletId.trim()) {
    if (!id) {
      setError("Register a wallet or paste a registered wallet_id first.");
      return;
    }
    setBusy("runway");
    setError(null);
    setRunway(null);
    try {
      const res = await callTreasuryTool<RunwayResult | { error: unknown }>("get_runway", { wallet_id: id });
      if (res.kind === "payment_required") throw new Error("get_runway unexpectedly requested payment.");
      const e = readToolError(res.data);
      if (e) throw new Error(e);
      if (!isRunwayResult(res.data)) throw new Error("Unexpected runway shape");
      setWalletId(id);
      setRunway(res.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function probePaidTool(tool: PaidTool) {
    if (!walletId.trim()) {
      setError("A registered wallet_id is required to request the live payment challenge.");
      return;
    }
    setBusy(tool);
    setError(null);
    try {
      const args =
        tool === "export_statement"
          ? { wallet_id: walletId.trim(), period: {}, format }
          : { wallet_id: walletId.trim(), period: {} };
      const res = await callTreasuryTool<unknown>(tool, args);
      setPaidProbes((prev) => ({
        ...prev,
        [tool]: res.kind === "payment_required" ? { kind: "payment_required", challenge: res } : { kind: "live_response", data: res.data },
      }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const runwayDays = runway?.runway_days ?? null;
  const gaugePct = runwayDays === null ? 0 : Math.min(runwayDays, 365) / 365;
  const dashOffset = 283 - 283 * gaugePct;

  return (
    <div className="flex min-h-screen bg-background font-body-md text-on-surface">
      <Sidebar view={view} setView={setView} />

      <main className="flex-1 md:ml-[240px] flex flex-col min-h-screen">
        <Header endpoint={endpoint} />

        <div className="flex-1 overflow-y-auto p-gutter scroll-hidden">
          <div className="max-w-[1280px] mx-auto space-y-6">
            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-body-md text-error">
                <span className="material-symbols-outlined text-[18px]">error</span>
                {error}
              </div>
            )}

            {view === "treasury" && (
              <TreasuryView
                {...{
                  address, setAddress, challenge, signature, setSignature, registration, walletId, setWalletId,
                  runway, busy, paidProbes, format, setFormat, dashOffset, runwayDays,
                  requestChallenge, submitRegistration, fetchRunway, probePaidTool, setReceiptOpen,
                }}
              />
            )}

            {view === "kya" && (
              <KyaView {...{ activeAgent, setActiveAgent, agentReport }} />
            )}

            {view === "firm" && (
              <FirmView {...{ activeScenarioId, setActiveScenarioId, scenario, stepIndex, setStepIndex, playState, setPlayState }} />
            )}
          </div>
        </div>
      </main>

      {receiptOpen && <ReceiptModal onClose={() => setReceiptOpen(false)} />}
    </div>
  );
}

/* ── Sidebar ────────────────────────────────────────────────────────── */
function Sidebar({ view, setView }: { view: View; setView: (v: View) => void }) {
  const nav: Array<{ id: View | null; icon: string; label: string }> = [
    { id: "treasury", icon: "dashboard", label: "Dashboard" },
    { id: "kya", icon: "verified_user", label: "Know Your Agent" },
    { id: "firm", icon: "hub", label: "The Firm" },
    { id: null, icon: "swap_horiz", label: "Transactions" },
    { id: null, icon: "code", label: "Developer" },
  ];
  return (
    <nav className="hidden md:flex fixed left-0 top-0 h-full w-[240px] bg-surface-container-lowest border-r border-outline-variant flex-col py-6 z-50">
      <div className="px-6 mb-8 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center border border-outline-variant">
          <span className="material-symbols-outlined text-primary">currency_exchange</span>
        </div>
        <div>
          <h1 className="font-headline-md text-[15px] font-bold text-primary leading-tight">Treasury Copilot</h1>
          <p className="text-[10px] text-on-surface-variant uppercase tracking-[0.14em]">Autonomous Finance</p>
        </div>
      </div>
      <ul className="flex-1 px-4 space-y-1">
        {nav.map((item) => {
          const active = item.id !== null && item.id === view;
          return (
            <li key={item.label}>
              <button
                onClick={() => item.id && setView(item.id)}
                disabled={item.id === null}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded text-body-md transition-colors ${
                  active
                    ? "text-primary font-semibold border-l-2 border-primary bg-surface-container-low"
                    : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface disabled:opacity-40 disabled:hover:bg-transparent"
                }`}
              >
                <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                {item.label}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="px-4 mt-auto pt-6 border-t border-outline-variant">
        <div className="flex items-center gap-3 px-3 py-2 text-label-sm text-on-surface-variant">
          <span className="w-2 h-2 rounded-full bg-primary glow-active" />
          Endpoint: Online
        </div>
      </div>
    </nav>
  );
}

/* ── Header ─────────────────────────────────────────────────────────── */
function Header({ endpoint }: { endpoint: string }) {
  return (
    <header className="h-16 px-gutter flex items-center justify-between border-b border-outline-variant bg-surface/90 backdrop-blur sticky top-0 z-40">
      <div className="flex items-center gap-4 min-w-0">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary-container/30 bg-primary-container/10 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-primary glow-active" />
          <span className="text-label-sm text-primary uppercase tracking-wider">Live · X Layer</span>
        </div>
        <span className="font-data-mono text-data-mono text-on-surface-variant truncate">{endpoint}</span>
      </div>
      <div className="flex items-center gap-2 text-body-md text-on-surface shrink-0">
        <span className="material-symbols-outlined text-[18px] text-on-surface-variant">smart_toy</span>
        <span className="hidden sm:inline">OKX Agent #5863</span>
      </div>
    </header>
  );
}

/* ── Treasury view ──────────────────────────────────────────────────── */
type TreasuryProps = {
  address: string; setAddress: (v: string) => void;
  challenge: RegistrationChallenge["challenge"] | null; signature: string; setSignature: (v: string) => void;
  registration: RegistrationResult | null; walletId: string; setWalletId: (v: string) => void;
  runway: RunwayResult | null; busy: string | null; paidProbes: Partial<Record<PaidTool, PaidProbe>>;
  format: Format; setFormat: (f: Format) => void; dashOffset: number; runwayDays: number | null;
  requestChallenge: () => void; submitRegistration: () => void; fetchRunway: (id?: string) => void;
  probePaidTool: (t: PaidTool) => void; setReceiptOpen: (v: boolean) => void;
};

function TreasuryView(p: TreasuryProps) {
  return (
    <>
      <section>
        <h2 className="font-headline-md text-headline-md mb-4">Treasury Cockpit</h2>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Wallet card */}
          <div className="glass-panel rounded-xl p-card-padding md:col-span-4 flex flex-col justify-between min-h-[180px]">
            <div className="flex items-start justify-between mb-6">
              <div className="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center">
                <span className="material-symbols-outlined text-primary text-[24px]">account_balance_wallet</span>
              </div>
              <span className="text-label-sm text-on-surface-variant bg-surface-container px-2 py-1 rounded">
                {p.registration ? "Registered" : "Not registered"}
              </span>
            </div>
            <div>
              <p className="text-label-sm text-on-surface-variant uppercase tracking-wider mb-1">Wallet ID</p>
              <p className="font-data-mono text-data-mono text-on-surface break-all">
                {p.registration?.wallet_id ?? (p.walletId || "—")}
              </p>
              {p.registration && (
                <p className="text-label-sm text-on-surface-variant mt-1">indexed from block {p.registration.indexed_from_block}</p>
              )}
            </div>
          </div>

          {/* Runway gauge */}
          <div className="glass-panel rounded-xl p-card-padding md:col-span-4 flex items-center justify-center">
            <div className="relative w-32 h-32 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="none" stroke="#1f1f24" strokeWidth="8" />
                <circle
                  cx="50" cy="50" r="45" fill="none" stroke="#3dd3b0" strokeWidth="8" strokeLinecap="round"
                  strokeDasharray="283" strokeDashoffset={p.runwayDays === null ? 283 : p.dashOffset}
                  style={{ filter: "drop-shadow(0 0 4px rgba(61,211,176,0.5))", transition: "stroke-dashoffset 0.8s ease" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="font-headline-lg text-headline-lg text-on-surface">
                  {p.runwayDays === null ? "—" : p.runwayDays}
                </span>
                <span className="text-label-sm text-on-surface-variant uppercase">Days Left</span>
              </div>
            </div>
          </div>

          {/* Balance + gas */}
          <div className="md:col-span-4 grid grid-rows-2 gap-6">
            <div className="glass-panel rounded-xl p-card-padding flex flex-col justify-center">
              <p className="text-label-sm text-on-surface-variant uppercase tracking-wider mb-2">OKB Balance</p>
              <span className="font-headline-lg text-headline-lg text-on-surface break-all">
                {p.runway ? formatAmount(p.runway.okb_balance) : "—"}
              </span>
            </div>
            <div className="glass-panel rounded-xl p-card-padding flex flex-col justify-center">
              <p className="text-label-sm text-on-surface-variant uppercase tracking-wider mb-2">7d Avg Daily Gas</p>
              <div className="flex items-baseline gap-2">
                <span className="font-headline-md text-headline-md text-on-surface">
                  {p.runway ? formatAmount(p.runway.avg_daily_gas_7d) : "—"}
                </span>
                <span className="font-data-mono text-data-mono text-on-surface-variant">OKB</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Register + settlement showcase row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <RegisterPanel {...p} />
        <SettlementShowcase onOpen={() => p.setReceiptOpen(true)} />
      </div>

      {/* Revenue (paid) + export */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <PaidPanel {...p} />
        <ExportPanel {...p} />
      </div>
    </>
  );
}

function RegisterPanel(p: TreasuryProps) {
  return (
    <section className="lg:col-span-2 glass-panel rounded-xl p-card-padding">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-headline-md text-headline-md">Prove wallet ownership</h2>
        <span className="text-label-sm text-primary uppercase tracking-wider">Free · EIP-191</span>
      </div>
      <p className="text-body-md text-on-surface-variant mb-4">
        No custody, no connect. Request a challenge, sign it in your own wallet, and register — every value on this
        page then comes from the live endpoint.
      </p>

      <div className="grid sm:grid-cols-2 gap-3 mb-3">
        <input
          className="w-full bg-surface-container-low border border-outline-variant/50 rounded-lg px-3 py-2.5 font-data-mono text-data-mono text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/50"
          value={p.address} onChange={(e) => p.setAddress(e.target.value)} placeholder="0x… wallet address" autoComplete="off"
        />
        <button
          onClick={p.requestChallenge} disabled={p.busy !== null}
          className="bg-primary-container hover:bg-primary text-on-primary-container text-label-sm py-2.5 rounded-lg transition-colors disabled:opacity-40"
        >
          {p.busy === "challenge" ? "Calling live MCP…" : "1 · Request challenge"}
        </button>
      </div>

      {p.challenge && (
        <div className="rounded-lg border border-primary/20 bg-[#0A0B0F] p-3 mb-3">
          <div className="flex items-center justify-between text-label-sm text-on-surface-variant mb-2">
            <span className="text-primary">LIVE CHALLENGE</span>
            <span>expires in {p.challenge.expires_in_seconds}s</span>
          </div>
          <p className="font-data-mono text-[11px] text-on-surface-variant break-all whitespace-pre-wrap mb-3">{p.challenge.message}</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <input
              className="w-full bg-surface-container-low border border-outline-variant/50 rounded-lg px-3 py-2.5 font-data-mono text-data-mono text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/50"
              value={p.signature} onChange={(e) => p.setSignature(e.target.value)} placeholder="0x… signature from your wallet" autoComplete="off"
            />
            <button
              onClick={p.submitRegistration} disabled={p.busy !== null}
              className="bg-primary-container hover:bg-primary text-on-primary-container text-label-sm py-2.5 rounded-lg transition-colors disabled:opacity-40"
            >
              {p.busy === "register" ? "Verifying…" : "2 · Register"}
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mt-1">
        <input
          className="flex-1 bg-surface-container-low border border-outline-variant/50 rounded-lg px-3 py-2.5 font-data-mono text-data-mono text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/50"
          value={p.walletId} onChange={(e) => p.setWalletId(e.target.value)} placeholder="w_… (or paste a registered wallet_id)" autoComplete="off"
        />
        <button
          onClick={() => p.fetchRunway()} disabled={p.busy !== null}
          className="border border-outline-variant hover:border-primary hover:text-primary text-on-surface text-label-sm py-2.5 px-4 rounded-lg transition-colors disabled:opacity-40 whitespace-nowrap"
        >
          {p.busy === "runway" ? "Fetching…" : "Refresh runway"}
        </button>
      </div>
    </section>
  );
}

function SettlementShowcase({ onOpen }: { onOpen: () => void }) {
  const latest = REAL_SETTLEMENTS[0];
  return (
    <section className="glass-panel rounded-xl p-card-padding flex flex-col">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-2.5 h-2.5 rounded-full bg-primary pulse-dot" />
        <h2 className="font-headline-md text-headline-md">Proven settlement</h2>
      </div>
      <p className="text-body-md text-on-surface-variant mb-4">Real x402 payments, confirmed on X Layer.</p>
      <div className="rounded-lg bg-[#0A0B0F] border border-primary/20 p-4 mb-3">
        <p className="text-label-sm text-on-surface-variant uppercase tracking-widest mb-1">Amount settled</p>
        <div className="flex items-baseline gap-2 mb-3">
          <span className="font-headline-lg text-headline-lg text-primary">0.10</span>
          <span className="font-data-mono text-data-mono text-on-surface">USD₮0</span>
        </div>
        <div className="flex justify-between items-center text-body-md">
          <span className="text-on-surface-variant">Tx</span>
          <span className="font-data-mono text-[11px] text-on-surface bg-surface-container-low px-2 py-1 rounded">{truncate(latest.tx)}</span>
        </div>
      </div>
      <button onClick={onOpen} className="w-full bg-primary-container hover:bg-primary text-on-primary-container text-label-sm py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2">
        <span className="material-symbols-outlined text-[18px]">receipt_long</span>
        View settlement receipt
      </button>
    </section>
  );
}

function PaidPanel(p: TreasuryProps) {
  return (
    <section className="lg:col-span-2 glass-panel rounded-xl p-card-padding">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-headline-md text-headline-md">Paid reports</h2>
        <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">x402</span>
      </div>
      <p className="text-body-md text-on-surface-variant mb-4">
        Request the genuine 402 challenge. This dashboard never pays — settlement happens agent-side via OKX.
      </p>
      <div className="space-y-3">
        {PAID_TOOLS.filter((t) => t.tool !== "export_statement").map(({ tool, title, price }) => {
          const probe = p.paidProbes[tool];
          return (
            <div key={tool} className="rounded-lg bg-surface-container-low border border-outline-variant/40 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="font-body-md text-on-surface font-medium">{title}</span>
                  <span className="font-data-mono text-[11px] text-on-surface-variant">{tool}</span>
                </div>
                <span className="text-label-sm text-secondary">{price}</span>
              </div>
              <button
                onClick={() => p.probePaidTool(tool)} disabled={!p.walletId.trim() || p.busy !== null}
                className="border border-outline-variant hover:border-primary hover:text-primary text-on-surface text-label-sm py-2 px-4 rounded transition-colors disabled:opacity-40"
              >
                {p.busy === tool ? "Requesting…" : "Request 402 challenge"}
              </button>
              {probe?.kind === "payment_required" && (
                <div className="mt-3 rounded-lg border border-secondary/30 bg-secondary/10 p-3">
                  <p className="text-label-sm text-secondary uppercase mb-1">402 · Payment required — pay via OKX x402</p>
                  <pre className="font-data-mono text-[11px] text-secondary/90 whitespace-pre-wrap break-all">{JSON.stringify(probe.challenge.payment, null, 2)}</pre>
                </div>
              )}
              {probe?.kind === "live_response" && (
                <pre className="mt-3 rounded-lg border border-primary/20 bg-[#0A0B0F] p-3 font-data-mono text-[11px] text-on-surface-variant whitespace-pre-wrap break-all">{JSON.stringify(probe.data, null, 2)}</pre>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ExportPanel(p: TreasuryProps) {
  const probe = p.paidProbes.export_statement;
  return (
    <section className="glass-panel rounded-xl p-card-padding flex flex-col">
      <h2 className="font-headline-md text-headline-md mb-4">Export Statement</h2>
      <div className="flex p-1 bg-surface-container-low rounded-lg mb-4 border border-outline-variant/50">
        {(["csv", "json", "md"] as Format[]).map((f) => (
          <button
            key={f} onClick={() => p.setFormat(f)}
            className={`flex-1 py-1.5 rounded text-label-sm uppercase transition-colors ${
              p.format === f ? "bg-surface-container-high text-primary" : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            {f}
          </button>
        ))}
      </div>
      <div className="flex-1 bg-[#0A0B0F] border border-outline-variant/30 rounded-lg p-3 min-h-[120px] relative overflow-hidden">
        {probe?.kind === "payment_required" ? (
          <pre className="font-data-mono text-[11px] text-secondary/90 whitespace-pre-wrap break-all">{JSON.stringify(probe.challenge.payment, null, 2)}</pre>
        ) : probe?.kind === "live_response" ? (
          <pre className="font-data-mono text-[11px] text-on-surface-variant whitespace-pre-wrap break-all">{JSON.stringify(probe.data, null, 2)}</pre>
        ) : (
          <p className="font-data-mono text-[11px] text-on-surface-variant/60">Request the challenge to see the live x402 response for a .{p.format} statement.</p>
        )}
      </div>
      <button
        onClick={() => p.probePaidTool("export_statement")} disabled={!p.walletId.trim() || p.busy !== null}
        className="w-full mt-4 border border-outline-variant hover:border-primary hover:text-primary text-on-surface text-label-sm py-2 rounded transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
      >
        <span className="material-symbols-outlined text-[16px]">bolt</span>
        {p.busy === "export_statement" ? "Requesting…" : `Request .${p.format} (0.20 USD₮0)`}
      </button>
    </section>
  );
}

/* ── x402 receipt modal (real on-chain settlement) ──────────────────── */
function ReceiptModal({ onClose }: { onClose: () => void }) {
  const s = REAL_SETTLEMENTS[0];
  const steps = [
    { icon: "api", label: "Call Tool" },
    { icon: "lock", label: "402 Req" },
    { icon: "edit_document", label: "Sign EIP" },
    { icon: "swap_horiz", label: "Settle" },
    { icon: "check", label: "Success", done: true },
  ];
  return (
    <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-2xl my-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">currency_exchange</span>
            <span className="font-headline-md text-headline-md font-bold text-primary">Treasury Copilot</span>
          </div>
          <button onClick={onClose} className="text-label-sm text-on-surface-variant hover:text-primary flex items-center gap-1">
            <span className="material-symbols-outlined text-[16px]">close</span> Close
          </button>
        </div>

        <div className="flex items-center justify-between relative mb-10 px-2">
          <div className="absolute top-4 left-[8%] right-[8%] h-[1px] bg-primary/30 -z-10" />
          {steps.map((st) => (
            <div key={st.label} className="flex flex-col items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${st.done ? "bg-primary-container text-on-primary-container shadow-[0_0_15px_rgba(61,211,176,0.4)]" : "bg-surface-container-high border border-primary/30 text-primary"}`}>
                <span className="material-symbols-outlined text-[16px]">{st.icon}</span>
              </div>
              <span className={`text-label-sm uppercase ${st.done ? "text-primary" : "text-on-surface-variant"}`}>{st.label}</span>
            </div>
          ))}
        </div>

        <div className="max-w-lg mx-auto bg-[#14161D] border border-white/5 rounded-xl p-8 receipt-glow relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-bl-full blur-2xl pointer-events-none" />
          <div className="flex items-center gap-3 mb-8">
            <div className="w-3 h-3 rounded-full bg-primary pulse-dot" />
            <h2 className="font-headline-lg text-headline-lg">Settlement Complete</h2>
          </div>
          <div className="flex flex-col items-center py-8 border-y border-dashed border-outline-variant/50 mb-8">
            <span className="text-label-sm text-on-surface-variant uppercase mb-2 tracking-widest">Amount Settled</span>
            <div className="flex items-baseline gap-2">
              <span className="font-headline-xl text-headline-xl text-primary font-bold">0.10</span>
              <span className="font-headline-md text-headline-md">USD₮0</span>
            </div>
          </div>
          <div className="space-y-4">
            <Row label="Status" value={<span className="text-primary flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">done_all</span>Confirmed on X Layer</span>} />
            <Row label="Network" value={<span className="font-data-mono text-data-mono">eip155:196</span>} />
            <Row label="Payer" value={<span className="font-data-mono text-data-mono bg-surface-container-low px-2 py-1 rounded">{truncate(s.payer)}</span>} />
            <Row label="Transaction" value={<span className="font-data-mono text-data-mono bg-surface-container-low px-2 py-1 rounded">{truncate(s.tx)}</span>} />
          </div>
          <div className="mt-8 pt-6 border-t border-outline-variant/30 flex gap-4">
            <a href={`${EXPLORER}${s.tx}`} target="_blank" rel="noreferrer" className="flex-1 bg-primary-container hover:bg-primary text-on-primary-container text-label-sm py-3 rounded-lg uppercase tracking-wider transition-colors flex items-center justify-center gap-2">
              <span className="material-symbols-outlined text-[18px]">open_in_new</span> View Explorer
            </a>
            <button onClick={onClose} className="flex-1 border border-white/10 hover:bg-surface-container-high text-on-surface text-label-sm py-3 rounded-lg uppercase tracking-wider transition-colors">Done</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-body-md text-on-surface-variant">{label}</span>
      <span className="text-body-md">{value}</span>
    </div>
  );
}

/* ── KYA view (roadmap, honest) ─────────────────────────────────────── */
function KyaView({ activeAgent, setActiveAgent, agentReport }: {
  activeAgent: keyof typeof mockAgentReports; setActiveAgent: (v: keyof typeof mockAgentReports) => void; agentReport: KyaReport;
}) {
  return (
    <>
      <RoadmapBanner>KYA — fixture scores only. No live ERC-8004 data, no verifier call.</RoadmapBanner>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 glass-panel rounded-xl p-card-padding">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-headline-md text-headline-md">Agent scorecard</h2>
            <select
              value={activeAgent} onChange={(e) => setActiveAgent(e.target.value as keyof typeof mockAgentReports)}
              className="bg-surface-container-low border border-outline-variant/50 rounded-lg px-3 py-2 font-data-mono text-data-mono text-on-surface focus:outline-none"
            >
              <option value="agent_good">agent_good</option>
              <option value="agent_transferred_identity">agent_transferred_identity</option>
              <option value="agent_sybil_burst">agent_sybil_burst</option>
            </select>
          </div>
          <div className="space-y-4">
            {(Object.keys(agentReport.components) as Array<keyof KyaReport["components"]>).map((key) => {
              const c = agentReport.components[key];
              return (
                <div key={key}>
                  <div className="flex justify-between text-body-md mb-1.5">
                    <span className="text-on-surface-variant">{COMPONENT_LABELS[key]} ({Math.round(c.weight * 100)}%)</span>
                    <span className="font-data-mono text-data-mono">{c.score}/100</span>
                  </div>
                  <div className="h-1.5 bg-surface-container-high rounded-full overflow-hidden">
                    <div className="h-full bg-primary-container rounded-full" style={{ width: `${c.score}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
        <aside className="glass-panel rounded-xl p-card-padding flex flex-col items-center text-center">
          <span className="text-label-sm text-secondary uppercase mb-4">Fixture score</span>
          <div className="relative w-28 h-28 mb-4">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="45" fill="none" stroke="#1f1f24" strokeWidth="8" />
              <circle cx="50" cy="50" r="45" fill="none" stroke="#61f0cb" strokeWidth="8" strokeLinecap="round" strokeDasharray="283" strokeDashoffset={283 - 283 * (agentReport.score / 100)} />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center font-headline-lg text-headline-lg">{agentReport.score}</div>
          </div>
          <div className="flex flex-wrap gap-2 justify-center">
            {agentReport.flags.length === 0
              ? <span className="text-label-sm px-2 py-1 rounded-full bg-primary-container/10 text-primary border border-primary/20">No flags</span>
              : agentReport.flags.map((f) => <span key={f} className="text-label-sm px-2 py-1 rounded-full bg-error/10 text-error border border-error/20">{f}</span>)}
          </div>
        </aside>
      </div>
    </>
  );
}

/* ── The Firm view (simulation, honest) ─────────────────────────────── */
function FirmView({ activeScenarioId, setActiveScenarioId, scenario, stepIndex, setStepIndex, playState, setPlayState }: {
  activeScenarioId: string; setActiveScenarioId: (v: string) => void; scenario: (typeof firmScenarios)[number];
  stepIndex: number; setStepIndex: (fn: (v: number) => number) => void; playState: "idle" | "playing" | "paused"; setPlayState: (v: "idle" | "playing" | "paused") => void;
}) {
  return (
    <>
      <RoadmapBanner>The Firm — simulation only. No orchestrator, marketplace call, payment, or transaction executed.</RoadmapBanner>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 glass-panel rounded-xl p-card-padding">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-headline-md text-headline-md">Workflow timeline</h2>
            <select value={activeScenarioId} onChange={(e) => setActiveScenarioId(e.target.value)} className="bg-surface-container-low border border-outline-variant/50 rounded-lg px-3 py-2 font-data-mono text-data-mono text-on-surface focus:outline-none">
              {firmScenarios.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>
          <div className="space-y-2 mb-5">
            {scenario.steps.map((step, i) => (
              <div key={`${step.nodeId}-${i}`} className="flex gap-3 items-start">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-data-mono shrink-0 ${i < stepIndex ? "bg-primary-container text-on-primary-container" : i === stepIndex ? "bg-primary/20 text-primary border border-primary" : "bg-surface-container-high text-on-surface-variant"}`}>{i + 1}</div>
                <div>
                  <div className="text-body-md font-medium">{step.title}</div>
                  <div className="text-body-md text-on-surface-variant">{step.description}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setStepIndex((v) => Math.max(0, v - 1))} disabled={stepIndex === 0 || playState === "playing"} className="border border-outline-variant text-on-surface text-label-sm py-2 px-4 rounded disabled:opacity-40">Back</button>
            <button onClick={() => setPlayState(playState === "playing" ? "paused" : "playing")} disabled={stepIndex === scenario.steps.length - 1} className="bg-primary-container hover:bg-primary text-on-primary-container text-label-sm py-2 px-4 rounded disabled:opacity-40">{playState === "playing" ? "Pause" : "Play"}</button>
            <button onClick={() => setStepIndex((v) => Math.min(scenario.steps.length - 1, v + 1))} disabled={stepIndex === scenario.steps.length - 1 || playState === "playing"} className="border border-outline-variant text-on-surface text-label-sm py-2 px-4 rounded disabled:opacity-40">Next</button>
          </div>
        </section>
        <aside className="glass-panel rounded-xl p-card-padding">
          <h2 className="font-headline-md text-headline-md mb-4">Step detail</h2>
          <div className="bg-[#06070a] border border-outline-variant rounded-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-outline-variant text-label-sm text-on-surface-variant">roadmap_preview.txt</div>
            <p className="p-4 font-data-mono text-[12px] text-primary/80 leading-relaxed">{scenario.steps[stepIndex]?.description}</p>
          </div>
        </aside>
      </div>
    </>
  );
}

function RoadmapBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-dashed border-secondary/40 bg-secondary/5 px-4 py-3">
      <span className="text-label-sm px-2 py-0.5 rounded-full bg-secondary/15 text-secondary uppercase">Roadmap</span>
      <span className="text-body-md text-on-surface-variant">{children}</span>
    </div>
  );
}

/* ── helpers ────────────────────────────────────────────────────────── */
function truncate(hex: string): string {
  return hex.length > 14 ? `${hex.slice(0, 8)}…${hex.slice(-6)}` : hex;
}

function formatAmount(value: AtomicAmount): string {
  if (!/^\d+$/.test(value.amount) || !Number.isInteger(value.decimals) || value.decimals < 0) return value.amount;
  const padded = value.amount.padStart(value.decimals + 1, "0");
  const split = padded.length - value.decimals;
  const whole = padded.slice(0, split);
  const fraction = value.decimals === 0 ? "" : padded.slice(split).replace(/0+$/, "").slice(0, 6);
  return `${whole}${fraction ? `.${fraction}` : ""}`;
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
