'use client';

import React, { useState, useEffect, ReactNode } from 'react';
import { AppConfig, UserSession, showConnect } from '@stacks/connect';
import { WalletContext } from './WalletContext';

export function WalletProvider({ children }: { children: ReactNode }) {
    const [userData, setUserData] = useState<any | null>(null);
    const [network, setNetwork] = useState<'mainnet' | 'testnet'>('testnet');
    const [userSession, setUserSession] = useState<UserSession | null>(null);

    useEffect(() => {
        const appConfig = new AppConfig(['store_write', 'publish_data']);
        const session = new UserSession({ appConfig });
        setUserSession(session);

        if (session.isUserSignedIn()) {
            setUserData(session.loadUserData());
        }
    }, []);

    const login = async () => {
        if (!userSession) return;

        console.log("WalletProvider: Login triggered.");
        showConnect({
            appDetails: {
                name: 'SGAL Dashboard',
                icon: typeof window !== 'undefined' ? window.location.origin + '/favicon.ico' : '',
            },
            userSession,
            onFinish: () => {
                console.log("WalletProvider: Authentication finished.");
                setUserData(userSession.loadUserData());
            },
            onCancel: () => {
                console.log("WalletProvider: Authentication cancelled.");
            }
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
