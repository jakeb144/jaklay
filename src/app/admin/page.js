'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';

export default function AdminPage() {
  const { supabase, isAdmin, user } = useAuth();
  const [users, setUsers] = useState([]);
  const [usage, setUsage] = useState([]);
  const [stats, setStats] = useState({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      // Use service role via API for admin queries
      const { data: profiles } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
      setUsers(profiles || []);

      // Compute stats
      const total = (profiles || []).length;
      const paid = (profiles || []).filter(p => ['starter','pro','enterprise'].includes(p.plan)).length;
      const free = total - paid;
      const mrr = (profiles || []).reduce((sum, p) => {
        if (p.plan === 'starter') return sum + 29;
        if (p.plan === 'pro') return sum + 79;
        if (p.plan === 'enterprise') return sum + 199;
        return sum;
      }, 0);
      setStats({ total, paid, free, mrr });

      // Recent usage
      const { data: usageData } = await supabase.from('usage_log').select('*').order('created_at', { ascending: false }).limit(100);
      setUsage(usageData || []);

      setLoaded(true);
    })();
  }, [isAdmin, supabase]);

  if (!isAdmin) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50" style={{fontFamily:"'DM Sans',sans-serif"}}>
      <div className="text-center">
        <h1 className="text-xl font-bold mb-2">Access Denied</h1>
        <p className="text-gray-400">Admin only.</p>
        <a href="/" className="text-indigo-500 hover:underline text-sm mt-4 block">← Back to Dashboard</a>
      </div>
    </div>
  );

  if (!loaded) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><p className="text-gray-400">Loading admin...</p></div>;

  return (
    <div className="min-h-screen bg-gray-50 p-8" style={{fontFamily:"'DM Sans',sans-serif"}}>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <a href="/" className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center text-white font-mono font-bold text-lg">J</a>
          <div>
            <h1 className="text-xl font-bold">Admin Dashboard</h1>
            <p className="text-sm text-gray-400">Jaklay SaaS Overview</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total Users', value: stats.total, color: 'indigo' },
            { label: 'Paid Users', value: stats.paid, color: 'emerald' },
            { label: 'Free Users', value: stats.free, color: 'gray' },
            { label: 'MRR', value: '$' + stats.mrr, color: 'amber' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="text-3xl font-bold">{s.value}</div>
              <div className="text-xs text-gray-400 font-semibold uppercase mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Users table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-8">
          <div className="px-5 py-3 border-b border-gray-100 font-bold text-sm">Users ({users.length})</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-400 uppercase">
                <th className="px-4 py-2 text-left">Email</th>
                <th className="px-4 py-2 text-left">Name</th>
                <th className="px-4 py-2 text-left">Plan</th>
                <th className="px-4 py-2 text-left">Usage</th>
                <th className="px-4 py-2 text-left">Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-t border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-2 text-xs font-mono">{u.email}</td>
                  <td className="px-4 py-2">{u.full_name || '-'}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      u.plan==='admin'?'bg-red-100 text-red-600':
                      u.plan==='pro'?'bg-indigo-100 text-indigo-600':
                      u.plan==='starter'?'bg-emerald-100 text-emerald-600':
                      'bg-gray-100 text-gray-500'}`}>
                      {u.plan}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs font-mono">{u.enrichment_runs_used}/{u.enrichment_runs_limit}</td>
                  <td className="px-4 py-2 text-xs text-gray-400">{new Date(u.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Recent activity */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 font-bold text-sm">Recent Activity</div>
          <div className="max-h-80 overflow-auto">
            {usage.map(u => (
              <div key={u.id} className="px-5 py-2 border-t border-gray-50 flex items-center gap-3 text-xs">
                <span className="text-gray-300 font-mono">{new Date(u.created_at).toLocaleString()}</span>
                <span className="font-medium">{u.action}</span>
                {u.provider && <span className="text-gray-400">{u.provider}</span>}
                {u.row_count > 0 && <span className="text-gray-400">{u.row_count} rows</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
