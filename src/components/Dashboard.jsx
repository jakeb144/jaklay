'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createBrowserClient } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { INTEGRATIONS } from '@/lib/engine';
import Papa from 'papaparse';

const STEP_TYPES = [
  { id: "ai_enrich", label: "Use AI", icon: "🤖", desc: "AI enrichment with custom prompts", cat: "enrichment" },
  { id: "web_research", label: "Web Research", icon: "🌐", desc: "Search web via Perplexity", cat: "enrichment" },
  { id: "api_verify", label: "Verify Email", icon: "✅", desc: "Email verification", cat: "enrichment" },
  { id: "api_find_email", label: "Find Email", icon: "📧", desc: "Find work email for contact", cat: "enrichment" },
  { id: "waterfall", label: "Waterfall", icon: "💧", desc: "Try multiple sources sequentially", cat: "enrichment" },
  { id: "formula", label: "Formula", icon: "ƒ", desc: "Compute from other columns", cat: "logic" },
  { id: "condition_gate", label: "Conditional", icon: "⑂", desc: "Only run if condition met", cat: "logic" },
  { id: "api_push", label: "Push to Tool", icon: "⚡", desc: "Send to Instantly, CRM", cat: "action" },
  { id: "scrape", label: "Scrape", icon: "🕷️", desc: "Apify/PhantomBuster extraction", cat: "enrichment" },
];

const PROMPT_LIBRARY = [
  { id: "qualify_b2b", name: "Qualify B2B Fit", cat: "Qualification", model: "gpt-4o-mini", provider: "openai",
    reason: "Fast + cheap for binary yes/no classification",
    prompt: "Given this company:\n\nCompany: {company_name}\nWebsite: {website}\nDescription: {description}\n\nAre they a good fit for cold email outbound? Good fit = sells to businesses, sells software/services, traditionally uses cold outreach.\n\nOutput ONLY: YES or NO" },
  { id: "find_owner", name: "Find Owner/Decision Maker", cat: "Research", model: "sonar", provider: "perplexity",
    reason: "Perplexity has live web access to look up real people",
    prompt: "For {company_name} ({website}), find the owner, CEO, or key decision maker.\n\nReturn ONLY:\nName: [name]\nTitle: [title]\n\nIf unknown: NOT FOUND" },
  { id: "pr_article", name: "Generate PR Article Title", cat: "Personalization", model: "claude-sonnet-4-20250514", provider: "anthropic",
    reason: "Claude Sonnet excels at creative, nuanced writing",
    prompt: "For this company:\n\nCompany: {company_name}\nIndustry: {industry}\nDescription: {description}\n\nWrite one compelling, realistic PR article title a firm might pitch for them. ONLY the title." },
  { id: "match_pr", name: "Match Best PR Firm", cat: "Research", model: "sonar-pro", provider: "perplexity",
    reason: "Sonar Pro gives deep web research with citations",
    prompt: "Find the most relevant PR firm for:\n\nCompany: {company_name}\nIndustry: {industry}\nLocation: {city}, {state}\n\nReturn:\nFirm: [name]\nWhy: [1 sentence]\nContact: [if found]" },
  { id: "cold_email", name: "Write Personalized Cold Email", cat: "Outreach", model: "claude-opus-4-20250514", provider: "anthropic",
    reason: "Opus delivers the most human, genuinely personal copy",
    prompt: "Write a cold email for:\n\nTo: {first_name} {last_name}, {title} at {company_name}\nThey do: {description}\nOur offer: [FILL IN YOUR OFFER]\n\nRules: Max 100 words, open with something specific about THEIR company, one clear CTA, casual founder tone, no salesy language.\n\nFormat:\nSubject: [subject]\n\n[body]" },
  { id: "confidence", name: "Data Confidence Score", cat: "Quality", model: "gpt-4o-mini", provider: "openai",
    reason: "Simple classification — 4o-mini is fast/cheap for this",
    prompt: "Rate confidence of this data:\nField: {field_name}\nValue: {field_value}\n\nOutput ONLY: HIGH, MEDIUM, or LOW" },
];

const INTEG_SETUP = {
  anthropic: { icon: "🟣", name: "Claude (Anthropic)", type: "ai", setup: "1. console.anthropic.com → API Keys\n2. Generate key (sk-ant-...)\n3. Paste in Keys panel" },
  openai: { icon: "🟢", name: "OpenAI", type: "ai", setup: "1. platform.openai.com → API Keys\n2. Create secret key\n3. Paste in Keys panel" },
  perplexity: { icon: "🔵", name: "Perplexity", type: "ai", setup: "1. perplexity.ai/settings/api\n2. Generate API key\n3. Best for: web research (live internet)" },
  millionverifier: { icon: "✅", name: "MillionVerifier", type: "verification", setup: "1. millionverifier.com → Sign up\n2. Dashboard → API key\n3. ~$0.0005/email (500 free)" },
  emaillable: { icon: "📬", name: "Emaillable", type: "verification", setup: "1. emaillable.com → Sign up\n2. Dashboard → API Key\n3. Great for re-verifying catch-alls/riskys\n4. Returns: deliverable, risky, undeliverable, unknown + score\n\nPricing: 1,000 free, then ~$0.003/email" },
  bounceban: { icon: "🛡️", name: "BounceBan", type: "verification", setup: "1. bounceban.com → Sign up\n2. Dashboard → API Key\n3. Specializes in catch-all detection\n4. Returns: valid, invalid, disposable, catch_all, unknown\n\nPricing: 100 free, ~$0.002/email" },
  findymail: { icon: "📧", name: "FindyMail", type: "email_finder", setup: "1. findymail.com → Settings → API\n2. ~$0.02/email found" },
  hunter: { icon: "🔶", name: "Hunter.io", type: "email_finder", setup: "1. hunter.io → API → Copy key\n2. 25 free searches/mo" },
  prospeo: { icon: "🔴", name: "Prospeo", type: "email_finder", setup: "1. prospeo.io → Account → API Key" },
  dropcontact: { icon: "🟦", name: "DropContact", type: "email_finder", setup: "1. dropcontact.com → Settings → API" },
  leadmagic: { icon: "🟪", name: "LeadMagic", type: "email_finder", setup: "1. leadmagic.io → Dashboard → API Key" },
  datagma: { icon: "🔷", name: "Datagma", type: "email_finder", setup: "1. datagma.com → API section" },
  wiza: { icon: "🟨", name: "Wiza", type: "email_finder", setup: "1. wiza.co → Settings → API" },
  rocketreach: { icon: "🚀", name: "RocketReach", type: "email_finder", setup: "1. rocketreach.co → Integrations → API" },
  instantly: { icon: "⚡", name: "Instantly", type: "outreach", setup: "1. instantly.ai → Settings → Integrations → API\n2. Used to push leads into campaigns" },
  apify: { icon: "🕷️", name: "Apify", type: "scraping", setup: "1. apify.com → Settings → API Tokens\n2. Free $5/mo. Google Maps, LinkedIn, social" },
  phantombuster: { icon: "👻", name: "PhantomBuster", type: "scraping", setup: "1. phantombuster.com → Account → API Keys" },
  ocean: { icon: "🌊", name: "Ocean.io", type: "data", setup: "1. ocean.io → Settings → API" },
  google_search: { icon: "🔍", name: "Serper (Google)", type: "scraping", setup: "1. serper.dev → Dashboard → API Key\n2. 2,500 free searches" },
};

let _uid = 0;
const uid = () => 's' + Date.now().toString(36) + (++_uid).toString(36);

const PROVIDER_COSTS = {
  hunter:      { cost: 0.0,  free: 25,  unit: "25 free/mo", tier: "free" },
  leadmagic:   { cost: 0.1,  free: 50,  unit: "$0.001/lookup", tier: "$" },
  wiza:        { cost: 0.15, free: 20,  unit: "$0.0015/lookup", tier: "$" },
  prospeo:     { cost: 0.2,  free: 75,  unit: "75 free credits", tier: "$" },
  dropcontact: { cost: 0.24, free: 25,  unit: "€0.0024/lookup", tier: "$" },
  datagma:     { cost: 0.3,  free: 50,  unit: "$0.003/lookup", tier: "$" },
  findymail:   { cost: 2.0,  free: 0,   unit: "$0.02/lookup", tier: "$$" },
  rocketreach: { cost: 4.8,  free: 5,   unit: "$0.048/lookup", tier: "$$$" },
};

function sortSourcesByCost(sources) {
  return [...sources].sort((a, b) => (PROVIDER_COSTS[a]?.cost || 99) - (PROVIDER_COSTS[b]?.cost || 99));
}

// ─── Waterfall Report Component ──────────────────────────────────────────────

function WaterfallReport({ rows, stepOutputCol }) {
  if (!rows || rows.length === 0) return null;

  // Aggregate reports from all rows
  const stats = {};
  let totalProcessed = 0;
  let totalFound = 0;

  rows.forEach(row => {
    const reportJson = row.data?.[stepOutputCol + '__report'];
    if (!reportJson) return;
    totalProcessed++;
    let report;
    try { report = JSON.parse(reportJson); } catch { return; }

    if (report.winner) totalFound++;

    (report.attempts || []).forEach(a => {
      if (!stats[a.source]) stats[a.source] = { found: 0, not_found: 0, error: 0, no_key: 0, skipped: 0, totalMs: 0, calls: 0 };
      stats[a.source][a.status] = (stats[a.source][a.status] || 0) + 1;
      stats[a.source].totalMs += a.durationMs || 0;
      if (a.status !== 'no_key' && a.status !== 'skipped') stats[a.source].calls++;
    });
  });

  if (totalProcessed === 0) return <div className="p-3 text-xs text-gray-400 text-center">No waterfall data yet. Run the step first.</div>;

  const sortedSources = Object.entries(stats).sort((a, b) => (PROVIDER_COSTS[a[0]]?.cost || 99) - (PROVIDER_COSTS[b[0]]?.cost || 99));

  return (
    <div className="space-y-2">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-gray-50 rounded-lg p-2.5 text-center">
          <div className="text-lg font-bold text-gray-800">{totalProcessed}</div>
          <div className="text-[10px] text-gray-400">Processed</div>
        </div>
        <div className="bg-emerald-50 rounded-lg p-2.5 text-center">
          <div className="text-lg font-bold text-emerald-600">{totalFound}</div>
          <div className="text-[10px] text-emerald-500">Found</div>
        </div>
        <div className="bg-red-50 rounded-lg p-2.5 text-center">
          <div className="text-lg font-bold text-red-500">{totalProcessed - totalFound}</div>
          <div className="text-[10px] text-red-400">Not Found</div>
        </div>
      </div>

      {/* Per-source breakdown */}
      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider pt-2">Per-Source Breakdown (cheapest → most expensive)</div>
      {sortedSources.map(([source, s]) => {
        const integ = INTEG_SETUP[source];
        const cost = PROVIDER_COSTS[source];
        const total = s.found + s.not_found + s.error;
        const hitRate = total > 0 ? Math.round((s.found / total) * 100) : 0;
        const avgMs = s.calls > 0 ? Math.round(s.totalMs / s.calls) : 0;
        const estSpend = cost ? (s.calls * cost.cost / 100).toFixed(2) : '?';
        const freeRemaining = cost ? Math.max(0, cost.free - s.calls) : null;

        return (
          <div key={source} className="p-3 bg-gray-50 rounded-lg border border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <span>{integ?.icon || '●'}</span>
              <span className="font-semibold text-xs flex-1">{integ?.name || source}</span>
              <span className="text-[10px] text-gray-400 font-mono">{cost?.unit || ''}</span>
            </div>

            {/* Stats bar */}
            {total > 0 && (
              <div className="flex h-2 rounded-full overflow-hidden mb-2 bg-gray-200">
                {s.found > 0 && <div className="bg-emerald-500 transition-all" style={{ width: (s.found/total*100)+'%' }} />}
                {s.not_found > 0 && <div className="bg-gray-300 transition-all" style={{ width: (s.not_found/total*100)+'%' }} />}
                {s.error > 0 && <div className="bg-red-400 transition-all" style={{ width: (s.error/total*100)+'%' }} />}
              </div>
            )}

            <div className="grid grid-cols-4 gap-1 text-[10px]">
              <div><span className="font-semibold text-emerald-600">{s.found}</span> <span className="text-gray-400">found</span></div>
              <div><span className="font-semibold text-gray-500">{s.not_found}</span> <span className="text-gray-400">miss</span></div>
              <div><span className="font-semibold text-red-500">{s.error}</span> <span className="text-gray-400">err</span></div>
              <div><span className="font-semibold text-indigo-600">{hitRate}%</span> <span className="text-gray-400">rate</span></div>
            </div>

            <div className="flex items-center gap-3 mt-1.5 text-[10px]">
              <span className="text-gray-400">{s.calls} API calls</span>
              <span className="text-gray-400">avg {avgMs}ms</span>
              <span className="text-gray-500 font-medium">~${estSpend} spent</span>
            </div>

            {/* Free tier warning */}
            {freeRemaining !== null && cost.free > 0 && (
              <div className={['mt-1.5 px-2 py-1 rounded text-[10px] font-medium',
                freeRemaining === 0 ? 'bg-red-50 text-red-600' : freeRemaining < 10 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'].join(' ')}>
                {freeRemaining === 0
                  ? '⚠️ Free tier exhausted — now paying per lookup. Top up or remove from waterfall.'
                  : freeRemaining < 10
                    ? '⚡ ~' + freeRemaining + ' free lookups remaining'
                    : '✓ ~' + freeRemaining + ' of ' + cost.free + ' free lookups remaining'}
              </div>
            )}

            {/* No key warning */}
            {s.no_key > 0 && (
              <div className="mt-1.5 px-2 py-1 rounded bg-red-50 text-red-500 text-[10px] font-medium">
                🔑 No API key set — {s.no_key} rows skipped. Add key in Keys panel.
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Column type detection and auto-mapping ──────────────────────────────────

const COLUMN_TYPE_MAP = {
  first_name: [/^first.?name/i, /^first$/i, /^fname/i, /^given.?name/i],
  last_name: [/^last.?name/i, /^last$/i, /^lname/i, /^surname/i],
  full_name: [/^full.?name/i, /^name$/i, /^contact.?name/i],
  email: [/^e.?mail$/i, /^email.?address/i, /^work.?email/i, /^primary.?email/i],
  company_name: [/^company$/i, /^company.?name/i, /^organization/i, /^companyname/i],
  job_title: [/^title$/i, /^job.?title/i, /^position/i, /^headline/i, /^jobtitle/i],
  phone: [/^phone$/i, /^phone.?number/i, /^mobile/i, /^company.?phone/i],
  website: [/^website$/i, /^url$/i, /^domain$/i, /^company.?website/i],
  linkedin: [/^linkedin$/i, /^linkedin.?url/i, /^company.?linkedin/i],
  city: [/^city$/i, /^company.?city/i],
  state: [/^state$/i, /^province/i, /^company.?state/i],
  country: [/^country$/i, /^company.?country/i],
  industry: [/^industry$/i, /^sector/i],
  revenue: [/^revenue/i, /^annual.?rev/i, /^company.?annual/i],
  employee_count: [/^employee/i, /^headcount/i, /^company.?size/i],
};

function detectColumnType(colName) {
  for (const [stdName, patterns] of Object.entries(COLUMN_TYPE_MAP)) {
    if (patterns.some(p => p.test(colName))) return stdName;
  }
  return null;
}

function buildColumnTypeMap(columns) {
  const map = {};
  columns.forEach(col => { const type = detectColumnType(col); if (type) map[col] = type; });
  return map;
}

const corePatterns = [/^first/i, /^last/i, /name/i, /company/i, /domain/i, /website/i, /email/i, /phone/i, /title/i, /city/i, /state/i, /country/i, /industry/i];

function autoSortColumns(orig, enrich) {
  const core = [], other = [];
  orig.forEach(c => (corePatterns.some(p => p.test(c)) ? core : other).push(c));
  return [...core, ...enrich, ...other];
}

const TEMPLATE_PRESETS = [
  { name: "Lead List (Basic)", cols: ["first_name","last_name","email","company_name","job_title","phone"] },
  { name: "Lead List (Full)", cols: ["first_name","last_name","email","company_name","job_title","phone","website","linkedin","city","state","country","industry"] },
  { name: "Company List", cols: ["company_name","website","industry","city","state","country","employee_count","revenue"] },
  { name: "Email Campaign", cols: ["first_name","last_name","email","company_name","job_title","campaign_name"] },
];

function ContextMenu({ x, y, onSelect, onClose }) {
  useEffect(() => { const h = () => onClose(); window.addEventListener('click', h); return () => window.removeEventListener('click', h); }, [onClose]);
  return (
    <div style={{ position: 'fixed', top: y, left: x, zIndex: 9999 }} className="bg-white rounded-xl shadow-xl border border-gray-200 py-2 min-w-[220px] animate-in">
      <div className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Add Enrichment Column</div>
      {['enrichment','logic','action'].map(cat => (
        <div key={cat}>
          <div className="px-3 pt-2 pb-0.5 text-[9px] text-gray-300 uppercase tracking-wider">{cat}</div>
          {STEP_TYPES.filter(s => s.cat === cat).map(st => (
            <button key={st.id} onClick={() => onSelect(st.id)} className="flex items-center gap-2.5 w-full px-3 py-1.5 text-left hover:bg-indigo-50 transition text-sm">
              <span>{st.icon}</span><span className="font-medium text-xs">{st.label}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function ConditionBuilder({ cond, columns, onChange, apiKeys }) {
  const c = cond || { column: "", operator: "equals", value: "" };
  const ops = ["equals","not_equals","contains","not_contains","is_empty","is_not_empty","greater_than","less_than","starts_with"];
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const generateCondition = async () => {
    if (!aiInput.trim()) return;
    const key = apiKeys?.openai;
    if (!key) { alert("Add your OpenAI key in the Keys panel first."); return; }
    setAiLoading(true);
    try {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
        body: JSON.stringify({
          model: "gpt-4o-mini", max_tokens: 200,
          messages: [
            { role: "system", content: "You convert plain English conditions into structured JSON. Available columns: " + columns.join(", ") + ". Available operators: " + ops.join(", ") + ". Return ONLY a JSON object with keys: column, operator, value. No markdown, no explanation. Examples:\n\"only run for people I haven't emailed yet\" → {\"column\":\"email_status\",\"operator\":\"is_empty\",\"value\":\"\"}\n\"only if qualified is yes\" → {\"column\":\"qualified\",\"operator\":\"equals\",\"value\":\"YES\"}\n\"skip if email is invalid\" → {\"column\":\"mv_result\",\"operator\":\"not_equals\",\"value\":\"ok\"}\nPick the most logical column name from the available columns. If the user refers to a concept, map it to the closest matching column." },
            { role: "user", content: aiInput }
          ],
        }),
      });
      const d = await r.json();
      const text = d.choices?.[0]?.message?.content || "";
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      if (parsed.column && parsed.operator) onChange(parsed);
    } catch (e) { alert("Couldn't parse that — try being more specific about which column."); }
    setAiLoading(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] text-gray-400 font-bold uppercase">Run if</span>
        <select value={c.column} onChange={e => onChange({...c, column: e.target.value})} className="text-xs border border-gray-200 rounded-md px-2 py-1 bg-white outline-none">
          <option value="">Always</option>
          {columns.map(col => <option key={col} value={col}>{col}</option>)}
        </select>
        {c.column && <>
          <select value={c.operator} onChange={e => onChange({...c, operator: e.target.value})} className="text-xs border border-gray-200 rounded-md px-2 py-1 bg-white">
            {ops.map(o => <option key={o} value={o}>{o.replace(/_/g," ")}</option>)}
          </select>
          {!["is_empty","is_not_empty"].includes(c.operator) && (
            <input value={c.value||""} onChange={e => onChange({...c, value: e.target.value})} placeholder="value" className="text-xs border border-gray-200 rounded-md px-2 py-1 bg-white w-24" />
          )}
        </>}
      </div>
      {/* AI plain-English condition builder */}
      <div className="flex gap-1.5">
        <input value={aiInput} onChange={e => setAiInput(e.target.value)} placeholder="Describe in plain English... e.g. 'only people I haven't emailed yet'"
          onKeyDown={e => { if (e.key === 'Enter') generateCondition(); }}
          className="flex-1 text-xs border border-indigo-200 rounded-md px-2 py-1.5 bg-indigo-50/50 placeholder-indigo-300 outline-none focus:ring-1 focus:ring-indigo-300" />
        <button onClick={generateCondition} disabled={aiLoading}
          className="px-2.5 py-1 bg-indigo-500 text-white rounded-md text-[10px] font-semibold hover:bg-indigo-600 disabled:opacity-50 whitespace-nowrap">
          {aiLoading ? "..." : "✨ AI"}
        </button>
      </div>
    </div>
  );
}

function WaterfallBuilder({ sources, onUpdate, keys }) {
  const finders = Object.entries(INTEG_SETUP).filter(([,v]) => v.type === "email_finder");
  const autoSort = () => onUpdate(sortSourcesByCost(sources));
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] text-gray-400">Tries each in order. Stops when valid email found.</p>
        <button onClick={autoSort} className="text-[10px] text-indigo-500 font-semibold hover:underline">Sort by cost ↑</button>
      </div>
      {sources.map((src, i) => {
        const cost = PROVIDER_COSTS[src];
        return (
          <div key={src+i} className="flex items-center gap-2 px-2.5 py-2 bg-gray-50 rounded-lg mb-1 border border-gray-100 group">
            <span className="text-gray-300 cursor-grab text-xs">☰</span>
            <span className="text-sm">{INTEG_SETUP[src]?.icon}</span>
            <div className="flex-1 min-w-0">
              <span className="text-xs font-medium">{INTEG_SETUP[src]?.name || src}</span>
              {cost && <span className="ml-1.5 text-[9px] text-gray-400 font-mono">{cost.unit}</span>}
            </div>
            <span className="text-[10px] text-gray-300 font-mono">{i+1}</span>
            {cost?.free > 0 && <span className="text-[9px] text-amber-500 font-medium">{cost.free} free</span>}
            {keys[src] ? <span className="text-[9px] text-emerald-500 font-semibold">READY</span> : <span className="text-[9px] text-red-400">NO KEY</span>}
            <button onClick={() => { const a=[...sources]; if(i>0){[a[i-1],a[i]]=[a[i],a[i-1]]; onUpdate(a);} }} className="opacity-0 group-hover:opacity-100 text-[10px] text-gray-400">↑</button>
            <button onClick={() => { const a=[...sources]; if(i<a.length-1){[a[i],a[i+1]]=[a[i+1],a[i]]; onUpdate(a);} }} className="opacity-0 group-hover:opacity-100 text-[10px] text-gray-400">↓</button>
            <button onClick={() => onUpdate(sources.filter((_,idx) => idx!==i))} className="opacity-0 group-hover:opacity-100 text-red-400 text-xs">×</button>
          </div>
        );
      })}
      <select onChange={e => { if(e.target.value) { onUpdate(sortSourcesByCost([...sources, e.target.value])); e.target.value=""; }}} className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 mt-1.5 bg-white w-full" defaultValue="">
        <option value="">+ Add source (auto-sorted by cost)...</option>
        {finders.filter(([id]) => !sources.includes(id))
          .sort(([a],[b]) => (PROVIDER_COSTS[a]?.cost||99) - (PROVIDER_COSTS[b]?.cost||99))
          .map(([id,v]) => {
            const c = PROVIDER_COSTS[id];
            return <option key={id} value={id}>{v.icon} {v.name} {c ? '('+c.unit+')' : ''}</option>;
          })}
      </select>
    </div>
  );
}

function StepConfig({ step, columns, keys, onUpdate, onDelete, onDuplicate, rows, colTypeMap }) {
  const u = (f,v) => onUpdate({...step,[f]:v});
  const aiProviders = Object.entries(INTEG_SETUP).filter(([,v]) => v.type === "ai");
  const emailFinders = Object.entries(INTEG_SETUP).filter(([,v]) => v.type === "email_finder");
  const verifiers = Object.entries(INTEG_SETUP).filter(([,v]) => v.type === "verification");
  const models = INTEGRATIONS[step.provider]?.models || [];
  const stepType = STEP_TYPES.find(t => t.id === step.type);
  const [rowRange, setRowRange] = useState(step.rowRange || ''); // e.g. "1-50" or "5,10,15"

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
        <span className="text-xl">{stepType?.icon}</span>
        <div className="flex-1">
          <div className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">{stepType?.label}</div>
          <input value={step.outputColumn||""} onChange={e => u("outputColumn", e.target.value)} placeholder="Column name..."
            className="w-full mt-1 px-0 py-1 bg-transparent border-0 border-b-2 border-gray-200 text-base font-bold focus:outline-none focus:border-indigo-500 transition" />
        </div>
        <div className="flex gap-1">
          <button onClick={onDuplicate} title="Duplicate" className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 text-sm">⧉</button>
          <button onClick={onDelete} title="Delete" className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-red-400 text-sm">🗑</button>
        </div>
      </div>

      <details className="group">
        <summary className="cursor-pointer text-[11px] font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1">
          <span className="group-open:rotate-90 transition-transform text-[10px]">▶</span>
          Condition {step.condition?.column && <span className="text-indigo-500 normal-case">· {step.condition.column} {step.condition.operator}</span>}
        </summary>
        <div className="mt-2 p-2.5 bg-gray-50 rounded-lg border border-gray-100">
          <ConditionBuilder cond={step.condition} columns={columns} onChange={c => u("condition",c)} apiKeys={keys} />
        </div>
      </details>

      {(step.type === "ai_enrich" || step.type === "web_research") && <>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase">Provider</label>
            <select value={step.provider||"openai"} onChange={e => { u("provider",e.target.value); const m = INTEGRATIONS[e.target.value]?.models?.[0]; if(m) u("model",m.id); }}
              className="w-full mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium outline-none">
              {aiProviders.map(([id,v]) => <option key={id} value={id}>{v.icon} {v.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase">Model</label>
            <select value={step.model||""} onChange={e => u("model",e.target.value)}
              className="w-full mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium outline-none">
              {models.map(m => <option key={m.id} value={m.id}>{m.label} (${m.cost})</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="text-[10px] font-bold text-gray-400 uppercase">Quick Load Prompt</label>
          <select onChange={e => { const p = PROMPT_LIBRARY.find(x => x.id === e.target.value); if(p) onUpdate({...step, prompt: p.prompt, provider: p.provider, model: p.model}); }}
            className="w-full mt-1 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg text-xs text-indigo-700 font-medium cursor-pointer hover:bg-indigo-100 transition" defaultValue="">
            <option value="">📚 Select a template to load into editor...</option>
            {PROMPT_LIBRARY.map(p => <option key={p.id} value={p.id}>{p.cat}: {p.name} → {p.model}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-bold text-gray-400 uppercase">Prompt</label>
          <textarea value={step.prompt||""} onChange={e => u("prompt",e.target.value)} rows={8} placeholder="Write your prompt here. Use {column_name} to reference row data..."
            className="w-full mt-1 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono resize-y focus:outline-none focus:ring-2 focus:ring-indigo-200 leading-relaxed" />
          {/* Variable insertion: dropdown + chips */}
          <div className="mt-1.5 space-y-1.5">
            <select onChange={e => { if(e.target.value) { u("prompt",(step.prompt||"")+"{"+e.target.value+"}"); e.target.value=""; }}}
              className="w-full text-xs border border-indigo-200 rounded-lg px-2.5 py-1.5 bg-indigo-50/50 text-indigo-700" defaultValue="">
              <option value="">📎 Insert column variable...</option>
              {columns.filter(c => !c.startsWith('__')).map(c => {
                const stdType = colTypeMap?.[c];
                return <option key={c} value={c}>{"{"+c+"}"}{stdType ? " → " + stdType : ""}</option>;
              })}
            </select>
            <div className="flex flex-wrap gap-1">
              {columns.filter(c => !c.startsWith('__')).slice(0,15).map(c => {
                const stdType = colTypeMap?.[c];
                return (
                  <button key={c} onClick={() => u("prompt",(step.prompt||"")+"{"+c+"}")}
                    className="px-2 py-0.5 bg-indigo-50 border border-indigo-100 rounded text-[10px] text-indigo-600 font-mono hover:bg-indigo-100 transition" title={stdType ? "Detected: "+stdType : c}>
                    {stdType ? "📌" : ""}{"{"+c+"}"}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </>}

      {step.type === "api_verify" && <>
        <div>
          <label className="text-[10px] font-bold text-gray-400 uppercase">Provider</label>
          <select value={step.verifyProvider||"millionverifier"} onChange={e => u("verifyProvider",e.target.value)}
            className="w-full mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm">
            {verifiers.map(([id,v]) => <option key={id} value={id}>{v.icon} {v.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-bold text-gray-400 uppercase">Email Column</label>
          <select value={step.emailColumn||""} onChange={e => u("emailColumn",e.target.value)}
            className="w-full mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm">
            <option value="">Select column...</option>
            {columns.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg space-y-1 text-[11px] text-gray-400">
          <p><strong className="text-gray-500">MillionVerifier:</strong> ok, catch_all, invalid, error, unknown</p>
          <p><strong className="text-gray-500">Emaillable:</strong> deliverable, risky, undeliverable, unknown + score</p>
          <p><strong className="text-gray-500">BounceBan:</strong> valid, invalid, disposable, catch_all, unknown</p>
          <p className="text-indigo-500 pt-1">💡 Use MV first → then Emaillable or BounceBan to re-verify catch-alls</p>
        </div>
      </>}

      {step.type === "api_find_email" && <>
        <div>
          <label className="text-[10px] font-bold text-gray-400 uppercase">Provider</label>
          <select value={step.emailProvider||"findymail"} onChange={e => u("emailProvider",e.target.value)}
            className="w-full mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm">
            {emailFinders.map(([id,v]) => <option key={id} value={id}>{v.icon} {v.name}</option>)}
          </select>
        </div>
        {["fnCol","lnCol","domainCol"].map(f => (
          <div key={f}>
            <label className="text-[10px] font-bold text-gray-400 uppercase">{f==="fnCol"?"First Name":f==="lnCol"?"Last Name":"Domain/Website"} column</label>
            <select value={step[f]||""} onChange={e => u(f,e.target.value)} className="w-full mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm">
              <option value="">Select...</option>
              {columns.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        ))}
      </>}

      {step.type === "waterfall" && <>
        <div className="grid grid-cols-3 gap-2">
          {["fnCol","lnCol","domainCol"].map(f => (
            <div key={f}>
              <label className="text-[9px] font-bold text-gray-400 uppercase">{f==="fnCol"?"First":f==="lnCol"?"Last":"Domain"}</label>
              <select value={step[f]||""} onChange={e => u(f,e.target.value)} className="w-full mt-0.5 text-xs border border-gray-200 rounded-md px-2 py-1 bg-white">
                <option value="">—</option>
                {columns.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          ))}
        </div>
        <WaterfallBuilder sources={step.waterfallSources||[]} onUpdate={s => u("waterfallSources",s)} keys={keys} />

        {/* Waterfall Report */}
        {step.outputColumn && rows && rows.length > 0 && (
          <details open className="mt-3 group">
            <summary className="cursor-pointer text-[11px] font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1.5 pb-2 border-b border-gray-100">
              <span className="group-open:rotate-90 transition-transform text-[10px]">▶</span>
              📊 Waterfall Report
            </summary>
            <div className="mt-2">
              <WaterfallReport rows={rows} stepOutputCol={step.outputColumn} />
            </div>
          </details>
        )}
      </>}

      {step.type === "formula" && <div>
        <label className="text-[10px] font-bold text-gray-400 uppercase">Formula</label>
        <textarea value={step.formula||""} onChange={e => u("formula",e.target.value)} rows={4}
          placeholder='IF {mv_result} is "ok" THEN {email} ELSE ""'
          className="w-full mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono resize-y leading-relaxed" />
        <div className="text-[10px] text-gray-400 mt-1.5 space-y-0.5">
          <p><code className="bg-gray-100 px-1 rounded">IF {"{col}"} is "val" THEN {"{col2}"} ELSE {"{col3}"}</code></p>
          <p><code className="bg-gray-100 px-1 rounded">output {"{email}"} IF {"{mv}"} is "ok" OR {"{fm}"} is "ok"</code></p>
          <p><code className="bg-gray-100 px-1 rounded">CONCAT({"{first}"}, " ", {"{last}"})</code></p>
        </div>
      </div>}

      {step.type === "api_push" && <>
        <div>
          <label className="text-[10px] font-bold text-gray-400 uppercase">Campaign ID</label>
          <input value={step.campaignId||""} onChange={e => u("campaignId",e.target.value)} placeholder="From Instantly dashboard"
            className="w-full mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm" />
        </div>
        <div>
          <label className="text-[10px] font-bold text-gray-400 uppercase">Email column</label>
          <select value={step.emailColumn||""} onChange={e => u("emailColumn",e.target.value)}
            className="w-full mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm">
            <option value="">Select...</option>
            {columns.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </>}

      {/* Row Range Selector — applies to all step types */}
      <details className="group mt-2 pt-2 border-t border-gray-100">
        <summary className="cursor-pointer text-[11px] font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1">
          <span className="group-open:rotate-90 transition-transform text-[10px]">▶</span>
          Run Specific Rows {rowRange && <span className="text-indigo-500 normal-case">· {rowRange}</span>}
        </summary>
        <div className="mt-2 space-y-2">
          <input value={rowRange} onChange={e => { setRowRange(e.target.value); u("rowRange", e.target.value); }}
            placeholder="e.g. 1-50 or 5,10,15,20 or leave blank for all"
            className="w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5 bg-white font-mono" />
          <div className="flex flex-wrap gap-1">
            {[{l:"First 10",v:"1-10"},{l:"First 50",v:"1-50"},{l:"First 100",v:"1-100"},{l:"All",v:""}].map(({l,v}) => (
              <button key={l} onClick={() => { setRowRange(v); u("rowRange",v); }}
                className={["px-2 py-0.5 rounded text-[10px] border transition",
                  rowRange===v ? "bg-indigo-500 text-white border-indigo-500" : "bg-white border-gray-200 text-gray-500 hover:border-indigo-300"].join(" ")}>{l}</button>
            ))}
          </div>
          <p className="text-[10px] text-gray-400">Use ranges (1-50) or specific rows (5,10,15). Blank = all rows.</p>
        </div>
      </details>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
export default function Dashboard() {
  const auth = useAuth();
  const [supabase] = useState(() => auth.supabase || createBrowserClient());
  const userId = auth.user?.id || 'default';
  const [keys, setKeys] = useState({});
  const [lists, setLists] = useState([]);
  const [currentListId, setCurrentListId] = useState(null);
  const [rows, setRows] = useState([]);
  const [origColumns, setOrigColumns] = useState([]);
  const [steps, setSteps] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [selectedStep, setSelectedStep] = useState(null);
  const [panel, setPanel] = useState(null);
  const [testMode, setTestMode] = useState(0);
  const [editCell, setEditCell] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [runningStep, setRunningStep] = useState(null);
  const [runProgress, setRunProgress] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [columnOrder, setColumnOrder] = useState(null);
  const [dragCol, setDragCol] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);
  const [templateColumns, setTemplateColumns] = useState([]);
  const [colTypeMap, setColTypeMap] = useState({}); // original col name → detected standard type
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [filters, setFilters] = useState([]); // [{ column, operator, value }]
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [showMergePanel, setShowMergePanel] = useState(false);
  const [mergeFile, setMergeFile] = useState(null);
  const [mergePreview, setMergePreview] = useState(null); // { columns, rows, matchCol }
  const fileRef = useRef();
  const mergeRef = useRef();
  const pollRef = useRef();
  const abortRef = useRef(false);

  const enrichCols = steps.map(s => s.outputColumn).filter(Boolean);
  const baseColumns = origColumns.length > 0 ? origColumns : templateColumns;
  const defaultOrder = autoSortColumns(baseColumns, enrichCols).filter(c => !c.includes('__report'));
  const allColumns = (columnOrder || defaultOrder).filter(c => !c.includes('__report'));
  const hasData = rows.length > 0;
  const hasWorkflow = steps.length > 0;

  // ─── Filter rows ───────────────────────────────────────────────────
  const filteredRows = rows.filter(row => {
    return filters.every(f => {
      if (!f.column) return true;
      const val = (row.data?.[f.column] || "").toString().toLowerCase().trim();
      const target = (f.value || "").toLowerCase().trim();
      switch (f.operator) {
        case "equals": return val === target;
        case "not_equals": return val !== target;
        case "contains": return val.includes(target);
        case "not_contains": return !val.includes(target);
        case "is_empty": return val === "";
        case "is_not_empty": return val !== "";
        case "greater_than": return parseFloat(val) > parseFloat(target);
        case "less_than": return parseFloat(val) < parseFloat(target);
        case "starts_with": return val.startsWith(target);
        default: return true;
      }
    });
  });

  // ─── Sort rows ─────────────────────────────────────────────────────
  const displayRows = sortCol ? [...filteredRows].sort((a, b) => {
    const av = (a.data?.[sortCol] || "").toString();
    const bv = (b.data?.[sortCol] || "").toString();
    const numA = parseFloat(av), numB = parseFloat(bv);
    if (!isNaN(numA) && !isNaN(numB)) return sortDir === 'asc' ? numA - numB : numB - numA;
    return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
  }) : filteredRows;

  // ─── Column click sort ─────────────────────────────────────────────
  const handleSortClick = (col) => {
    if (sortCol === col) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); }
    else { setSortCol(col); setSortDir('asc'); }
  };

  // ─── Get unique values for filter suggestions ──────────────────────
  const getUniqueValues = (col) => {
    const vals = new Set();
    rows.forEach(r => { const v = r.data?.[col]; if (v) vals.add(v.toString()); });
    return [...vals].sort().slice(0, 50);
  };

  // ─── CSV Merge ─────────────────────────────────────────────────────
  const handleMergeFile = (file) => {
    if (!file) return;
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: (results) => {
        setMergePreview({
          columns: results.meta.fields || [],
          rows: results.data,
          matchCol: '',
          targetCol: '',
          mergeColumns: [],
        });
        setShowMergePanel(true);
      },
    });
  };

  const executeMerge = async () => {
    if (!mergePreview?.matchCol || !mergePreview?.targetCol || mergePreview.mergeColumns.length === 0) return;
    const lookup = {};
    mergePreview.rows.forEach(r => {
      const key = (r[mergePreview.matchCol] || "").toString().toLowerCase().trim();
      if (key) lookup[key] = r;
    });

    const updatedRows = rows.map(row => {
      const key = (row.data?.[mergePreview.targetCol] || "").toString().toLowerCase().trim();
      const match = lookup[key];
      if (!match) return row;
      const newData = { ...row.data };
      mergePreview.mergeColumns.forEach(col => {
        if (match[col] !== undefined && match[col] !== "") {
          newData[col] = match[col];
        }
      });
      return { ...row, data: newData };
    });

    // Update in DB
    for (const row of updatedRows) {
      if (row.data !== rows.find(r => r.id === row.id)?.data) {
        await supabase.from('list_rows').update({ data: row.data }).eq('id', row.id);
      }
    }

    // Add new columns to origColumns if needed
    const newCols = mergePreview.mergeColumns.filter(c => !origColumns.includes(c));
    if (newCols.length > 0) {
      const updated = [...origColumns, ...newCols];
      setOrigColumns(updated);
      if (currentListId) {
        await supabase.from('lists').update({ original_columns: updated }).eq('id', currentListId);
      }
    }

    setRows(updatedRows);
    setShowMergePanel(false);
    setMergePreview(null);
  };

  useEffect(() => {
    (async () => {
      const { data: keyData } = await supabase.from('api_keys').select('provider, encrypted_key').eq('user_id',userId);
      const k = {}; (keyData||[]).forEach(r => { k[r.provider] = r.encrypted_key; }); setKeys(k);
      const { data: listData } = await supabase.from('lists').select('*').eq('user_id',userId).order('created_at',{ascending:false});
      setLists(listData || []);
      const { data: wfData } = await supabase.from('workflows').select('*').eq('user_id',userId).order('created_at',{ascending:false});
      setWorkflows(wfData || []);
      setLoaded(true);
    })();
  }, [supabase]);

  useEffect(() => {
    if (!currentListId) return;
    const channel = supabase.channel('list-'+currentListId)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'list_rows', filter: 'list_id=eq.'+currentListId }, (payload) => {
        setRows(prev => prev.map(r => r.id === payload.new.id ? { ...r, data: payload.new.data } : r));
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, currentListId]);

  // Close cell menu on click
  useEffect(() => {
    if (!cellMenu) return;
    const h = () => setCellMenu(null);
    window.addEventListener('click', h);
    return () => window.removeEventListener('click', h);
  }, [cellMenu]);

  

  useEffect(() => { setColumnOrder(null); }, [steps.length, origColumns.length, templateColumns.length]);

  const saveKey = async (provider, key) => {
    setKeys(prev => ({ ...prev, [provider]: key }));
    await supabase.from('api_keys').upsert({ user_id: userId, provider, encrypted_key: key }, { onConflict: 'user_id,provider' });
  };

  const loadListRows = async (listId) => {
    // Supabase defaults to 1000 rows max — paginate to get ALL rows
    let allData = [];
    let from = 0;
    const pageSize = 5000;
    while (true) {
      const { data, error } = await supabase.from('list_rows').select('*')
        .eq('list_id', listId).order('row_index', { ascending: true })
        .range(from, from + pageSize - 1);
      if (error || !data || data.length === 0) break;
      allData = allData.concat(data);
      if (data.length < pageSize) break;
      from += pageSize;
    }
    setRows(allData);
    setCurrentListId(listId);
  };

  const loadList = async (listId) => {
    const { data: list } = await supabase.from('lists').select('*').eq('id', listId).single();
    if (list) { setOrigColumns(list.original_columns || []); await loadListRows(listId); setSteps([]); setSelectedStep(null); setColumnOrder(null); }
  };

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: async (results) => {
        const cols = results.meta.fields || [];
        const csvRows = results.data;

        // Auto-detect column types
        const typeMap = buildColumnTypeMap(cols);
        setColTypeMap(typeMap);

        const { data: newList } = await supabase.from('lists').insert({
          user_id: userId, name: file.name.replace(/\.csv$/i, ''), row_count: csvRows.length, original_columns: cols,
        }).select().single();
        if (!newList) return;
        const inserts = csvRows.map((r, i) => ({ list_id: newList.id, row_index: i, data: r }));
        for (let i = 0; i < inserts.length; i += 500) { await supabase.from('list_rows').insert(inserts.slice(i, i + 500)); }
        setOrigColumns(cols);
        setLists(prev => [newList, ...prev]);
        await loadListRows(newList.id);
        setColumnOrder(null);

        // Auto-map step column references if loading onto a template
        if (steps.length > 0) {
          // Build reverse map: standard type → actual column name
          const reverseMap = {};
          Object.entries(typeMap).forEach(([orig, std]) => { reverseMap[std] = orig; });
          // Update step prompts: replace {standard_name} with {actual_column_name}
          setSteps(prev => prev.map(step => {
            let updated = { ...step };
            if (updated.prompt) {
              Object.entries(reverseMap).forEach(([std, actual]) => {
                updated.prompt = updated.prompt.replace(new RegExp('\\{' + std + '\\}', 'gi'), '{' + actual + '}');
              });
            }
            // Auto-map column selectors
            if (!updated.emailColumn) {
              const emailCol = Object.entries(typeMap).find(([,t]) => t === 'email');
              if (emailCol) updated.emailColumn = emailCol[0];
            }
            if (!updated.fnCol) {
              const fn = Object.entries(typeMap).find(([,t]) => t === 'first_name');
              if (fn) updated.fnCol = fn[0];
            }
            if (!updated.lnCol) {
              const ln = Object.entries(typeMap).find(([,t]) => t === 'last_name');
              if (ln) updated.lnCol = ln[0];
            }
            if (!updated.domainCol) {
              const dom = Object.entries(typeMap).find(([,t]) => t === 'website');
              if (dom) updated.domainCol = dom[0];
            }
            return updated;
          }));
        }
      },
    });
  }, [supabase, steps]);

  const handleDrop = useCallback((e) => { e.preventDefault(); const f = e.dataTransfer?.files?.[0]; if (f?.name.endsWith('.csv')) handleFile(f); }, [handleFile]);

  const exportCSV = () => {
    const data = rows.map(r => { const o = {}; allColumns.forEach(c => o[c] = r.data?.[c] || ''); return o; });
    const csv = Papa.unparse(data, { columns: allColumns });
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'jaklay_export.csv'; a.click();
  };

  const addStep = (type) => {
    const st = STEP_TYPES.find(t => t.id === type);
    const s = {
      id: uid(), type, outputColumn: st?.label || 'new_column',
      prompt: '', provider: type === 'web_research' ? 'perplexity' : 'openai',
      model: type === 'web_research' ? 'sonar' : 'gpt-4o-mini', condition: null,
      emailColumn: '', fnCol: '', lnCol: '', domainCol: '',
      waterfallSources: type === 'waterfall' ? sortSourcesByCost(['leadmagic','findymail','prospeo','dropcontact','hunter','datagma','wiza','rocketreach']) : [],
      formula: '', campaignId: '', emailProvider: 'findymail', verifyProvider: 'millionverifier',
    };
    setSteps(prev => [...prev, s]);
    setSelectedStep(s.id);
    setPanel(null);
    setContextMenu(null);
  };

  const updateStep = (s) => setSteps(prev => prev.map(x => x.id === s.id ? s : x));
  const deleteStep = (id) => { setSteps(prev => prev.filter(x => x.id !== id)); if (selectedStep === id) setSelectedStep(null); };
  const duplicateStep = (step) => { const d = { ...step, id: uid(), outputColumn: step.outputColumn + '_copy' }; setSteps(prev => [...prev, d]); setSelectedStep(d.id); };
  const moveStep = (i, dir) => setSteps(prev => { const a=[...prev]; const j=i+dir; if(j<0||j>=a.length)return a; [a[i],a[j]]=[a[j],a[i]]; return a; });

  const handleColDragStart = (col) => setDragCol(col);
  const handleColDragOver = (col) => { if (dragCol && col !== dragCol) setDragOverCol(col); };
  const handleColDrop = (col) => {
    if (!dragCol || dragCol === col) { setDragCol(null); setDragOverCol(null); return; }
    const order = columnOrder || [...allColumns];
    const fi = order.indexOf(dragCol), ti = order.indexOf(col);
    if (fi === -1 || ti === -1) return;
    const n = [...order]; n.splice(fi, 1); n.splice(ti, 0, dragCol);
    setColumnOrder(n); setDragCol(null); setDragOverCol(null);
  };

  const handleColClick = (col) => { const step = steps.find(s => s.outputColumn === col); if (step) { setSelectedStep(step.id); setPanel(null); } };

  const addTemplateColumn = () => { const name = window.prompt('Base column name (e.g. company_name, email, website):'); if (name) setTemplateColumns(prev => [...prev, name]); };

  const saveWorkflow = async () => {
    const name = window.prompt('Template name:');
    if (!name) return;
    const { data: wf } = await supabase.from('workflows').insert({
      user_id: userId, name, steps, description: JSON.stringify({ templateColumns }),
    }).select().single();
    if (wf) setWorkflows(prev => [wf, ...prev]);
  };

  const loadWorkflow = (wf) => {
    setSteps((wf.steps || []).map(s => ({ ...s, id: uid() })));
    setSelectedStep(null); setPanel(null);
    try { const d = JSON.parse(wf.description || '{}'); if (d.templateColumns) setTemplateColumns(d.templateColumns); } catch {}
  };

  // ─── CLIENT-SIDE ENRICHMENT ENGINE ──────────────────────────
  // Runs directly in the browser — no server dependency, no timeout issues
  
  

  const callAIDirect = async (provider, model, prompt) => {
    const key = keys[provider];
    if (!key) throw new Error('No ' + provider + ' key — add it in Keys panel');
    if (provider === 'anthropic') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model, max_tokens: 1024, messages: [{ role: 'user', content: prompt }] }),
      });
      const d = await r.json(); if (d.error) throw new Error(d.error.message); return d.content?.[0]?.text || '';
    }
    if (provider === 'openai') {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
        body: JSON.stringify({ model, max_tokens: 1024, messages: [{ role: 'user', content: prompt }] }),
      });
      const d = await r.json(); if (d.error) throw new Error(d.error.message); return d.choices?.[0]?.message?.content || '';
    }
    if (provider === 'perplexity') {
      const r = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
        body: JSON.stringify({ model, max_tokens: 1024, messages: [{ role: 'user', content: prompt }] }),
      });
      const d = await r.json(); if (d.error) throw new Error(d.error?.message || JSON.stringify(d.error)); return d.choices?.[0]?.message?.content || '';
    }
    throw new Error('Unknown provider: ' + provider);
  };

  const interpolatePrompt = (template, row) => {
    return template.replace(/\{(\w[\w\s]*)\}/g, (_, key) => {
      const k = key.trim();
      const match = Object.keys(row).find(c => c.toLowerCase().replace(/\s+/g,'_') === k.toLowerCase().replace(/\s+/g,'_') || c.toLowerCase() === k.toLowerCase());
      return match ? (row[match] || '') : '{' + k + '}';
    });
  };

  const checkCondition = (row, cond) => {
    if (!cond || !cond.column) return true;
    const val = (row[cond.column] || '').toString().toLowerCase().trim();
    const target = (cond.value || '').toLowerCase().trim();
    switch (cond.operator) {
      case 'equals': return val === target;
      case 'not_equals': return val !== target;
      case 'contains': return val.includes(target);
      case 'not_contains': return !val.includes(target);
      case 'is_empty': return val === '';
      case 'is_not_empty': return val !== '';
      case 'greater_than': return parseFloat(val) > parseFloat(target);
      case 'less_than': return parseFloat(val) < parseFloat(target);
      case 'starts_with': return val.startsWith(target);
      default: return true;
    }
  };

  const runStepForRow = async (step, rowData) => {
    if (step.condition?.column && !checkCondition(rowData, step.condition)) return '⏭ Skipped';
    const existing = rowData[step.outputColumn];
    if (existing && !existing.startsWith('⚠') && !existing.startsWith('⏭')) return existing; // already filled

    if (step.type === 'ai_enrich' || step.type === 'web_research') {
      const filled = interpolatePrompt(step.prompt || '', rowData);
      if (!filled.trim()) return '⚠ Empty prompt';
      return await callAIDirect(step.provider, step.model, filled);
    }
    if (step.type === 'api_verify') {
      const email = rowData[step.emailColumn];
      if (!email) return '⏭ No email';
      const key = keys[step.verifyProvider || 'millionverifier'];
      if (!key) return '⚠ No ' + (step.verifyProvider || 'millionverifier') + ' key';
      if ((step.verifyProvider || 'millionverifier') === 'millionverifier') {
        const r = await fetch('https://api.millionverifier.com/api/v3/?api=' + key + '&email=' + encodeURIComponent(email));
        const d = await r.json(); return d.result || d.quality || JSON.stringify(d);
      }
      if (step.verifyProvider === 'emaillable') {
        const r = await fetch('https://api.emaillable.com/v1/verify?email=' + encodeURIComponent(email) + '&api_key=' + key);
        const d = await r.json(); return d.state || d.reason || JSON.stringify(d);
      }
      if (step.verifyProvider === 'bounceban') {
        const r = await fetch('https://api.bounceban.com/v1/verify/single?email=' + encodeURIComponent(email), { headers: { 'x-api-key': key } });
        const d = await r.json(); return d.status || d.result || JSON.stringify(d);
      }
      return '⚠ Unknown verifier';
    }
    if (step.type === 'formula') {
      const f = step.formula || '';
      const ifMatch = f.match(/IF\s+\{(.+?)\}\s+is\s+"(.+?)"\s+THEN\s+\{(.+?)\}\s*(?:ELSE\s+\{(.+?)\})?/i);
      if (ifMatch) {
        const [, col, val, thenCol, elseCol] = ifMatch;
        return (rowData[col]||'').toLowerCase().trim() === val.toLowerCase().trim() ? (rowData[thenCol]||'') : (elseCol ? rowData[elseCol]||'' : '');
      }
      return interpolatePrompt(f, rowData);
    }
    if (step.type === 'condition_gate') {
      return checkCondition(rowData, step.condition) ? '✅ Pass' : '❌ Fail';
    }
    return '⚠ Step type not yet implemented client-side';
  };

  // Parse row range like "1-50" or "5,10,15" into indices
  const parseRowRange = (range, totalRows) => {
    if (!range || !range.trim()) return null;
    const indices = new Set();
    range.split(',').forEach(part => {
      part = part.trim();
      if (part.includes('-')) {
        const [a, b] = part.split('-').map(Number);
        for (let i = Math.max(1, a); i <= Math.min(b, totalRows); i++) indices.add(i - 1);
      } else {
        const n = parseInt(part);
        if (n >= 1 && n <= totalRows) indices.add(n - 1);
      }
    });
    return [...indices].sort((a, b) => a - b);
  };

  const runSingleStep = async (step, specificRows) => {
    let targetRows;
    if (specificRows) {
      targetRows = specificRows;
    } else if (step.rowRange) {
      const indices = parseRowRange(step.rowRange, rows.length);
      targetRows = indices ? indices.map(i => rows[i]).filter(Boolean) : rows;
    } else if (testMode > 0) {
      targetRows = rows.slice(0, testMode);
    } else {
      targetRows = rows;
    }
    const total = targetRows.length;
    abortRef.current = false;
    setRunningStep(step.id);
    setRunProgress({ current: 0, total, errors: 0, stepName: step.outputColumn });

    let errors = 0;
    for (let i = 0; i < total; i++) {
      if (abortRef.current) break;
      const row = targetRows[i];
      const ri = rows.findIndex(r => r.id === row.id);
      try {
        const result = await runStepForRow(step, row.data || {});
        const trimmed = (result || '').toString().trim();
        const newData = { ...row.data, [step.outputColumn]: trimmed };
        setRows(prev => { const c=[...prev]; c[ri]={...c[ri], data: newData}; return c; });
        await supabase.from('list_rows').update({ data: newData }).eq('id', row.id);
      } catch (err) {
        errors++;
        const newData = { ...row.data, [step.outputColumn]: '⚠ ' + err.message };
        setRows(prev => { const c=[...prev]; c[ri]={...c[ri], data: newData}; return c; });
      }
      setRunProgress({ current: i + 1, total, errors, stepName: step.outputColumn });
      await new Promise(r => setTimeout(r, 200));
    }
    setRunningStep(null);
    setRunProgress(null);
  };

  const runAll = async () => {
    if (steps.length === 0) return;
    if (!canRun()) { alert('You\'ve hit your plan limit. Upgrade at /pricing to continue.'); return; }
    abortRef.current = false;
    for (let si = 0; si < steps.length; si++) {
      if (abortRef.current) break;
      const step = steps[si];
      if (!step.outputColumn) continue;
      setRunProgress(prev => ({ ...(prev||{}), stepIdx: si + 1, totalSteps: steps.length }));
      await runSingleStep(step);
    }
  };

  const stopRun = () => { abortRef.current = true; setRunningStep(null); setRunProgress(null); };

  // Run for a single cell
  const runForCell = async (ri, col) => {
    const step = steps.find(s => s.outputColumn === col);
    if (!step) return;
    const row = rows[ri];
    setRunningStep(step.id);
    try {
      const result = await runStepForRow(step, row.data || {});
      const newData = { ...row.data, [col]: (result||'').toString().trim() };
      setRows(prev => { const c=[...prev]; c[ri]={...c[ri], data: newData}; return c; });
      await supabase.from('list_rows').update({ data: newData }).eq('id', row.id);
    } catch (err) {
      const newData = { ...row.data, [col]: '⚠ ' + err.message };
      setRows(prev => { const c=[...prev]; c[ri]={...c[ri], data: newData}; return c; });
    }
    setRunningStep(null);
  };

  const [cellMenu, setCellMenu] = useState(null); // {x, y, row, col}

  const startEdit = (ri, col) => { setEditCell({ row: ri, col }); setEditValue(rows[ri]?.data?.[col] || ''); };
  const commitEdit = async () => {
    if (!editCell) return;
    const row = rows[editCell.row];
    const newData = { ...row.data, [editCell.col]: editValue };
    setRows(prev => { const c=[...prev]; c[editCell.row]={...c[editCell.row], data: newData}; return c; });
    await supabase.from('list_rows').update({ data: newData }).eq('id', row.id);
    setEditCell(null);
  };

  const selStep = steps.find(s => s.id === selectedStep);

  if (!loaded) return (
    <div className="h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-2xl flex items-center justify-center text-white font-mono font-bold text-2xl mx-auto mb-3 shadow-lg shadow-indigo-200">J</div>
        <p className="text-gray-400 text-sm animate-pulse">Loading Jaklay...</p>
      </div>
    </div>
  );

  const renderTableHeader = () => (
    <tr onContextMenu={e => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY }); }}>
      <th className="sticky top-0 z-10 bg-gray-50 px-3 py-2.5 text-center text-[10px] font-semibold text-gray-400 uppercase border-b-2 border-gray-200 w-10">#</th>
      {allColumns.map(col => {
        const isEnrich = enrichCols.includes(col);
        const step = steps.find(s => s.outputColumn === col);
        const stType = step ? STEP_TYPES.find(t => t.id === step.type) : null;
        const isBase = !isEnrich && templateColumns.includes(col);
        const isSorted = sortCol === col;
        return (
          <th key={col}
            onClick={e => { if (isEnrich && !e.shiftKey) handleColClick(col); else handleSortClick(col); }}
            draggable
            onDragStart={() => handleColDragStart(col)} onDragOver={e => { e.preventDefault(); handleColDragOver(col); }}
            onDrop={() => handleColDrop(col)} onDragEnd={() => { setDragCol(null); setDragOverCol(null); }}
            className={["sticky top-0 z-10 px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide border-b-2 whitespace-nowrap min-w-[130px] select-none transition-all cursor-pointer",
              isEnrich ? 'bg-indigo-50/80 text-indigo-600 border-indigo-200 hover:bg-indigo-100' : isBase ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100',
              dragOverCol === col ? 'ring-2 ring-indigo-400 ring-inset' : '', dragCol === col ? 'opacity-40' : '',
              isSorted ? 'ring-1 ring-indigo-300' : ''].join(' ')}>
            <div className="flex items-center gap-1.5">
              <span className="cursor-grab text-gray-300 text-[10px] hover:text-gray-500">⠿</span>
              {stType && <span className="text-xs">{stType.icon}</span>}
              <span className="truncate">{col}</span>
              {isSorted && <span className="ml-auto text-indigo-500 text-[10px]">{sortDir === 'asc' ? '↑' : '↓'}</span>}
              {!isSorted && isEnrich && <span className="ml-auto text-[8px] opacity-0 hover:opacity-100 text-indigo-400">click=edit shift+click=sort</span>}
            </div>
          </th>
        );
      })}
    </tr>
  );

  return (
    <div className="h-screen flex flex-col bg-gray-50 text-gray-900" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <header className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200 z-50 gap-2">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center text-white font-mono font-bold text-lg shadow-md shadow-indigo-200/50">J</div>
          <div>
            <h1 className="text-sm font-extrabold tracking-[3px] font-mono text-gray-900 leading-none">JAKLAY</h1>
            <span className="text-[10px] text-gray-400">{hasData ? rows.length+' rows · '+allColumns.length+' cols' : hasWorkflow ? steps.length+' steps configured' : 'AI Data Enrichment'}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {lists.length > 0 && (
            <select value={currentListId||''} onChange={e => e.target.value && loadList(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white min-w-[140px]">
              <option value="">📋 My Lists...</option>
              {lists.map(l => <option key={l.id} value={l.id}>{l.name} ({l.row_count})</option>)}
            </select>
          )}
          <div className="flex bg-gray-100 rounded-lg p-0.5 gap-px">
            {[{k:'keys',l:'🔑 Keys'},{k:'integrations',l:'🔌 Setup'},{k:'templates',l:'📄 Templates'},{k:'prompts',l:'📚 Prompts'}].map(({k,l}) => (
              <button key={k} onClick={() => { setPanel(panel===k?null:k); if(panel!==k) setSelectedStep(null); }}
                className={['px-2.5 py-1.5 text-xs rounded-md transition-all', panel===k ? 'bg-white shadow-sm text-indigo-600 font-semibold' : 'text-gray-500 hover:text-gray-700'].join(' ')}>{l}</button>
            ))}
          </div>
          {(hasData || hasWorkflow) && <>
            <div className="h-5 w-px bg-gray-200 mx-1" />
            <div className={["flex rounded-lg p-0.5 items-center gap-0.5", testMode > 0 ? "bg-amber-100 ring-1 ring-amber-300" : "bg-gray-100"].join(" ")}>
              <span className="text-[9px] text-gray-400 px-1.5 font-semibold uppercase">Rows:</span>
              {[0,1,5,10].map(n => (
                <button key={n} onClick={() => setTestMode(n)}
                  className={['px-2.5 py-1 text-[11px] rounded-md transition',
                    testMode===n ? (n > 0 ? 'bg-amber-500 text-white font-bold shadow-sm' : 'bg-white shadow-sm font-semibold text-indigo-600') : 'text-gray-400 hover:text-gray-600'].join(' ')}>
                  {n||'All'}
                </button>
              ))}
            </div>
            {runningStep ? (
              <button onClick={stopRun} className="px-3 py-1.5 bg-red-50 text-red-500 border border-red-200 rounded-lg text-xs font-semibold">■ Stop {runProgress ? Math.round(runProgress.current/runProgress.total*100)+'%' : ''}</button>
            ) : (
              <button onClick={runAll} disabled={!hasData || steps.length===0}
                className={["px-4 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition",
                  testMode > 0 ? "bg-amber-500 hover:bg-amber-600 text-white shadow-amber-200" : "bg-indigo-500 hover:bg-indigo-600 text-white shadow-indigo-200",
                  (!hasData || steps.length===0) ? "opacity-40" : ""].join(" ")}>
                ▶ {testMode > 0 ? 'Test '+testMode+' rows' : 'Run All '+rows.length+' rows'}{steps.length > 0 ? ' · '+steps.length+' steps' : ''}
              </button>
            )}
            {hasData && <button onClick={exportCSV} className="px-3 py-1.5 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-lg text-xs font-semibold">↓ Export</button>}
            {hasData && <button onClick={() => setShowFilterPanel(!showFilterPanel)} className={["px-3 py-1.5 border rounded-lg text-xs font-semibold", filters.length > 0 ? "bg-amber-50 text-amber-600 border-amber-200" : "bg-gray-50 text-gray-500 border-gray-200"].join(" ")}>
              🔍 Filter{filters.length > 0 ? " ("+filters.length+")" : ""}
            </button>}
            {hasData && <button onClick={() => { mergeRef.current?.click(); }} className="px-3 py-1.5 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg text-xs font-semibold">⊕ Merge CSV</button>}
            <input ref={mergeRef} type="file" accept=".csv" className="hidden" onChange={e => handleMergeFile(e.target.files?.[0])} />
          {/* User / Plan / Account */}
          <div className="h-5 w-px bg-gray-200 mx-1" />
          {profile && (
            <div className="flex items-center gap-2">
              <span className={["px-2 py-0.5 rounded-full text-[9px] font-bold uppercase",
                profile.plan==='admin'?'bg-red-100 text-red-600':
                profile.plan==='pro'?'bg-indigo-100 text-indigo-600':
                profile.plan==='starter'?'bg-emerald-100 text-emerald-600':
                'bg-gray-100 text-gray-500'].join(" ")}>{profile.plan}</span>
              {profile.plan === 'free' && (
                <span className="text-[10px] text-gray-400 font-mono">{profile.enrichment_runs_used}/{profile.enrichment_runs_limit} runs</span>
              )}
              <a href="/pricing" className="text-[10px] text-indigo-500 hover:underline font-medium">Upgrade</a>
              {isAdmin && <a href="/admin" className="text-[10px] text-red-500 hover:underline font-medium">Admin</a>}
              <button onClick={signOut} className="text-[10px] text-gray-400 hover:text-gray-600">Sign out</button>
            </div>
          )}
          </>}
        </div>
      </header>

      {runProgress && runningStep && (
        <div className="h-6 bg-gray-100 flex items-center px-4 gap-3 text-[11px]">
          <div className="h-1.5 flex-1 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300" style={{width:Math.round(runProgress.current/runProgress.total*100)+'%'}} />
          </div>
          <span className="text-indigo-600 font-semibold font-mono">{runProgress.current}/{runProgress.total}</span>
          {runProgress.stepIdx && <span className="text-gray-400">step {runProgress.stepIdx}/{runProgress.totalSteps}</span>}
          {runProgress.errors > 0 && <span className="text-red-500">{runProgress.errors} errors</span>}
          <span className="text-gray-500 font-medium">{runProgress.stepName}</span>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* LEFT SIDEBAR */}
        <div className="w-[240px] min-w-[240px] bg-white border-r border-gray-200 flex flex-col overflow-hidden">
          <div className="px-3 py-2.5 border-b border-gray-100 flex items-center justify-between">
            <span className="font-bold text-xs text-gray-700">Workflow Steps</span>
            <span className="text-[10px] text-gray-300 font-mono">{steps.length}</span>
          </div>
          <div className="flex-1 overflow-auto p-1.5">
            {steps.length === 0 && <div className="text-center py-8 px-3"><div className="text-3xl mb-2">🧩</div><p className="text-xs text-gray-400">Add columns below or right-click the table header area.</p></div>}
            {steps.map((step, i) => {
              const st = STEP_TYPES.find(t => t.id === step.type);
              const isActive = selectedStep === step.id;
              return (
                <div key={step.id} onClick={() => { setSelectedStep(step.id); setPanel(null); }}
                  className={['group px-2.5 py-2 rounded-lg cursor-pointer transition-all mb-1 border-l-[3px]', isActive ? 'bg-indigo-50/80 border-indigo-500 shadow-sm' : 'border-transparent hover:bg-gray-50'].join(' ')}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{st?.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold truncate text-gray-800">{step.outputColumn || st?.label}</div>
                      <div className="text-[10px] text-gray-400">{st?.label}{step.condition?.column ? ' · if '+step.condition.column : ''}</div>
                    </div>
                    <span className="text-[10px] text-gray-300 font-mono">{i+1}</span>
                  </div>
                  <div className="flex gap-1 mt-1 opacity-0 group-hover:opacity-100 transition">
                    {runningStep === step.id
                      ? <button onClick={e => {e.stopPropagation(); stopRun();}} className="px-2 py-0.5 bg-red-50 text-red-500 rounded text-[10px] font-semibold">■ Stop</button>
                      : <button onClick={e => {e.stopPropagation(); runSingleStep(step);}} className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded text-[10px] font-semibold hover:bg-indigo-100">▶ Run</button>
                    }
                    <button onClick={e => {e.stopPropagation(); moveStep(i,-1);}} className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px] text-gray-400 hover:bg-gray-200">↑</button>
                    <button onClick={e => {e.stopPropagation(); moveStep(i,1);}} className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px] text-gray-400 hover:bg-gray-200">↓</button>
                    <button onClick={e => {e.stopPropagation(); duplicateStep(step);}} className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px] text-gray-400 hover:bg-gray-200">⧉</button>
                    <button onClick={e => {e.stopPropagation(); deleteStep(step.id);}} className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px] text-red-400 ml-auto">×</button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="border-t border-gray-100 p-2 max-h-[45vh] overflow-auto">
            {!hasData && (
              <div className="mb-3">
                <div className="text-[10px] font-bold text-amber-600 uppercase tracking-wider px-1 mb-1.5">📋 Template Base Columns</div>
                {/* Preset buttons */}
                <div className="flex flex-wrap gap-1 mb-2 px-1">
                  {TEMPLATE_PRESETS.map(p => (
                    <button key={p.name} onClick={() => setTemplateColumns(p.cols)}
                      className="px-2 py-1 bg-amber-50 border border-amber-200 rounded-lg text-[10px] text-amber-700 font-medium hover:bg-amber-100 transition">
                      {p.name}
                    </button>
                  ))}
                </div>
                <button onClick={() => { const name = window.prompt('Column name:'); if(name) setTemplateColumns(prev => [...prev, name]); }}
                  className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-left bg-amber-50/50 border border-amber-100 hover:bg-amber-50 transition text-[11px] text-amber-600 mb-1.5">
                  + Add custom column
                </button>
                {templateColumns.length > 0 && (
                  <div className="flex flex-wrap gap-1 px-1">
                    {templateColumns.map(c => (
                      <span key={c} className="px-2 py-0.5 bg-amber-50 border border-amber-200 rounded text-[10px] text-amber-700 font-mono flex items-center gap-1">
                        {c}<button onClick={() => setTemplateColumns(prev => prev.filter(x => x !== c))} className="text-amber-400 hover:text-red-500">×</button>
                      </span>
                    ))}
                  </div>
                )}
                {templateColumns.length > 0 && (
                  <p className="text-[10px] text-amber-500 px-1 mt-1">Add enrichment steps below, save as template, then upload any CSV to run.</p>
                )}
              </div>
            )}
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1 mb-1">+ Add Enrichment</div>
            {['enrichment','logic','action'].map(cat => (
              <div key={cat}>
                <div className="text-[9px] text-gray-300 uppercase tracking-wider pt-2 pb-0.5 px-1">{cat}</div>
                {STEP_TYPES.filter(s => s.cat === cat).map(st => (
                  <button key={st.id} onClick={() => addStep(st.id)}
                    className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-indigo-50 transition group">
                    <span className="text-sm group-hover:scale-110 transition-transform">{st.icon}</span>
                    <div><div className="text-xs font-medium text-gray-700">{st.label}</div><div className="text-[10px] text-gray-400">{st.desc}</div></div>
                  </button>
                ))}
              </div>
            ))}
            {hasWorkflow && (
              <button onClick={saveWorkflow} className="flex items-center gap-2 w-full px-2.5 py-2 mt-2 rounded-lg bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 transition">
                <span>💾</span><span className="text-xs font-semibold text-indigo-600">Save as Template</span>
              </button>
            )}
          </div>
        </div>

        {/* CENTER TABLE */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!hasData && !hasWorkflow ? (
            <div className="flex-1 flex flex-col items-center justify-center cursor-pointer" onDragOver={e => e.preventDefault()} onDrop={handleDrop} onClick={() => fileRef.current?.click()}>
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e => handleFile(e.target.files?.[0])} />
              <div className="text-5xl mb-4">📂</div>
              <h2 className="text-xl font-bold mb-2">Drop a CSV or click to upload</h2>
              <p className="text-gray-400 text-sm mb-6">Or build a workflow template first using the sidebar →</p>
              <div className="flex gap-2.5">
                {['Upload CSV','Add AI steps','Run enrichment','Export'].map((t,i) => (
                  <div key={t} className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm shadow-sm">
                    <span className="w-6 h-6 bg-indigo-500 text-white rounded-full flex items-center justify-center text-[11px] font-bold">{i+1}</span>{t}
                  </div>
                ))}
              </div>
            </div>
          ) : !hasData && hasWorkflow ? (
            <div className="flex-1 flex flex-col">
              <div className="flex-1 overflow-auto">
                <table className="min-w-full border-collapse text-xs" style={{width:'max-content',minWidth:'100%'}}>
                  <thead>{renderTableHeader()}</thead>
                  <tbody>
                    {[0,1,2].map(i => (
                      <tr key={i} className="bg-white border-b border-gray-50">
                        <td className="px-3 py-3 text-[10px] text-gray-300">{i+1}</td>
                        {allColumns.map(col => <td key={col} className="px-3 py-3 text-xs text-gray-300 italic">sample data</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-3 bg-white border-t border-gray-200 flex items-center gap-3" onDragOver={e => e.preventDefault()} onDrop={handleDrop}>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-gray-700">Workflow ready — upload a CSV to run it</p>
                  <p className="text-[11px] text-gray-400">CSV columns will auto-map to your base columns.</p>
                </div>
                <button onClick={() => fileRef.current?.click()} className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-xs font-semibold hover:bg-indigo-600 shadow-sm shadow-indigo-200">📂 Upload CSV</button>
                <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e => handleFile(e.target.files?.[0])} />
              </div>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-auto">
                <table className="min-w-full border-collapse text-xs" style={{width:'max-content',minWidth:'100%'}}>
                  <thead>{renderTableHeader()}</thead>
                  <tbody>
                    {displayRows.map((row, di) => {
                      const ri = rows.findIndex(r => r.id === row.id);
                      return (
                      <tr key={row.id || di} className={[di%2?'bg-gray-50/30':'bg-white','hover:bg-indigo-50/20 transition'].join(' ')}>
                        <td className="px-3 py-2.5 text-center text-[10px] text-gray-300 border-b border-gray-100 font-mono">{ri+1}</td>
                        {allColumns.map(col => {
                          const val = row.data?.[col] || '';
                          const isEditing = editCell?.row === ri && editCell?.col === col;
                          const isErr = val.toString().startsWith('⚠');
                          const isOk = ['✅ Pass','✅ Pushed','ok','YES','deliverable','valid'].includes(val);
                          const isFail = ['❌ Fail','NO','invalid','undeliverable'].includes(val);
                          const isEnrichCol = enrichCols.includes(col);
                          return (
                            <td key={col} onDoubleClick={() => startEdit(ri,col)} title={val}
                              onContextMenu={e => { if(isEnrichCol) { e.preventDefault(); setCellMenu({x:e.clientX,y:e.clientY,row:ri,col}); }}}
                              className={['px-3 py-2.5 border-b border-gray-100 max-w-[300px] text-xs', isErr?'text-red-500':isOk?'text-emerald-600 font-medium':isFail?'text-red-500 font-medium':''].join(' ')}>
                              {isEditing ? (
                                <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                                  onBlur={commitEdit} onKeyDown={e => {if(e.key==='Enter')commitEdit();if(e.key==='Escape')setEditCell(null);}}
                                  className="w-full px-2 py-1 border-2 border-indigo-500 rounded-md text-xs font-mono outline-none bg-white shadow-sm" />
                              ) : <div className="truncate">{val}</div>}
                            </td>
                          );
                        })}
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-2 text-[11px] text-gray-400 border-t border-gray-200 bg-white font-mono flex items-center gap-3">
                {displayRows.length}{filters.length > 0 ? '/'+rows.length : ''} rows · {allColumns.length} cols · {steps.length} steps
                {sortCol && <><span className="text-gray-300">·</span><span className="text-indigo-500">sorted by {sortCol} {sortDir}</span>
                  <button onClick={() => { setSortCol(null); setSortDir('asc'); }} className="text-red-400 hover:text-red-600 text-[10px]">× clear sort</button></>}
                {filters.length > 0 && <><span className="text-gray-300">·</span><span className="text-amber-500">{filters.length} filter{filters.length>1?'s':''} active</span>
                  <button onClick={() => setFilters([])} className="text-red-400 hover:text-red-600 text-[10px]">× clear all</button></>}
                <span className="text-gray-300 ml-auto">·</span>
                <span className="text-[10px] text-gray-300">Click header = sort · Shift+click enrichment = sort · Right-click = add column</span>
                <button onClick={() => fileRef.current?.click()} className="text-indigo-500 hover:text-indigo-700 font-sans font-medium">↑ Import</button>
                <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e => handleFile(e.target.files?.[0])} />
              </div>
            </>
          )}
        </div>

        {/* RIGHT PANEL */}
        {(selStep || panel) && (
          <div className="w-[360px] min-w-[360px] bg-white border-l border-gray-200 flex flex-col overflow-hidden animate-in">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50">
              <span className="font-bold text-sm text-gray-700">
                {panel==='keys'?'🔑 API Keys':panel==='integrations'?'🔌 Integration Setup':panel==='templates'?'📄 Templates':panel==='prompts'?'📚 Prompt Library':'⚙️ Configure Step'}
              </span>
              <button onClick={() => {setSelectedStep(null);setPanel(null);}} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-200 text-gray-400">×</button>
            </div>
            <div className="flex-1 overflow-auto">
              {panel === 'keys' && (
                <div className="p-4 space-y-3">
                  {Object.entries(INTEG_SETUP).map(([id,integ]) => (
                    <div key={id}>
                      <label className="text-xs font-semibold text-gray-500 flex items-center gap-1.5">
                        <span>{integ.icon}</span> {integ.name}
                        {keys[id] ? <span className="text-[9px] font-bold text-emerald-500 bg-emerald-50 px-1.5 py-0.5 rounded-full ml-auto">CONNECTED</span> : <span className="text-[9px] text-gray-300 ml-auto">not set</span>}
                      </label>
                      <input type="password" value={keys[id]||''} onChange={e => saveKey(id, e.target.value)} placeholder="Paste API key..."
                        className="w-full mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none" />
                    </div>
                  ))}
                  <div className="text-[11px] text-gray-400 p-3 bg-gray-50 rounded-lg mt-2">🔒 Keys stored in Supabase. Only sent to each provider directly.</div>
                </div>
              )}
              {panel === 'integrations' && (
                <div className="p-4 space-y-1.5">
                  {Object.entries(INTEG_SETUP).map(([id,integ]) => (
                    <details key={id} className="bg-gray-50 rounded-lg border border-gray-100">
                      <summary className="px-3 py-2.5 cursor-pointer flex items-center gap-2">
                        <span>{integ.icon}</span><span className="font-semibold text-xs flex-1">{integ.name}</span>
                        {keys[id] ? <span className="text-[9px] font-bold text-emerald-500">✓ Ready</span> : <span className="text-[9px] text-red-400">Setup needed</span>}
                      </summary>
                      <pre className="px-3 pb-3 text-[11px] text-gray-500 whitespace-pre-wrap leading-relaxed">{integ.setup}</pre>
                    </details>
                  ))}
                  <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-100 mt-3">
                    <p className="text-xs font-semibold text-indigo-700 mb-1">📨 Webhook for Make.com</p>
                    <code className="text-[10px] text-indigo-600 font-mono break-all">POST {typeof window !== 'undefined' ? window.location.origin : ''}/api/webhook</code>
                    <p className="text-[10px] text-indigo-500 mt-1">Header: x-webhook-secret = your_secret</p>
                  </div>
                </div>
              )}
              {panel === 'templates' && (
                <div className="p-4 space-y-2">
                  {workflows.length === 0 && <p className="text-sm text-gray-400 text-center py-8">No saved templates yet.</p>}
                  {workflows.map(wf => (
                    <div key={wf.id} className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                      <div className="font-semibold text-xs">{wf.name}</div>
                      <div className="text-[10px] text-gray-400">{(wf.steps||[]).length} steps · {new Date(wf.created_at).toLocaleDateString()}</div>
                      <div className="text-[10px] text-gray-300 font-mono mt-0.5 truncate">ID: {wf.id}</div>
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => loadWorkflow(wf)} className="text-[11px] text-indigo-600 font-semibold hover:underline">Load</button>
                        <button onClick={async () => { await supabase.from('workflows').delete().eq('id',wf.id); setWorkflows(prev => prev.filter(w => w.id !== wf.id)); }} className="text-[11px] text-red-400 hover:underline">Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {panel === 'prompts' && (
                <div className="p-4 space-y-2">
                  <p className="text-[11px] text-gray-400 mb-2">Click any prompt to add it as a new AI step instantly.</p>
                  {PROMPT_LIBRARY.map(p => (
                    <div key={p.id} className="p-3 bg-gray-50 rounded-lg border border-gray-100 hover:border-indigo-200 cursor-pointer group"
                      onClick={() => {
                        const s = { id: uid(), type: 'ai_enrich', outputColumn: p.name.toLowerCase().replace(/\s+/g,'_'),
                          prompt: p.prompt, provider: p.provider, model: p.model, condition: null,
                          emailColumn: '', fnCol: '', lnCol: '', domainCol: '', waterfallSources: [],
                          formula: '', campaignId: '', emailProvider: 'findymail', verifyProvider: 'millionverifier' };
                        setSteps(prev => [...prev, s]); setSelectedStep(s.id); setPanel(null);
                      }}>
                      <div className="flex items-center justify-between">
                        <div className="font-semibold text-xs">{p.name}</div>
                        <span className="text-[9px] text-indigo-500 opacity-0 group-hover:opacity-100 font-semibold">+ Add as step</span>
                      </div>
                      <div className="text-[10px] text-indigo-500 mt-0.5">Rec: {p.model} — {p.reason}</div>
                      <pre className="text-[10px] text-gray-400 mt-1.5 whitespace-pre-wrap max-h-20 overflow-hidden leading-relaxed font-mono bg-white/50 p-2 rounded">{p.prompt}</pre>
                    </div>
                  ))}
                </div>
              )}
              {selStep && !panel && (
                <StepConfig step={selStep} columns={allColumns} keys={keys} onUpdate={updateStep} onDelete={() => deleteStep(selStep.id)} onDuplicate={() => duplicateStep(selStep)} rows={rows} colTypeMap={colTypeMap} />
              )}
            </div>
          </div>
        )}
      </div>

      {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} onSelect={addStep} onClose={() => setContextMenu(null)} />}

      {/* Cell right-click menu */}
      {cellMenu && (
        <div style={{position:'fixed',top:cellMenu.y,left:cellMenu.x,zIndex:9999}} className="bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[180px] animate-in"
          onClick={() => setCellMenu(null)}>
          <button onClick={() => { runForCell(cellMenu.row, cellMenu.col); setCellMenu(null); }}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-indigo-50 text-xs font-medium">
            ▶ Run this cell
          </button>
          <button onClick={() => { const step = steps.find(s=>s.outputColumn===cellMenu.col); if(step) runSingleStep(step, [rows[cellMenu.row]]); setCellMenu(null); }}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-indigo-50 text-xs font-medium">
            ▶ Run this row (all steps)
          </button>
          <button onClick={() => { startEdit(cellMenu.row, cellMenu.col); setCellMenu(null); }}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-gray-50 text-xs">
            ✏️ Edit cell
          </button>
          <button onClick={() => {
            const newData = {...rows[cellMenu.row].data, [cellMenu.col]: ''};
            setRows(prev => {const c=[...prev]; c[cellMenu.row]={...c[cellMenu.row],data:newData}; return c;});
            supabase.from('list_rows').update({data:newData}).eq('id',rows[cellMenu.row].id);
            setCellMenu(null);
          }} className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-red-50 text-xs text-red-500">
            🗑 Clear cell
          </button>
        </div>
      )}

      {/* ─── Filter Panel ─── */}
      {showFilterPanel && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-20" onClick={() => setShowFilterPanel(false)}>
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-[480px] max-h-[70vh] overflow-auto animate-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <span className="font-bold text-sm">🔍 Filters</span>
              <div className="flex gap-2">
                {filters.length > 0 && <button onClick={() => setFilters([])} className="text-xs text-red-400 hover:text-red-600">Clear all</button>}
                <button onClick={() => setShowFilterPanel(false)} className="text-gray-400 hover:text-gray-600">×</button>
              </div>
            </div>
            <div className="p-4 space-y-3">
              {filters.map((f, i) => {
                const uniqueVals = f.column ? getUniqueValues(f.column) : [];
                return (
                  <div key={i} className="p-3 bg-gray-50 rounded-lg border border-gray-100 space-y-2">
                    <div className="flex items-center gap-2">
                      <select value={f.column} onChange={e => { const nf=[...filters]; nf[i]={...f, column: e.target.value}; setFilters(nf); }}
                        className="flex-1 text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white">
                        <option value="">Select column...</option>
                        {allColumns.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <select value={f.operator} onChange={e => { const nf=[...filters]; nf[i]={...f, operator: e.target.value}; setFilters(nf); }}
                        className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white">
                        {["equals","not_equals","contains","not_contains","is_empty","is_not_empty","starts_with","greater_than","less_than"].map(o =>
                          <option key={o} value={o}>{o.replace(/_/g," ")}</option>)}
                      </select>
                      <button onClick={() => setFilters(filters.filter((_,idx) => idx!==i))} className="text-red-400 hover:text-red-600 text-sm">×</button>
                    </div>
                    {!["is_empty","is_not_empty"].includes(f.operator) && (
                      <div>
                        <input value={f.value||""} onChange={e => { const nf=[...filters]; nf[i]={...f, value: e.target.value}; setFilters(nf); }}
                          placeholder="Type value or click below..." className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white mb-1.5" />
                        {uniqueVals.length > 0 && (
                          <div className="flex flex-wrap gap-1 max-h-24 overflow-auto">
                            {uniqueVals.map(v => (
                              <button key={v} onClick={() => { const nf=[...filters]; nf[i]={...f, value: v}; setFilters(nf); }}
                                className={["px-2 py-0.5 rounded text-[10px] border transition",
                                  f.value === v ? "bg-indigo-500 text-white border-indigo-500" : "bg-white border-gray-200 text-gray-600 hover:border-indigo-300"].join(" ")}>
                                {v.length > 30 ? v.slice(0,30)+'...' : v}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              <button onClick={() => setFilters([...filters, { column: "", operator: "equals", value: "" }])}
                className="w-full py-2 border-2 border-dashed border-gray-200 rounded-lg text-xs text-gray-400 hover:border-indigo-300 hover:text-indigo-500 transition">
                + Add filter
              </button>
              {/* Quick filters */}
              <div className="pt-2 border-t border-gray-100">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Quick Filters</div>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: "Not emailed", column: "email_status", op: "is_empty" },
                    { label: "Qualified only", column: "qualified", op: "equals", val: "YES" },
                    { label: "Valid emails", column: "mv_result", op: "equals", val: "ok" },
                    { label: "Invalid emails", column: "mv_result", op: "equals", val: "invalid" },
                    { label: "Catch-all", column: "mv_result", op: "equals", val: "catch_all" },
                    { label: "Has errors", column: "", op: "contains", val: "⚠" },
                  ].map(qf => {
                    const matchCol = allColumns.find(c => c.toLowerCase().includes(qf.column)) || qf.column;
                    return (
                      <button key={qf.label} onClick={() => setFilters([...filters, { column: matchCol || qf.column, operator: qf.op, value: qf.val || "" }])}
                        className="px-2.5 py-1 bg-white border border-gray-200 rounded-lg text-[11px] text-gray-600 hover:border-indigo-300 hover:text-indigo-600 transition">
                        {qf.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Merge CSV Panel ─── */}
      {showMergePanel && mergePreview && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30" onClick={() => { setShowMergePanel(false); setMergePreview(null); }}>
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-[560px] max-h-[80vh] overflow-auto animate-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <span className="font-bold text-sm">⊕ Merge CSV Data</span>
              <button onClick={() => { setShowMergePanel(false); setMergePreview(null); }} className="text-gray-400 hover:text-gray-600">×</button>
            </div>
            <div className="p-4 space-y-4">
              <div className="p-3 bg-blue-50 rounded-lg text-xs text-blue-700">
                <strong>How it works:</strong> Pick a matching column from each CSV (e.g. "email" in both). Jaklay finds matching rows and merges the selected columns from your new file into the existing list.
              </div>

              <div className="text-xs text-gray-500">{mergePreview.rows.length} rows · {mergePreview.columns.length} columns in uploaded file</div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Match column in NEW file</label>
                  <select value={mergePreview.matchCol} onChange={e => setMergePreview({...mergePreview, matchCol: e.target.value})}
                    className="w-full mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs">
                    <option value="">Select...</option>
                    {mergePreview.columns.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Match column in EXISTING list</label>
                  <select value={mergePreview.targetCol} onChange={e => setMergePreview({...mergePreview, targetCol: e.target.value})}
                    className="w-full mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs">
                    <option value="">Select...</option>
                    {allColumns.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase">Columns to merge in (select which data to bring over)</label>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {mergePreview.columns.filter(c => c !== mergePreview.matchCol).map(c => {
                    const selected = (mergePreview.mergeColumns || []).includes(c);
                    return (
                      <button key={c} onClick={() => {
                        const mc = mergePreview.mergeColumns || [];
                        setMergePreview({...mergePreview, mergeColumns: selected ? mc.filter(x => x!==c) : [...mc, c]});
                      }} className={["px-2.5 py-1 rounded-lg text-xs border transition",
                        selected ? "bg-indigo-500 text-white border-indigo-500" : "bg-white border-gray-200 text-gray-600 hover:border-indigo-300"].join(" ")}>
                        {c}
                      </button>
                    );
                  })}
                </div>
                {mergePreview.columns.length > 2 && (
                  <button onClick={() => setMergePreview({...mergePreview, mergeColumns: mergePreview.columns.filter(c => c !== mergePreview.matchCol)})}
                    className="text-[10px] text-indigo-500 font-medium mt-1.5 hover:underline">Select all</button>
                )}
              </div>

              {/* Preview */}
              {mergePreview.matchCol && mergePreview.targetCol && (mergePreview.mergeColumns||[]).length > 0 && (
                <div className="p-3 bg-gray-50 rounded-lg text-xs">
                  <div className="font-semibold mb-1">Preview:</div>
                  <p className="text-gray-500">
                    Will match rows where <strong className="text-indigo-600">{mergePreview.matchCol}</strong> (new) = <strong className="text-indigo-600">{mergePreview.targetCol}</strong> (existing), then merge: <strong>{(mergePreview.mergeColumns||[]).join(", ")}</strong>
                  </p>
                  {(() => {
                    const lookup = {};
                    mergePreview.rows.forEach(r => { const k = (r[mergePreview.matchCol]||"").toLowerCase().trim(); if(k) lookup[k]=true; });
                    const matchCount = rows.filter(r => lookup[(r.data?.[mergePreview.targetCol]||"").toLowerCase().trim()]).length;
                    return <p className="mt-1 font-semibold text-emerald-600">{matchCount} of {rows.length} rows will be matched and updated.</p>;
                  })()}
                </div>
              )}

              <div className="flex gap-2 justify-end pt-2 border-t border-gray-100">
                <button onClick={() => { setShowMergePanel(false); setMergePreview(null); }} className="px-4 py-2 text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                <button onClick={executeMerge}
                  disabled={!mergePreview.matchCol || !mergePreview.targetCol || (mergePreview.mergeColumns||[]).length === 0}
                  className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-xs font-semibold hover:bg-indigo-600 disabled:opacity-40 transition">
                  ⊕ Merge {(mergePreview.mergeColumns||[]).length} column{(mergePreview.mergeColumns||[]).length!==1?'s':''}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
