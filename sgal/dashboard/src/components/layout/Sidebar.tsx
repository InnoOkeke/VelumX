'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Key, Wallet, Activity } from 'lucide-react';
// No motion imports here
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

const navItems = [
    { name: 'Overview', href: '/', icon: LayoutDashboard },
    { name: 'API Keys', href: '/api-keys', icon: Key },
    { name: 'Relayer', href: '/funding', icon: Wallet },
    { name: 'Transaction Logs', href: '/logs', icon: Activity },
];

import { useWallet } from '../providers/WalletContext';

import Image from 'next/image';

export function Sidebar() {
    const pathname = usePathname();
    const { network } = useWallet();

    return (
        <div className="w-64 h-full border-r border-white/10 bg-[#000000] flex flex-col pt-8">
            <div className="px-6 mb-10 flex items-center gap-3">
                <Image
                    src="/velumx-logo.svg"
                    alt="VelumX Logo"
                    width={32}
                    height={32}
                    className="brightness-0 invert"
                />
                <span className="text-xl font-bold tracking-tight text-white uppercase">SGAL</span>
            </div>

            <nav className="flex-1 px-4 space-y-1">
                {navItems.map((item) => {
                    const isActive = pathname === item.href;
                    const Icon = item.icon;

                    return (
                        <Link key={item.name} href={item.href} className="block relative">
                            <div
                                className={twMerge(
                                    clsx(
                                        'relative flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors duration-200',
                                        isActive
                                            ? 'text-white bg-white/10'
                                            : 'text-white/60 hover:text-white hover:bg-white/5'
                                    )
                                )}
                            >
                                <Icon className={clsx("w-4 h-4", isActive ? "text-[#007aff]" : "")} />
                                <span className="font-medium text-sm">{item.name}</span>
                            </div>
                        </Link>
                    );
                })}
            </nav>

            <div className="p-4 mt-auto">
                <div className="border border-white/10 p-4 rounded-xl bg-white/[0.02]">
                    <p className="text-[10px] text-white/40 mb-2 uppercase font-bold tracking-wider">Network Status</p>
                    <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${network === 'mainnet' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                        <span className={`text-xs font-medium ${network === 'mainnet' ? 'text-emerald-400/80' : 'text-amber-400/80'}`}>
                            {network === 'mainnet' ? 'Mainnet Operational' : 'Testnet Operational'}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}

