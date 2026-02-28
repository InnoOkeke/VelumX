'use client';

import { Activity, Users, BatteryCharging, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { useState, useEffect } from 'react';
import toast, { Toaster } from 'react-hot-toast';

const RELAYER_URL = process.env.NEXT_PUBLIC_SGAL_RELAYER_URL || 'http://localhost:4000';

export default function DashboardOverview() {
  const [isClient, setIsClient] = useState(false);
  const [statsData, setStatsData] = useState({
    totalTransactions: 0,
    activeKeys: 0,
    totalSponsored: '0',
    activeSmartWallets: 0
  });
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsClient(true);
    const fetchAllData = async () => {
      try {
        const [statsRes, logsRes] = await Promise.all([
          fetch(`${RELAYER_URL}/api/dashboard/stats`),
          fetch(`${RELAYER_URL}/api/dashboard/logs`)
        ]);

        if (!statsRes.ok || !logsRes.ok) throw new Error('Failed to connect to Relayer');

        const stats = await statsRes.json();
        const logsData = await logsRes.json();
        setStatsData(stats);
        setLogs(logsData);
      } catch (error) {
        console.error('Error fetching data:', error);
        toast.error('Relayer Offline: Dashboard displaying cached/empty data.', { duration: 5000 });
      } finally {
        setIsLoading(false);
      }
    };
    fetchAllData();
  }, []);

  if (!isClient) return null;

  const metricCards = [
    {
      title: 'Total Gas Sponsored',
      value: `${(parseInt(statsData.totalSponsored) / 1_000_000).toFixed(2)} USDCx`,
      change: '0%',
      trend: 'up',
      icon: BatteryCharging,
      color: 'bg-white/5'
    },
    {
      title: 'Active API Keys',
      value: statsData.activeKeys.toString(),
      change: '0%',
      trend: 'up',
      icon: Activity,
      color: 'bg-white/5'
    },
    {
      title: 'Total Transactions',
      value: statsData.totalTransactions.toString(),
      change: '0%',
      trend: 'up',
      icon: Users,
      color: 'bg-white/5'
    }
  ];

  return (
    <div className="space-y-8 pb-12">
      <Toaster position="top-right" />
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Overview</h1>
        <p className="text-white/40 mt-1 text-sm">Monitor your dApp's gas abstraction performance.</p>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {metricCards.map((stat, i) => (
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
            <div className="flex items-center gap-2">
              <span className={`flex items-center text-[10px] font-bold ${stat.trend === 'up' ? 'text-emerald-400' : 'text-rose-400'}`}>
                {stat.trend === 'up' ? <ArrowUpRight className="w-3 h-3 mr-0.5" /> : <ArrowDownRight className="w-3 h-3 mr-0.5" />}
                {stat.change}
              </span>
              <span className="text-[10px] text-white/20 uppercase font-bold tracking-widest">Growth</span>
            </div>
          </div>
        ))}
      </div>

      {/* Main Chart Area */}
      <div className="glass-card w-full h-[400px] p-8 flex flex-col">
        <div className="flex justify-between items-center mb-10">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">Sponsorship Volume (USDCx)</h2>
          <select className="bg-white/5 border border-white/10 text-white text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-white/20 transition-colors appearance-none">
            <option>Last 7 Days</option>
            <option>Last 30 Days</option>
          </select>
        </div>

        {/* Sponsorship Volume (USDCx) */}
        <div className="flex-1 w-full flex items-end justify-between px-4 pb-4 gap-4 border-b border-l border-white/5 relative">
          {(() => {
            const last7Days = Array.from({ length: 7 }, (_, i) => {
              const d = new Date();
              d.setDate(d.getDate() - (6 - i));
              return d.toISOString().split('T')[0];
            });

            const dailyTotals = last7Days.map(date => {
              const dayLogs = logs.filter(log => log.createdAt.startsWith(date));
              const total = dayLogs.reduce((acc, log) => acc + (parseInt(log.feeAmount) || 0), 0);
              return total / 1_000_000; // In USDCx
            });

            const maxTotal = Math.max(...dailyTotals, 10);

            return dailyTotals.map((total, i) => {
              const height = (total / maxTotal) * 100;
              return (
                <div
                  key={i}
                  style={{ height: `${Math.max(height, 2)}%` }}
                  className="w-full rounded-sm bg-white/20 hover:bg-white/40 transition-colors relative group"
                >
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-white text-black text-[10px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20">
                    {total.toFixed(2)} USDCx
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

      {/* Recent Activity Mini-table */}
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
                <p className="text-white text-xs font-bold font-mono">{parseInt(log.feeAmount) / 1_000_000} USDCx</p>
                <p className={`text-[10px] font-bold mt-0.5 ${log.status === 'Confirmed' ? 'text-emerald-400' : 'text-amber-400'}`}>{log.status}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
