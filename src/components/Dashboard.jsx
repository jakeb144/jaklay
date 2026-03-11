'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import Papa from 'papaparse';
import { useAuth } from '@/lib/auth';
import { getPlanLimits } from '@/lib/plans';

/* ─── CONSTANTS ──────────────────────────────────────────────────────────── */

const INTEGRATIONS = {
  anthropic:      { icon: '🟣', name: 'Anthropic (Claude)', type: 'ai', setup: 'Get your API key at console.anthropic.com → Settings → API Keys' },
  openai:         { icon: '🟢', name: 'OpenAI', type: 'ai', setup: 'Get your API key at platform.openai.com → API Keys' },
  perplexity:     { icon: '🔵', name: 'Perplexity', type: 'ai', setup: 'Get your API key at perplexity.ai/settings → API' },
  millionverifier:{ icon: '✅', name: 'MillionVerifier', type: 'verify', setup: 'Get your API key at app.millionverifier.com → API' },
  emaillable:     { icon: '📧', name: 'Emaillable', type: 'verify', setup: 'Get your API key at app.emaillable.com → API Settings' },
  bounceban:      { icon: '🛡️', name: 'BounceBan', type: 'verify', setup: 'Get your API key at bounceban.com → Dashboard → API' },
  findymail:      { icon: '🔍', name: 'FindyMail', type: 'email_finder', setup: 'Get your API key at app.findymail.com → Settings → API' },
  hunter:         { icon: '🎯', name: 'Hunter.io', type: 'email_finder', setup: 'Get your API key at hunter.io → API' },
  prospeo:        { icon: '📬', name: 'Prospeo', type: 'email_finder', setup: 'Get your API key at prospeo.io → Settings → API' },
  dropcontact:    { icon: '💧', name: 'DropContact', type: 'email_finder', setup: 'Get your API key at dropcontact.com → API' },
  leadmagic:      { icon: '✨', name: 'LeadMagic', type: 'email_finder', setup: 'Get your API key at leadmagic.io → API' },
  datagma:        { icon: '📊', name: 'Datagma', type: 'email_finder', setup: 'Get your API key at datagma.com → API' },
  wiza:           { icon: '⚡', name: 'Wiza', type: 'email_finder', setup: 'Get your API key at wiza.co → Settings → API' },
  rocketreach:    { icon: '🚀', name: 'RocketReach', type: 'email_finder', setup: 'Get your API key at rocketreach.co → API' },
  instantly:      { icon: '📤', name: 'Instantly', type: 'outreach', setup: 'Get your API key at app.instantly.ai → Settings → Integrations → API' },
  apify:          { icon: '🕷️', name: 'Apify', type: 'scraping', setup: 'Get your API token at console.apify.com → Settings → Integrations' },
  phantombuster:  { icon: '👻', name: 'PhantomBuster', type: 'scraping', setup: 'Get your API key at phantombuster.com → Settings → API' },
  google_search:  { icon: '🔎', name: 'Serper (Google)', type: 'scraping', setup: 'Get your API key at serper.dev → API Key' },
  ocean:          { icon: '🌊', name: 'Ocean.io', type: 'data', setup: 'Get your API key at ocean.io → Settings → API' },
};

const PROVIDER_MODELS = {
  openai:    ['gpt-4o', 'gpt-4o-mini'],
  anthropic: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-haiku-4-20250514'],
  perplexity:['sonar', 'sonar-pro'],
};

const PROVIDER_COSTS = {
  hunter:      { cost: 0, free: 25,  label: 'Hunter.io' },
  leadmagic:   { cost: 0.001, free: 50,  label: 'LeadMagic' },
  wiza:        { cost: 0.0015, free: 20, label: 'Wiza' },
  prospeo:     { cost: 0.002, free: 75,  label: 'Prospeo' },
  dropcontact: { cost: 0.0024, free: 25, label: 'DropContact' },
  datagma:     { cost: 0.003, free: 50,  label: 'Datagma' },
  findymail:   { cost: 0.02, free: 0,   label: 'FindyMail' },
  rocketreach: { cost: 0.048, free: 0,  label: 'RocketReach' },
};

const WATERFALL_ORDER = Object.keys(PROVIDER_COSTS).sort((a, b) => PROVIDER_COSTS[a].cost - PROVIDER_COSTS[b].cost);

const PROMPT_LIBRARY = [
  { id: 'qualify_b2b', name: 'Qualify B2B Fit', provider: 'openai', model: 'gpt-4o-mini', reason: 'Fast and cheap for binary classification',
    prompt: 'Given the following company info:\nCompany: {{companyName}}\nIndustry: {{industry}}\nEmployee count: {{employeeCount}}\n\nIs this a good B2B fit for a SaaS product targeting mid-market companies? Reply YES or NO with a one-sentence reason.' },
  { id: 'find_owner', name: 'Find Owner / Decision Maker', provider: 'perplexity', model: 'sonar', reason: 'Needs live web access to find people',
    prompt: 'Who is the owner or primary decision maker at {{companyName}}? If it\'s a franchise, who is the local franchisee or operator? Return their full name and title. If unknown, say "Not found".' },
  { id: 'match_pr', name: 'Match Best PR Firm', provider: 'perplexity', model: 'sonar-pro', reason: 'Deep research across multiple sources',
    prompt: 'Research {{companyName}} in {{industry}}. Recommend the single best PR firm for them based on industry fit, size match, and geographic proximity to {{city}}, {{state}}. Return: Firm Name, Why They Fit (1 sentence), Website.' },
  { id: 'pr_title', name: 'Generate PR Article Title', provider: 'anthropic', model: 'claude-sonnet-4-20250514', reason: 'Creative writing strength',
    prompt: 'Write a compelling PR article title for {{companyName}} ({{industry}}). The article should highlight their unique value proposition. Return only the title, no quotes.' },
  { id: 'cold_email', name: 'Write Personalized Cold Email', provider: 'anthropic', model: 'claude-opus-4-20250514', reason: 'Most human-sounding writing',
    prompt: 'Write a short, personalized cold email to {{firstName}} {{lastName}} at {{companyName}}.\nTheir role: {{jobTitle}}\nPurpose: Introduce our catering booking service for food trucks.\nTone: Casual, confident, not salesy.\nMax 4 sentences. Include a specific detail about their company.' },
  { id: 'confidence', name: 'Data Confidence Score', provider: 'openai', model: 'gpt-4o-mini', reason: 'Simple classification task',
    prompt: 'Rate the data quality/confidence for this lead on a scale of 1-5:\nName: {{firstName}} {{lastName}}\nEmail: {{email}}\nCompany: {{companyName}}\nTitle: {{jobTitle}}\nPhone: {{phone}}\n\nScore 5=all fields present and valid, 1=mostly missing. Return only the number.' },
];

const STEP_CATEGORIES = [
  { label: 'AI Enrichment', items: [
    { type: 'ai_enrich', name: 'AI Enrich', icon: '🤖' },
    { type: 'web_research', name: 'Web Research', icon: '🌐' },
  ]},
  { label: 'Email Tools', items: [
    { type: 'api_find_email', name: 'Find Email', icon: '📧' },
    { type: 'waterfall', name: 'Waterfall Find', icon: '💧' },
    { type: 'api_verify', name: 'Verify Email', icon: '✅' },
  ]},
  { label: 'Logic', items: [
    { type: 'formula', name: 'Formula', icon: '🧮' },
    { type: 'condition_gate', name: 'Condition Gate', icon: '🚦' },
  ]},
  { label: 'Actions', items: [
    { type: 'api_push', name: 'Push to Instantly', icon: '📤' },
    { type: 'scrape', name: 'Scrape', icon: '🕷️' },
  ]},
];

const TEMPLATE_PRESETS = [
  { id: 'lead_basic', name: 'Lead List Basic', columns: ['firstName','lastName','email','companyName','jobTitle'] },
  { id: 'lead_full', name: 'Lead List Full', columns: ['firstName','lastName','email','companyName','jobTitle','phone','website','linkedin','city','state','industry'] },
  { id: 'company_list', name: 'Company List', columns: ['companyName','industry','website','city','state','employeeCount','revenue'] },
  { id: 'email_campaign', name: 'Email Campaign', columns: ['firstName','lastName','email','companyName','jobTitle','city','state'] },
];

// Maps camelCase canonical names to common CSV header variants
const COL_DETECT_MAP = {
  firstName: ['first_name','firstname','fname','first','given_name','givenname','first name'],
  lastName: ['last_name','lastname','lname','last','surname','family_name','familyname','last name'],
  fullName: ['full_name','fullname','name','contact_name','contactname','full name'],
  email: ['email','email_address','emailaddress','e_mail','e-mail','work_email','workemail'],
  companyName: ['company_name','companyname','company','organization','org','employer','business_name','company name'],
  jobTitle: ['job_title','jobtitle','title','position','role','designation','job title'],
  phone: ['phone','phone_number','phonenumber','tel','telephone','mobile','cell'],
  website: ['website','url','web','domain','company_url','companyurl','site'],
  linkedin: ['linkedin','linkedin_url','linkedinurl','li_url','linkedin_profile'],
  city: ['city','town','locality'],
  state: ['state','region','province','state_code','statecode'],
  country: ['country','nation','country_code','countrycode'],
  industry: ['industry','sector','vertical'],
  revenue: ['revenue','annual_revenue','annualrevenue'],
  employeeCount: ['employee_count','employeecount','employees','company_size','companysize','headcount','employee count'],
};

// Cold email priority sort order
const CORE_COL_ORDER = ['firstName','lastName','fullName','email','companyName','jobTitle','linkedin','phone','website','city','state','country','industry','employeeCount','revenue'];

// Returns the camelCase canonical name if a match is found, otherwise null
function detectColumnType(header) {
  const h = header.toLowerCase().replace(/[\s\-\.]/g, '_').replace(/[^a-z0-9_]/g, '');
  const hSpaced = header.toLowerCase().trim();
  for (const [canonical, variants] of Object.entries(COL_DETECT_MAP)) {
    if (canonical.toLowerCase() === h || variants.includes(h) || variants.includes(hSpaced)) return canonical;
  }
  return null;
}

function cellColor(val) {
  if (!val) return '';
  const v = String(val).toLowerCase().trim();
  if (['ok','yes','valid','deliverable','true','pass','found'].includes(v)) return 'bg-emerald-900/30 text-emerald-300';
  if (['error','invalid','no','undeliverable','false','fail','not found','risky'].includes(v)) return 'bg-red-900/30 text-red-300';
  if (['skip','skipped','catch-all','catch_all','unknown','pending'].includes(v)) return 'bg-amber-900/30 text-amber-300';
  return '';
}

const PLAN_COLORS = { admin: 'bg-red-600', pro: 'bg-indigo-600', starter: 'bg-emerald-600', free: 'bg-zinc-600' };

/* ─── DASHBOARD COMPONENT ────────────────────────────────────────────────── */

export default function Dashboard() {
  const { supabase, user, profile, loading: authLoading, signOut, canRun, isAdmin, isPaid } = useAuth();
  const userId = user?.id || 'default';

  // ── Loading & UI state ──
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState('spreadsheet');
  const [rightPanel, setRightPanel] = useState(null);
  const [rightPanelData, setRightPanelData] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [headerContextMenu, setHeaderContextMenu] = useState(null);
  const [showAddStep, setShowAddStep] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [notification, setNotification] = useState(null);
  const [showUpgradeCta, setShowUpgradeCta] = useState(false);

  // ── Lists & rows ──
  const [lists, setLists] = useState([]);
  const [activeListId, setActiveListId] = useState(null);
  const [rows, setRows] = useState([]);
  const [origColumns, setOrigColumns] = useState([]);
  const [columnOrder, setColumnOrder] = useState([]);
  const [columnTypes, setColumnTypes] = useState({});

  // ── Steps / workflow ──
  const [steps, setSteps] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [activeWorkflowId, setActiveWorkflowId] = useState(null);
  const [draftFields, setDraftFields] = useState({});  // { prompt, formula, outputColumn, campaignId, query, rowRange, conditionValue }
  const draftRef = useRef({});
  const [configSaved, setConfigSaved] = useState(false);

  // ── API keys ──
  const [apiKeys, setApiKeys] = useState({});

  // ── Run state ──
  const [runningStep, setRunningStep] = useState(null);
  const [runProgress, setRunProgress] = useState(null);
  const [testMode, setTestMode] = useState(0);
  const abortRef = useRef(false);

  // ── Sort / filter ──
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [filters, setFilters] = useState([]);

  // ── Editing ──
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState('');

  // ── Merge ──
  const [mergeFile, setMergeFile] = useState(null);
  const [mergeData, setMergeData] = useState(null);
  const [mergeMatchCol, setMergeMatchCol] = useState({ left: '', right: '' });
  const [mergeCols, setMergeCols] = useState([]);

  // ── Drag state ──
  const dragStepRef = useRef(null);
  const dragOverStepRef = useRef(null);
  const dragColRef = useRef(null);
  const dragOverColRef = useRef(null);

  // ── Refs ──
  const fileInputRef = useRef(null);
  const mergeInputRef = useRef(null);
  const scrollRef = useRef(null);

  // ── Virtual scroll ──
  const ROW_HEIGHT = 36;
  const OVERSCAN = 10;
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(800);

  // ── Intermittent upgrade CTA (free users, ~1 in 3 loads, max once per 4 hours) ──
  useEffect(() => {
    if (isPaid) return;
    try {
      const last = parseInt(localStorage.getItem('jaklay_cta_dismissed') || '0', 10);
      const hoursSince = (Date.now() - last) / 3.6e6;
      if (hoursSince > 4 && Math.random() < 0.33) {
        const timer = setTimeout(() => setShowUpgradeCta(true), 3000);
        return () => clearTimeout(timer);
      }
    } catch (e) {}
  }, [isPaid]);

  /* ─── NOTIFY HELPER ──────────────────────────────────────────────────── */

  const notify = useCallback((msg, type = 'info') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3500);
  }, []);

  /* ─── DATA LOADING ───────────────────────────────────────────────────── */

  const loadApiKeys = useCallback(async () => {
    if (!supabase || !user) return;
    try {
      const { data } = await supabase.from('api_keys').select('provider, encrypted_key').eq('user_id', userId);
      const keys = {};
      (data || []).forEach(k => { keys[k.provider] = k.encrypted_key; });
      setApiKeys(keys);
    } catch (e) { console.error('loadApiKeys', e); }
  }, [supabase, user, userId]);

  const loadLists = useCallback(async () => {
    if (!supabase || !user) return;
    try {
      const { data } = await supabase.from('lists').select('*').eq('user_id', userId).order('created_at', { ascending: false });
      setLists(data || []);
      return data || [];
    } catch (e) { console.error('loadLists', e); return []; }
  }, [supabase, user, userId]);

  const loadRows = useCallback(async (listId) => {
    if (!supabase || !listId) return [];
    try {
      let allRows = [];
      let from = 0;
      const chunk = 999;
      while (true) {
        const { data, error } = await supabase
          .from('list_rows')
          .select('*')
          .eq('list_id', listId)
          .order('row_index', { ascending: true })
          .range(from, from + chunk);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allRows = allRows.concat(data);
        if (data.length <= chunk) break;
        from += data.length;
      }
      return allRows;
    } catch (e) { console.error('loadRows', e); return []; }
  }, [supabase]);

  const loadWorkflows = useCallback(async () => {
    if (!supabase || !user) return;
    try {
      const { data } = await supabase.from('workflows').select('*').eq('user_id', userId).order('created_at', { ascending: false });
      setWorkflows(data || []);
    } catch (e) { console.error('loadWorkflows', e); }
  }, [supabase, user, userId]);

  const switchList = useCallback(async (listId) => {
    setActiveListId(listId);
    if (!listId) { setRows([]); setOrigColumns([]); setColumnOrder([]); setSteps([]); return; }
    const list = lists.find(l => l.id === listId);
    const loadedRows = await loadRows(listId);
    setRows(loadedRows);
    // derive columns: prefer original_columns, fallback to keys from first row's data
    let oc = list?.original_columns || [];
    if ((!oc || oc.length === 0) && loadedRows.length > 0) {
      const keySet = new Set();
      loadedRows.slice(0, 20).forEach(r => { Object.keys(r.data || {}).forEach(k => keySet.add(k)); });
      oc = [...keySet];
    }
    setOrigColumns(oc);
    // detect column types
    const types = {};
    oc.forEach(c => { types[c] = detectColumnType(c) || 'unknown'; });
    setColumnTypes(types);
    // load associated steps from jobs or workflow
    let loadedSteps = [];
    try {
      const { data: jobs } = await supabase.from('jobs').select('*').eq('list_id', listId).eq('user_id', userId).order('created_at', { ascending: false }).limit(1);
      if (jobs && jobs.length > 0 && jobs[0].steps) {
        loadedSteps = jobs[0].steps;
        setSteps(loadedSteps);
      } else {
        setSteps([]);
      }
    } catch (e) { console.error('loadSteps', e); }
    // discover extra columns in row data not in origColumns
    if (loadedRows.length > 0) {
      const allKeys = new Set();
      loadedRows.slice(0, 50).forEach(r => { Object.keys(r.data || {}).forEach(k => allKeys.add(k)); });
      const extraCols = [...allKeys].filter(k => !oc.includes(k));
      if (extraCols.length > 0) oc = [...oc, ...extraCols];
      setOrigColumns(oc);
    }
    // auto-recover orphaned enrichment columns with strict pattern matching
    const stepColNames = new Set(loadedSteps.map(s => s.outputColumn));
    const STEP_PREFIXES = [
      { prefix: 'ai_enrich_', type: 'ai_enrich', provider: 'openai', model: 'gpt-4o' },
      { prefix: 'web_research_', type: 'web_research', provider: 'perplexity', model: 'sonar' },
      { prefix: 'find_email_', type: 'api_find_email', provider: 'findymail', model: '' },
      { prefix: 'waterfall_find_', type: 'waterfall', provider: '', model: '' },
      { prefix: 'verify_email_', type: 'api_verify', provider: 'millionverifier', model: '' },
      { prefix: 'formula_', type: 'formula', provider: '', model: '' },
      { prefix: 'condition_gate_', type: 'condition_gate', provider: '', model: '' },
      { prefix: 'push_to_instantly_', type: 'api_push', provider: '', model: '' },
      { prefix: 'scrape_', type: 'scrape', provider: 'google_search', model: '' },
    ];
    const orphanSteps = [];
    oc.forEach(col => {
      if (stepColNames.has(col)) return;
      for (const sp of STEP_PREFIXES) {
        if (col.startsWith(sp.prefix) && col.length > sp.prefix.length) {
          orphanSteps.push({
            id: 'step_recovered_' + col, type: sp.type, outputColumn: col,
            provider: sp.provider, model: sp.model, prompt: '', condition: null, rowRange: '',
          });
          break;
        }
      }
    });
    if (orphanSteps.length > 0) loadedSteps = [...loadedSteps, ...orphanSteps];
    setSteps(loadedSteps);
    // build column order: check saved order first, then build default
    try {
      const savedOrder = localStorage.getItem(`jaklay_colorder_${listId}`);
      if (savedOrder) {
        const parsed = JSON.parse(savedOrder);
        const allCols = new Set(oc);
        loadedSteps.forEach(s => { if (s.outputColumn) allCols.add(s.outputColumn); });
        const missing = [...allCols].filter(c => !parsed.includes(c));
        // deduplicate
        const order = [...parsed.filter(c => allCols.has(c)), ...missing];
        setColumnOrder([...new Set(order)]);
      } else {
        buildColumnOrder(oc, loadedSteps);
      }
    } catch (e) {
      buildColumnOrder(oc, loadedSteps);
    }
  }, [lists, loadRows, supabase, userId]);

  const buildColumnOrder = useCallback((oc, currentSteps) => {
    const enrichCols = (currentSteps || []).map(s => s.outputColumn).filter(Boolean);
    const corePresent = CORE_COL_ORDER.filter(c => oc.includes(c));
    const remaining = oc.filter(c => !CORE_COL_ORDER.includes(c) && !enrichCols.includes(c));
    setColumnOrder([...new Set([...corePresent, ...enrichCols, ...remaining])]);
  }, []);

  // ── Initial load ──
  useEffect(() => {
    if (authLoading || !user || !supabase) return;
    let cancelled = false;
    (async () => {
      try {
        await loadApiKeys();
        const ls = await loadLists();
        await loadWorkflows();
        if (!cancelled && ls && ls.length > 0) {
          await switchList(ls[0].id);
        }
      } catch (e) {
        console.error('init load error', e);
      } finally {
        if (!cancelled) {
          setLoaded(true);
          setTimeout(() => { initialLoadDone.current = true; }, 500);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [authLoading, user, supabase]);

  /* ─── API KEY MANAGEMENT ─────────────────────────────────────────────── */

  const saveApiKey = useCallback(async (provider, key) => {
    if (!supabase || !user) return;
    try {
      const { error } = await supabase.from('api_keys').upsert(
        { user_id: userId, provider, encrypted_key: key },
        { onConflict: 'user_id,provider' }
      );
      if (!error) {
        setApiKeys(prev => ({ ...prev, [provider]: key }));
        notify(`${INTEGRATIONS[provider]?.name || provider} key saved`, 'success');
      }
    } catch (e) { console.error('saveApiKey', e); notify('Failed to save key', 'error'); }
  }, [supabase, user, userId, notify]);

  /* ─── CSV IMPORT ─────────────────────────────────────────────────────── */

  const handleCSVUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file || !supabase) return;
    try {
      const text = await file.text();
      const parsed = parseCSV(text);
      if (!parsed.headers.length || !parsed.rows.length) { notify('Empty CSV', 'error'); return; }

      // enforce row limit per plan — truncate to allowed rows instead of rejecting
      const limits = getPlanLimits(profile?.plan);
      let truncated = false;
      if (parsed.rows.length > limits.rows) {
        truncated = true;
        const originalCount = parsed.rows.length;
        parsed.rows = parsed.rows.slice(0, limits.rows);
        notify(`Your ${(profile?.plan || 'free').toUpperCase()} plan allows ${limits.rows.toLocaleString()} rows. Imported first ${limits.rows.toLocaleString()} of ${originalCount.toLocaleString()} rows. Upgrade to import more.`, 'info');
      }

      // detect column types and auto-rename to camelCase canonical names
      const types = {};
      const usedNames = new Set();
      const mappedHeaders = parsed.headers.map(h => {
        const detected = detectColumnType(h);
        // Use canonical camelCase name if detected, otherwise keep original trimmed
        let colName = detected || h.trim();
        // handle duplicate detection (e.g., two columns both mapping to same canonical)
        if (usedNames.has(colName)) {
          colName = h.trim(); // fall back to original if duplicate
        }
        usedNames.add(colName);
        types[colName] = detected || 'unknown';
        return colName;
      });

      // create list
      const { data: listData, error: listErr } = await supabase.from('lists').insert({
        user_id: userId, name: file.name.replace(/\.csv$/i, ''), row_count: parsed.rows.length, original_columns: mappedHeaders
      }).select().single();
      if (listErr) throw listErr;

      // insert rows in batches
      const batchSize = 500;
      for (let i = 0; i < parsed.rows.length; i += batchSize) {
        const batch = parsed.rows.slice(i, i + batchSize).map((row, idx) => {
          const data = {};
          mappedHeaders.forEach((h, ci) => { data[h] = row[ci] || ''; });
          return { list_id: listData.id, row_index: i + idx, data };
        });
        await supabase.from('list_rows').insert(batch);
      }

      setColumnTypes(types);
      try { localStorage.removeItem('jaklay_colorder_' + listData.id); } catch (e) {}
      const ls = await loadLists();
      await switchList(listData.id);
      if (!truncated) notify(`Imported ${parsed.rows.length} rows`, 'success');
    } catch (e) {
      console.error('CSV import', e);
      notify('Import failed: ' + e.message, 'error');
    }
    e.target.value = '';
  }, [supabase, userId, loadLists, switchList, notify]);

  /* ─── CSV PARSER ─────────────────────────────────────────────────────── */

  function parseCSV(text) {
    const result = Papa.parse(text, {
      header: false,
      skipEmptyLines: true,
    });
    if (!result.data || result.data.length === 0) return { headers: [], rows: [] };
    const headers = result.data[0].map(h => (h || '').trim());
    const rows = result.data.slice(1);
    return { headers, rows };
  }

  /* ─── EXPORT CSV ─────────────────────────────────────────────────────── */

  const exportCSV = useCallback(() => {
    if (!filteredRows.length) return;
    const cols = columnOrder;
    const csvContent = [
      cols.map(c => `"${c}"`).join(','),
      ...filteredRows.map(r => cols.map(c => `"${String(r.data?.[c] || '').replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${lists.find(l => l.id === activeListId)?.name || 'export'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [rows, columnOrder, activeListId, lists]);

  /* ─── CSV MERGE ──────────────────────────────────────────────────────── */

  const handleMergeUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseCSV(text);
    setMergeData(parsed);
    setMergeFile(file.name);
    setMergeMatchCol({ left: '', right: '' });
    setMergeCols([]);
    setShowMergeModal(true);
    e.target.value = '';
  }, []);

  const executeMerge = useCallback(async () => {
    if (!mergeData || !mergeMatchCol.left || !mergeMatchCol.right || !mergeCols.length || !supabase) return;
    try {
      const rightIdx = mergeData.headers.indexOf(mergeMatchCol.right);
      const mergeMap = {};
      mergeData.rows.forEach(r => {
        const key = (r[rightIdx] || '').toLowerCase().trim();
        if (key) {
          const obj = {};
          mergeCols.forEach(mc => {
            const ci = mergeData.headers.indexOf(mc);
            if (ci >= 0) obj[mc] = r[ci] || '';
          });
          mergeMap[key] = obj;
        }
      });

      let matched = 0;
      const updatedRows = rows.map(row => {
        const key = (row.data?.[mergeMatchCol.left] || '').toLowerCase().trim();
        if (key && mergeMap[key]) {
          matched++;
          return { ...row, data: { ...row.data, ...mergeMap[key] } };
        }
        return row;
      });

      // update in Supabase
      const batchSize = 200;
      for (let i = 0; i < updatedRows.length; i += batchSize) {
        const batch = updatedRows.slice(i, i + batchSize);
        for (const r of batch) {
          await supabase.from('list_rows').update({ data: r.data }).eq('id', r.id);
        }
      }

      // update origColumns
      const newCols = [...origColumns, ...mergeCols.filter(c => !origColumns.includes(c))];
      await supabase.from('lists').update({ original_columns: newCols }).eq('id', activeListId);

      setRows(updatedRows);
      setOrigColumns(newCols);
      buildColumnOrder(newCols, steps);
      setShowMergeModal(false);
      notify(`Merged ${matched} rows, added ${mergeCols.length} columns`, 'success');
    } catch (e) { console.error('merge', e); notify('Merge failed', 'error'); }
  }, [mergeData, mergeMatchCol, mergeCols, rows, origColumns, supabase, activeListId, steps, buildColumnOrder, notify]);

  /* ─── STEP MANAGEMENT ────────────────────────────────────────────────── */

  const openStepConfig = useCallback((step) => {
    setRightPanel('step');
    setRightPanelData(step);
    const initial = {
      prompt: step.prompt || '',
      formula: step.formula || '',
      outputColumn: step.outputColumn || '',
      campaignId: step.campaignId || '',
      query: step.query || '',
      rowRange: step.rowRange || '',
      conditionValue: step.condition?.value || '',
    };
    setDraftFields(initial);
    draftRef.current = initial;
    setConfigSaved(false);
  }, []);

  const addStep = useCallback((type, insertAfterCol = null) => {
    const defaults = {
      ai_enrich: { provider: 'openai', model: 'gpt-4o', prompt: '' },
      web_research: { provider: 'perplexity', model: 'sonar', prompt: '' },
      api_verify: { provider: 'millionverifier', emailColumn: 'email' },
      api_find_email: { provider: 'findymail', firstNameCol: 'first_name', lastNameCol: 'last_name', domainCol: 'website' },
      waterfall: { firstNameCol: 'first_name', lastNameCol: 'last_name', domainCol: 'website', sources: [...WATERFALL_ORDER], report: null },
      formula: { formula: '' },
      condition_gate: { condition: null },
      api_push: { campaignId: '', emailColumn: 'email' },
      scrape: { provider: 'google_search', query: '' },
    };
    const baseName = STEP_CATEGORIES.flatMap(c => c.items).find(i => i.type === type)?.name || type;
    const baseSlug = baseName.toLowerCase().replace(/\s+/g, '_');
    let colName = `${baseSlug}_1`;
    let newStep = null;
    setSteps(prev => {
      const taken = new Set(prev.map(s => s.outputColumn));
      let num = 1;
      while (taken.has(`${baseSlug}_${num}`)) num++;
      colName = `${baseSlug}_${num}`;
      const step = {
        id: `step_${Date.now()}`,
        type,
        outputColumn: colName,
        ...defaults[type],
        condition: null,
        rowRange: '',
      };
      // store for openStepConfig below
      newStep = step;
      return [...prev, step];
    });
    // insert column in correct position
    setColumnOrder(prev => {
      if (prev.includes(colName)) return prev;
      if (insertAfterCol) {
        const idx = prev.indexOf(insertAfterCol);
        if (idx >= 0) {
          const copy = [...prev];
          copy.splice(idx + 1, 0, colName);
          return copy;
        }
      }
      return [...prev, colName];
    });
    setShowAddStep(false);
    openStepConfig(newStep);
  }, [openStepConfig]);

  const updateStep = useCallback((stepId, updates) => {
    setSteps(prev => prev.map(s => s.id === stepId ? { ...s, ...updates } : s));
  }, []);

  const setDraft = useCallback((field, value) => {
    setDraftFields(prev => {
      const next = { ...prev, [field]: value };
      draftRef.current = next;
      return next;
    });
    setConfigSaved(false);
  }, []);

  const saveStepConfig = useCallback((stepId, step) => {
    const df = draftRef.current;
    const updates = {};
    if (df.prompt !== undefined && df.prompt !== (step.prompt || '')) updates.prompt = df.prompt;
    if (df.formula !== undefined && df.formula !== (step.formula || '')) updates.formula = df.formula;
    if (df.outputColumn !== undefined && df.outputColumn !== (step.outputColumn || '')) updates.outputColumn = df.outputColumn;
    if (df.campaignId !== undefined && df.campaignId !== (step.campaignId || '')) updates.campaignId = df.campaignId;
    if (df.query !== undefined && df.query !== (step.query || '')) updates.query = df.query;
    if (df.rowRange !== undefined && df.rowRange !== (step.rowRange || '')) updates.rowRange = df.rowRange;
    if (df.conditionValue !== undefined && df.conditionValue !== (step.condition?.value || '')) {
      updates.condition = { ...step.condition, value: df.conditionValue };
    }
    if (Object.keys(updates).length > 0) {
      updateStep(stepId, updates);
      setConfigSaved(true);
      setTimeout(() => setConfigSaved(false), 2000);
    }
  }, [updateStep]);

  const deleteStep = useCallback((stepId) => {
    setSteps(prev => prev.filter(s => s.id !== stepId));
    if (rightPanelData?.id === stepId) { setRightPanel(null); setRightPanelData(null); }
  }, [rightPanelData]);

  const duplicateStep = useCallback((step) => {
    const newStep = { ...step, id: `step_${Date.now()}`, outputColumn: step.outputColumn + '_copy' };
    setSteps(prev => [...prev, newStep]);
  }, []);

  // drag reorder steps
  const handleStepDragStart = (idx) => { dragStepRef.current = idx; };
  const handleStepDragOver = (e, idx) => { e.preventDefault(); dragOverStepRef.current = idx; };
  const handleStepDrop = () => {
    const from = dragStepRef.current;
    const to = dragOverStepRef.current;
    if (from === null || to === null || from === to) return;
    setSteps(prev => {
      const copy = [...prev];
      const [item] = copy.splice(from, 1);
      copy.splice(to, 0, item);
      return copy;
    });
    dragStepRef.current = null;
    dragOverStepRef.current = null;
  };

  // drag reorder columns
  const handleColDragStart = (col) => { dragColRef.current = col; };
  const handleColDragOver = (e, col) => { e.preventDefault(); dragOverColRef.current = col; };
  const handleColDrop = () => {
    const from = dragColRef.current;
    const to = dragOverColRef.current;
    if (!from || !to || from === to) return;
    setColumnOrder(prev => {
      const copy = [...prev];
      const fi = copy.indexOf(from);
      const ti = copy.indexOf(to);
      if (fi < 0 || ti < 0) return prev;
      copy.splice(fi, 1);
      copy.splice(ti, 0, from);
      return copy;
    });
    dragColRef.current = null;
    dragOverColRef.current = null;
  };

  /* ─── SAVE STEPS TO JOB ─────────────────────────────────────────────── */

  const saveStepsRef = useRef(null);
  const initialLoadDone = useRef(false);
  const saveSteps = useCallback(async () => {
    if (!supabase || !activeListId || !steps.length) return;
    try {
      // Find the most recent job for this list (match load query ordering)
      const { data: existing } = await supabase.from('jobs').select('id')
        .eq('list_id', activeListId).eq('user_id', userId)
        .order('created_at', { ascending: false }).limit(1);
      const payload = { list_id: activeListId, user_id: userId, steps, status: 'idle', current_step_index: 0, current_row: 0, total_rows: rows.length, error_count: 0, test_limit: testMode };
      if (existing && existing.length > 0) {
        await supabase.from('jobs').update({ steps }).eq('id', existing[0].id);
      } else {
        await supabase.from('jobs').insert(payload);
      }
    } catch (e) { console.error('saveSteps', e); }
  }, [supabase, activeListId, userId, steps, rows.length, testMode]);

  useEffect(() => {
    if (!activeListId || !steps.length || !initialLoadDone.current) return;
    if (saveStepsRef.current) clearTimeout(saveStepsRef.current);
    saveStepsRef.current = setTimeout(() => saveSteps(), 800);
    return () => { if (saveStepsRef.current) clearTimeout(saveStepsRef.current); };
  }, [steps, activeListId]);

  /* ─── SAVE / LOAD WORKFLOW TEMPLATES ─────────────────────────────────── */

  const saveWorkflow = useCallback(async (name) => {
    if (!supabase || !user || !steps.length) return;
    try {
      const { error } = await supabase.from('workflows').insert({
        user_id: userId, name, steps, description: `${steps.length} steps`
      });
      if (!error) { await loadWorkflows(); notify('Workflow saved', 'success'); }
    } catch (e) { console.error('saveWorkflow', e); }
  }, [supabase, user, userId, steps, loadWorkflows, notify]);

  const loadWorkflow = useCallback((wf) => {
    setSteps(wf.steps || []);
    setActiveWorkflowId(wf.id);
    buildColumnOrder(origColumns, wf.steps || []);
    notify(`Loaded workflow: ${wf.name}`, 'success');
  }, [origColumns, buildColumnOrder, notify]);

  /* ─── CLIENT-SIDE ENRICHMENT ENGINE ──────────────────────────────────── */

  function interpolatePrompt(template, rowData) {
    // Support {{var}} (Instantly convention) and {var} (legacy)
    return template.replace(/\{\{(\w+)\}\}|\{(\w+)\}/g, (_, dblKey, sglKey) => {
      const key = dblKey || sglKey;
      if (rowData[key] !== undefined) return rowData[key] || '';
      // fuzzy match: try case-insensitive lookup
      const match = Object.keys(rowData).find(k => k.toLowerCase() === key.toLowerCase());
      return match ? (rowData[match] || '') : '';
    });
  }

  function checkCondition(rowData, condition) {
    if (!condition) return true;
    const { column, operator, value } = condition;
    const cellVal = String(rowData[column] || '').toLowerCase().trim();
    const checkVal = String(value || '').toLowerCase().trim();
    switch (operator) {
      case 'equals': return cellVal === checkVal;
      case 'not_equals': return cellVal !== checkVal;
      case 'contains': return cellVal.includes(checkVal);
      case 'not_contains': return !cellVal.includes(checkVal);
      case 'is_empty': return cellVal === '';
      case 'is_not_empty': return cellVal !== '';
      case 'starts_with': return cellVal.startsWith(checkVal);
      case 'ends_with': return cellVal.endsWith(checkVal);
      case 'greater_than': return parseFloat(cellVal) > parseFloat(checkVal);
      case 'less_than': return parseFloat(cellVal) < parseFloat(checkVal);
      default: return true;
    }
  }

  async function callAIDirect(provider, model, prompt) {
    const key = apiKeys[provider];
    if (!key) throw new Error(`No API key for ${provider}`);

    if (provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: 1024 }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      return data.choices?.[0]?.message?.content?.trim() || '';
    }

    if (provider === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({ model, max_tokens: 1024, messages: [{ role: 'user', content: prompt }] }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      return data.content?.[0]?.text?.trim() || '';
    }

    if (provider === 'perplexity') {
      const res = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: 1024 }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
      return data.choices?.[0]?.message?.content?.trim() || '';
    }

    throw new Error(`Unknown provider: ${provider}`);
  }

  async function callVerifyEmail(provider, email) {
    const key = apiKeys[provider];
    if (!key) throw new Error(`No API key for ${provider}`);

    if (provider === 'millionverifier') {
      const res = await fetch(`https://api.millionverifier.com/api/v3/?api=${key}&email=${encodeURIComponent(email)}`);
      const data = await res.json();
      return data.result || data.quality || 'unknown';
    }
    if (provider === 'emaillable') {
      const res = await fetch(`https://api.emaillable.com/v2/verify?email=${encodeURIComponent(email)}&api_key=${key}`);
      const data = await res.json();
      return data.state || 'unknown';
    }
    if (provider === 'bounceban') {
      const res = await fetch(`https://api.bounceban.com/v1/verify/single?api_key=${key}&email=${encodeURIComponent(email)}`);
      const data = await res.json();
      return data.status || 'unknown';
    }
    throw new Error(`Unknown verify provider: ${provider}`);
  }

  async function callFindEmail(provider, firstName, lastName, domain) {
    const key = apiKeys[provider];
    if (!key) throw new Error(`No API key for ${provider}`);

    const params = new URLSearchParams();
    if (provider === 'findymail') {
      const res = await fetch('https://app.findymail.com/api/search/name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({ first_name: firstName, last_name: lastName, domain }),
      });
      const data = await res.json();
      return data.email || data.contact?.email || '';
    }
    if (provider === 'hunter') {
      const res = await fetch(`https://api.hunter.io/v2/email-finder?domain=${encodeURIComponent(domain)}&first_name=${encodeURIComponent(firstName)}&last_name=${encodeURIComponent(lastName)}&api_key=${key}`);
      const data = await res.json();
      return data.data?.email || '';
    }
    if (provider === 'prospeo') {
      const res = await fetch('https://api.prospeo.io/email-finder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-KEY': key },
        body: JSON.stringify({ first_name: firstName, last_name: lastName, company: domain }),
      });
      const data = await res.json();
      return data.response?.email || data.email || '';
    }
    if (provider === 'dropcontact') {
      const res = await fetch('https://api.dropcontact.io/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Access-Token': key },
        body: JSON.stringify({ data: [{ first_name: firstName, last_name: lastName, company: domain }] }),
      });
      const data = await res.json();
      return data.data?.[0]?.email?.[0]?.email || '';
    }
    if (provider === 'leadmagic') {
      const res = await fetch('https://api.leadmagic.io/email-finder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': key },
        body: JSON.stringify({ first_name: firstName, last_name: lastName, domain }),
      });
      const data = await res.json();
      return data.email || '';
    }
    if (provider === 'datagma') {
      const res = await fetch(`https://gateway.datagma.net/api/ingress/v2/full?apiId=${key}&firstName=${encodeURIComponent(firstName)}&lastName=${encodeURIComponent(lastName)}&company=${encodeURIComponent(domain)}`);
      const data = await res.json();
      return data.data?.emailAddress || '';
    }
    if (provider === 'wiza') {
      const res = await fetch('https://wiza.co/api/prospects/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({ first_name: firstName, last_name: lastName, company_domain: domain }),
      });
      const data = await res.json();
      return data.email || '';
    }
    if (provider === 'rocketreach') {
      const res = await fetch('https://api.rocketreach.co/api/v2/lookupProfile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Api-Key': key },
        body: JSON.stringify({ first_name: firstName, last_name: lastName, current_employer: domain }),
      });
      const data = await res.json();
      return data.emails?.[0]?.email || '';
    }
    return '';
  }

  // Extract variable name from {{var}} or {var}
  function extractVar(s) { return s.replace(/^\{\{?|\}\}?$/g, ''); }
  function resolveVar(key, rowData) {
    if (rowData[key] !== undefined) return rowData[key] || '';
    const match = Object.keys(rowData).find(k => k.toLowerCase() === key.toLowerCase());
    return match ? (rowData[match] || '') : '';
  }
  function replaceVars(str, rowData) {
    return str.replace(/\{\{(\w+)\}\}|\{(\w+)\}/g, (_, a, b) => resolveVar(a || b, rowData));
  }

  function evalFormula(formula, rowData) {
    try {
      // IF {{col}} is "val" THEN {{col2}} ELSE "default"
      const ifMatch = formula.match(/^IF\s+\{?\{?(\w+)\}?\}?\s+(is|equals|contains|is_not|not_contains)\s+"([^"]*)"\s+THEN\s+"?([^"]*)"?\s+ELSE\s+"?([^"]*)"?$/i);
      if (ifMatch) {
        const [, col, op, val, thenVal, elseVal] = ifMatch;
        const cellVal = String(resolveVar(col, rowData)).toLowerCase().trim();
        const checkVal = val.toLowerCase().trim();
        let match = false;
        if (op === 'is' || op === 'equals') match = cellVal === checkVal;
        else if (op === 'contains') match = cellVal.includes(checkVal);
        else if (op === 'is_not') match = cellVal !== checkVal;
        else if (op === 'not_contains') match = !cellVal.includes(checkVal);
        const result = match ? thenVal : elseVal;
        return replaceVars(result, rowData);
      }
      // CONCAT
      const concatMatch = formula.match(/^CONCAT\s*\((.+)\)$/i);
      if (concatMatch) {
        return concatMatch[1].split(',').map(p => {
          p = p.trim();
          if (p.startsWith('"') && p.endsWith('"')) return p.slice(1, -1);
          if ((p.startsWith('{{') && p.endsWith('}}')) || (p.startsWith('{') && p.endsWith('}'))) return resolveVar(extractVar(p), rowData);
          return p;
        }).join('');
      }
      // OR
      const orMatch = formula.match(/^OR\s*\((.+)\)$/i);
      if (orMatch) {
        const parts = orMatch[1].split(',').map(p => p.trim());
        for (const p of parts) {
          const col = extractVar(p);
          const v = resolveVar(col, rowData);
          if (v && String(v).trim()) return v;
        }
        return '';
      }
      // variable replacement fallback
      return replaceVars(formula, rowData);
    } catch (e) { return `ERROR: ${e.message}`; }
  }

  async function runStepForRow(step, rowData) {
    if (step.condition && !checkCondition(rowData, step.condition)) return 'SKIPPED';

    switch (step.type) {
      case 'ai_enrich':
      case 'web_research': {
        const prompt = interpolatePrompt(step.prompt || '', rowData);
        return await callAIDirect(step.provider, step.model, prompt);
      }
      case 'api_verify': {
        const email = rowData[step.emailColumn] || '';
        if (!email) return 'NO_EMAIL';
        return await callVerifyEmail(step.provider, email);
      }
      case 'api_find_email': {
        const fn = rowData[step.firstNameCol] || '';
        const ln = rowData[step.lastNameCol] || '';
        const dom = rowData[step.domainCol] || '';
        if (!fn || !ln || !dom) return '';
        return await callFindEmail(step.provider, fn, ln, dom);
      }
      case 'waterfall': {
        const fn = rowData[step.firstNameCol] || '';
        const ln = rowData[step.lastNameCol] || '';
        const dom = rowData[step.domainCol] || '';
        if (!fn || !ln || !dom) return '';
        const sources = step.sources || WATERFALL_ORDER;
        const report = { processed: true, results: [] };
        for (const src of sources) {
          if (!apiKeys[src]) continue;
          const start = Date.now();
          try {
            const email = await callFindEmail(src, fn, ln, dom);
            const elapsed = Date.now() - start;
            report.results.push({ source: src, email, found: !!email, time: elapsed });
            if (email) {
              // verify with cheapest verifier if available
              step._lastReport = report;
              return email;
            }
          } catch (e) {
            report.results.push({ source: src, email: '', found: false, error: e.message, time: Date.now() - start });
          }
        }
        step._lastReport = report;
        return '';
      }
      case 'formula':
        return evalFormula(step.formula || '', rowData);
      case 'condition_gate':
        return checkCondition(rowData, step.condition) ? 'Pass' : 'Fail';
      case 'api_push': {
        const key = apiKeys.instantly;
        if (!key) throw new Error('No Instantly API key');
        const email = rowData[step.emailColumn] || '';
        if (!email) return 'NO_EMAIL';
        const res = await fetch('https://api.instantly.ai/api/v1/lead/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ api_key: key, campaign_id: step.campaignId, email, first_name: rowData.firstName || rowData.first_name || '', last_name: rowData.lastName || rowData.last_name || '', company_name: rowData.companyName || rowData.company_name || '' }),
        });
        const data = await res.json();
        return data.status === 'success' || data.status === 200 ? 'pushed' : (data.message || 'error');
      }
      case 'scrape': {
        if (step.provider === 'google_search') {
          const key = apiKeys.google_search;
          if (!key) throw new Error('No Serper API key');
          const q = interpolatePrompt(step.query || '', rowData);
          const res = await fetch('https://google.serper.dev/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-API-KEY': key },
            body: JSON.stringify({ q }),
          });
          const data = await res.json();
          return data.organic?.[0]?.snippet || data.organic?.[0]?.title || '';
        }
        return 'UNSUPPORTED_SCRAPE';
      }
      default: return '';
    }
  }

  /* ─── RUN ENGINE ─────────────────────────────────────────────────────── */

  const parseRowRange = (rangeStr, totalRows) => {
    if (!rangeStr || !rangeStr.trim()) return null;
    const indices = new Set();
    rangeStr.split(',').forEach(part => {
      part = part.trim();
      const rangeMatch = part.match(/^(\d+)-(\d+)$/);
      if (rangeMatch) {
        const start = Math.max(0, parseInt(rangeMatch[1]) - 1);
        const end = Math.min(totalRows - 1, parseInt(rangeMatch[2]) - 1);
        for (let i = start; i <= end; i++) indices.add(i);
      } else {
        const n = parseInt(part) - 1;
        if (n >= 0 && n < totalRows) indices.add(n);
      }
    });
    return indices.size > 0 ? [...indices].sort((a, b) => a - b) : null;
  };

  const runSingleStep = useCallback(async (step, specificRowIndices = null) => {
    if (!rows.length || !step) return;

    // enforce enrichment run limits
    const limits = getPlanLimits(profile?.plan);
    const used = profile?.enrichment_runs_used || 0;
    if (used >= limits.runs) {
      notify(`Run limit reached (${used.toLocaleString()}/${limits.runs.toLocaleString()}). Upgrade your plan to continue.`, 'error');
      return;
    }

    setRunningStep(step.id);
    abortRef.current = false;
    const col = step.outputColumn;
    let targetIndices = specificRowIndices;
    if (!targetIndices && step.rowRange) targetIndices = parseRowRange(step.rowRange, rows.length);
    if (!targetIndices && testMode > 0) {
      const blank = [];
      for (let i = 0; i < rows.length && blank.length < testMode; i++) {
        const v = rows[i].data?.[col];
        if (!v || !String(v).trim()) blank.push(i);
      }
      targetIndices = blank.length > 0 ? blank : Array.from({ length: Math.min(testMode, rows.length) }, (_, i) => i);
      notify(`Test mode: running ${targetIndices.length} blank rows (${targetIndices.map(i => i + 1).join(', ')})`, 'info');
    }
    if (!targetIndices) targetIndices = rows.map((_, i) => i);

    let errors = 0;
    for (let idx = 0; idx < targetIndices.length; idx++) {
      if (abortRef.current) break;
      const ri = targetIndices[idx];
      const row = rows[ri];
      setRunProgress({ step: step.outputColumn, current: idx + 1, total: targetIndices.length, errors });
      try {
        const result = await runStepForRow(step, row.data);
        const newData = { ...row.data, [col]: result };
        setRows(prev => prev.map((r, i) => i === ri ? { ...r, data: newData } : r));
        // persist to Supabase
        try { await supabase.from('list_rows').update({ data: newData }).eq('id', row.id); } catch (e) { console.error('persist', e); }
      } catch (e) {
        errors++;
        const newData = { ...row.data, [col]: `ERROR: ${e.message}` };
        setRows(prev => prev.map((r, i) => i === ri ? { ...r, data: newData } : r));
        try { await supabase.from('list_rows').update({ data: newData }).eq('id', row.id); } catch (e2) { /* silent */ }
      }
      // rate limit delay
      await new Promise(r => setTimeout(r, 200));
    }
    setRunningStep(null);
    setRunProgress(null);

    // log usage and increment run counter
    const runCount = targetIndices.length;
    try {
      await supabase.from('usage_log').insert({
        user_id: userId, action: 'enrichment', step_type: step.type, provider: step.provider || null, row_count: runCount, cost_estimate: 0, metadata: { step_id: step.id }
      });
      // increment enrichment_runs_used in profile
      const newUsed = (profile?.enrichment_runs_used || 0) + runCount;
      await supabase.from('profiles').update({ enrichment_runs_used: newUsed, updated_at: new Date().toISOString() }).eq('id', userId);
    } catch (e) { /* silent */ }
  }, [rows, supabase, userId, testMode, apiKeys, profile]);

  const runAll = useCallback(async () => {
    if (!steps.length || !rows.length) return;
    if (canRun && !canRun()) { notify('Usage limit reached. Upgrade to continue.', 'error'); return; }
    abortRef.current = false;
    for (const step of steps) {
      if (abortRef.current) break;
      await runSingleStep(step);
    }
    notify('All steps complete', 'success');
  }, [steps, rows, canRun, runSingleStep, notify]);

  const stopRun = useCallback(() => {
    abortRef.current = true;
    setRunningStep(null);
    setRunProgress(null);
    notify('Stopped', 'info');
  }, [notify]);

  const filteredRows = useMemo(() => {
    let result = [...rows];
    filters.forEach(f => {
      result = result.filter(r => {
        const val = String(r.data?.[f.column] || '').toLowerCase().trim();
        const check = String(f.value || '').toLowerCase().trim();
        switch (f.operator) {
          case 'equals': return val === check;
          case 'not_equals': return val !== check;
          case 'contains': return val.includes(check);
          case 'not_contains': return !val.includes(check);
          case 'is_empty': return val === '';
          case 'is_not_empty': return val !== '';
          default: return true;
        }
      });
    });
    if (sortCol) {
      result.sort((a, b) => {
        const va = String(a.data?.[sortCol] || '');
        const vb = String(b.data?.[sortCol] || '');
        const numA = parseFloat(va);
        const numB = parseFloat(vb);
        if (!isNaN(numA) && !isNaN(numB)) return sortDir === 'asc' ? numA - numB : numB - numA;
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      });
    }
    return result;
  }, [rows, filters, sortCol, sortDir]);

  const runForCell = useCallback(async (filteredRowIndex, colName) => {
    const step = steps.find(s => s.outputColumn === colName);
    if (!step) return;
    // translate filteredRows index to actual rows index
    const targetRow = filteredRows[filteredRowIndex];
    if (!targetRow) return;
    const actualIndex = rows.findIndex(r => r.id === targetRow.id);
    if (actualIndex < 0) return;
    await runSingleStep(step, [actualIndex]);
  }, [steps, runSingleStep, filteredRows, rows]);

  /* ─── SORTING & FILTERING ────────────────────────────────────────────── */

  const handleSort = useCallback((col, isEnrichment) => {
    if (isEnrichment) {
      // for enrichment columns, plain click opens config
      const step = steps.find(s => s.outputColumn === col);
      if (step) { openStepConfig(step); return; }
    }
    if (sortCol === col) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  }, [sortCol, steps, openStepConfig]);

  const handleShiftSort = useCallback((col) => {
    if (sortCol === col) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  }, [sortCol]);

  const addFilter = useCallback((filter) => {
    setFilters(prev => [...prev, filter]);
  }, []);

  const removeFilter = useCallback((idx) => {
    setFilters(prev => prev.filter((_, i) => i !== idx));
  }, []);

  /* ─── QUICK FILTER PRESETS ───────────────────────────────────────────── */

  const applyQuickFilter = useCallback((preset) => {
    switch (preset) {
      case 'valid': addFilter({ column: 'email', operator: 'is_not_empty', value: '' }); break;
      case 'invalid': addFilter({ column: 'api_verify_1', operator: 'equals', value: 'invalid' }); break;
      case 'qualified': addFilter({ column: 'ai_enrich_1', operator: 'contains', value: 'yes' }); break;
      case 'errors': addFilter({ column: Object.keys(rows[0]?.data || {})[0], operator: 'contains', value: 'error' }); break;
      default: break;
    }
  }, [rows, addFilter]);

  /* ─── INLINE EDIT ────────────────────────────────────────────────────── */

  const startEdit = useCallback((filteredRowIndex, col) => {
    const targetRow = filteredRows[filteredRowIndex];
    if (!targetRow) return;
    const actualIndex = rows.findIndex(r => r.id === targetRow.id);
    if (actualIndex < 0) return;
    setEditingCell({ rowIndex: actualIndex, filteredIndex: filteredRowIndex, col });
    setEditValue(rows[actualIndex]?.data?.[col] || '');
  }, [rows, filteredRows]);

  const commitEdit = useCallback(async () => {
    if (!editingCell) return;
    const { rowIndex, col } = editingCell;
    const row = rows[rowIndex];
    if (!row) { setEditingCell(null); return; }
    const newData = { ...row.data, [col]: editValue };
    setRows(prev => prev.map((r, i) => i === rowIndex ? { ...r, data: newData } : r));
    try { await supabase.from('list_rows').update({ data: newData }).eq('id', row.id); } catch (e) { /* silent */ }
    setEditingCell(null);
  }, [editingCell, editValue, rows, supabase]);

  /* ─── CONTEXT MENU HELPERS ───────────────────────────────────────────── */

  useEffect(() => {
    const handler = () => { setContextMenu(null); setHeaderContextMenu(null); };
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, []);

  /* ─── COLUMN ORDER SYNC ON STEP CHANGES ──────────────────────────────── */

  useEffect(() => {
    if (!origColumns.length && !steps.length) return;
    const enrichCols = steps.map(s => s.outputColumn).filter(Boolean);
    setColumnOrder(prev => {
      // only add enrichment columns not yet in the order — never remove
      const missing = enrichCols.filter(c => !prev.includes(c));
      if (missing.length === 0) return prev;
      return [...prev, ...missing];
    });
  }, [steps, origColumns]);

  // persist column order to localStorage
  useEffect(() => {
    if (activeListId && columnOrder.length > 0) {
      try { localStorage.setItem(`jaklay_colorder_${activeListId}`, JSON.stringify(columnOrder)); } catch (e) { /* silent */ }
    }
  }, [columnOrder, activeListId]);

  /* ─── TEMPLATE PRESETS (NO CSV) ──────────────────────────────────────── */

  const loadTemplatePreset = useCallback((preset) => {
    setOrigColumns(preset.columns);
    setColumnOrder(preset.columns);
    const types = {};
    preset.columns.forEach(c => { types[c] = c; });
    setColumnTypes(types);
    setRows([]);
    notify(`Template "${preset.name}" loaded. Upload a CSV to populate.`, 'info');
  }, [notify]);

  /* ─── LOADING STATE ──────────────────────────────────────────────────── */

  if (authLoading || !loaded) {
    return (
      <div className="h-screen bg-zinc-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-zinc-400 text-sm">Loading Jaklay...</p>
        </div>
      </div>
    );
  }

  /* ─── COMPUTED VALUES ────────────────────────────────────────────────── */

  const enrichCols = steps.map(s => s.outputColumn);
  const isEnrichCol = (col) => enrichCols.includes(col);
  const activeList = lists.find(l => l.id === activeListId);
  const plan = profile?.plan || 'free';
  const runCount = testMode > 0 ? Math.min(testMode, filteredRows.length) : filteredRows.length;
  const stepCount = steps.length;

  /* ─── RENDER ─────────────────────────────────────────────────────────── */

  return (
    <div className="h-screen flex flex-col bg-zinc-950 text-zinc-100 overflow-hidden" style={{ fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace" }}>

      {/* ── Notification toast ── */}
      {notification && (
        <div className={`fixed top-4 right-4 z-[200] px-4 py-2 rounded-lg text-sm font-medium shadow-lg transition-all ${
          notification.type === 'success' ? 'bg-emerald-600' : notification.type === 'error' ? 'bg-red-600' : 'bg-zinc-700'
        }`}>
          {notification.msg}
        </div>
      )}

      {/* ── Upgrade CTA (intermittent, free users only) ── */}
      {showUpgradeCta && !isPaid && (
        <div className="fixed bottom-6 right-6 z-[150] bg-gradient-to-r from-indigo-600 to-violet-600 rounded-xl shadow-2xl p-4 max-w-xs animate-in">
          <button onClick={() => { setShowUpgradeCta(false); try { localStorage.setItem('jaklay_cta_dismissed', Date.now().toString()); } catch(e){} }} className="absolute top-2 right-2 text-white/60 hover:text-white text-sm leading-none">✕</button>
          <p className="text-white text-sm font-semibold mb-1">Unlock more power</p>
          <p className="text-indigo-100 text-xs mb-3">Get 2,000+ runs/mo, unlimited rows, and priority support with a 7-day free trial.</p>
          <a href="/pricing" className="inline-block bg-white text-indigo-700 text-xs font-semibold px-4 py-1.5 rounded-lg hover:bg-indigo-50 transition">View Plans</a>
        </div>
      )}

      {/* ══════ HEADER ══════ */}
      <header className="flex items-center h-11 px-3 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur shrink-0 gap-2">
        {/* Logo */}
        <span className="font-bold text-sm tracking-tight text-indigo-400 mr-2">JAKLAY</span>

        {/* List selector */}
        <select
          value={activeListId || ''}
          onChange={e => switchList(e.target.value)}
          className="bg-zinc-800 text-zinc-200 text-xs rounded px-2 py-1 border border-zinc-700 max-w-[180px]"
        >
          <option value="">Select list...</option>
          {lists.map(l => <option key={l.id} value={l.id}>{l.name} ({l.row_count})</option>)}
        </select>

        {/* Upload CSV */}
        <button onClick={() => fileInputRef.current?.click()} className="text-xs px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded border border-zinc-700">
          ↑ CSV
        </button>
        <input ref={fileInputRef} type="file" accept=".csv" onChange={handleCSVUpload} className="hidden" />

        {/* Divider */}
        <div className="w-px h-5 bg-zinc-700 mx-1" />

        {/* Tab buttons */}
        {[
          ['keys', '🔑 Keys'],
          ['setup', '⚙️ Setup'],
          ['templates', '📋 Templates'],
          ['prompts', '💡 Prompts'],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => { setRightPanel(rightPanel === id ? null : id); setRightPanelData(null); }}
            className={`text-xs px-2 py-1 rounded transition ${rightPanel === id ? 'bg-indigo-600 text-white' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'}`}
          >
            {label}
          </button>
        ))}

        <div className="w-px h-5 bg-zinc-700 mx-1" />

        {/* Test mode */}
        <div className="flex items-center gap-0.5">
          {[{ v: 0, l: 'All' }, { v: 1, l: '1' }, { v: 5, l: '5' }, { v: 10, l: '10' }].map(opt => (
            <button
              key={opt.v}
              onClick={() => setTestMode(opt.v)}
              className={`text-xs px-2 py-1 rounded transition ${
                testMode === opt.v
                  ? (opt.v > 0 ? 'bg-amber-600 text-white' : 'bg-indigo-600 text-white')
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400'
              }`}
            >
              {opt.l}
            </button>
          ))}
          {testMode > 0 && <span className="text-[10px] text-amber-400 ml-1">TEST</span>}
        </div>

        <div className="w-px h-5 bg-zinc-700 mx-1" />

        {/* Run / Stop */}
        <button
          onClick={runAll}
          disabled={!!runningStep || !steps.length || !rows.length}
          className="text-xs px-3 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded font-medium transition"
        >
          ▶ Run All ({runCount} × {stepCount})
        </button>
        {runningStep && (
          <button onClick={stopRun} className="text-xs px-2 py-1 bg-red-600 hover:bg-red-500 text-white rounded transition">
            ■ Stop
          </button>
        )}

        {/* Progress */}
        {runProgress && (
          <div className="flex items-center gap-2 text-[10px] text-zinc-400">
            <div className="w-24 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500 transition-all" style={{ width: `${(runProgress.current / runProgress.total) * 100}%` }} />
            </div>
            <span>{runProgress.step}: {runProgress.current}/{runProgress.total}</span>
            {runProgress.errors > 0 && <span className="text-red-400">({runProgress.errors} err)</span>}
          </div>
        )}

        <div className="flex-1" />

        {/* Export / Merge */}
        <button onClick={exportCSV} className="text-xs px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded border border-zinc-700">↓ Export</button>
        <button onClick={() => document.getElementById('_merge_input')?.click()} className="text-xs px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded border border-zinc-700">⊕ Merge</button>
        <input id="_merge_input" type="file" accept=".csv" onChange={handleMergeUpload} className="hidden" />

        {/* Filter */}
        <button onClick={() => setShowFilterModal(true)} className={`text-xs px-2 py-1 rounded border transition ${filters.length ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-zinc-800 border-zinc-700 hover:bg-zinc-700'}`}>
          🔍 Filter{filters.length > 0 && ` (${filters.length})`}
        </button>

        <div className="w-px h-5 bg-zinc-700 mx-1" />

        {/* Profile / Plan */}
        <span className={`text-[10px] px-2 py-0.5 rounded-full text-white font-medium ${PLAN_COLORS[plan] || PLAN_COLORS.free}`}>
          {plan.toUpperCase()}
        </span>
        <span className="text-[10px] text-zinc-500">{profile?.enrichment_runs_used || 0}/{getPlanLimits(plan).runs.toLocaleString()} runs</span>
        {!isPaid && <a href="/pricing" className="text-[10px] text-indigo-400 hover:underline">Upgrade</a>}
        {isAdmin && <a href="/admin" className="text-[10px] text-red-400 hover:underline">Admin</a>}
        <button onClick={signOut} className="text-[10px] text-zinc-500 hover:text-zinc-300">Sign out</button>
      </header>

      {/* ══════ MAIN BODY ══════ */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT SIDEBAR (240px) ── */}
        <aside className="w-60 border-r border-zinc-800 bg-zinc-900/50 flex flex-col shrink-0">
          <div className="p-2 border-b border-zinc-800 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Workflow Steps</span>
            <button onClick={() => setShowAddStep(!showAddStep)} className="text-xs w-6 h-6 flex items-center justify-center rounded bg-indigo-600 hover:bg-indigo-500 text-white transition">+</button>
          </div>

          {/* Add step dropdown */}
          {showAddStep && (
            <div className="border-b border-zinc-800 bg-zinc-900 p-2 max-h-64 overflow-y-auto">
              {STEP_CATEGORIES.map(cat => (
                <div key={cat.label} className="mb-2">
                  <div className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">{cat.label}</div>
                  {cat.items.map(item => (
                    <button
                      key={item.type}
                      onClick={() => addStep(item.type)}
                      className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-zinc-800 text-zinc-300 flex items-center gap-2 transition"
                    >
                      <span>{item.icon}</span> {item.name}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Steps list */}
          <div className="flex-1 overflow-y-auto p-1.5">
            {steps.length === 0 && (
              <div className="text-center py-6">
                <p className="text-[11px] text-zinc-500 mb-3">No steps yet</p>
                {/* Template presets */}
                <div className="space-y-1">
                  {TEMPLATE_PRESETS.map(tp => (
                    <button
                      key={tp.id}
                      onClick={() => loadTemplatePreset(tp)}
                      className="w-full text-left text-[10px] px-2 py-1.5 rounded bg-zinc-800/50 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
                    >
                      📄 {tp.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {steps.map((step, idx) => (
              <div
                key={step.id}
                draggable
                onDragStart={() => handleStepDragStart(idx)}
                onDragOver={(e) => handleStepDragOver(e, idx)}
                onDrop={handleStepDrop}
                onClick={() => openStepConfig(step)}
                className={`group flex items-center gap-1.5 px-2 py-1.5 mb-0.5 rounded cursor-pointer text-xs transition ${
                  rightPanelData?.id === step.id ? 'bg-indigo-600/20 border border-indigo-500/40' : 'hover:bg-zinc-800 border border-transparent'
                } ${runningStep === step.id ? 'ring-1 ring-emerald-500 animate-pulse' : ''}`}
              >
                <span className="text-zinc-500 text-[10px] w-4 shrink-0">{idx + 1}</span>
                <span className="truncate flex-1 text-zinc-200">{step.outputColumn}</span>
                <div className="hidden group-hover:flex items-center gap-0.5">
                  <button
                    onClick={(e) => { e.stopPropagation(); runSingleStep(step); }}
                    title="Run step"
                    className="w-5 h-5 flex items-center justify-center rounded text-[10px] hover:bg-emerald-600/30 text-emerald-400"
                  >▶</button>
                  {runningStep === step.id && (
                    <button
                      onClick={(e) => { e.stopPropagation(); stopRun(); }}
                      className="w-5 h-5 flex items-center justify-center rounded text-[10px] hover:bg-red-600/30 text-red-400"
                    >■</button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); duplicateStep(step); }}
                    title="Duplicate"
                    className="w-5 h-5 flex items-center justify-center rounded text-[10px] hover:bg-zinc-700 text-zinc-400"
                  >⧉</button>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteStep(step.id); }}
                    title="Delete"
                    className="w-5 h-5 flex items-center justify-center rounded text-[10px] hover:bg-red-600/30 text-red-400"
                  >×</button>
                </div>
              </div>
            ))}
          </div>

          {/* Save as template */}
          {steps.length > 0 && (
            <div className="p-2 border-t border-zinc-800">
              <button
                onClick={() => {
                  const name = prompt('Workflow name:');
                  if (name) saveWorkflow(name);
                }}
                className="w-full text-xs py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition"
              >
                💾 Save as Template
              </button>
            </div>
          )}
        </aside>

        {/* ── CENTER: SPREADSHEET ── */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <div
            className="flex-1 overflow-auto"
            ref={scrollRef}
            onScroll={(e) => {
              setScrollTop(e.currentTarget.scrollTop);
              if (viewportHeight !== e.currentTarget.clientHeight) setViewportHeight(e.currentTarget.clientHeight);
            }}
          >
            {rows.length === 0 && origColumns.length === 0 ? (
              /* Empty state */
              <div className="flex flex-col items-center justify-center h-full gap-4">
                <div className="text-4xl">📊</div>
                <p className="text-zinc-400 text-sm">Upload a CSV to get started, or choose a template</p>
                <button onClick={() => fileInputRef.current?.click()} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-sm font-medium transition">
                  Upload CSV
                </button>
                {steps.length > 0 && (
                  <p className="text-amber-400 text-xs mt-2">Workflow ready — upload a CSV to run it</p>
                )}
              </div>
            ) : (() => {
              const totalHeight = filteredRows.length * ROW_HEIGHT;
              const headerHeight = 32;
              const startIdx = Math.max(0, Math.floor((scrollTop - headerHeight) / ROW_HEIGHT) - OVERSCAN);
              const visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN * 2;
              const endIdx = Math.min(filteredRows.length, startIdx + visibleCount);
              const visibleRows = filteredRows.slice(startIdx, endIdx);
              const topPad = startIdx * ROW_HEIGHT;
              const bottomPad = Math.max(0, (filteredRows.length - endIdx) * ROW_HEIGHT);
              return (
                <div style={{ minWidth: columnOrder.length * 160 }}>
                  <table className="w-full text-xs border-collapse table-fixed">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-zinc-900 border-b border-zinc-700">
                        <th className="w-10 px-2 py-2 text-[10px] text-zinc-500 font-medium text-center border-r border-zinc-800" style={{width:48}}>#</th>
                        {columnOrder.map(col => {
                          const enrichment = isEnrichCol(col);
                          return (
                            <th
                              key={col}
                              draggable
                              onDragStart={() => handleColDragStart(col)}
                              onDragOver={(e) => handleColDragOver(e, col)}
                              onDrop={handleColDrop}
                              onClick={(e) => {
                                if (enrichment && !e.shiftKey) handleSort(col, true);
                                else handleSort(col, false);
                              }}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                setHeaderContextMenu({ x: e.clientX, y: e.clientY, col });
                              }}
                              className={`px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider cursor-pointer select-none border-r border-zinc-800 overflow-hidden whitespace-nowrap text-ellipsis transition ${
                                enrichment ? 'text-indigo-400 bg-indigo-950/20' : 'text-zinc-400'
                              } ${sortCol === col ? 'text-white' : ''} hover:bg-zinc-800/50`}
                              style={{width:160, minWidth:100, maxWidth:280}}
                              title={enrichment ? 'Click to configure • Shift+click to sort' : 'Click to sort'}
                            >
                              <span>{col.replace(/_/g, ' ')}</span>
                              {sortCol === col && <span className="ml-1 text-indigo-400">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {topPad > 0 && <tr style={{height: topPad}}><td colSpan={columnOrder.length + 1} /></tr>}
                      {visibleRows.map((row, vi) => {
                        const ri = startIdx + vi;
                        return (
                          <tr key={row.id || ri} className="border-b border-zinc-800/50 hover:bg-zinc-900/50" style={{height: ROW_HEIGHT}}>
                            <td className="px-2 text-[10px] text-zinc-600 text-center border-r border-zinc-800 tabular-nums" style={{width:48}}>{ri + 1}</td>
                            {columnOrder.map(col => {
                              const val = row.data?.[col] || '';
                              const enrichment = isEnrichCol(col);
                              const isEditing = editingCell?.filteredIndex === ri && editingCell?.col === col;
                              const isEmpty = !val || !val.trim();
                              return (
                                <td
                                  key={col}
                                  className={`px-2 border-r border-zinc-800/50 overflow-hidden whitespace-nowrap text-ellipsis transition-colors duration-100 hover:bg-zinc-800/70 ${cellColor(val)} ${enrichment ? 'bg-indigo-950/5' : ''} ${enrichment && isEmpty ? 'cursor-pointer' : ''}`}
                                  style={{maxWidth:280, height: ROW_HEIGHT, width:160}}
                                  onDoubleClick={() => startEdit(ri, col)}
                                  onClick={() => {
                                    if (enrichment && isEmpty) {
                                      runForCell(ri, col);
                                    }
                                  }}
                                  onContextMenu={(e) => {
                                    if (enrichment) {
                                      e.preventDefault();
                                      setContextMenu({ x: e.clientX, y: e.clientY, rowIndex: ri, rowId: row.id, col });
                                    }
                                  }}
                                >
                                  {isEditing ? (
                                    <input
                                      autoFocus
                                      value={editValue}
                                      onChange={e => setEditValue(e.target.value)}
                                      onBlur={commitEdit}
                                      onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingCell(null); }}
                                      className="w-full bg-zinc-800 text-zinc-100 px-1 py-0.5 rounded text-xs outline-none ring-1 ring-indigo-500"
                                    />
                                  ) : enrichment && isEmpty ? (
                                    <span className="text-zinc-600 text-[10px] italic">click to run</span>
                                  ) : (
                                    <span className="text-xs" title={val}>{val}</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                      {bottomPad > 0 && <tr style={{height: bottomPad}}><td colSpan={columnOrder.length + 1} /></tr>}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>

          {/* Footer */}
          <div className="h-7 px-3 flex items-center gap-4 border-t border-zinc-800 bg-zinc-900/80 text-[10px] text-zinc-500 shrink-0">
            <span>{filteredRows.length !== rows.length ? `${filteredRows.length} of ` : ''}{rows.length} rows</span>
            <span>{columnOrder.length} cols</span>
            <span>{steps.length} steps</span>
            {sortCol && (
              <span className="text-indigo-400">
                Sorted: {sortCol} {sortDir === 'asc' ? '↑' : '↓'}
                <button onClick={() => { setSortCol(null); setSortDir('asc'); }} className="ml-1 text-zinc-500 hover:text-zinc-300">✕</button>
              </span>
            )}
            {filters.length > 0 && (
              <span className="text-indigo-400">
                {filters.length} filter{filters.length > 1 ? 's' : ''}
                <button onClick={() => setFilters([])} className="ml-1 text-zinc-500 hover:text-zinc-300">✕</button>
              </span>
            )}
          </div>
        </main>

        {/* ── RIGHT PANEL (360px) ── */}
        {rightPanel && (
          <aside className="w-[360px] border-l border-zinc-800 bg-zinc-900/50 flex flex-col shrink-0 overflow-y-auto">
            <div className="p-3 border-b border-zinc-800 flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                {rightPanel === 'step' ? 'Step Config' : rightPanel === 'keys' ? 'API Keys' : rightPanel === 'setup' ? 'Setup Guide' : rightPanel === 'templates' ? 'Workflows' : 'Prompt Library'}
              </span>
              <button onClick={() => { setRightPanel(null); setRightPanelData(null); }} className="text-zinc-500 hover:text-zinc-300 text-sm">✕</button>
            </div>

            {/* ─ API Keys panel ─ */}
            {rightPanel === 'keys' && (
              <div className="p-3 space-y-3">
                {Object.entries(
                  Object.entries(INTEGRATIONS).reduce((acc, [key, val]) => {
                    if (!acc[val.type]) acc[val.type] = [];
                    acc[val.type].push({ key, ...val });
                    return acc;
                  }, {})
                ).map(([type, items]) => (
                  <div key={type}>
                    <div className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1.5">{type.replace('_', ' ')}</div>
                    {items.map(item => (
                      <div key={item.key} className="flex items-center gap-2 mb-1.5">
                        <span className="text-sm">{item.icon}</span>
                        <span className="text-[11px] text-zinc-300 w-24 truncate">{item.name}</span>
                        <input
                          type="password"
                          placeholder="API key..."
                          defaultValue={apiKeys[item.key] || ''}
                          onBlur={e => { if (e.target.value) saveApiKey(item.key, e.target.value); }}
                          className="flex-1 bg-zinc-800 text-zinc-200 text-[11px] px-2 py-1 rounded border border-zinc-700 outline-none focus:border-indigo-500"
                        />
                        {apiKeys[item.key] && <span className="text-emerald-400 text-[10px]">✓</span>}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/* ─ Setup panel ─ */}
            {rightPanel === 'setup' && (
              <div className="p-3 space-y-3">
                {Object.entries(INTEGRATIONS).map(([key, integ]) => (
                  <div key={key} className="bg-zinc-800/50 rounded p-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span>{integ.icon}</span>
                      <span className="text-xs text-zinc-200 font-medium">{integ.name}</span>
                      {apiKeys[key] && <span className="text-emerald-400 text-[10px]">Connected</span>}
                    </div>
                    <p className="text-[10px] text-zinc-400">{integ.setup}</p>
                  </div>
                ))}
              </div>
            )}

            {/* ─ Templates / Workflows panel ─ */}
            {rightPanel === 'templates' && (
              <div className="p-3 space-y-2">
                <div className="text-[9px] text-zinc-500 uppercase tracking-wider mb-2">Saved Workflows</div>
                {workflows.length === 0 && <p className="text-[11px] text-zinc-500">No saved workflows yet</p>}
                {workflows.map(wf => (
                  <button
                    key={wf.id}
                    onClick={() => loadWorkflow(wf)}
                    className={`w-full text-left px-3 py-2 rounded bg-zinc-800/50 hover:bg-zinc-800 transition ${activeWorkflowId === wf.id ? 'ring-1 ring-indigo-500' : ''}`}
                  >
                    <div className="text-xs text-zinc-200">{wf.name}</div>
                    <div className="text-[10px] text-zinc-500">{wf.description || `${(wf.steps || []).length} steps`}</div>
                  </button>
                ))}
                <div className="text-[9px] text-zinc-500 uppercase tracking-wider mt-4 mb-2">Presets</div>
                {TEMPLATE_PRESETS.map(tp => (
                  <button
                    key={tp.id}
                    onClick={() => loadTemplatePreset(tp)}
                    className="w-full text-left px-3 py-2 rounded bg-zinc-800/50 hover:bg-zinc-800 transition text-xs text-zinc-300"
                  >
                    📄 {tp.name} <span className="text-zinc-500">({tp.columns.length} cols)</span>
                  </button>
                ))}
              </div>
            )}

            {/* ─ Prompt Library panel ─ */}
            {rightPanel === 'prompts' && (
              <div className="p-3 space-y-2">
                {PROMPT_LIBRARY.map(tpl => (
                  <button
                    key={tpl.id}
                    onClick={() => {
                      // Quick load: create a new step with this prompt config in a single update
                      const newStep = {
                        id: `step_${Date.now()}`,
                        type: tpl.provider === 'perplexity' ? 'web_research' : 'ai_enrich',
                        outputColumn: tpl.id.replace(/_/g, '_'),
                        provider: tpl.provider,
                        model: tpl.model,
                        prompt: tpl.prompt,
                        condition: null,
                        rowRange: '',
                      };
                      setSteps(prev => [...prev, newStep]);
                      setRightPanel('step');
                      setRightPanelData(newStep);
                    }}
                    className="w-full text-left px-3 py-2.5 rounded bg-zinc-800/50 hover:bg-zinc-800 transition"
                  >
                    <div className="text-xs text-zinc-200 font-medium">{tpl.name}</div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">{INTEGRATIONS[tpl.provider]?.icon} {tpl.model} — {tpl.reason}</div>
                  </button>
                ))}
              </div>
            )}

            {/* ─ Step Config panel ─ */}
            {rightPanel === 'step' && rightPanelData && (() => {
              const step = steps.find(s => s.id === rightPanelData.id) || rightPanelData;
              const dirty = draftFields.prompt !== (step.prompt || '') ||
                draftFields.formula !== (step.formula || '') ||
                draftFields.outputColumn !== (step.outputColumn || '') ||
                draftFields.campaignId !== (step.campaignId || '') ||
                draftFields.query !== (step.query || '') ||
                draftFields.rowRange !== (step.rowRange || '') ||
                draftFields.conditionValue !== (step.condition?.value || '');
              return (
                <div className="p-3 space-y-3">
                  {/* Column name */}
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Column Name</label>
                    <input
                      value={draftFields.outputColumn ?? step.outputColumn}
                      onChange={e => setDraft('outputColumn', e.target.value)}
                      className="w-full mt-1 bg-zinc-800 text-zinc-200 text-xs px-2 py-1.5 rounded border border-zinc-700 outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Condition (collapsible) */}
                  <details className="bg-zinc-800/30 rounded p-2">
                    <summary className="text-[10px] text-zinc-400 cursor-pointer select-none">Condition (optional)</summary>
                    <div className="mt-2 space-y-1.5">
                      <select
                        value={step.condition?.column || ''}
                        onChange={e => updateStep(step.id, { condition: { ...step.condition, column: e.target.value, operator: step.condition?.operator || 'equals', value: step.condition?.value || '' } })}
                        className="w-full bg-zinc-800 text-xs text-zinc-200 px-2 py-1 rounded border border-zinc-700"
                      >
                        <option value="">No condition</option>
                        {columnOrder.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      {step.condition?.column && (
                        <>
                          <select
                            value={step.condition?.operator || 'equals'}
                            onChange={e => updateStep(step.id, { condition: { ...step.condition, operator: e.target.value } })}
                            className="w-full bg-zinc-800 text-xs text-zinc-200 px-2 py-1 rounded border border-zinc-700"
                          >
                            {['equals','not_equals','contains','not_contains','is_empty','is_not_empty','starts_with','ends_with','greater_than','less_than'].map(op => (
                              <option key={op} value={op}>{op.replace(/_/g, ' ')}</option>
                            ))}
                          </select>
                          {!['is_empty','is_not_empty'].includes(step.condition?.operator) && (
                            <input
                              value={draftFields.conditionValue ?? (step.condition?.value || '')}
                              onChange={e => setDraft('conditionValue', e.target.value)}
                              placeholder="Value..."
                              className="w-full bg-zinc-800 text-xs text-zinc-200 px-2 py-1 rounded border border-zinc-700 outline-none"
                            />
                          )}
                        </>
                      )}
                    </div>
                  </details>

                  {/* ── AI ENRICH / WEB RESEARCH CONFIG ── */}
                  {(step.type === 'ai_enrich' || step.type === 'web_research') && (
                    <>
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <label className="text-[10px] text-zinc-500">Provider</label>
                          <select
                            value={step.provider}
                            onChange={e => {
                              const provider = e.target.value;
                              const models = PROVIDER_MODELS[provider] || [];
                              updateStep(step.id, { provider, model: models[0] || '' });
                            }}
                            className="w-full mt-1 bg-zinc-800 text-xs text-zinc-200 px-2 py-1 rounded border border-zinc-700"
                          >
                            {Object.entries(PROVIDER_MODELS).map(([p]) => (
                              <option key={p} value={p}>{INTEGRATIONS[p]?.icon} {INTEGRATIONS[p]?.name || p}</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex-1">
                          <label className="text-[10px] text-zinc-500">Model</label>
                          <select
                            value={step.model}
                            onChange={e => updateStep(step.id, { model: e.target.value })}
                            className="w-full mt-1 bg-zinc-800 text-xs text-zinc-200 px-2 py-1 rounded border border-zinc-700"
                          >
                            {(PROVIDER_MODELS[step.provider] || []).map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                        </div>
                      </div>

                      {/* Quick load prompt */}
                      <div>
                        <label className="text-[10px] text-zinc-500">Quick Load Prompt</label>
                        <select
                          value=""
                          onChange={e => {
                            const tpl = PROMPT_LIBRARY.find(t => t.id === e.target.value);
                            if (tpl) {
                              setDraft('prompt', tpl.prompt);
                              updateStep(step.id, { provider: tpl.provider, model: tpl.model });
                            }
                          }}
                          className="w-full mt-1 bg-zinc-800 text-xs text-zinc-200 px-2 py-1 rounded border border-zinc-700"
                        >
                          <option value="">Choose template...</option>
                          {PROMPT_LIBRARY.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      </div>

                      {/* Prompt */}
                      <div>
                        <label className="text-[10px] text-zinc-500">Prompt</label>
                        <textarea
                          value={draftFields.prompt ?? (step.prompt || '')}
                          onChange={e => setDraft('prompt', e.target.value)}
                          rows={8}
                          className="w-full mt-1 bg-zinc-800 text-xs text-zinc-200 px-2 py-1.5 rounded border border-zinc-700 outline-none focus:border-indigo-500 resize-y font-mono"
                          placeholder="Use {{columnName}} for variables..."
                        />
                      </div>

                      {/* Variable chips */}
                      <div>
                        <label className="text-[10px] text-zinc-500">Insert Variable</label>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {columnOrder.map(c => (
                            <button
                              key={c}
                              onClick={() => setDraft('prompt', (draftFields.prompt || '') + `{{${c}}}`)}
                              className="text-[10px] px-1.5 py-0.5 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-400 hover:text-zinc-200 transition border border-zinc-700"
                            >
                              {`{{${c}}}`} <span className="text-zinc-600">{columnTypes[c] || ''}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {/* ── VERIFY CONFIG ── */}
                  {step.type === 'api_verify' && (
                    <>
                      <div>
                        <label className="text-[10px] text-zinc-500">Verify Provider</label>
                        <select
                          value={step.provider}
                          onChange={e => updateStep(step.id, { provider: e.target.value })}
                          className="w-full mt-1 bg-zinc-800 text-xs text-zinc-200 px-2 py-1 rounded border border-zinc-700"
                        >
                          <option value="millionverifier">✅ MillionVerifier</option>
                          <option value="emaillable">📧 Emaillable</option>
                          <option value="bounceban">🛡️ BounceBan</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-zinc-500">Email Column</label>
                        <select
                          value={step.emailColumn || 'email'}
                          onChange={e => updateStep(step.id, { emailColumn: e.target.value })}
                          className="w-full mt-1 bg-zinc-800 text-xs text-zinc-200 px-2 py-1 rounded border border-zinc-700"
                        >
                          {columnOrder.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div className="text-[10px] text-zinc-500 bg-zinc-800/50 rounded p-2">
                        Output: ok, catch-all, invalid, unknown, error
                      </div>
                    </>
                  )}

                  {/* ── FIND EMAIL CONFIG ── */}
                  {step.type === 'api_find_email' && (
                    <>
                      <div>
                        <label className="text-[10px] text-zinc-500">Provider</label>
                        <select
                          value={step.provider}
                          onChange={e => updateStep(step.id, { provider: e.target.value })}
                          className="w-full mt-1 bg-zinc-800 text-xs text-zinc-200 px-2 py-1 rounded border border-zinc-700"
                        >
                          {['findymail','hunter','prospeo','dropcontact','leadmagic','datagma','wiza','rocketreach'].map(p => (
                            <option key={p} value={p}>{INTEGRATIONS[p]?.icon} {INTEGRATIONS[p]?.name}</option>
                          ))}
                        </select>
                      </div>
                      {[
                        { key: 'firstNameCol', label: 'First Name Column', def: 'first_name' },
                        { key: 'lastNameCol', label: 'Last Name Column', def: 'last_name' },
                        { key: 'domainCol', label: 'Domain/Website Column', def: 'website' },
                      ].map(({ key, label, def }) => (
                        <div key={key}>
                          <label className="text-[10px] text-zinc-500">{label}</label>
                          <select
                            value={step[key] || def}
                            onChange={e => updateStep(step.id, { [key]: e.target.value })}
                            className="w-full mt-1 bg-zinc-800 text-xs text-zinc-200 px-2 py-1 rounded border border-zinc-700"
                          >
                            {columnOrder.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                      ))}
                    </>
                  )}

                  {/* ── WATERFALL CONFIG ── */}
                  {step.type === 'waterfall' && (
                    <>
                      {[
                        { key: 'firstNameCol', label: 'First Name Column', def: 'first_name' },
                        { key: 'lastNameCol', label: 'Last Name Column', def: 'last_name' },
                        { key: 'domainCol', label: 'Domain/Website Column', def: 'website' },
                      ].map(({ key, label, def }) => (
                        <div key={key}>
                          <label className="text-[10px] text-zinc-500">{label}</label>
                          <select
                            value={step[key] || def}
                            onChange={e => updateStep(step.id, { [key]: e.target.value })}
                            className="w-full mt-1 bg-zinc-800 text-xs text-zinc-200 px-2 py-1 rounded border border-zinc-700"
                          >
                            {columnOrder.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                      ))}

                      <div className="flex items-center justify-between">
                        <label className="text-[10px] text-zinc-500 uppercase">Waterfall Sequence</label>
                        <button
                          onClick={() => updateStep(step.id, { sources: [...WATERFALL_ORDER] })}
                          className="text-[10px] text-indigo-400 hover:underline"
                        >Sort by cost ↑</button>
                      </div>

                      <div className="space-y-1">
                        {(step.sources || WATERFALL_ORDER).map((src, si) => {
                          const pc = PROVIDER_COSTS[src];
                          if (!pc) return null;
                          return (
                            <div key={src} className="flex items-center gap-2 bg-zinc-800/50 rounded px-2 py-1.5">
                              <span className="text-[10px] text-zinc-500 w-4">{si + 1}</span>
                              <span className="text-xs text-zinc-200 flex-1">{INTEGRATIONS[src]?.icon} {pc.label}</span>
                              <span className="text-[10px] text-zinc-500">${pc.cost}/lookup</span>
                              {pc.free > 0 && <span className="text-[10px] text-amber-400">{pc.free} free</span>}
                              {!apiKeys[src] && <span className="text-[10px] text-red-400">No key</span>}
                              <button
                                onClick={() => {
                                  const sources = [...(step.sources || WATERFALL_ORDER)];
                                  sources.splice(si, 1);
                                  updateStep(step.id, { sources });
                                }}
                                className="text-[10px] text-zinc-500 hover:text-red-400"
                              >×</button>
                            </div>
                          );
                        })}
                      </div>

                      {/* Add source back */}
                      {WATERFALL_ORDER.filter(s => !(step.sources || WATERFALL_ORDER).includes(s)).length > 0 && (
                        <select
                          value=""
                          onChange={e => {
                            if (e.target.value) updateStep(step.id, { sources: [...(step.sources || WATERFALL_ORDER), e.target.value] });
                          }}
                          className="w-full bg-zinc-800 text-xs text-zinc-200 px-2 py-1 rounded border border-zinc-700"
                        >
                          <option value="">+ Add source...</option>
                          {WATERFALL_ORDER.filter(s => !(step.sources || WATERFALL_ORDER).includes(s)).map(s => (
                            <option key={s} value={s}>{PROVIDER_COSTS[s]?.label}</option>
                          ))}
                        </select>
                      )}

                      {/* Waterfall Report */}
                      {step._lastReport && (
                        <details className="bg-zinc-800/30 rounded p-2 mt-2">
                          <summary className="text-[10px] text-zinc-400 cursor-pointer">📊 Waterfall Report</summary>
                          <div className="mt-2 space-y-2">
                            <div className="flex gap-2">
                              <div className="flex-1 bg-zinc-800 rounded p-2 text-center">
                                <div className="text-lg text-zinc-200">{step._lastReport.results?.length || 0}</div>
                                <div className="text-[9px] text-zinc-500">Processed</div>
                              </div>
                              <div className="flex-1 bg-emerald-900/30 rounded p-2 text-center">
                                <div className="text-lg text-emerald-300">{step._lastReport.results?.filter(r => r.found).length || 0}</div>
                                <div className="text-[9px] text-zinc-500">Found</div>
                              </div>
                              <div className="flex-1 bg-zinc-800 rounded p-2 text-center">
                                <div className="text-lg text-zinc-400">{step._lastReport.results?.filter(r => !r.found).length || 0}</div>
                                <div className="text-[9px] text-zinc-500">Not Found</div>
                              </div>
                            </div>
                            {(step.sources || WATERFALL_ORDER).map(src => {
                              const results = (step._lastReport.results || []).filter(r => r.source === src);
                              if (!results.length) return null;
                              const found = results.filter(r => r.found).length;
                              const errors = results.filter(r => r.error).length;
                              const hitRate = results.length > 0 ? Math.round((found / results.length) * 100) : 0;
                              const avgTime = results.length > 0 ? Math.round(results.reduce((s, r) => s + (r.time || 0), 0) / results.length) : 0;
                              const cost = found * (PROVIDER_COSTS[src]?.cost || 0);
                              const pc = PROVIDER_COSTS[src];
                              return (
                                <div key={src} className="bg-zinc-800/50 rounded p-2">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-[11px] text-zinc-200">{INTEGRATIONS[src]?.icon} {pc?.label}</span>
                                    <span className="text-[10px] text-zinc-400">{hitRate}% hit</span>
                                  </div>
                                  <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden flex">
                                    <div className="bg-emerald-500 h-full" style={{ width: `${hitRate}%` }} />
                                    {errors > 0 && <div className="bg-red-500 h-full" style={{ width: `${(errors / results.length) * 100}%` }} />}
                                  </div>
                                  <div className="flex gap-3 mt-1 text-[9px] text-zinc-500">
                                    <span>{results.length} calls</span>
                                    <span>{avgTime}ms avg</span>
                                    <span>${cost.toFixed(4)}</span>
                                    {pc?.free > 0 && <span className={pc.free - results.length < 5 ? 'text-red-400' : 'text-amber-400'}>{Math.max(0, pc.free - results.length)} free left</span>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </details>
                      )}
                    </>
                  )}

                  {/* ── FORMULA CONFIG ── */}
                  {step.type === 'formula' && (
                    <div>
                      <label className="text-[10px] text-zinc-500">Formula</label>
                      <textarea
                        value={draftFields.formula ?? (step.formula || '')}
                        onChange={e => setDraft('formula', e.target.value)}
                        rows={4}
                        className="w-full mt-1 bg-zinc-800 text-xs text-zinc-200 px-2 py-1.5 rounded border border-zinc-700 outline-none focus:border-indigo-500 resize-y font-mono"
                        placeholder='IF {{col}} is "val" THEN {{col2}} ELSE ""'
                      />
                      <div className="mt-2 text-[10px] text-zinc-500 space-y-1">
                        <p>{'IF {{col}} is "val" THEN "result" ELSE "other"'}</p>
                        <p>{'IF {{col}} contains "val" THEN {{col2}} ELSE ""'}</p>
                        <p>{'CONCAT({{firstName}}, " ", {{lastName}})'}</p>
                        <p>{'OR({{email}}, {{personalEmail}})'}</p>
                      </div>
                    </div>
                  )}

                  {/* ── CONDITION GATE ── */}
                  {step.type === 'condition_gate' && (
                    <div className="space-y-2">
                      <p className="text-[10px] text-zinc-500">Outputs "Pass" or "Fail" based on condition above.</p>
                      {!step.condition && <p className="text-[10px] text-amber-400">Set a condition above to use this step.</p>}
                    </div>
                  )}

                  {/* ── PUSH TO INSTANTLY ── */}
                  {step.type === 'api_push' && (
                    <>
                      <div>
                        <label className="text-[10px] text-zinc-500">Campaign ID</label>
                        <input
                          value={draftFields.campaignId ?? (step.campaignId || '')}
                          onChange={e => setDraft('campaignId', e.target.value)}
                          className="w-full mt-1 bg-zinc-800 text-xs text-zinc-200 px-2 py-1.5 rounded border border-zinc-700 outline-none focus:border-indigo-500"
                          placeholder="Instantly campaign ID..."
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-zinc-500">Email Column</label>
                        <select
                          value={step.emailColumn || 'email'}
                          onChange={e => updateStep(step.id, { emailColumn: e.target.value })}
                          className="w-full mt-1 bg-zinc-800 text-xs text-zinc-200 px-2 py-1 rounded border border-zinc-700"
                        >
                          {columnOrder.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    </>
                  )}

                  {/* ── SCRAPE CONFIG ── */}
                  {step.type === 'scrape' && (
                    <>
                      <div>
                        <label className="text-[10px] text-zinc-500">Scrape Provider</label>
                        <select
                          value={step.provider || 'google_search'}
                          onChange={e => updateStep(step.id, { provider: e.target.value })}
                          className="w-full mt-1 bg-zinc-800 text-xs text-zinc-200 px-2 py-1 rounded border border-zinc-700"
                        >
                          <option value="google_search">🔎 Serper (Google)</option>
                          <option value="apify">🕷️ Apify</option>
                          <option value="phantombuster">👻 PhantomBuster</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-zinc-500">Query</label>
                        <input
                          value={draftFields.query ?? (step.query || '')}
                          onChange={e => setDraft('query', e.target.value)}
                          className="w-full mt-1 bg-zinc-800 text-xs text-zinc-200 px-2 py-1.5 rounded border border-zinc-700 outline-none focus:border-indigo-500"
                          placeholder="{{companyName}} CEO email..."
                        />
                      </div>
                    </>
                  )}

                  {/* ── Row Range ── */}
                  <div>
                    <label className="text-[10px] text-zinc-500">Row Range (optional)</label>
                    <input
                      value={draftFields.rowRange ?? (step.rowRange || '')}
                      onChange={e => setDraft('rowRange', e.target.value)}
                      placeholder="1-50 or 5,10,15"
                      className="w-full mt-1 bg-zinc-800 text-xs text-zinc-200 px-2 py-1 rounded border border-zinc-700 outline-none"
                    />
                    <div className="flex gap-1 mt-1">
                      {[10, 50, 100].map(n => (
                        <button
                          key={n}
                          onClick={() => setDraft('rowRange', `1-${n}`)}
                          className="text-[10px] px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-400 transition"
                        >
                          First {n}
                        </button>
                      ))}
                      <button
                        onClick={() => setDraft('rowRange', '')}
                        className="text-[10px] px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-400 transition"
                      >
                        All
                      </button>
                    </div>
                  </div>

                  {/* ── Save + Actions ── */}
                  <div className="space-y-2 pt-2 border-t border-zinc-800">
                    <button
                      onClick={() => saveStepConfig(step.id, step)}
                      disabled={!dirty}
                      className="w-full text-xs py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded transition font-medium"
                    >
                      {configSaved ? '✓ Saved' : dirty ? 'Save Changes' : 'No Changes'}
                    </button>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => { if (dirty) saveStepConfig(step.id, step); runSingleStep(step); }}
                      disabled={!!runningStep}
                      className="flex-1 text-xs py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded transition font-medium"
                    >
                      ▶ Run Step
                    </button>
                    <button
                      onClick={() => duplicateStep(step)}
                      className="text-xs px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition"
                    >
                      ⧉ Dup
                    </button>
                    <button
                      onClick={() => deleteStep(step.id)}
                      className="text-xs px-3 py-1.5 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded transition"
                    >
                      × Del
                    </button>
                  </div>
                </div>
              );
            })()}
          </aside>
        )}
      </div>

      {/* ══════ CONTEXT MENUS ══════ */}

      {/* Cell context menu */}
      {contextMenu && !contextMenu.useCell && (
        <div
          className="fixed z-[100] bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button onClick={() => { runForCell(contextMenu.rowIndex, contextMenu.col); setContextMenu(null); }} className="w-full text-left text-xs px-3 py-1.5 hover:bg-zinc-700 text-zinc-200">▶ Run this cell</button>
          <button onClick={() => {
            const step = steps.find(s => s.outputColumn === contextMenu.col);
            if (step) {
              const actualIdx = rows.findIndex(r => r.id === contextMenu.rowId);
              if (actualIdx >= 0) runSingleStep(step, [actualIdx]);
            }
            setContextMenu(null);
          }} className="w-full text-left text-xs px-3 py-1.5 hover:bg-zinc-700 text-zinc-200">▶ Run this row</button>
          <div className="border-t border-zinc-700 my-0.5" />
          <button onClick={() => { startEdit(contextMenu.rowIndex, contextMenu.col); setContextMenu(null); }} className="w-full text-left text-xs px-3 py-1.5 hover:bg-zinc-700 text-zinc-200">✏️ Edit cell</button>
          <button onClick={async () => {
            const actualIdx = rows.findIndex(r => r.id === contextMenu.rowId);
            const row = actualIdx >= 0 ? rows[actualIdx] : null;
            if (row) {
              const newData = { ...row.data, [contextMenu.col]: '' };
              setRows(prev => prev.map(r => r.id === contextMenu.rowId ? { ...r, data: newData } : r));
              try { await supabase.from('list_rows').update({ data: newData }).eq('id', row.id); } catch (e) { /* silent */ }
            }
            setContextMenu(null);
          }} className="w-full text-left text-xs px-3 py-1.5 hover:bg-zinc-700 text-red-400">🗑 Clear cell</button>
        </div>
      )}

      {/* Header context menu */}
      {headerContextMenu && (
        <div
          className="fixed z-[100] bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-[180px]"
          style={{ left: headerContextMenu.x, top: headerContextMenu.y }}
        >
          <div className="px-3 py-1 text-[10px] text-zinc-500 uppercase">Add Column After "{headerContextMenu.col}"</div>
          {STEP_CATEGORIES.map(cat => (
            <div key={cat.label}>
              <div className="px-3 py-0.5 text-[9px] text-zinc-600">{cat.label}</div>
              {cat.items.map(item => (
                <button
                  key={item.type}
                  onClick={() => { addStep(item.type, headerContextMenu.col); setHeaderContextMenu(null); }}
                  className="w-full text-left text-xs px-3 py-1.5 hover:bg-zinc-700 text-zinc-200"
                >
                  {item.icon} {item.name}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* ══════ FILTER MODAL ══════ */}
      {showFilterModal && (
        <div className="fixed inset-0 z-[150] bg-black/60 flex items-center justify-center" onClick={() => setShowFilterModal(false)}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 w-[420px] max-h-[80vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-zinc-200">Filters</span>
              <button onClick={() => setShowFilterModal(false)} className="text-zinc-500 hover:text-zinc-300">✕</button>
            </div>

            {/* Existing filters */}
            {filters.map((f, i) => (
              <div key={i} className="flex items-center gap-2 mb-2 bg-zinc-800/50 rounded p-2">
                <span className="text-xs text-zinc-300 flex-1">{f.column} {f.operator.replace(/_/g, ' ')} {f.value || ''}</span>
                <button onClick={() => removeFilter(i)} className="text-xs text-red-400 hover:text-red-300">×</button>
              </div>
            ))}

            {/* Add filter */}
            <div className="flex gap-2 mt-2">
              <select id="_filter_col" className="flex-1 bg-zinc-800 text-xs text-zinc-200 px-2 py-1.5 rounded border border-zinc-700">
                {columnOrder.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select id="_filter_op" className="bg-zinc-800 text-xs text-zinc-200 px-2 py-1.5 rounded border border-zinc-700">
                {['equals','not_equals','contains','not_contains','is_empty','is_not_empty'].map(op => (
                  <option key={op} value={op}>{op.replace(/_/g, ' ')}</option>
                ))}
              </select>
              <input id="_filter_val" placeholder="Value" className="flex-1 bg-zinc-800 text-xs text-zinc-200 px-2 py-1.5 rounded border border-zinc-700 outline-none" />
              <button
                onClick={() => {
                  const col = document.getElementById('_filter_col')?.value;
                  const op = document.getElementById('_filter_op')?.value;
                  const val = document.getElementById('_filter_val')?.value;
                  if (col && op) addFilter({ column: col, operator: op, value: val || '' });
                }}
                className="text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded transition"
              >
                Add
              </button>
            </div>

            {/* Quick presets */}
            <div className="mt-3 flex flex-wrap gap-1">
              {[
                { label: 'Valid emails', preset: 'valid' },
                { label: 'Invalid', preset: 'invalid' },
                { label: 'Qualified', preset: 'qualified' },
                { label: 'Has errors', preset: 'errors' },
              ].map(qf => (
                <button
                  key={qf.preset}
                  onClick={() => applyQuickFilter(qf.preset)}
                  className="text-[10px] px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-400 transition"
                >
                  {qf.label}
                </button>
              ))}
            </div>

            {filters.length > 0 && (
              <button onClick={() => setFilters([])} className="mt-3 text-xs text-red-400 hover:underline">Clear all filters</button>
            )}
          </div>
        </div>
      )}

      {/* ══════ MERGE MODAL ══════ */}
      {showMergeModal && mergeData && (
        <div className="fixed inset-0 z-[150] bg-black/60 flex items-center justify-center" onClick={() => setShowMergeModal(false)}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 w-[480px] max-h-[80vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-zinc-200">Merge CSV: {mergeFile}</span>
              <button onClick={() => setShowMergeModal(false)} className="text-zinc-500 hover:text-zinc-300">✕</button>
            </div>

            <p className="text-[11px] text-zinc-400 mb-3">{mergeData.rows.length} rows in merge file</p>

            <div className="flex gap-3 mb-3">
              <div className="flex-1">
                <label className="text-[10px] text-zinc-500">Match column (your list)</label>
                <select
                  value={mergeMatchCol.left}
                  onChange={e => setMergeMatchCol(prev => ({ ...prev, left: e.target.value }))}
                  className="w-full mt-1 bg-zinc-800 text-xs text-zinc-200 px-2 py-1.5 rounded border border-zinc-700"
                >
                  <option value="">Select...</option>
                  {origColumns.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <label className="text-[10px] text-zinc-500">Match column (merge file)</label>
                <select
                  value={mergeMatchCol.right}
                  onChange={e => setMergeMatchCol(prev => ({ ...prev, right: e.target.value }))}
                  className="w-full mt-1 bg-zinc-800 text-xs text-zinc-200 px-2 py-1.5 rounded border border-zinc-700"
                >
                  <option value="">Select...</option>
                  {mergeData.headers.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="text-[10px] text-zinc-500">Columns to merge</label>
              <div className="flex flex-wrap gap-1 mt-1">
                {mergeData.headers.filter(h => h !== mergeMatchCol.right).map(h => (
                  <button
                    key={h}
                    onClick={() => setMergeCols(prev => prev.includes(h) ? prev.filter(c => c !== h) : [...prev, h])}
                    className={`text-[10px] px-2 py-1 rounded transition ${
                      mergeCols.includes(h) ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                    }`}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>

            {mergeMatchCol.left && mergeMatchCol.right && (
              <p className="text-[11px] text-zinc-400 mt-3">
                Preview: matching on {mergeMatchCol.left} ↔ {mergeMatchCol.right}, merging {mergeCols.length} column{mergeCols.length !== 1 ? 's' : ''}
              </p>
            )}

            <div className="flex gap-2 mt-4">
              <button
                onClick={executeMerge}
                disabled={!mergeMatchCol.left || !mergeMatchCol.right || !mergeCols.length}
                className="flex-1 text-xs py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded font-medium transition"
              >
                Execute Merge
              </button>
              <button onClick={() => setShowMergeModal(false)} className="text-xs px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
