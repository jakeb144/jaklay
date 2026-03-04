'use client';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';

export default function AuthPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');

  const handle = async (e) => {
    e.preventDefault();
    setError(''); setSuccess(''); setLoading(true);
    if (mode === 'login') {
      const { error: err } = await signIn(email, password);
      if (err) setError(err.message);
    } else {
      const { error: err } = await signUp(email, password, name);
      if (err) setError(err.message);
      else setSuccess('Check your email for a confirmation link!');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4" style={{fontFamily:"'DM Sans',system-ui,sans-serif"}}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-2xl flex items-center justify-center text-white font-mono font-bold text-3xl mx-auto mb-4 shadow-lg shadow-indigo-200">J</div>
          <h1 className="text-2xl font-extrabold tracking-wider font-mono">JAKLAY</h1>
          <p className="text-gray-400 mt-1">AI-Powered Data Enrichment Platform</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="flex bg-gray-100 rounded-lg p-0.5 mb-6">
            <button onClick={() => setMode('login')} className={`flex-1 py-2 text-sm rounded-md transition ${mode==='login'?'bg-white shadow font-semibold':'text-gray-500'}`}>Log In</button>
            <button onClick={() => setMode('signup')} className={`flex-1 py-2 text-sm rounded-md transition ${mode==='signup'?'bg-white shadow font-semibold':'text-gray-500'}`}>Sign Up</button>
          </div>

          <div onSubmit={handle}>
            {mode === 'signup' && (
              <div className="mb-4">
                <label className="text-xs font-semibold text-gray-500 uppercase">Full Name</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Jake Bruce"
                  className="w-full mt-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-200" />
              </div>
            )}
            <div className="mb-4">
              <label className="text-xs font-semibold text-gray-500 uppercase">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com"
                className="w-full mt-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-200" />
            </div>
            <div className="mb-6">
              <label className="text-xs font-semibold text-gray-500 uppercase">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••"
                className="w-full mt-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-200" />
            </div>

            {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">{error}</div>}
            {success && <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-600">{success}</div>}

            <button onClick={handle} disabled={loading}
              className="w-full py-3 bg-indigo-500 text-white rounded-xl text-sm font-semibold hover:bg-indigo-600 disabled:opacity-50 transition shadow-sm shadow-indigo-200">
              {loading ? 'Loading...' : mode === 'login' ? 'Log In' : 'Create Account'}
            </button>
          </div>
        </div>

        <div className="text-center mt-6 text-xs text-gray-400">
          Free plan: 5 enrichment runs · 100 rows per list<br/>
          <a href="/pricing" className="text-indigo-500 hover:underline">View pricing →</a>
        </div>
      </div>
    </div>
  );
}
