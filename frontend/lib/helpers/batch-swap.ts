/**
 * Batch Swap Helper v2
 * Supports ALEX and Velar hops, 2/3/4/5/10 hop counts.
 * Auto best-route: quotes both DEXes per hop, picks the better one.
 * Users pay STX fees + 0.1% protocol fee. No relayer.
 */

import { AlexSDK } from 'alex-sdk';
import { VelarSDK, getTokens } from '@velarprotocol/velar-sdk';
import { request } from '@stacks/connect';

export const BATCH_SWAP_CONTRACT = 'SPKYNF473GQ1V0WWCF24TV7ZR1WYAKTC7AM8QGBW.batch-swap';
export const DEFAULT_ALEX_FACTOR = 100000000; // 1e8
// Velar deployer implements share-fee-to-trait
export const VELAR_SHARE_FEE_TO = 'SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.univ2-share-fee-to';

export type DexType = 'alex' | 'velar';

export interface BatchHop {
  tokenIn: string;
  tokenOut: string;
  dex: DexType;
  factor?: number;   // ALEX pool factor
  poolId?: number;   // Velar pool id
  token0?: string;   // Velar pool token0
  token1?: string;   // Velar pool token1
}

export interface HopDetail {
  dex: DexType;
  tokenIn: string;
  tokenOut: string;
  amountOut: string;
  savings?: string; // how much better vs the other DEX
}

export interface BatchQuote {
  amountOut: string;
  amountOutRaw: bigint;
  protocolFee: string;
  route: string[];
  hopsDetail: HopDetail[];
}

const alexSdk = new AlexSDK();
const velarSdk = new VelarSDK();

// ---- Token resolution ----

async function resolveAlexId(principal: string): Promise<string | null> {
  if (principal === 'token-wstx' || principal === 'STX') return 'token-wstx';
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

// ---- Single-hop quotes ----

async function quoteAlex(tokenIn: string, tokenOut: string, amountIn: bigint, inputDecimals: number): Promise<bigint | null> {
  try {
    const idIn = await resolveAlexId(tokenIn);
    const idOut = await resolveAlexId(tokenOut);
    if (!idIn || !idOut) return null;
    const amtAlex = BigInt(Math.floor(Number(amountIn) / Math.pow(10, inputDecimals) * 1e8));
    const out = await (alexSdk as any).getAmountTo(idIn, amtAlex, idOut);
    return out != null ? BigInt(out) : null;
  } catch { return null; }
}

async function quoteVelar(tokenIn: string, tokenOut: string, amountIn: bigint, inputDecimals: number): Promise<bigint | null> {
  try {
    const symIn = principalToVelarSymbol(tokenIn);
    const symOut = principalToVelarSymbol(tokenOut);
    const humanIn = Number(amountIn) / Math.pow(10, inputDecimals);
    const swapInstance = await velarSdk.getSwapInstance({ account: '', inToken: symIn, outToken: symOut });
    const amtOut: number = await (swapInstance as any).getComputedAmount({ type: 1, amount: humanIn });
    if (!amtOut || amtOut <= 0) return null;
    return BigInt(Math.floor(amtOut * 1e8));
  } catch { return null; }
}

// ---- Best route: auto-select DEX per hop ----

export async function getBestRouteQuote(
  hops: { tokenIn: string; tokenOut: string }[],
  amountIn: string,
  inputDecimals = 8
): Promise<BatchQuote> {
  if (hops.length < 2 || hops.length > 10) throw new Error('Batch swap requires 2–10 hops');

  const inputRaw = BigInt(amountIn);
  const feeRaw = inputRaw / 1000n;
  let currentAmount = inputRaw - feeRaw;
  let currentDecimals = inputDecimals;

  const hopsDetail: HopDetail[] = [];
  const resolvedHops: BatchHop[] = [];

  for (const hop of hops) {
    // Quote both DEXes in parallel
    const [alexOut, velarOut] = await Promise.all([
      quoteAlex(hop.tokenIn, hop.tokenOut, currentAmount, currentDecimals),
      quoteVelar(hop.tokenIn, hop.tokenOut, currentAmount, currentDecimals),
    ]);

    let chosenDex: DexType;
    let chosenOut: bigint;

    if (alexOut == null && velarOut == null) {
      throw new Error(`No liquidity found for ${hop.tokenIn.split('.').pop()} -> ${hop.tokenOut.split('.').pop()} on either DEX`);
    } else if (alexOut == null) {
      chosenDex = 'velar'; chosenOut = velarOut!;
    } else if (velarOut == null) {
      chosenDex = 'alex'; chosenOut = alexOut;
    } else {
      // Pick the better one
      chosenDex = alexOut >= velarOut ? 'alex' : 'velar';
      chosenOut = alexOut >= velarOut ? alexOut : velarOut;
    }

    const otherOut = chosenDex === 'alex' ? velarOut : alexOut;
    const savings = otherOut != null
      ? `+${((Number(chosenOut - otherOut) / Number(otherOut)) * 100).toFixed(2)}% vs ${chosenDex === 'alex' ? 'Velar' : 'ALEX'}`
      : undefined;

    hopsDetail.push({
      dex: chosenDex,
      tokenIn: hop.tokenIn,
      tokenOut: hop.tokenOut,
      amountOut: (Number(chosenOut) / 1e8).toFixed(6),
      savings,
    });

    resolvedHops.push({ tokenIn: hop.tokenIn, tokenOut: hop.tokenOut, dex: chosenDex, factor: DEFAULT_ALEX_FACTOR });
    currentAmount = chosenOut;
    currentDecimals = 8;
  }

  const humanOut = (Number(currentAmount) / 1e8).toFixed(6);
  const humanFee = (Number(feeRaw) / Math.pow(10, inputDecimals)).toFixed(6);
  const route = [hops[0].tokenIn, ...hops.map(h => h.tokenOut)].map(p => p.split('.').pop() || p);

  return {
    amountOut: humanOut,
    amountOutRaw: currentAmount,
    protocolFee: humanFee,
    route,
    hopsDetail,
    // attach resolved hops for execution
    ...(resolvedHops as any),
    _resolvedHops: resolvedHops,
  } as BatchQuote & { _resolvedHops: BatchHop[] };
}

// ---- Manual quote (user-specified DEX per hop) ----

export async function getBatchQuote(
  hops: BatchHop[],
  amountIn: string,
  inputDecimals = 8
): Promise<BatchQuote> {
  if (hops.length < 2 || hops.length > 10) throw new Error('Batch swap requires 2–10 hops');

  const inputRaw = BigInt(amountIn);
  const feeRaw = inputRaw / 1000n;
  let currentAmount = inputRaw - feeRaw;
  const hopsDetail: HopDetail[] = [];

  for (const hop of hops) {
    let out: bigint | null = null;
    if (hop.dex === 'alex') {
      out = await quoteAlex(hop.tokenIn, hop.tokenOut, currentAmount, inputDecimals);
      if (out == null) throw new Error(`No ALEX liquidity: ${hop.tokenIn} -> ${hop.tokenOut}`);
    } else {
      out = await quoteVelar(hop.tokenIn, hop.tokenOut, currentAmount, inputDecimals);
      if (out == null) throw new Error(`No Velar liquidity: ${hop.tokenIn} -> ${hop.tokenOut}`);
    }
    hopsDetail.push({ dex: hop.dex, tokenIn: hop.tokenIn, tokenOut: hop.tokenOut, amountOut: (Number(out) / 1e8).toFixed(6) });
    currentAmount = out;
    inputDecimals = 8;
  }

  const humanOut = (Number(currentAmount) / 1e8).toFixed(6);
  const humanFee = (Number(feeRaw) / Math.pow(10, inputDecimals)).toFixed(6);
  const route = [hops[0].tokenIn, ...hops.map(h => h.tokenOut)].map(p => p.split('.').pop() || p);

  return { amountOut: humanOut, amountOutRaw: currentAmount, protocolFee: humanFee, route, hopsDetail };
}

// ---- Build Clarity args ----

function makeToken(principal: string) {
  const [addr, name] = principal.split('.');
  return { type: 'contract', address: addr, contractName: name };
}

function makeUint(n: number | bigint) {
  return { type: 'uint', value: n.toString() };
}

function hopArgs(hop: BatchHop) {
  const dexFlag = makeUint(hop.dex === 'alex' ? 0 : 1);
  const factor  = makeUint(hop.factor ?? DEFAULT_ALEX_FACTOR);
  const poolId  = makeUint(hop.poolId ?? 0);
  const t0 = makeToken(hop.token0 ?? hop.tokenIn);
  const t1 = makeToken(hop.token1 ?? hop.tokenOut);
  // fee-to: Velar share-fee-to contract (implements share-fee-to-trait)
  const [feeAddr, feeName] = VELAR_SHARE_FEE_TO.split('.');
  const feeTo = { type: 'contract', address: feeAddr, contractName: feeName };
  return [dexFlag, factor, poolId, t0, t1, feeTo];
}

// ---- Execute ----

export async function executeBatchSwap(params: {
  hops: BatchHop[];
  amountIn: string;
  minAmountOut: string;
  onProgress?: (msg: string) => void;
}): Promise<string> {
  const { hops, amountIn, minAmountOut, onProgress } = params;
  const n = hops.length;
  if (n < 2 || n > 10 || (n > 5 && n < 10)) {
    throw new Error('Supported hop counts: 2, 3, 4, 5, 10');
  }

  onProgress?.('Building transaction...');

  const tokenPrincipals = [hops[0].tokenIn, ...hops.map(h => h.tokenOut)];
  const tokenArgs = tokenPrincipals.map(makeToken);
  const perHopArgs = hops.flatMap(hopArgs);

  const functionArgs = [
    ...tokenArgs,
    ...perHopArgs,
    makeUint(BigInt(amountIn)),
    makeUint(BigInt(minAmountOut)),
  ];

  onProgress?.('Waiting for wallet signature...');

  return new Promise((resolve, reject) => {
    request('stx_callContract', {
      contract: BATCH_SWAP_CONTRACT,
      functionName: `batch-swap-${n}`,
      functionArgs,
      network: 'mainnet',
      postConditionMode: 'allow',
      onFinish: (data: any) => { onProgress?.('Submitted!'); resolve(data.txid); },
      onCancel: () => reject(new Error('Cancelled by user')),
    } as any).catch(reject);
  });
}

export async function getVelarTokens(): Promise<string[]> {
  try {
    const t = await getTokens() as any;
    return Object.keys(t);
  } catch {
    return ['STX', 'VELAR', 'aeUSDC', 'WELSH', 'LEO', 'ODIN', 'stSTX', 'PEPE', 'NOT', 'SOME', 'ROCK'];
  }
}
