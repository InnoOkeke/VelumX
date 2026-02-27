'use client';

import { Activity, Users, BatteryCharging, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { motion } from 'framer-motion';

const stats = [
  {
    title: 'Total Gas Sponsored',
    value: '452,190 STX',
    change: '+12.5%',
    trend: 'up',
    icon: BatteryCharging,
    color: 'from-emerald-400 to-teal-500'
  },
  {
    title: 'API Requests (24h)',
    value: '1.24M',
    change: '+5.2%',
    trend: 'up',
    icon: Activity,
    color: 'from-blue-400 to-indigo-500'
  },
  {
    title: 'Active Smart Wallets',
    value: '8,439',
    change: '-1.1%',
    trend: 'down',
    icon: Users,
    color: 'from-purple-400 to-pink-500'
  }
];

export default function DashboardOverview() {
  return (
    <div className="space-y-8 pb-12">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Dashboard Overview</h1>
        <p className="text-slate-400 mt-2">Monitor your dApp's gas abstraction usage and compute performance.</p>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat, i) => (
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
                <h3 className="text-3xl font-bold text-white mt-1">{stat.value}</h3>
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

        {/* Placeholder for actual chart (recharts) */}
        <div className="flex-1 w-full flex items-end justify-between px-4 pb-4 gap-2 border-b border-l border-white/10 relative">
          {/* Simulated Bar Chart */}
          {[40, 60, 45, 80, 65, 90, 75].map((height, i) => (
            <motion.div
              key={i}
              initial={{ height: 0 }}
              animate={{ height: `${height}%` }}
              transition={{ delay: 0.5 + (i * 0.1), type: 'spring' }}
              className="w-full mx-1 rounded-t-sm bg-gradient-to-t from-[#7e22ce]/80 to-[#00f0ff]/80 relative group"
            >
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-[#262b40] border border-white/10 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                ${height * 12}
              </div>
            </motion.div>
          ))}
          <div className="absolute -left-12 bottom-[20%] text-xs text-slate-500">$5k</div>
          <div className="absolute -left-12 bottom-[50%] text-xs text-slate-500">$10k</div>
          <div className="absolute -left-12 bottom-[80%] text-xs text-slate-500">$15k</div>
        </div>
        <div className="flex justify-between w-full mt-4 px-4 text-xs text-slate-500">
          <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
        </div>
      </motion.div>

      {/* Recent Activity Mini-table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
        className="glass-card w-full p-6"
      >
        <h2 className="text-lg font-bold text-white mb-6">Recent Integrations</h2>
        <div className="space-y-4">
          {[
            { app: 'VelumX Swap', type: 'DEX Route', fee: '$0.42', status: 'Success' },
            { app: 'NFT Marketplace', type: 'Mint Intent', fee: '$1.15', status: 'Success' },
            { app: 'GameFi Onboard', type: 'Wallet Deploy', fee: '$0.12', status: 'Pending' }
          ].map((activity, i) => (
            <div key={i} className="flex justify-between items-center p-4 bg-white/[0.02] border border-white/5 rounded-xl hover:bg-white/5 transition-colors">
              <div>
                <p className="text-white font-medium">{activity.app}</p>
                <p className="text-sm text-slate-400">{activity.type}</p>
              </div>
              <div className="text-right">
                <p className="text-white font-medium">{activity.fee}</p>
                <p className={`text-sm ${activity.status === 'Success' ? 'text-emerald-400' : 'text-amber-400'}`}>{activity.status}</p>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
