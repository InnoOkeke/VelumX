/**
 * Sweep-to-STX Helper v3
 * Each token swaps independently to STX in one atomic tx.
 * Supports 1–6 tokens. User signs once.
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
  principal: string;   // contract principal e.g. SP123.my-token
  amount: string;      // raw amount in token's native decimals (as string)
  decimals: number;
  dex: DexType;
  factor?: number;     // ALEX pool factor (default 1e8)
  poolId?: number;     // Velar pool id
  token0?: string;     // Velar pool token0 principal
  token1?: string;     // Velar pool token1 principal
}

export interface SweepQuote {
  stxOut: string;       // human-readable STX (after fee)
  stxOutRaw: bigint;    // in STX micro units (1e6)
  fee: string;          // human-readable protocol fee
  perToken: {
    principal: string;
    stxOut: string;
    dex: DexType;
    savings?: string;    // e.g. "+1.2% vs Velar"
    noLiquidity?: boolean;
  }[];
}

const alexSdk = new AlexSDK();
const velarSdk = new VelarSDK();

// ---- Token resolution ----

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

const VELAR_SYMBOL_MAP: Record<string, string> = {
  'token-wstx': 'STX', 'token-alex': 'ALEX', 'token-aeusdc': 'aeUSDC',
  'sbtc-token': 'sBTC', 'token-susdt': 'sUSDT', 'velar-token': 'VELAR',
  'token-welsh': 'WELSH', 'token-leo': 'LEO', 'token-odin': 'ODIN',
  'ststx-token': 'stSTX', 'token-pepe': 'PEPE', 'token-not': 'NOT',
};

function principalToVelarSymbol(principal: string): string {
  const name = (principal.split('.')[1] || principal).toLowerCase();
  return VELAR_SYMBOL_MAP[name] || name.toUpperCase().replace(/-TOKEN$/, '').replace(/^TOKEN-/, '');
}

// ---- Per-token quotes ----

async function quoteAlex(principal: string, amountRaw: bigint, decimals: number): Promise<bigint | null> {
  try {
    const idIn = await resolveAlexId(principal);
    const idOut = 'token-wstx';
    if (!idIn) return null;
    // ALEX works in 1e8 units internally
    const amtAlex = BigInt(Math.floor(Number(amountRaw) / Math.pow(10, decimals) * 1e8));
    const out = await (alexSdk as any).getAmountTo(idIn, amtAlex, idOut);
    if (out == null) return null;
    // ALEX returns 1e8 wSTX, convert to STX micro (1e6)
    return BigInt(Math.floor(Number(out) / 100));
  } catch { return null; }
}

async function quoteVelar(principal: string, amountRaw: bigint, decimals: number): Promise<bigint | null> {
  try {
    const symIn = principalToVelarSymbol(principal);
    const humanIn = Number(amountRaw) / Math.pow(10, decimals);
    const swapInstance = await velarSdk.getSwapInstance({ account: '', inToken: symIn, outToken: 'STX' });
    const amtOut: number = await (swapInstance as any).getComputedAmount({ type: 1, amount: humanIn });
    if (!amtOut || amtOut <= 0) return null;
    // Velar returns human STX, convert to micro (1e6)
    return BigInt(Math.floor(amtOut * 1e6));
  } catch { return null; }
}

/**
 * Quote all tokens, auto-selecting best DEX per token.
 * Returns per-token STX output and total.
 */
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
  const [address, contractName] = principal.split('.');
  return { type: 'contract', address, contractName };
}

function makeUint(n: number | bigint) {
  return { type: 'uint', value: n.toString() };
}

const [feeAddr, feeName] = VELAR_SHARE_FEE_TO.split('.');
const FEE_TO_ARG = { type: 'contract', address: feeAddr, contractName: feeName };

function tokenArgs(t: SweepToken) {
  return [
    makeContract(t.principal),                          // token
    makeUint(t.dex === 'alex' ? 0 : 1),                // dex flag
    makeUint(t.factor ?? DEFAULT_ALEX_FACTOR),          // factor
    makeUint(t.poolId ?? 0),                            // pool-id
    makeContract(t.token0 ?? t.principal),              // t0
    makeContract(t.token1 ?? WSTX_PRINCIPAL),           // t1
    FEE_TO_ARG,                                         // fee-to
    makeUint(BigInt(t.amount)),                         // amount
  ];
}

/**
 * Execute the sweep. Builds args for sweep-to-stx-N and calls the contract.
 * User signs once, all tokens swap to STX atomically.
 */
export async function executeSweep(params: {
  tokens: SweepToken[];
  minStxOut: string;   // raw micro-STX as string
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
