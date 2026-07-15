"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { callTreasuryTool, DEFAULT_TREASURY_MCP_URL } from "../mcpClient";

type Insight = { severity: "info" | "watch" | "alert"; code: string; title: string; detail: string };
type Atomic = { token?: string; amount: string; decimals: number };
type Runway = {
  okb_balance: Atomic;
  avg_daily_gas_7d: Atomic;
  runway_days: number | null;
  as_of: string;
  insights?: Insight[];
};

const ENDPOINT = process.env.NEXT_PUBLIC_TREASURY_MCP_URL ?? DEFAULT_TREASURY_MCP_URL;

const SEV: Record<Insight["severity"], { icon: string; cls: string }> = {
  alert: { icon: "warning", cls: "text-error" },
  watch: { icon: "info", cls: "text-secondary" },
  info: { icon: "auto_awesome", cls: "text-primary" },
};

function fmt(a: Atomic): string {
  if (!/^\d+$/.test(a.amount)) return a.amount;
  const p = a.amount.padStart(a.decimals + 1, "0");
  const cut = p.length - a.decimals;
  const whole = p.slice(0, cut).replace(/^0+(?=\d)/, "");
  const frac = a.decimals === 0 ? "" : p.slice(cut).replace(/0+$/, "").slice(0, 4);
  return `${whole}${frac ? `.${frac}` : ""}`;
}

function Card() {
  const params = useSearchParams();
  const walletId = params.get("wallet_id") ?? "";
  const [runway, setRunway] = useState<Runway | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!walletId) return;
    setState("loading");
    callTreasuryTool<Runway>("get_runway", { wallet_id: walletId })
      .then((res) => {
        if (res.kind !== "success") throw new Error("payment unexpectedly required");
        setRunway(res.data);
        setState("idle");
      })
      .catch((e) => {
        setMsg(e instanceof Error ? e.message : "failed to load");
        setState("error");
      });
  }, [walletId]);

  const days = runway?.runway_days ?? null;
  const gaugePct = days === null ? 0 : Math.min(days, 365) / 365;
  const dashOffset = 283 - 283 * gaugePct;

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-6 font-body-md text-on-surface">
      <div className="w-full max-w-md">
        <div className="glass-panel rounded-xl p-6 receipt-glow relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-primary/10 rounded-bl-full blur-3xl pointer-events-none" />

          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">currency_exchange</span>
              <span className="font-headline-md text-headline-md font-bold text-primary">Treasury Copilot</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-primary-container/30 bg-primary-container/10">
              <span className="w-1.5 h-1.5 rounded-full bg-primary glow-active" />
              <span className="text-label-sm text-primary uppercase">Live</span>
            </div>
          </div>

          {!walletId && <p className="text-body-md text-on-surface-variant">Add a <code className="font-data-mono">?wallet_id=w_…</code> to the URL to render a live card.</p>}
          {state === "loading" && <p className="text-body-md text-on-surface-variant">Reading live X Layer data…</p>}
          {state === "error" && <p className="text-body-md text-error">Could not load this wallet: {msg}</p>}

          {runway && (
            <>
              <p className="font-data-mono text-data-mono text-on-surface-variant mb-6 break-all">{walletId}</p>

              <div className="flex items-center gap-6 mb-6">
                <div className="relative w-28 h-28 shrink-0">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="45" fill="none" stroke="#1f1f24" strokeWidth="8" />
                    <circle cx="50" cy="50" r="45" fill="none" stroke="#3dd3b0" strokeWidth="8" strokeLinecap="round"
                      strokeDasharray="283" strokeDashoffset={days === null ? 283 : dashOffset}
                      style={{ filter: "drop-shadow(0 0 4px rgba(61,211,176,0.5))" }} />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="font-headline-lg text-headline-lg">{days === null ? "—" : days}</span>
                    <span className="text-label-sm text-on-surface-variant uppercase">Days left</span>
                  </div>
                </div>
                <div className="flex-1 space-y-3">
                  <div>
                    <p className="text-label-sm text-on-surface-variant uppercase tracking-wider">OKB Balance</p>
                    <p className="font-headline-md text-headline-md">{fmt(runway.okb_balance)}</p>
                  </div>
                  <div>
                    <p className="text-label-sm text-on-surface-variant uppercase tracking-wider">7d Avg Gas</p>
                    <p className="font-data-mono text-data-mono">{fmt(runway.avg_daily_gas_7d)} OKB</p>
                  </div>
                </div>
              </div>

              {runway.insights && runway.insights.length > 0 && (
                <div className="space-y-2 mb-2">
                  {runway.insights.map((i) => {
                    const s = SEV[i.severity];
                    return (
                      <div key={i.code} className="flex gap-2 items-start">
                        <span className={`material-symbols-outlined text-[18px] ${s.cls}`}>{s.icon}</span>
                        <div>
                          <span className={`text-body-md font-medium ${s.cls}`}>{i.title}</span>
                          <span className="text-body-md text-on-surface-variant"> — {i.detail}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          <div className="mt-6 pt-4 border-t border-outline-variant/30 flex items-center justify-between text-label-sm text-on-surface-variant">
            <span>OKX Agent #5863 · X Layer</span>
            <span className="font-data-mono text-[11px] truncate max-w-[55%]">{ENDPOINT}</span>
          </div>
        </div>
        <p className="text-center text-label-sm text-on-surface-variant/60 mt-4">
          Non-custodial on-chain bookkeeping · verify at {ENDPOINT.replace("https://", "")}
        </p>
      </div>
    </main>
  );
}

export default function CardPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-background" />}>
      <Card />
    </Suspense>
  );
}
