# JAKLAY SaaS Setup — Complete Guide

## What you're setting up

A multi-tenant SaaS with:
- User signup/login (Supabase Auth, free)
- Stripe subscriptions ($29/79/199 tiers)
- Freemium: 5 free enrichment runs, 100 rows
- Admin dashboard (see all users, MRR, usage)
- Secure per-user API key storage (RLS)
- Usage tracking and limits

---

## Step 1: Run the new database migration

Go to **Supabase → SQL Editor** and paste the entire contents of `supabase/schema-v2-saas.sql`. Click **Run**.

This adds: profiles table, usage tracking, auto-profile creation on signup, and proper Row Level Security so users can only see their own data.

---

## Step 2: Enable Supabase Auth

1. Go to **Supabase → Authentication → Providers**
2. Email is enabled by default — that's all you need
3. Optional: enable Google, GitHub OAuth under Providers
4. Go to **Authentication → URL Configuration**
5. Set **Site URL** to your Vercel URL: `https://jaklay.vercel.app`
6. Add to **Redirect URLs**: `https://jaklay.vercel.app/**`

---

## Step 3: Set up Stripe

1. Go to **stripe.com** → Sign up or log in
2. Go to **Products** → Create 3 products:

| Product | Price | Billing |
|---------|-------|---------|
| Jaklay Starter | $29/month | Recurring |
| Jaklay Pro | $79/month | Recurring |
| Jaklay Enterprise | $199/month | Recurring |

3. After creating each, copy the **Price ID** (starts with `price_`)
4. Go to **Developers → API Keys** → Copy **Secret key** (starts with `sk_live_` or `sk_test_`)
5. Go to **Developers → Webhooks** → Add endpoint:
   - URL: `https://jaklay.vercel.app/api/stripe`
   - Events: `checkout.session.completed`, `customer.subscription.deleted`, `invoice.payment_failed`
   - Copy the **Signing secret** (starts with `whsec_`)

---

## Step 4: Update Vercel environment variables

Go to **Vercel → Your Project → Settings → Environment Variables** and add:

| Variable | Value |
|----------|-------|
| `STRIPE_SECRET_KEY` | sk_live_... or sk_test_... |
| `STRIPE_WEBHOOK_SECRET` | whsec_... |

---

## Step 5: Update pricing page with your Price IDs

In `src/app/pricing/page.js`, replace the placeholder Price IDs:

```
{ id: 'starter', priceId: 'price_YOUR_STARTER_ID', ... }
{ id: 'pro', priceId: 'price_YOUR_PRO_ID', ... }
{ id: 'enterprise', priceId: 'price_YOUR_ENTERPRISE_ID', ... }
```

---

## Step 6: Make yourself admin

1. Sign up on your Jaklay site with your personal email
2. Go to **Supabase → SQL Editor** and run:

```sql
UPDATE profiles SET plan = 'admin' WHERE email = 'YOUR_EMAIL@gmail.com';
```

Now you have unlimited access + the admin dashboard at `/admin`.

---

## Step 7: Deploy

```bash
git add .
git commit -m "saas launch"
git push
```

---

## Step 8: Test the flow

1. Visit your site → you should see the login page
2. Sign up with a test email
3. You're on the free plan (5 runs, 100 rows)
4. Upload a CSV, add a step, try to run → works for 5 runs
5. Go to `/pricing` → click Subscribe on Starter
6. Complete Stripe checkout (use test card `4242 4242 4242 4242`)
7. Redirected back → now you have 500 runs
8. Go to `/admin` (your admin account) → see the test user

---

## Pricing strategy

**Recommended pricing (vs Clay):**

| | Free | Starter ($29) | Pro ($79) | Enterprise ($199) |
|---|---|---|---|---|
| Enrichment runs | 5/month | 500/month | Unlimited | Unlimited |
| Rows per list | 100 | 5,000 | Unlimited | Unlimited |
| Integrations | BYOK* | All | All | All |
| Waterfall | ✓ | ✓ | ✓ | ✓ |
| Webhook API | ✗ | ✓ | ✓ | ✓ |
| Templates | 1 | Unlimited | Unlimited | Unlimited |
| Support | Community | Email | Priority | Dedicated |

*BYOK = Bring Your Own Keys (all plans)

**Why people will pay:**
- Clay Starter is $149/mo. Your Starter is $29.
- Clay Pro is $349/mo. Your Pro is $79.
- People still bring their own API keys, so your costs are near zero.
- Your margin is basically 100% minus Vercel/Supabase hosting (free tier covers most usage).

**What to say in marketing:**
- "Everything Clay does, 80% cheaper"
- "No credit system — use your own API keys, pay only what you use"
- "Built by a cold email operator, for cold email operators"

---

## Monthly usage reset

Add a Supabase cron job (or use supabase.com → Database → Extensions → pg_cron):

```sql
SELECT cron.schedule('reset-monthly-usage', '0 0 1 * *',
  $$UPDATE profiles SET enrichment_runs_used = 0 WHERE plan != 'admin'$$
);
```

This resets everyone's usage counter on the 1st of each month.

---

## What's implicit that you might forget

1. **Terms of Service / Privacy Policy** — You need these before charging money. Use a generator like termly.io (free)
2. **Stripe test mode first** — Use `sk_test_` keys until you're ready to go live
3. **Email confirmation** — Supabase Auth sends confirmation emails by default. Customize the template in Authentication → Email Templates
4. **Rate limiting** — Vercel hobby plan has limits. If you get traffic, upgrade to Pro ($20/mo)
5. **Backups** — Supabase auto-backs up on paid plans. Free tier doesn't. Consider upgrading Supabase to Pro ($25/mo) once you have paying customers
6. **Domain** — Point a custom domain (jaklay.com) via Vercel → Settings → Domains
7. **Analytics** — Add Plausible or PostHog for usage tracking
8. **Error monitoring** — Add Sentry for bug tracking
