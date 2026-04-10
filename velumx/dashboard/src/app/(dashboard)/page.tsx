'use client';

import { useState, useEffect } from 'react';
import { Activity } from 'lucide-react';
import { Users } from 'lucide-react';
import { BatteryCharging } from 'lucide-react';
import toast from 'react-hot-toast';
import { useUser } from '@/components/providers/SessionProvider';
import { useWallet } from '@/components/providers/WalletContext';

import { RELAYER_URL } from '@/lib/config';

// Format a USD value with enough precision to show small amounts
function formatUsd(value: string | number): string {
  const n = parseFloat(value as string) || 0;
  if (n === 0) return '0.00';
  if (n < 0.01) return n.toFixed(6);
  if (n < 1) return n.toFixed(4);
  return n.toFixed(2);
}

export default function DashboardOverview() {
  const [isClient, setIsClient] = useState(false);
  const { user, loading: userLoading } = useUser();
  const { network: currentNetwork } = useWallet();
  const [statsData, setStatsData] = useState<any>({
    activeKeys: 0,
    networks: {
      mainnet: { totalTransactions: 0, totalSponsored: '0', relayerAddress: '', relayerStxBalance: '0', relayerFeeBalance: '0', feeToken: 'USDCx' },
      testnet: { totalTransactions: 0, totalSponsored: '0', relayerAddress: '', relayerStxBalance: '0', relayerFeeBalance: '0', feeToken: 'USDCx' }
    }
  });
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsClient(true);
    const fetchAllData = async () => {
      if (!user) return;

      setIsLoading(true);
      try {
        const supabase = (await import('@/lib/supabase/client')).createClient();
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        if (!token) {
          console.log('Dashboard: No session token available yet.');
          return;
        }

        const fetchStats = async () => {
          try {
            // Always clear stale Redis cache before fetching — ensures fresh data on every page visit
            await fetch(`${RELAYER_URL}/api/dashboard/cache-clear`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${token}` }
            }).catch(() => {});

            const res = await fetch(`${RELAYER_URL}/api/dashboard/stats`, {
              cache: 'no-store',
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) return await res.json();
            if (res.status === 401) console.warn('Relayer: 401 Unauthorized');
          } catch (e) { console.warn('Stats fetch failed'); }
          return null;
        };

        const fetchLogs = async () => {
          try {
            const res = await fetch(`${RELAYER_URL}/api/dashboard/logs?network=${currentNetwork}`, {
              cache: 'no-store',
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) return await res.json();
          } catch (e) { console.warn('Logs fetch failed'); }
          return [];
        };

        const [stats, logsData] = await Promise.all([fetchStats(), fetchLogs()]);

        if (stats) setStatsData(stats);
        if (logsData && Array.isArray(logsData)) setLogs(logsData);

        if (!stats && (!logsData || logsData.length === 0)) {
          toast.error('Relayer Offline: Showing cached data.', { id: 'relayer-offline' });
        }
      } catch (error) {
        console.error('Dashboard Overview: Error fetching data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (!userLoading) {
      fetchAllData();
    }
  }, [user, userLoading, currentNetwork]);

  if (!isClient) return null;

  const currentStats = statsData.networks?.[currentNetwork] || {
    totalTransactions: 0,
    totalSponsored: '0',
    relayerAddress: '',
    relayerStxBalance: '0',
    relayerFeeBalance: '0',
    feeToken: 'USD'
  };

  const metricCards = [
    {
      title: 'Total Gas Sponsored',
      value: `${formatUsd(currentStats.totalSponsored)} USD`,
      icon: BatteryCharging,
      color: 'bg-white/5'
    },
    {
      title: 'Active API Keys',
      value: statsData.activeKeys.toString(),
      icon: Activity,
      color: 'bg-white/5'
    },
    {
      title: 'Total Transactions',
      value: currentStats.totalTransactions.toString(),
      icon: Users,
      color: 'bg-white/5'
    }
  ];

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Overview</h1>
          <p className="text-white/40 mt-1 text-sm">Monitor your dApp's gas abstraction performance.</p>
        </div>

        {!isLoading && currentStats.relayerAddress && (
          <div className="glass-card px-5 py-3 flex items-center gap-6 border-white/5 bg-white/[0.01] hover:bg-white/[0.03] transition-colors">
            <div className="flex flex-col">
              <span className="text-[9px] text-white/20 uppercase font-black tracking-widest mb-1">
                Relayer ({currentNetwork})
              </span>
              <div className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${currentNetwork === 'mainnet' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                <span className="text-[11px] text-white/60 font-mono tracking-tight">
                  {currentStats.relayerAddress.substring(0, 8)}...{currentStats.relayerAddress.substring(currentStats.relayerAddress.length - 6)}
                </span>
              </div>
            </div>
            <div className="h-8 w-px bg-white/10" />
            <div className="flex flex-col">
              <span className="text-[9px] text-white/20 uppercase font-black tracking-widest mb-1">STX Balance</span>
              <span className="text-[11px] text-white font-bold font-mono">
                {(parseInt(currentStats.relayerStxBalance) / 1_000_000).toFixed(2)} <span className="text-white/40 font-medium">STX</span>
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] text-white/20 uppercase font-black tracking-widest mb-1">Rev. ({currentNetwork})</span>
              <span className={`text-[11px] font-bold font-mono ${currentNetwork === 'mainnet' ? 'text-emerald-400' : 'text-amber-400'}`}>
                {formatUsd(currentStats.relayerFeeBalance)} <span className="opacity-40 font-medium">USD</span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {metricCards.map((stat) => (
          <div
            key={stat.title}
            className="glass-card p-6 flex flex-col justify-between h-36"
          >
            <div className="flex justify-between items-start">
              <div>
                <p className="text-white/40 font-medium text-[10px] uppercase tracking-wider">{stat.title}</p>
                <h3 className="text-2xl font-bold text-white mt-2 font-mono">
                  {isLoading ? '...' : stat.value}
                </h3>
              </div>
              <div className={`w-8 h-8 rounded-lg ${stat.color} flex items-center justify-center border border-white/10`}>
                <stat.icon className="w-4 h-4 text-white/60" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Main Chart Area */}
      <div className="glass-card w-full h-[400px] p-8 flex flex-col">
        <div className="flex justify-between items-center mb-10">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">Sponsorship Volume (Transactions)</h2>
          <select className="bg-white/5 border border-white/10 text-white text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-white/20 transition-colors appearance-none outline-none">
            <option>Last 7 Days</option>
            <option>Last 30 Days</option>
          </select>
        </div>

        <div className="flex-1 w-full flex items-end justify-between px-4 pb-4 gap-4 border-b border-l border-white/5 relative">
          {(() => {
            const last7Days = Array.from({ length: 7 }, (_, i) => {
              const d = new Date();
              d.setDate(d.getDate() - (6 - i));
              return d.toISOString().split('T')[0];
            });

            const dailyTotals = last7Days.map(date => {
              const count = logs.filter(log => log.createdAt.startsWith(date)).length;
              return count;
            });

            const maxTotal = Math.max(...dailyTotals, 1);

            return dailyTotals.map((total, i) => {
              const height = (total / maxTotal) * 100;
              return (
                <div
                  key={i}
                  style={{ height: `${Math.max(height, 2)}%` }}
                  className="w-full rounded-sm bg-white/20 hover:bg-white/40 transition-colors relative group"
                >
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-white text-black text-[10px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20">
                    {total} tx
                  </div>
                </div>
              );
            });
          })()}

          <div className="absolute -left-10 bottom-[20%] text-[10px] text-white/20 font-mono">20%</div>
          <div className="absolute -left-10 bottom-[50%] text-[10px] text-white/20 font-mono">50%</div>
          <div className="absolute -left-10 bottom-[80%] text-[10px] text-white/20 font-mono">80%</div>
        </div>
        <div className="flex justify-between w-full mt-4 px-4 text-[10px] text-white/20 uppercase font-bold tracking-widest font-mono">
          {Array.from({ length: 7 }, (_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - (6 - i));
            return <span key={i}>{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]}</span>;
          })}
        </div>
      </div>

      <div className="glass-card w-full p-8">
        <h2 className="text-sm font-bold text-white mb-8 uppercase tracking-wider">Recent Activity</h2>
        <div className="space-y-2">
          {isLoading ? (
            <p className="text-white/20 text-center py-4 text-xs">Loading activity...</p>
          ) : logs.length === 0 ? (
            <p className="text-white/20 text-center py-4 text-xs">No recent activity.</p>
          ) : logs.slice(0, 5).map((log) => (
            <div key={log.id} className="flex justify-between items-center p-4 hover:bg-white/[0.02] border border-white/5 rounded-xl transition-colors">
              <div className="flex gap-4 items-center">
                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center border border-white/10">
                  <Activity className="w-3.5 h-3.5 text-white/40" />
                </div>
                <div>
                  <p className="text-white text-xs font-bold">{log.type}</p>
                  <p className="text-[10px] text-white/40 font-mono mt-0.5">{log.txid.substring(0, 16)}...</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-white text-xs font-bold font-mono">{log.txid.substring(0, 10)}...</p>
                <p className={`text-[10px] font-bold mt-0.5 ${(log.status === 'Confirmed' || log.status === 'Success') ? 'text-emerald-400' : log.status === 'Pending' ? 'text-amber-400' : 'text-rose-400'}`}>{log.status === 'Success' ? 'Confirmed' : log.status}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
