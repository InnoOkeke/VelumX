/**
 * Stacks Library Loader (ESM)
 * Centrally manages Stacks libraries to ensure they are only evaluated in the browser.
 */

// Helper to get @stacks/connect safely
export const getStacksConnect = async (): Promise<any> => {
    if (typeof window === 'undefined') return null;
    try {
        return await import('@stacks/connect');
    } catch (e) {
        console.error('Failed to load @stacks/connect', e);
        return null;
    }
};

// Helper to get @stacks/transactions safely
export const getStacksTransactions = async (): Promise<any> => {
    if (typeof window === 'undefined') return null;
    try {
        return await import('@stacks/transactions');
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

        // Helper to normalize network exports (handling Class vs Instance vs Default)
        const normalize = (className: string, constantName: string) => {
            const candidate = mod[className] || mod.default?.[className] || mod[constantName] || mod.default?.[constantName];

            // If we found an object instance but need a constructor (for 'new'), wrap it
            if (candidate && typeof candidate === 'object') {
                return function () { return candidate; };
            }
            return candidate;
        };

        return {
            ...mod, // Keep original exports
            StacksTestnet: normalize('StacksTestnet', 'STACKS_TESTNET'),
            StacksMainnet: normalize('StacksMainnet', 'STACKS_MAINNET'),
            StacksMocknet: normalize('StacksMocknet', 'STACKS_MOCKNET'),
            // Fallback for default export if it's the network instance itself
            default: mod.default
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
        return await import('@stacks/common');
    } catch (e) {
        console.error('Failed to load @stacks/common', e);
        return null;
    }
};
