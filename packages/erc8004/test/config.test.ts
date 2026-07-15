import { describe, expect, it } from "vitest";
import { configFor, registryConfigs } from "../src/config.js";
import { IdentityClient } from "../src/identity.js";
import { ReputationClient } from "../src/reputation.js";

describe("registryConfigs", () => {
  it("disables chains with no env rather than guessing", () => {
    const configs = registryConfigs({});
    expect(configs).toHaveLength(2);
    for (const c of configs) {
      expect(c.rpcUrl).toBeUndefined();
      expect(c.identityRegistry).toBeUndefined();
      expect(IdentityClient.fromConfig(c)).toBeNull();
      expect(ReputationClient.fromConfig(c)).toBeNull();
    }
  });

  it("maps env vars to the right chains", () => {
    const eth = configFor("eip155:1", {
      ETHEREUM_RPC: "https://rpc.example",
      ERC8004_IDENTITY_REGISTRY_ETH: "0x1111111111111111111111111111111111111111",
    });
    expect(eth?.rpcUrl).toBe("https://rpc.example");
    expect(eth?.identityRegistry).toBe("0x1111111111111111111111111111111111111111");
    expect(IdentityClient.fromConfig(eth!)).not.toBeNull();

    const base = configFor("eip155:8453", {
      BASE_RPC: "https://base.example",
      ERC8004_REPUTATION_REGISTRY_BASE: "0x2222222222222222222222222222222222222222",
    });
    expect(base?.reputationRegistry).toBe("0x2222222222222222222222222222222222222222");
  });

  it("rejects a malformed identity registry address", () => {
    const eth = configFor("eip155:1", {
      ETHEREUM_RPC: "https://rpc.example",
      ERC8004_IDENTITY_REGISTRY_ETH: "not-an-address",
    });
    expect(IdentityClient.fromConfig(eth!)).toBeNull();
  });

  it("reputation client refuses reads with ABI_UNVERIFIED (never guesses)", async () => {
    const base = configFor("eip155:8453", {
      BASE_RPC: "https://base.example",
      ERC8004_REPUTATION_REGISTRY_BASE: "0x2222222222222222222222222222222222222222",
    })!;
    const client = ReputationClient.fromConfig(base)!;
    const res = await client.feedbackFor(42);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("ABI_UNVERIFIED");
  });
});
