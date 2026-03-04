'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createBrowserClient } from '@/lib/supabase';
import { INTEGRATIONS } from '@/lib/engine';
import Papa from 'papaparse';

// ─── Constants ───────────────────────────────────────────────────────────────

const STEP_TYPES = [
  { id: "ai_enrich", label: "Use AI", icon: "🤖", desc: "AI enrichment with custom prompts", cat: "enrichment" },
  { id: "web_research", label: "Web Research", icon: "🌐", desc: "Search web via Perplexity", cat: "enrichment" },
  { id: "api_verify", label: "Verify Email", icon: "✅", desc: "MillionVerifier validation", cat: "enrichment" },
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
  anthropic: { icon: "🟣", name: "Claude (Anthropic)", type: "ai",
    setup: "1. console.anthropic.com → API Keys\n2. Generate key (sk-ant-...)\n3. Paste in Keys panel" },
  openai: { icon: "🟢", name: "OpenAI", type: "ai",
    setup: "1. platform.openai.com → API Keys\n2. Create secret key\n3. Paste in Keys panel" },
  perplexity: { icon: "🔵", name: "Perplexity", type: "ai",
    setup: "1. perplexity.ai/settings/api\n2. Generate API key\n3. Best for: web research (live internet)" },
  millionverifier: { icon: "✅", name: "MillionVerifier", type: "verification",
    setup: "1. millionverifier.com → Sign up\n2. Dashboard → API key\n3. ~$0.0005/email (500 free)" },
  emaillable: { icon: "📬", name: "Emaillable", type: "verification",
    setup: "1. emaillable.com → Sign up\n2. Dashboard → API Key\n3. Great for re-verifying catch-alls/riskys\n4. Returns: deliverable, risky, undeliverable, unknown + confidence score\n\nPricing: 1,000 free, then ~$0.003/email" },
  bounceban: { icon: "🛡️", name: "BounceBan", type: "verification",
    setup: "1. bounceban.com → Sign up\n2. Dashboard → API Key → Copy\n3. Specializes in catch-all detection\n4. Returns: valid, invalid, disposable, catch_all, unknown\n\nPricing: 100 free, ~$0.002/email" },
  findymail: { icon: "📧", name: "FindyMail", type: "email_finder",
    setup: "1. findymail.com → Settings → API\n2. ~$0.02/email found" },
  hunter: { icon: "🔶", name: "Hunter.io", type: "email_finder",
    setup: "1. hunter.io → API → Copy key\n2. 25 free searches/mo" },
  prospeo: { icon: "🔴", name: "Prospeo", type: "email_finder", setup: "1. prospeo.io → Account → API Key" },
  dropcontact: { icon: "🟦", name: "DropContact", type: "email_finder", setup: "1. dropcontact.com → Settings → API" },
  leadmagic: { icon: "🟪", name: "LeadMagic", type: "email_finder", setup: "1. leadmagic.io → Dashboard → API Key" },
  datagma: { icon: "🔷", name: "Datagma", type: "email_finder", setup: "1. datagma.com → API section" },
  wiza: { icon: "🟨", name: "Wiza", type: "email_finder", setup: "1. wiza.co → Settings → API" },
  rocketreach: { icon: "🚀", name: "RocketReach", type: "email_finder", setup: "1. rocketreach.co → Integrations → API" },
  instantly: { icon: "⚡", name: "Instantly", type: "outreach",
    setup: "1. instantly.ai → Settings → Integrations → API\n2. Used to push leads into campaigns" },
  apify: { icon: "🕷️", name: "Apify", type: "scraping",
    setup: "1. apify.com → Settings → API Tokens\n2. Free $5/mo. Google Maps, LinkedIn, social" },
  phantombuster: { icon: "👻", name: "PhantomBuster", type: "scraping",
    setup: "1. phantombuster.com → Account → API Keys" },
  ocean: { icon: "🌊", name: "Ocean.io", type: "data",
    setup: "1. ocean.io → Settings → API\n2. Similar companies, lookalike audiences" },
  google_search: { icon: "🔍", name: "Serper (Google)", type: "scraping",
    setup: "1. serper.dev → Dashboard → API Key\n2. 2,500 free searches" },
};

const uid = () => Math.random().toString(36).slice(2, 10);

const corePatterns = [/^first/i, /^last/i, /name/i, /company/i, /domain/i, /website/i, /email/i, /phone/i, /title/i, /city/i, /state/i, /country/i, /industry/i];
function sortColumns(orig, enrich) {
  const core = [], other = [];
  orig.forEach(c => (corePatterns.some(p => p.test(c)) ? core : other).push(c));
  return [...core, ...other, ...enrich];
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

function ConditionBuilder({ cond, columns, onChange }) {
  const c = cond || { column: "", operator: "equals", value: "" };
  const ops = ["equals","not_equals","contains","not_contains","is_empty","is_not_empty","greater_than","less_than","starts_with"];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-gray-400 font-semibold">IF</span>
      <select value={c.column} onChange={e => onChange({...c, column: e.target.value})} className="text-xs border border-gray-200 rounded px-2 py-1 bg-white">
        <option value="">column...</option>
        {columns.map(col => <option key={col} value={col}>{col}</option>)}
      </select>
      <select value={c.operator} onChange={e => onChange({...c, operator: e.target.value})} className="text-xs border border-gray-200 rounded px-2 py-1 bg-white">
        {ops.map(o => <option key={o} value={o}>{o.replace(/_/g," ")}</option>)}
      </select>
      {!["is_empty","is_not_empty"].includes(c.operator) && (
        <input value={c.value||""} onChange={e => onChange({...c, value: e.target.value})} placeholder="value" className="text-xs border border-gray-200 rounded px-2 py-1 bg-white w-20" />
      )}
    </div>
  );
}

function WaterfallBuilder({ sources, onUpdate, keys }) {
  const finders = Object.entries(INTEG_SETUP).filter(([,v]) => v.type === "email_finder");
  return (
    <div>
      <p className="text-xs text-gray-400 mb-2">Tries each in order. Stops when valid email found.</p>
      {sources.map((src, i) => (
        <div key={i} className="flex items-center gap-2 px-2 py-1.5 bg-gray-50 rounded-lg mb-1 border border-gray-100">
          <span className="text-gray-300 cursor-grab text-xs">☰</span>
          <span className="text-sm">{INTEG_SETUP[src]?.icon}</span>
          <span className="flex-1 text-xs font-medium">{INTEG_SETUP[src]?.name || src}</span>
          {keys[src] ? <span className="text-[10px] text-green-500">● Key</span> : <span className="text-[10px] text-red-400">● No key</span>}
          <button onClick={() => { const a = [...sources]; a.splice(i,1); onUpdate(a); }} className="text-red-400 text-xs hover:text-red-600">×</button>
        </div>
      ))}
      <select onChange={e => { if(e.target.value) { onUpdate([...sources, e.target.value]); e.target.value=""; }}} className="text-xs border border-gray-200 rounded px-2 py-1 mt-1 bg-white w-full" defaultValue="">
        <option value="">+ Add source...</option>
        {finders.filter(([id]) => !sources.includes(id)).map(([id,v]) => <option key={id} value={id}>{v.icon} {v.name}</option>)}
      </select>
    </div>
  );
}

function StepConfig({ step, columns, keys, onUpdate, onDelete }) {
  const u = (f,v) => onUpdate({...step,[f]:v});
  const aiProviders = Object.entries(INTEG_SETUP).filter(([,v]) => v.type === "ai");
  const emailFinders = Object.entries(INTEG_SETUP).filter(([,v]) => v.type === "email_finder");
  const models = INTEGRATIONS[step.provider]?.models || [];

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <input value={step.outputColumn||""} onChange={e => u("outputColumn", e.target.value)} placeholder="Output column name..."
          className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-200" />
        <button onClick={onDelete} className="text-red-400 hover:text-red-600 text-lg">🗑</button>
      </div>

      {/* Condition */}
      <div className="p-2.5 bg-gray-50 rounded-lg border border-gray-100">
        <ConditionBuilder cond={step.condition} columns={columns} onChange={c => u("condition",c)} />
      </div>

      {/* AI Enrich / Web Research */}
      {(step.type === "ai_enrich" || step.type === "web_research") && <>
        <div>
          <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Provider</label>
          <select value={step.provider||"openai"} onChange={e => u("provider",e.target.value)} className="w-full mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm">
            {aiProviders.map(([id,v]) => <option key={id} value={id}>{v.icon} {v.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Model</label>
          <select value={step.model||""} onChange={e => u("model",e.target.value)} className="w-full mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm">
            {models.map(m => <option key={m.id} value={m.id}>{m.label} (${m.cost}/call)</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Prompt Library</label>
          <select onChange={e => { const p = PROMPT_LIBRARY.find(x => x.id === e.target.value); if(p) { u("prompt",p.prompt); u("provider",p.provider); u("model",p.model); }}} className="w-full mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm" defaultValue="">
            <option value="">📚 Load template...</option>
            {PROMPT_LIBRARY.map(p => <option key={p.id} value={p.id}>{p.cat}: {p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Prompt</label>
          <textarea value={step.prompt||""} onChange={e => u("prompt",e.target.value)} rows={6} placeholder="Use {column_name} to reference data..."
            className="w-full mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono resize-y focus:outline-none focus:ring-2 focus:ring-indigo-200" />
          <div className="flex flex-wrap gap-1 mt-1">
            {columns.slice(0,15).map(c => (
              <button key={c} onClick={() => u("prompt",(step.prompt||"")+`{${c}}`)} className="px-2 py-0.5 bg-indigo-50 border border-indigo-200 rounded text-[10px] text-indigo-600 font-mono hover:bg-indigo-100">{`{${c}}`}</button>
            ))}
          </div>
        </div>
      </>}

      {/* Email Verification */}
      {step.type === "api_verify" && <>
        <div>
          <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Verification Provider</label>
          <select value={step.verifyProvider||"millionverifier"} onChange={e => u("verifyProvider",e.target.value)} className="w-full mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm">
            {Object.entries(INTEG_SETUP).filter(([,v]) => v.type === "verification").map(([id,v]) => <option key={id} value={id}>{v.icon} {v.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Email column</label>
          <select value={step.emailColumn||""} onChange={e => u("emailColumn",e.target.value)} className="w-full mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm">
            <option value="">Select...</option>
            {columns.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="p-2.5 bg-gray-50 rounded-lg text-[11px] text-gray-400 space-y-1">
          <p><strong>MillionVerifier:</strong> ok, catch_all, invalid, error, unknown</p>
          <p><strong>Emaillable:</strong> deliverable, risky, undeliverable, unknown + score</p>
          <p><strong>BounceBan:</strong> valid, invalid, disposable, catch_all, unknown</p>
          <p className="text-indigo-500 mt-1">💡 Tip: Use MillionVerifier first, then Emaillable or BounceBan to re-verify catch-alls</p>
        </div>
      </>}

      {/* Find Email */}
      {step.type === "api_find_email" && <>
        <div>
          <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Provider</label>
          <select value={step.emailProvider||"findymail"} onChange={e => u("emailProvider",e.target.value)} className="w-full mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm">
            {emailFinders.map(([id,v]) => <option key={id} value={id}>{v.icon} {v.name}</option>)}
          </select>
        </div>
        {["fnCol","lnCol","domainCol"].map(f => (
          <div key={f}>
            <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{f==="fnCol"?"First Name":f==="lnCol"?"Last Name":"Domain/Website"} column</label>
            <select value={step[f]||""} onChange={e => u(f,e.target.value)} className="w-full mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm">
              <option value="">Select...</option>
              {columns.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        ))}
      </>}

      {/* Waterfall */}
      {step.type === "waterfall" && <>
        <div className="flex gap-2">
          {["fnCol","lnCol","domainCol"].map(f => (
            <div key={f} className="flex-1">
              <label className="text-[10px] text-gray-400">{f==="fnCol"?"First":f==="lnCol"?"Last":"Domain"}</label>
              <select value={step[f]||""} onChange={e => u(f,e.target.value)} className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white">
                <option value="">-</option>
                {columns.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          ))}
        </div>
        <WaterfallBuilder sources={step.waterfallSources||[]} onUpdate={s => u("waterfallSources",s)} keys={keys} />
      </>}

      {/* Formula */}
      {step.type === "formula" && <div>
        <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Formula</label>
        <textarea value={step.formula||""} onChange={e => u("formula",e.target.value)} rows={3}
          placeholder='IF {mv_result} is "ok" THEN {email} ELSE ""'
          className="w-full mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono resize-y" />
        <p className="text-[10px] text-gray-400 mt-1">Supports: IF {"{col}"} is "val" THEN {"{col2}"} ELSE {"{col3}"} | OR | CONCAT()</p>
      </div>}

      {/* Push */}
      {step.type === "api_push" && <>
        <div>
          <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Campaign ID</label>
          <input value={step.campaignId||""} onChange={e => u("campaignId",e.target.value)} placeholder="From Instantly dashboard" className="w-full mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm" />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Email column</label>
          <select value={step.emailColumn||""} onChange={e => u("emailColumn",e.target.value)} className="w-full mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm">
            <option value="">Select...</option>
            {columns.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </>}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
//  MAIN DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════

export default function Dashboard() {
  const [supabase] = useState(() => createBrowserClient());
  const [keys, setKeys] = useState({});
  const [lists, setLists] = useState([]);
  const [currentListId, setCurrentListId] = useState(null);
  const [rows, setRows] = useState([]);
  const [origColumns, setOrigColumns] = useState([]);
  const [steps, setSteps] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [selectedStep, setSelectedStep] = useState(null);
  const [panel, setPanel] = useState(null); // keys | integrations | templates | prompts
  const [testMode, setTestMode] = useState(0);
  const [activeJob, setActiveJob] = useState(null);
  const [jobProgress, setJobProgress] = useState(null);
  const [editCell, setEditCell] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [loaded, setLoaded] = useState(false);
  const fileRef = useRef();
  const pollRef = useRef();

  const enrichCols = steps.map(s => s.outputColumn).filter(Boolean);
  const allColumns = sortColumns(origColumns, enrichCols);
  const hasData = rows.length > 0;

  // ─── Load initial data ──────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { data: keyData } = await supabase.from('api_keys').select('provider, encrypted_key').eq('user_id','default');
      const k = {}; (keyData||[]).forEach(r => { k[r.provider] = r.encrypted_key; }); setKeys(k);

      const { data: listData } = await supabase.from('lists').select('*').eq('user_id','default').order('created_at',{ascending:false});
      setLists(listData || []);

      const { data: wfData } = await supabase.from('workflows').select('*').eq('user_id','default').order('created_at',{ascending:false});
      setWorkflows(wfData || []);

      setLoaded(true);
    })();
  }, [supabase]);

  // ─── Realtime subscription for live job updates ────────────────────────
  useEffect(() => {
    if (!currentListId) return;
    const channel = supabase.channel(`list-${currentListId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'list_rows', filter: `list_id=eq.${currentListId}` }, (payload) => {
        setRows(prev => prev.map(r => r.id === payload.new.id ? { ...r, data: payload.new.data } : r));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, currentListId]);

  // ─── Job polling ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeJob) { if (pollRef.current) clearInterval(pollRef.current); return; }
    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/workflow/status?job_id=${activeJob}`);
      const data = await res.json();
      setJobProgress(data);
      if (data.status === 'completed' || data.status === 'stopped' || data.status === 'failed') {
        clearInterval(pollRef.current);
        // Reload rows
        if (currentListId) loadListRows(currentListId);
      }
    }, 2000);
    return () => clearInterval(pollRef.current);
  }, [activeJob, currentListId]);

  // ─── API Key management ────────────────────────────────────────────────
  const saveKey = async (provider, key) => {
    const newKeys = { ...keys, [provider]: key };
    setKeys(newKeys);
    await supabase.from('api_keys').upsert({ user_id: 'default', provider, encrypted_key: key }, { onConflict: 'user_id,provider' });
  };

  // ─── List management ───────────────────────────────────────────────────
  const loadListRows = async (listId) => {
    const { data } = await supabase.from('list_rows').select('*').eq('list_id', listId).order('row_index', { ascending: true });
    setRows(data || []);
    setCurrentListId(listId);
  };

  const loadList = async (listId) => {
    const { data: list } = await supabase.from('lists').select('*').eq('id', listId).single();
    if (list) {
      setOrigColumns(list.original_columns || []);
      await loadListRows(listId);
      setSteps([]);
      setSelectedStep(null);
    }
  };

  // ─── CSV Import ────────────────────────────────────────────────────────
  const handleFile = useCallback(async (file) => {
    if (!file) return;
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: async (results) => {
        const cols = results.meta.fields || [];
        const csvRows = results.data;

        // Create list
        const { data: newList } = await supabase.from('lists').insert({
          user_id: 'default', name: file.name.replace(/\.csv$/i, ''), row_count: csvRows.length, original_columns: cols,
        }).select().single();

        if (!newList) return;

        // Insert rows in batches
        const inserts = csvRows.map((r, i) => ({ list_id: newList.id, row_index: i, data: r }));
        for (let i = 0; i < inserts.length; i += 500) {
          await supabase.from('list_rows').insert(inserts.slice(i, i + 500));
        }

        setOrigColumns(cols);
        setLists(prev => [newList, ...prev]);
        await loadListRows(newList.id);
        setSteps([]);
        setSelectedStep(null);
      },
    });
  }, [supabase]);

  const handleDrop = useCallback((e) => { e.preventDefault(); const f = e.dataTransfer?.files?.[0]; if (f?.name.endsWith('.csv')) handleFile(f); }, [handleFile]);

  // ─── CSV Export ────────────────────────────────────────────────────────
  const exportCSV = () => {
    const data = rows.map(r => { const o = {}; allColumns.forEach(c => o[c] = r.data?.[c] || ''); return o; });
    const csv = Papa.unparse(data, { columns: allColumns });
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `jaklay_export.csv`; a.click();
  };

  // ─── Step management ───────────────────────────────────────────────────
  const addStep = (type) => {
    const s = {
      id: uid(), type, outputColumn: '', prompt: '', provider: type === 'web_research' ? 'perplexity' : 'openai',
      model: type === 'web_research' ? 'sonar' : 'gpt-4o-mini', condition: null, emailColumn: '', fnCol: '', lnCol: '', domainCol: '',
      waterfallSources: type === 'waterfall' ? ['leadmagic','findymail','prospeo','dropcontact','hunter','datagma','wiza','rocketreach'] : [],
      formula: '', campaignId: '', emailProvider: 'findymail', verifyProvider: 'millionverifier',
    };
    setSteps(prev => [...prev, s]);
    setSelectedStep(s.id);
    setPanel(null);
  };

  const updateStep = (s) => setSteps(prev => prev.map(x => x.id === s.id ? s : x));
  const deleteStep = (id) => { setSteps(prev => prev.filter(x => x.id !== id)); if (selectedStep === id) setSelectedStep(null); };
  const moveStep = (i, dir) => setSteps(prev => { const a = [...prev]; const j = i+dir; if(j<0||j>=a.length)return a; [a[i],a[j]]=[a[j],a[i]]; return a; });

  // ─── Workflow Templates ────────────────────────────────────────────────
  const saveWorkflow = async () => {
    const name = window.prompt('Template name:');
    if (!name) return;
    const { data: wf } = await supabase.from('workflows').insert({
      user_id: 'default', name, steps,
    }).select().single();
    if (wf) setWorkflows(prev => [wf, ...prev]);
  };

  const loadWorkflow = (wf) => {
    setSteps((wf.steps || []).map(s => ({ ...s, id: uid() })));
    setSelectedStep(null);
    setPanel(null);
  };

  // ─── Run Workflows ────────────────────────────────────────────────────
  const runAll = async () => {
    if (!currentListId || steps.length === 0) return;
    const res = await fetch('/api/workflow/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ list_id: currentListId, steps, test_limit: testMode }),
    });
    const data = await res.json();
    if (data.job_id) {
      setActiveJob(data.job_id);
      setJobProgress({ status: 'running', current_step: 0, current_row: 0, total_rows: rows.length, progress_pct: 0 });
    }
  };

  const stopJob = async () => {
    if (!activeJob) return;
    await fetch('/api/workflow/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: activeJob, action: 'stop' }),
    });
    setActiveJob(null);
  };

  // ─── Cell editing ──────────────────────────────────────────────────────
  const startEdit = (ri, col) => { setEditCell({ row: ri, col }); setEditValue(rows[ri]?.data?.[col] || ''); };
  const commitEdit = async () => {
    if (!editCell) return;
    const row = rows[editCell.row];
    const newData = { ...row.data, [editCell.col]: editValue };
    setRows(prev => { const c = [...prev]; c[editCell.row] = { ...c[editCell.row], data: newData }; return c; });
    await supabase.from('list_rows').update({ data: newData }).eq('id', row.id);
    setEditCell(null);
  };

  const selStep = steps.find(s => s.id === selectedStep);

  if (!loaded) return (
    <div className="h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-12 h-12 bg-indigo-500 rounded-xl flex items-center justify-center text-white font-mono font-bold text-xl mx-auto mb-3">J</div>
        <p className="text-gray-400 text-sm">Loading Jaklay...</p>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════════════════
  return (
    <div className="h-screen flex flex-col bg-gray-50 text-gray-900" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>

      {/* ─── Header ─── */}
      <header className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-gray-200 z-50 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center text-white font-mono font-bold text-lg">J</div>
          <div>
            <h1 className="text-sm font-extrabold tracking-widest font-mono text-gray-900 leading-none">JAKLAY</h1>
            <span className="text-[11px] text-gray-400">{hasData ? `${rows.length} rows · ${allColumns.length} cols` : 'AI Data Enrichment'}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {lists.length > 0 && (
            <select value={currentListId||''} onChange={e => e.target.value && loadList(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white min-w-[140px]">
              <option value="">📋 My Lists...</option>
              {lists.map(l => <option key={l.id} value={l.id}>{l.name} ({l.row_count})</option>)}
            </select>
          )}
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            {[{k:'keys',l:'🔑 Keys'},{k:'integrations',l:'🔌 Setup'},{k:'templates',l:'📄 Templates'},{k:'prompts',l:'📚 Prompts'}].map(({k,l}) => (
              <button key={k} onClick={() => { setPanel(panel===k?null:k); setSelectedStep(null); }}
                className={`px-2.5 py-1 text-xs rounded-md transition ${panel===k ? 'bg-white shadow text-indigo-600 font-semibold' : 'text-gray-500 hover:text-gray-700'}`}>{l}</button>
            ))}
          </div>
          {hasData && <>
            <div className="flex bg-gray-100 rounded-lg p-0.5 border-l border-gray-200 ml-1 pl-1">
              {[0,1,5,10].map(n => (
                <button key={n} onClick={() => setTestMode(n)}
                  className={`px-2 py-1 text-xs rounded-md ${testMode===n?'bg-white shadow font-semibold text-indigo-600':'text-gray-400'}`}>{n||'All'}</button>
              ))}
              <span className="text-[10px] text-gray-400 px-1 self-center">rows</span>
            </div>
            {activeJob ? (
              <button onClick={stopJob} className="px-3 py-1.5 bg-red-50 text-red-500 border border-red-200 rounded-lg text-xs font-semibold hover:bg-red-100">
                ■ Stop {jobProgress ? `(${jobProgress.progress_pct||0}%)` : ''}
              </button>
            ) : (
              <button onClick={runAll} className="px-4 py-1.5 bg-indigo-500 text-white rounded-lg text-xs font-semibold hover:bg-indigo-600">▶ Run All</button>
            )}
            <button onClick={exportCSV} className="px-3 py-1.5 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-lg text-xs font-semibold">↓ Export</button>
          </>}
        </div>
      </header>

      {/* ─── Job Progress Bar ─── */}
      {jobProgress && (jobProgress.status === 'running' || jobProgress.status === 'pending') && (
        <div className="h-1 bg-gray-200">
          <div className="h-full bg-indigo-500 transition-all duration-500" style={{width:`${jobProgress.progress_pct||0}%`}} />
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* ─── LEFT: Steps Sidebar ─── */}
        <div className="w-[260px] min-w-[260px] bg-white border-r border-gray-200 flex flex-col overflow-hidden">
          <div className="px-3 py-2.5 border-b border-gray-200 flex items-center justify-between">
            <span className="font-bold text-xs">Workflow Steps</span>
            <span className="text-[11px] text-gray-400">{steps.length}</span>
          </div>

          {/* Steps */}
          <div className="flex-1 overflow-auto p-1.5 space-y-1">
            {steps.map((step, i) => {
              const st = STEP_TYPES.find(t => t.id === step.type);
              const isActive = selectedStep === step.id;
              return (
                <div key={step.id} onClick={() => { setSelectedStep(step.id); setPanel(null); }}
                  className={`px-2.5 py-2 rounded-lg cursor-pointer transition border-l-[3px] ${isActive ? 'bg-indigo-50 border-indigo-500' : 'border-transparent hover:bg-gray-50'}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-300 text-[10px] cursor-grab">☰</span>
                    <span className="text-sm">{st?.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold truncate">{step.outputColumn || st?.label}</div>
                      <div className="text-[10px] text-gray-400">{st?.label}</div>
                    </div>
                  </div>
                  <div className="flex gap-1 mt-1.5">
                    <button onClick={e => {e.stopPropagation(); moveStep(i,-1);}} className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px] text-gray-500 hover:bg-gray-200">↑</button>
                    <button onClick={e => {e.stopPropagation(); moveStep(i,1);}} className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px] text-gray-500 hover:bg-gray-200">↓</button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add Step */}
          <div className="border-t border-gray-200 p-2 max-h-[40vh] overflow-auto">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">+ Add Column</div>
            {['enrichment','logic','action'].map(cat => (
              <div key={cat}>
                <div className="text-[10px] text-gray-300 uppercase tracking-wide pt-2 pb-1">{cat}</div>
                {STEP_TYPES.filter(s => s.cat === cat).map(st => (
                  <button key={st.id} onClick={() => addStep(st.id)}
                    className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-left hover:bg-gray-50 transition">
                    <span className="text-sm">{st.icon}</span>
                    <div>
                      <div className="text-xs font-medium">{st.label}</div>
                      <div className="text-[10px] text-gray-400">{st.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            ))}
            {steps.length > 0 && (
              <button onClick={saveWorkflow} className="flex items-center gap-2 w-full px-2 py-1.5 mt-2 rounded-md bg-indigo-50 border border-indigo-200 hover:bg-indigo-100">
                <span>💾</span><span className="text-xs font-medium text-indigo-600">Save as Template</span>
              </button>
            )}
          </div>
        </div>

        {/* ─── CENTER: Table ─── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!hasData ? (
            <div className="flex-1 flex flex-col items-center justify-center cursor-pointer" onDragOver={e => e.preventDefault()} onDrop={handleDrop} onClick={() => fileRef.current?.click()}>
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e => handleFile(e.target.files?.[0])} />
              <div className="text-5xl mb-4">📂</div>
              <h2 className="text-xl font-bold mb-2">Drop a CSV or click to upload</h2>
              <p className="text-gray-400 text-sm mb-6">Import leads, then build your enrichment pipeline.</p>
              <div className="flex gap-2">
                {['Upload CSV','Add AI steps','Run enrichment','Export results'].map((t,i) => (
                  <div key={t} className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-sm">
                    <span className="w-5 h-5 bg-indigo-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold">{i+1}</span>{t}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-auto">
                <table className="min-w-full border-collapse text-xs" style={{width:'max-content',minWidth:'100%'}}>
                  <thead>
                    <tr>
                      <th className="sticky top-0 z-10 bg-gray-50 px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide border-b-2 border-gray-200 w-10">#</th>
                      {allColumns.map(col => {
                        const isEnrich = enrichCols.includes(col);
                        const st = steps.find(s => s.outputColumn === col);
                        const stType = st ? STEP_TYPES.find(t => t.id === st.type) : null;
                        return (
                          <th key={col} className={`sticky top-0 z-10 px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide border-b-2 border-gray-200 whitespace-nowrap min-w-[120px] ${isEnrich ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-50 text-gray-400'}`}>
                            <div className="flex items-center gap-1">
                              {stType && <span className="text-xs">{stType.icon}</span>}
                              {col}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, ri) => (
                      <tr key={row.id || ri} className={`${ri%2?'bg-gray-50/50':'bg-white'} hover:bg-indigo-50/30 transition`}>
                        <td className="px-3 py-1.5 text-[10px] text-gray-300 border-b border-gray-100">{ri+1}</td>
                        {allColumns.map(col => {
                          const val = row.data?.[col] || '';
                          const isEditing = editCell?.row === ri && editCell?.col === col;
                          const isErr = val.toString().startsWith('⚠');
                          const isOk = ['✅ Pass','✅ Pushed','ok','YES'].includes(val);
                          const isFail = ['❌ Fail','NO','invalid'].includes(val);
                          return (
                            <td key={col} onDoubleClick={() => startEdit(ri,col)} title={val}
                              className={`px-3 py-1.5 border-b border-gray-100 max-w-[300px] ${isErr?'text-red-500':isOk?'text-green-600':isFail?'text-red-500':''}`}>
                              {isEditing ? (
                                <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                                  onBlur={commitEdit} onKeyDown={e => {if(e.key==='Enter')commitEdit();if(e.key==='Escape')setEditCell(null);}}
                                  className="w-full px-1.5 py-0.5 border-2 border-indigo-500 rounded text-xs font-mono outline-none" />
                              ) : (
                                <div className="truncate">{val}</div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-2 text-[11px] text-gray-400 border-t border-gray-200 bg-white font-mono flex items-center gap-3">
                {rows.length} rows · {allColumns.length} columns · {steps.length} steps
                <button onClick={() => fileRef.current?.click()} className="text-indigo-500 hover:underline">↑ Import new</button>
                <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e => handleFile(e.target.files?.[0])} />
              </div>
            </>
          )}
        </div>

        {/* ─── RIGHT: Config Panel ─── */}
        {(selStep || panel) && (
          <div className="w-[340px] min-w-[340px] bg-white border-l border-gray-200 flex flex-col overflow-hidden animate-in">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <span className="font-bold text-sm">
                {panel==='keys'?'🔑 API Keys':panel==='integrations'?'🔌 Integration Setup':panel==='templates'?'📄 Templates':panel==='prompts'?'📚 Prompt Library':'⚙️ Step Config'}
              </span>
              <button onClick={() => {setSelectedStep(null);setPanel(null);}} className="text-gray-400 hover:text-gray-600 text-lg">×</button>
            </div>
            <div className="flex-1 overflow-auto">

              {/* API Keys */}
              {panel === 'keys' && (
                <div className="p-4 space-y-3">
                  {Object.entries(INTEG_SETUP).map(([id,integ]) => (
                    <div key={id}>
                      <label className="text-xs font-semibold text-gray-500 flex items-center gap-1.5">
                        {integ.icon} {integ.name}
                        {keys[id] && <span className="text-[10px] text-green-500">● Connected</span>}
                      </label>
                      <input type="password" value={keys[id]||''} onChange={e => saveKey(id, e.target.value)}
                        placeholder="Paste API key..." className="w-full mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs" />
                    </div>
                  ))}
                  <div className="text-[11px] text-gray-400 p-3 bg-gray-50 rounded-lg">🔒 Keys stored in Supabase. Only sent to each provider's API.</div>
                </div>
              )}

              {/* Integration Setup Guides */}
              {panel === 'integrations' && (
                <div className="p-4 space-y-2">
                  {Object.entries(INTEG_SETUP).map(([id,integ]) => (
                    <details key={id} className="bg-gray-50 rounded-lg border border-gray-100">
                      <summary className="px-3 py-2.5 cursor-pointer flex items-center gap-2 text-sm">
                        <span>{integ.icon}</span>
                        <span className="font-semibold text-xs">{integ.name}</span>
                        {keys[id] ? <span className="text-[10px] text-green-500 ml-auto">✓ Ready</span> : <span className="text-[10px] text-red-400 ml-auto">Setup needed</span>}
                      </summary>
                      <pre className="px-3 pb-3 text-[11px] text-gray-500 whitespace-pre-wrap leading-relaxed">{integ.setup}</pre>
                    </details>
                  ))}
                  <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-100 mt-3">
                    <p className="text-xs font-semibold text-indigo-700 mb-1">📨 Webhook for Make.com</p>
                    <code className="text-[10px] text-indigo-600 font-mono break-all">POST {typeof window !== 'undefined' ? window.location.origin : ''}/api/webhook</code>
                    <p className="text-[10px] text-indigo-500 mt-1">Header: x-webhook-secret = your_secret</p>
                    <p className="text-[10px] text-indigo-500">Body: {"{ workflow_id, list_id, test_limit }"}</p>
                  </div>
                </div>
              )}

              {/* Templates */}
              {panel === 'templates' && (
                <div className="p-4 space-y-2">
                  {workflows.length === 0 && <p className="text-sm text-gray-400 text-center py-8">No saved templates yet</p>}
                  {workflows.map(wf => (
                    <div key={wf.id} className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                      <div className="font-semibold text-xs">{wf.name}</div>
                      <div className="text-[10px] text-gray-400">{(wf.steps||[]).length} steps · {new Date(wf.created_at).toLocaleDateString()}</div>
                      <div className="text-[10px] text-gray-400 font-mono mt-1">ID: {wf.id}</div>
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => loadWorkflow(wf)} className="text-[11px] text-indigo-600 font-semibold hover:underline">Load</button>
                        <button onClick={async () => { await supabase.from('workflows').delete().eq('id',wf.id); setWorkflows(prev => prev.filter(w => w.id !== wf.id)); }} className="text-[11px] text-red-400 hover:underline">Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Prompt Library */}
              {panel === 'prompts' && (
                <div className="p-4 space-y-2">
                  {PROMPT_LIBRARY.map(p => (
                    <div key={p.id} className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                      <div className="font-semibold text-xs">{p.name}</div>
                      <div className="text-[10px] text-indigo-500 mt-0.5">Rec: {p.model} — {p.reason}</div>
                      <pre className="text-[10px] text-gray-400 mt-1 whitespace-pre-wrap max-h-16 overflow-hidden leading-relaxed font-mono">{p.prompt}</pre>
                    </div>
                  ))}
                </div>
              )}

              {/* Step Config */}
              {selStep && !panel && (
                <StepConfig step={selStep} columns={allColumns} keys={keys} onUpdate={updateStep} onDelete={() => deleteStep(selStep.id)} />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
