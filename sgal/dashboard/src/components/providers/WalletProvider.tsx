'use client';

import React, { useState, useEffect, ReactNode } from 'react';
import { WalletContext } from './WalletContext';

export function WalletProvider({ children }: { children: ReactNode }) {
    const [userData, setUserData] = useState<any | null>(null);
    const [network, setNetwork] = useState<'mainnet' | 'testnet'>('testnet');
    const [userSession, setUserSession] = useState<any | null>(null);

    useEffect(() => {
        const initSession = async () => {
            console.log("WalletProvider: Initializing session...");
            if (typeof window !== 'undefined') {
                try {
                    const { AppConfig, UserSession } = await import('@stacks/connect-react');
                    const appConfig = new AppConfig(['store_write', 'publish_data']);
                    const session = new UserSession({ appConfig });
                    setUserSession(session);
                    console.log("WalletProvider: Session initialized.");

                    if (session.isUserSignedIn()) {
                        setUserData(session.loadUserData());
                    }
                } catch (err) {
                    console.error("WalletProvider: Failed to initialize session:", err);
                }
            }
        };
        initSession();
    }, []);

    const login = async () => {
        console.log("WalletProvider: Login triggered. current userSession exists:", !!userSession);

        try {
            const { authenticate, AppConfig, UserSession } = await import('@stacks/connect-react');

            // If session is still missing (very unlikely at this point but safe), init it now
            let session = userSession;
            if (!session) {
                console.log("WalletProvider: Initializing session on-the-fly during login...");
                const appConfig = new AppConfig(['store_write', 'publish_data']);
                session = new UserSession({ appConfig });
                setUserSession(session);
            }

            console.log("WalletProvider: Calling authenticate...");
            authenticate({
                appDetails: {
                    name: 'SGAL Dashboard',
                    icon: window.location.origin + '/favicon.ico',
                },
                userSession: session,
                onFinish: () => {
                    console.log("WalletProvider: Authentication finished.");
                    setUserData(session.loadUserData());
                },
                onCancel: () => {
                    console.log("WalletProvider: Authentication cancelled.");
                }
            });
        } catch (err) {
            console.error("WalletProvider: Authentication error:", err);
        }
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

