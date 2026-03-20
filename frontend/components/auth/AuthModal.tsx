'use client';

import React, { useState } from 'react';
import { createSupabaseClient } from '@/lib/supabase';

export function AuthModal() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const supabase = createSupabaseClient();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    const { data, error } = isSignUp 
      ? await supabase.auth.signUp({ 
          email, 
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          }
        })
      : await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSuccess(true);
      setLoading(false);
      // If it's a login, the AuthContext will handle state change and UI will update
      // If it's a signup, they might need to confirm email
      if (isSignUp && data?.user && !data.session) {
        setSuccess(true); // User created but needs email confirmation
      }
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-slate-900/50 backdrop-blur-xl rounded-2xl border border-slate-800 w-full max-w-md mx-auto shadow-2xl shadow-indigo-500/10">
      <h2 className="text-2xl font-bold text-white mb-6 uppercase tracking-wider">
        {isSignUp ? 'Create Account' : 'Welcome Back'}
      </h2>
      
      <form onSubmit={handleAuth} className="w-full space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase mb-1 ml-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-slate-950/50 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
            placeholder="user@example.com"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase mb-1 ml-1">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-slate-950/50 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
            placeholder="••••••••"
            required
          />
        </div>
        
        {error && <p className="text-rose-500 text-sm font-medium">{error}</p>}
        {success && (
          <div className="bg-emerald-500/10 border border-emerald-500/50 rounded-lg p-3">
            <p className="text-emerald-500 text-sm font-medium text-center">
              {isSignUp 
                ? "Signup successful! Please check your email for a confirmation link." 
                : "Signin successful! Redirecting..."}
            </p>
          </div>
        )}
        
        {!success && (
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-lg shadow-lg shadow-indigo-600/30 transition-all transform hover:scale-[1.02] disabled:opacity-50 active:scale-95"
          >
            {loading ? 'Processing...' : isSignUp ? 'SIGN UP' : 'SIGN IN'}
          </button>
        )}
      </form>
      
      {!success && (
        <button
          onClick={() => setIsSignUp(!isSignUp)}
          className="mt-6 text-indigo-400 hover:text-indigo-300 text-sm font-medium transition-colors"
        >
          {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
        </button>
      )}

      <p className="mt-8 text-[10px] text-slate-500 uppercase tracking-tighter text-center max-w-[200px]">
        No wallet needed. We'll generate an Ethereum and Stacks address for you automatically.
      </p>
    </div>
  );
}
