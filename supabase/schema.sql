-- ═══════════════════════════════════════════════════════════════
-- JAKLAY: Supabase Schema
-- Run this in your Supabase SQL Editor (supabase.com/dashboard)
-- ═══════════════════════════════════════════════════════════════

-- API Keys (encrypted at rest by Supabase)
CREATE TABLE api_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default',
  provider TEXT NOT NULL,
  encrypted_key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

-- Lists (CSV uploads)
CREATE TABLE lists (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default',
  name TEXT NOT NULL,
  row_count INT DEFAULT 0,
  original_columns JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- List Rows (the actual spreadsheet data)
CREATE TABLE list_rows (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  list_id UUID REFERENCES lists(id) ON DELETE CASCADE,
  row_index INT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_list_rows_list_id ON list_rows(list_id);
CREATE INDEX idx_list_rows_index ON list_rows(list_id, row_index);

-- Workflow Templates (saved step sequences)
CREATE TABLE workflows (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default',
  name TEXT NOT NULL,
  steps JSONB NOT NULL DEFAULT '[]',
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Jobs (background enrichment runs)
CREATE TABLE jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  list_id UUID REFERENCES lists(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL DEFAULT 'default',
  steps JSONB NOT NULL DEFAULT '[]',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed','stopped')),
  current_step_index INT DEFAULT 0,
  current_row INT DEFAULT 0,
  total_rows INT DEFAULT 0,
  error_count INT DEFAULT 0,
  log JSONB DEFAULT '[]',
  test_limit INT DEFAULT 0, -- 0 = all rows, else 1/5/10
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_list ON jobs(list_id);

-- Enable Realtime on jobs and list_rows so the UI live-updates
ALTER PUBLICATION supabase_realtime ADD TABLE jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE list_rows;

-- Row Level Security (simple: allow everything for now, lock down later)
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE list_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

-- Permissive policies (single-user for now)
CREATE POLICY "allow_all" ON api_keys FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON lists FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON list_rows FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON workflows FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON jobs FOR ALL USING (true) WITH CHECK (true);
