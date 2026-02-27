'use client';

import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { TopNav } from './TopNav';
import { motion, AnimatePresence } from 'framer-motion';
import { WalletProvider } from '../providers/WalletProvider';

export function DashboardLayout({ children }: { children: ReactNode }) {
    return (
        <WalletProvider>
            <div className="flex h-screen w-full bg-[#0f111a] overflow-hidden selection:bg-[#7e22ce]/30">
                {/* Dynamic Background Elements */}
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-[#7e22ce]/10 blur-[120px] pointer-events-none" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-[#00f0ff]/10 blur-[120px] pointer-events-none" />

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
