import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useCanGoBack, useRouter } from '@tanstack/react-router'
import { toast } from 'sonner'
import { useIsAdmin } from '@/hooks/use-is-admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Form } from '@/components/ui/form'
import {
  fullTestFormSchema,
  toFullTestDefaults,
  toFullTestPayload,
  type FullTestDetail as FullTestRow,
  type FullTestFormInput,
  type FullTestFormValues,
} from '../../data/detail-schema'
import {
  fullDocumentStatusOptions,
  fullTestTypeOptions,
  levelOptions,
  parentTestTypeOptions,
} from '../../data/schema'
import { NotFoundError, useFullTestDetail } from '../../hooks/use-test-detail'
import { ConflictError, useUpdateTest } from '../../hooks/use-update-test'
import {
  DetailSkeleton,
  ErrorState,
  NotFound,
  SelectField,
  TextField,
} from './detail-fields'
import { ChildTestsSection } from './child-tests-section'
import { DurationMsField } from './duration-ms-field'
import { EntryDetailLayout } from './entry-detail-layout'
import { EntryMediaSection } from './entry-media-section'
import { UnsavedChangesGuard } from './unsaved-changes-guard'

export function FullTestDetail({ id }: { id: string }) {
  const detail = useFullTestDetail(id)

  if (detail.isLoading) return <DetailSkeleton />
  if (detail.error instanceof NotFoundError) return <NotFound />
  if (detail.error || !detail.data) {
    return (
      <ErrorState
        message={detail.error?.message ?? 'Unknown error'}
        onRetry={() => void detail.refetch()}
      />
    )
  }
  return <FullTestForm row={detail.data} />
}

function FullTestForm({ row }: { row: FullTestRow }) {
  const router = useRouter()
  const canGoBack = useCanGoBack()
  const { isAdmin, isLoading: roleLoading } = useIsAdmin()
  const updateTest = useUpdateTest('full')
  const canEdit = isAdmin && !roleLoading

  const form = useForm<FullTestFormInput, unknown, FullTestFormValues>({
    resolver: zodResolver(fullTestFormSchema),
    defaultValues: toFullTestDefaults(row),
  })

  // Re-sync after a save bumps version (query invalidation refetches the row).
  useEffect(() => {
    form.reset(toFullTestDefaults(row))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row])

  const goBack = () => {
    if (canGoBack) router.history.back()
    else void router.navigate({ to: '/entry' })
  }

  const save = (andFinish: boolean) =>
    form.handleSubmit(async (values) => {
      try {
        await updateTest.mutateAsync({
          id: row.id,
          version: row.version,
          payload: toFullTestPayload(values),
        })
        toast.success('Saved')
        if (andFinish) goBack()
      } catch (e) {
        if (e instanceof ConflictError) {
          toast.error(e.message, {
            action: {
              label: 'Reload',
              onClick: () => window.location.reload(),
            },
          })
        } else {
          toast.error(e instanceof Error ? e.message : 'Save failed')
        }
      }
    })()

  const disabled = !canEdit || updateTest.isPending

  return (
    <EntryDetailLayout
      title={row.name ?? 'Full test'}
      status={row.document_status}
      audit={{
        version: row.version,
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedBy: row.updated_by,
        updatedAt: row.updated_at,
      }}
      canEdit={canEdit}
      isSaving={updateTest.isPending}
      isDirty={form.formState.isDirty}
      onBack={goBack}
      onSave={() => void save(false)}
      onSaveAndFinish={() => void save(true)}
    >
      <UnsavedChangesGuard
        when={form.formState.isDirty && !updateTest.isPending}
      />
      <Form {...form}>
        <form className='flex max-w-3xl flex-col gap-6'>
          <Card>
            <CardHeader>
              <CardTitle>Basics</CardTitle>
            </CardHeader>
            <CardContent className='grid gap-4 sm:grid-cols-2'>
              <TextField
                control={form.control}
                name='name'
                label='Name'
                disabled={disabled}
                className='sm:col-span-2'
              />
              <SelectField
                control={form.control}
                name='test_type'
                label='Test type'
                items={fullTestTypeOptions}
                disabled={disabled}
              />
              <SelectField
                control={form.control}
                name='parent_test_type'
                label='Parent test type'
                items={parentTestTypeOptions}
                disabled={disabled}
              />
              <SelectField
                control={form.control}
                name='level'
                label='Level'
                items={levelOptions}
                disabled={disabled}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Numbers</CardTitle>
            </CardHeader>
            <CardContent className='grid gap-4 sm:grid-cols-2'>
              <TextField
                control={form.control}
                name='total_question'
                label='Total questions'
                disabled={disabled}
              />
              <DurationMsField
                control={form.control}
                name='duration_in_second'
                label='Duration'
                disabled={disabled}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Status & source</CardTitle>
            </CardHeader>
            <CardContent className='grid gap-4 sm:grid-cols-2'>
              <SelectField
                control={form.control}
                name='document_status'
                label='Status'
                items={fullDocumentStatusOptions}
                disabled={disabled}
              />
              <TextField
                control={form.control}
                name='content_access_type'
                label='Access type'
                disabled={disabled}
              />
              <TextField
                control={form.control}
                name='base_source'
                label='Base source'
                disabled={disabled}
              />
              <TextField
                control={form.control}
                name='base_id'
                label='Base id'
                disabled={disabled}
              />
            </CardContent>
          </Card>

          <ChildTestsSection
            testType={row.test_type}
            excludeId={row.id}
            childIds={form.watch('all_test_ids') ?? []}
            disabled={disabled}
            onChange={(ids) =>
              form.setValue('all_test_ids', ids, { shouldDirty: true })
            }
          />

          <EntryMediaSection
            canEdit={canEdit && !updateTest.isPending}
            items={[
              {
                label: 'Cover',
                media: form.watch('cover') ?? undefined,
                kind: 'image',
                onReplaced: (m) =>
                  form.setValue('cover', m, { shouldDirty: true }),
              },
            ]}
          />
        </form>
      </Form>
    </EntryDetailLayout>
  )
}
