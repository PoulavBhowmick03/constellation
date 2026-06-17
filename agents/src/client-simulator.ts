import "dotenv/config";
import { createPublicClient, http } from "viem";

type CheckStatus = "PASS" | "WARN" | "FAIL";

interface CheckResult {
  status: CheckStatus;
  detail: string;
}

interface PersonaOutcome {
  name: string;
  results: CheckResult[];
}

interface SkillRecord {
  skillId: number;
  name: string;
  endpoint: string;
  tier?: string;
  averageScore?: number;
}

interface SkillsResponse {
  skills: SkillRecord[];
  total: number;
}

interface StatsResponse {
  totalSkills: number;
  activeSkills: number;
  totalJobs: number;
  avgReputationScore: number;
  totalRevenue: number;
}

interface JobRecord {
  id: string;
  skillId: string;
  skillName: string;
  consumer: string;
  settlementTx: string;
  amount: string;
}

interface RoundContext {
  round: number;
  timestamp: string;
  coin: string;
  protocol: string;
  pageSize: string;
  sortField: string;
  lineageKey: string;
  dashboardUrl: string;
  facilitatorUrl: string;
  indexerUrl: string;
  spawnUrl: string;
  byrealUrl: string;
  mantleUrl: string;
}

interface ScoreSummary {
  pass: number;
  warn: number;
  fail: number;
}

const DASHBOARD_URL = process.env.CLIENT_SIM_DASHBOARD_URL ?? "https://dashboard-xi-sooty-72.vercel.app";
const FACILITATOR_URL =
  process.env.CLIENT_SIM_FACILITATOR_URL ?? "https://ledgerforge-facilitator.fly.dev";
const INDEXER_URL = process.env.CLIENT_SIM_INDEXER_URL ?? "https://ledgerforge-indexer.fly.dev";
const SPAWN_URL = process.env.CLIENT_SIM_SPAWN_URL ?? "https://ledgerforge-spawn.fly.dev";
const BYREAL_URL = process.env.CLIENT_SIM_BYREAL_URL ?? "https://ledgerforge-byreal.fly.dev";
const MANTLE_URL = process.env.CLIENT_SIM_MANTLE_URL ?? "https://ledgerforge-mantle.fly.dev";

const USDC_ADDRESS =
  process.env.USDC_ADDRESS ?? "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9";
const OPERATOR_ADDRESS =
  process.env.OPERATOR_ADDRESS ?? "0xC0296012Cfbb0e6DF5dA7158B65Dbc46DD9650e0";
const SKILL_REGISTRY_ADDRESS =
  process.env.SKILL_REGISTRY_ADDRESS ?? "0x37041F257Bf8f1E201497Dc0BCDa1ae0d8317992";
const ROUND_DELAY_MS = parseNumberArg("--delay-ms") ?? Number(process.env.CLIENT_SIM_DELAY_MS ?? "7000");
const MAX_ROUNDS =
  parseNumberArg("--max-rounds") ?? Number(process.env.CLIENT_SIM_MAX_ROUNDS ?? Number.POSITIVE_INFINITY);

const PERPS_COINS = ["BTC", "ETH", "SOL", "ARB"] as const;
const PROTOCOLS = ["merchant-moe", "agni-finance", "init-capital", "lendle"] as const;
const PAGE_SIZES = ["5", "10", "3"] as const;
const SORT_FIELDS = ["apr24h", "tvl", "volume24h"] as const;
const skillRegistryClient = createPublicClient({
  chain: {
    id: 5000,
    name: "Mantle",
    nativeCurrency: { name: "MNT", symbol: "MNT", decimals: 18 },
    rpcUrls: {
      default: { http: ["https://rpc.mantle.xyz"] },
      public: { http: ["https://rpc.mantle.xyz"] },
    },
  },
  transport: http("https://rpc.mantle.xyz"),
});
const SKILL_REGISTRY_ABI = [
  {
    type: "function",
    name: "totalSkills",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

let shouldStop = false;

process.on("SIGINT", () => {
  shouldStop = true;
});

process.on("SIGTERM", () => {
  shouldStop = true;
});

function parseNumberArg(flag: string): number | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  const raw = process.argv[index + 1];
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function summary(results: CheckResult[]): ScoreSummary {
  return results.reduce<ScoreSummary>(
    (acc, result) => {
      if (result.status === "PASS") acc.pass += 1;
      if (result.status === "WARN") acc.warn += 1;
      if (result.status === "FAIL") acc.fail += 1;
      return acc;
    },
    { pass: 0, warn: 0, fail: 0 },
  );
}

function push(results: CheckResult[], status: CheckStatus, detail: string): void {
  results.push({ status, detail });
}

function authHeader(persona: string): string {
  return `Bearer settled:0x${persona}:${Date.now()}`;
}

async function fetchText(url: string, init?: RequestInit): Promise<{ status: number; body: string }> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.text();
  return { status: response.status, body };
}

async function fetchJson(url: string, init?: RequestInit): Promise<{ status: number; data: unknown; raw: string }> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(20_000),
  });
  const raw = await response.text();
  try {
    return { status: response.status, data: JSON.parse(raw), raw };
  } catch {
    throw new Error(`Non-JSON response (${response.status}) from ${url}: ${raw.slice(0, 200)}`);
  }
}

function browserHeaders(referer: string, mobile = false): HeadersInit {
  return {
    "User-Agent": mobile
      ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"
      : "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    Accept: mobile ? "application/json,text/plain,*/*" : "text/html,application/xhtml+xml",
    Origin: DASHBOARD_URL,
    Referer: referer,
  };
}

function expectSkill(skills: SkillRecord[], name: string): SkillRecord {
  const skill = skills.find((candidate) => candidate.name === name);
  if (!skill) {
    throw new Error(`Skill "${name}" not found in /skills response`);
  }
  return skill;
}

async function loadSkills(ctx: RoundContext): Promise<SkillRecord[]> {
  const { data } = await fetchJson(`${ctx.indexerUrl}/skills`, {
    headers: browserHeaders(`${ctx.dashboardUrl}/bazaar`, false),
  });
  const payload = data as SkillsResponse;
  if (!Array.isArray(payload.skills)) {
    throw new Error(`/skills returned unexpected payload`);
  }
  return payload.skills;
}

async function runMaya(ctx: RoundContext): Promise<PersonaOutcome> {
  const results: CheckResult[] = [];

  try {
    const html = await fetchText(`${ctx.dashboardUrl}/bazaar`, {
      headers: browserHeaders(`${ctx.dashboardUrl}/bazaar`, false),
    });
    const endpoints = [...html.body.matchAll(/"endpoint":"([^"]+)"/g)].map((match) => match[1]);
    const contaminated = endpoints.filter((endpoint) => endpoint.includes("localhost"));
    if (contaminated.length > 0) {
      push(results, "FAIL", `Bazaar HTML contains localhost endpoint(s): ${contaminated.join(", ")}`);
    } else {
      push(results, "PASS", `Bazaar HTML contains no localhost endpoints`);
    }
  } catch (err) {
    push(results, "FAIL", `Bazaar page check failed: ${String(err)}`);
  }

  let skills: SkillRecord[] = [];
  try {
    skills = await loadSkills(ctx);
    const defi = skills.filter((skill) =>
      ["tvl", "rates", "price", "defi", "aave"].some((needle) => skill.name.toLowerCase().includes(needle)),
    );
    const bad = defi.filter((skill) => skill.endpoint.includes("localhost"));
    if (bad.length > 0) {
      push(results, "FAIL", `DeFi skills include localhost endpoint(s): ${bad.map((skill) => `${skill.skillId}:${skill.endpoint}`).join(", ")}`);
    } else {
      push(results, "PASS", `Found ${defi.length} DeFi skills with public endpoints`);
    }
  } catch (err) {
    push(results, "FAIL", `Indexer DeFi skill fetch failed: ${String(err)}`);
  }

  try {
    const ratesSkill = expectSkill(skills, "aave-v3-rates");
    const { data } = await fetchJson(
      `${ctx.facilitatorUrl}/payment-details?skillId=${ratesSkill.skillId}&amount=300000&asset=${USDC_ADDRESS}`,
      { headers: { Origin: ctx.dashboardUrl } },
    );
    const payment = data as Record<string, unknown>;
    if (payment.scheme === "exact" && payment.payTo === OPERATOR_ADDRESS) {
      push(results, "PASS", `payment-details for aave-v3-rates returned payTo=${String(payment.payTo)}`);
    } else {
      push(results, "FAIL", `payment-details mismatch: ${JSON.stringify(payment)}`);
    }
  } catch (err) {
    push(results, "FAIL", `payment-details check failed: ${String(err)}`);
  }

  try {
    const { data } = await fetchJson(`${ctx.mantleUrl}/aave-v3-rates?asset=USDC`, {
      headers: { Authorization: authHeader("MayaRates"), Origin: ctx.dashboardUrl },
    });
    const payload = data as Record<string, unknown>;
    if ("error" in payload) {
      push(results, "FAIL", `aave-v3-rates returned error`);
    } else {
      push(results, "PASS", `aave-v3-rates returned keys=${Object.keys(payload).join(",")}`);
    }
  } catch (err) {
    push(results, "FAIL", `aave-v3-rates fetch failed: ${String(err)}`);
  }

  try {
    const { data } = await fetchJson(`${ctx.mantleUrl}/mantle-tvl-monitor`, {
      headers: { Authorization: authHeader("MayaTvl") },
    });
    const payload = data as Record<string, unknown>;
    const tvlValue =
      (payload.data as Record<string, unknown> | undefined)?.totalTvl ??
      payload.totalTvl ??
      (payload.data as Record<string, unknown> | undefined)?.tvl ??
      payload.tvl;
    const tvl = Number(tvlValue);
    if (Number.isFinite(tvl) && tvl > 0) {
      push(results, "PASS", `mantle-tvl-monitor TVL=${tvl}`);
    } else {
      push(results, "FAIL", `mantle-tvl-monitor returned invalid TVL`);
    }
  } catch (err) {
    push(results, "FAIL", `mantle-tvl-monitor fetch failed: ${String(err)}`);
  }

  for (const symbol of ["USDC", "USDe"]) {
    try {
      const { data } = await fetchJson(`${ctx.mantleUrl}/token-price-feed?symbol=${encodeURIComponent(symbol)}`, {
        headers: { Authorization: authHeader(`MayaPrice${symbol}`), Origin: ctx.dashboardUrl },
      });
      const payload = data as Record<string, unknown>;
      if ("error" in payload) {
        push(results, "FAIL", `token-price-feed ${symbol} returned error`);
      } else {
        push(results, "PASS", `token-price-feed ${symbol} returned keys=${Object.keys(payload).join(",")}`);
      }
    } catch (err) {
      push(results, "FAIL", `token-price-feed ${symbol} failed: ${String(err)}`);
    }
  }

  return { name: "Maya", results };
}

async function runJake(ctx: RoundContext): Promise<PersonaOutcome> {
  const results: CheckResult[] = [];
  let skills: SkillRecord[] = [];

  try {
    skills = await loadSkills(ctx);
    const byreal = skills.filter((skill) => skill.name.includes("byreal"));
    push(results, "PASS", `Found ${byreal.length} Byreal skills`);
  } catch (err) {
    push(results, "FAIL", `Byreal skill discovery failed: ${String(err)}`);
  }

  try {
    const topPoolsSkill = expectSkill(skills, "byreal-top-pools");
    const { data } = await fetchJson(
      `${ctx.facilitatorUrl}/payment-details?skillId=${topPoolsSkill.skillId}&amount=50000&asset=${USDC_ADDRESS}`,
    );
    const payment = data as Record<string, unknown>;
    if ("payTo" in payment) {
      push(results, "PASS", `payment-details for byreal-top-pools returned payTo`);
    } else {
      push(results, "FAIL", `payment-details missing payTo for byreal-top-pools`);
    }
  } catch (err) {
    push(results, "FAIL", `Byreal payment-details failed: ${String(err)}`);
  }

  let firstPoolAddress: string | undefined;
  try {
    const { data } = await fetchJson(
      `${ctx.byrealUrl}/byreal/top-pools?sortField=${ctx.sortField}&pageSize=${ctx.pageSize}`,
      { headers: { Authorization: authHeader("JakeTopPools") } },
    );
    const payload = data as Record<string, unknown>;
    const nested = payload.data as Record<string, unknown> | undefined;
    const pools =
      Array.isArray(nested?.pools) ? nested?.pools :
      Array.isArray(nested) ? nested :
      Array.isArray(payload.pools) ? payload.pools :
      [];
    if (pools.length === 0) {
      push(results, "WARN", `top-pools returned 0 pools for sort=${ctx.sortField} pageSize=${ctx.pageSize}`);
    } else {
      const first = pools[0] as Record<string, unknown>;
      firstPoolAddress = String(first.address ?? first.poolAddress ?? first.id ?? "");
      push(results, "PASS", `top-pools returned ${pools.length} pool(s), first=${firstPoolAddress}`);
    }
  } catch (err) {
    push(results, "FAIL", `top-pools failed: ${String(err)}`);
  }

  if (firstPoolAddress) {
    try {
      const { status, data } = await fetchJson(
        `${ctx.byrealUrl}/byreal/pool-analysis?poolAddress=${encodeURIComponent(firstPoolAddress)}`,
        { headers: { Authorization: authHeader("JakePool") } },
      );
      const payload = data as Record<string, unknown>;
      if (status === 200 && payload.success) {
        push(results, "PASS", `pool-analysis succeeded for ${firstPoolAddress}`);
      } else if (status === 400 && "error" in payload) {
        push(results, "WARN", `pool-analysis rejected pool with 400: ${String(payload.error)}`);
      } else {
        push(results, "FAIL", `pool-analysis unexpected response: ${JSON.stringify(payload)}`);
      }
    } catch (err) {
      push(results, "FAIL", `pool-analysis failed: ${String(err)}`);
    }
  }

  try {
    const params = new URLSearchParams({
      walletAddress: OPERATOR_ADDRESS,
      inputMint: "So11111111111111111111111111111111111111112",
      outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      amount: "500000",
    });
    const { data } = await fetchJson(`${ctx.byrealUrl}/byreal/swap-preview?${params.toString()}`, {
      headers: { Authorization: authHeader("JakeSwap") },
    });
    const payload = data as Record<string, unknown>;
    if (payload.success || "data" in payload) {
      push(results, "PASS", `swap-preview GET works`);
    } else {
      push(results, "FAIL", `swap-preview GET returned unexpected payload`);
    }
  } catch (err) {
    push(results, "FAIL", `swap-preview GET failed: ${String(err)}`);
  }

  try {
    const { data } = await fetchJson(`${ctx.byrealUrl}/byreal/perps-signals?coin=${ctx.coin}`, {
      headers: { Authorization: authHeader("JakePerps") },
    });
    const payload = data as Record<string, unknown>;
    if ("error" in payload) {
      push(results, "FAIL", `perps-signals ${ctx.coin} returned error`);
    } else {
      push(results, "PASS", `perps-signals ${ctx.coin} returned keys=${Object.keys(payload).join(",")}`);
    }
  } catch (err) {
    push(results, "FAIL", `perps-signals ${ctx.coin} failed: ${String(err)}`);
  }

  return { name: "Jake", results };
}

async function runAlex(ctx: RoundContext): Promise<PersonaOutcome> {
  const results: CheckResult[] = [];

  try {
    const { data } = await fetchJson(`${ctx.indexerUrl}/stats`, {
      headers: { Origin: ctx.dashboardUrl },
    });
    const stats = data as Partial<StatsResponse>;
    const required = ["totalSkills", "activeSkills", "totalJobs", "avgReputationScore", "totalRevenue"];
    const missing = required.filter((key) => !(key in stats));
    if (missing.length > 0) {
      push(results, "FAIL", `/stats missing fields: ${missing.join(", ")}`);
    } else if (stats.totalSkills !== 15) {
      push(results, "WARN", `/stats totalSkills=${stats.totalSkills}; expected 15 for current seeded demo`);
    } else {
      push(results, "PASS", `/stats looks complete with totalSkills=${stats.totalSkills}`);
    }
  } catch (err) {
    push(results, "FAIL", `/stats failed: ${String(err)}`);
  }

  try {
    const [skillsRes, chainCount] = await Promise.all([
      fetchJson(`${ctx.indexerUrl}/skills`),
      skillRegistryClient.readContract({
        address: SKILL_REGISTRY_ADDRESS as `0x${string}`,
        abi: SKILL_REGISTRY_ABI,
        functionName: "totalSkills",
      }),
    ]);
    const skillCount = (skillsRes.data as SkillsResponse).skills.length;
    if (skillCount === Number(chainCount)) {
      push(results, "PASS", `/skills count matches chain (${skillCount})`);
    } else {
      push(results, "FAIL", `/skills count mismatch: indexer=${skillCount} chain=${String(chainCount)}`);
    }
  } catch (err) {
    push(results, "FAIL", `Indexer vs chain count check failed: ${String(err)}`);
  }

  try {
    const skills = await loadSkills(ctx);
    const sample = skills
      .slice()
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.min(3, skills.length));
    const bad = sample.filter((skill) => /localhost|127\.0\.0\.1/.test(skill.endpoint));
    if (bad.length > 0) {
      push(results, "FAIL", `Random sample contains localhost endpoint(s): ${bad.map((skill) => skill.skillId).join(", ")}`);
    } else {
      push(results, "PASS", `Random skill sample has public endpoints`);
    }
  } catch (err) {
    push(results, "FAIL", `Random endpoint sample failed: ${String(err)}`);
  }

  try {
    const { data } = await fetchJson(`${ctx.indexerUrl}/jobs`);
    if (!Array.isArray(data)) {
      push(results, "FAIL", `/jobs did not return a list`);
    } else {
      const first = data[0] as Partial<JobRecord> | undefined;
      const required = ["id", "skillId", "skillName", "consumer", "settlementTx", "amount"];
      const missing = first ? required.filter((key) => !(key in first)) : [];
      if (first && missing.length > 0) {
        push(results, "WARN", `/jobs first record missing fields: ${missing.join(", ")}`);
      } else {
        push(results, "PASS", `/jobs returned ${data.length} record(s)`);
      }
    }
  } catch (err) {
    push(results, "FAIL", `/jobs failed: ${String(err)}`);
  }

  try {
    const { status } = await fetchJson(`${ctx.facilitatorUrl}/facilitate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentProof: {
          type: "eip712",
          payload: {
            authorization: {
              from: "0x0000000000000000000000000000000000000001",
              to: OPERATOR_ADDRESS,
              token: USDC_ADDRESS,
              amount: "200000",
              skillId: 11,
              nonce: 1,
              validBefore: 99999999999,
            },
            signature: "0xdeadbeef",
          },
        },
        paymentDetails: {
          scheme: "exact",
          network: "eip155:5000",
          maxAmountRequired: "200000",
          asset: USDC_ADDRESS,
          payTo: OPERATOR_ADDRESS,
          resource: "/skills/11",
          skillId: 11,
        },
      }),
    });
    if (status === 400 || status === 402) {
      push(results, "PASS", `/facilitate rejects bad signature with HTTP ${status}`);
    } else {
      push(results, "FAIL", `/facilitate returned HTTP ${status} for bad signature`);
    }
  } catch (err) {
    push(results, "FAIL", `Bad signature rejection check failed: ${String(err)}`);
  }

  try {
    const html = await fetchText(ctx.dashboardUrl, {
      headers: browserHeaders(ctx.dashboardUrl, false),
    });
    if (/mockdata|mock_skills|mock jobs|mock data/i.test(html.body)) {
      push(results, "WARN", `Dashboard HTML contains mock-data marker`);
    } else {
      push(results, "PASS", `Dashboard HTML contains no mock-data marker`);
    }
  } catch (err) {
    push(results, "FAIL", `Dashboard home fetch failed: ${String(err)}`);
  }

  return { name: "Alex", results };
}

async function runSam(ctx: RoundContext): Promise<PersonaOutcome> {
  const results: CheckResult[] = [];

  try {
    const skills = await loadSkills(ctx);
    const spawn = skills.filter(
      (skill) =>
        skill.name.includes("spawn") || skill.name.includes("lineage") || skill.name.includes("decision"),
    );
    const wrong = spawn.filter((skill) => !skill.endpoint.includes("ledgerforge-spawn.fly.dev"));
    if (wrong.length > 0) {
      push(results, "FAIL", `Spawn skills point to wrong endpoint(s): ${wrong.map((skill) => skill.endpoint).join(", ")}`);
    } else {
      push(results, "PASS", `Found ${spawn.length} spawn skills on Fly`);
    }
  } catch (err) {
    push(results, "FAIL", `Spawn skill discovery failed: ${String(err)}`);
  }

  try {
    const { data } = await fetchJson(
      `${ctx.spawnUrl}/spawn-failure-analyst?lineageKey=${encodeURIComponent(ctx.lineageKey)}&generation=2`,
      { headers: { Authorization: authHeader("SamAnalyst") } },
    );
    const payload = data as Record<string, unknown>;
    if ("error" in payload && !payload.fallback) {
      push(results, "FAIL", `spawn-failure-analyst returned error without fallback`);
    } else {
      push(results, "PASS", `spawn-failure-analyst returned data source=${String(payload.source ?? "live")}`);
    }
  } catch (err) {
    push(results, "FAIL", `spawn-failure-analyst failed: ${String(err)}`);
  }

  try {
    const { data } = await fetchJson(
      `${ctx.spawnUrl}/lineage-context-builder?lineageKey=${encodeURIComponent(ctx.lineageKey)}`,
      { headers: { Authorization: authHeader("SamContext") } },
    );
    const payload = data as Record<string, unknown>;
    const context = String(payload.context ?? "");
    if (context.length > 0) {
      push(results, "PASS", `lineage-context-builder returned ${context.length} chars`);
    } else {
      push(results, "FAIL", `lineage-context-builder returned empty context`);
    }
  } catch (err) {
    push(results, "FAIL", `lineage-context-builder failed: ${String(err)}`);
  }

  try {
    const { data } = await fetchJson(
      `${ctx.spawnUrl}/decision-hash-verifier?contractAddress=${SKILL_REGISTRY_ADDRESS}&decisionHash=0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef`,
      { headers: { Authorization: authHeader("SamVerify") } },
    );
    const payload = data as Record<string, unknown>;
    if ("verified" in payload && "scannedRange" in payload && payload.verified === false) {
      push(results, "PASS", `decision-hash-verifier returned verified=false with scannedRange`);
    } else {
      push(results, "FAIL", `decision-hash-verifier unexpected payload`);
    }
  } catch (err) {
    push(results, "FAIL", `decision-hash-verifier failed: ${String(err)}`);
  }

  try {
    const { status } = await fetchJson(
      `${ctx.spawnUrl}/decision-hash-verifier?contractAddress=${SKILL_REGISTRY_ADDRESS}&decisionHash=0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab`,
      { headers: { Authorization: authHeader("SamBadHash") } },
    );
    if (status === 400) {
      push(results, "PASS", `decision-hash-verifier rejects malformed hash with 400`);
    } else {
      push(results, "FAIL", `decision-hash-verifier returned HTTP ${status} for malformed hash`);
    }
  } catch (err) {
    push(results, "FAIL", `Malformed decision hash check failed: ${String(err)}`);
  }

  return { name: "Sam", results };
}

async function runChris(ctx: RoundContext): Promise<PersonaOutcome> {
  const results: CheckResult[] = [];
  const headers = { Authorization: authHeader("Chris") };

  try {
    const { data } = await fetchJson(`${ctx.mantleUrl}/mantle-gas-oracle`, { headers });
    const payload = data as Record<string, unknown>;
    const gasPrice = payload.gasPrice as Record<string, unknown> | undefined;
    const baseFee = payload.baseFee as Record<string, unknown> | undefined;
    if (gasPrice?.gwei || baseFee?.gwei) {
      push(results, "PASS", `mantle-gas-oracle returned gas fields`);
    } else {
      push(results, "FAIL", `mantle-gas-oracle missing gas fields`);
    }
  } catch (err) {
    push(results, "FAIL", `mantle-gas-oracle failed: ${String(err)}`);
  }

  for (const symbol of ["USDC", "USDe"]) {
    try {
      const { data } = await fetchJson(`${ctx.mantleUrl}/token-price-feed?symbol=${encodeURIComponent(symbol)}`, {
        headers,
      });
      const payload = data as Record<string, unknown>;
      if ("error" in payload) {
        push(results, "FAIL", `token-price-feed ${symbol} returned error`);
        continue;
      }
      const prices = payload.prices as Array<Record<string, unknown>> | undefined;
      const price = prices?.[0]?.priceUsd;
      if (price !== undefined) {
        push(results, "PASS", `token-price-feed ${symbol} price=${String(price)}`);
      } else {
        push(results, "FAIL", `token-price-feed ${symbol} missing price`);
      }
    } catch (err) {
      push(results, "FAIL", `token-price-feed ${symbol} failed: ${String(err)}`);
    }
  }

  try {
    const { data } = await fetchJson(
      `${ctx.mantleUrl}/defi-protocol-stats?protocol=${encodeURIComponent(ctx.protocol)}`,
      { headers },
    );
    const payload = data as Record<string, unknown>;
    if ("error" in payload) {
      push(results, "WARN", `defi-protocol-stats ${ctx.protocol}: ${String(payload.error)}`);
    } else {
      push(results, "PASS", `defi-protocol-stats ${ctx.protocol} returned data`);
    }
  } catch (err) {
    push(results, "FAIL", `defi-protocol-stats ${ctx.protocol} failed: ${String(err)}`);
  }

  try {
    const { data } = await fetchJson(
      `${ctx.mantleUrl}/hackathon-scout?keyword=${encodeURIComponent("mantle defi")}`,
      { headers },
    );
    const payload = data as Record<string, unknown>;
    if ("error" in payload) {
      push(results, "FAIL", `hackathon-scout returned error`);
    } else {
      push(results, "PASS", `hackathon-scout returned keys=${Object.keys(payload).join(",")}`);
    }
  } catch (err) {
    push(results, "FAIL", `hackathon-scout failed: ${String(err)}`);
  }

  try {
    const { data } = await fetchJson(`${ctx.indexerUrl}/stats`);
    const stats = data as Partial<StatsResponse>;
    push(
      results,
      "PASS",
      `platform stats totalSkills=${String(stats.totalSkills)} totalJobs=${String(stats.totalJobs)} revenue=${String(stats.totalRevenue)}`,
    );
  } catch (err) {
    push(results, "FAIL", `Final stats fetch failed: ${String(err)}`);
  }

  return { name: "Chris", results };
}

function roundContext(round: number): RoundContext {
  return {
    round,
    timestamp: new Date().toISOString(),
    coin: PERPS_COINS[(round - 1) % PERPS_COINS.length],
    protocol: PROTOCOLS[(round - 1) % PROTOCOLS.length],
    pageSize: PAGE_SIZES[(round - 1) % PAGE_SIZES.length],
    sortField: SORT_FIELDS[(round - 1) % SORT_FIELDS.length],
    lineageKey: `agent-round-${round}`,
    dashboardUrl: DASHBOARD_URL,
    facilitatorUrl: FACILITATOR_URL,
    indexerUrl: INDEXER_URL,
    spawnUrl: SPAWN_URL,
    byrealUrl: BYREAL_URL,
    mantleUrl: MANTLE_URL,
  };
}

function printScorecard(round: number, timestamp: string, outcomes: PersonaOutcome[], cumulative: ScoreSummary): void {
  const roundTotals = outcomes.reduce<ScoreSummary>(
    (acc, outcome) => {
      const s = summary(outcome.results);
      acc.pass += s.pass;
      acc.warn += s.warn;
      acc.fail += s.fail;
      return acc;
    },
    { pass: 0, warn: 0, fail: 0 },
  );

  console.log("");
  console.log(`round ${round} ${timestamp}`);

  for (const outcome of outcomes) {
    const s = summary(outcome.results);
    console.log(` ${outcome.name.padEnd(10)} PASS:${s.pass} WARN:${s.warn} FAIL:${s.fail}`);
    for (const result of outcome.results.filter((entry) => entry.status !== "PASS")) {
      console.log(`   ${result.status}: ${result.detail}`);
    }
  }

  console.log(` Total      PASS:${roundTotals.pass} WARN:${roundTotals.warn} FAIL:${roundTotals.fail}`);
  console.log(` Cumulative PASS:${cumulative.pass} WARN:${cumulative.warn} FAIL:${cumulative.fail}`);
}

async function main(): Promise<void> {
  let round = 1;
  const cumulative: ScoreSummary = { pass: 0, warn: 0, fail: 0 };

  while (!shouldStop && round <= MAX_ROUNDS) {
    const ctx = roundContext(round);
    const outcomes = await Promise.all([
      runMaya(ctx),
      runJake(ctx),
      runAlex(ctx),
      runSam(ctx),
      runChris(ctx),
    ]);

    for (const outcome of outcomes) {
      const s = summary(outcome.results);
      cumulative.pass += s.pass;
      cumulative.warn += s.warn;
      cumulative.fail += s.fail;
    }

    printScorecard(round, ctx.timestamp, outcomes, cumulative);
    round += 1;

    if (!shouldStop && round <= MAX_ROUNDS && ROUND_DELAY_MS > 0) {
      await sleep(ROUND_DELAY_MS);
    }
  }
}

void main().catch((err) => {
  console.error(`fatal error: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  process.exitCode = 1;
});
