/**
 * Sweep-to-STX Helper v5
 * Pre-warms both SDK token lists at module load.
 * No hardcoded maps. All data from SDKs.
 */

import { AlexSDK } from 'alex-sdk';
import { VelarSDK } from '@velarprotocol/velar-sdk';
import { request } from '@stacks/connect';

export const SWEEP_CONTRACT = 'SPKYNF473GQ1V0WWCF24TV7ZR1WYAKTC7AM8QGBW.velumx-sweep';
export const DEFAULT_ALEX_FACTOR = 100000000;
export const VELAR_SHARE_FEE_TO = 'SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.univ2-share-fee-to';
export const WSTX_PRINCIPAL = 'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.token-wstx';

export type DexType = 'alex' | 'velar';

export interface SweepToken {
  principal: string;
  amount: string;
  decimals: number;
  dex: DexType;
  factor?: number;
  poolId?: number;
  token0?: string;
  token1?: string;
}

export interface SweepQuote {
  stxOut: string;
  stxOutRaw: bigint;
  fee: string;
  perToken: {
    principal: string;
    stxOut: string;
    dex: DexType;
    savings?: string;
    noLiquidity?: boolean;
  }[];
}

const alexSdk = new AlexSDK();
const velarSdk = new VelarSDK();

// ---- ALEX maps ----
let alexTokenMap: Map<string, string> | null = null;       // principal/id → ALEX id
let alexPrincipalMap: Map<string, string> | null = null;   // ALEX id → full principal
let alexTokenMapPromise: Promise<Map<string, string>> | null = null;

async function getAlexTokenMap(): Promise<Map<string, string>> {
  if (alexTokenMap) return alexTokenMap;
  if (alexTokenMapPromise) return alexTokenMapPromise;
  alexTokenMapPromise = (async () => {
    const map = new Map<string, string>();
    const principalMap = new Map<string, string>();
    try {
      const tokens = await alexSdk.fetchSwappableCurrency();
      for (const t of tokens as any[]) {
        const addr = t.wrapToken ? t.wrapToken.split('::')[0] : '';
        if (addr && t.id) {
          map.set(addr.toLowerCase(), t.id);
          map.set(t.id.toLowerCase(), t.id);
          principalMap.set(t.id.toLowerCase(), addr);
        }
      }
      map.set(WSTX_PRINCIPAL.toLowerCase(), 'token-wstx');
      map.set('token-wstx', 'token-wstx');
      principalMap.set('token-wstx', WSTX_PRINCIPAL);
    } catch (e) {
      console.warn('[sweep] ALEX token map failed:', e);
    }
    alexTokenMap = map;
    alexPrincipalMap = principalMap;
    console.debug(`[sweep] ALEX token map built: ${map.size} entries`);
    return map;
  })();
  return alexTokenMapPromise;
}

// ---- Velar map ----
let velarSymbolMap: Map<string, string> | null = null;
let velarSymbolMapPromise: Promise<Map<string, string>> | null = null;

async function getVelarSymbolMap(): Promise<Map<string, string>> {
  if (velarSymbolMap) return velarSymbolMap;
  if (velarSymbolMapPromise) return velarSymbolMapPromise;
  velarSymbolMapPromise = (async () => {
    const map = new Map<string, string>();
    try {
      const { getTokensMeta, getTokens } = await import('@velarprotocol/velar-sdk');
      const [meta, swappable] = await Promise.all([
        (getTokensMeta() as Promise<Record<string, any>>),
        (getTokens() as Promise<any>).catch(() => null),
      ]);

      console.debug('[sweep] Velar getTokens result:', swappable);

      // Build valid symbol set — getTokens() may return object or array
      let validSymbols: Set<string> | null = null;
      if (swappable) {
        if (Array.isArray(swappable)) {
          validSymbols = new Set(swappable.map((t: any) => t.symbol || t).filter(Boolean));
        } else if (typeof swappable === 'object') {
          validSymbols = new Set(Object.keys(swappable));
        }
      }

      console.debug(`[sweep] Velar valid symbols (${validSymbols?.size ?? 0}):`, validSymbols ? [...validSymbols].join(', ') : 'none');

      for (const entry of Object.values(meta)) {
        const addr = entry.contractAddress;
        const sym = entry.symbol;
        if (!addr || !sym || !addr.includes('.')) continue;
        // Filter by valid symbols if available; otherwise include all from meta
        if (validSymbols && validSymbols.size > 0 && !validSymbols.has(sym)) continue;
        map.set(addr.toLowerCase(), sym);
      }
    } catch (e) {
      console.warn('[sweep] Velar symbol map failed:', e);
    }
    velarSymbolMap = map;
    console.debug(`[sweep] Velar symbol map built: ${map.size} tokens`);
    return map;
  })();
  return velarSymbolMapPromise;
}

// Pre-warm both maps at module load
getAlexTokenMap();
getVelarSymbolMap();

// ---- Per-token quotes ----

async function quoteAlex(principal: string, amountRaw: bigint, decimals: number): Promise<bigint | null> {
  try {
    const map = await getAlexTokenMap();
    const idIn = map.get(principal.toLowerCase())
      ?? map.get(principal.split('.')[1]?.toLowerCase() ?? '')
      ?? principal;

    // ALEX SDK always expects 1e8 units
    const amtAlex = BigInt(Math.floor(Number(amountRaw) / Math.pow(10, decimals) * 1e8));
    console.debug(`[sweep] ALEX: quoting ${principal} → id "${idIn}", amount ${amtAlex}`);

    // Try direct route: token → wSTX
    let out: any = await (alexSdk as any).getAmountTo(idIn, amtAlex, 'token-wstx').catch(() => null);

    // Multi-hop fallback: token → ALEX → wSTX
    if (out == null) {
      const alexId = 'age000-governance-token';
      const leg1 = await (alexSdk as any).getAmountTo(idIn, amtAlex, alexId).catch(() => null);
      if (leg1 != null) {
        out = await (alexSdk as any).getAmountTo(alexId, leg1, 'token-wstx').catch(() => null);
        if (out != null) console.debug(`[sweep] ALEX multi-hop: ${principal} → ALEX → STX`);
      }
    }

    if (out == null) return null;
    return BigInt(Math.floor(Number(out) / 100)); // 1e8 → 1e6
  } catch (e) {
    console.warn('[sweep] ALEX quote failed for', principal, e);
    return null;
  }
}

// Velar's STX contract address (different from ALEX's wSTX)
const VELAR_STX = 'SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.wstx';

async function quoteVelar(principal: string, amountRaw: bigint, decimals: number): Promise<bigint | null> {
  try {
    const swapInstance = await velarSdk.getSwapInstance({
      account: '',
      inToken: principal,
      outToken: VELAR_STX,
    });
    const humanIn = Number(amountRaw) / Math.pow(10, decimals);
    const result: any = await swapInstance.getComputedAmount({ amount: humanIn });
    const amtOut = result?.amountOutDecimal ?? result?.amountOut;
    if (!amtOut || Number(amtOut) <= 0) return null;
    return BigInt(Math.floor(Number(amtOut) * 1e6));
  } catch {
    return null;
  }
}

// ---- Quote all tokens ----
export async function quoteSweep(tokens: Pick<SweepToken, 'principal' | 'amount' | 'decimals'>[]): Promise<SweepQuote> {
  if (tokens.length < 1 || tokens.length > 6) throw new Error('Sweep supports 1–6 tokens');

  await Promise.all([getAlexTokenMap(), getVelarSymbolMap()]);

  const perToken: SweepQuote['perToken'] = [];
  let totalRaw = 0n;

  await Promise.all(tokens.map(async (t) => {
    const amountRaw = BigInt(t.amount);
    const [alexOut, velarOut] = await Promise.all([
      quoteAlex(t.principal, amountRaw, t.decimals),
      quoteVelar(t.principal, amountRaw, t.decimals),
    ]);

    if (alexOut == null && velarOut == null) {
      perToken.push({ principal: t.principal, stxOut: '0', dex: 'alex', noLiquidity: true });
      return;
    }

    const dex: DexType = (alexOut ?? 0n) >= (velarOut ?? 0n) ? 'alex' : 'velar';
    const out = dex === 'alex' ? alexOut! : velarOut!;
    const other = dex === 'alex' ? velarOut : alexOut;
    const savings = other != null && other > 0n
      ? `+${((Number(out - other) / Number(other)) * 100).toFixed(2)}% vs ${dex === 'alex' ? 'Velar' : 'ALEX'}`
      : undefined;

    totalRaw += out;
    perToken.push({ principal: t.principal, stxOut: (Number(out) / 1e6).toFixed(6), dex, savings });
  }));

  const feeRaw = totalRaw / 1000n;
  const netRaw = totalRaw - feeRaw;

  return {
    stxOut: (Number(netRaw) / 1e6).toFixed(6),
    stxOutRaw: netRaw,
    fee: (Number(feeRaw) / 1e6).toFixed(6),
    perToken,
  };
}

// ---- Clarity arg builders ----
// Uses @stacks/transactions Cl helpers to build proper ClarityValues
import { Cl } from '@stacks/transactions';

function makeContract(principal: string) {
  if (!principal?.includes('.')) {
    const resolved = alexPrincipalMap?.get(principal?.toLowerCase());
    if (resolved?.includes('.')) {
      const dot = resolved.indexOf('.');
      return Cl.contractPrincipal(resolved.slice(0, dot), resolved.slice(dot + 1));
    }
    throw new Error(`makeContract: invalid principal "${principal}" (no dot separator)`);
  }
  const dot = principal.indexOf('.');
  return Cl.contractPrincipal(principal.slice(0, dot), principal.slice(dot + 1));
}

function makeUint(n: number | bigint) {
  return Cl.uint(n);
}

const [feeAddr, feeName] = VELAR_SHARE_FEE_TO.split('.');
const FEE_TO_ARG = Cl.contractPrincipal(feeAddr, feeName);

function tokenArgs(t: SweepToken) {
  if (!t.principal?.includes('.')) throw new Error(`Invalid token principal: "${t.principal}"`);
  const token0 = t.token0 ?? t.principal;
  const token1 = t.token1 ?? WSTX_PRINCIPAL;
  if (!token0.includes('.')) throw new Error(`Invalid token0: "${token0}" for ${t.principal}`);
  if (!token1.includes('.')) throw new Error(`Invalid token1: "${token1}" for ${t.principal}`);
  return [
    makeContract(t.principal),
    makeUint(t.dex === 'alex' ? 0 : 1),
    makeUint(t.factor ?? DEFAULT_ALEX_FACTOR),
    makeUint(t.poolId ?? 0),
    makeContract(token0),
    makeContract(token1),
    FEE_TO_ARG,
    makeUint(BigInt(t.amount)),
  ];
}

/**
 * For Velar tokens, fetch the actual swap args from the SDK to get correct
 * pool IDs and token addresses. Returns enriched SweepToken or null if failed.
 */
async function enrichVelarToken(t: SweepToken): Promise<SweepToken> {
  if (!t?.principal?.includes('.')) return { ...t, token0: t?.principal ?? '', token1: VELAR_STX };
  if (t.dex !== 'velar') return t;
  try {
    const humanIn = Number(BigInt(t.amount)) / Math.pow(10, t.decimals);

    const swapInstance: any = await new Promise((resolve, reject) => {
      try {
        const inst = velarSdk.getSwapInstance({
          account: '',
          inToken: t.principal,
          outToken: VELAR_STX,
        });
        Promise.resolve(inst).then(resolve).catch(reject);
      } catch (e) { reject(e); }
    });

    const swapResp: any = await swapInstance.swap({ amount: humanIn });
    console.log(`[sweep] enrichVelarToken ${t.principal} swapResp:`, JSON.stringify({
      contractAddress: swapResp?.contractAddress,
      contractName: swapResp?.contractName,
      functionName: swapResp?.functionName,
      argsCount: swapResp?.functionArgs?.length,
      // Log each arg's type and value to understand the structure
      args: swapResp?.functionArgs?.map((a: any, i: number) => `[${i}] type=${a?.type} value=${JSON.stringify(a?.value)}`),
    }));

    const args = swapResp?.functionArgs;
    if (!args || args.length < 3) {
      console.warn(`[sweep] enrichVelarToken: insufficient args for ${t.principal}`);
      return { ...t, dex: 'alex', token0: t.principal, token1: WSTX_PRINCIPAL };
    }

    // ContractPrincipalCV from @stacks/transactions has value.address and value.contractName
    // Try both direct and nested structures
    const getAddr = (cv: any) => cv?.address ?? cv?.value?.address ?? cv?.value?.hash160;
    const getName = (cv: any) => cv?.contractName ?? cv?.value?.contractName ?? cv?.value?.name;

    const poolId = Number(args[0]?.value ?? args[0] ?? 0);
    const t0addr = getAddr(args[1]);
    const t0name = getName(args[1]);
    const t1addr = getAddr(args[2]);
    const t1name = getName(args[2]);

    console.log(`[sweep] enrichVelarToken ${t.principal}: pool=${poolId} t0=${t0addr}.${t0name} t1=${t1addr}.${t1name}`);

    if (t0addr && t0name && t1addr && t1name) {
      return { ...t, poolId, token0: `${t0addr}.${t0name}`, token1: `${t1addr}.${t1name}` };
    }

    console.warn(`[sweep] enrichVelarToken: could not extract token addresses for ${t.principal}`);
  } catch (e: any) {
    console.warn(`[sweep] enrichVelarToken failed for ${t.principal}:`, e?.message);
  }
  return { ...t, dex: 'alex', token0: t.principal, token1: WSTX_PRINCIPAL };
}

export async function executeSweep(params: {
  tokens: SweepToken[];
  minStxOut: string;
  onProgress?: (msg: string) => void;
}): Promise<string> {
  const { tokens, minStxOut, onProgress } = params;
  const n = tokens.length;
  if (n < 1 || n > 6) throw new Error('Sweep supports 1–6 tokens');

  console.log('[sweep] executeSweep called with', n, 'tokens:', tokens.map(t => `${t.principal} (${t.dex})`));

  const velarTokens = tokens.filter(t => t.dex === 'velar');
  const alexTokens = tokens.filter(t => t.dex !== 'velar');

  console.log('[sweep] ALEX tokens:', alexTokens.length, '| Velar tokens:', velarTokens.length);

  // If all tokens are ALEX, use our sweep contract (single atomic tx)
  if (velarTokens.length === 0) {
    onProgress?.('Building transaction...');
    const enriched = (await Promise.all(alexTokens.map(enrichVelarToken)))
      .filter(t => t?.principal?.includes('.')) as SweepToken[];
    console.log('[sweep] ALEX-only path, enriched tokens:', enriched.map(t => `${t.principal} token0=${t.token0} token1=${t.token1}`));
    const functionArgs = [
      ...enriched.flatMap(tokenArgs),
      makeUint(BigInt(minStxOut)),
    ];
    console.log('[sweep] Calling sweep contract:', SWEEP_CONTRACT, `sweep-to-stx-${enriched.length}`);
    onProgress?.('Waiting for wallet signature...');
    return new Promise((resolve, reject) => {
      request('stx_callContract', {
        contract: SWEEP_CONTRACT,
        functionName: `sweep-to-stx-${enriched.length}`,
        functionArgs,
        network: 'mainnet',
        postConditionMode: 'allow',
        onFinish: (data: any) => { onProgress?.('Submitted!'); resolve(data.txid); },
        onCancel: () => reject(new Error('Cancelled by user')),
      } as any).catch((e: any) => { console.error('[sweep] request failed:', e); reject(e); });
    });
  }

  // Single Velar token — use Velar's router directly
  if (alexTokens.length === 0 && velarTokens.length === 1) {
    const t = velarTokens[0];
    onProgress?.('Getting Velar swap route...');
    console.log('[sweep] Velar-only path for:', t.principal);
    const humanIn = Number(BigInt(t.amount)) / Math.pow(10, t.decimals);
    console.log('[sweep] humanIn:', humanIn);
    const swapInstance: any = await new Promise((resolve, reject) => {
      try {
        const inst = velarSdk.getSwapInstance({ account: '', inToken: t.principal, outToken: VELAR_STX });
        Promise.resolve(inst).then(resolve).catch(reject);
      } catch (e) { reject(e); }
    });
    const swapOptions: any = await swapInstance.swap({ amount: humanIn });
    console.log('[sweep] Velar swapOptions:', JSON.stringify({
      contract: `${swapOptions.contractAddress}.${swapOptions.contractName}`,
      functionName: swapOptions.functionName,
      argsCount: swapOptions.functionArgs?.length,
    }));
    onProgress?.('Waiting for wallet signature...');
    return new Promise((resolve, reject) => {
      request('stx_callContract', {
        contract: `${swapOptions.contractAddress}.${swapOptions.contractName}`,
        functionName: swapOptions.functionName,
        functionArgs: swapOptions.functionArgs,
        network: 'mainnet',
        postConditionMode: 'allow',
        postConditions: swapOptions.postConditions ?? [],
        onFinish: (data: any) => { onProgress?.('Submitted!'); resolve(data.txid); },
        onCancel: () => reject(new Error('Cancelled by user')),
      } as any).catch((e: any) => { console.error('[sweep] Velar request failed:', e); reject(e); });
    });
  }

  // Mixed DEX — use sweep contract for all tokens
  console.log('[sweep] Mixed DEX path');
  onProgress?.('Building transaction...');
  const enriched = (await Promise.all(tokens.map(enrichVelarToken)))
    .filter(t => t?.principal?.includes('.')) as SweepToken[];
  console.log('[sweep] Mixed enriched tokens:', enriched.map(t => `${t.principal} dex=${t.dex} token0=${t.token0} token1=${t.token1}`));
  const functionArgs = [
    ...enriched.flatMap(tokenArgs),
    makeUint(BigInt(minStxOut)),
  ];
  onProgress?.('Waiting for wallet signature...');
  return new Promise((resolve, reject) => {
    request('stx_callContract', {
      contract: SWEEP_CONTRACT,
      functionName: `sweep-to-stx-${enriched.length}`,
      functionArgs,
      network: 'mainnet',
      postConditionMode: 'allow',
      onFinish: (data: any) => { onProgress?.('Submitted!'); resolve(data.txid); },
      onCancel: () => reject(new Error('Cancelled by user')),
    } as any).catch((e: any) => { console.error('[sweep] Mixed request failed:', e); reject(e); });
  });
}
