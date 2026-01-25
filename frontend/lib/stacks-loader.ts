/**
 * Stacks Library Loader (ESM)
 * Centrally manages Stacks libraries to ensure they are only evaluated in the browser.
 */

// Internal helper to merge module root and default export safely
const flattenModule = (mod: any) => {
    if (!mod) return null;
    // Merge both to handle cases where some exports are on default and some on root
    const result = { ...mod };
    if (mod.default && typeof mod.default === 'object') {
        Object.assign(result, mod.default);
    }
    return result;
};

export const getStacksConnect = async (): Promise<any> => {
    if (typeof window === 'undefined') return null;
    try {
        return flattenModule(await import('@stacks/connect'));
    } catch (e) {
        console.error('Failed to load @stacks/connect', e);
        return null;
    }
};

export const getStacksTransactions = async (): Promise<any> => {
    if (typeof window === 'undefined') return null;
    try {
        return flattenModule(await import('@stacks/transactions'));
    } catch (e) {
        console.error('Failed to load @stacks/transactions', e);
        return null;
    }
};

export const getStacksNetwork = async (): Promise<any> => {
    if (typeof window === 'undefined') return null;
    try {
        const mod = await import('@stacks/network');
        const merged = flattenModule(mod) as any;

        // Helper to normalize network exports (handling Class vs Instance vs Mixed)
        const normalize = (className: string, constantName: string) => {
            const candidate = merged[className] || merged[constantName];

            // If we found an object instance but need a constructor (for 'new'), wrap it
            if (candidate && typeof candidate === 'object') {
                const wrapper = function () { return candidate; };
                (wrapper as any).isWrappedInstance = true;
                return wrapper;
            }
            return candidate;
        };

        return {
            ...merged,
            StacksTestnet: normalize('StacksTestnet', 'STACKS_TESTNET'),
            StacksMainnet: normalize('StacksMainnet', 'STACKS_MAINNET'),
            StacksMocknet: normalize('StacksMocknet', 'STACKS_MOCKNET')
        };
    } catch (e) {
        console.error('Failed to load @stacks/network', e);
        return null;
    }
};

export const getStacksCommon = async (): Promise<any> => {
    if (typeof window === 'undefined') return null;
    try {
        return flattenModule(await import('@stacks/common'));
    } catch (e) {
        console.error('Failed to load @stacks/common', e);
        return null;
    }
};
