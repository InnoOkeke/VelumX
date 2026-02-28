'use client';



import { Wallet, ArrowDownToLine, RefreshCcw, History } from 'lucide-react';
// No motion here
import { useWallet } from '@/components/providers/WalletContext';
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
                <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Funding</h1>
                <p className="text-white/40 text-sm font-medium">Deposit USDCx to sponsor transactions for your smart wallet users.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Balance Card */}
                <div
                    className="lg:col-span-1 glass-card p-8 flex flex-col justify-between"
                >
                    <div>
                        <div className="flex items-center gap-3 mb-10">
                            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/10">
                                <Wallet className="w-5 h-5 text-white/60" />
                            </div>
                            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Available Balance</h2>
                        </div>

                        <div className="mb-10">
                            <div className="flex items-baseline gap-2">
                                <span className="text-5xl font-black text-white font-mono">
                                    {balance}
                                </span>
                                <span className="text-lg text-white/40 font-bold">USDCx</span>
                            </div>
                            <p className="text-white/20 mt-3 text-[10px] uppercase font-bold tracking-widest flex items-center gap-1.5">
                                <RefreshCcw className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`} />
                                {isFetching ? 'Fetching data...' : 'Updated just now'}
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={handleDeposit}
                        className="w-full py-4 bg-white text-black font-black text-sm uppercase tracking-widest rounded-xl hover:bg-white/90 transition-all flex items-center justify-center gap-2"
                    >
                        <ArrowDownToLine className="w-4 h-4" />
                        Deposit Funds
                    </button>
                </div>

                {/* Deposit Interface */}
                <div
                    className="lg:col-span-2 glass-card p-8"
                >
                    <h3 className="text-sm font-bold text-white mb-8 uppercase tracking-wider">Deposit Details</h3>

                    <div className="space-y-8">
                        <div>
                            <label className="block text-[10px] font-bold text-white/40 mb-3 uppercase tracking-widest">Selected Network</label>
                            <div className="flex gap-4">
                                <button
                                    onClick={() => setNetwork('mainnet')}
                                    className={`flex-1 py-4 px-4 rounded-xl border transition-all flex items-center justify-center text-xs font-bold uppercase tracking-wider ${network === 'mainnet'
                                        ? 'border-emerald-400 bg-emerald-400 text-black'
                                        : 'border-white/10 bg-white/5 text-white/40 hover:text-white hover:bg-white/10'
                                        }`}
                                >
                                    Stacks Mainnet
                                </button>
                                <button
                                    onClick={() => setNetwork('testnet')}
                                    className={`flex-1 py-4 px-4 rounded-xl border transition-all flex items-center justify-center text-xs font-bold uppercase tracking-wider ${network === 'testnet'
                                        ? 'border-amber-400 bg-amber-400 text-black'
                                        : 'border-white/10 bg-white/5 text-white/40 hover:text-white hover:bg-white/10'
                                        }`}
                                >
                                    Stacks Testnet
                                </button>
                            </div>
                        </div>

                        <div className="bg-black p-8 rounded-2xl border border-white/5 flex flex-col items-center justify-center">
                            <p className="text-white/40 mb-6 text-xs text-center leading-relaxed max-w-sm">
                                {network === 'testnet'
                                    ? "Deposit Testnet USDCx to sponsor gas for your users on Testnet."
                                    : "Deposit Mainnet USDCx to sponsor gas for your users on Mainnet."}
                            </p>
                            <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-lg px-5 py-3 w-full max-w-md justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-white/20 uppercase font-black">Target:</span>
                                    <code className="text-white text-xs truncate font-mono">{PAYMASTER_ADDRESS}.{PAYMASTER_CONTRACT}</code>
                                </div>
                                <button className="text-white/40 hover:text-white text-[10px] font-black uppercase tracking-widest px-3 py-1 bg-white/5 rounded transition-colors">Copy</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div
                className="glass-card p-8"
            >
                <div className="flex items-center gap-2 mb-10 text-white font-bold text-sm uppercase tracking-wider">
                    <History className="w-4 h-4 text-white/40" />
                    Deposit History
                </div>
                <div className="w-full text-center py-16 text-white/20 text-xs font-medium uppercase tracking-widest">
                    No transactions found on {network === 'testnet' ? 'Testnet' : 'Mainnet'}.
                </div>
            </div>
        </div>
    );
}

