import "dotenv/config";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { formatUnits, getAddress, type Address, type Hex } from "viem";
import {
  LedgerForgeClient,
  formatTokenAmount,
  type CallSkillOptions,
} from "@ishitaaaaw/x402-mantle";

export interface SettlementLog {
  skillId: number;
  name: string;
  escrowJobId: string;
  pullTx?: string;
  createJobTx?: string;
  completeJobTx?: string;
  skillRegistryRepTx?: string;
  erc8004FeedbackTx?: string;
  explorerUrl: string;
  pricePaid: string;
  ranAt: string;
}

export interface FailureLog {
  step: string;
  skillId?: number;
  skillName?: string;
  message: string;
  ranAt: string;
}

export interface ProviderRecipient {
  address: Address;
  source: "DEMO_PROVIDER_PRIVATE_KEY" | "DEMO_PROVIDER_ADDRESS" | "ephemeral";
  ephemeralSigner?: Hex;
}

export interface DemoRuntimeConfig {
  title: string;
  runsDir: string;
  pricePerCall: string;
  minBalance: bigint;
  dryRun: boolean;
  verbose: boolean;
}

export interface ArtifactPaths {
  digestPath: string;
  jsonPath: string;
}

export function parseArgs(): { dryRun: boolean; verbose: boolean } {
  const argv = new Set(process.argv.slice(2));
  return {
    dryRun: argv.has("--dry-run"),
    verbose: argv.has("--verbose") || argv.has("-v"),
  };
}

export function ts(): string {
  return new Date().toISOString().slice(11, 19);
}

export function log(msg: string): void {
  console.log(`[${ts()}] ${msg}`);
}

export function dim(msg: string): void {
  console.log(`\x1b[2m[${ts()}] ${msg}\x1b[0m`);
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function skillIdFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function escapeTable(value: unknown): string {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export function jsonReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

function requiredConsumerKey(): Hex {
  const key =
    (process.env.WALLET_PRIVATE_KEY as Hex | undefined) ??
    (process.env.CONSUMER_PRIVATE_KEY as Hex | undefined);
  if (!key) {
    throw new Error("Set WALLET_PRIVATE_KEY (or CONSUMER_PRIVATE_KEY) in .env");
  }
  return key;
}

function resolveProviderRecipient(): ProviderRecipient {
  const providerKey = process.env.DEMO_PROVIDER_PRIVATE_KEY as Hex | undefined;
  if (providerKey) {
    return {
      address: privateKeyToAccount(providerKey).address,
      source: "DEMO_PROVIDER_PRIVATE_KEY",
    };
  }

  const providerAddress = process.env.DEMO_PROVIDER_ADDRESS;
  if (providerAddress) {
    return {
      address: getAddress(providerAddress),
      source: "DEMO_PROVIDER_ADDRESS",
    };
  }

  const ephemeralSigner = generatePrivateKey();
  return {
    address: privateKeyToAccount(ephemeralSigner).address,
    source: "ephemeral",
    ephemeralSigner,
  };
}

export class DemoRuntime {
  readonly client: LedgerForgeClient;
  readonly consumerAddress: Address;
  readonly provider: ProviderRecipient;
  readonly startedAt: Date;
  readonly settlements: SettlementLog[] = [];
  readonly failures: FailureLog[] = [];

  constructor(readonly config: DemoRuntimeConfig) {
    this.client = new LedgerForgeClient({ privateKey: requiredConsumerKey() });
    const address = this.client.address;
    if (!address) {
      throw new Error("LedgerForgeClient did not expose a signer address");
    }
    this.consumerAddress = address;
    this.provider = resolveProviderRecipient();
    this.startedAt = new Date();
  }

  printHeader(): void {
    console.log("");
    console.log("┌" + "─".repeat(72) + "┐");
    console.log("│ " + this.config.title.padEnd(70) + " │");
    console.log("└" + "─".repeat(72) + "┘");
    console.log("");
    log(`Signer:    ${this.consumerAddress}`);
    log(`Provider:  ${this.provider.address}`);
    log(`Recipient source: ${this.provider.source}`);
    if (this.config.dryRun) log("Mode:      DRY-RUN (no on-chain calls, no payments)");
  }

  recordFailure(step: string, err: unknown, skillId?: number, skillName?: string): void {
    const message = errorMessage(err);
    this.failures.push({
      step,
      skillId,
      skillName,
      message,
      ranAt: new Date().toISOString(),
    });
    log(`  ! ${step}${skillId ? ` #${skillId}` : ""} failed: ${message}`);
  }

  async preflight(maxPaidCalls: number): Promise<boolean> {
    try {
      const balance = await this.client.getBalance("USDC");
      const allowance = await this.client.getAllowance("USDC");
      log(`Balance:   ${formatTokenAmount(balance)} USDC`);
      log(`Allowance: ${formatTokenAmount(allowance)} USDC -> operator`);

      if (!this.config.dryRun) {
        if (balance < this.config.minBalance) {
          throw new Error(
            `Insufficient USDC (have ${formatTokenAmount(balance)}, need ${formatTokenAmount(this.config.minBalance)}). Bridge USDC to Mantle and try again: https://app.mantle.xyz/bridge`,
          );
        }
        const requiredAllowance = BigInt(this.config.pricePerCall) * BigInt(maxPaidCalls);
        if (allowance < requiredAllowance) {
          log("Approving operator (one-time setup) ...");
          const approval = await this.client.approveOperator("USDC");
          log(`  approved -> ${approval.explorerUrl}`);
        }
      }

      return true;
    } catch (err) {
      this.recordFailure("preflight", err);
      return false;
    }
  }

  async pay<T>(
    step: string,
    skillId: number,
    opts: CallSkillOptions = {},
  ): Promise<T | undefined> {
    if (this.config.dryRun) {
      dim(`-> [dry-run] skill #${skillId}${opts.query ? ` query=${JSON.stringify(opts.query)}` : ""}`);
      return { dryRun: true } as unknown as T;
    }

    try {
      const result = await this.client.invoke<T>(skillId, {
        recipient: this.provider.address,
        amount: this.config.pricePerCall,
        method: opts.method,
        query: opts.query,
        body: opts.body,
        headers: opts.headers,
      });
      const r = result.receipt;
      this.settlements.push({
        skillId,
        name: result.skillName,
        escrowJobId: r.escrowJobId ?? "?",
        pullTx: r.pullTxHash,
        createJobTx: r.createJobTxHash,
        completeJobTx: r.completeJobTxHash,
        skillRegistryRepTx: r.skillRegistryRepTxHash,
        erc8004FeedbackTx: r.erc8004FeedbackTxHash,
        explorerUrl: r.explorerUrl,
        pricePaid: this.config.pricePerCall,
        ranAt: new Date().toISOString(),
      });
      log(`  ✓ #${skillId} ${result.skillName.padEnd(22)} jobId=${r.escrowJobId} ${r.completeJobTxHash?.slice(0, 12)}...`);
      if (this.config.verbose) {
        dim(`      output: ${JSON.stringify(result.output).slice(0, 200)}`);
      }
      return result.output;
    } catch (err) {
      this.recordFailure(step, err, skillId);
      return undefined;
    }
  }

  totalSpent(): bigint {
    return BigInt(this.settlements.length) * BigInt(this.config.pricePerCall);
  }

  settlementSection(): string {
    const lines: string[] = [];
    lines.push("## On-chain settlement chain");
    lines.push("");
    lines.push("Every paid read below was a real x402 micropayment on Mantle mainnet. Each settlement emits pull, escrow, completion, SkillRegistry reputation, and ERC-8004 feedback txs when all writes succeed.");
    lines.push("");
    if (this.settlements.length === 0) {
      lines.push(this.config.dryRun ? "_(dry-run - no settlements broadcast)_" : "_(no settlements broadcast)_");
      lines.push("");
      return lines.join("\n");
    }

    lines.push("| # | Skill | escrowJobId | completeJob tx |");
    lines.push("|---|---|---|---|");
    this.settlements.forEach((s, i) => {
      const txLabel = s.completeJobTx ? `\`${s.completeJobTx.slice(0, 12)}...\`` : "`n/a`";
      lines.push(`| ${i + 1} | ${escapeTable(s.name)} (#${s.skillId}) | \`${escapeTable(s.escrowJobId)}\` | [${txLabel}](${s.explorerUrl}) |`);
    });
    lines.push("");
    lines.push(`**Total spent:** ${formatTokenAmount(this.totalSpent())} USDC (${this.settlements.length} settlements x ${formatUnits(BigInt(this.config.pricePerCall), 6)} USDC)`);
    lines.push("");
    return lines.join("\n");
  }

  failureSection(): string {
    if (this.failures.length === 0) return "";
    const lines: string[] = [];
    lines.push("## Partial-run failures");
    lines.push("");
    lines.push("| Step | Skill | Failure |");
    lines.push("|---|---|---|");
    for (const failure of this.failures) {
      const skill = failure.skillId ? `${failure.skillName ?? "skill"} (#${failure.skillId})` : "n/a";
      lines.push(`| ${escapeTable(failure.step)} | ${escapeTable(skill)} | ${escapeTable(failure.message)} |`);
    }
    lines.push("");
    return lines.join("\n");
  }

  runDetailsSection(finishedAt: Date, extraLines: string[] = []): string {
    const elapsedSec = Math.round((finishedAt.getTime() - this.startedAt.getTime()) / 1000);
    const lines: string[] = [];
    lines.push("---");
    lines.push("");
    lines.push("## Run details");
    lines.push("");
    lines.push(`- **Started:** ${this.startedAt.toISOString()}`);
    lines.push(`- **Finished:** ${finishedAt.toISOString()} (${elapsedSec}s elapsed)`);
    lines.push(`- **Consumer:** [\`${this.consumerAddress}\`](https://mantlescan.xyz/address/${this.consumerAddress})`);
    lines.push(`- **Provider (recipient):** [\`${this.provider.address}\`](https://mantlescan.xyz/address/${this.provider.address})`);
    lines.push(`- **Provider source:** ${this.provider.source}`);
    lines.push(`- **Mode:** ${this.config.dryRun ? "dry-run" : "live (paid)"}`);
    lines.push(`- **Price per call:** ${formatUnits(BigInt(this.config.pricePerCall), 6)} USDC`);
    for (const line of extraLines) lines.push(line);
    lines.push("");
    return lines.join("\n");
  }

  writeArtifacts(
    runPrefix: string,
    markdown: string,
    payload: Record<string, unknown>,
    finishedAt: Date,
  ): ArtifactPaths {
    const runsDir = join(process.cwd(), this.config.runsDir);
    if (!existsSync(runsDir)) mkdirSync(runsDir, { recursive: true });
    const runId = this.startedAt.toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const suffix = this.config.dryRun ? "-dryrun" : "";
    const digestPath = join(runsDir, `${runPrefix}-${runId}${suffix}.md`);
    const jsonPath = join(runsDir, `${runPrefix}-${runId}${suffix}.json`);

    writeFileSync(digestPath, markdown);
    writeFileSync(
      jsonPath,
      JSON.stringify(
        {
          startedAt: this.startedAt.toISOString(),
          finishedAt: finishedAt.toISOString(),
          dryRun: this.config.dryRun,
          consumer: this.consumerAddress,
          provider: this.provider.address,
          providerSource: this.provider.source,
          pricePerCall: this.config.pricePerCall,
          settlements: this.settlements,
          failures: this.failures,
          ...payload,
        },
        jsonReplacer,
        2,
      ) + "\n",
    );

    log(`Digest:      ${digestPath}`);
    log(`JSON:        ${jsonPath}`);
    return { digestPath, jsonPath };
  }

  printProviderRecovery(): void {
    if (
      this.provider.source !== "ephemeral" ||
      !this.provider.ephemeralSigner ||
      this.config.dryRun ||
      this.settlements.length === 0
    ) {
      return;
    }

    process.stderr.write("\n--- Provider recovery (stderr-only; artifacts do not contain this credential) ---\n");
    process.stderr.write(`Provider:           ${this.provider.address}\n`);
    process.stderr.write(`Provider signer:    ${this.provider.ephemeralSigner}\n`);
    process.stderr.write(`Estimated holdings: ${formatTokenAmount(this.totalSpent() * 9980n / 10000n)} USDC (after 20bps fee)\n`);
    process.stderr.write("Store it if you want to recover the provider payout later.\n\n");
  }
}

export { formatTokenAmount };
