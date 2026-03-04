'use client';
import { useAuth } from '@/lib/auth';
import { useState } from 'react';

const PLANS = [
  { id: 'free', name: 'Free', price: 0, priceId: null,
    features: ['5 enrichment runs/month', '100 rows per list', 'Bring your own API keys', 'All step types', 'CSV export'],
    limit: '5 runs' },
  { id: 'starter', name: 'Starter', price: 29, priceId: 'STRIPE_STARTER_PRICE_ID',
    features: ['500 enrichment runs/month', '5,000 rows per list', 'All integrations', 'Workflow templates', 'Webhook API', 'Priority support'],
    limit: '500 runs', popular: true },
  { id: 'pro', name: 'Pro', price: 79, priceId: 'STRIPE_PRO_PRICE_ID',
    features: ['Unlimited enrichment runs', 'Unlimited rows', 'All integrations', 'Waterfall enrichment', 'Background processing', 'Webhook + API', 'CSV merge', 'Priority support'],
    limit: 'Unlimited' },
  { id: 'enterprise', name: 'Enterprise', price: 199, priceId: 'STRIPE_ENTERPRISE_PRICE_ID',
    features: ['Everything in Pro', 'Team accounts (coming)', 'Dedicated support', 'Custom integrations', 'White-label option'],
    limit: 'Unlimited+' },
];

export default function PricingPage() {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(null);

  const handleCheckout = async (plan) => {
    if (!user) { window.location.href = '/auth'; return; }
    if (plan.id === 'free') return;
    setLoading(plan.id);
    try {
      const res = await fetch('/api/stripe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_checkout', priceId: plan.priceId, planId: plan.id }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else alert(data.error || 'Failed to create checkout');
    } catch (err) { alert('Error: ' + err.message); }
    setLoading(null);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-16 px-4" style={{fontFamily:"'DM Sans',system-ui,sans-serif"}}>
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <a href="/" className="inline-flex items-center gap-2 mb-6">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center text-white font-mono font-bold text-lg">J</div>
            <span className="font-extrabold tracking-wider font-mono text-lg">JAKLAY</span>
          </a>
          <h1 className="text-3xl font-bold mb-3">Simple, transparent pricing</h1>
          <p className="text-gray-500">Save $4,500+/year vs Clay. Pay only for what you use.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {PLANS.map(plan => (
            <div key={plan.id} className={`bg-white rounded-2xl border-2 p-6 relative ${plan.popular ? 'border-indigo-500 shadow-lg shadow-indigo-100' : 'border-gray-200'}`}>
              {plan.popular && <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-indigo-500 text-white rounded-full text-xs font-bold">MOST POPULAR</div>}
              <div className="text-sm font-bold text-gray-500 uppercase tracking-wider">{plan.name}</div>
              <div className="mt-2 mb-4">
                <span className="text-4xl font-bold">${plan.price}</span>
                {plan.price > 0 && <span className="text-gray-400 text-sm">/mo</span>}
              </div>
              <div className="text-xs text-indigo-600 font-semibold mb-4">{plan.limit}</div>
              <ul className="space-y-2 mb-6">
                {plan.features.map(f => (
                  <li key={f} className="flex items-start gap-2 text-sm text-gray-600">
                    <span className="text-emerald-500 mt-0.5">✓</span>{f}
                  </li>
                ))}
              </ul>
              <button onClick={() => handleCheckout(plan)} disabled={loading === plan.id || profile?.plan === plan.id}
                className={`w-full py-2.5 rounded-xl text-sm font-semibold transition ${
                  profile?.plan === plan.id ? 'bg-gray-100 text-gray-400' :
                  plan.popular ? 'bg-indigo-500 text-white hover:bg-indigo-600 shadow-sm' :
                  'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                {profile?.plan === plan.id ? 'Current Plan' : loading === plan.id ? 'Loading...' : plan.price === 0 ? 'Get Started Free' : 'Subscribe'}
              </button>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <h3 className="font-bold mb-2">Clay comparison</h3>
          <div className="inline-flex gap-6 text-sm text-gray-500">
            <div>Clay Starter: <span className="line-through text-red-400">$149/mo</span></div>
            <div>Clay Pro: <span className="line-through text-red-400">$349/mo</span></div>
            <div>Clay Enterprise: <span className="line-through text-red-400">$800/mo</span></div>
          </div>
          <p className="text-xs text-gray-400 mt-2">You only pay raw API costs on top of your plan. Most enrichments cost fractions of a penny.</p>
        </div>
      </div>
    </div>
  );
}
