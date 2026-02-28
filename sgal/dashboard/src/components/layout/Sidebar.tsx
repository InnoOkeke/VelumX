'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Key, Wallet, Activity } from 'lucide-react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

const navItems = [
    { name: 'Overview', href: '/', icon: LayoutDashboard },
    { name: 'API Keys', href: '/api-keys', icon: Key },
    { name: 'Funding', href: '/funding', icon: Wallet },
    { name: 'Transaction Logs', href: '/logs', icon: Activity },
];

import { useWallet } from '../providers/WalletProvider';

export function Sidebar() {
    const pathname = usePathname();
    const { network } = useWallet();

    return (
        <div className="w-64 h-full border-r border-white/5 bg-[#0f111a]/80 backdrop-blur-xl flex flex-col pt-8">
            <div className="px-8 mb-10 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#00f0ff] to-[#7e22ce] flex items-center justify-center">
                    <span className="text-white font-bold text-lg">S</span>
                </div>
                <span className="text-xl font-bold tracking-tight text-white">SGAL</span>
            </div>

            <nav className="flex-1 px-4 space-y-2">
                {navItems.map((item) => {
                    const isActive = pathname === item.href;
                    const Icon = item.icon;

                    return (
                        <Link key={item.name} href={item.href} className="block relative">
                            {isActive && (
                                <motion.div
                                    layoutId="sidebar-active"
                                    className="absolute inset-0 bg-white/5 rounded-xl border border-white/10"
                                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                                />
                            )}
                            <div
                                className={twMerge(
                                    clsx(
                                        'relative flex items-center gap-3 px-4 py-3 rounded-xl transition-colors duration-200',
                                        isActive ? 'text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'
                                    )
                                )}
                            >
                                <Icon className={clsx("w-5 h-5", isActive ? "text-[#00f0ff]" : "")} />
                                <span className="font-medium">{item.name}</span>
                            </div>
                        </Link>
                    );
                })}
            </nav>

            <div className="p-4 mt-auto">
                <div className="glass-card p-4 rounded-xl">
                    <p className="text-xs text-slate-400 mb-2">Network Status</p>
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full animate-pulse ${network === 'mainnet' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                        <span className={`text-sm font-medium ${network === 'mainnet' ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {network === 'mainnet' ? 'Mainnet Operational' : 'Testnet Operational'}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}

