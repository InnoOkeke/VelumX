/**
 * LiquidityInterface Component
 * Add/remove liquidity on ALEX AMM pools.
 * User pays STX gas via their wallet (standard Stacks tx).
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useWallet } from '@/lib/hooks/useWallet';
import { AlexSDK } from 'alex-sdk';
import { Loader2, Plus, Minus, ChevronDown, ExternalLink, Info } from 'lucide-react';
import { TransactionStatus } from './ui/TransactionStatus';

const AMM_POOL = 'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.amm-swap-pool-v1-1';

const KNOWN_POOLS = [
  {
    label: 'STX / ALEX',
    tokenX: 'token-wstx',
    tokenY: 'age000-governance-token',
    factor: '100000000',
    poolToken: 'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.fwp-wstx-alex-50-50-v1-01',
  },
  {
    label: 'STX / aeUSDC',
    tokenX: 'token-wstx',
    tokenY: 'token-aeusdc',
    factor: '100000000',
    poolToken: 'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.fwp-wstx-aeusdc-50-50-v1-01',
  },
  {
    label: 'STX / xBTC',
    tokenX: 'token-wstx',
    tokenY: 'token-wbtc',
    factor: '100000000',
    poolToken: 'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.fwp-wstx-wbtc-50-50-v1-01',
  },
];

type Mode = 'add' | 'remove';

export function LiquidityInterface() {
  const { stacksAddress, stacksConnected, balances, fetchBalances } = useWallet();

  const [mode, setMode] = useState<Mode>('add');
  const [selectedPool, setSelectedPool] = useState(KNOWN_POOLS[0]);
  const [poolOpen, setPoolOpen] = useState(false);
  const [amountX, setAmountX] = useState('');
  const [amountY, setAmountY] = useState('');
  const [removePercent, setRemovePercent] = useState('100');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tokenInfos, setTokenInfos] = useState<any[]>([]);
  const [poolData, setPoolData] = useState<{ tvl?: string; apy?: string } | null>(null);

  useEffect(() => {
    new AlexSDK().fetchSwappableCurrency().then(setTokenInfos).catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`https://api.alexgo.io/v1/pool_stats/${encodeURIComponent(selectedPool.tokenX)}/${encodeURIComponent(selectedPool.tokenY)}`)
      .then(r => r.json())
      .then(d => setPoolData({
        tvl: d?.tvl_usd ? `$${Number(d.tvl_usd).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : undefined,
        apy: d?.apy ? `${(d.apy * 100).toFixed(1)}%` : undefined,
      }))
      .catch(() => setPoolData(null));
  }, [selectedPool]);

  const resolveTokenName = (id: string) => {
    const t = tokenInfos.find((t: any) => t.id === id);
    return t?.name || id.replace('token-w', '').replace('age000-governance-token', 'ALEX').toUpperCase();
  };

  const getTokenBalance = (tokenId: string): number => {
    if (tokenId === 'token-wstx') return parseFloat((balances as any).stx || '0');
    const t = tokenInfos.find((t: any) => t.id === tokenId) as any;
    if (!t) return 0;
    const principal = (t.wrapToken || t.underlyingToken || '').split('::')[0];
    const raw = (balances as any)[principal] || '0';
    const dec = parseInt((balances as any)[`decimals:${principal}`] || '8');
    return Number(raw) / Math.pow(10, dec);
  };

  const resolveContractPrincipal = async (tokenId: string): Promise<string> => {
    if (tokenId === 'token-wstx') return 'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.token-wstx';
    const t = tokenInfos.find((t: any) => t.id === tokenId) as any;
    if (t) return (t.wrapToken || t.underlyingToken || '').split('::')[0];
    // fallback: fetch fresh
    const tokens = await new AlexSDK().fetchSwappableCurrency() as any[];
    const match = tokens.find((t: any) => t.id === tokenId);
    if (!match) throw new Error(`Token not found: ${tokenId}`);
    return (match.wrapToken || match.underlyingToken || '').split('::')[0];
  };

  const mkCV = async (principal: string) => {
    const { Cl } = await import('@stacks/transactions');
    const [a, n] = principal.split('.');
    return Cl.contractPrincipal(a, n);
  };

  const handleAddLiquidity = async () => {
    if (!stacksAddress) { setError('Connect your Stacks wallet first'); return; }
    const dx = parseFloat(amountX);
    const dy = parseFloat(amountY);
    if (!dx || dx <= 0) { setError('Enter token X amount'); return; }
    if (!dy || dy <= 0) { setError('Enter token Y amount'); return; }

    setIsProcessing(true); setError(null); setSuccess(null);
    try {
      const { uintCV, someCV } = await import('@stacks/transactions');
      const { openContractCall } = await import('@stacks/connect');

      const tokenXPrincipal = await resolveContractPrincipal(selectedPool.tokenX);
      const tokenYPrincipal = await resolveContractPrincipal(selectedPool.tokenY);

      await openContractCall({
        contractAddress: AMM_POOL.split('.')[0],
        contractName: AMM_POOL.split('.')[1],
        functionName: 'add-to-position',
        functionArgs: [
          await mkCV(tokenXPrincipal),
          await mkCV(tokenYPrincipal),
          uintCV(BigInt(selectedPool.factor)),
          await mkCV(selectedPool.poolToken),
          uintCV(BigInt(Math.floor(dx * 1e8))),
          someCV(uintCV(BigInt(Math.floor(dy * 1e8 * 1.01)))), // 1% slippage buffer
        ],
        network: 'mainnet' as any,
        postConditionMode: 'allow' as any,
        onFinish: () => {
          setSuccess('Liquidity added! LP tokens will arrive after confirmation.');
          setAmountX(''); setAmountY('');
          setTimeout(() => fetchBalances?.(), 12000);
        },
        onCancel: () => setIsProcessing(false),
      });
    } catch (e: any) {
      if (!e?.message?.toLowerCase().includes('cancel')) setError(e.message || 'Transaction failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemoveLiquidity = async () => {
    if (!stacksAddress) { setError('Connect your Stacks wallet first'); return; }
    const pct = parseFloat(removePercent);
    if (!pct || pct <= 0 || pct > 100) { setError('Enter a valid percentage (1-100)'); return; }

    setIsProcessing(true); setError(null); setSuccess(null);
    try {
      const { uintCV } = await import('@stacks/transactions');
      const { openContractCall } = await import('@stacks/connect');

      const tokenXPrincipal = await resolveContractPrincipal(selectedPool.tokenX);
      const tokenYPrincipal = await resolveContractPrincipal(selectedPool.tokenY);

      // percent in 1e8 units: 100% = 1e8
      const percentCV = BigInt(Math.floor(pct * 1e6)); // pct/100 * 1e8 = pct * 1e6

      await openContractCall({
        contractAddress: AMM_POOL.split('.')[0],
        contractName: AMM_POOL.split('.')[1],
        functionName: 'reduce-position',
        functionArgs: [
          await mkCV(tokenXPrincipal),
          await mkCV(tokenYPrincipal),
          uintCV(BigInt(selectedPool.factor)),
          await mkCV(selectedPool.poolToken),
          uintCV(percentCV),
        ],
        network: 'mainnet' as any,
        postConditionMode: 'allow' as any,
        onFinish: () => {
          setSuccess('Liquidity removed! Tokens will arrive after confirmation.');
          setTimeout(() => fetchBalances?.(), 12000);
        },
        onCancel: () => setIsProcessing(false),
      });
    } catch (e: any) {
      if (!e?.message?.toLowerCase().includes('cancel')) setError(e.message || 'Transaction failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const balX = getTokenBalance(selectedPool.tokenX);
  const balY = getTokenBalance(selectedPool.tokenY);

  return (
    <div className="max-w-lg mx-auto">
      <div className="rounded-3xl vellum-shadow" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', padding: '2rem' }}>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Liquidity Pools</h2>
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Powered by ALEX DEX</p>
          </div>
          <a href="https://app.alexlab.co/pool" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-purple-500 hover:text-purple-400">
            ALEX App <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {/* Pool selector */}
        <div className="relative mb-6">
          <button onClick={() => setPoolOpen(!poolOpen)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl font-bold text-sm"
            style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>
            <span>{selectedPool.label}</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${poolOpen ? 'rotate-180' : ''}`} style={{ color: 'var(--text-secondary)' }} />
          </button>
          {poolOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 rounded-xl shadow-xl z-50 overflow-hidden"
              style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)' }}>
              {KNOWN_POOLS.map(p => (
                <button key={p.label} onClick={() => { setSelectedPool(p); setPoolOpen(false); setAmountX(''); setAmountY(''); }}
                  className="w-full px-4 py-3 text-left text-sm font-medium hover:bg-purple-500/10 transition-colors"
                  style={{ color: 'var(--text-primary)', backgroundColor: p.label === selectedPool.label ? 'var(--bg-primary)' : 'transparent' }}>
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Pool stats */}
        {poolData && (poolData.tvl || poolData.apy) && (
          <div className="grid grid-cols-2 gap-3 mb-6">
            {poolData.tvl && (
              <div className="rounded-xl p-3 text-center" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}>
                <div className="text-sm font-bold font-mono text-blue-500">{poolData.tvl}</div>
                <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>TVL</div>
              </div>
            )}
            {poolData.apy && (
              <div className="rounded-xl p-3 text-center" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}>
                <div className="text-sm font-bold font-mono text-green-500">{poolData.apy}</div>
                <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>APY</div>
              </div>
            )}
          </div>
        )}

        {/* Mode toggle */}
        <div className="flex rounded-xl overflow-hidden mb-6" style={{ border: '1px solid var(--border-color)' }}>
          {(['add', 'remove'] as Mode[]).map(m => (
            <button key={m} onClick={() => { setMode(m); setError(null); setSuccess(null); }}
              className={`flex-1 py-2.5 text-sm font-bold transition-all flex items-center justify-center gap-2 ${mode === m ? 'bg-purple-600 text-white' : ''}`}
              style={mode !== m ? { color: 'var(--text-secondary)' } : {}}>
              {m === 'add' ? <><Plus className="w-4 h-4" /> Add</> : <><Minus className="w-4 h-4" /> Remove</>}
            </button>
          ))}
        </div>

        {mode === 'add' ? (
          <>
            <div className="rounded-2xl p-5 mb-3" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}>
              <div className="flex justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>{resolveTokenName(selectedPool.tokenX)}</span>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Bal: <span className="font-mono font-bold" style={{ color: 'var(--text-primary)' }}>{balX.toFixed(4)}</span>
                  <button onClick={() => setAmountX(balX.toFixed(6))} className="ml-2 text-purple-500 text-[10px] font-bold uppercase hover:text-purple-400">MAX</button>
                </span>
              </div>
              <input type="number" value={amountX} onChange={e => { setAmountX(e.target.value); setError(null); }}
                placeholder="0.00" className="w-full bg-transparent text-3xl font-mono outline-none placeholder:opacity-30"
                style={{ color: 'var(--text-primary)' }} disabled={isProcessing} />
            </div>

            <div className="rounded-2xl p-5 mb-6" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}>
              <div className="flex justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>{resolveTokenName(selectedPool.tokenY)}</span>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Bal: <span className="font-mono font-bold" style={{ color: 'var(--text-primary)' }}>{balY.toFixed(4)}</span>
                  <button onClick={() => setAmountY(balY.toFixed(6))} className="ml-2 text-purple-500 text-[10px] font-bold uppercase hover:text-purple-400">MAX</button>
                </span>
              </div>
              <input type="number" value={amountY} onChange={e => { setAmountY(e.target.value); setError(null); }}
                placeholder="0.00" className="w-full bg-transparent text-3xl font-mono outline-none placeholder:opacity-30"
                style={{ color: 'var(--text-primary)' }} disabled={isProcessing} />
            </div>
          </>
        ) : (
          <div className="rounded-2xl p-5 mb-6" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}>
            <div className="flex justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Remove %</span>
              <div className="flex gap-2">
                {['25', '50', '75', '100'].map(p => (
                  <button key={p} onClick={() => setRemovePercent(p)}
                    className={`text-[10px] font-bold px-2 py-1 rounded-lg transition-all ${removePercent === p ? 'bg-purple-600 text-white' : 'text-purple-500 hover:bg-purple-500/10'}`}>
                    {p}%
                  </button>
                ))}
              </div>
            </div>
            <input type="number" value={removePercent} onChange={e => { setRemovePercent(e.target.value); setError(null); }}
              placeholder="100" min="1" max="100"
              className="w-full bg-transparent text-3xl font-mono outline-none placeholder:opacity-30"
              style={{ color: 'var(--text-primary)' }} disabled={isProcessing} />
            <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>% of your LP position to remove</div>
          </div>
        )}

        <div className="flex items-center gap-2 p-3 rounded-xl mb-4 text-xs" style={{ backgroundColor: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)', color: 'var(--text-secondary)' }}>
          <Info className="w-4 h-4 text-purple-500 flex-shrink-0" />
          <span>LP fees (0.3%) are earned automatically and compounded into your position.</span>
        </div>

        <TransactionStatus error={error} success={success} />

        <button onClick={mode === 'add' ? handleAddLiquidity : handleRemoveLiquidity}
          disabled={!stacksConnected || isProcessing}
          className="w-full mt-4 bg-purple-600 hover:bg-purple-700 text-white font-bold py-4 rounded-2xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-xl shadow-purple-500/20">
          {isProcessing
            ? <><Loader2 className="w-5 h-5 animate-spin" /> Processing...</>
            : !stacksConnected ? 'Connect Wallet'
            : mode === 'add' ? <><Plus className="w-5 h-5" /> Add Liquidity</>
            : <><Minus className="w-5 h-5" /> Remove Liquidity</>}
        </button>
      </div>
    </div>
  );
}
