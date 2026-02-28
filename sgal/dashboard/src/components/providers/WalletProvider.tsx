'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import { AppConfig, UserSession, authenticate } from '@stacks/connect-react';
import { STACKS_TESTNET } from '@stacks/network';

interface WalletContextType {
    userSession: UserSession | null;
    userData: any | null;
    isLoggedIn: boolean;
    login: () => void;
    logout: () => void;
    stxAddress: string | null;
    network: 'mainnet' | 'testnet';
    setNetwork: (n: 'mainnet' | 'testnet') => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
    const [userData, setUserData] = useState<any | null>(null);
    const [network, setNetwork] = useState<'mainnet' | 'testnet'>('testnet');

    // Memoize the UserSession and AppConfig to be client-side only
    const userSession = useMemo(() => {
        if (typeof window !== 'undefined') {
            const appConfig = new AppConfig(['store_write', 'publish_data']);
            return new UserSession({ appConfig });
        }
        return null;
    }, []);

    useEffect(() => {
        if (userSession && userSession.isUserSignedIn()) {
            setUserData(userSession.loadUserData());
        }
    }, [userSession]);

    const login = () => {
        if (!userSession) return;
        authenticate({
            appDetails: {
                name: 'SGAL Dashboard',
                icon: window.location.origin + '/favicon.ico',
            },
            userSession,
            onFinish: () => {
                setUserData(userSession.loadUserData());
            },
        });
    };

    const logout = () => {
        if (!userSession) return;
        userSession.signUserOut();
        setUserData(null);
    };

    const stxAddress = network === 'testnet'
        ? userData?.profile?.stxAddress?.testnet
        : userData?.profile?.stxAddress?.mainnet || null;

    return (
        <WalletContext.Provider value={{
            userSession,
            userData,
            isLoggedIn: !!userData,
            login,
            logout,
            stxAddress,
            network,
            setNetwork
        }}>
            {children}
        </WalletContext.Provider>
    );
}

export function useWallet() {
    const context = useContext(WalletContext);
    if (context === undefined) {
        throw new Error('useWallet must be used within a WalletProvider');
    }
    return context;
}
