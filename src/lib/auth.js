'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { createBrowserClient } from './supabase';

const AuthContext = createContext({});

export function AuthProvider({ children }) {
  const [supabase] = useState(() => createBrowserClient());
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user || null);
      if (session?.user) await loadProfile(session.user.id);
      setLoading(false);
    };

    getSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setUser(session?.user || null);
      if (session?.user) await loadProfile(session.user.id);
      else setProfile(null);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  const loadProfile = async (userId) => {
    try {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
      if (error) console.error('Profile load error:', error);
      setProfile(data || { plan: 'free', enrichment_runs_used: 0, enrichment_runs_limit: 5 });
    } catch (e) {
      console.error('Profile load failed:', e);
      setProfile({ plan: 'free', enrichment_runs_used: 0, enrichment_runs_limit: 5 });
    }
  };

  const signUp = async (email, password, fullName) => {
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName } },
    });
    return { data, error };
  };

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    return { data, error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  };

  const refreshProfile = () => user && loadProfile(user.id);

  // Usage tracking
  const trackUsage = async (action, metadata = {}) => {
    if (!user) return;
    await supabase.from('usage_log').insert({
      user_id: user.id, action, ...metadata,
    });
  };

  const canRun = () => {
    if (!profile) return false;
    if (profile.plan === 'admin' || profile.plan === 'pro' || profile.plan === 'enterprise') return true;
    if (profile.plan === 'starter') return profile.enrichment_runs_used < 500;
    return profile.enrichment_runs_used < 5; // free tier
  };

  const incrementUsage = async (count = 1) => {
    if (!user || !profile) return;
    const newCount = (profile.enrichment_runs_used || 0) + count;
    await supabase.from('profiles').update({
      enrichment_runs_used: newCount,
      updated_at: new Date().toISOString(),
    }).eq('id', user.id);
    setProfile(prev => ({ ...prev, enrichment_runs_used: newCount }));
  };

  const value = {
    supabase, user, profile, loading,
    signUp, signIn, signOut, refreshProfile,
    trackUsage, canRun, incrementUsage,
    isAdmin: profile?.plan === 'admin',
    isPaid: ['starter', 'pro', 'enterprise', 'admin'].includes(profile?.plan),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
