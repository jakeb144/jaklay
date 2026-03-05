import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { processStep } from '@/lib/engine';
import { getPlanLimits } from '@/lib/plans';

// Process a batch of rows for a job, then self-chain to continue
// This runs on the SERVER — survives browser tab close
const BATCH_SIZE = 5;

export async function POST(req) {
  const supabase = createServerClient();

  try {
    const { job_id } = await req.json();
    if (!job_id) return NextResponse.json({ error: "Missing job_id" }, { status: 400 });

    // Load job
    const { data: job, error: jobErr } = await supabase
      .from('jobs').select('*').eq('id', job_id).single();
    if (jobErr || !job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    if (job.status === 'stopped' || job.status === 'completed' || job.status === 'failed') {
      return NextResponse.json({ status: job.status, message: "Job already finished" });
    }

    // Enforce plan limits server-side
    const { data: userProfile } = await supabase
      .from('profiles').select('plan, enrichment_runs_used, enrichment_runs_limit').eq('id', job.user_id).single();
    if (userProfile) {
      const limits = getPlanLimits(userProfile.plan);
      if ((userProfile.enrichment_runs_used || 0) >= limits.runs) {
        await supabase.from('jobs').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', job_id);
        return NextResponse.json({ error: "Enrichment run limit reached. Upgrade to continue." }, { status: 403 });
      }
    }

    // Load API keys
    const { data: keyRows } = await supabase
      .from('api_keys').select('provider, encrypted_key').eq('user_id', job.user_id);
    const keys = {};
    (keyRows || []).forEach(k => { keys[k.provider] = k.encrypted_key; });

    // Load rows
    const limit = job.test_limit > 0 ? job.test_limit : job.total_rows;
    const steps = job.steps || [];
    const stepIdx = job.current_step_index;
    const startRow = job.current_row;

    if (stepIdx >= steps.length) {
      // All steps done
      await supabase.from('jobs').update({
        status: 'completed', completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq('id', job_id);
      return NextResponse.json({ status: 'completed' });
    }

    const currentStep = steps[stepIdx];
    const endRow = Math.min(startRow + BATCH_SIZE, limit);

    // Fetch the rows we need
    const { data: rows } = await supabase
      .from('list_rows')
      .select('*')
      .eq('list_id', job.list_id)
      .gte('row_index', startRow)
      .lt('row_index', endRow)
      .order('row_index', { ascending: true });

    let errors = job.error_count || 0;

    // Process each row
    for (const row of (rows || [])) {
      // Re-check job status (in case user clicked Stop)
      const { data: freshJob } = await supabase.from('jobs').select('status').eq('id', job_id).single();
      if (freshJob?.status === 'stopped') {
        return NextResponse.json({ status: 'stopped' });
      }

      const rowData = row.data || {};
      const result = await processStep(currentStep, rowData, keys);

      // Update row data
      const updatedData = { ...rowData, [currentStep.outputColumn]: result.value };
      // Store waterfall report if present
      if (result.waterfallReport) {
        updatedData[currentStep.outputColumn + '__report'] = JSON.stringify(result.waterfallReport);
      }
      await supabase.from('list_rows').update({
        data: updatedData, updated_at: new Date().toISOString(),
      }).eq('id', row.id);

      if (result.error) errors++;

      // Update job progress
      await supabase.from('jobs').update({
        current_row: row.row_index + 1,
        error_count: errors,
        status: 'running',
        updated_at: new Date().toISOString(),
      }).eq('id', job_id);

      // Rate limit buffer
      await new Promise(r => setTimeout(r, 200));
    }

    // Determine next action
    if (endRow >= limit) {
      // This step is done — move to next step
      const nextStepIdx = stepIdx + 1;
      if (nextStepIdx >= steps.length) {
        await supabase.from('jobs').update({
          status: 'completed', current_step_index: nextStepIdx,
          completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq('id', job_id);
        return NextResponse.json({ status: 'completed' });
      } else {
        await supabase.from('jobs').update({
          current_step_index: nextStepIdx, current_row: 0, updated_at: new Date().toISOString(),
        }).eq('id', job_id);
      }
    } else {
      await supabase.from('jobs').update({
        current_row: endRow, updated_at: new Date().toISOString(),
      }).eq('id', job_id);
    }

    // ═══ SELF-CHAIN: Call ourselves to process the next batch ═══
    // This is the magic — even if the user closes their browser,
    // Vercel keeps executing this chain of serverless invocations
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    fetch(`${appUrl}/api/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id }),
    }).catch(() => {}); // fire and forget

    return NextResponse.json({
      status: 'processing',
      step: stepIdx,
      row: endRow,
      total: limit,
      errors,
    });

  } catch (err) {
    console.error('Process error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
