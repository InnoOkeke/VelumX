'use client';

import { Activity, Users, BatteryCharging, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { motion } from 'framer-motion';

import { useState, useEffect } from 'react';

const RELAYER_URL = process.env.NEXT_PUBLIC_SGAL_RELAYER_URL || 'http://localhost:4000';

export default function DashboardOverview() {
  const [statsData, setStatsData] = useState({
    totalTransactions: 0,
    activeKeys: 0,
    totalSponsored: '0',
    activeSmartWallets: 0
  });
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchAllData = async () => {
      try {
        const [statsRes, logsRes] = await Promise.all([
          fetch(`${RELAYER_URL}/api/dashboard/stats`),
          fetch(`${RELAYER_URL}/api/dashboard/logs`)
        ]);
        const stats = await statsRes.json();
        const logsData = await logsRes.json();
        setStatsData(stats);
        setLogs(logsData);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchAllData();
  }, []);

  const metricCards = [
    {
      title: 'Total Gas Sponsored',
      value: `${(parseInt(statsData.totalSponsored) / 1_000_000).toFixed(2)} USDCx`,
      change: '+0%',
      trend: 'up',
      icon: BatteryCharging,
      color: 'from-emerald-400 to-teal-500'
    },
    {
      title: 'Active API Keys',
      value: statsData.activeKeys.toString(),
      change: '+0%',
      trend: 'up',
      icon: Activity,
      color: 'from-blue-400 to-indigo-500'
    },
    {
      title: 'Total Transactions',
      value: statsData.totalTransactions.toString(),
      change: '+0%',
      trend: 'up',
      icon: Users,
      color: 'from-purple-400 to-pink-500'
    }
  ];
  return (
    <div className="space-y-8 pb-12">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Dashboard Overview</h1>
        <p className="text-slate-400 mt-2">Monitor your dApp's gas abstraction usage and compute performance.</p>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {metricCards.map((stat, i) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1, duration: 0.4 }}
            className="glass-card p-6 flex flex-col justify-between h-40"
          >
            <div className="flex justify-between items-start">
              <div>
                <p className="text-slate-400 font-medium text-sm">{stat.title}</p>
                <h3 className="text-3xl font-bold text-white mt-1">
                  {isLoading ? '...' : stat.value}
                </h3>
              </div>
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center shadow-lg shadow-black/20`}>
                <stat.icon className="w-5 h-5 text-white" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`flex items-center text-sm font-medium ${stat.trend === 'up' ? 'text-emerald-400' : 'text-rose-400'}`}>
                {stat.trend === 'up' ? <ArrowUpRight className="w-4 h-4 mr-1" /> : <ArrowDownRight className="w-4 h-4 mr-1" />}
                {stat.change}
              </span>
              <span className="text-sm text-slate-500">vs last month</span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Main Chart Area */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="glass-card w-full h-96 p-6 flex flex-col"
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-bold text-white">Sponsorship Volume (USDCx)</h2>
          <select className="bg-white/5 border border-white/10 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#00f0ff] transition-colors appearance-none">
            <option>Last 7 Days</option>
            <option>Last 30 Days</option>
            <option>Year to Date</option>
          </select>
        </div>

        {/* Sponsorship Volume (USDCx) */}
        <div className="flex-1 w-full flex items-end justify-between px-4 pb-4 gap-2 border-b border-l border-white/10 relative">
          {/* Real Bar Chart calculated from logs */}
          {(() => {
            const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
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

            const maxTotal = Math.max(...dailyTotals, 10); // Minimum scale of 10

            return dailyTotals.map((total, i) => {
              const height = (total / maxTotal) * 100;
              return (
                <motion.div
                  key={i}
                  initial={{ height: 0 }}
                  animate={{ height: `${Math.max(height, 5)}%` }} // Minimum 5% for visibility
                  transition={{ delay: 0.5 + (i * 0.1), type: 'spring' }}
                  className="w-full mx-1 rounded-t-sm bg-gradient-to-t from-[#7e22ce]/80 to-[#00f0ff]/80 relative group"
                >
                  <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-[#262b40] border border-white/10 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20">
                    {total.toFixed(2)} USDCx
                  </div>
                </motion.div>
              );
            });
          })()}

          <div className="absolute -left-12 bottom-[20%] text-xs text-slate-500">20%</div>
          <div className="absolute -left-12 bottom-[50%] text-xs text-slate-500">50%</div>
          <div className="absolute -left-12 bottom-[80%] text-xs text-slate-500">80%</div>
        </div>
        <div className="flex justify-between w-full mt-4 px-4 text-xs text-slate-500">
          {Array.from({ length: 7 }, (_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - (6 - i));
            return <span key={i}>{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]}</span>;
          })}
        </div>

      </motion.div>

      {/* Recent Activity Mini-table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
        className="glass-card w-full p-6"
      >
        <h2 className="text-lg font-bold text-white mb-6">Recent Activity</h2>
        <div className="space-y-4">
          {isLoading ? (
            <p className="text-slate-500 text-center py-4">Loading activity...</p>
          ) : logs.length === 0 ? (
            <p className="text-slate-500 text-center py-4">No recent activity.</p>
          ) : logs.slice(0, 5).map((log, i) => (
            <div key={log.id} className="flex justify-between items-center p-4 bg-white/[0.02] border border-white/5 rounded-xl hover:bg-white/5 transition-colors">
              <div>
                <p className="text-white font-medium">{log.type}</p>
                <p className="text-sm text-slate-400 font-mono">{log.txid.substring(0, 10)}...</p>
              </div>
              <div className="text-right">
                <p className="text-white font-medium">{parseInt(log.feeAmount) / 1_000_000} USDCx</p>
                <p className={`text-sm ${log.status === 'Confirmed' ? 'text-emerald-400' : 'text-amber-400'}`}>{log.status}</p>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
