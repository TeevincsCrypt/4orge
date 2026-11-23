import { describe, expect, it } from "vitest";
import { DEFAULT_NETWORK_ID, NETWORKS, isDeploymentAllowed, listNetworks, toAddChainParams, validateRpcUrl } from "@/lib/networks";

describe("QIE networks", () => {
  it("uses the specified chain IDs and endpoints", () => {
    expect(NETWORKS["qie-testnet"]).toMatchObject({ chainId: 1983, explorerUrl: "https://testnet.qie.digital" });
    expect(NETWORKS["qie-testnet"].rpcUrls[0]).toBe("https://rpc1testnet.qie.digital");
    expect(NETWORKS["qie-testnet"].rpcUrls.every((u) => /^https:\/\/rpc\dtestnet\.qie\.digital$/.test(u))).toBe(true);
    expect(NETWORKS["qie-mainnet"]).toMatchObject({ chainId: 1990, explorerUrl: "https://mainnet.qie.digital" });
    expect(NETWORKS["qie-mainnet"].rpcUrls[0]).toBe("https://rpc1mainnet.qie.digital");
    expect(NETWORKS["qie-testnet"].nativeCurrency.symbol).toBe("QIE");
  });
  it("defaults to testnet", () => expect(DEFAULT_NETWORK_ID).toBe("qie-testnet"));
  it("locks mainnet deployments unless explicitly enabled", () => {
    expect(isDeploymentAllowed(NETWORKS["qie-mainnet"], { mainnetDeploymentsEnabled: false, localChainEnabled: false })).toBe(false);
    expect(isDeploymentAllowed(NETWORKS["qie-mainnet"], { mainnetDeploymentsEnabled: true, localChainEnabled: false })).toBe(true);
    expect(isDeploymentAllowed(NETWORKS["qie-testnet"], { mainnetDeploymentsEnabled: false, localChainEnabled: false })).toBe(true);
  });
  it("hides the local chain unless enabled", () => {
    expect(listNetworks({ mainnetDeploymentsEnabled: false, localChainEnabled: false }).map((n) => n.id)).toEqual(["qie-testnet", "qie-mainnet"]);
  });
  it("builds EIP-3085 params with hex chain id", () => {
    expect(toAddChainParams(NETWORKS["qie-testnet"]).chainId).toBe("0x7bf");
    expect(toAddChainParams(NETWORKS["qie-mainnet"]).chainId).toBe("0x7c6");
  });
  it("validates custom RPC URLs", () => {
    expect(validateRpcUrl("https://rpc.example.org/").ok).toBe(true);
    expect(validateRpcUrl("http://127.0.0.1:8545").ok).toBe(true);
    expect(validateRpcUrl("http://rpc.example.org").ok).toBe(false);
    expect(validateRpcUrl("https://user:pass@rpc.example.org").ok).toBe(false);
    expect(validateRpcUrl("javascript:alert(1)").ok).toBe(false);
  });
});

describe("environment flags", async () => {
  const { parseFlag } = await import("@/lib/server/config");
  it("accepts common spellings, quotes and spaces", () => {
    for (const v of ["true", "TRUE", " true ", '"true"', "'true'", "1", "yes", "on"]) expect(parseFlag(v)).toBe(true);
    for (const v of ["false", "0", "no", "off", '"false"']) expect(parseFlag(v)).toBe(false);
  });
  it("distinguishes unset from unrecognised", () => {
    expect(parseFlag(undefined)).toBeNull();
    expect(parseFlag("  ")).toBeNull();
    expect(parseFlag("enabled")).toBe("invalid");
  });
});
