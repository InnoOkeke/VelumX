import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;

describe("wallet-factory", () => {
    it("ensures simnet is initialized", () => {
        expect(simnet.blockHeight).toBeDefined();
    });

    it("allows a user to register a smart wallet", () => {
        // Call register-wallet
        const deployReceipt = simnet.callPublicFn(
            "wallet-factory",
            "register-wallet",
            [Cl.principal(wallet1)],
            deployer
        );

        // Check if deployment is successful (returns ok true)
        expect(deployReceipt.result).toBeOk(Cl.bool(true));

        // Let's get the deployed wallet address
        const getWalletReceipt = simnet.callReadOnlyFn(
            "wallet-factory",
            "get-wallet",
            [Cl.principal(deployer)],
            deployer
        );

        // It should return the principal (which in this mock registry is recorded)
        expect(getWalletReceipt.result).toBeSome(Cl.principal(wallet1));
    });

    it("prevents registering a wallet twice", () => {
        // Deploy first time
        simnet.callPublicFn("wallet-factory", "register-wallet", [Cl.principal(wallet1)], deployer);

        // Try second time for same caller
        const failReceipt = simnet.callPublicFn("wallet-factory", "register-wallet", [Cl.principal(wallet1)], deployer);

        // Should return ERR-WALLET-EXISTS (u101)
        expect(failReceipt.result).toBeErr(Cl.uint(101));
    });
});
