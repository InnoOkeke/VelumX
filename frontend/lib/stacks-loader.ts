/**
 * Stacks Library Loader (ESM)
 * Centrally manages Stacks libraries to ensure they are only evaluated in the browser.
 */

// Global cache for loaded modules to prevent redundant work
const moduleCache: Record<string, any> = {};

/**
 * Safely extracts exports from a module, handling ESM and CJS wrapping.
 */
const getExport = (mod: any, key: string) => {
    if (!mod) return undefined;
    if (mod[key] !== undefined) return mod[key];
    if (mod.default && mod.default[key] !== undefined) return mod.default[key];
    return undefined;
};

/**
 * Normalizes a network candidate to ensure it's compatible with the 'new' keyword.
 */
const normalizeNetwork = (candidate: any) => {
    if (!candidate) return null;
    if (typeof candidate === 'function') return candidate;
    if (typeof candidate === 'object') {
        const instance = candidate;
        return class {
            constructor() { return instance; }
        };
    }
    return candidate;
};

// Helper to get @stacks/connect safely
export const getStacksConnect = async (): Promise<any> => {
    if (typeof window === 'undefined') return null;
    if (moduleCache.connect) return moduleCache.connect;
    try {
        const mod = await import('@stacks/connect') as any;
        const base = mod.default || mod;
        moduleCache.connect = {
            ...base,
            request: getExport(mod, 'request'),
            showConnect: getExport(mod, 'showConnect'),
            openContractCall: getExport(mod, 'openContractCall'),
            showSignMessage: getExport(mod, 'showSignMessage'),
            openSignatureRequestPopup: getExport(mod, 'openSignatureRequestPopup'), // Alias/Fallback
        };
        return moduleCache.connect;
    } catch (e) {
        console.error('Failed to load @stacks/connect', e);
        return null;
    }
};

// Helper to get @stacks/transactions safely
export const getStacksTransactions = async (): Promise<any> => {
    if (typeof window === 'undefined') return null;
    if (moduleCache.transactions) return moduleCache.transactions;
    try {
        const mod = await import('@stacks/transactions') as any;
        const base = mod.default || mod;

        // Explicitly map required functions to ensure visibility
        moduleCache.transactions = {
            ...base,
            Cl: getExport(mod, 'Cl'),
            makeContractCall: getExport(mod, 'makeContractCall'),
            AnchorMode: getExport(mod, 'AnchorMode'),
            PostConditionMode: getExport(mod, 'PostConditionMode'),
            cvToHex: getExport(mod, 'cvToHex'),
            hexToCV: getExport(mod, 'hexToCV'),
            cvToJSON: getExport(mod, 'cvToJSON'),
            fetchCallReadOnlyFunction: getExport(mod, 'fetchCallReadOnlyFunction'),
            makeUnsignedContractCall: getExport(mod, 'makeUnsignedContractCall'),
            makeSTXTokenTransfer: getExport(mod, 'makeSTXTokenTransfer'),
            Pc: getExport(mod, 'Pc'),
            FungibleConditionCode: getExport(mod, 'FungibleConditionCode'),
            NonFungibleConditionCode: getExport(mod, 'NonFungibleConditionCode'),
            makeStandardFungiblePostCondition: getExport(mod, 'makeStandardFungiblePostCondition'),
            createAssetInfo: getExport(mod, 'createAssetInfo'),
        };
        return moduleCache.transactions;
    } catch (e) {
        console.error('Failed to load @stacks/transactions', e);
        return null;
    }
};

// Helper to get @stacks/network safely
export const getStacksNetwork = async (): Promise<any> => {
    if (typeof window === 'undefined') return null;
    if (moduleCache.network) return moduleCache.network;
    try {
        const mod = await import('@stacks/network') as any;
        const testnet = getExport(mod, 'StacksTestnet') || getExport(mod, 'STACKS_TESTNET');
        const mainnet = getExport(mod, 'StacksMainnet') || getExport(mod, 'STACKS_MAINNET');

        const base = mod.default || mod;
        moduleCache.network = {
            ...base,
            StacksTestnet: normalizeNetwork(testnet),
            StacksMainnet: normalizeNetwork(mainnet),
        };
        return moduleCache.network;
    } catch (e) {
        console.error('Failed to load @stacks/network', e);
        return null;
    }
};

// Helper to get @stacks/common safely
export const getStacksCommon = async (): Promise<any> => {
    if (typeof window === 'undefined') return null;
    if (moduleCache.common) return moduleCache.common;
    try {
        const mod = await import('@stacks/common') as any;
        moduleCache.common = mod.default || mod;
        return moduleCache.common;
    } catch (e) {
        console.error('Failed to load @stacks/common', e);
        return null;
    }
};
