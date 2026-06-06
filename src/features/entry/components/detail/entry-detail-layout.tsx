import { type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { formatUpdatedAt } from '../../data/format'

type AuditInfo = {
  version: number
  createdBy: string
  createdAt: string | null
  updatedBy: string
  updatedAt: string | null
}

type EntryDetailLayoutProps = {
  title: string
  status: string | null
  audit: AuditInfo
  canEdit: boolean
  isSaving: boolean
  isDirty: boolean
  onBack: () => void
  onSave: () => void
  onSaveAndFinish: () => void
  sidebar?: ReactNode
  children: ReactNode
}

export function EntryDetailLayout({
  title,
  status,
  audit,
  canEdit,
  isSaving,
  isDirty,
  onBack,
  onSave,
  onSaveAndFinish,
  sidebar,
  children,
}: EntryDetailLayoutProps) {
  return (
    <>
      <Header fixed>
        <div className='me-auto' />
        <ThemeSwitch />
        <ProfileDropdown />
      </Header>

      <Main className='flex flex-1 flex-col gap-4 pb-24 sm:gap-6'>
        <div className='flex flex-wrap items-center gap-3'>
          <h2 className='text-2xl font-bold tracking-tight'>{title}</h2>
          {status && <Badge variant='outline'>{status}</Badge>}
        </div>

        <div className='text-sm text-muted-foreground'>
          Version {audit.version} · Created by {audit.createdBy} on{' '}
          {formatUpdatedAt(audit.createdAt)} · Updated by {audit.updatedBy} on{' '}
          {formatUpdatedAt(audit.updatedAt)}
        </div>

        <div className='flex flex-1 items-start gap-6'>
          {sidebar && (
            <aside className='sticky top-20 hidden w-64 shrink-0 lg:block'>
              {sidebar}
            </aside>
          )}
          <div className='min-w-0 flex-1'>{children}</div>
        </div>

        <div className='fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 p-3 backdrop-blur'>
          <div className='mx-auto flex max-w-3xl justify-end gap-2'>
            <Button variant='outline' onClick={onBack} disabled={isSaving}>
              Back
            </Button>
            {canEdit && (
              <>
                <Button onClick={onSave} disabled={!isDirty || isSaving}>
                  Save
                </Button>
                <Button
                  onClick={onSaveAndFinish}
                  disabled={!isDirty || isSaving}
                >
                  Save & Finish
                </Button>
              </>
            )}
          </div>
        </div>
      </Main>
    </>
  )
}
