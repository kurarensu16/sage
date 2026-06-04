import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'

// Setup CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = Deno.env.get('SERVICE_ROLE_KEY') ?? process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase Service Role Key or URL');
    }

    // Create a Supabase client with the Service Role key
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Get the JWT from the Authorization header
    const authHeader = req.headers.get('Authorization')!
    const token = authHeader.replace('Bearer ', '')

    // Verify the caller is actually an admin
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) {
       throw new Error('Unauthorized call');
    }

    // Check caller's role in public.users
    const { data: callerProfile, error: profileErr } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (profileErr || callerProfile.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Only admins can delete users' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Parse user details from request body
    const body = await req.json()
    const { userId } = body

    if (!userId) {
      throw new Error('Missing target userId');
    }

    // 1. Delete the user profile from the public.users table
    const { error: profileDeleteError } = await supabaseAdmin
      .from('users')
      .delete()
      .eq('user_id', userId)

    if (profileDeleteError) {
      throw profileDeleteError
    }

    // 2. Delete the user from Supabase Auth
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)

    if (authDeleteError) {
      throw authDeleteError
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
