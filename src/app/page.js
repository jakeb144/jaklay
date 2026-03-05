'use client';
import { useState, useEffect } from 'react';
import { createBrowserClient } from '@/lib/supabase';
import Dashboard from '@/components/Dashboard';

export default function Home() {
  const [supabase] = useState(() => createBrowserClient());
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [mode, setMode] = useState('login');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setChecking(false);
    });
    return () => subscription.unsubscribe();
  }, [supabase]);

  if (checking) return (
    <div style={{height:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#f5f6f8',fontFamily:'system-ui'}}>
      <p style={{color:'#999'}}>Loading...</p>
    </div>
  );

  if (session) return <Dashboard supabase={supabase} session={session} />;

  const handle = async () => {
    setError(''); setMsg('');
    if (mode === 'login') {
      const { error: e } = await supabase.auth.signInWithPassword({ email, password });
      if (e) setError(e.message);
    } else {
      const { error: e } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } });
      if (e) setError(e.message);
      else setMsg('Check your email for confirmation link');
    }
  };

  return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#f5f6f8',fontFamily:'system-ui'}}>
      <div style={{width:400,background:'#fff',borderRadius:16,padding:32,boxShadow:'0 2px 12px rgba(0,0,0,0.08)'}}>
        <div style={{textAlign:'center',marginBottom:24}}>
          <div style={{width:48,height:48,background:'linear-gradient(135deg,#6366f1,#8b5cf6)',borderRadius:12,display:'inline-flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:700,fontSize:20,fontFamily:'monospace'}}>J</div>
          <h1 style={{margin:'8px 0 4px',fontSize:20,fontWeight:800,letterSpacing:2,fontFamily:'monospace'}}>JAKLAY</h1>
          <p style={{color:'#999',fontSize:13,margin:0}}>AI Data Enrichment</p>
        </div>
        <div style={{display:'flex',gap:4,marginBottom:16,background:'#f0f0f0',borderRadius:8,padding:2}}>
          <button onClick={() => setMode('login')} style={{flex:1,padding:'8px',border:'none',borderRadius:6,cursor:'pointer',fontWeight:mode==='login'?600:400,background:mode==='login'?'#fff':'transparent'}}>Log In</button>
          <button onClick={() => setMode('signup')} style={{flex:1,padding:'8px',border:'none',borderRadius:6,cursor:'pointer',fontWeight:mode==='signup'?600:400,background:mode==='signup'?'#fff':'transparent'}}>Sign Up</button>
        </div>
        {mode === 'signup' && <input value={name} onChange={e => setName(e.target.value)} placeholder="Full Name" style={{width:'100%',padding:'10px 14px',border:'1px solid #ddd',borderRadius:8,marginBottom:8,fontSize:14,boxSizing:'border-box'}} />}
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" style={{width:'100%',padding:'10px 14px',border:'1px solid #ddd',borderRadius:8,marginBottom:8,fontSize:14,boxSizing:'border-box'}} />
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" onKeyDown={e => e.key==='Enter' && handle()} style={{width:'100%',padding:'10px 14px',border:'1px solid #ddd',borderRadius:8,marginBottom:12,fontSize:14,boxSizing:'border-box'}} />
        {error && <p style={{color:'#ef4444',fontSize:12,margin:'0 0 8px'}}>{error}</p>}
        {msg && <p style={{color:'#22c55e',fontSize:12,margin:'0 0 8px'}}>{msg}</p>}
        <button onClick={handle} style={{width:'100%',padding:'10px',background:'#6366f1',color:'#fff',border:'none',borderRadius:8,fontSize:14,fontWeight:600,cursor:'pointer'}}>{mode==='login'?'Log In':'Sign Up'}</button>
        <p style={{textAlign:'center',fontSize:11,color:'#999',marginTop:12}}>Free: 5 enrichment runs · <a href="/pricing" style={{color:'#6366f1'}}>View pricing</a></p>
      </div>
    </div>
  );
}
