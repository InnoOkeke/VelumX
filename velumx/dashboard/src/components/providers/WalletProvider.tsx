'use client';

import React, { useState, useEffect, useCallback, ReactNode } from 'react';
import { WalletContext } from './WalletContext';

export function WalletProvider({ children }: { children: ReactNode }) {
    const [userData, setUserData] = useState<any | null>(null);
    const [network, setNetwork] = useState<'mainnet' | 'testnet'>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('velumx_network');
            return (saved === 'mainnet' || saved === 'testnet') ? saved : 'mainnet';
        }
        return 'mainnet';
    });
    const [userSession, setUserSession] = useState<any | null>(null);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('velumx_network', network);
        }
    }, [network]);

    useEffect(() => {
        // Lazy-load @stacks/connect at runtime to avoid Turbopack
        // module factory errors during SSR/build
        import('@stacks/connect').then(({ AppConfig, UserSession }) => {
            const appConfig = new AppConfig(['store_write', 'publish_data']);
            const session = new UserSession({ appConfig });
            setUserSession(session);

            if (session.isUserSignedIn()) {
                setUserData(session.loadUserData());
            }
        });
    }, []);

    const login = useCallback(async () => {
        if (!userSession) return;

        console.log("WalletProvider: Login triggered.");
        const { showConnect } = await import('@stacks/connect');
        showConnect({
            appDetails: {
                name: 'VelumX Dashboard',
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
    }, [userSession]);

    const logout = useCallback(() => {
        if (!userSession) return;
        userSession.signUserOut();
        setUserData(null);
    }, [userSession]);

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
