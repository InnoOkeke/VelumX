'use client';

import React, { useState, useEffect, ReactNode } from 'react';
import { WalletContext } from './WalletContext';

export function WalletProvider({ children }: { children: ReactNode }) {
    const [userData, setUserData] = useState<any | null>(null);
    const [network, setNetwork] = useState<'mainnet' | 'testnet'>('testnet');
    const [userSession, setUserSession] = useState<any | null>(null);

    useEffect(() => {
        const initSession = async () => {
            if (typeof window !== 'undefined') {
                const { AppConfig, UserSession } = await import('@stacks/connect-react');
                const appConfig = new AppConfig(['store_write', 'publish_data']);
                const session = new UserSession({ appConfig });
                setUserSession(session);

                if (session.isUserSignedIn()) {
                    setUserData(session.loadUserData());
                }
            }
        };
        initSession();
    }, []);

    const login = async () => {
        if (!userSession) return;
        const { authenticate } = await import('@stacks/connect-react');
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

