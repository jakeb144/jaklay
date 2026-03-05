import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Admin client with service role key — bypasses RLS and email verification
const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(req) {
  const { action, email, password, name } = await req.json();

  if (action === 'signup') {
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
    }

    // Create user with auto-confirm (no email verification needed)
    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name || '' },
    });

    if (error) {
      // Handle duplicate user
      if (error.message?.includes('already been registered')) {
        return NextResponse.json({ error: 'An account with this email already exists. Try logging in.' }, { status: 400 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Sign them in immediately to get a session
    const { data: session, error: signInError } = await adminClient.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      return NextResponse.json({ error: 'Account created but sign-in failed. Please log in.' }, { status: 400 });
    }

    return NextResponse.json({
      user: data.user,
      session: session.session,
    });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
