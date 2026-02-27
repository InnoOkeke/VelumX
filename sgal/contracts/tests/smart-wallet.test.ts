import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;

describe("smart-wallet", () => {
    it("ensures simnet is initialized", () => {
        expect(simnet.blockHeight).toBeDefined();
    });

    it("should start with nonce 0", () => {
        const receipt = simnet.callReadOnlyFn(
            "smart-wallet",
            "get-nonce",
            [],
            deployer
        );
        expect(receipt.result).toBeOk(Cl.uint(0));
    });

    it("should have deployer as owner", () => {
        const receipt = simnet.callReadOnlyFn(
            "smart-wallet",
            "get-owner",
            [],
            deployer
        );
        expect(receipt.result).toBeOk(Cl.principal(deployer));
    });

    it("allows direct execution by owner", () => {
        // Call execute-direct as owner
        const receipt = simnet.callPublicFn(
            "smart-wallet",
            "execute-direct",
            [
                Cl.principal(wallet1),
                Cl.stringAscii("some-method"),
                Cl.buffer(new Uint8Array(0))
            ],
            deployer
        );
        expect(receipt.result).toBeOk(Cl.bool(true));
    });

    it("prevents direct execution by non-owner", () => {
        // Call execute-direct as wallet1
        const receipt = simnet.callPublicFn(
            "smart-wallet",
            "execute-direct",
            [
                Cl.principal(wallet1),
                Cl.stringAscii("some-method"),
                Cl.buffer(new Uint8Array(0))
            ],
            wallet1
        );
        // ERR-NOT-AUTHORIZED is u100
        expect(receipt.result).toBeErr(Cl.uint(100));
    });
});
