'use client';
import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { createBrowserClient } from './supabase';
import { getPlanLimits } from './plans';

const AuthContext = createContext({});
const supabase = createBrowserClient();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const loadingProfile = useRef(false);

  const loadProfile = async (u) => {
    if (loadingProfile.current) return;
    loadingProfile.current = true;
    try {
      const { data } = await supabase.from('profiles').select('*').eq('id', u.id).maybeSingle();
      if (data) {
        setProfile(data);
      } else {
        const freeLimits = getPlanLimits('free');
        const { data: created } = await supabase.from('profiles').upsert({
          id: u.id, email: u.email, plan: 'free',
          enrichment_runs_used: 0, enrichment_runs_limit: freeLimits.runs, row_limit: freeLimits.rows
        }, { onConflict: 'id' }).select().single();
        setProfile(created || { plan: 'free', enrichment_runs_used: 0, enrichment_runs_limit: freeLimits.runs, row_limit: freeLimits.rows });
      }
    } catch (e) {
      const fallbackLimits = getPlanLimits('free');
      setProfile({ plan: 'free', enrichment_runs_used: 0, enrichment_runs_limit: fallbackLimits.runs, row_limit: fallbackLimits.rows });
    } finally {
      loadingProfile.current = false;
      setLoading(false);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user || null;
      setUser(u);
      if (u) {
        loadProfile(u);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  };

  const isAdmin = profile?.plan === 'admin';
  const isPaid = ['starter','pro','enterprise','admin'].includes(profile?.plan);
  const canRun = () => {
    if (!profile) return true;
    if (isAdmin) return true;
    const limits = getPlanLimits(profile.plan);
    return (profile.enrichment_runs_used || 0) < limits.runs;
  };

  return (
    <AuthContext.Provider value={{ supabase, user, profile, loading, signOut, canRun, isAdmin, isPaid }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
