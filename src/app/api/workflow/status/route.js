import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

// GET /api/workflow/status?job_id=xxx — Check job progress
export async function GET(req) {
  const supabase = createServerClient();
  const { searchParams } = new URL(req.url);
  const job_id = searchParams.get('job_id');

  if (!job_id) return NextResponse.json({ error: "job_id required" }, { status: 400 });

  const { data: job, error } = await supabase
    .from('jobs').select('*').eq('id', job_id).single();

  if (error || !job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const totalSteps = (job.steps || []).length;
  const limit = job.test_limit > 0 ? job.test_limit : job.total_rows;

  return NextResponse.json({
    job_id: job.id,
    status: job.status,
    current_step: job.current_step_index,
    total_steps: totalSteps,
    current_row: job.current_row,
    total_rows: limit,
    errors: job.error_count,
    created_at: job.created_at,
    completed_at: job.completed_at,
    // Overall percentage
    progress_pct: totalSteps > 0
      ? Math.round(((job.current_step_index * limit + job.current_row) / (totalSteps * limit)) * 100)
      : 0,
  });
}

// POST /api/workflow/status — Stop a job
export async function POST(req) {
  const supabase = createServerClient();
  const { job_id, action } = await req.json();

  if (action === 'stop') {
    await supabase.from('jobs').update({
      status: 'stopped', updated_at: new Date().toISOString(),
    }).eq('id', job_id);
    return NextResponse.json({ status: 'stopped' });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
