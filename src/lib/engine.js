// ═══════════════════════════════════════════════════════════════
// JAKLAY ENGINE — Enrichment Step Processor
// Runs on the server (Vercel serverless functions)
// ═══════════════════════════════════════════════════════════════

// ─── Integration Registry ─────────────────────────────────────
export const INTEGRATIONS = {
  anthropic: { name: "Claude", type: "ai", models: [
    { id: "claude-sonnet-4-20250514", label: "Sonnet 4", cost: 0.003 },
    { id: "claude-opus-4-20250514", label: "Opus 4", cost: 0.015 },
    { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5", cost: 0.001 },
  ]},
  openai: { name: "OpenAI", type: "ai", models: [
    { id: "gpt-4o", label: "GPT-4o", cost: 0.005 },
    { id: "gpt-4o-mini", label: "GPT-4o Mini", cost: 0.0003 },
  ]},
  perplexity: { name: "Perplexity", type: "ai", models: [
    { id: "sonar", label: "Sonar", cost: 0.001 },
    { id: "sonar-pro", label: "Sonar Pro", cost: 0.003 },
  ]},
  millionverifier: { name: "MillionVerifier", type: "verification" },
  findymail: { name: "FindyMail", type: "email_finder" },
  hunter: { name: "Hunter.io", type: "email_finder" },
  prospeo: { name: "Prospeo", type: "email_finder" },
  dropcontact: { name: "DropContact", type: "email_finder" },
  leadmagic: { name: "LeadMagic", type: "email_finder" },
  datagma: { name: "Datagma", type: "email_finder" },
  wiza: { name: "Wiza", type: "email_finder" },
  rocketreach: { name: "RocketReach", type: "email_finder" },
  instantly: { name: "Instantly", type: "outreach" },
  apify: { name: "Apify", type: "scraping" },
  phantombuster: { name: "PhantomBuster", type: "scraping" },
  google_search: { name: "Serper/Google", type: "scraping" },
  ocean: { name: "Ocean.io", type: "data" },
};

// ─── Template interpolation ──────────────────────────────────
export function interpolate(template, row) {
  return template.replace(/\{(\w[\w\s]*)\}/g, (_, key) => {
    const k = key.trim();
    const match = Object.keys(row).find(
      c => c.toLowerCase().replace(/\s+/g, "_") === k.toLowerCase().replace(/\s+/g, "_")
        || c.toLowerCase() === k.toLowerCase()
    );
    return match ? (row[match] || "") : `{${k}}`;
  });
}

// ─── Condition evaluator ─────────────────────────────────────
export function evalCondition(row, cond) {
  if (!cond || !cond.column) return true;
  const val = (row[cond.column] || "").toString().toLowerCase().trim();
  const target = (cond.value || "").toString().toLowerCase().trim();
  switch (cond.operator) {
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
}

// ─── AI API Calls ─────────────────────────────────────────────
export async function callAI(provider, model, prompt, keys) {
  const key = keys[provider];
  if (!key) throw new Error(`No ${provider} API key`);

  if (provider === "anthropic") {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: 1024, messages: [{ role: "user", content: prompt }] }),
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);
    return d.content?.[0]?.text || "";
  }

  if (provider === "openai") {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, max_tokens: 1024, messages: [{ role: "user", content: prompt }] }),
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);
    return d.choices?.[0]?.message?.content || "";
  }

  if (provider === "perplexity") {
    const r = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, max_tokens: 1024, messages: [{ role: "user", content: prompt }] }),
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error?.message || JSON.stringify(d.error));
    return d.choices?.[0]?.message?.content || "";
  }

  throw new Error("Unknown AI provider: " + provider);
}

// ─── Email Verification ───────────────────────────────────────
export async function verifyEmail(email, keys) {
  const key = keys.millionverifier;
  if (!key) throw new Error("No MillionVerifier key");
  const r = await fetch(`https://api.millionverifier.com/api/v3/?api=${key}&email=${encodeURIComponent(email)}`);
  return await r.json();
}

// ─── Email Finders ────────────────────────────────────────────
export async function findEmail(provider, params, keys) {
  const key = keys[provider];
  if (!key) throw new Error(`No ${provider} key`);

  if (provider === "findymail") {
    const r = await fetch("https://app.findymail.com/api/search/mail", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ first_name: params.first_name, last_name: params.last_name, domain: params.domain }),
    });
    const d = await r.json();
    return { email: d.email || d.emails?.[0] || "", raw: d };
  }

  if (provider === "hunter") {
    const r = await fetch(`https://api.hunter.io/v2/email-finder?domain=${encodeURIComponent(params.domain)}&first_name=${encodeURIComponent(params.first_name)}&last_name=${encodeURIComponent(params.last_name)}&api_key=${key}`);
    const d = await r.json();
    return { email: d.data?.email || "", confidence: d.data?.confidence, raw: d };
  }

  if (provider === "prospeo") {
    const r = await fetch("https://api.prospeo.io/social-url-finder", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-KEY": key },
      body: JSON.stringify({ first_name: params.first_name, last_name: params.last_name, company_name: params.domain }),
    });
    const d = await r.json();
    return { email: d.response?.email?.email || "", raw: d };
  }

  if (provider === "dropcontact") {
    const r = await fetch("https://api.dropcontact.io/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Access-Token": key },
      body: JSON.stringify({ data: [{ first_name: params.first_name, last_name: params.last_name, company: params.domain }] }),
    });
    const d = await r.json();
    return { email: d.data?.[0]?.email?.[0]?.email || "", raw: d };
  }

  if (provider === "leadmagic") {
    const r = await fetch("https://api.leadmagic.io/email-finder", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": key },
      body: JSON.stringify({ first_name: params.first_name, last_name: params.last_name, domain: params.domain }),
    });
    const d = await r.json();
    return { email: d.email || "", raw: d };
  }

  // Generic fallback pattern for other providers
  return { email: "", error: `${provider} integration call pattern needed` };
}

// ─── Waterfall: try multiple sources sequentially ─────────────
export async function waterfallFindEmail(sources, params, keys) {
  for (const src of sources) {
    try {
      if (!keys[src]) continue;
      const result = await findEmail(src, params, keys);
      if (result.email && result.email.includes("@")) {
        return { email: result.email, source: src, confidence: result.confidence };
      }
    } catch (e) {
      continue; // try next source
    }
  }
  return { email: "", source: "none", error: "All sources exhausted" };
}

// ─── Push to Instantly ────────────────────────────────────────
export async function pushToInstantly(params, keys) {
  const key = keys.instantly;
  if (!key) throw new Error("No Instantly key");
  const r = await fetch("https://api.instantly.ai/api/v1/lead/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: key,
      campaign_id: params.campaign_id,
      skip_if_in_workspace: true,
      leads: [{
        email: params.email,
        first_name: params.first_name || "",
        last_name: params.last_name || "",
        company_name: params.company_name || "",
        ...(params.custom_vars || {}),
      }],
    }),
  });
  return await r.json();
}

// ─── Formula Evaluator ───────────────────────────────────────
export function evalFormula(formula, row) {
  // IF {col} is "value" THEN {col2} ELSE {col3}
  const ifMatch = formula.match(/IF\s+\{(.+?)\}\s+is\s+"(.+?)"\s+THEN\s+\{(.+?)\}\s*(?:ELSE\s+\{(.+?)\})?/i);
  if (ifMatch) {
    const [, col, val, thenCol, elseCol] = ifMatch;
    return (row[col] || "").toLowerCase().trim() === val.toLowerCase().trim()
      ? (row[thenCol] || "")
      : (elseCol ? row[elseCol] || "" : "");
  }

  // output {col} IF {cond1} is "val" OR {cond2} is "val"
  const orMatch = formula.match(/output\s+(.+?)\s+IF\s+(.+)/i);
  if (orMatch) {
    const conditions = orMatch[2].split(/\s+OR\s+/i);
    for (const cond of conditions) {
      const m = cond.match(/\{(.+?)\}\s+is\s+"(.+?)"/i);
      if (m && (row[m[1]] || "").toLowerCase().trim() === m[2].toLowerCase().trim()) {
        return interpolate(orMatch[1], row);
      }
    }
    return "";
  }

  // CONCAT({col1}, " ", {col2})
  const concatMatch = formula.match(/CONCAT\((.+)\)/i);
  if (concatMatch) {
    const parts = concatMatch[1].split(",").map(p => {
      p = p.trim();
      if (p.startsWith('"') && p.endsWith('"')) return p.slice(1, -1);
      if (p.startsWith("{") && p.endsWith("}")) return row[p.slice(1, -1)] || "";
      return p;
    });
    return parts.join("");
  }

  return interpolate(formula, row);
}

// ─── Process a single step for a single row ──────────────────
export async function processStep(step, rowData, keys) {
  // Check condition
  if (step.condition?.column && !evalCondition(rowData, step.condition)) {
    return { value: "⏭ Skipped", skipped: true };
  }

  // Skip if already has valid data
  const existing = rowData[step.outputColumn];
  if (existing && !existing.startsWith("⚠") && !existing.startsWith("⏭")) {
    return { value: existing, skipped: true };
  }

  try {
    let result = "";

    switch (step.type) {
      case "ai_enrich":
      case "web_research": {
        const filled = interpolate(step.prompt, rowData);
        result = await callAI(step.provider, step.model, filled, keys);
        break;
      }

      case "api_verify": {
        const email = rowData[step.emailColumn];
        if (!email) return { value: "⏭ No email" };
        const d = await verifyEmail(email, keys);
        result = d.result || d.quality || JSON.stringify(d);
        break;
      }

      case "api_find_email": {
        const domain = (rowData[step.domainCol] || "").replace(/https?:\/\//, "").replace(/\/.*/, "");
        const params = { first_name: rowData[step.fnCol] || "", last_name: rowData[step.lnCol] || "", domain };
        const d = await findEmail(step.emailProvider || "findymail", params, keys);
        result = d.email || "Not found";
        break;
      }

      case "waterfall": {
        const domain = (rowData[step.domainCol] || "").replace(/https?:\/\//, "").replace(/\/.*/, "");
        const params = { first_name: rowData[step.fnCol] || "", last_name: rowData[step.lnCol] || "", domain };
        const d = await waterfallFindEmail(step.waterfallSources || [], params, keys);
        result = d.email ? `${d.email} (via ${INTEGRATIONS[d.source]?.name || d.source})` : "Not found";
        break;
      }

      case "formula": {
        result = evalFormula(step.formula || "", rowData);
        break;
      }

      case "condition_gate": {
        result = evalCondition(rowData, step.condition) ? "✅ Pass" : "❌ Fail";
        break;
      }

      case "api_push": {
        const email = rowData[step.emailColumn];
        if (!email || email.startsWith("⚠")) return { value: "⏭ No valid email" };
        const fnKey = Object.keys(rowData).find(k => /first.?name/i.test(k));
        const lnKey = Object.keys(rowData).find(k => /last.?name/i.test(k));
        const coKey = Object.keys(rowData).find(k => /company/i.test(k));
        await pushToInstantly({
          email, first_name: fnKey ? rowData[fnKey] : "", last_name: lnKey ? rowData[lnKey] : "",
          company_name: coKey ? rowData[coKey] : "", campaign_id: step.campaignId,
        }, keys);
        result = "✅ Pushed";
        break;
      }

      default:
        result = "Unknown step type";
    }

    return { value: (result || "").toString().trim() };
  } catch (err) {
    return { value: `⚠ ${err.message}`, error: true };
  }
}
