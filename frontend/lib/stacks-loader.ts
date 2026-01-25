/**
 * Stacks Library Loader (ESM)
 * Centrally manages Stacks libraries to ensure they are only evaluated in the browser.
 */

const getRobustExport = (mod: any, testProp: string) => {
    if (!mod) return null;
    // If the test property is on the root, it's likely a flattened ESM or CJS module
    if (mod[testProp]) return mod;
    // Otherwise, check the default export
    if (mod.default && mod.default[testProp]) return mod.default;
    // Fallback to whatever we have
    return mod.default || mod;
};

/**
 * Wraps a network candidate to ensure it can be used with the 'new' keyword.
 * If candidate is an object (instance), returns a function that returns that object.
 */
const wrapNetworkConstructor = (candidate: any) => {
    if (!candidate) return null;
    if (typeof candidate === 'object' && typeof candidate !== 'function') {
        const factory = function () { return candidate; };
        // Mark as wrapped for debugging
        (factory as any).isWrappedInstance = true;
        return factory;
    }
    return candidate;
};

// Helper to get @stacks/connect safely
export const getStacksConnect = async (): Promise<any> => {
    if (typeof window === 'undefined') return null;
    try {
        const mod = await import('@stacks/connect') as any;
        return getRobustExport(mod, 'openContractCall');
    } catch (e) {
        console.error('Failed to load @stacks/connect', e);
        return null;
    }
};

// Helper to get @stacks/transactions safely
export const getStacksTransactions = async (): Promise<any> => {
    if (typeof window === 'undefined') return null;
    try {
        const mod = await import('@stacks/transactions') as any;
        return getRobustExport(mod, 'uintCV');
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

        // Multi-path search for network candidates
        const testnet = mod.StacksTestnet || mod.default?.StacksTestnet || mod.default;
        const mainnet = mod.StacksMainnet || mod.default?.StacksMainnet || mod.default;

        // Base module resolution
        const base = getRobustExport(mod, 'StacksTestnet') || (mod.default || mod);

        return {
            ...base,
            StacksTestnet: wrapNetworkConstructor(testnet),
            StacksMainnet: wrapNetworkConstructor(mainnet),
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
        const mod = await import('@stacks/common') as any;
        return getRobustExport(mod, 'bytesToHex');
    } catch (e) {
        console.error('Failed to load @stacks/common', e);
        return null;
    }
};
