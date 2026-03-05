'use client';
import { useState, useEffect } from 'react';
import { createBrowserClient } from '@/lib/supabase';

const supabase = createBrowserClient();

export default function AuthPage() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingPlan, setPendingPlan] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const plan = params.get('plan');
    if (plan) {
      setPendingPlan(plan);
      setMode('signup');
      try { localStorage.setItem('jaklay_pending_plan', plan); } catch (e) {}
    } else {
      try {
        const stored = localStorage.getItem('jaklay_pending_plan');
        if (stored) setPendingPlan(stored);
      } catch (e) {}
    }
  }, []);

  const startCheckout = async (planId) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return false;
      const res = await fetch('/api/stripe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: 'create_checkout', planId }),
      });
      const data = await res.json();
      if (data.url) {
        try { localStorage.removeItem('jaklay_pending_plan'); } catch (e) {}
        window.location.href = data.url;
        return true;
      }
    } catch (e) { console.error('Checkout error:', e); }
    return false;
  };

  const handle = async () => {
    setError(''); setLoading(true);
    try {
      if (mode === 'login') {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) { setError(err.message); setLoading(false); return; }
        if (pendingPlan) {
          const ok = await startCheckout(pendingPlan);
          if (ok) return;
        }
        window.location.href = '/';
        return;
      } else {
        // Server-side signup — auto-confirms, no email verification, no rate limit
        const res = await fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'signup', email, password, name }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error); setLoading(false); return; }

        // Set the session from the server response
        if (data.session) {
          await supabase.auth.setSession({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          });
        }

        // Redirect to checkout if pending plan, otherwise dashboard
        if (pendingPlan) {
          const ok = await startCheckout(pendingPlan);
          if (ok) return;
        }
        window.location.href = '/';
        return;
      }
    } catch (e) { setError(e.message || 'Something went wrong'); }
    setLoading(false);
  };

  const s = { input: { width:'100%',marginTop:4,padding:'12px 16px',background:'#f8f9fb',border:'1px solid #e2e4ea',borderRadius:12,fontSize:14,outline:'none',boxSizing:'border-box',fontFamily:'inherit' } };

  return (
    <div style={{minHeight:'100vh',background:'#f5f6f8',display:'flex',alignItems:'center',justifyContent:'center',padding:16,fontFamily:"'DM Sans',system-ui,sans-serif"}}>
      <div style={{width:'100%',maxWidth:420}}>
        <div style={{textAlign:'center',marginBottom:32}}>
          <div style={{width:64,height:64,background:'linear-gradient(135deg,#6366f1,#8b5cf6)',borderRadius:16,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:700,fontSize:28,margin:'0 auto 16px',fontFamily:'monospace'}}>J</div>
          <h1 style={{margin:0,fontSize:24,fontWeight:800,letterSpacing:3,fontFamily:'monospace'}}>JAKLAY</h1>
          <p style={{color:'#8b8fa3',margin:'4px 0 0',fontSize:14}}>AI-Powered Data Enrichment Platform</p>
        </div>
        {pendingPlan && (
          <div style={{background:'#eef2ff',border:'1px solid #c7d2fe',borderRadius:12,padding:'12px 16px',marginBottom:16,textAlign:'center'}}>
            <span style={{fontSize:13,color:'#4338ca',fontWeight:600}}>
              {mode === 'login' ? 'Log in' : 'Sign up'} to start your 7-day free trial of {pendingPlan.charAt(0).toUpperCase() + pendingPlan.slice(1)}
            </span>
          </div>
        )}
        <div style={{background:'#fff',borderRadius:16,border:'1px solid #e8eaed',padding:32}}>
          <div style={{display:'flex',background:'#f0f1f3',borderRadius:8,padding:2,marginBottom:24}}>
            {['login','signup'].map(m => (
              <button key={m} onClick={()=>setMode(m)} style={{flex:1,padding:'8px 0',borderRadius:6,border:'none',cursor:'pointer',fontSize:14,fontWeight:mode===m?600:400,background:mode===m?'#fff':'transparent'}}>
                {m==='login'?'Log In':'Sign Up'}
              </button>
            ))}
          </div>
          {mode==='signup' && <div style={{marginBottom:16}}>
            <label style={{fontSize:11,fontWeight:600,color:'#8b8fa3',textTransform:'uppercase'}}>Name</label>
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="Your name" style={s.input}/>
          </div>}
          <div style={{marginBottom:16}}>
            <label style={{fontSize:11,fontWeight:600,color:'#8b8fa3',textTransform:'uppercase'}}>Email</label>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com" style={s.input}/>
          </div>
          <div style={{marginBottom:24}}>
            <label style={{fontSize:11,fontWeight:600,color:'#8b8fa3',textTransform:'uppercase'}}>Password</label>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" style={s.input} onKeyDown={e=>e.key==='Enter'&&handle()}/>
          </div>
          {error && <div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:8,padding:'10px 14px',color:'#dc2626',fontSize:13,marginBottom:16}}>{error}</div>}
          <button onClick={handle} disabled={loading} style={{width:'100%',padding:14,background:'#6366f1',color:'#fff',border:'none',borderRadius:12,fontSize:14,fontWeight:600,cursor:'pointer',opacity:loading?0.7:1}}>
            {loading ? 'Please wait...' : pendingPlan ? (mode==='login' ? 'Log In & Start Trial' : 'Sign Up & Start Trial') : mode==='login' ? 'Log In' : 'Sign Up'}
          </button>
        </div>
        <div style={{textAlign:'center',marginTop:24,fontSize:12,color:'#8b8fa3'}}>
          Free plan: 100 enrichment runs · 500 rows per list<br/>
          <a href="/pricing" style={{color:'#6366f1'}}>View pricing</a>
        </div>
      </div>
    </div>
  );
}
