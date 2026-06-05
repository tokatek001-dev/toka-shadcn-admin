import { getRouteApi } from '@tanstack/react-router'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { EntryProvider, type EntryTab } from './components/entry-provider'
import { EntryTabs } from './components/entry-tabs'

const route = getRouteApi('/_authenticated/entry/')

export function Entry() {
  const search = route.useSearch()
  const navigate = route.useNavigate()

  const activeTab: EntryTab = search.tab === 'full_tests' ? 'full_tests' : 'part_tests'

  return (
    <EntryProvider activeTab={activeTab} search={search} navigate={navigate}>
      <Header fixed>
        <Search className='me-auto' />
        <ThemeSwitch />
        <ConfigDrawer />
        <ProfileDropdown />
      </Header>

      <Main className='flex flex-1 flex-col gap-4 sm:gap-6'>
        <div className='flex flex-wrap items-end justify-between gap-2'>
          <div>
            <h2 className='text-2xl font-bold tracking-tight'>Entry Browser</h2>
            <p className='text-muted-foreground'>Browse TOEIC test content</p>
          </div>
        </div>
        <EntryTabs />
      </Main>
    </EntryProvider>
  )
}
