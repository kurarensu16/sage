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
      return new Response(JSON.stringify({ error: 'Only admins can create new users' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Parse the new user details from the request body
    const body = await req.json()
    const { email, password, firstName, lastName, middleName, role, departmentId, yearLevel, sectionId, userNumber } = body

    // 1. Create the user in Supabase Auth
    const { data: newAuthUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true // Auto-confirm
    })

    if (createUserError) {
      throw createUserError
    }

    // 2. Insert the user into the public.users table
    const { error: insertError } = await supabaseAdmin.from('users').insert({
      user_id: newAuthUser.user.id,
      email: email,
      first_name: firstName,
      last_name: lastName,
      middle_name: middleName,
      role: role,
      department_id: departmentId,
      year_level: role === 'student' ? yearLevel : null,
      section_id: role === 'student' ? sectionId : null,
      password_hash: 'managed_by_supabase_auth', // We don't store passwords anymore
      user_number: userNumber || null
    })

    if (insertError) {
      // If profile creation fails, clean up the auth user so we don't have orphan accounts
      await supabaseAdmin.auth.admin.deleteUser(newAuthUser.user.id)
      throw insertError
    }

    return new Response(JSON.stringify({ success: true, user: newAuthUser.user }), {
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
