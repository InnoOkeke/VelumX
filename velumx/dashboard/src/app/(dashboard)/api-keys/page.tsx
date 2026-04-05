'use client';

import { useState, useEffect } from 'react';
import {
    KeyRound,
    Plus,
    Copy,
    Trash2,
    ShieldAlert,
    Eye,
    EyeOff,
    Wallet,
    ExternalLink,
    Lock,
    Settings,
    Activity,
    DollarSign,
    Users,
    X
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useWallet } from '@/components/providers/WalletContext';

interface ApiKey {
    id: string;
    name: string;
    key: string;
    sponsorshipPolicy: 'USER_PAYS' | 'DEVELOPER_SPONSORS';
    markupPercentage: number;
    maxSponsoredTxsPerUser: number;
    monthlyLimitUsd: number;
    supportedGasTokens?: string[];
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
    const { network: currentNetwork } = useWallet();
    const [relayerInfo, setRelayerInfo] = useState<{ mainnetAddress: string; testnetAddress: string; key: string } | null>(null);
    const [isRelayerKeyVisible, setIsRelayerKeyVisible] = useState(false);
    const [isLoadingRelayer, setIsLoadingRelayer] = useState(true);
    const [editingKey, setEditingKey] = useState<ApiKey | null>(null);
    const [isUpdating, setIsUpdating] = useState(false);
    const [customToken, setCustomToken] = useState('');

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

    const handleUpdateKey = async (id: string, updates: Partial<ApiKey>) => {
        setIsUpdating(true);
        const toastId = toast.loading('Updating settings...');
        try {
            const res = await fetch(`/api/keys/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates)
            });

            if (res.ok) {
                await fetchKeys();
                toast.success('Settings updated successfully', { id: toastId });
                setEditingKey(null);
            } else {
                throw new Error('Failed to update settings');
            }
        } catch (error: any) {
            console.error('Error updating key:', error);
            toast.error(error.message || 'Failed to update settings', { id: toastId });
        } finally {
            setIsUpdating(false);
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

    const fetchRelayerInfo = async () => {
        try {
            const res = await fetch('/api/relayer/export');
            if (res.ok) {
                const data = await res.json();
                setRelayerInfo(data);
            }
        } catch (error) {
            console.error('Error fetching relayer info:', error);
        } finally {
            setIsLoadingRelayer(false);
        }
    };

    useEffect(() => {
        setIsClient(true);
        fetchKeys();
        fetchRelayerInfo();
    }, [currentNetwork]);

    if (!isClient) return null;

    return (
        <div className="space-y-8 pb-12">
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-white mb-2">API Keys</h1>
                    <p className="text-white/40 text-sm">Manage your secret keys for authenticating with VelumX SDK.</p>
                </div>

                <div className="flex items-center gap-4">
                    <div className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg flex flex-col items-end">
                        <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">KEYS USED</span>
                        <span className="text-sm font-bold text-white">{keys.length} <span className="text-white/20">/ 5</span></span>
                    </div>

                    <button
                        onClick={() => setShowNewKeyModal(true)}
                        disabled={keys.length >= 5}
                        className="flex items-center gap-2 px-6 py-2.5 bg-white text-black text-sm font-bold rounded-lg hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all h-full"
                    >
                        <Plus className="w-4 h-4" />
                        Generate New Key
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Security Warning */}
                <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6 flex gap-4 h-full">
                    <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5 text-white/60" />
                    <div>
                        <h3 className="font-bold text-white mb-2">Keep your keys secure</h3>
                        <p className="text-sm text-white/40 leading-relaxed">
                            Secret keys grant access to your paymaster infrastructure. 
                            Never share your secret keys or expose them in client-side code. 
                            Use them only on your secure backend server.
                        </p>
                    </div>
                </div>

                {/* Relayer Wallet Info */}
                <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6 flex flex-col h-full">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center border border-white/10">
                            <Wallet className="w-5 h-5 text-white/60" />
                        </div>
                        <div>
                            <h3 className="font-bold text-white">Relayer Wallet</h3>
                            <p className="text-[10px] text-white/40 uppercase tracking-widest font-bold">Your Gas Deposit Address</p>
                        </div>
                    </div>

                    {isLoadingRelayer ? (
                        <div className="h-20 animate-pulse bg-white/5 rounded-lg mb-4" />
                    ) : relayerInfo ? (
                        <div className="space-y-4">
                            <div>
                                <div className="flex justify-between items-center mb-1.5 px-1">
                                    <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{currentNetwork} ADDRESS</span>
                                    <a 
                                        href={`https://explorer.hiro.so/address/${currentNetwork === 'mainnet' ? relayerInfo.mainnetAddress : relayerInfo.testnetAddress}?chain=${currentNetwork}`}
                                        target="_blank"
                                        className="text-[10px] font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1"
                                    >
                                        VERIFY ON EXPLORER <ExternalLink className="w-2.5 h-2.5" />
                                    </a>
                                </div>
                                <div className="flex items-center gap-2 group">
                                    <code className="flex-1 px-3 py-2 bg-black/40 rounded-lg text-xs text-white/60 font-mono border border-white/5 truncate">
                                        {currentNetwork === 'mainnet' ? relayerInfo.mainnetAddress : relayerInfo.testnetAddress}
                                    </code>
                                    <button
                                        onClick={() => copyToClipboard(currentNetwork === 'mainnet' ? relayerInfo.mainnetAddress : relayerInfo.testnetAddress)}
                                        className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-white/20 hover:text-white transition-all border border-white/5"
                                    >
                                        <Copy className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>

                            <div>
                                <div className="flex justify-between items-center mb-1.5 px-1">
                                    <span className="text-[10px] font-bold text-white/40">SECRET PRIVATE KEY</span>
                                    <span className="text-[10px] font-bold text-rose-400/60 uppercase">Warning: Key revealed on screen</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 relative">
                                        <code className="block w-full px-3 py-2 bg-black/40 rounded-lg text-xs text-white/60 font-mono border border-white/5 truncate">
                                            {isRelayerKeyVisible ? relayerInfo.key : '••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••'}
                                        </code>
                                        {!isRelayerKeyVisible && (
                                            <div className="absolute inset-x-0 inset-y-0 bg-black/10 backdrop-blur-[1px] flex items-center justify-center rounded-lg">
                                                <Lock className="w-3 h-3 text-white/10" />
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => setIsRelayerKeyVisible(!isRelayerKeyVisible)}
                                        className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-white/20 hover:text-white transition-all border border-white/5"
                                    >
                                        {isRelayerKeyVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                    </button>
                                    <button
                                        onClick={() => copyToClipboard(relayerInfo.key)}
                                        className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-white/20 hover:text-white transition-all border border-white/5"
                                    >
                                        <Copy className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                                <p className="text-[10px] text-white/20 mt-2 px-1 italic">
                                    * Use this key to export your funds to Leather or Xverse at any time.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-lg text-xs text-rose-400">
                            Failed to load relayer wallet. Please check your relayer connection.
                        </div>
                    )}
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
                                        <div className="flex items-center justify-end gap-2">
                                            <button 
                                                onClick={() => setEditingKey(k)}
                                                className="text-white/20 hover:text-white transition-colors p-1"
                                                title="Sponsorship Settings"
                                            >
                                                <Settings className="w-4 h-4" />
                                            </button>
                                            <button 
                                                onClick={() => handleRevokeKey(k.id, k.name)}
                                                className="text-white/20 hover:text-rose-400 transition-colors p-1"
                                                title="Revoke key"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Config Modal */}
            {editingKey && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
                        {/* Header */}
                        <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
                            <div>
                                <h3 className="text-lg font-bold text-white">Sponsorship Settings</h3>
                                <p className="text-xs text-white/40">{editingKey.name}</p>
                            </div>
                            <button onClick={() => setEditingKey(null)} className="p-2 hover:bg-white/5 rounded-lg text-white/20 hover:text-white transition-all">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-6 space-y-6">
                            {/* Policy Toggle */}
                            <div className="space-y-3">
                                <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest px-1">Sponsorship Policy</label>
                                <div className="grid grid-cols-2 gap-2 bg-white/5 p-1 rounded-xl border border-white/5">
                                    <button
                                        onClick={() => setEditingKey({...editingKey, sponsorshipPolicy: 'DEVELOPER_SPONSORS'})}
                                        className={`px-4 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                                            editingKey.sponsorshipPolicy === 'DEVELOPER_SPONSORS' 
                                            ? 'bg-white text-black shadow-lg' 
                                            : 'text-white/40 hover:text-white'
                                        }`}
                                    >
                                        <Activity className="w-3.5 h-3.5" />
                                        Dev Sponsors
                                    </button>
                                    <button
                                        onClick={() => setEditingKey({...editingKey, sponsorshipPolicy: 'USER_PAYS'})}
                                        className={`px-4 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                                            editingKey.sponsorshipPolicy === 'USER_PAYS' 
                                            ? 'bg-white text-black shadow-lg' 
                                            : 'text-white/40 hover:text-white'
                                        }`}
                                    >
                                        <Users className="w-3.5 h-3.5" />
                                        User Pays
                                    </button>
                                </div>
                                <p className="text-[10px] text-white/20 px-1 italic">
                                    {editingKey.sponsorshipPolicy === 'DEVELOPER_SPONSORS' 
                                        ? "* You will pay STX gas for your users automatically." 
                                        : `* Users will pay fees in ${editingKey.supportedGasTokens?.join(', ') || 'Tokens'}. You will collect the markup.`}
                                </p>
                            </div>

                            {/* Token Selection (New) */}
                            {editingKey.sponsorshipPolicy === 'USER_PAYS' && (
                                <div className="space-y-3">
                                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest px-1">Supported Gas Tokens</label>
                                    <div className="flex flex-wrap gap-2">
                                        {['sBTC', 'aUSD', 'ALEX', 'aBTC'].map((token) => (
                                            <button
                                                key={token}
                                                onClick={() => {
                                                    const current = editingKey.supportedGasTokens || [];
                                                    const updated = current.includes(token)
                                                        ? current.length > 1 ? current.filter(t => t !== token) : current
                                                        : [...current, token];
                                                    setEditingKey({...editingKey, supportedGasTokens: updated});
                                                }}
                                                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border ${
                                                    (editingKey.supportedGasTokens || ['USDCx']).includes(token)
                                                    ? 'bg-white text-black border-white shadow-lg'
                                                    : 'bg-white/5 text-white/40 border-white/5 hover:border-white/20'
                                                }`}
                                            >
                                                {token}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="flex gap-2 mt-2">
                                        <input
                                            type="text"
                                            value={customToken}
                                            onChange={(e) => setCustomToken(e.target.value)}
                                            placeholder="SP...token-name"
                                            className="flex-1 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-[10px] text-white focus:outline-none focus:ring-1 focus:ring-white/20"
                                        />
                                        <button
                                            onClick={() => {
                                                if (!customToken.includes('.')) {
                                                    toast.error('Invalid contract principal (e.g. SP...token-name)');
                                                    return;
                                                }
                                                const current = editingKey.supportedGasTokens || ['USDCx'];
                                                if (current.includes(customToken)) return;
                                                setEditingKey({...editingKey, supportedGasTokens: [...current, customToken]});
                                                setCustomToken('');
                                            }}
                                            className="px-3 py-1.5 bg-white/10 text-white text-[10px] font-bold rounded-lg hover:bg-white/20 transition-all"
                                        >
                                            Add
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                {/* Limits Area */}
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest px-1">Free Txs / User</label>
                                        <div className="relative">
                                            <Activity className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/20" />
                                            <input
                                                type="number"
                                                value={editingKey.maxSponsoredTxsPerUser}
                                                onChange={(e) => setEditingKey({...editingKey, maxSponsoredTxsPerUser: parseInt(e.target.value) || 0})}
                                                disabled={editingKey.sponsorshipPolicy === 'USER_PAYS'}
                                                className="w-full pl-9 pr-4 py-2.5 bg-white/5 border border-white/5 rounded-xl text-sm text-white focus:outline-none focus:border-white/20 transition-all disabled:opacity-20"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest px-1">Monthly Budget (USD)</label>
                                        <div className="relative">
                                            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/20" />
                                            <input
                                                type="number"
                                                value={editingKey.monthlyLimitUsd}
                                                onChange={(e) => setEditingKey({...editingKey, monthlyLimitUsd: parseFloat(e.target.value) || 0})}
                                                className="w-full pl-9 pr-4 py-2.5 bg-white/5 border border-white/5 rounded-xl text-sm text-white focus:outline-none focus:border-white/20 transition-all"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Revenue Area */}
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest px-1">Markup Percentage</label>
                                        <div className="relative">
                                            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-white/20">%</div>
                                            <input
                                                type="number"
                                                value={editingKey.markupPercentage}
                                                onChange={(e) => setEditingKey({...editingKey, markupPercentage: parseInt(e.target.value) || 0})}
                                                disabled={editingKey.sponsorshipPolicy === 'DEVELOPER_SPONSORS'}
                                                className="w-full px-4 py-2.5 bg-white/5 border border-white/5 rounded-xl text-sm text-white focus:outline-none focus:border-white/20 transition-all font-mono disabled:opacity-20"
                                            />
                                        </div>
                                    </div>
                                    <div className="p-4 bg-white/[0.02] border border-white/5 rounded-xl flex items-center justify-center">
                                        <div className="text-center">
                                            <div className="text-[10px] font-bold text-white/20 uppercase mb-1">Fee Model</div>
                                            <div className="text-xs font-bold text-emerald-400">
                                                {editingKey.sponsorshipPolicy === 'DEVELOPER_SPONSORS' ? 'Freemium' : 'Direct Pay'}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 bg-white/[0.02] border-t border-white/5 flex gap-3">
                            <button
                                onClick={() => setEditingKey(null)}
                                className="flex-1 px-4 py-2.5 bg-white/5 text-white/60 text-xs font-bold rounded-xl hover:bg-white/10 transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleUpdateKey(editingKey.id, editingKey)}
                                disabled={isUpdating}
                                className="flex-1 px-4 py-2.5 bg-white text-black text-xs font-bold rounded-xl hover:bg-white/90 transition-all disabled:opacity-50"
                            >
                                {isUpdating ? 'Saving...' : 'Save Settings'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
