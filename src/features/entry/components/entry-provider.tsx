import React from 'react'
import { type NavigateFn } from '@/hooks/use-table-url-state'

export type EntryTab = 'part_tests' | 'full_tests'

type EntryContextType = {
  activeTab: EntryTab
  setTab: (tab: EntryTab) => void
  search: Record<string, unknown>
  navigate: NavigateFn
}

const EntryContext = React.createContext<EntryContextType | null>(null)

type EntryProviderProps = {
  children: React.ReactNode
  activeTab: EntryTab
  search: Record<string, unknown>
  navigate: NavigateFn
}

export function EntryProvider({
  children,
  activeTab,
  search,
  navigate,
}: EntryProviderProps) {
  const setTab = React.useCallback(
    (tab: EntryTab) => {
      // Switching tabs resets pagination and per-tab filters so the new tab
      // starts clean; the tab itself is the only preserved search param.
      navigate({
        search: () => ({ tab: tab === 'part_tests' ? undefined : tab }),
      })
    },
    [navigate]
  )

  const value = React.useMemo(
    () => ({ activeTab, setTab, search, navigate }),
    [activeTab, setTab, search, navigate]
  )

  return <EntryContext value={value}>{children}</EntryContext>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useEntry = () => {
  const ctx = React.useContext(EntryContext)
  if (!ctx) {
    throw new Error('useEntry has to be used within <EntryProvider>')
  }
  return ctx
}
