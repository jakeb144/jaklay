# JAKLAY — Setup Guide (5th Grader Edition)

> Your personal Clay clone. AI enrichment, waterfall email finding, conditional logic, background processing, webhook triggers.

---

## Step 1: Create a GitHub Repo

1. Go to **github.com** → click green **New** button
2. Name it `jaklay` → click **Create repository**
3. Leave the page open — you'll need the URL in a sec

---

## Step 2: Get the Code on Your Computer

Open your terminal and run:

```bash
# Clone this project (or download the zip and unzip it)
cd ~/Desktop
# Copy the jaklay folder from the zip to your Desktop
cd jaklay

# Initialize git
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/YOUR_USERNAME/jaklay.git
git branch -M main
git push -u origin main
```

---

## Step 3: Set Up Supabase (Your Database)

1. Go to **supabase.com** → sign in (you already have an account from Hormozi GPT)
2. Click **New Project**
   - Name: `jaklay`
   - Database password: make one up and save it
   - Region: pick closest to you
   - Click **Create**
3. Wait ~2 mins for it to spin up
4. Go to **SQL Editor** (left sidebar)
5. Paste the ENTIRE contents of `supabase/schema.sql` into the editor
6. Click **Run** — you should see "Success" messages
7. Now grab your keys:
   - Go to **Settings → API** (left sidebar)
   - Copy **Project URL** → this is your `NEXT_PUBLIC_SUPABASE_URL`
   - Copy **anon public key** → this is your `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Copy **service_role key** (click reveal) → this is your `SUPABASE_SERVICE_ROLE_KEY`

---

## Step 4: Set Up Vercel (Hosting)

1. Go to **vercel.com** → sign in (you already have an account)
2. Click **Add New → Project**
3. Import your `jaklay` GitHub repo
4. Before clicking Deploy, add environment variables:
   - Click **Environment Variables**
   - Add these one by one:

| Name | Value |
|------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | your service role key |
| `NEXT_PUBLIC_APP_URL` | leave blank for now |
| `WEBHOOK_SECRET` | make up a random string (e.g. `jaklay_wh_2025_secret`) |

5. Click **Deploy** — wait ~2 min
6. Once deployed, you'll get a URL like `https://jaklay.vercel.app`
7. Go back to **Settings → Environment Variables** → update `NEXT_PUBLIC_APP_URL` to that URL
8. **Redeploy**: Go to Deployments → click the 3-dot menu on the latest → Redeploy

---

## Step 5: First Use

1. Visit your Jaklay URL (e.g. `https://jaklay.vercel.app`)
2. Click **🔑 Keys** → paste in your API keys one by one:
   - **Anthropic**: console.anthropic.com → API Keys
   - **OpenAI**: platform.openai.com → API Keys
   - **Perplexity**: perplexity.ai/settings/api
   - **MillionVerifier**: millionverifier.com → Dashboard → API
   - **FindyMail**: findymail.com → Settings → API
   - Add others as you need them
3. **Drop a CSV** into the main area
4. **Build your workflow** using the left sidebar
5. Click **▶ Run All** — it processes in the background even if you close the tab

---

## Step 6: Connect Make.com

To trigger Jaklay workflows from Make.com:

1. In Make, add an **HTTP** module
2. Set it up as:
   - **URL**: `https://your-jaklay.vercel.app/api/webhook`
   - **Method**: POST
   - **Headers**: 
     - `Content-Type`: `application/json`
     - `x-webhook-secret`: your WEBHOOK_SECRET from Step 4
   - **Body** (JSON):

```json
{
  "action": "run_workflow",
  "workflow_id": "your-saved-workflow-uuid",
  "list_id": "your-list-uuid",
  "test_limit": 0
}
```

**To upload a new CSV via webhook:**

```json
{
  "action": "run_workflow",
  "workflow_id": "your-saved-workflow-uuid",
  "list_name": "Make Upload March 2025",
  "csv_data": [
    { "company_name": "Acme Corp", "website": "acme.com", "email": "..." },
    { "company_name": "Beta Inc", "website": "beta.io", "email": "..." }
  ],
  "test_limit": 0
}
```

3. You can get the `workflow_id` from the **Templates** panel in Jaklay — it shows the ID for each saved workflow
4. You can get the `list_id` from the URL or the lists dropdown

**To check job status** (useful in Make for waiting):
```
GET https://your-jaklay.vercel.app/api/workflow/status?job_id=xxx
```

---

## Step 7: Build Your First Workflow

Here's the exact workflow from your screenshots:

### Lead Qualification Pipeline

1. **🤖 Use AI** → "qualified" column
   - Model: GPT-4o Mini
   - Prompt: Load "Qualify B2B Fit" from library
   - *This researches each company and outputs YES/NO*

2. **✅ Verify Email** → "mv_result" column
   - Condition: IF {qualified} equals "YES"
   - Email column: select your email column
   - *Only verifies emails for qualified leads*

3. **📧 Find Email (FindyMail)** → "findymail_email" column
   - Condition: IF {mv_result} not_equals "ok"
   - *Tries to find a better email when MV says bad*

4. **ƒ Formula** → "best_email" column
   - Formula: `output {email} IF {mv_result} is "ok" OR output {findymail_email} IF {findymail_email} is_not_empty`
   - *Consolidates the best email from all sources*

5. **🌐 Web Research** → "pr_firm" column
   - Condition: IF {qualified} equals "YES"
   - Model: Perplexity Sonar Pro
   - Prompt: Load "Match Best PR Firm" from library

6. **🤖 Use AI** → "article_title" column
   - Condition: IF {qualified} equals "YES"
   - Model: Claude Sonnet
   - Prompt: Load "Generate PR Article Title" from library

7. **⚡ Push to Instantly** → "push_result" column
   - Condition: IF {best_email} is_not_empty
   - Campaign ID: your Instantly campaign ID
   - Email column: best_email

**Save this as a template** → now you can trigger it with one click or via Make.com webhook!

---

## Step 8: Waterfall Email Finding

For the full waterfall from the screenshots (LeadMagic → FindyMail → Prospeo → DropContact → Hunter → Datagma → Wiza → RocketReach):

1. Add a **💧 Waterfall** step
2. Set First Name, Last Name, Domain columns
3. The waterfall sequence is pre-loaded with all 8 providers
4. Reorder by dragging, remove ones you don't want
5. Set condition: IF {mv_result} not_equals "ok"

It tries each provider in order and **stops as soon as one finds a valid email** — exactly like Clay's waterfall.

---

## Architecture

```
┌─────────────┐     ┌──────────┐     ┌──────────────┐
│  Browser UI  │────▶│ Vercel   │────▶│  Supabase    │
│  (React)     │     │ API      │     │  (Postgres)  │
│              │◀────│ Routes   │◀────│  + Realtime   │
└─────────────┘     └──────────┘     └──────────────┘
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
    ┌──────────┐  ┌──────────┐  ┌──────────┐
    │ AI APIs  │  │ Email    │  │ Instantly │
    │ Claude   │  │ Verify   │  │ Apify    │
    │ GPT      │  │ FindyMail│  │ etc.     │
    │ Pplx     │  │ Hunter...│  │          │
    └──────────┘  └──────────┘  └──────────┘
```

**Background Processing**: When you click "Run All", it creates a job in Supabase, then the Vercel serverless function processes rows in batches of 5. After each batch, it calls itself to process the next batch. This chain continues even if you close your browser. The UI subscribes to Supabase Realtime to show live progress.

**Webhook Flow**: Make.com → POST /api/webhook → creates job → self-chaining processor runs → data appears in Supabase → poll /api/workflow/status for completion.

---

## Cost Comparison

| | Clay | Jaklay |
|---|---|---|
| Monthly | $149-$800/mo | $0/mo |
| Annual | $1,788-$9,600/yr | $0/yr |
| Per-row AI | $0.01-0.10 (Clay credits) | ~$0.001-0.01 (raw API) |
| Email verify | included (limited) | ~$0.0005 (MillionVerifier) |
| Email finder | included (limited) | ~$0.02 (FindyMail) |
| Hosting | N/A | Free (Vercel + Supabase free tiers) |

**Your savings: $4,500+/year minimum.**
