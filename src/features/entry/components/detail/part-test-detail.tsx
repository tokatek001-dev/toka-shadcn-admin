import { useEffect, useState } from 'react'
import {
  type Control,
  type FieldArrayPath,
  useFieldArray,
  useForm,
} from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
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
import { newGroup } from '../../data/question-groups'
import {
  levelOptions,
  partDocumentStatusOptions,
  partOptions,
  partTestTypeOptions,
} from '../../data/schema'
import { NotFoundError, usePartTestDetail } from '../../hooks/use-test-detail'
import { ConflictError, useUpdateTest } from '../../hooks/use-update-test'
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
import { GroupPanel, GroupsNav } from './question-group-editor'
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

  // 'general' = the metadata/media sections; a number selects that group panel.
  const [section, setSection] = useState<number | 'general'>('general')

  const groupsArray = useFieldArray({
    control: form.control as unknown as Control<PartTestFormInput>,
    name: 'question_groups' as FieldArrayPath<PartTestFormInput>,
  })
  const watchedGroups = form.watch('question_groups')
  const hasGroups = (watchedGroups?.length ?? 0) > 0

  // Re-sync after a save bumps version (query invalidation refetches the row).
  useEffect(() => {
    form.reset(toPartTestDefaults(row))
    setSection('general')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row])

  const goBack = () => {
    if (canGoBack) router.history.back()
    else void router.navigate({ to: '/entry' })
  }

  const addGroup = () => {
    const newIndex = watchedGroups?.length ?? 0
    groupsArray.append(newGroup() as never)
    setSection(newIndex)
  }

  const removeGroup = (i: number) => {
    groupsArray.remove(i)
    setSection('general')
  }

  const save = (andFinish: boolean) =>
    form.handleSubmit(
      async (values) => {
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
      },
      (errors) => {
        // Jump to the first group with a validation error so it's visible.
        const groupErrors = errors.question_groups as Array<unknown> | undefined
        const idx = groupErrors?.findIndex((e) => e != null) ?? -1
        if (idx >= 0) setSection(idx)
        toast.error('Form có lỗi — kiểm tra các trường đánh dấu đỏ')
      }
    )()

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
      sidebar={
        <GroupsNav
          groups={watchedGroups ?? []}
          selected={section}
          onSelect={setSection}
          onAddGroup={canEdit ? addGroup : undefined}
          canEdit={canEdit}
        />
      }
    >
      <UnsavedChangesGuard
        when={form.formState.isDirty && !updateTest.isPending}
      />
      <Form {...form}>
        <form className='flex max-w-3xl flex-col gap-6'>
          <div
            className={section === 'general' ? 'flex flex-col gap-6' : 'hidden'}
          >
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
                <div className='flex flex-col gap-1'>
                  <TextField
                    control={form.control}
                    name='total_question'
                    label='Total questions'
                    disabled={disabled || hasGroups}
                  />
                  {hasGroups && (
                    <span className='text-xs text-muted-foreground'>
                      Tự tính từ question groups khi lưu
                    </span>
                  )}
                </div>
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
              canEdit={canEdit && !updateTest.isPending}
              items={[
                {
                  label: 'Cover',
                  media: form.watch('cover') ?? undefined,
                  kind: 'image',
                  onReplaced: (m) =>
                    form.setValue('cover', m, { shouldDirty: true }),
                },
                {
                  label: 'Example image',
                  media: form.watch('ex_image') ?? undefined,
                  kind: 'image',
                  onReplaced: (m) =>
                    form.setValue('ex_image', m, { shouldDirty: true }),
                },
                {
                  label: 'Audio',
                  media: form.watch('audio') ?? undefined,
                  kind: 'file',
                  onReplaced: (m) =>
                    form.setValue('audio', m, { shouldDirty: true }),
                },
              ]}
            />
          </div>

          {typeof section === 'number' && watchedGroups?.[section] && (
            <GroupPanel
              form={form}
              groupIndex={section}
              disabled={disabled}
              onRemoveGroup={canEdit ? () => removeGroup(section) : undefined}
            />
          )}
        </form>
      </Form>
    </EntryDetailLayout>
  )
}
