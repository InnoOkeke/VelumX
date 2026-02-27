'use client';

import { Bell, Search, Hexagon, LogOut } from 'lucide-react';
import { useWallet } from '../providers/WalletProvider';

export function TopNav() {
    const { isLoggedIn, stxAddress, login, logout } = useWallet();

    return (
        <header className="h-20 w-full border-b border-white/5 bg-[#0f111a]/80 backdrop-blur-xl flex items-center justify-between px-8 z-10 sticky top-0">
            <div className="flex items-center gap-4 w-96">
                <div className="relative w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search API keys, addresses..."
                        className="w-full bg-white/5 border border-white/10 rounded-full pl-10 pr-4 py-2 text-sm text-slate-200 focus:outline-none focus:border-[#00f0ff]/50 focus:ring-1 focus:ring-[#00f0ff]/50 transition-all placeholder:text-slate-500"
                    />
                </div>
            </div>

            <div className="flex items-center gap-6">
                <button className="relative text-slate-400 hover:text-white transition-colors">
                    <Bell className="w-5 h-5" />
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-[#7e22ce] rounded-full border-2 border-[#0f111a]"></span>
                </button>

                <div className="h-6 w-px bg-white/10" />

                {isLoggedIn ? (
                    <div className="flex items-center gap-3">
                        <button className="flex items-center gap-3 hover:bg-white/5 py-1.5 px-3 rounded-full transition-colors">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 p-[1px]">
                                <div className="w-full h-full rounded-full bg-[#1a1d2d] flex items-center justify-center">
                                    <Hexagon className="w-4 h-4 text-slate-300" />
                                </div>
                            </div>
                            <div className="text-left hidden sm:block">
                                <p className="text-sm font-medium text-white line-clamp-1">
                                    {stxAddress ? `${stxAddress.substring(0, 4)}...${stxAddress.substring(stxAddress.length - 4)}` : 'Connected'}
                                </p>
                            </div>
                        </button>
                        <button
                            onClick={logout}
                            className="p-2 hover:bg-white/5 rounded-full text-slate-400 hover:text-rose-400 transition-colors"
                            title="Logout"
                        >
                            <LogOut className="w-4 h-4" />
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={login}
                        className="bg-gradient-to-r from-[#7e22ce] to-[#00f0ff] text-white px-6 py-2 rounded-full text-sm font-bold shadow-lg shadow-[#7e22ce]/20 hover:scale-105 transition-transform active:scale-95"
                    >
                        Connect Wallet
                    </button>
                )}
            </div>
        </header>
    );
}

