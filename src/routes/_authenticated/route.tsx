import { createFileRoute, redirect } from '@tanstack/react-router'
import { AuthenticatedLayout } from '@/components/layout/authenticated-layout'
import { useAuthStore } from '@/stores/auth-store'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ location }) => {
    // Wait for store hydration if still loading.
    if (useAuthStore.getState().status === 'loading') {
      await new Promise<void>((resolvePromise) => {
        const unsub = useAuthStore.subscribe((s) => {
          if (s.status !== 'loading') {
            unsub()
            resolvePromise()
          }
        })
      })
    }
    if (!useAuthStore.getState().isAllowed()) {
      throw redirect({
        to: '/sign-in',
        search: { redirect: location.href },
      })
    }
  },
  component: AuthenticatedLayout,
})
