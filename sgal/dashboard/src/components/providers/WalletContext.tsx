'use client';

import { createContext, useContext } from 'react';

export interface WalletContextType {
    userSession: any | null;
    userData: any | null;
    isLoggedIn: boolean;
    login: () => void;
    logout: () => void;
    stxAddress: string | null;
    network: 'mainnet' | 'testnet';
    setNetwork: (n: 'mainnet' | 'testnet') => void;
}

export const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function useWallet() {
    const context = useContext(WalletContext);
    if (context === undefined) {
        throw new Error('useWallet must be used within a WalletProvider');
    }
    return context;
}
