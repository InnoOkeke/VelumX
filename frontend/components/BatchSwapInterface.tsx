/**
 * BatchSwapInterface
 * Multi-hop atomic swap via VelumX batch-swap contract.
 * Supports ALEX and Velar DEXes per hop. 2/3/4/5/10 hops.
 * Users pay STX fees + 0.1% protocol fee. No gasless/relayer.
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AlexSDK } from 'alex-sdk';
import { useWallet } from '@/lib/hooks/useWallet';
import {
  ArrowRight, Loader2, AlertTriangle,
  Layers, Info, ChevronDown, CheckCircle2
} from 'lucide-react';
import {
  getBatchQuote, getBestRouteQuote, executeBatchSwap,
  DEFAULT_ALEX_FACTOR,
  type BatchHop, type BatchQuote, type DexType
} from '@/lib/helpers/batch-swap';

// ---- Types ----
interface Token {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  source: 'alex' | 'velar' | 'both';
}

interface HopRow {
  id: string;
  tokenIn: Token | null;
  tokenOut: Token | null;
  dex: DexType;
}

const VALID_HOP_COUNTS = [2, 3, 4, 5, 10];

// ---- Seed tokens (both DEXes) ----
const SEED_TOKENS: Token[] = [
  { symbol: 'STX',    name: 'Stacks',     address: 'token-wstx',                                              decimals: 6, source: 'both'  },
  { symbol: 'ALEX',   name: 'ALEX Token', address: 'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.token-alex',   decimals: 8, source: 'both'  },
  { symbol: 'aeUSDC', name: 'aeUSDC',     address: 'SP3Y2ZSH8P7D50B0JLZVGKMBC7PX3RVRGWJKWKY38.token-aeusdc', decimals: 6, source: 'both'  },
  { symbol: 'sBTC',   name: 'sBTC',       address: 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token',  decimals: 8, source: 'alex'  },
  { symbol: 'sUSDT',  name: 'sUSDT',      address: 'SP2TZK01NKDC89J6TA56SA47SDF7RTHYEQ79AAB9X.token-susdt', decimals: 8, source: 'alex'  },
  { symbol: 'VELAR',  name: 'Velar',      address: 'SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.velar',       decimals: 8, source: 'velar' },
  { symbol: 'WELSH',  name: 'Welsh',      address: 'SP3NE50GEXFG9SZGTT51P40X2CKYSZ5CC4ZTZ7A2G.welshcorgicoin-token', decimals: 6, source: 'velar' },
  { symbol: 'stSTX',  name: 'Stacked STX',address: 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststx-token',  decimals: 6, source: 'velar' },
  { symbol: 'ODIN',   name: 'Odin',       address: 'SP2X0TZ59D5SZ8ACQ6YMCHHNR2ZN51Z32E2CJ173.the-explorer-guild', decimals: 8, source: 'velar' },
];

// DEX badge colors
const DEX_STYLE: Record<DexType, { bg: string; text: string; label: string }> = {
  alex:  { bg: 'rgba(59,130,246,0.12)', text: '#3b82f6', label: 'ALEX'  },
  velar: { bg: 'rgba(234,88,12,0.12)',  text: '#ea580c', label: 'Velar' },
};

// ---- TokenSelector ----
function TokenSelector({ tokens, value, onChange, label, filterSource }: {
  tokens: Token[];
  value: Token | null;
  onChange: (t: Token) => void;
  label: string;
  filterSource?: DexType;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const filtered = tokens
    .filter(t => !filterSource || t.source === filterSource || t.source === 'both')
    .filter(t =>
      t.symbol.toLowerCase().includes(search.toLowerCase()) ||
      t.name.toLowerCase().includes(search.toLowerCase())
    );

  return (
    <div className="relative flex-1" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-sm font-semibold transition-all"
        style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
      >
        {value ? (
          <>
            <span className="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center text-[9px] font-bold text-purple-600 flex-shrink-0">
              {value.symbol[0]}
            </span>
            <span className="truncate">{value.symbol}</span>
          </>
        ) : (
          <span className="truncate" style={{ color: 'var(--text-secondary)' }}>{label}</span>
        )}
        <ChevronDown className="h-3 w-3 ml-auto flex-shrink-0" style={{ color: 'var(--text-secondary)' }} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-52 rounded-xl shadow-2xl overflow-hidden"
          style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)' }}>
          <div className="p-2">
            <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search..." className="w-full px-2.5 py-1.5 rounded-lg text-xs outline-none"
              style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.map(t => (
              <button key={t.address} onClick={() => { onChange(t); setOpen(false); setSearch(''); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-purple-500/10 transition-colors text-left"
                style={{ color: 'var(--text-primary)' }}>
                <span className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center text-[9px] font-bold text-purple-600 flex-shrink-0">
                  {t.symbol[0]}
                </span>
                <div className="min-w-0">
                  <div className="font-semibold text-xs">{t.symbol}</div>
                  <div className="text-[10px] truncate" style={{ color: 'var(--text-secondary)' }}>{t.name}</div>
                </div>
                <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: t.source === 'velar' ? 'rgba(234,88,12,0.1)' : t.source === 'alex' ? 'rgba(59,130,246,0.1)' : 'rgba(124,58,237,0.1)',
                           color: t.source === 'velar' ? '#ea580c' : t.source === 'alex' ? '#3b82f6' : '#7c3aed' }}>
                  {t.source === 'both' ? 'A+V' : t.source === 'alex' ? 'ALEX' : 'Velar'}
                </span>
              </button>
            ))}
            {filtered.length === 0 && <p className="px-3 py-4 text-xs text-center" style={{ color: 'var(--text-secondary)' }}>No tokens found</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- DexToggle ----
function DexToggle({ value, onChange }: { value: DexType; onChange: (d: DexType) => void }) {
  return (
    <div className="flex rounded-lg overflow-hidden flex-shrink-0" style={{ border: '1px solid var(--border-color)' }}>
      {(['alex', 'velar'] as DexType[]).map(d => (
        <button key={d} onClick={() => onChange(d)}
          className="px-2 py-1 text-[10px] font-bold transition-all"
          style={{
            backgroundColor: value === d ? DEX_STYLE[d].bg : 'transparent',
            color: value === d ? DEX_STYLE[d].text : 'var(--text-secondary)',
          }}>
          {DEX_STYLE[d].label}
        </button>
      ))}
    </div>
  );
}

// ---- Main Component ----
export function BatchSwapInterface() {
  const { stacksAddress, stacksConnected } = useWallet();
  const [tokens, setTokens] = useState<Token[]>(SEED_TOKENS);
  const [hopCount, setHopCount] = useState(2);
  const [hops, setHops] = useState<HopRow[]>([
    { id: '1', tokenIn: SEED_TOKENS[0], tokenOut: SEED_TOKENS[1], dex: 'alex'  },
    { id: '2', tokenIn: SEED_TOKENS[1], tokenOut: SEED_TOKENS[2], dex: 'velar' },
  ]);
  const [amountIn, setAmountIn] = useState('');
  const [slippage, setSlippage] = useState(0.5);
  const [autoRoute, setAutoRoute] = useState(true);
  const [quote, setQuote] = useState<BatchQuote | null>(null);
  const [isFetchingQuote, setIsFetchingQuote] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [progress, setProgress] = useState('');

  // Load tokens from both ALEX SDK and Velar known list
  useEffect(() => {
    const sdk = new AlexSDK();
    sdk.fetchSwappableCurrency().then((data: any[]) => {
      const mapped: Token[] = data
        .map(t => {
          const addr = t.wrapToken ? t.wrapToken.split('::')[0] : t.id || '';
          if (!addr.includes('.')) return null;
          return { symbol: t.name || t.id, name: t.name || t.id, address: addr, decimals: t.wrapTokenDecimals ?? 8, source: 'alex' as const };
        })
        .filter(Boolean) as Token[];

      setTokens(prev => {
        const merged = [...prev];
        mapped.forEach(mt => {
          const idx = merged.findIndex(e => e.address.toLowerCase() === mt.address.toLowerCase());
          if (idx === -1) merged.push(mt);
          else if (merged[idx].source === 'velar') merged[idx] = { ...merged[idx], source: 'both' };
        });
        return merged;
      });
    }).catch(() => {});
  }, []);

  // Sync hop count → hops array
  const changeHopCount = (n: number) => {
    setHopCount(n);
    setHops(prev => {
      const updated = [...prev];
      while (updated.length < n) {
        const last = updated[updated.length - 1];
        updated.push({ id: Date.now().toString() + updated.length, tokenIn: last?.tokenOut ?? null, tokenOut: null, dex: 'alex' });
      }
      return updated.slice(0, n);
    });
    setQuote(null);
  };

  const updateHop = (id: string, patch: Partial<HopRow>) => {
    setHops(prev => {
      const next = prev.map(h => h.id === id ? { ...h, ...patch } : h);
      // Auto-chain tokenIn of next hop
      if (patch.tokenOut) {
        const idx = next.findIndex(h => h.id === id);
        if (idx < next.length - 1) {
          next[idx + 1] = { ...next[idx + 1], tokenIn: patch.tokenOut as Token };
        }
      }
      return next;
    });
    setQuote(null);
  };

  // Quote
  const fetchQuote = useCallback(async () => {
    if (!amountIn || parseFloat(amountIn) <= 0) { setQuote(null); return; }
    if (!hops.every(h => h.tokenIn && h.tokenOut)) return;

    setIsFetchingQuote(true);
    setError(null);
    try {
      const firstToken = hops[0].tokenIn!;
      const amountMicro = BigInt(Math.floor(parseFloat(amountIn) * Math.pow(10, firstToken.decimals))).toString();

      if (autoRoute) {
        // Auto best-route: quotes both DEXes per hop, picks the better one
        const hopPairs = hops.map(h => ({ tokenIn: h.tokenIn!.address, tokenOut: h.tokenOut!.address }));
        const q = await getBestRouteQuote(hopPairs, amountMicro, firstToken.decimals) as any;
        // Sync the chosen DEX back into hop rows for display
        if (q._resolvedHops) {
          setHops(prev => prev.map((h, i) => ({ ...h, dex: q._resolvedHops[i]?.dex ?? h.dex })));
        }
        setQuote(q);
      } else {
        const batchHops: BatchHop[] = hops.map(h => ({
          tokenIn: h.tokenIn!.address,
          tokenOut: h.tokenOut!.address,
          dex: h.dex,
          factor: DEFAULT_ALEX_FACTOR,
        }));
        const q = await getBatchQuote(batchHops, amountMicro, firstToken.decimals);
        setQuote(q);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to get quote');
      setQuote(null);
    } finally {
      setIsFetchingQuote(false);
    }
  }, [amountIn, hops, autoRoute]);

  useEffect(() => {
    const t = setTimeout(fetchQuote, 500);
    return () => clearTimeout(t);
  }, [fetchQuote]);

  const handleSwap = async () => {
    if (!stacksAddress) { setError('Connect your wallet first'); return; }
    if (!quote || !amountIn) { setError('Get a quote first'); return; }

    setIsProcessing(true);
    setError(null);
    setSuccess(null);
    try {
      const firstToken = hops[0].tokenIn!;
      const amountMicro = BigInt(Math.floor(parseFloat(amountIn) * Math.pow(10, firstToken.decimals))).toString();
      const minOut = BigInt(Math.floor(Number(quote.amountOutRaw) * (1 - slippage / 100))).toString();
      const batchHops: BatchHop[] = hops.map(h => ({
        tokenIn: h.tokenIn!.address,
        tokenOut: h.tokenOut!.address,
        dex: h.dex,
        factor: DEFAULT_ALEX_FACTOR,
      }));
      const txid = await executeBatchSwap({ hops: batchHops, amountIn: amountMicro, minAmountOut: minOut, onProgress: setProgress });
      setSuccess(`Submitted! TX: ${txid}`);
      setAmountIn('');
      setQuote(null);
    } catch (e: any) {
      setError(e.message || 'Swap failed');
    } finally {
      setIsProcessing(false);
      setProgress('');
    }
  };

  const inputToken  = hops[0]?.tokenIn;
  const outputToken = hops[hops.length - 1]?.tokenOut;

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="rounded-3xl" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', padding: '2rem' }}>

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-500/10"><Layers className="h-5 w-5 text-purple-600" /></div>
            <div>
              <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Batch Swap</h2>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Multi-hop via ALEX + Velar — one tx, one signature</p>
            </div>
          </div>
          {/* DEX legend */}
          <div className="flex gap-2">
            {(['alex', 'velar'] as DexType[]).map(d => (
              <span key={d} className="text-[10px] font-bold px-2 py-1 rounded-full"
                style={{ backgroundColor: DEX_STYLE[d].bg, color: DEX_STYLE[d].text }}>
                {DEX_STYLE[d].label}
              </span>
            ))}
          </div>
        </div>

        {/* Hop count selector */}
        <div className="flex items-center gap-2 mb-5">
          <span className="text-xs font-semibold flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>Hops:</span>
          <div className="flex gap-1">
            {VALID_HOP_COUNTS.map(n => (
              <button key={n} onClick={() => changeHopCount(n)}
                className="w-8 h-8 rounded-lg text-xs font-bold transition-all"
                style={{
                  backgroundColor: hopCount === n ? '#7c3aed' : 'var(--bg-primary)',
                  color: hopCount === n ? '#fff' : 'var(--text-secondary)',
                  border: '1px solid var(--border-color)',
                }}>
                {n}
              </button>
            ))}
          </div>
          <span className="text-xs ml-auto" style={{ color: 'var(--text-secondary)' }}>
            {hopCount} hop{hopCount > 1 ? 's' : ''} = {hopCount + 1} tokens
          </span>
        </div>

        {/* Auto-route toggle */}
        <div className="flex items-center justify-between mb-4 p-3 rounded-xl"
          style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}>
          <div>
            <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Auto Best Route</p>
            <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
              {autoRoute ? 'Quotes ALEX + Velar per hop, picks the better price' : 'Manual DEX selection per hop'}
            </p>
          </div>
          <button onClick={() => { setAutoRoute(a => !a); setQuote(null); }}
            className="relative w-10 h-5 rounded-full transition-all flex-shrink-0"
            style={{ backgroundColor: autoRoute ? '#7c3aed' : 'var(--border-color)' }}>
            <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all"
              style={{ left: autoRoute ? '1.25rem' : '0.125rem' }} />
          </button>
        </div>

        {/* Amount input */}
        <div className="mb-4">
          <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--text-secondary)' }}>
            Input Amount {inputToken ? `(${inputToken.symbol})` : ''}
          </label>
          <input type="number" value={amountIn} onChange={e => { setAmountIn(e.target.value); setQuote(null); }}
            placeholder="0.00" className="w-full px-4 py-3 rounded-xl text-lg font-semibold outline-none"
            style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} />
        </div>

        {/* Hop rows */}
        <div className="space-y-2 mb-4">
          {hops.map((hop, idx) => (
            <div key={hop.id} className="rounded-xl p-3 space-y-2"
              style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}>
              {/* Row header */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: 'rgba(124,58,237,0.1)', color: '#7c3aed' }}>
                  HOP {idx + 1}
                </span>
                <DexToggle value={hop.dex} onChange={d => updateHop(hop.id, { dex: d })} />
                <span className="text-[10px] ml-auto" style={{ color: 'var(--text-secondary)' }}>
                  via {DEX_STYLE[hop.dex].label}
                </span>
              </div>
              {/* Token selectors */}
              <div className="flex items-center gap-2">
                <TokenSelector tokens={tokens} value={hop.tokenIn} onChange={t => updateHop(hop.id, { tokenIn: t })} label="Token In" />
                <ArrowRight className="h-4 w-4 flex-shrink-0" style={{ color: DEX_STYLE[hop.dex].text }} />
                <TokenSelector tokens={tokens} value={hop.tokenOut} onChange={t => updateHop(hop.id, { tokenOut: t })} label="Token Out" />
              </div>
              {/* Quote detail for this hop */}
              {quote?.hopsDetail?.[idx] && (
                <div className="text-[10px] flex items-center gap-1 flex-wrap" style={{ color: 'var(--text-secondary)' }}>
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                  Out: <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{quote.hopsDetail[idx].amountOut}</span>
                  <span className="ml-1 px-1.5 py-0.5 rounded-full font-bold"
                    style={{ backgroundColor: DEX_STYLE[hop.dex].bg, color: DEX_STYLE[hop.dex].text }}>
                    {DEX_STYLE[hop.dex].label}
                  </span>
                  {(quote.hopsDetail[idx] as any).savings && (
                    <span className="px-1.5 py-0.5 rounded-full font-bold text-green-600 bg-green-500/10">
                      {(quote.hopsDetail[idx] as any).savings}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Route visualization */}
        {quote && (
          <div className="flex items-center gap-1 flex-wrap mb-4 p-3 rounded-xl overflow-x-auto"
            style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}>
            {quote.route.map((sym, i) => (
              <React.Fragment key={i}>
                <span className="text-xs font-bold px-2 py-1 rounded-lg"
                  style={{ backgroundColor: 'rgba(124,58,237,0.1)', color: '#7c3aed', whiteSpace: 'nowrap' }}>
                  {sym}
                </span>
                {i < quote.route.length - 1 && (
                  <span className="text-[10px] font-bold px-1 flex-shrink-0"
                    style={{ color: DEX_STYLE[hops[i]?.dex ?? 'alex'].text }}>
                    →{DEX_STYLE[hops[i]?.dex ?? 'alex'].label}→
                  </span>
                )}
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Slippage */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Slippage</span>
          <div className="flex gap-1">
            {[0.5, 1, 2].map(s => (
              <button key={s} onClick={() => setSlippage(s)}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all"
                style={{
                  backgroundColor: slippage === s ? '#7c3aed' : 'var(--bg-primary)',
                  color: slippage === s ? '#fff' : 'var(--text-secondary)',
                  border: '1px solid var(--border-color)',
                }}>
                {s}%
              </button>
            ))}
          </div>
        </div>

        {/* Quote loading */}
        {isFetchingQuote && (
          <div className="flex items-center gap-2 py-2 mb-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <Loader2 className="h-4 w-4 animate-spin" /> Fetching quote across ALEX + Velar...
          </div>
        )}

        {/* Quote summary */}
        {quote && !isFetchingQuote && (
          <div className="rounded-xl p-4 mb-4 space-y-2 text-sm"
            style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}>
            <div className="flex justify-between">
              <span style={{ color: 'var(--text-secondary)' }}>You receive</span>
              <span className="font-bold" style={{ color: 'var(--text-primary)' }}>
                {quote.amountOut} {outputToken?.symbol ?? ''}
              </span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: 'var(--text-secondary)' }}>Protocol fee (0.1%)</span>
              <span style={{ color: 'var(--text-primary)' }}>{quote.protocolFee} {inputToken?.symbol ?? ''}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: 'var(--text-secondary)' }}>Min received</span>
              <span style={{ color: 'var(--text-primary)' }}>
                {(parseFloat(quote.amountOut) * (1 - slippage / 100)).toFixed(6)} {outputToken?.symbol ?? ''}
              </span>
            </div>
          </div>
        )}

        {/* Info */}
        <div className="flex items-start gap-2 p-3 rounded-xl mb-4 text-xs"
          style={{ backgroundColor: 'rgba(124,58,237,0.05)', border: '1px solid rgba(124,58,237,0.15)' }}>
          <Info className="h-3.5 w-3.5 text-purple-500 flex-shrink-0 mt-0.5" />
          <span style={{ color: 'var(--text-secondary)' }}>
            All hops execute atomically. STX fees + 0.1% protocol fee.
            Each hop independently routes via <span style={{ color: '#3b82f6', fontWeight: 600 }}>ALEX</span> or{' '}
            <span style={{ color: '#ea580c', fontWeight: 600 }}>Velar</span> for best execution.
          </span>
        </div>

        {/* Error / Success */}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-xl mb-4 text-sm text-red-500 bg-red-500/10">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />{error}
          </div>
        )}
        {success && (
          <div className="flex items-start gap-2 p-3 rounded-xl mb-4 text-sm text-green-600 bg-green-500/10 break-all">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" />{success}
          </div>
        )}

        {/* Execute button */}
        <button onClick={handleSwap}
          disabled={isProcessing || !stacksConnected || !quote || !amountIn}
          className="w-full py-4 rounded-2xl font-bold text-base transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)', color: '#fff' }}>
          {!stacksConnected ? 'Connect Wallet' :
           isProcessing ? (
             <span className="flex items-center justify-center gap-2">
               <Loader2 className="h-4 w-4 animate-spin" />{progress || 'Processing...'}
             </span>
           ) : `Execute ${hopCount}-Hop Batch Swap`}
        </button>
      </div>
    </div>
  );
}
