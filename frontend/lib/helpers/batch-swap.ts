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
function makeContract(principal: string) {
  if (!principal?.includes('.')) {
    const resolved = alexPrincipalMap?.get(principal.toLowerCase());
    if (resolved?.includes('.')) {
      const dot = resolved.indexOf('.');
      return { type: 'contract', address: resolved.slice(0, dot), contractName: resolved.slice(dot + 1) };
    }
    throw new Error(`Cannot build contract arg from "${principal}" — no dot separator`);
  }
  const dot = principal.indexOf('.');
  return { type: 'contract', address: principal.slice(0, dot), contractName: principal.slice(dot + 1) };
}

function makeUint(n: number | bigint) {
  return { type: 'uint', value: n.toString() };
}

const [feeAddr, feeName] = VELAR_SHARE_FEE_TO.split('.');
const FEE_TO_ARG = { type: 'contract', address: feeAddr, contractName: feeName };

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
  if (!t?.principal) return t; // guard against undefined/null
  if (t.dex !== 'velar') return t;
  try {
    const humanIn = Number(BigInt(t.amount)) / Math.pow(10, t.decimals);
    const swapInstance = await velarSdk.getSwapInstance({
      account: '',
      inToken: t.principal,
      outToken: VELAR_STX,
    });
    const swapResp: any = await swapInstance.swap({ amount: humanIn });
    const args = swapResp?.functionArgs;
    if (args && args.length >= 3) {
      const poolId = Number(args[0]?.value ?? 0);
      const t0addr = args[1]?.address;
      const t0name = args[1]?.contractName;
      const t1addr = args[2]?.address;
      const t1name = args[2]?.contractName;
      if (t0addr && t0name && t1addr && t1name) {
        return { ...t, poolId, token0: `${t0addr}.${t0name}`, token1: `${t1addr}.${t1name}` };
      }
    }
  } catch {}
  return { ...t, token0: t.principal, token1: VELAR_STX };
}

export async function executeSweep(params: {
  tokens: SweepToken[];
  minStxOut: string;
  onProgress?: (msg: string) => void;
}): Promise<string> {
  const { tokens, minStxOut, onProgress } = params;
  const n = tokens.length;
  if (n < 1 || n > 6) throw new Error('Sweep supports 1–6 tokens');

  onProgress?.('Building transaction...');

  // Enrich Velar tokens with correct pool/token args from SDK
  const enriched = (await Promise.all(tokens.map(enrichVelarToken))).filter(t => t?.principal?.includes('.')) as SweepToken[];

  const functionArgs = [
    ...enriched.flatMap(tokenArgs),
    makeUint(BigInt(minStxOut)),
  ];

  onProgress?.('Waiting for wallet signature...');
  return new Promise((resolve, reject) => {
    request('stx_callContract', {
      contract: SWEEP_CONTRACT,
      functionName: `sweep-to-stx-${n}`,
      functionArgs,
      network: 'mainnet',
      postConditionMode: 'allow',
      onFinish: (data: any) => { onProgress?.('Submitted!'); resolve(data.txid); },
      onCancel: () => reject(new Error('Cancelled by user')),
    } as any).catch(reject);
  });
}
