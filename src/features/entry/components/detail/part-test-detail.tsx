import { useEffect } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useCanGoBack, useRouter } from '@tanstack/react-router'
import { toast } from 'sonner'
import { useIsAdmin } from '@/hooks/use-is-admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Form } from '@/components/ui/form'
import {
  partTestFormSchema,
  toPartTestDefaults,
  toPartTestPayload,
  type PartTestDetail as PartTestRow,
  type PartTestFormInput,
  type PartTestFormValues,
} from '../../data/detail-schema'
import {
  levelOptions,
  partDocumentStatusOptions,
  partOptions,
  partTestTypeOptions,
} from '../../data/schema'
import { ConflictError, useUpdateTest } from '../../hooks/use-update-test'
import { NotFoundError, usePartTestDetail } from '../../hooks/use-test-detail'
import {
  DetailSkeleton,
  ErrorState,
  NotFound,
  SelectField,
  TextField,
  TextareaField,
} from './detail-fields'
import { DurationMsField } from './duration-ms-field'
import { EntryDetailLayout } from './entry-detail-layout'
import { EntryMediaSection } from './entry-media-section'
import { UnsavedChangesGuard } from './unsaved-changes-guard'

const flagTypeOptions = [
  { label: 'Practice', value: 'PRACTICE' },
  { label: 'Mini', value: 'MINI' },
]

export function PartTestDetail({ id }: { id: string }) {
  const detail = usePartTestDetail(id)

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
  return <PartTestForm row={detail.data} />
}

function PartTestForm({ row }: { row: PartTestRow }) {
  const router = useRouter()
  const canGoBack = useCanGoBack()
  const { isAdmin, isLoading: roleLoading } = useIsAdmin()
  const updateTest = useUpdateTest('part')
  const canEdit = isAdmin && !roleLoading

  const form = useForm<PartTestFormInput, unknown, PartTestFormValues>({
    resolver: zodResolver(partTestFormSchema),
    defaultValues: toPartTestDefaults(row),
  })

  // Re-sync after a save bumps version (query invalidation refetches the row).
  useEffect(() => {
    form.reset(toPartTestDefaults(row))
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
          payload: toPartTestPayload(values),
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
      title={row.name ?? 'Part test'}
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
      sidebar={<GroupsSidebar row={row} />}
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
                name='part'
                label='Part'
                items={partOptions}
                disabled={disabled}
              />
              <SelectField
                control={form.control}
                name='test_type'
                label='Test type'
                items={partTestTypeOptions}
                disabled={disabled}
              />
              <SelectField
                control={form.control}
                name='level'
                label='Level'
                items={levelOptions}
                disabled={disabled}
              />
              <SelectField
                control={form.control}
                name='flag_type'
                label='Flag type'
                items={flagTypeOptions}
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
              <TextField
                control={form.control}
                name='start_part_order'
                label='Start part order'
                disabled={disabled}
              />
              <TextField
                control={form.control}
                name='end_part_order'
                label='End part order'
                disabled={disabled}
              />
              <DurationMsField
                control={form.control}
                name='duration_in_second'
                label='Duration'
                disabled={disabled}
              />
              <DurationMsField
                control={form.control}
                name='audio_time'
                label='Audio time'
                disabled={disabled}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Descriptions</CardTitle>
            </CardHeader>
            <CardContent className='grid gap-4'>
              <TextareaField
                control={form.control}
                name='directions'
                label='Directions'
                disabled={disabled}
              />
              <TextareaField
                control={form.control}
                name='ex_description'
                label='Example description'
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
                items={partDocumentStatusOptions}
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

          <EntryMediaSection
            items={[
              { label: 'Cover', media: row.cover, kind: 'image' },
              { label: 'Example image', media: row.ex_image, kind: 'image' },
              { label: 'Audio', media: row.audio, kind: 'file' },
            ]}
          />
        </form>
      </Form>
    </EntryDetailLayout>
  )
}

function GroupsSidebar({ row }: { row: PartTestRow }) {
  const groups = row.question_groups ?? []
  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-base'>Question groups</CardTitle>
      </CardHeader>
      <CardContent className='flex flex-col gap-1 text-sm'>
        {groups.length === 0 && (
          <span className='text-muted-foreground'>No groups</span>
        )}
        {groups.map((g, i) => (
          <div key={i} className='truncate text-muted-foreground'>
            {g.group_title || `Group ${i + 1}`} —{' '}
            {g.number_of_question ?? g.questions?.length ?? 0} câu
          </div>
        ))}
        {groups.length > 0 && (
          <span className='mt-2 text-xs text-muted-foreground'>
            Chỉnh sửa nội dung câu hỏi ở phase sau
          </span>
        )}
      </CardContent>
    </Card>
  )
}
