'use client';



import { Wallet, ArrowDownToLine, RefreshCcw, History } from 'lucide-react';
import { motion } from 'framer-motion';
import { useWallet } from '@/components/providers/WalletProvider';
import { useState, useEffect } from 'react';
import { openContractCall } from '@stacks/connect';
import { STACKS_TESTNET, STACKS_MAINNET } from '@stacks/network';

export default function FundingPage() {
    const [isClient, setIsClient] = useState(false);
    const { network, setNetwork, stxAddress, isLoggedIn, login } = useWallet();
    const [balance, setBalance] = useState('0.00');
    const [isFetching, setIsFetching] = useState(false);

    // This address would be your deployed paymaster contract
    const PAYMASTER_ADDRESS = network === 'testnet' ? 'STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P' : 'SP3...';
    const PAYMASTER_CONTRACT = 'paymaster-module-v3';

    useEffect(() => {
        setIsClient(true);
        if (stxAddress) {
            fetchBalance();
        }
    }, [stxAddress, network]);

    const fetchBalance = async () => {
        setIsFetching(true);
        // In a real app, you'd call the Stacks API or use @stacks/network to get the balance
        // for (get-balance paymaster-address user-address)
        setTimeout(() => {
            setBalance((Math.random() * 5000).toFixed(2));
            setIsFetching(false);
        }, 1000);
    };

    const handleDeposit = async () => {
        if (!isLoggedIn) {
            login();
            return;
        }

        const amount = 100 * 1_000_000; // 100 USDCx

        await openContractCall({
            network: network === 'testnet' ? STACKS_TESTNET : STACKS_MAINNET,
            contractAddress: PAYMASTER_ADDRESS,
            contractName: PAYMASTER_CONTRACT,
            functionName: 'deposit',
            functionArgs: [
                // uint amount
            ],
            onFinish: (data) => {
                console.log('Transaction sent:', data.txId);
                // Trigger refresh after some time or monitor tx
            },
        });
    };

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
                                    {balance}
                                </span>
                                <span className="text-xl text-[#00f0ff] font-bold">USDCx</span>
                            </div>
                            <p className="text-slate-400 mt-2 text-sm flex items-center gap-1">
                                <RefreshCcw className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`} />
                                {isFetching ? 'Fetching...' : 'Click refresh to update'}
                            </p>
                        </div>

                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={handleDeposit}
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
                            <label className="block text-sm font-medium text-slate-300 mb-2">Selected Network</label>
                            <div className="flex gap-4">
                                <button
                                    onClick={() => setNetwork('mainnet')}
                                    className={`flex-1 py-3 px-4 rounded-xl border transition-all flex items-center justify-center font-bold ${network === 'mainnet'
                                        ? 'border-[#7e22ce] bg-[#7e22ce]/20 text-white'
                                        : 'border-white/10 bg-white/5 text-slate-500 hover:text-slate-300'
                                        }`}
                                >
                                    Stacks Mainnet
                                </button>
                                <button
                                    onClick={() => setNetwork('testnet')}
                                    className={`flex-1 py-3 px-4 rounded-xl border transition-all flex items-center justify-center font-bold ${network === 'testnet'
                                        ? 'border-amber-400/50 bg-amber-400/10 text-amber-400'
                                        : 'border-white/10 bg-white/5 text-slate-500 hover:text-slate-300'
                                        }`}
                                >
                                    Stacks Testnet
                                </button>
                            </div>
                        </div>

                        <div className="bg-black/30 p-6 rounded-2xl border border-white/5 flex flex-col items-center justify-center">
                            <p className="text-slate-300 mb-4 text-sm text-center">
                                {network === 'testnet'
                                    ? "Deposit Testnet USDCx to sponsor gas for your users on Testnet."
                                    : "Deposit Mainnet USDCx to sponsor gas for your users on Mainnet."}
                            </p>
                            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-4 py-2 w-full max-w-md justify-between">
                                <span className="text-xs text-slate-500 uppercase font-bold">Paymaster:</span>
                                <code className="text-[#00f0ff] text-sm truncate font-mono">{PAYMASTER_ADDRESS}.{PAYMASTER_CONTRACT}</code>
                                <button className="text-slate-400 hover:text-white text-xs font-bold px-2 py-1 bg-white/5 rounded">Copy</button>
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
                    No recent deposits found on {network === 'testnet' ? 'Testnet' : 'Mainnet'}.
                </div>
            </motion.div>
        </div>
    );
}

