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

async function quoteVelar(principal: string, amountRaw: bigint, decimals: number): Promise<bigint | null> {
  try {
    const map = await getVelarSymbolMap();
    const symIn = map.get(principal.toLowerCase());
    if (!symIn) {
      console.debug(`[sweep] Velar: no symbol for ${principal}`);
      return null;
    }
    console.debug(`[sweep] Velar: quoting ${principal} → symbol "${symIn}"`);
    const humanIn = Number(amountRaw) / Math.pow(10, decimals);
    const swapInstance = await velarSdk.getSwapInstance({ account: '', inToken: symIn, outToken: 'STX' });
    const amtOut: number = await (swapInstance as any).getComputedAmount({ type: 1, amount: humanIn });
    if (!amtOut || amtOut <= 0) return null;
    return BigInt(Math.floor(amtOut * 1e6));
  } catch (e: any) {
    console.warn(`[sweep] Velar quote failed for ${principal} — ${e?.message}`);
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

    console.debug(`[sweep] ${t.principal} → ALEX: ${alexOut}, Velar: ${velarOut}`);

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
    // Resolve ALEX short IDs to full principal
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
  return [
    makeContract(t.principal),
    makeUint(t.dex === 'alex' ? 0 : 1),
    makeUint(t.factor ?? DEFAULT_ALEX_FACTOR),
    makeUint(t.poolId ?? 0),
    makeContract(t.token0 ?? t.principal),
    makeContract(t.token1 ?? WSTX_PRINCIPAL),
    FEE_TO_ARG,
    makeUint(BigInt(t.amount)),
  ];
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
  const functionArgs = [
    ...tokens.flatMap(tokenArgs),
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
