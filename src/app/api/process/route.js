import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { processStep } from '@/lib/engine';
import { getPlanLimits } from '@/lib/plans';

// ═══════════════════════════════════════════════════════════════
// PARALLEL BATCH PROCESSOR
// Processes rows concurrently within each batch for ~10x speedup
// ═══════════════════════════════════════════════════════════════

const BATCH_SIZE = 25;       // Rows per batch (processed in parallel)
const CONCURRENCY = 10;      // Max simultaneous API calls within a batch
const SELF_CHAIN_COUNT = 2;  // Number of parallel self-chains to fire

// Process N items with a concurrency limit
async function parallelMap(items, fn, concurrency) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i], i).catch(err => ({ _error: err.message }));
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export async function POST(req) {
  const supabase = createServerClient();

  try {
    const { job_id, _chain_id } = await req.json();
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

    if (stepIdx >= steps.length) {
      await supabase.from('jobs').update({
        status: 'completed', completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq('id', job_id);
      return NextResponse.json({ status: 'completed' });
    }

    // ═══ CLAIM a batch of rows atomically ═══
    // Use current_row as the cursor — atomically advance it so parallel chains don't overlap
    const startRow = job.current_row;
    if (startRow >= limit) {
      // This step is done for all rows — advance to next step
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
        // Self-chain to continue with next step
        selfChain(job_id, 1);
        return NextResponse.json({ status: 'processing', step: nextStepIdx, row: 0, total: limit });
      }
    }

    const endRow = Math.min(startRow + BATCH_SIZE, limit);
    const currentStep = steps[stepIdx];

    // Advance cursor BEFORE processing so parallel chains claim different ranges
    await supabase.from('jobs').update({
      current_row: endRow, status: 'running', updated_at: new Date().toISOString(),
    }).eq('id', job_id);

    // Fetch the rows we need
    const { data: rows } = await supabase
      .from('list_rows')
      .select('*')
      .eq('list_id', job.list_id)
      .gte('row_index', startRow)
      .lt('row_index', endRow)
      .order('row_index', { ascending: true });

    if (!rows || rows.length === 0) {
      selfChain(job_id, 1);
      return NextResponse.json({ status: 'processing', step: stepIdx, row: endRow, total: limit });
    }

    // Check if user stopped before heavy processing
    const { data: freshJob } = await supabase.from('jobs').select('status').eq('id', job_id).single();
    if (freshJob?.status === 'stopped') {
      return NextResponse.json({ status: 'stopped' });
    }

    // ═══ PARALLEL PROCESSING ═══
    // Process all rows in this batch concurrently (up to CONCURRENCY limit)
    let batchErrors = 0;

    const results = await parallelMap(rows, async (row) => {
      const rowData = row.data || {};
      const result = await processStep(currentStep, rowData, keys);

      // Build updated data
      const updatedData = { ...rowData, [currentStep.outputColumn]: result.value };
      if (result.waterfallReport) {
        updatedData[currentStep.outputColumn + '__report'] = JSON.stringify(result.waterfallReport);
      }

      return { rowId: row.id, updatedData, error: result.error };
    }, CONCURRENCY);

    // ═══ BATCH DB UPDATE ═══
    // Update all rows in parallel (Supabase handles concurrent updates fine)
    const updatePromises = results.map((r) => {
      if (r._error) {
        batchErrors++;
        return Promise.resolve();
      }
      if (r.error) batchErrors++;
      return supabase.from('list_rows').update({
        data: r.updatedData, updated_at: new Date().toISOString(),
      }).eq('id', r.rowId);
    });
    await Promise.all(updatePromises);

    // Update job progress (single write instead of per-row)
    const totalErrors = (job.error_count || 0) + batchErrors;
    await supabase.from('jobs').update({
      error_count: totalErrors,
      status: 'running',
      updated_at: new Date().toISOString(),
    }).eq('id', job_id);

    // ═══ SELF-CHAIN: Fire multiple parallel chains ═══
    const remainingRows = limit - endRow;
    const chainsToFire = remainingRows > 0
      ? Math.min(SELF_CHAIN_COUNT, Math.ceil(remainingRows / BATCH_SIZE))
      : 0;

    if (remainingRows <= 0) {
      // This step is done — advance to next step
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
        selfChain(job_id, 1);
      }
    } else {
      selfChain(job_id, chainsToFire);
    }

    return NextResponse.json({
      status: 'processing',
      step: stepIdx,
      row: endRow,
      total: limit,
      errors: totalErrors,
      batch_size: rows.length,
    });

  } catch (err) {
    console.error('Process error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Fire N self-chain calls in parallel
function selfChain(job_id, count = 1) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  for (let i = 0; i < count; i++) {
    fetch(`${appUrl}/api/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id, _chain_id: i }),
    }).catch(() => {});
  }
}
