import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

// ═══════════════════════════════════════════════════════════════
// WEBHOOK ENDPOINT — Receives calls from Make.com / Zapier / etc
//
// POST /api/webhook
// Headers: { "x-webhook-secret": "your_secret" }
// Body: {
//   "action": "run_workflow",
//   "workflow_id": "uuid",        // saved workflow template
//   "list_id": "uuid",            // existing list to run against
//   "test_limit": 0,              // 0=all, 1, 5, 10
//   // OR upload CSV inline:
//   "csv_data": [{ "name": "...", "email": "..." }, ...],
//   "list_name": "Make Upload 2025-03-04"
// }
//
// Make.com setup:
//   1. HTTP module → POST to https://your-jaklay.vercel.app/api/webhook
//   2. Headers: x-webhook-secret = your_secret
//   3. Body: JSON with workflow_id + list_id (or csv_data)
// ═══════════════════════════════════════════════════════════════

export async function POST(req) {
  const supabase = createServerClient();
  const secret = req.headers.get('x-webhook-secret');

  // Auth check
  if (secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { action, workflow_id, list_id, csv_data, list_name, test_limit = 0 } = body;

    if (action !== "run_workflow") {
      return NextResponse.json({ error: "Unknown action. Use: run_workflow" }, { status: 400 });
    }

    // Load workflow template
    if (!workflow_id) return NextResponse.json({ error: "workflow_id required" }, { status: 400 });
    const { data: wf, error: wfErr } = await supabase
      .from('workflows').select('*').eq('id', workflow_id).single();
    if (wfErr || !wf) return NextResponse.json({ error: "Workflow not found" }, { status: 404 });

    let targetListId = list_id;
    let rowCount = 0;

    // If CSV data provided, create a new list
    if (csv_data && Array.isArray(csv_data) && csv_data.length > 0) {
      const cols = Object.keys(csv_data[0]);
      const { data: newList, error: listErr } = await supabase.from('lists').insert({
        name: list_name || `Webhook ${new Date().toISOString().slice(0, 10)}`,
        row_count: csv_data.length,
        original_columns: cols,
      }).select().single();

      if (listErr) throw new Error("Failed to create list: " + listErr.message);
      targetListId = newList.id;

      // Insert rows
      const rowInserts = csv_data.map((row, i) => ({
        list_id: targetListId,
        row_index: i,
        data: row,
      }));

      // Batch insert (Supabase handles up to ~1000 per call)
      for (let i = 0; i < rowInserts.length; i += 500) {
        await supabase.from('list_rows').insert(rowInserts.slice(i, i + 500));
      }
      rowCount = csv_data.length;
    } else {
      // Get row count from existing list
      const { data: list } = await supabase.from('lists').select('row_count').eq('id', targetListId).single();
      rowCount = list?.row_count || 0;
    }

    if (!targetListId) return NextResponse.json({ error: "list_id or csv_data required" }, { status: 400 });

    // Create job
    const { data: job, error: jobErr } = await supabase.from('jobs').insert({
      list_id: targetListId,
      user_id: 'default',
      steps: wf.steps,
      status: 'pending',
      total_rows: rowCount,
      test_limit: test_limit,
    }).select().single();

    if (jobErr) throw new Error("Failed to create job: " + jobErr.message);

    // Kick off background processing
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    fetch(`${appUrl}/api/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: job.id }),
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      job_id: job.id,
      list_id: targetListId,
      total_rows: rowCount,
      steps: wf.steps.length,
      status_url: `${appUrl}/api/workflow/status?job_id=${job.id}`,
    });

  } catch (err) {
    console.error('Webhook error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET endpoint for Make.com to test the connection
export async function GET(req) {
  const secret = req.headers.get('x-webhook-secret') || new URL(req.url).searchParams.get('secret');
  if (secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ status: "ok", service: "Jaklay", version: "1.0" });
}
