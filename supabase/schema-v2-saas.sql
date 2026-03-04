-- ═══════════════════════════════════════════════════════════════
-- JAKLAY SaaS Schema v2
-- Run this AFTER the original schema.sql
-- In Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- User profiles (auto-created on signup via trigger)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free','starter','pro','enterprise','admin')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  enrichment_runs_used INT DEFAULT 0,
  enrichment_runs_limit INT DEFAULT 5, -- free tier: 5 runs
  row_limit INT DEFAULT 100, -- free tier: 100 rows per list
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Usage log (track every enrichment run)
CREATE TABLE IF NOT EXISTS usage_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- 'enrichment_run', 'api_call', 'csv_upload'
  step_type TEXT,
  provider TEXT,
  row_count INT DEFAULT 0,
  cost_estimate DECIMAL(10,4) DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_usage_user ON usage_log(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_date ON usage_log(created_at);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Reset monthly usage on the 1st (call via Supabase cron or external)
-- For now, manual or webhook-triggered

-- ─── Update existing tables to be user-scoped ─────────────────

-- Add user_id as UUID referencing auth.users where it's currently TEXT
-- (We keep backward compat by allowing both)
ALTER TABLE api_keys ALTER COLUMN user_id TYPE TEXT;
ALTER TABLE lists ALTER COLUMN user_id TYPE TEXT;
ALTER TABLE workflows ALTER COLUMN user_id TYPE TEXT;
ALTER TABLE jobs ALTER COLUMN user_id TYPE TEXT;

-- ─── Row Level Security (proper multi-tenant) ─────────────────

-- Drop old permissive policies
DROP POLICY IF EXISTS "allow_all" ON api_keys;
DROP POLICY IF EXISTS "allow_all" ON lists;
DROP POLICY IF EXISTS "allow_all" ON list_rows;
DROP POLICY IF EXISTS "allow_all" ON workflows;
DROP POLICY IF EXISTS "allow_all" ON jobs;

-- API Keys: users can only see their own
CREATE POLICY "users_own_keys" ON api_keys
  FOR ALL USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

-- Lists: users can only see their own
CREATE POLICY "users_own_lists" ON lists
  FOR ALL USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

-- List rows: through list ownership
CREATE POLICY "users_own_rows" ON list_rows
  FOR ALL USING (list_id IN (SELECT id FROM lists WHERE user_id = auth.uid()::text))
  WITH CHECK (list_id IN (SELECT id FROM lists WHERE user_id = auth.uid()::text));

-- Workflows: users own their own
CREATE POLICY "users_own_workflows" ON workflows
  FOR ALL USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

-- Jobs: users own their own
CREATE POLICY "users_own_jobs" ON jobs
  FOR ALL USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

-- Profiles: users see only their own
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_profile" ON profiles
  FOR ALL USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Usage log: users see their own
ALTER TABLE usage_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_usage" ON usage_log
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ─── Admin policies (for your admin account) ──────────────────
-- After you sign up, run this with YOUR user id:
-- UPDATE profiles SET plan = 'admin' WHERE email = 'YOUR_EMAIL';
-- Then create admin policies:

CREATE POLICY "admin_all_profiles" ON profiles
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND plan = 'admin')
  );

CREATE POLICY "admin_all_usage" ON usage_log
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND plan = 'admin')
  );

-- Service role bypasses RLS, so webhooks and background jobs still work
