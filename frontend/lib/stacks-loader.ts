/**
 * Stacks Library Loader (ESM)
 * Centrally manages Stacks libraries to ensure they are only evaluated in the browser.
 */

// Helper to get @stacks/connect safely
export const getStacksConnect = async (): Promise<any> => {
    if (typeof window === 'undefined') return null;
    try {
        const mod = await import('@stacks/connect');
        return mod.default || mod;
    } catch (e) {
        console.error('Failed to load @stacks/connect', e);
        return null;
    }
};

// Helper to get @stacks/transactions safely
export const getStacksTransactions = async (): Promise<any> => {
    if (typeof window === 'undefined') return null;
    try {
        const mod = await import('@stacks/transactions');
        return mod.default || mod;
    } catch (e) {
        console.error('Failed to load @stacks/transactions', e);
        return null;
    }
};

// Helper to get @stacks/network safely
export const getStacksNetwork = async (): Promise<any> => {
    if (typeof window === 'undefined') return null;
    try {
        const mod = await import('@stacks/network') as any;
        const base = mod.default || mod;

        // Helper to normalize network exports (handling Class vs Instance vs Default)
        const normalize = (className: string, constantName: string) => {
            const candidate = base[className] || base[constantName];

            // If we found an object instance but need a constructor (for 'new'), wrap it
            if (candidate && typeof candidate === 'object') {
                return function () { return candidate; };
            }
            return candidate;
        };

        return {
            ...base,
            StacksTestnet: normalize('StacksTestnet', 'STACKS_TESTNET'),
            StacksMainnet: normalize('StacksMainnet', 'STACKS_MAINNET'),
            StacksMocknet: normalize('StacksMocknet', 'STACKS_MOCKNET')
        };
    } catch (e) {
        console.error('Failed to load @stacks/network', e);
        return null;
    }
};

// Helper to get @stacks/common safely
export const getStacksCommon = async (): Promise<any> => {
    if (typeof window === 'undefined') return null;
    try {
        const mod = await import('@stacks/common');
        return mod.default || mod;
    } catch (e) {
        console.error('Failed to load @stacks/common', e);
        return null;
    }
};
