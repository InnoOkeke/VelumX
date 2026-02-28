'use client';

import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { TopNav } from './TopNav';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';

const WalletProvider = dynamic(
    () => import('@/components/providers/WalletProvider').then(mod => mod.WalletProvider),
    { ssr: false }
);

export function DashboardLayout({ children }: { children: ReactNode }) {
    return (
        <WalletProvider>
            <div className="flex h-screen w-full bg-[#000000] overflow-hidden selection:bg-[#007aff]/30">
                <Sidebar />

                <div className="flex-1 flex flex-col h-full relative z-10 w-full overflow-hidden">
                    <TopNav />
                    <main className="flex-1 overflow-y-auto overflow-x-hidden p-8 custom-scrollbar">
                        <AnimatePresence mode="wait">
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.4 }}
                            >
                                {children}
                            </motion.div>
                        </AnimatePresence>
                    </main>
                </div>
            </div>
        </WalletProvider>
    );
}
