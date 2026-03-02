'use client';

import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { TopNav } from './TopNav';
import dynamic from 'next/dynamic';
import { Toaster } from 'react-hot-toast';

// Load WalletProvider dynamically to skip SSR and fix Turbopack build errors
const WalletProvider = dynamic(
    () => import('@/components/providers/WalletProvider').then(mod => mod.WalletProvider),
    { ssr: false }
);

export function DashboardLayout({ children }: { children: ReactNode }) {
    return (
        <WalletProvider>
            <Toaster position="top-right" />
            <div className="flex h-screen w-full bg-[#000000] overflow-hidden selection:bg-[#007aff]/30">
                <Sidebar />

                <div className="flex-1 flex flex-col h-full relative z-10 w-full overflow-hidden">
                    <TopNav />
                    <main className="flex-1 overflow-y-auto overflow-x-hidden p-8 custom-scrollbar">
                        <div className="fade-in">
                            {children}
                        </div>
                    </main>
                </div>
            </div>
        </WalletProvider>
    );
}
