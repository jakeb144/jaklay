'use client';
import { useAuth } from '@/lib/auth';
import AuthPage from './auth/page';
import Dashboard from '@/components/Dashboard';

export default function Home() {
  const { user, loading, profile } = useAuth();

  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-2xl flex items-center justify-center text-white font-mono font-bold text-2xl mx-auto mb-3 shadow-lg shadow-indigo-200">J</div>
        <p className="text-gray-400 text-sm animate-pulse">Loading...</p>
      </div>
    </div>
  );

  // If no auth configured or no user, show auth page
  if (!user) return <AuthPage />;

  return <Dashboard />;
}
