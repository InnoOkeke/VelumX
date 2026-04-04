'use client';

import { Bell } from 'lucide-react';
import { Search } from 'lucide-react';
import { User } from 'lucide-react';
import { LogOut } from 'lucide-react';
import { useUser } from '@/components/providers/SessionProvider';
import { useWallet } from '@/components/providers/WalletContext'; 
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { Globe, TestTube2 } from 'lucide-react';
import toast from 'react-hot-toast';
import Image from 'next/image';

export function TopNav() {
    const { user } = useUser();
    const { network, setNetwork } = useWallet();
    const router = useRouter();
    const supabase = createClient();

    const handleSignOut = async () => {
        try {
            await supabase.auth.signOut();
            toast.success('Signed out successfully');
            router.push('/auth/signin');
            router.refresh();
        } catch (error) {
            toast.error('Failed to sign out');
        }
    };

    return (
        <header className="h-20 w-full border-b border-white/10 bg-[#000000] flex items-center justify-between px-8 z-10 sticky top-0">
            <div className="flex items-center gap-4 w-96">
                <div className="relative w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                    <input
                        type="text"
                        placeholder="Search API keys, logs..."
                        className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-white/20 transition-all placeholder:text-white/20"
                    />
                </div>
            </div>

            <div className="flex items-center gap-4 bg-white/5 border border-white/10 rounded-full p-1">
                <button
                    onClick={() => setNetwork('mainnet')}
                    className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                        network === 'mainnet'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20'
                            : 'text-white/40 hover:text-white/60'
                    }`}
                >
                    <Globe className="w-3.5 h-3.5" />
                    Mainnet
                </button>
                <button
                    onClick={() => setNetwork('testnet')}
                    className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                        network === 'testnet'
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/20'
                            : 'text-white/40 hover:text-white/60'
                    }`}
                >
                    <TestTube2 className="w-3.5 h-3.5" />
                    Testnet
                </button>
            </div>

            <div className="flex items-center gap-6">
                <button className="relative text-white/40 hover:text-white transition-colors">
                    <Bell className="w-5 h-5" />
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-white rounded-full border-2 border-black"></span>
                </button>

                <div className="h-6 w-px bg-white/10" />

                {user && (
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-3 py-1.5 px-3 rounded-lg border border-white/10 bg-white/5">
                            <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center">
                                <User className="w-4 h-4 text-white/60" />
                            </div>
                            <div className="text-left hidden sm:block">
                                <p className="text-xs font-medium text-white">
                                    {user.user_metadata?.name || user.email?.split('@')[0] || 'User'}
                                </p>
                                <p className="text-[10px] text-white/40">
                                    {user.email}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={handleSignOut}
                            className="p-2 hover:bg-rose-500/10 rounded-lg text-white/40 hover:text-rose-400 transition-colors"
                            title="Sign out"
                        >
                            <LogOut className="w-4 h-4" />
                        </button>
                    </div>
                )}
            </div>
        </header>
    );
}
