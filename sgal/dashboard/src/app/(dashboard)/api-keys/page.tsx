'use client';



import { KeyRound, Plus, Copy, MoreVertical, ShieldAlert } from 'lucide-react';
// No motion here

import { useState, useEffect } from 'react';

import toast, { Toaster } from 'react-hot-toast';

const RELAYER_URL = process.env.NEXT_PUBLIC_SGAL_RELAYER_URL || 'http://localhost:4000';

export default function ApiKeysPage() {
    const [isClient, setIsClient] = useState(false);
    const [keys, setKeys] = useState<{ id: string; name: string; key: string; status: string; createdAt: string }[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);

    useEffect(() => {
        setIsClient(true);
        fetchKeys();
    }, []);

    if (!isClient) return null;

    const fetchKeys = async () => {
        try {
            const res = await fetch(`${RELAYER_URL}/api/dashboard/keys`);
            if (!res.ok) throw new Error('Failed to fetch keys');
            const data = await res.json();
            setKeys(data);
        } catch (error) {
            console.error('Error fetching keys:', error);
            toast.error('Could not reach Relayer. Please check your connection.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleGenerateKey = async () => {
        setIsGenerating(true);
        const toastId = toast.loading('Generating your new API key...');
        try {
            const res = await fetch(`${RELAYER_URL}/api/dashboard/keys`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: `Prod Key ${keys.length + 1}` })
            });

            if (res.ok) {
                await fetchKeys();
                toast.success('API Key generated successfully!', { id: toastId });
            } else {
                throw new Error('Server error');
            }
        } catch (error) {
            console.error('Error generating key:', error);
            toast.error('Failed to generate key. Is the Relayer running?', { id: toastId });
        } finally {
            setIsGenerating(false);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success('Copied to clipboard!');
    };


    return (
        <div className="space-y-8 pb-12">
            <Toaster position="top-right" />
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-white mb-2">API Keys</h1>
                    <p className="text-white/40 text-sm">Manage your secret keys for authenticating with the SGAL Relayer.</p>
                </div>

                <button
                    onClick={handleGenerateKey}
                    disabled={isGenerating}
                    className="flex items-center gap-2 px-6 py-2.5 bg-white text-black text-sm font-bold rounded-lg hover:bg-white/90 transition-all disabled:opacity-50"
                >
                    <Plus className="w-4 h-4" />
                    {isGenerating ? 'Generating...' : 'Generate New Key'}
                </button>
            </div>

            <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 flex gap-4">
                <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5 text-white/60" />
                <div className="text-sm">
                    <p className="font-bold text-white mb-1">Secret keys grant access to your paymaster balance.</p>
                    <p className="text-white/40">Never share your secret keys or expose them in client-side code. Use them only on your secure backend server.</p>
                </div>
            </div>

            <div
                className="glass-card overflow-hidden !rounded-xl"
            >
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-white/10 bg-white/[0.02]">
                                <th className="px-6 py-4 text-[10px] font-bold text-white/40 uppercase tracking-widest">Name</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-white/40 uppercase tracking-widest">Secret Key</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-white/40 uppercase tracking-widest">Status</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-white/40 uppercase tracking-widest">Created</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-white/40 uppercase tracking-widest text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-white/20 text-sm font-medium">
                                        Loading API keys...
                                    </td>
                                </tr>
                            ) : keys.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-white/20 text-sm font-medium">
                                        No API keys found. Generate one to get started.
                                    </td>
                                </tr>
                            ) : keys.map((k, i) => (
                                <tr key={k.id} className="hover:bg-white/[0.02] transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center border border-white/5">
                                                <KeyRound className="w-4 h-4 text-white/60" />
                                            </div>
                                            <span className="font-bold text-sm text-white">{k.name}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center gap-2">
                                            <code className="px-2 py-1 bg-black/40 rounded text-xs text-white/60 font-mono border border-white/5">{k.key}</code>
                                            <button
                                                onClick={() => copyToClipboard(k.key)}
                                                className="text-white/20 hover:text-white transition-colors p-1" title="Copy to clipboard">
                                                <Copy className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold border ${k.status === 'Active' ? 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20' : 'bg-rose-400/10 text-rose-400 border-rose-400/20'
                                            }`}>
                                            {k.status.toUpperCase()}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-xs text-white/40 font-mono">
                                        {new Date(k.createdAt).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <button className="text-white/20 hover:text-white transition-colors p-1">
                                            <MoreVertical className="w-5 h-5" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
