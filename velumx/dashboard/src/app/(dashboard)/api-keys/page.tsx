'use client';

import { useState, useEffect } from 'react';
import {
    KeyRound,
    Plus,
    Copy,
    Trash2,
    ShieldAlert,
    Eye,
    EyeOff
} from 'lucide-react';
import toast from 'react-hot-toast';

interface ApiKey {
    id: string;
    name: string;
    key: string;
    lastUsedAt: string | null;
    createdAt: string;
}

export default function ApiKeysPage() {
    const [isClient, setIsClient] = useState(false);
    const [keys, setKeys] = useState<ApiKey[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    const [showNewKeyModal, setShowNewKeyModal] = useState(false);
    const [newKeyName, setNewKeyName] = useState('');
    const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
    const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());

    const fetchKeys = async () => {
        try {
            const res = await fetch('/api/keys');
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                console.error('Server Side Error:', errorData);
                throw new Error(errorData.message || errorData.error || 'Failed to fetch keys');
            }
            const data = await res.json();
            setKeys(Array.isArray(data.apiKeys) ? data.apiKeys : []);
        } catch (error: any) {
            console.error('Error fetching keys:', error);
            toast.error(error.message || 'Failed to load API keys');
        } finally {
            setIsLoading(false);
        }
    };

    const handleGenerateKey = async () => {
        if (!newKeyName.trim()) {
            toast.error('Please enter a key name');
            return;
        }

        setIsGenerating(true);
        const toastId = toast.loading('Generating your new API key...');
        try {
            const res = await fetch('/api/keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newKeyName.trim() })
            });

            if (res.ok) {
                const data = await res.json();
                setNewlyCreatedKey(data.apiKey.key);
                await fetchKeys();
                toast.success('API Key generated successfully!', { id: toastId });
                setNewKeyName('');
            } else {
                const error = await res.json();
                throw new Error(error.error || 'Server error');
            }
        } catch (error: any) {
            console.error('Error generating key:', error);
            toast.error(error.message || 'Failed to generate key', { id: toastId });
        } finally {
            setIsGenerating(false);
        }
    };

    const handleRevokeKey = async (id: string, name: string) => {
        if (!confirm(`Are you sure you want to revoke "${name}"? This action cannot be undone.`)) {
            return;
        }

        const toastId = toast.loading('Revoking API key...');
        try {
            const res = await fetch(`/api/keys/${id}`, {
                method: 'DELETE',
            });

            if (res.ok) {
                await fetchKeys();
                toast.success('API key revoked successfully', { id: toastId });
            } else {
                throw new Error('Failed to revoke key');
            }
        } catch (error) {
            console.error('Error revoking key:', error);
            toast.error('Failed to revoke key', { id: toastId });
        }
    };

    const toggleKeyVisibility = (keyId: string) => {
        setVisibleKeys(prev => {
            const newSet = new Set(prev);
            if (newSet.has(keyId)) {
                newSet.delete(keyId);
            } else {
                newSet.add(keyId);
            }
            return newSet;
        });
    };

    const maskKey = (key: string) => {
        return `${key.substring(0, 8)}${'•'.repeat(48)}${key.substring(key.length - 8)}`;
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success('Copied to clipboard!');
    };

    useEffect(() => {
        setIsClient(true);
        fetchKeys();
    }, []);

    if (!isClient) return null;

    return (
        <div className="space-y-8 pb-12">
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-white mb-2">API Keys</h1>
                    <p className="text-white/40 text-sm">Manage your secret keys for authenticating with VelumX SDK.</p>
                </div>

                <button
                    onClick={() => setShowNewKeyModal(true)}
                    className="flex items-center gap-2 px-6 py-2.5 bg-white text-black text-sm font-bold rounded-lg hover:bg-white/90 transition-all"
                >
                    <Plus className="w-4 h-4" />
                    Generate New Key
                </button>
            </div>

            <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 flex gap-4">
                <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5 text-white/60" />
                <div className="text-sm">
                    <p className="font-bold text-white mb-1">Secret keys grant access to your paymaster infrastructure.</p>
                    <p className="text-white/40">Never share your secret keys or expose them in client-side code. Use them only on your secure backend server.</p>
                </div>
            </div>

            {newlyCreatedKey && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-6">
                    <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                            <KeyRound className="w-5 h-5 text-emerald-400" />
                        </div>
                        <div className="flex-1">
                            <h3 className="font-bold text-white mb-2">Your new API key</h3>
                            <p className="text-sm text-white/60 mb-4">
                                Make sure to copy your API key now. You won't be able to see it again!
                            </p>
                            <div className="flex items-center gap-2">
                                <code className="flex-1 px-4 py-3 bg-black/40 rounded-lg text-sm text-white font-mono border border-white/10">
                                    {newlyCreatedKey}
                                </code>
                                <button
                                    onClick={() => copyToClipboard(newlyCreatedKey)}
                                    className="px-4 py-3 bg-white text-black rounded-lg hover:bg-white/90 transition-colors flex items-center gap-2 font-bold text-sm"
                                >
                                    <Copy className="w-4 h-4" />
                                    Copy
                                </button>
                            </div>
                            <button
                                onClick={() => setNewlyCreatedKey(null)}
                                className="mt-4 text-sm text-white/40 hover:text-white transition-colors"
                            >
                                I've saved my key
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showNewKeyModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-[#0a0a0a] border border-white/10 rounded-xl p-6 max-w-md w-full">
                        <h3 className="text-xl font-bold text-white mb-4">Generate New API Key</h3>
                        <div className="space-y-4">
                            <div>
                                <label htmlFor="keyName" className="block text-sm font-medium text-white/60 mb-2">
                                    Key Name
                                </label>
                                <input
                                    id="keyName"
                                    type="text"
                                    value={newKeyName}
                                    onChange={(e) => setNewKeyName(e.target.value)}
                                    placeholder="Production API Key"
                                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/20"
                                    autoFocus
                                />
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => {
                                        setShowNewKeyModal(false);
                                        setNewKeyName('');
                                    }}
                                    className="flex-1 px-4 py-2 bg-white/5 text-white rounded-lg hover:bg-white/10 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => {
                                        handleGenerateKey();
                                        setShowNewKeyModal(false);
                                    }}
                                    disabled={isGenerating || !newKeyName.trim()}
                                    className="flex-1 px-4 py-2 bg-white text-black rounded-lg hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-bold"
                                >
                                    {isGenerating ? 'Generating...' : 'Generate'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="glass-card overflow-hidden !rounded-xl">
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
                            ) : keys.map((k) => (
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
                                            <code className="px-2 py-1 bg-black/40 rounded text-xs text-white/60 font-mono border border-white/5">
                                                {k.key}
                                            </code>
                                            <button
                                                onClick={() => copyToClipboard(k.key)}
                                                className="text-white/20 hover:text-white transition-colors p-1"
                                                title="Copy to clipboard"
                                            >
                                                <Copy className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold border bg-emerald-400/10 text-emerald-400 border-emerald-400/20">
                                            ACTIVE
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-xs text-white/40 font-mono">
                                        {new Date(k.createdAt).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <button 
                                            onClick={() => handleRevokeKey(k.id, k.name)}
                                            className="text-white/20 hover:text-rose-400 transition-colors p-1"
                                            title="Revoke key"
                                        >
                                            <Trash2 className="w-4 h-4" />
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
