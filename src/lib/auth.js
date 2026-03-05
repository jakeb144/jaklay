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
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user || null;
      setUser(u);
      if (u) loadProfile(u);
      else setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user || null;
      setUser(u);
      if (u) loadProfile(u);
      else { setProfile(null); setLoading(false); }
    });
    return () => subscription.unsubscribe();
  }, []);

  const loadProfile = async (u) => {
    try {
      const { data } = await supabase.from('profiles').select('*').eq('id', u.id).maybeSingle();
      if (data) { setProfile(data); }
      else {
        const { data: created } = await supabase.from('profiles').upsert({
          id: u.id, email: u.email, plan: 'free',
          enrichment_runs_used: 0, enrichment_runs_limit: 5, row_limit: 100
        }, { onConflict: 'id' }).select().single();
        setProfile(created || { plan: 'free', enrichment_runs_used: 0, enrichment_runs_limit: 5 });
      }
    } catch (e) {
      console.error('Profile error:', e);
      setProfile({ plan: 'free', enrichment_runs_used: 0, enrichment_runs_limit: 5 });
    }
    setLoading(false);
  };

  const signUp = async (email, password, fullName) => {
    return await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
  };
  const signIn = async (email, password) => {
    return await supabase.auth.signInWithPassword({ email, password });
  };
  const signOut = async () => { await supabase.auth.signOut(); setUser(null); setProfile(null); };

  const canRun = () => {
    if (!profile) return true;
    if (['admin','pro','enterprise'].includes(profile.plan)) return true;
    return (profile.enrichment_runs_used || 0) < (profile.enrichment_runs_limit || 5);
  };

  const isAdmin = profile?.plan === 'admin';
  const isPaid = ['starter','pro','enterprise','admin'].includes(profile?.plan);

  return (
    <AuthContext.Provider value={{ supabase, user, profile, loading, signUp, signIn, signOut, canRun, isAdmin, isPaid }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
