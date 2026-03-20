'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { createSupabaseClient } from '@/lib/supabase';
import { generateUserMnemonic, deriveWalletsFromMnemonic, encryptMnemonic, decryptMnemonic } from '@/lib/wallet';
import { PolyfillProvider } from "@/components/providers/PolyfillProvider";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: any | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = React.useMemo(() => createSupabaseClient(), []);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (event === 'SIGNED_IN' && session?.user) {
        await ensureProfile(session.user);
      } else if (event === 'SIGNED_OUT') {
        setProfile(null);
      }
      
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile(userId: string) {
    console.log('[AuthContext] Fetching existing profile for recovery...');
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (data) {
      // If we have a mnemonic, re-derive wallets to be sure they are in state
      if (data.mnemonic) {
        try {
          const decryptedMnemonic = await decryptMnemonic(data.mnemonic);
          const wallets = await deriveWalletsFromMnemonic(decryptedMnemonic);
          console.log('[AuthContext] Profile recovered with wallets:', { 
            eth: wallets.ethAddress, 
            stx: wallets.stacksAddress 
          });
          // Merge derived wallets into profile state for the UI
          setProfile({ ...data, eth_address: wallets.ethAddress, stx_address: wallets.stacksAddress });
        } catch (recoverError) {
          console.error('[AuthContext] Failed to recover wallets from saved mnemonic:', recoverError);
          setProfile(data);
        }
      } else {
        setProfile(data);
      }
    }
    setLoading(false);
  }

  async function ensureProfile(user: User) {
    console.log('[AuthContext] ensureProfile started for user:', user.id);
    setLoading(true);
    
    try {
      // 1. Check if profile exists
      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 is "no rows found"
        console.error('[AuthContext] Error fetching profile:', fetchError);
      }

      if (data) {
        console.log('[AuthContext] Profile found, setting state.');
        setProfile(data);
        setLoading(false);
        return;
      }

      console.log('[AuthContext] No profile found, proceeding to creation.');

      // 2. Try to generate wallets automatically
      let ethAddress: string | null = null;
      let stacksAddress: string | null = null;
      let mnemonic: string | null = null;

      try {
        console.log('[AuthContext] Generating wallets...');
        mnemonic = generateUserMnemonic();
        const wallets = await deriveWalletsFromMnemonic(mnemonic);
        ethAddress = wallets.ethAddress;
        stacksAddress = wallets.stacksAddress;
        console.log('[AuthContext] Wallets generated:', { ethAddress, stacksAddress });
      } catch (walletError) {
        console.error('[AuthContext] Wallet generation failed:', walletError);
      }

      // 3. Create profile
      let encryptedMnemonic: string | null = null;
      if (mnemonic) {
        console.log('[AuthContext] Encrypting mnemonic for storage...');
        encryptedMnemonic = await encryptMnemonic(mnemonic);
      }

      console.log('[AuthContext] Inserting profile into database...');
      const profileData = { 
        id: user.id, 
        email: user.email, 
        eth_address: ethAddress, 
        stx_address: stacksAddress,
        mnemonic: encryptedMnemonic
      };
      
      const { data: newProfile, error: createError } = await supabase
        .from('profiles')
        .insert([profileData])
        .select()
        .single();

      if (createError) {
        console.error('[AuthContext] Error inserting profile:', createError);
        console.error('[AuthContext] Error details:', {
          code: createError.code,
          message: createError.message,
          details: createError.details
        });
      } else {
        console.log('[AuthContext] Profile created successfully:', newProfile);
        setProfile(newProfile);
      }
    } catch (err) {
      console.error('[AuthContext] Unexpected error in ensureProfile:', err);
    } finally {
      setLoading(false);
    }
  }

  const signOut = async () => {
    try {
      setLoading(true);
      await supabase.auth.signOut();
      // Manually clear state to ensure UI updates immediately
      setSession(null);
      setUser(null);
      setProfile(null);
      console.log('Signed out successfully');
      // Optional: Refresh to clear any other state
      window.location.href = '/';
    } catch (error) {
      console.error('Error signing out:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
