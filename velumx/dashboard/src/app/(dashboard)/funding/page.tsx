'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@/components/providers/SessionProvider';
import { Wallet, RefreshCcw, History, Activity } from 'lucide-react';
import { useWallet } from '@/components/providers/WalletContext';
import { RELAYER_URL } from '@/lib/config';

export default function FundingPage() {
    const [isClient, setIsClient] = useState(false);
    const { user, loading: userLoading } = useUser();
    const { network } = useWallet();
    const [stats, setStats] = useState({
        relayerAddress: 'Loading...',
        relayerStxBalance: '0',
        relayerFeeBalance: '0',
    });
    const [logs, setLogs] = useState<any[]>([]);
    const [isFetching, setIsFetching] = useState(true);

    const fetchRelayerStatus = async () => {
        if (!user) return;
        setIsFetching(true);
        try {
            const supabase = (await import('@/lib/supabase/client')).createClient();
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            if (!token) return;

            const [statsRes, logsRes] = await Promise.all([
                fetch(`${RELAYER_URL}/api/dashboard/stats`, { cache: 'no-store', headers: { 'Authorization': `Bearer ${token}` } }),
                fetch(`${RELAYER_URL}/api/dashboard/logs?network=${network}`, { cache: 'no-store', headers: { 'Authorization': `Bearer ${token}` } }),
            ]);

            if (statsRes.ok) {
                const data = await statsRes.json();
                const s = data.networks?.[network] || {};
                setStats({
                    relayerAddress: s.relayerAddress || 'Not Configured',
                    relayerStxBalance: (parseInt(s.relayerStxBalance || '0') / 1_000_000).toFixed(2),
                    relayerFeeBalance: parseFloat(s.relayerFeeBalance || '0').toFixed(2),
                });
            }

            if (logsRes.ok) {
                const logsData = await logsRes.json();
                setLogs(Array.isArray(logsData) ? logsData.slice(0, 5) : []);
            }
        } catch (error) {
            console.error('Error fetching relayer status:', error);
        } finally {
            setIsFetching(false);
        }
    };

    useEffect(() => {
        setIsClient(true);
        if (!userLoading) fetchRelayerStatus();
    }, [network, user, userLoading]);

    if (!isClient) return null;

    return (
        <div className="space-y-8 pb-12">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Relayer Status</h1>
                <p className="text-white/40 text-sm font-medium">Monitor your Universal gas abstraction health and manage sponsorship capital.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* STX Balance (Gas Tank) */}
                <div className="glass-card p-8 flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-amber-400/10 flex items-center justify-center border border-amber-400/20">
                                    <Wallet className="w-5 h-5 text-amber-400" />
                                </div>
                                <div>
                                    <h2 className="text-sm font-bold text-white uppercase tracking-wider">Gas Tank (STX)</h2>
                                    <p className="text-[10px] text-white/40 uppercase font-bold tracking-tight">Used to pay network fees</p>
                                </div>
                            </div>
                            {parseFloat(stats.relayerStxBalance) < 10 && (
                                <span className="px-2 py-1 rounded bg-rose-500/20 text-rose-400 text-[10px] font-bold border border-rose-500/20 uppercase animate-pulse">Low Funds</span>
                            )}
                        </div>
                        <div className="mb-8">
                            <div className="flex items-baseline gap-2">
                                <span className="text-5xl font-black text-white font-mono">{isFetching ? '...' : stats.relayerStxBalance}</span>
                                <span className="text-lg text-white/40 font-bold">STX</span>
                            </div>
                        </div>
                    </div>
                    <div className="space-y-4">
                        <div className="p-4 bg-black rounded-xl border border-white/5">
                            <p className="text-[10px] text-white/20 uppercase font-bold mb-2">Relayer Hot Wallet Address</p>
                            <div className="flex items-center justify-between gap-2">
                                <code className="text-xs text-white/60 truncate font-mono">{stats.relayerAddress}</code>
                                <button
                                    onClick={() => navigator.clipboard.writeText(stats.relayerAddress)}
                                    className="text-[10px] font-bold text-white/40 hover:text-white uppercase transition-colors"
                                >
                                    Copy
                                </button>
                            </div>
                        </div>
                        <p className="text-[10px] text-white/20 leading-relaxed">
                            Fund this address with STX to keep your Relayer operational. Every sponsored transaction consumes STX from this balance.
                        </p>
                    </div>
                </div>

                {/* Collected Fees */}
                <div className="glass-card p-8 flex flex-col justify-between">
                    <div>
                        <div className="flex items-center gap-3 mb-8">
                            <div className="w-10 h-10 rounded-xl bg-emerald-400/10 flex items-center justify-center border border-emerald-400/20">
                                <RefreshCcw className="w-5 h-5 text-emerald-400" />
                            </div>
                            <div>
                                <h2 className="text-sm font-bold text-white uppercase tracking-wider">Collected Fees</h2>
                                <p className="text-[10px] text-white/40 uppercase font-bold tracking-tight">USD equivalent in relayer wallet</p>
                            </div>
                        </div>
                        <div className="mb-8">
                            <div className="flex items-baseline gap-2">
                                <span className="text-5xl font-black text-white font-mono">{isFetching ? '...' : stats.relayerFeeBalance}</span>
                                <span className="text-lg text-white/40 font-bold">USD</span>
                            </div>
                        </div>
                    </div>
                    <div className="p-6 bg-white/[0.02] border border-white/10 rounded-xl">
                        <h4 className="text-xs font-bold text-white mb-2 uppercase tracking-tight">How it works</h4>
                        <p className="text-[10px] text-white/40 leading-relaxed">
                            Fees collected in any token (ALEX, sBTC, etc.) are converted to their USD equivalent using live oracle prices for a unified view.
                        </p>
                    </div>
                </div>
            </div>

            {/* History Section */}
            <div className="glass-card p-8">
                <div className="flex items-center gap-2 mb-10 text-white font-bold text-sm uppercase tracking-wider">
                    <History className="w-4 h-4 text-white/40" />
                    Operational History
                </div>
                <div className="space-y-3">
                    {isFetching ? (
                        <div className="w-full text-center py-12 text-white/10 text-[10px] font-bold uppercase tracking-widest animate-pulse">
                            Loading Operational History...
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="w-full text-center py-12 text-white/10 text-[10px] font-bold uppercase tracking-widest">
                            No recent activity on {network === 'testnet' ? 'Stacks Testnet' : 'Stacks Mainnet'}.
                        </div>
                    ) : logs.map((log) => (
                        <div key={log.id} className="flex justify-between items-center p-4 bg-white/[0.01] border border-white/5 rounded-xl hover:bg-white/[0.02] transition-colors">
                            <div className="flex items-center gap-4">
                                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center border border-white/10">
                                    <Activity className="w-3.5 h-3.5 text-white/40" />
                                </div>
                                <div>
                                    <p className="text-white text-[11px] font-bold uppercase tracking-tight">{log.type}</p>
                                    <p className="text-[10px] text-white/20 font-mono mt-0.5">{log.txid.substring(0, 16)}...</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-white text-[11px] font-bold font-mono">{log.txid.substring(0, 8)}...</p>
                                <span className={`text-[9px] font-black uppercase tracking-widest ${log.status === 'Confirmed' ? 'text-emerald-400' : 'text-amber-400'}`}>
                                    {log.status}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
