'use client';

import { Bell, Search, Hexagon, LogOut } from 'lucide-react';
import { useWallet } from '../providers/WalletContext';
import clsx from 'clsx';


export function TopNav() {
    const { isLoggedIn, stxAddress, login, logout, network, setNetwork } = useWallet();

    return (
        <header className="h-20 w-full border-b border-white/10 bg-[#000000] flex items-center justify-between px-8 z-10 sticky top-0">
            <div className="flex items-center gap-4 w-96">
                <div className="relative w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                    <input
                        type="text"
                        placeholder="Search API keys, addresses..."
                        className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-white/20 transition-all placeholder:text-white/20"
                    />
                </div>
            </div>

            <div className="flex items-center gap-6">
                {/* Network Switcher */}
                <div className="flex items-center bg-white/5 border border-white/10 rounded-lg p-1">
                    <button
                        onClick={() => setNetwork('testnet')}
                        className={clsx(
                            "px-4 py-1 rounded-md text-[10px] font-bold transition-all uppercase tracking-wider",
                            network === 'testnet'
                                ? "bg-amber-400 text-black"
                                : "text-white/40 hover:text-white"
                        )}
                    >
                        Testnet
                    </button>
                    <button
                        onClick={() => setNetwork('mainnet')}
                        className={clsx(
                            "px-4 py-1 rounded-md text-[10px] font-bold transition-all uppercase tracking-wider",
                            network === 'mainnet'
                                ? "bg-emerald-400 text-black"
                                : "text-white/40 hover:text-white"
                        )}
                    >
                        Mainnet
                    </button>
                </div>

                <button className="relative text-white/40 hover:text-white transition-colors">
                    <Bell className="w-5 h-5" />
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-white rounded-full border-2 border-black"></span>
                </button>

                <div className="h-6 w-px bg-white/10" />

                {isLoggedIn ? (
                    <div className="flex items-center gap-3">
                        <button className="flex items-center gap-3 hover:bg-white/5 py-1.5 px-3 rounded-lg transition-colors border border-transparent hover:border-white/10">
                            <div className="w-7 h-7 rounded-sm bg-white/10 flex items-center justify-center">
                                <Hexagon className="w-3.5 h-3.5 text-white/60" />
                            </div>
                            <div className="text-left hidden sm:block">
                                <p className="text-xs font-medium text-white">
                                    {stxAddress ? `${stxAddress.substring(0, 4)}...${stxAddress.substring(stxAddress.length - 4)}` : 'Connected'}
                                </p>
                            </div>
                        </button>
                        <button
                            onClick={logout}
                            className="p-2 hover:bg-rose-500/10 rounded-lg text-white/40 hover:text-rose-400 transition-colors"
                            title="Logout"
                        >
                            <LogOut className="w-4 h-4" />
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={login}
                        className="bg-white text-black px-5 py-2 rounded-lg text-xs font-bold hover:bg-white/90 transition-colors active:scale-95"
                    >
                        Connect Wallet
                    </button>
                )}
            </div>
        </header>
    );
}

