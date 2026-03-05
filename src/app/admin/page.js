'use client';
import { useState, useEffect } from 'react';
import { createBrowserClient } from '@/lib/supabase';

export default function AdminPage() {
  const [supabase] = useState(() => createBrowserClient());
  const [users, setUsers] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [stats, setStats] = useState({});

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = '/'; return; }
      const { data: me } = await supabase.from('profiles').select('plan').eq('id', session.user.id).single();
      if (me?.plan !== 'admin') { setIsAdmin(false); return; }
      setIsAdmin(true);
      const { data: profiles } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
      setUsers(profiles || []);
      const total = (profiles||[]).length;
      const paid = (profiles||[]).filter(p => ['starter','pro','enterprise'].includes(p.plan)).length;
      const mrr = (profiles||[]).reduce((s,p) => s + (p.plan==='starter'?29:p.plan==='pro'?79:p.plan==='enterprise'?199:0), 0);
      setStats({ total, paid, free: total-paid, mrr });
    })();
  }, [supabase]);

  if (!isAdmin) return <div style={{height:'100vh',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'system-ui'}}><p>Admin only. <a href="/">← Back</a></p></div>;

  return (
    <div style={{minHeight:'100vh',background:'#f5f6f8',padding:32,fontFamily:'system-ui'}}>
      <div style={{maxWidth:900,margin:'0 auto'}}>
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:32}}>
          <a href="/" style={{width:40,height:40,background:'linear-gradient(135deg,#6366f1,#8b5cf6)',borderRadius:12,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:700,fontSize:18,fontFamily:'monospace',textDecoration:'none'}}>J</a>
          <div><h1 style={{margin:0,fontSize:20,fontWeight:700}}>Admin Dashboard</h1><p style={{margin:0,fontSize:13,color:'#888'}}>Jaklay SaaS</p></div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:16,marginBottom:32}}>
          {[{l:'Users',v:stats.total},{l:'Paid',v:stats.paid},{l:'Free',v:stats.free},{l:'MRR',v:'$'+stats.mrr}].map(s => (
            <div key={s.l} style={{background:'#fff',borderRadius:12,border:'1px solid #e5e7eb',padding:20}}>
              <div style={{fontSize:28,fontWeight:700}}>{s.v}</div>
              <div style={{fontSize:11,color:'#888',fontWeight:600,textTransform:'uppercase'}}>{s.l}</div>
            </div>
          ))}
        </div>
        <div style={{background:'#fff',borderRadius:12,border:'1px solid #e5e7eb',overflow:'hidden'}}>
          <div style={{padding:'12px 20px',borderBottom:'1px solid #f0f0f0',fontWeight:700,fontSize:14}}>Users ({users.length})</div>
          <table style={{width:'100%',fontSize:13,borderCollapse:'collapse'}}>
            <thead><tr style={{background:'#f9fafb',fontSize:11,color:'#888',textTransform:'uppercase'}}>
              <th style={{padding:'8px 16px',textAlign:'left'}}>Email</th>
              <th style={{padding:'8px 16px',textAlign:'left'}}>Plan</th>
              <th style={{padding:'8px 16px',textAlign:'left'}}>Usage</th>
              <th style={{padding:'8px 16px',textAlign:'left'}}>Joined</th>
            </tr></thead>
            <tbody>{users.map(u => (
              <tr key={u.id} style={{borderTop:'1px solid #f0f0f0'}}>
                <td style={{padding:'8px 16px',fontFamily:'monospace',fontSize:12}}>{u.email}</td>
                <td style={{padding:'8px 16px'}}><span style={{padding:'2px 8px',borderRadius:12,fontSize:10,fontWeight:700,background:u.plan==='admin'?'#fee2e2':u.plan==='pro'?'#e0e7ff':'#f0fdf4',color:u.plan==='admin'?'#dc2626':u.plan==='pro'?'#4338ca':'#16a34a'}}>{u.plan}</span></td>
                <td style={{padding:'8px 16px',fontFamily:'monospace',fontSize:12}}>{u.enrichment_runs_used}/{u.enrichment_runs_limit}</td>
                <td style={{padding:'8px 16px',fontSize:12,color:'#888'}}>{new Date(u.created_at).toLocaleDateString()}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

