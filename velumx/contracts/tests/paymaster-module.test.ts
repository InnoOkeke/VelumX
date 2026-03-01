import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const relayer = accounts.get("wallet_2")!;

describe("paymaster-module", () => {
    it("ensures simnet is initialized", () => {
        expect(simnet.blockHeight).toBeDefined();
    });

    it("calculates fee correctly with markup", () => {
        // Default oracle price: 1 STX = 2,000,000 USDCx
        // Default markup: 800 BPS = 8%

        // If gas used is 1,000,000 (1 STX)
        const receipt = simnet.callReadOnlyFn(
            "paymaster-module",
            "calculate-fee",
            [Cl.uint(1_000_000)],
            deployer
        );

        // Base cost: 2,000,000
        // Markup: 8% of 2,000,000 = 160,000
        // Total Expected: 2,160,000
        expect(receipt.result).toBeOk(Cl.uint(2_160_000));
    });

    it("allows admin to update oracle", () => {
        const receipt = simnet.callPublicFn(
            "paymaster-module",
            "update-oracle",
            [Cl.uint(3_000_000)], // $3.00 STX
            deployer
        );
        expect(receipt.result).toBeOk(Cl.bool(true));
    });

    it("prevents non-admin from updating oracle", () => {
        const receipt = simnet.callPublicFn(
            "paymaster-module",
            "update-oracle",
            [Cl.uint(3_000_000)],
            wallet1
        );
        // ERR-NOT-AUTHORIZED is u100
        expect(receipt.result).toBeErr(Cl.uint(100));
    });

    it("prevents fee settlement if limit is exceeded", () => {
        // Try to settle with max fee = 1,000,000 but actual cost is 2,160,000
        // We need a dummy token trait for this. For mock, we simply pass deployer.
        const mockToken = Cl.principal(deployer); // Usually a deployed contract

        const receipt = simnet.callPublicFn(
            "paymaster-module",
            "settle-fee",
            [
                Cl.contractPrincipal(deployer, "mock-token"),
                Cl.uint(1_000_000), // Gas Used
                Cl.uint(1_000_000), // Max Fee allowed by user (too low)
                Cl.principal(relayer)
            ],
            wallet1
        );

        // ERR-FEE-EXCEEDS-MAX is u102
        expect(receipt.result).toBeErr(Cl.uint(102));
    });
});
