import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PLAN_LIMITS = {
  free: { runs: 5, rows: 100 },
  starter: { runs: 500, rows: 5000 },
  pro: { runs: 999999, rows: 999999 },
  enterprise: { runs: 999999, rows: 999999 },
  admin: { runs: 999999, rows: 999999 },
};

// POST: create checkout session or handle webhook
export async function POST(req) {
  const contentType = req.headers.get('content-type') || '';

  // Stripe webhook (has stripe-signature header)
  if (req.headers.get('stripe-signature')) {
    return handleWebhook(req);
  }

  // Regular checkout request
  const supabase = createServerClient();
  const body = await req.json();

  if (body.action === 'create_checkout') {
    // Get user from auth header
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    // For now, get user from cookie/session
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    // Get or create Stripe customer
    const { data: profile } = await supabase.from('profiles').select('stripe_customer_id').eq('id', user.id).single();

    let customerId = profile?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email, metadata: { supabase_uid: user.id } });
      customerId = customer.id;
      await supabase.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: body.priceId, quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/?upgraded=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing`,
      metadata: { supabase_uid: user.id, plan_id: body.planId },
    });

    return NextResponse.json({ url: session.url });
  }

  if (body.action === 'create_portal') {
    const { data: profile } = await supabase.from('profiles').select('stripe_customer_id').eq('id', body.userId).single();
    if (!profile?.stripe_customer_id) return NextResponse.json({ error: 'No subscription' }, { status: 400 });

    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/`,
    });
    return NextResponse.json({ url: session.url });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

async function handleWebhook(req) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');
  let event;

  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const supabase = createServerClient();

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const uid = session.metadata?.supabase_uid;
      const planId = session.metadata?.plan_id || 'starter';
      const limits = PLAN_LIMITS[planId] || PLAN_LIMITS.starter;

      await supabase.from('profiles').update({
        plan: planId,
        stripe_subscription_id: session.subscription,
        enrichment_runs_limit: limits.runs,
        row_limit: limits.rows,
        enrichment_runs_used: 0, // reset on upgrade
        updated_at: new Date().toISOString(),
      }).eq('id', uid);
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      // Downgrade to free
      const { data } = await supabase.from('profiles').select('id').eq('stripe_subscription_id', sub.id).single();
      if (data) {
        await supabase.from('profiles').update({
          plan: 'free',
          stripe_subscription_id: null,
          enrichment_runs_limit: 5,
          row_limit: 100,
          updated_at: new Date().toISOString(),
        }).eq('id', data.id);
      }
      break;
    }

    case 'invoice.payment_failed': {
      // Could send email notification
      break;
    }
  }

  return NextResponse.json({ received: true });
}
