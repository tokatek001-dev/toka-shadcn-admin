import { useEffect } from 'react'
import { z } from 'zod'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'

const searchSchema = z.object({
  redirect: z.string().optional(),
  error_description: z.string().optional(),
})

function OAuthCallback() {
  const navigate = useNavigate()
  const { redirect, error_description } = Route.useSearch()

  useEffect(() => {
    if (error_description) {
      toast.error(error_description)
      navigate({ to: '/sign-in', replace: true })
      return
    }
    const unsub = useAuthStore.subscribe(async (s) => {
      if (s.status === 'loading') return
      if (s.isAllowed()) {
        unsub()
        navigate({ to: redirect || '/', replace: true })
      } else if (s.status === 'authenticated') {
        unsub()
        await s.signOut()
        toast.error('Tài khoản không có quyền truy cập')
        navigate({ to: '/sign-in', replace: true })
      } else {
        unsub()
        navigate({ to: '/sign-in', replace: true })
      }
    })
    return () => unsub()
  }, [navigate, redirect, error_description])

  return (
    <div className='flex h-screen items-center justify-center gap-2 text-muted-foreground'>
      <Loader2 className='h-5 w-5 animate-spin' />
      <span>Signing you in…</span>
    </div>
  )
}

export const Route = createFileRoute('/(auth)/oauth/callback')({
  component: OAuthCallback,
  validateSearch: searchSchema,
})
