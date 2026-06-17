import {
  createPublicClient,
  createWalletClient,
  http,
  maxUint256,
  parseUnits,
  type Address,
  type Hex,
  type PrivateKeyAccount,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mantle } from "viem/chains";
import {
  DEFAULTS,
  PAYMENT_DOMAIN_NAME,
  PAYMENT_DOMAIN_VERSION,
  PAYMENT_TYPES,
} from "./constants.js";
import type {
  CallSkillOptions,
  InvokeOptions,
  InvokeResult,
  LedgerForgeConfig,
  ListSkillsFilter,
  PaymentAuthorization,
  PaymentChallenge,
  PaymentProof,
  SettlementReceipt,
  SkillListing,
} from "./types.js";
import {
  LedgerForgeError,
  buildQuery,
  checksumAddress,
  decimalsForSymbol,
  explorerTxUrl,
} from "./utils.js";

const DEFAULT_EXPLORER = "https://mantlescan.xyz";

const ERC20_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

export class LedgerForgeClient {
  readonly bazaarUrl: string;
  readonly facilitatorUrl: string;
  readonly rpcUrl: string;
  readonly chainId: number;
  readonly skillRegistry: Address;
  readonly operatorAddress: Address;
  readonly paymentTokens: Record<string, Address>;
  readonly explorerUrl: string;

  #account?: PrivateKeyAccount;
  #walletClient?: WalletClient;
  #publicClient: PublicClient;

  constructor(config: LedgerForgeConfig = {}) {
    this.bazaarUrl = (config.bazaarUrl ?? DEFAULTS.bazaarUrl).replace(/\/$/, "");
    this.facilitatorUrl = (config.facilitatorUrl ?? DEFAULTS.facilitatorUrl).replace(/\/$/, "");
    this.rpcUrl = config.rpcUrl ?? DEFAULTS.rpcUrl;
    this.chainId = config.chainId ?? DEFAULTS.chainId;
    this.skillRegistry = checksumAddress(config.skillRegistry ?? DEFAULTS.skillRegistry);
    this.operatorAddress = checksumAddress(config.operatorAddress ?? DEFAULTS.operatorAddress);
    this.paymentTokens = config.paymentTokens ?? { ...DEFAULTS.tokens };
    this.explorerUrl = config.explorerUrl ?? DEFAULT_EXPLORER;

    if (config.privateKey) {
      this.#account = privateKeyToAccount(config.privateKey);
    } else if (config.account) {
      this.#account = config.account;
    }

    if (config.walletClient) {
      this.#walletClient = config.walletClient;
    } else if (this.#account) {
      this.#walletClient = createWalletClient({
        account: this.#account,
        chain: mantle,
        transport: http(this.rpcUrl),
      });
    }

    this.#publicClient = createPublicClient({
      chain: mantle,
      transport: http(this.rpcUrl),
    });
  }

  get hasSigner(): boolean {
    return Boolean(this.#walletClient);
  }

  get address(): Address | undefined {
    return this.#account?.address ?? (this.#walletClient?.account?.address as Address | undefined);
  }

  async listSkills(filter: ListSkillsFilter = {}): Promise<SkillListing[]> {
    const url = new URL("/skills", this.bazaarUrl);
    if (filter.tier) url.searchParams.set("tier", filter.tier);
    if (filter.minScore !== undefined) url.searchParams.set("minScore", String(filter.minScore));
    if (filter.search) url.searchParams.set("search", filter.search);

    const response = await fetch(url);
    if (!response.ok) {
      throw new LedgerForgeError("BAZAAR_ERROR", `Bazaar /skills returned ${response.status}: ${await response.text()}`);
    }

    const body = (await response.json()) as { skills?: SkillListing[] } | SkillListing[];
    return Array.isArray(body) ? body : body.skills ?? [];
  }

  async getSkill(skillId: number): Promise<SkillListing> {
    const url = new URL(`/skills/${skillId}`, this.bazaarUrl);
    const response = await fetch(url);
    if (response.status === 404) {
      throw new LedgerForgeError("SKILL_NOT_FOUND", `Skill ${skillId} not found in bazaar`);
    }
    if (!response.ok) {
      throw new LedgerForgeError("BAZAAR_ERROR", `Bazaar /skills/${skillId} returned ${response.status}`);
    }
    return (await response.json()) as SkillListing;
  }

  async getPaymentChallenge(
    skillId: number,
    overrides: {
      resource?: string;
      amount?: string | bigint | number;
      asset?: Address;
    } = {},
  ): Promise<PaymentChallenge> {
    const url = new URL("/payment-details", this.facilitatorUrl);
    url.searchParams.set("skillId", String(skillId));
    if (overrides.resource) url.searchParams.set("resource", overrides.resource);
    if (overrides.amount !== undefined) url.searchParams.set("amount", String(overrides.amount));
    if (overrides.asset) url.searchParams.set("asset", overrides.asset);

    const response = await fetch(url);
    if (!response.ok) {
      throw new LedgerForgeError(
        "FACILITATOR_ERROR",
        `Facilitator /payment-details returned ${response.status}: ${await response.text()}`,
      );
    }
    return (await response.json()) as PaymentChallenge;
  }

  // signs the facilitator's eip-712 challenge
  async signPayment(
    challenge: PaymentChallenge,
    options: {
      recipient: Address;
      amount?: bigint | string | number;
      validForSeconds?: number;
    },
  ): Promise<PaymentProof> {
    const walletClient = this.#walletClient;
    const account = this.#account ?? (walletClient?.account as PrivateKeyAccount | undefined);
    if (!walletClient || !account) {
      throw new LedgerForgeError(
        "NO_SIGNER",
        "No signer configured. Pass privateKey, account, or walletClient to the constructor.",
      );
    }

    const amount = BigInt(options.amount ?? challenge.maxAmountRequired);
    const validBefore = Math.floor(Date.now() / 1000) + (options.validForSeconds ?? 300);
    const nonce = Date.now();

    const authorization: PaymentAuthorization = {
      from: account.address,
      to: checksumAddress(options.recipient),
      amount: amount.toString(),
      token: checksumAddress(challenge.asset),
      skillId: challenge.skillId,
      nonce,
      validBefore,
    };

    const signature = (await walletClient.signTypedData({
      account,
      domain: {
        name: PAYMENT_DOMAIN_NAME,
        version: PAYMENT_DOMAIN_VERSION,
        chainId: this.chainId,
        verifyingContract: this.skillRegistry,
      },
      types: PAYMENT_TYPES,
      primaryType: "Payment",
      message: {
        from: authorization.from,
        to: authorization.to,
        amount,
        token: authorization.token,
        skillId: BigInt(challenge.skillId),
        nonce: BigInt(nonce),
        validBefore: BigInt(validBefore),
      },
    })) as Hex;

    return {
      scheme: "exact",
      network: `eip155:${this.chainId}` as `eip155:${number}`,
      payload: { signature, authorization },
    };
  }

  async facilitate(challenge: PaymentChallenge, proof: PaymentProof): Promise<SettlementReceipt> {
    const response = await fetch(new URL("/facilitate", this.facilitatorUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paymentDetails: challenge, paymentProof: proof }),
    });

    const body = (await response.json()) as {
      success: boolean;
      settlementTxHash?: Hex;
      accessToken?: string;
      escrowJobId?: string;
      pullTxHash?: Hex;
      createJobTxHash?: Hex;
      completeJobTxHash?: Hex;
      skillRegistryRepTxHash?: Hex;
      erc8004FeedbackTxHash?: Hex;
      reputationScore?: number;
      error?: string;
    };

    if (!response.ok || !body.success || !body.settlementTxHash || !body.accessToken) {
      throw new LedgerForgeError(
        "SETTLEMENT_FAILED",
        body.error ?? `Facilitator returned ${response.status}`,
      );
    }

    return {
      success: true,
      settlementTxHash: body.settlementTxHash,
      accessToken: body.accessToken,
      explorerUrl: explorerTxUrl(body.settlementTxHash, this.explorerUrl),
      escrowJobId: body.escrowJobId,
      pullTxHash: body.pullTxHash,
      createJobTxHash: body.createJobTxHash,
      completeJobTxHash: body.completeJobTxHash,
      skillRegistryRepTxHash: body.skillRegistryRepTxHash,
      erc8004FeedbackTxHash: body.erc8004FeedbackTxHash,
      reputationScore: body.reputationScore,
    };
  }

  async callSkill<T = unknown>(
    endpoint: string,
    accessToken: string,
    options: CallSkillOptions = {},
  ): Promise<T> {
    const method = options.method ?? (options.body ? "POST" : "GET");
    const url = new URL(endpoint);
    if (options.query) {
      for (const [k, v] of Object.entries(options.query)) {
        url.searchParams.set(k, String(v));
      }
    }

    const headers: Record<string, string> = {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
      ...(options.headers ?? {}),
    };
    if (options.body !== undefined) headers["content-type"] = "application/json";

    const response = await fetch(url, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      throw new LedgerForgeError(
        "SKILL_CALL_FAILED",
        `Skill endpoint ${url.pathname} returned ${response.status}: ${await response.text().catch(() => "")}`,
      );
    }
    return (await response.json()) as T;
  }

  resolveTokenAddress(token: Address | "USDC" | "USDe"): Address {
    if (token === "USDC") return this.paymentTokens.USDC;
    if (token === "USDe") return this.paymentTokens.USDe;
    return checksumAddress(token);
  }

  async getAllowance(token: Address | "USDC" | "USDe", owner?: Address): Promise<bigint> {
    const tokenAddress = this.resolveTokenAddress(token);
    const ownerAddress = owner ?? this.address;
    if (!ownerAddress) {
      throw new LedgerForgeError(
        "NO_SIGNER",
        "owner address required when no signer is configured",
      );
    }
    return this.#publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [ownerAddress, this.operatorAddress],
    });
  }

  async getBalance(token: Address | "USDC" | "USDe", owner?: Address): Promise<bigint> {
    const tokenAddress = this.resolveTokenAddress(token);
    const ownerAddress = owner ?? this.address;
    if (!ownerAddress) {
      throw new LedgerForgeError(
        "NO_SIGNER",
        "owner address required when no signer is configured",
      );
    }
    return this.#publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [ownerAddress],
    });
  }

  // approve once per token before paying skills
  async approveOperator(
    token: Address | "USDC" | "USDe",
    amount: bigint | "max" = "max",
  ): Promise<{ txHash: Hex; explorerUrl: string; approvedAmount: bigint }> {
    const walletClient = this.#walletClient;
    const account = this.#account ?? (walletClient?.account as PrivateKeyAccount | undefined);
    if (!walletClient || !account) {
      throw new LedgerForgeError("NO_SIGNER", "No signer configured. Pass privateKey, account, or walletClient.");
    }

    const tokenAddress = this.resolveTokenAddress(token);
    const approvedAmount = amount === "max" ? maxUint256 : amount;

    const txHash = await walletClient.writeContract({
      account,
      chain: mantle,
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [this.operatorAddress, approvedAmount],
    });

    await this.#publicClient.waitForTransactionReceipt({ hash: txHash });

    return {
      txHash,
      explorerUrl: explorerTxUrl(txHash, this.explorerUrl),
      approvedAmount,
    };
  }

  async invoke<T = unknown>(skillId: number, options: InvokeOptions = {}): Promise<InvokeResult<T>> {
    const skill = await this.getSkill(skillId);

    const resolvedToken = this.resolveToken(options.token, options.amount);
    const challenge = await this.getPaymentChallenge(skillId, {
      resource: skill.endpoint,
      amount: resolvedToken.amount,
      asset: resolvedToken.address,
    });

    const proof = await this.signPayment(challenge, {
      recipient: options.recipient ?? skill.owner,
      amount: resolvedToken.amount,
      validForSeconds: options.validForSeconds,
    });

    const receipt = await this.facilitate(challenge, proof);

    const output = await this.callSkill<T>(skill.endpoint, receipt.accessToken, {
      method: options.method,
      query: options.query,
      body: options.body,
      headers: options.headers,
    });

    return { skillId, skillName: skill.name, output, receipt };
  }

  private resolveToken(
    token: Address | "USDC" | "USDe" | undefined,
    amount: bigint | number | string | undefined,
  ): { address: Address; amount: bigint } {
    let address: Address;
    let symbol: string | undefined;

    if (!token || token === "USDC") {
      address = this.paymentTokens.USDC;
      symbol = "USDC";
    } else if (token === "USDe") {
      address = this.paymentTokens.USDe;
      symbol = "USDe";
    } else {
      address = checksumAddress(token);
    }

    let amountBigInt: bigint;
    if (amount === undefined) {
      amountBigInt = 0n;
    } else if (typeof amount === "bigint") {
      amountBigInt = amount;
    } else if (typeof amount === "string" && amount.includes(".")) {
      amountBigInt = parseUnits(amount, decimalsForSymbol(symbol ?? "USDC"));
    } else {
      amountBigInt = BigInt(amount);
    }

    return { address, amount: amountBigInt };
  }
}
