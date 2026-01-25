/**
 * Stacks Library Loader (ESM)
 * Centrally manages Stacks libraries to ensure they are only evaluated in the browser.
 */

/**
 * Internal helper to merge module root and default export safely.
 * Handles Next.js/Webpack chunk differences where exports might be wrapped in .default.
 */
const flattenModule = (mod: any) => {
    if (!mod) return null;
    const result = { ...(mod.default || {}), ...mod };
    return result;
};

const getRobustExport = (mod: any, testProp: string) => {
    if (!mod) return null;
    if (mod[testProp]) return mod;
    if (mod.default && mod.default[testProp]) return mod.default;
    return mod.default || mod;
};

/**
 * Normalizes a network candidate to ensure it's compatible with the 'new' keyword.
 * If candidate is an object instance, it wraps it in a class that returns that instance.
 */
const normalizeNetwork = (candidate: any) => {
    if (!candidate) return null;
    // If it's already a class/function, return as is
    if (typeof candidate === 'function') return candidate;
    // If it's an object instance, wrap it in a class to ensure 'new' keyword works
    if (typeof candidate === 'object') {
        return class {
            constructor() {
                return candidate;
            }
        };
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

        // Find candidates using the most robust paths
        const testnet = mod.StacksTestnet || mod.default?.StacksTestnet || mod.STACKS_TESTNET || mod.default?.STACKS_TESTNET || mod.default;
        const mainnet = mod.StacksMainnet || mod.default?.StacksMainnet || mod.STACKS_MAINNET || mod.default?.STACKS_MAINNET || mod.default;

        const base = mod.default || mod;

        return {
            ...base,
            StacksTestnet: normalizeNetwork(testnet),
            StacksMainnet: normalizeNetwork(mainnet),
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
