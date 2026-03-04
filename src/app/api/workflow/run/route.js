import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

// POST /api/workflow/run — Start a job from the UI
export async function POST(req) {
  const supabase = createServerClient();

  try {
    const { list_id, steps, test_limit = 0 } = await req.json();
    if (!list_id || !steps) return NextResponse.json({ error: "list_id and steps required" }, { status: 400 });

    // Get row count
    const { data: list } = await supabase.from('lists').select('row_count').eq('id', list_id).single();
    if (!list) return NextResponse.json({ error: "List not found" }, { status: 404 });

    // Create job
    const { data: job, error } = await supabase.from('jobs').insert({
      list_id,
      user_id: 'default',
      steps,
      status: 'running',
      total_rows: list.row_count,
      test_limit,
    }).select().single();

    if (error) throw new Error(error.message);

    // Kick off background processing
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    fetch(`${appUrl}/api/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: job.id }),
    }).catch(() => {});

    return NextResponse.json({ job_id: job.id, status: 'running' });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
