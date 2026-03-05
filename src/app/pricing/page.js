'use client';
import { useState, useEffect } from 'react';
import { createBrowserClient } from '@/lib/supabase';

const PLANS = [
  { id: 'free', name: 'Free', price: 0, features: ['5 enrichment runs/month', '100 rows per list', 'Bring your own API keys', 'All step types', 'CSV export'], limit: '5 runs' },
  { id: 'starter', name: 'Starter', price: 29, features: ['500 enrichment runs/month', '5,000 rows per list', 'All integrations', 'Workflow templates', 'Webhook API', 'Priority support'], limit: '500 runs', popular: true },
  { id: 'pro', name: 'Pro', price: 79, features: ['Unlimited enrichment runs', 'Unlimited rows', 'All integrations', 'Waterfall enrichment', 'Background processing', 'Webhook + API', 'CSV merge'], limit: 'Unlimited' },
  { id: 'enterprise', name: 'Enterprise', price: 199, features: ['Everything in Pro', 'Team accounts (coming)', 'Dedicated support', 'Custom integrations', 'White-label option'], limit: 'Unlimited+' },
];

export default function PricingPage() {
  const [supabase] = useState(() => createBrowserClient());
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
        setProfile(data);
      }
    })();
  }, [supabase]);

  return (
    <div style={{minHeight:'100vh',background:'#f5f6f8',padding:'64px 16px',fontFamily:'system-ui'}}>
      <div style={{maxWidth:960,margin:'0 auto'}}>
        <div style={{textAlign:'center',marginBottom:48}}>
          <a href="/" style={{textDecoration:'none',color:'inherit',display:'inline-flex',alignItems:'center',gap:8,marginBottom:16}}>
            <div style={{width:40,height:40,background:'linear-gradient(135deg,#6366f1,#8b5cf6)',borderRadius:12,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:700,fontSize:18,fontFamily:'monospace'}}>J</div>
            <span style={{fontWeight:800,letterSpacing:2,fontFamily:'monospace',fontSize:18}}>JAKLAY</span>
          </a>
          <h1 style={{fontSize:28,fontWeight:700,margin:'0 0 8px'}}>Simple, transparent pricing</h1>
          <p style={{color:'#888',fontSize:15}}>Save $4,500+/year vs Clay. Pay only for what you use.</p>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:16}}>
          {PLANS.map(plan => (
            <div key={plan.id} style={{background:'#fff',borderRadius:16,border:plan.popular?'2px solid #6366f1':'2px solid #e5e7eb',padding:24,position:'relative',boxShadow:plan.popular?'0 4px 20px rgba(99,102,241,0.15)':'none'}}>
              {plan.popular && <div style={{position:'absolute',top:-12,left:'50%',transform:'translateX(-50%)',background:'#6366f1',color:'#fff',padding:'2px 12px',borderRadius:12,fontSize:11,fontWeight:700}}>POPULAR</div>}
              <div style={{fontSize:12,fontWeight:700,color:'#888',textTransform:'uppercase',letterSpacing:1}}>{plan.name}</div>
              <div style={{margin:'8px 0 16px'}}><span style={{fontSize:36,fontWeight:700}}>${plan.price}</span>{plan.price > 0 && <span style={{color:'#888',fontSize:14}}>/mo</span>}</div>
              <div style={{fontSize:12,color:'#6366f1',fontWeight:600,marginBottom:16}}>{plan.limit}</div>
              <ul style={{listStyle:'none',padding:0,margin:'0 0 24px'}}>
                {plan.features.map(f => <li key={f} style={{fontSize:13,color:'#555',padding:'4px 0',display:'flex',gap:8}}><span style={{color:'#22c55e'}}>✓</span>{f}</li>)}
              </ul>
              <button style={{width:'100%',padding:'10px',border:'none',borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer',background:profile?.plan===plan.id?'#f0f0f0':plan.popular?'#6366f1':'#f0f0f0',color:profile?.plan===plan.id?'#999':plan.popular?'#fff':'#333'}}>
                {profile?.plan===plan.id?'Current Plan':plan.price===0?'Get Started Free':'Subscribe'}
              </button>
            </div>
          ))}
        </div>
        <div style={{textAlign:'center',marginTop:48}}>
          <div style={{display:'inline-flex',gap:24,fontSize:14,color:'#888'}}>
            <span>Clay Starter: <span style={{textDecoration:'line-through',color:'#ef4444'}}>$149/mo</span></span>
            <span>Clay Pro: <span style={{textDecoration:'line-through',color:'#ef4444'}}>$349/mo</span></span>
          </div>
        </div>
      </div>
    </div>
  );
}

