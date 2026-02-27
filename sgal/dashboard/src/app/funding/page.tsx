'use client';

import { Wallet, ArrowDownToLine, RefreshCcw, History } from 'lucide-react';
import { motion } from 'framer-motion';

export default function FundingPage() {
    return (
        <div className="space-y-8 pb-12">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Paymaster Funding</h1>
                <p className="text-slate-400">Deposit USDCx to sponsor transactions for your smart wallet users.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Balance Card */}
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="lg:col-span-1 glass-card p-6 relative overflow-hidden"
                >
                    {/* Decorative background gradients inside the card */}
                    <div className="absolute -top-24 -right-24 w-48 h-48 bg-[#7e22ce]/30 rounded-full blur-[50px] pointer-events-none" />

                    <div className="relative z-10 flex flex-col h-full">
                        <div className="flex items-center gap-3 mb-8">
                            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
                                <Wallet className="w-5 h-5 text-[#00f0ff]" />
                            </div>
                            <h2 className="text-lg font-bold text-white">Available Balance</h2>
                        </div>

                        <div className="mb-8">
                            <div className="flex items-baseline gap-2">
                                <span className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-br from-white to-slate-400">
                                    4,250.00
                                </span>
                                <span className="text-xl text-[#00f0ff] font-bold">USDCx</span>
                            </div>
                            <p className="text-slate-400 mt-2 text-sm flex items-center gap-1">
                                <RefreshCcw className="w-3 h-3" /> Updated 2 mins ago
                            </p>
                        </div>

                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            className="mt-auto w-full py-3 bg-gradient-to-r from-[#00f0ff] to-[#7e22ce] text-white font-bold rounded-xl shadow-lg hover:shadow-[#00f0ff]/20 flex items-center justify-center gap-2 transition-all"
                        >
                            <ArrowDownToLine className="w-5 h-5" />
                            Deposit Funds
                        </motion.button>
                    </div>
                </motion.div>

                {/* Deposit Interface */}
                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="lg:col-span-2 glass-card p-8"
                >
                    <h3 className="text-xl font-bold text-white mb-6">Deposit to Paymaster</h3>

                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Network</label>
                            <div className="flex gap-4">
                                <button className="flex-1 py-3 px-4 rounded-xl border-2 border-[#7e22ce] bg-[#7e22ce]/10 text-white font-medium flex items-center justify-center">
                                    Stacks Mainnet
                                </button>
                                <button className="flex-1 py-3 px-4 rounded-xl border border-white/10 bg-white/5 text-slate-400 font-medium hover:bg-white/10 transition-colors flex items-center justify-center">
                                    Stacks Testnet
                                </button>
                            </div>
                        </div>

                        <div className="bg-black/30 p-6 rounded-2xl border border-white/5 flex flex-col items-center justify-center">
                            <div className="bg-white p-4 rounded-xl mb-4">
                                {/* Mock QR Code representation */}
                                <div className="w-32 h-32 grid grid-cols-4 grid-rows-4 gap-1">
                                    {[...Array(16)].map((_, i) => (
                                        <div key={i} className={`bg-slate-900 rounded-sm ${Math.random() > 0.5 ? 'opacity-100' : 'opacity-20'}`}></div>
                                    ))}
                                </div>
                            </div>
                            <p className="text-slate-300 mb-2 text-sm text-center">Send USDCx on Stacks to your Paymaster address</p>
                            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-4 py-2 w-full max-w-sm justify-between">
                                <code className="text-[#00f0ff] text-sm truncate">SP3K...G842.sgal-paymaster</code>
                                <button className="text-slate-400 hover:text-white">Copy</button>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </div>

            {/* Funding History Table */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="glass-card p-6"
            >
                <div className="flex items-center gap-2 mb-6 text-white font-bold text-lg">
                    <History className="w-5 h-5 text-slate-400" />
                    Deposit History
                </div>
                <div className="w-full text-center py-12 text-slate-500">
                    No recent deposits found.
                </div>
            </motion.div>
        </div>
    );
}
