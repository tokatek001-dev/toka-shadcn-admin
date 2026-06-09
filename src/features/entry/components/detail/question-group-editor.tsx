import { useState } from 'react'
import {
  type Control,
  type FieldArrayPath,
  type FieldPath,
  type UseFormReturn,
  useFieldArray,
  useFormState,
  useWatch,
} from 'react-hook-form'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FormControl, FormField, FormItem } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  type PartTestFormInput,
  type PartTestFormValues,
} from '../../data/detail-schema'
import { formatDuration } from '../../data/format'
import {
  MAX_OPTIONS,
  MIN_OPTIONS,
  OPTION_IDS,
  newQuestion,
  plateToText,
} from '../../data/question-groups'
import { type MediaObject } from '../../data/schema'
import { TextField, TextareaField } from './detail-fields'
import { EntryMediaSection } from './entry-media-section'
import { ExplanationEditorDialog } from './explanation-editor-dialog'

type PartForm = UseFormReturn<PartTestFormInput, unknown, PartTestFormValues>

// All field paths below are dynamic (`question_groups.${i}...`); RHF's typed
// paths can't model them through the nullable groups array, so we cast the
// control once and assert each name — the same seam detail-fields.tsx uses.
const asControl = (form: PartForm) =>
  form.control as unknown as Control<PartTestFormInput>
const path = (name: string) => name as FieldPath<PartTestFormInput>
const arrayPath = (name: string) => name as FieldArrayPath<PartTestFormInput>

type NavGroup = {
  group_title?: string | null
  questions?: unknown[] | null
}

export function GroupsNav({
  groups,
  selected,
  onSelect,
  onAddGroup,
  canEdit,
}: {
  groups: NavGroup[]
  selected: number | 'general'
  onSelect: (s: number | 'general') => void
  onAddGroup?: () => void
  canEdit: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-base'>Sections</CardTitle>
      </CardHeader>
      <CardContent className='flex flex-col gap-1'>
        <Button
          type='button'
          variant={selected === 'general' ? 'secondary' : 'ghost'}
          size='sm'
          className='justify-start'
          onClick={() => onSelect('general')}
        >
          Thông tin chung
        </Button>
        {groups.map((g, i) => {
          const count = g.questions?.length ?? 0
          const label = g.group_title?.trim() || `Group ${i + 1}`
          return (
            <Button
              key={i}
              type='button'
              variant={selected === i ? 'secondary' : 'ghost'}
              size='sm'
              className='justify-start truncate'
              onClick={() => onSelect(i)}
            >
              {label} — {count} câu
            </Button>
          )
        })}
        {groups.length === 0 && (
          <span className='px-2 py-1 text-sm text-muted-foreground'>
            No groups
          </span>
        )}
        {canEdit && onAddGroup && (
          <Button
            type='button'
            variant='outline'
            size='sm'
            className='mt-2'
            onClick={onAddGroup}
          >
            <Plus className='me-1 size-3.5' /> Thêm group
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

export function GroupPanel({
  form,
  groupIndex,
  onRemoveGroup,
  disabled,
}: {
  form: PartForm
  groupIndex: number
  onRemoveGroup?: () => void
  disabled: boolean
}) {
  const control = asControl(form)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const questions = useFieldArray({
    control,
    name: arrayPath(`question_groups.${groupIndex}.questions`),
  })
  const groupImage = useWatch({
    control,
    name: path(`question_groups.${groupIndex}.image`),
  }) as MediaObject | undefined

  return (
    <div className='flex max-w-3xl flex-col gap-6'>
      <Card>
        <CardHeader className='flex flex-row items-center justify-between'>
          <CardTitle>Group</CardTitle>
          {!disabled && onRemoveGroup && (
            <>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={() => setConfirmRemove(true)}
              >
                <Trash2 className='me-1 size-3.5' /> Xoá group
              </Button>
              <ConfirmDialog
                open={confirmRemove}
                onOpenChange={setConfirmRemove}
                title='Xoá group này?'
                desc='Tất cả câu hỏi trong group sẽ bị xoá khi bạn lưu.'
                destructive
                confirmText='Xoá'
                handleConfirm={() => {
                  setConfirmRemove(false)
                  onRemoveGroup()
                }}
              />
            </>
          )}
        </CardHeader>
        <CardContent className='grid gap-4'>
          <TextField
            control={form.control}
            name={path(`question_groups.${groupIndex}.group_title`)}
            label='Group title'
            disabled={disabled}
          />
          <TextField
            control={form.control}
            name={path(`question_groups.${groupIndex}.passage.title`)}
            label='Passage title'
            disabled={disabled}
          />
          <TextareaField
            control={form.control}
            name={path(`question_groups.${groupIndex}.passage.body`)}
            label='Passage body'
            disabled={disabled}
          />
        </CardContent>
      </Card>

      <EntryMediaSection
        canEdit={!disabled}
        items={[
          {
            label: 'Group image',
            media: groupImage ?? undefined,
            kind: 'image',
            onReplaced: (m) =>
              form.setValue(
                path(`question_groups.${groupIndex}.image`),
                m as never,
                { shouldDirty: true }
              ),
          },
        ]}
      />

      <div className='flex flex-col gap-4'>
        {questions.fields.map((field, qi) => (
          <QuestionCard
            key={field.id}
            form={form}
            groupIndex={groupIndex}
            questionIndex={qi}
            disabled={disabled}
            onRemove={() => questions.remove(qi)}
          />
        ))}
        {!disabled && (
          <Button
            type='button'
            variant='outline'
            size='sm'
            className='self-start'
            onClick={() => questions.append(newQuestion() as never)}
          >
            <Plus className='me-1 size-3.5' /> Thêm câu hỏi
          </Button>
        )}
      </div>
    </div>
  )
}

function QuestionCard({
  form,
  groupIndex,
  questionIndex,
  disabled,
  onRemove,
}: {
  form: PartForm
  groupIndex: number
  questionIndex: number
  disabled: boolean
  onRemove: () => void
}) {
  const control = asControl(form)
  const base = `question_groups.${groupIndex}.questions.${questionIndex}`
  const [editingExplanation, setEditingExplanation] = useState(false)
  const question = useWatch({ control, name: path(base) }) as
    | Record<string, unknown>
    | undefined
  const explanation = plateToText(question?.explanation as string | null)
  const start = question?.start_time_in_milliseconds as number | null
  const end = question?.end_time_in_milliseconds as number | null
  const image = question?.image as MediaObject | undefined

  return (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between'>
        <CardTitle className='text-base'>Câu {questionIndex + 1}</CardTitle>
        {!disabled && (
          <Button
            type='button'
            variant='ghost'
            size='icon'
            aria-label='Xoá câu hỏi'
            onClick={onRemove}
          >
            <Trash2 className='size-4' />
          </Button>
        )}
      </CardHeader>
      <CardContent className='grid gap-4'>
        <TextareaField
          control={form.control}
          name={path(`${base}.question_text`)}
          label='Question text'
          disabled={disabled}
        />

        <EntryMediaSection
          canEdit={!disabled}
          items={[
            {
              label: 'Question image',
              media: image ?? undefined,
              kind: 'image',
              onReplaced: (m) =>
                form.setValue(path(`${base}.image`), m as never, {
                  shouldDirty: true,
                }),
            },
          ]}
        />

        <OptionsEditor
          form={form}
          groupIndex={groupIndex}
          questionIndex={questionIndex}
          disabled={disabled}
        />

        {(start != null || end != null) && (
          <div className='text-xs text-muted-foreground'>
            Timing: {formatDuration(start)} – {formatDuration(end)}
          </div>
        )}

        <div className='flex flex-col gap-1'>
          <div className='flex items-center justify-between'>
            <Label className='text-muted-foreground'>Explanation</Label>
            {!disabled && (
              <Button
                type='button'
                variant='outline'
                size='sm'
                aria-label='Sửa explanation'
                onClick={() => setEditingExplanation(true)}
              >
                Sửa
              </Button>
            )}
          </div>
          <div className='max-h-32 overflow-auto rounded-md border bg-muted/40 p-2 text-sm whitespace-pre-line'>
            {explanation || (
              <span className='text-muted-foreground italic'>—</span>
            )}
          </div>
          {editingExplanation && (
            <ExplanationEditorDialog
              open={editingExplanation}
              onOpenChange={setEditingExplanation}
              value={(question?.explanation as string | null) ?? null}
              onSave={(s) =>
                form.setValue(path(`${base}.explanation`), s as never, {
                  shouldDirty: true,
                })
              }
            />
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function OptionsEditor({
  form,
  groupIndex,
  questionIndex,
  disabled,
}: {
  form: PartForm
  groupIndex: number
  questionIndex: number
  disabled: boolean
}) {
  const control = asControl(form)
  const optionsName = `question_groups.${groupIndex}.questions.${questionIndex}.options`
  const { fields, append, remove } = useFieldArray({
    control,
    name: arrayPath(optionsName),
  })
  const watched = useWatch({ control, name: path(optionsName) }) as
    | Array<{ is_correct?: boolean }>
    | undefined
  const correctIndex = (watched ?? []).findIndex((o) => o?.is_correct)

  // Read the array-level refine error (exactly-one-correct / >=2 options)
  // directly — a Controller on a field-array path is unsupported by RHF.
  const { errors } = useFormState({ control, name: path(optionsName) })
  const optionsError = (
    (errors?.question_groups as Record<string, unknown>[] | undefined)?.[
      groupIndex
    ] as { questions?: Record<string, unknown>[] } | undefined
  )?.questions?.[questionIndex] as
    | { options?: { message?: string; root?: { message?: string } } }
    | undefined
  const optionsMessage =
    optionsError?.options?.message ?? optionsError?.options?.root?.message

  const setCorrect = (idx: number) => {
    const current = (form.getValues(path(optionsName)) ?? []) as Array<
      Record<string, unknown>
    >
    form.setValue(
      path(optionsName),
      current.map((o, i) => ({ ...o, is_correct: i === idx })) as never,
      { shouldDirty: true }
    )
  }

  return (
    <div className='flex flex-col gap-2'>
      <Label className='text-muted-foreground'>Options</Label>
      <RadioGroup
        className='gap-2'
        disabled={disabled}
        value={correctIndex >= 0 ? String(correctIndex) : undefined}
        onValueChange={(v) => setCorrect(Number(v))}
      >
        {fields.map((field, i) => {
          const id = OPTION_IDS[i] ?? String(i + 1)
          return (
            <div key={field.id} className='flex items-center gap-2'>
              <RadioGroupItem
                value={String(i)}
                disabled={disabled}
                aria-label={`Đáp án đúng ${id}`}
              />
              <FormField
                control={control}
                name={path(`${optionsName}.${i}.text`)}
                render={({ field: f }) => (
                  <FormItem className='flex-1'>
                    <FormControl>
                      <Input
                        disabled={disabled}
                        aria-label={`Option ${id}`}
                        {...f}
                        value={(f.value as string | undefined) ?? ''}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              {!disabled && (
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  aria-label={`Xoá option ${id}`}
                  disabled={fields.length <= MIN_OPTIONS}
                  onClick={() => remove(i)}
                >
                  <Trash2 className='size-4' />
                </Button>
              )}
            </div>
          )
        })}
      </RadioGroup>
      {!disabled && (
        <Button
          type='button'
          variant='outline'
          size='sm'
          className='self-start'
          disabled={fields.length >= MAX_OPTIONS}
          onClick={() =>
            append({
              text: '',
              option_id: '',
              is_correct: false,
              display_type: null,
            } as never)
          }
        >
          <Plus className='me-1 size-3.5' /> Thêm option
        </Button>
      )}
      {/* Surfaces the "exactly one correct" / ">=2 options" refine errors. */}
      {optionsMessage && (
        <p className='text-sm font-medium text-destructive'>{optionsMessage}</p>
      )}
    </div>
  )
}
