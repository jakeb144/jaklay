'use client';
import { useAuth } from '@/lib/auth';
import AuthPage from './auth/page';
import Dashboard from '@/components/Dashboard';
import { useEffect, useState } from 'react';

export default function Home() {
  const { supabase, user, loading } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [checkingPlan, setCheckingPlan] = useState(true);

  useEffect(() => { setMounted(true); }, []);

  // After email verification lands here with a session, check for pending plan checkout
  useEffect(() => {
    if (!mounted || loading || !user) { setCheckingPlan(false); return; }
    const pendingPlan = localStorage.getItem('jaklay_pending_plan');
    if (!pendingPlan) { setCheckingPlan(false); return; }

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { setCheckingPlan(false); return; }
        const res = await fetch('/api/stripe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          body: JSON.stringify({ action: 'create_checkout', planId: pendingPlan }),
        });
        const data = await res.json();
        if (data.url) {
          localStorage.removeItem('jaklay_pending_plan');
          window.location.href = data.url;
          return;
        }
      } catch (e) { console.error('Auto-checkout error:', e); }
      localStorage.removeItem('jaklay_pending_plan');
      setCheckingPlan(false);
    })();
  }, [mounted, loading, user, supabase]);

  if (!mounted || loading || checkingPlan) return (
    <div style={{minHeight:'100vh',background:'#0a0a0a',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{width:40,height:40,border:'3px solid #333',borderTop:'3px solid #6366f1',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (!user) return <AuthPage />;
  return <Dashboard />;
}
