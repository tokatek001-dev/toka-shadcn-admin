import { createClient } from 'npm:@supabase/supabase-js@2'

type AdminUsersPayload =
  | {
      action: 'create'
      email: string
      password: string
      displayName: string
      role: 'admin' | 'user'
    }
  | { action: 'invite'; email: string; role: 'admin' | 'user' }
  | { action: 'delete'; userId: string }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Identify the caller from the JWT and require an admin profile.
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: callerData, error: callerError } = await admin.auth.getUser(jwt)
    if (callerError || !callerData.user) return json({ error: 'Unauthorized' }, 401)
    const caller = callerData.user

    const { data: profile, error: profileError } = await admin
      .from('user_profiles')
      .select('role')
      .eq('id', caller.id)
      .single()
    if (profileError || profile?.role !== 'admin') {
      return json({ error: 'Forbidden: admin only' }, 403)
    }

    let payload: AdminUsersPayload
    try {
      payload = (await req.json()) as AdminUsersPayload
    } catch {
      return json({ error: 'Invalid or missing JSON body' }, 400)
    }

    switch (payload.action) {
      case 'create': {
        if (!payload.email || !payload.password || !payload.displayName) {
          return json({ error: 'email, password and displayName are required' }, 400)
        }
        if (!EMAIL_RE.test(payload.email)) {
          return json({ error: 'Invalid email address' }, 400)
        }
        if (payload.role !== 'admin' && payload.role !== 'user') {
          return json({ error: 'role must be admin or user' }, 400)
        }
        // The on_auth_user_created trigger creates the user_profiles row.
        const { data, error } = await admin.auth.admin.createUser({
          email: payload.email,
          password: payload.password,
          email_confirm: true,
          user_metadata: { display_name: payload.displayName },
        })
        if (error) return json({ error: error.message }, 400)
        if (payload.role === 'admin') {
          const { data: updated, error: roleError } = await admin
            .from('user_profiles')
            .update({ role: 'admin' })
            .eq('id', data.user.id)
            .select('id')
          if (roleError) return json({ error: roleError.message }, 500)
          if (!updated || updated.length === 0) {
            return json(
              { error: 'Profile row not found for role assignment' },
              500
            )
          }
        }
        return json({ ok: true, userId: data.user.id })
      }
      case 'invite': {
        if (!payload.email) return json({ error: 'email is required' }, 400)
        if (!EMAIL_RE.test(payload.email)) {
          return json({ error: 'Invalid email address' }, 400)
        }
        if (payload.role !== 'admin' && payload.role !== 'user') {
          return json({ error: 'role must be admin or user' }, 400)
        }
        const { data, error } = await admin.auth.admin.inviteUserByEmail(payload.email)
        if (error) return json({ error: error.message }, 400)
        if (payload.role === 'admin') {
          const { data: updated, error: roleError } = await admin
            .from('user_profiles')
            .update({ role: 'admin' })
            .eq('id', data.user.id)
            .select('id')
          if (roleError) return json({ error: roleError.message }, 500)
          if (!updated || updated.length === 0) {
            return json(
              { error: 'Profile row not found for role assignment' },
              500
            )
          }
        }
        return json({ ok: true, userId: data.user.id })
      }
      case 'delete': {
        if (!payload.userId) return json({ error: 'userId is required' }, 400)
        if (!UUID_RE.test(payload.userId)) {
          return json({ error: 'userId must be a UUID' }, 400)
        }
        if (payload.userId === caller.id) {
          return json({ error: 'You cannot delete your own account' }, 400)
        }
        // FK cascade removes the user_profiles row.
        const { error } = await admin.auth.admin.deleteUser(payload.userId)
        if (error) return json({ error: error.message }, 400)
        return json({ ok: true })
      }
      default:
        return json({ error: 'Unknown action' }, 400)
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Internal error' }, 500)
  }
})
