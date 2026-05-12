import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

type Params = { params: Promise<{ id: string }> }

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id: orgId } = await params

  const cookieStore = await cookies()
  const session = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => {
          try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
        },
      },
    }
  )
  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: { user } } = await session.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await service
    .from('organization_admins')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', user.id)
    .single()

  if (!membership) return NextResponse.json({ error: 'You are not a member of this organization' }, { status: 404 })

  // Block if sole owner
  if (membership.role === 'owner') {
    const { count } = await service
      .from('organization_admins')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('role', 'owner')

    if ((count ?? 0) <= 1) {
      return NextResponse.json({
        error: 'You are the sole owner of this organization. Transfer ownership to another member before leaving.',
        code: 'SOLE_OWNER',
      }, { status: 400 })
    }
  }

  const { error } = await service
    .from('organization_admins')
    .delete()
    .eq('organization_id', orgId)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
