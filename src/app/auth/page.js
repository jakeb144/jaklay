'use client';
import { useState } from 'react';
import { createBrowserClient } from '@/lib/supabase';

const supabase = createBrowserClient();

export default function AuthPage() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');

  const handle = async () => {
    setError(''); setSuccess(''); setLoading(true);
    try {
      if (mode === 'login') {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) setError(err.message);
        // onAuthStateChange in AuthProvider will detect session and re-render Dashboard
      } else {
        const { error: err } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } });
        if (err) setError(err.message);
        else setSuccess('Check your email for a confirmation link!');
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
          {success && <div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:8,padding:'10px 14px',color:'#16a34a',fontSize:13,marginBottom:16}}>{success}</div>}
          <button onClick={handle} disabled={loading} style={{width:'100%',padding:14,background:'#6366f1',color:'#fff',border:'none',borderRadius:12,fontSize:14,fontWeight:600,cursor:'pointer',opacity:loading?0.7:1}}>
            {loading ? 'Please wait...' : mode==='login' ? 'Log In' : 'Sign Up'}
          </button>
        </div>
        <div style={{textAlign:'center',marginTop:24,fontSize:12,color:'#8b8fa3'}}>
          Free plan: 5 enrichment runs · 100 rows per list<br/>
          <a href="/pricing" style={{color:'#6366f1'}}>View pricing →</a>
        </div>
      </div>
    </div>
  );
}
