/**
 * Sweep-to-STX Helper v4
 * Token→symbol mapping built dynamically from Velar SDK at runtime.
 * No hardcoded token maps.
 */

import { AlexSDK } from 'alex-sdk';
import { VelarSDK } from '@velarprotocol/velar-sdk';
import { request } from '@stacks/connect';

export const SWEEP_CONTRACT = 'SPKYNF473GQ1V0WWCF24TV7ZR1WYAKTC7AM8QGBW.velumx-sweep';
export const DEFAULT_ALEX_FACTOR = 100000000; // 1e8
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

// ---- Dynamic principal → Velar symbol map ----
// Built once from getTokensMeta(), keyed by lowercase contract principal.
let velarSymbolMap: Map<string, string> | null = null;

async function getVelarSymbolMap(): Promise<Map<string, string>> {
  if (velarSymbolMap) return velarSymbolMap;
  const map = new Map<string, string>();
  try {
    const { getTokensMeta } = await import('@velarprotocol/velar-sdk');
    const meta = await getTokensMeta() as Record<string, any>;
    for (const entry of Object.values(meta)) {
      const addr = entry.contractAddress;
      const sym = entry.symbol;
      if (addr && sym && addr.includes('.')) {
        map.set(addr.toLowerCase(), sym);
      }
    }
  } catch {}
  velarSymbolMap = map;
  return map;
}

async function principalToVelarSymbol(principal: string): Promise<string> {
  if (!principal || !principal.includes('.')) return '';
  const map = await getVelarSymbolMap();
  return map.get(principal.toLowerCase()) ?? '';
}

// ---- ALEX token resolution ----
async function resolveAlexId(principal: string): Promise<string | null> {
  if (principal === WSTX_PRINCIPAL || principal === 'token-wstx') return 'token-wstx';
  try {
    const tokens = await alexSdk.fetchSwappableCurrency();
    const match = tokens.find((t: any) => {
      const addr = t.wrapToken ? t.wrapToken.split('::')[0] : '';
      return addr.toLowerCase() === principal.toLowerCase() ||
             t.id?.toLowerCase() === principal.toLowerCase();
    });
    if (match) return (match as any).id;
  } catch {}
  return null;
}

// ---- Per-token quotes ----
async function quoteAlex(principal: string, amountRaw: bigint, decimals: number): Promise<bigint | null> {
  try {
    const idIn = await resolveAlexId(principal);
    if (!idIn) return null;
    const amtAlex = BigInt(Math.floor(Number(amountRaw) / Math.pow(10, decimals) * 1e8));
    const out = await (alexSdk as any).getAmountTo(idIn, amtAlex, 'token-wstx');
    if (out == null) return null;
    return BigInt(Math.floor(Number(out) / 100)); // 1e8 → 1e6
  } catch { return null; }
}

async function quoteVelar(principal: string, amountRaw: bigint, decimals: number): Promise<bigint | null> {
  try {
    const symIn = await principalToVelarSymbol(principal);
    if (!symIn) return null;
    const humanIn = Number(amountRaw) / Math.pow(10, decimals);
    const swapInstance = await velarSdk.getSwapInstance({ account: '', inToken: symIn, outToken: 'STX' });
    const amtOut: number = await (swapInstance as any).getComputedAmount({ type: 1, amount: humanIn });
    if (!amtOut || amtOut <= 0) return null;
    return BigInt(Math.floor(amtOut * 1e6));
  } catch { return null; }
}

// ---- Quote all tokens ----
export async function quoteSweep(tokens: Pick<SweepToken, 'principal' | 'amount' | 'decimals'>[]): Promise<SweepQuote> {
  if (tokens.length < 1 || tokens.length > 6) throw new Error('Sweep supports 1–6 tokens');

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
  if (!principal || !principal.includes('.')) {
    throw new Error(`Invalid principal: "${principal}"`);
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
