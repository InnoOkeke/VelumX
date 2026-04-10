'use client';

import { useUser } from '@/components/providers/SessionProvider';
import { Search, Filter, ExternalLink, Activity } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useWallet } from '@/components/providers/WalletContext';

const RELAYER_URL = process.env.NEXT_PUBLIC_VELUMX_RELAYER_URL || 'http://localhost:4000';

export default function TransactionLogsPage() {
    const [isClient, setIsClient] = useState(false);
    const { user, loading: userLoading } = useUser();
    const { network: currentNetwork } = useWallet();
    const [logs, setLogs] = useState<{ id: string; txid: string; type: string; userAddress: string; status: string; createdAt: string; network: string }[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        setIsClient(true);
        const fetchLogs = async () => {
            if (!user) return;
            setIsLoading(true);
            try {
                const supabase = (await import('@/lib/supabase/client')).createClient();
                const { data: { session } } = await supabase.auth.getSession();
                const token = session?.access_token;
                if (!token) return;

                const res = await fetch(`${RELAYER_URL}/api/dashboard/logs?network=${currentNetwork}`, {
                    cache: 'no-store',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();
                setLogs(Array.isArray(data) ? data : []);
            } catch (error) {
                console.error('Error fetching logs:', error);
            } finally {
                setIsLoading(false);
            }
        };

        if (!userLoading) fetchLogs();
    }, [user, userLoading, currentNetwork]);

    if (!isClient) return null;

    return (
        <div className="space-y-8 pb-12">
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Logs</h1>
                    <p className="text-white/40 text-sm font-medium">View all gasless sessions sponsored by your Relayer.</p>
                </div>
            </div>

            <div className="glass-card overflow-hidden !rounded-xl">
                <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
                    <div className="relative w-72">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40" />
                        <input
                            type="text"
                            placeholder="Search by TxID or User..."
                            className="w-full bg-black border border-white/10 rounded-lg pl-9 pr-4 py-2 text-xs text-white focus:outline-none focus:border-white/20 transition-colors placeholder:text-white/20 outline-none"
                        />
                    </div>
                    <button className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-xs font-bold text-white/60 hover:text-white hover:bg-white/10 transition-colors uppercase tracking-widest">
                        <Filter className="w-3.5 h-3.5" />
                        Sort & Filter
                    </button>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-white/10 bg-white/[0.01]">
                                <th className="px-6 py-4 text-[10px] font-bold text-white/40 uppercase tracking-widest">Transaction ID</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-white/40 uppercase tracking-widest">Type</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-white/40 uppercase tracking-widest">User Address</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-white/40 uppercase tracking-widest">Network</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-white/40 uppercase tracking-widest">Status</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-white/40 uppercase tracking-widest text-right">Time</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-16 text-center text-white/20 text-xs font-medium uppercase tracking-widest">
                                        Fetching logs...
                                    </td>
                                </tr>
                            ) : logs.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-16 text-center text-white/20 text-xs font-medium uppercase tracking-widest">
                                        No transaction data found.
                                    </td>
                                </tr>
                            ) : logs.map((log) => (
                                <tr key={log.id} className="hover:bg-white/[0.02] cursor-pointer transition-colors group">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono text-xs text-white/60 group-hover:text-white transition-colors">{log.txid.substring(0, 20)}...</span>
                                            <ExternalLink className="w-3 h-3 text-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center gap-2">
                                            <Activity className="w-3.5 h-3.5 text-white/20" />
                                            <span className="text-xs font-bold text-white/80">{log.type}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <code className="text-xs text-white/40 font-mono">{log.userAddress.substring(0, 12)}...</code>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`text-[10px] font-bold uppercase ${log.network === 'mainnet' ? 'text-emerald-400' : 'text-amber-400'}`}>
                                            {log.network || currentNetwork}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`inline-flex items-center px-2.5 py-1 rounded text-[10px] font-bold border ${
                                            (log.status === 'Confirmed' || log.status === 'Success') ? 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20' :
                                            log.status === 'Pending'   ? 'bg-amber-400/10 text-amber-400 border-amber-400/20' :
                                                                         'bg-rose-400/10 text-rose-400 border-rose-400/20'
                                        }`}>
                                            {(log.status === 'Success' ? 'Confirmed' : log.status).toUpperCase()}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-[10px] font-bold text-white/40 text-right uppercase tracking-wider font-mono">
                                        {new Date(log.createdAt).toLocaleTimeString()}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
