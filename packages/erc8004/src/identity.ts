import {
  createPublicClient,
  http,
  isAddress,
  parseAbi,
  type PublicClient,
} from "viem";
import type { RegistryConfig } from "./config.js";
import type { IdentityRecord, IdentityTransfer, RegistryResult } from "./types.js";

// The ERC-8004 identity registry is specified as an ERC-721; this client uses
// ONLY the standard ERC-721 subset (ownerOf + Transfer event), which is safe
// regardless of registry implementation details. Any ERC-8004-specific
// extension methods are TODO(unverified) and intentionally absent — see
// reputation.ts for how unverified surface is handled.
const erc721Abi = parseAbi([
  "function ownerOf(uint256 tokenId) view returns (address)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
]);

export interface IdentityClientOptions {
  /** getLogs chunk size; some public RPCs cap ranges. */
  maxRangePerCall?: bigint;
  /** Earliest block to scan Transfer history from (registry deploy block). */
  fromBlock?: bigint;
}

export class IdentityClient {
  private readonly client: PublicClient;
  private readonly registry: `0x${string}`;

  private constructor(
    client: PublicClient,
    registry: `0x${string}`,
    private readonly config: RegistryConfig,
    private readonly opts: IdentityClientOptions,
  ) {
    this.client = client;
    this.registry = registry;
  }

  /** Returns null (never throws) when the chain isn't configured. */
  static fromConfig(
    config: RegistryConfig,
    opts: IdentityClientOptions = {},
  ): IdentityClient | null {
    if (!config.rpcUrl || !config.identityRegistry || !isAddress(config.identityRegistry)) {
      return null;
    }
    const client = createPublicClient({ transport: http(config.rpcUrl) });
    return new IdentityClient(client, config.identityRegistry, config, opts);
  }

  async ownerOf(agentId: number): Promise<RegistryResult<string>> {
    try {
      const owner = await this.client.readContract({
        address: this.registry,
        abi: erc721Abi,
        functionName: "ownerOf",
        args: [BigInt(agentId)],
      });
      return { ok: true, value: owner };
    } catch (err) {
      return {
        ok: false,
        error: { code: "READ_FAILED", message: `ownerOf(${agentId}): ${(err as Error).message}` },
      };
    }
  }

  /**
   * Full ERC-721 Transfer history for one identity token, oldest first.
   * Feeds KYA's IDENTITY_TRANSFERRED_RECENTLY flag.
   */
  async transferHistory(agentId: number): Promise<RegistryResult<IdentityTransfer[]>> {
    try {
      const latest = await this.client.getBlockNumber();
      const step = this.opts.maxRangePerCall ?? 10_000n;
      const start = this.opts.fromBlock ?? 0n;
      const transfers: IdentityTransfer[] = [];

      for (let from = start; from <= latest; from += step) {
        const to = from + step - 1n > latest ? latest : from + step - 1n;
        const logs = await this.client.getLogs({
          address: this.registry,
          event: erc721Abi[1],
          args: { tokenId: BigInt(agentId) },
          fromBlock: from,
          toBlock: to,
        });
        for (const log of logs) {
          const block = await this.client.getBlock({ blockNumber: log.blockNumber });
          transfers.push({
            tx: log.transactionHash,
            at: new Date(Number(block.timestamp) * 1000).toISOString(),
            from: log.args.from as string,
            to: log.args.to as string,
            blockNumber: Number(log.blockNumber),
          });
        }
      }
      transfers.sort((a, b) => a.blockNumber - b.blockNumber);
      return { ok: true, value: transfers };
    } catch (err) {
      return {
        ok: false,
        error: {
          code: "READ_FAILED",
          message: `transferHistory(${agentId}): ${(err as Error).message}`,
        },
      };
    }
  }

  async identityRecord(agentId: number): Promise<RegistryResult<IdentityRecord>> {
    const [owner, history] = await Promise.all([
      this.ownerOf(agentId),
      this.transferHistory(agentId),
    ]);
    if (!owner.ok) return owner;
    if (!history.ok) return history;
    return {
      ok: true,
      value: {
        chain: this.config.chain,
        registry: this.registry,
        agentId,
        owner: owner.value,
        transfers: history.value,
      },
    };
  }
}
