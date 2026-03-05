'use client';

import { useAuth } from '@/lib/auth';
import { useState } from 'react';

const PLANS = [
  { name: 'Free', price: '$0', period: '', badge: null, runs: '100 runs/mo', highlight: false, planId: null,
    features: ['100 enrichment runs/month','500 rows per list','All AI providers (BYOK)','All step types','CSV import & export','Workflow builder'],
    cta: 'Get Started Free' },
  { name: 'Starter', price: '$29', period: '/mo', badge: 'MOST POPULAR', runs: '2,000 runs/mo', highlight: true, planId: 'starter', trial: 7,
    features: ['2,000 enrichment runs/month','10,000 rows per list','All integrations','Workflow templates','Webhook + Make.com','Priority support'],
    cta: 'Start 7-Day Free Trial' },
  { name: 'Pro', price: '$79', period: '/mo', badge: null, runs: 'Unlimited', highlight: false, planId: 'pro', trial: 7,
    features: ['Unlimited enrichment runs','Unlimited rows','Waterfall email finding','Background processing','Webhook + API access','CSV merge & advanced filters'],
    cta: 'Start 7-Day Free Trial' },
  { name: 'Enterprise', price: '$199', period: '/mo', badge: null, runs: 'Unlimited+', highlight: false, planId: 'enterprise',
    features: ['Everything in Pro','Team accounts (coming)','Dedicated support','Custom integrations','White-label option','SLA guarantee'],
    cta: 'Contact Sales' },
];

export default function PricingPage() {
  const { supabase, user, profile, loading } = useAuth();
  const currentPlan = profile?.plan || 'free';
  const [clickLoading, setClickLoading] = useState(null);

  const handleSubscribe = async (planId) => {
    if (!planId) { window.location.href = '/'; return; }
    if (!user) { window.location.href = `/auth?plan=${planId}`; return; }

    setClickLoading(planId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        alert('Session expired. Please log in again.');
        window.location.href = `/auth?plan=${planId}`;
        return;
      }
      const res = await fetch('/api/stripe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: 'create_checkout', planId }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || 'Something went wrong. Please try again.');
        setClickLoading(null);
      }
    } catch (e) {
      console.error('Checkout error:', e);
      alert('Connection error. Please try again.');
      setClickLoading(null);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f8f9fb', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div style={{ textAlign: 'center', padding: '60px 20px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 16 }}>J</div>
          <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: 2, color: '#1e1f2e' }}>JAKLAY</span>
        </div>
        <h1 style={{ fontSize: 40, fontWeight: 800, color: '#1e1f2e', margin: '0 0 8px', lineHeight: 1.1 }}>Simple, transparent pricing</h1>
        <p style={{ fontSize: 16, color: '#6b7280', margin: '0 auto', maxWidth: 500 }}>Pay only for what you use. Cancel anytime. All plans include every AI provider and step type.</p>
      </div>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <span style={{ display: 'inline-block', background: '#fef3c7', color: '#92400e', fontSize: 13, fontWeight: 600, padding: '6px 16px', borderRadius: 20 }}>
          Save $1,400+/year vs Clay — bring your own API keys, pay wholesale
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20, maxWidth: 1100, margin: '0 auto', padding: '0 20px 60px' }}>
        {PLANS.map(plan => {
          const isCurrent = currentPlan === plan.name.toLowerCase();
          const isLoading = clickLoading === plan.planId;
          return (
          <div key={plan.name} style={{ background: '#fff', borderRadius: 16, padding: '32px 24px 28px',
            border: plan.highlight ? '2px solid #6366f1' : '1px solid #e5e7eb', position: 'relative',
            display: 'flex', flexDirection: 'column',
            boxShadow: plan.highlight ? '0 8px 30px rgba(99,102,241,0.12)' : '0 1px 3px rgba(0,0,0,0.04)',
            transform: plan.highlight ? 'scale(1.03)' : 'none' }}>
            {plan.badge && (
              <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                background: '#6366f1', color: '#fff', fontSize: 11, fontWeight: 700, padding: '4px 14px', borderRadius: 20, letterSpacing: 1 }}>
                {plan.badge}
              </div>
            )}
            <div style={{ fontSize: 13, fontWeight: 700, color: '#6b7280', letterSpacing: 1, textTransform: 'uppercase' }}>{plan.name}</div>
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'baseline', gap: 2 }}>
              <span style={{ fontSize: 44, fontWeight: 800, color: '#1e1f2e', lineHeight: 1 }}>{plan.price}</span>
              {plan.period && <span style={{ fontSize: 16, color: '#9ca3af' }}>{plan.period}</span>}
            </div>
            <div style={{ marginTop: 8, fontSize: 14, fontWeight: 600, color: plan.highlight ? '#6366f1' : '#22c55e' }}>{plan.runs}</div>
            {plan.trial && (
              <div style={{ marginTop: 4, fontSize: 12, color: '#6366f1', fontWeight: 500 }}>{plan.trial}-day free trial included</div>
            )}
            <div style={{ marginTop: 20, flex: 1 }}>
              {plan.features.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
                  <span style={{ color: '#22c55e', fontSize: 16, lineHeight: '20px', flexShrink: 0 }}>✓</span>
                  <span style={{ fontSize: 14, color: '#374151', lineHeight: '20px' }}>{f}</span>
                </div>
              ))}
            </div>
            <button onClick={() => handleSubscribe(plan.planId)}
              disabled={isCurrent || isLoading}
              style={{ marginTop: 20, width: '100%', padding: '12px 0', borderRadius: 10, fontSize: 14, fontWeight: 600,
                cursor: isCurrent || isLoading ? 'default' : 'pointer', border: 'none',
                opacity: isCurrent ? 0.5 : isLoading ? 0.7 : 1, transition: 'all 0.15s',
                background: plan.highlight ? '#6366f1' : plan.planId === 'pro' ? '#1e1f2e' : '#fff',
                color: plan.highlight || plan.planId === 'pro' ? '#fff' : '#374151',
                boxShadow: plan.highlight ? '0 4px 14px rgba(99,102,241,0.3)' : 'none',
                ...((!plan.highlight && plan.planId !== 'pro') ? { border: '2px solid #d1d5db' } : {}) }}>
              {isCurrent ? 'Current Plan' : isLoading ? 'Redirecting...' : plan.cta}
            </button>
          </div>
          );
        })}
      </div>
      <div style={{ textAlign: 'center', paddingBottom: 60 }}>
        <div style={{ display: 'inline-flex', gap: 32, alignItems: 'center', fontSize: 14, color: '#6b7280' }}>
          <span>Clay Starter: <strong style={{ color: '#ef4444', textDecoration: 'line-through' }}>$149/mo</strong></span>
          <span>Clay Pro: <strong style={{ color: '#ef4444', textDecoration: 'line-through' }}>$349/mo</strong></span>
          <span style={{ color: '#22c55e', fontWeight: 600 }}>Jaklay Pro: $79/mo</span>
        </div>
      </div>
    </div>
  );
}
