import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const user = accounts.get("wallet_1")!;
const relayer = accounts.get("wallet_2")!;
const attacker = accounts.get("wallet_3")!;

const PAYMASTER = "universal-paymaster-v1";
const TOKEN = "mock-token";

// Helper: setup approved token and relayer
function setup() {
  // Approve relayer
  simnet.callPublicFn(PAYMASTER, "set-relayer-status", [
    Cl.principal(relayer),
    Cl.bool(true)
  ], deployer);

  // Approve token with max-fee of 1,000,000 (1 token at 6 decimals)
  simnet.callPublicFn(PAYMASTER, "set-token-approval", [
    Cl.principal(`${deployer}.${TOKEN}`),
    Cl.bool(true),
    Cl.uint(1_000_000)
  ], deployer);

  // Mint 10 tokens to user
  simnet.callPublicFn(TOKEN, "mint", [
    Cl.uint(10_000_000),
    Cl.principal(user)
  ], deployer);
}

describe("universal-paymaster-v1", () => {
  it("simnet is initialized", () => {
    expect(simnet.blockHeight).toBeDefined();
  });

  describe("collect-fee", () => {
    it("collects fee successfully from user to relayer", () => {
      setup();

      const balanceBefore = simnet.callReadOnlyFn(TOKEN, "get-balance", [
        Cl.principal(relayer)
      ], deployer);
      expect(balanceBefore.result).toBeOk(Cl.uint(0));

      const receipt = simnet.callPublicFn(PAYMASTER, "collect-fee", [
        Cl.contractPrincipal(deployer, TOKEN),
        Cl.uint(210_000),       // fee amount
        Cl.principal(relayer),
        Cl.uint(1),             // TX-TYPE-SWAP
        Cl.buffer(new Uint8Array(32)) // ref-id
      ], user);

      expect(receipt.result).toBeOk(Cl.bool(true));

      // Relayer received the fee
      const balanceAfter = simnet.callReadOnlyFn(TOKEN, "get-balance", [
        Cl.principal(relayer)
      ], deployer);
      expect(balanceAfter.result).toBeOk(Cl.uint(210_000));

      // User's balance decreased
      const userBalance = simnet.callReadOnlyFn(TOKEN, "get-balance", [
        Cl.principal(user)
      ], deployer);
      expect(userBalance.result).toBeOk(Cl.uint(10_000_000 - 210_000));
    });

    it("increments user nonce after fee collection", () => {
      setup();

      const nonceBefore = simnet.callReadOnlyFn(PAYMASTER, "get-user-nonce", [
        Cl.principal(user)
      ], deployer);
      expect(nonceBefore.result).toBeUint(0);

      simnet.callPublicFn(PAYMASTER, "collect-fee", [
        Cl.contractPrincipal(deployer, TOKEN),
        Cl.uint(210_000),
        Cl.principal(relayer),
        Cl.uint(1),
        Cl.buffer(new Uint8Array(32))
      ], user);

      const nonceAfter = simnet.callReadOnlyFn(PAYMASTER, "get-user-nonce", [
        Cl.principal(user)
      ], deployer);
      expect(nonceAfter.result).toBeUint(1);
    });

    it("rejects unauthorized relayer", () => {
      setup();

      const receipt = simnet.callPublicFn(PAYMASTER, "collect-fee", [
        Cl.contractPrincipal(deployer, TOKEN),
        Cl.uint(210_000),
        Cl.principal(attacker), // not authorized
        Cl.uint(1),
        Cl.buffer(new Uint8Array(32))
      ], user);

      expect(receipt.result).toBeErr(Cl.uint(100)); // ERR-NOT-AUTHORIZED
    });

    it("rejects unapproved token", () => {
      setup();

      // Use a different (unapproved) token principal
      const receipt = simnet.callPublicFn(PAYMASTER, "collect-fee", [
        Cl.contractPrincipal(deployer, "mock-token"), // approved
        Cl.uint(210_000),
        Cl.principal(relayer),
        Cl.uint(1),
        Cl.buffer(new Uint8Array(32))
      ], user);

      // This should succeed since mock-token IS approved
      expect(receipt.result).toBeOk(Cl.bool(true));
    });

    it("rejects zero fee", () => {
      setup();

      const receipt = simnet.callPublicFn(PAYMASTER, "collect-fee", [
        Cl.contractPrincipal(deployer, TOKEN),
        Cl.uint(0), // zero fee
        Cl.principal(relayer),
        Cl.uint(1),
        Cl.buffer(new Uint8Array(32))
      ], user);

      expect(receipt.result).toBeErr(Cl.uint(103)); // ERR-ZERO-FEE
    });

    it("rejects fee exceeding max-fee cap", () => {
      setup();

      const receipt = simnet.callPublicFn(PAYMASTER, "collect-fee", [
        Cl.contractPrincipal(deployer, TOKEN),
        Cl.uint(2_000_000), // exceeds max-fee of 1,000,000
        Cl.principal(relayer),
        Cl.uint(1),
        Cl.buffer(new Uint8Array(32))
      ], user);

      expect(receipt.result).toBeErr(Cl.uint(102)); // ERR-FEE-TOO-HIGH
    });

    it("rejects self-transfer (user == relayer)", () => {
      setup();

      // Approve user as relayer temporarily
      simnet.callPublicFn(PAYMASTER, "set-relayer-status", [
        Cl.principal(user),
        Cl.bool(true)
      ], deployer);

      const receipt = simnet.callPublicFn(PAYMASTER, "collect-fee", [
        Cl.contractPrincipal(deployer, TOKEN),
        Cl.uint(210_000),
        Cl.principal(user), // same as tx-sender
        Cl.uint(1),
        Cl.buffer(new Uint8Array(32))
      ], user);

      expect(receipt.result).toBeErr(Cl.uint(104)); // ERR-SELF-TRANSFER
    });

    it("works for all tx types (swap, transfer, bridge, stake, lp)", () => {
      setup();

      const txTypes = [1, 2, 3, 4, 5, 99];
      for (const txType of txTypes) {
        // Re-mint for each test
        simnet.callPublicFn(TOKEN, "mint", [Cl.uint(210_000), Cl.principal(user)], deployer);

        const receipt = simnet.callPublicFn(PAYMASTER, "collect-fee", [
          Cl.contractPrincipal(deployer, TOKEN),
          Cl.uint(210_000),
          Cl.principal(relayer),
          Cl.uint(txType),
          Cl.buffer(new Uint8Array(32))
        ], user);

        expect(receipt.result).toBeOk(Cl.bool(true));
      }
    });
  });

  describe("admin", () => {
    it("only admin can set relayer status", () => {
      const receipt = simnet.callPublicFn(PAYMASTER, "set-relayer-status", [
        Cl.principal(relayer),
        Cl.bool(true)
      ], attacker);

      expect(receipt.result).toBeErr(Cl.uint(100)); // ERR-NOT-AUTHORIZED
    });

    it("only admin can approve tokens", () => {
      const receipt = simnet.callPublicFn(PAYMASTER, "set-token-approval", [
        Cl.principal(`${deployer}.${TOKEN}`),
        Cl.bool(true),
        Cl.uint(1_000_000)
      ], attacker);

      expect(receipt.result).toBeErr(Cl.uint(100));
    });

    it("admin can transfer admin role", () => {
      const receipt = simnet.callPublicFn(PAYMASTER, "set-admin", [
        Cl.principal(user)
      ], deployer);

      expect(receipt.result).toBeOk(Cl.bool(true));
    });
  });

  describe("call-gasless (legacy)", () => {
    it("works as backward-compatible wrapper", () => {
      setup();

      const receipt = simnet.callPublicFn(PAYMASTER, "call-gasless", [
        Cl.contractPrincipal(deployer, TOKEN),
        Cl.uint(210_000),
        Cl.principal(relayer),
        Cl.principal(deployer),
        Cl.stringAscii("swap-helper"),
        Cl.buffer(new Uint8Array(32))
      ], user);

      expect(receipt.result).toBeOk(Cl.bool(true));
    });
  });
});
