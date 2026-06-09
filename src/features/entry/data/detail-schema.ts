import { z } from 'zod'
import { normalizeQuestionGroups } from './question-groups'
import { mediaObjectSchema, type MediaObject } from './schema'

export type EntryKind = 'part' | 'full'

// ---------- DB row parsers (select('*')) ----------

// Loose group/question parse: the editor reads titles/passages/questions; all
// other jsonb keys (transcripts, templates, flags, explanation) pass through.
const questionGroupPreviewSchema = z.looseObject({
  group_key: z.string().optional(),
  group_title: z.string().nullable().optional(),
  number_of_question: z.number().nullable().optional(),
  passage: z
    .looseObject({
      title: z.string().nullable().optional(),
      body: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  image: mediaObjectSchema.optional(),
  questions: z.array(z.looseObject({})).nullable().optional(),
})

export const partTestDetailSchema = z.looseObject({
  id: z.string(),
  base_id: z.string().nullable(),
  name: z.string().nullable(),
  part_number: z.number().nullable().optional(),
  start_part_order: z.number().nullable(),
  end_part_order: z.number().nullable(),
  total_question: z.number().nullable(),
  duration_in_second: z.number().nullable(),
  audio_time: z.number().nullable(),
  test_type: z.string().nullable(),
  part: z.string().nullable(),
  level: z.string().nullable(),
  base_source: z.string().nullable(),
  cover: mediaObjectSchema,
  ex_image: mediaObjectSchema,
  audio: mediaObjectSchema,
  directions: z.string().nullable(),
  ex_description: z.string().nullable(),
  question_groups: z.array(questionGroupPreviewSchema).nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
  document_status: z.string(),
  content_access_type: z.string(),
  version: z.number(),
  created_by: z.string(),
  updated_by: z.string(),
  flag_type: z.string(),
})
export type PartTestDetail = z.infer<typeof partTestDetailSchema>

export const fullTestDetailSchema = z.looseObject({
  id: z.string(),
  base_id: z.string().nullable(),
  name: z.string().nullable(),
  test_type: z.string().nullable(),
  level: z.string().nullable(),
  base_source: z.string().nullable(),
  cover: mediaObjectSchema,
  total_question: z.number().nullable(),
  duration_in_second: z.number().nullable(),
  document_status: z.string().nullable(),
  all_test_ids: z.array(z.string()).nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
  parent_test_type: z.string(),
  content_access_type: z.string().nullable(),
  version: z.number(),
  created_by: z.string(),
  updated_by: z.string(),
})
export type FullTestDetail = z.infer<typeof fullTestDetailSchema>

// ---------- editable question_groups (input == output, extras pass through) ----------

const mediaField = z.custom<MediaObject>().nullable().optional()

const editableOptionSchema = z.looseObject({
  text: z.string(),
  option_id: z.string(),
  is_correct: z.boolean(),
})

export const editableQuestionSchema = z
  .looseObject({
    question_key: z.string(),
    question_text: z.string().trim().min(1, 'Question text is required'),
    options: z
      .array(editableOptionSchema)
      .min(2, 'At least 2 options required'),
    image: mediaField,
  })
  .refine((q) => q.options.filter((o) => o.is_correct).length === 1, {
    message: 'Chọn đúng một đáp án đúng',
    path: ['options'],
  })

export const editableQuestionGroupSchema = z.looseObject({
  group_key: z.string(),
  group_title: z.string().nullable(),
  passage: z
    .looseObject({
      title: z.string().nullable(),
      body: z.string().nullable(),
    })
    .nullable(),
  image: mediaField,
  questions: z
    .array(editableQuestionSchema)
    .min(1, 'Group cần ít nhất 1 câu hỏi'),
})
export type EditableQuestionGroup = z.infer<typeof editableQuestionGroupSchema>

// ---------- form schemas (text inputs in, typed payload out) ----------

// Numeric text input: '' → null, otherwise a nonnegative integer.
export const nullableIntString = z
  .string()
  .trim()
  .refine((v) => v === '' || /^\d+$/.test(v), 'Must be a nonnegative integer')
  .transform((v) => (v === '' ? null : Number(v)))

const requiredName = z.string().trim().min(1, 'Name is required')

export const partTestFormSchema = z.object({
  name: requiredName,
  part: z.string().min(1, 'Part is required'),
  test_type: z.string().min(1, 'Test type is required'),
  level: z.string().min(1, 'Level is required'),
  flag_type: z.string().min(1, 'Flag type is required'),
  total_question: nullableIntString,
  start_part_order: nullableIntString,
  end_part_order: nullableIntString,
  duration_in_second: nullableIntString,
  audio_time: nullableIntString,
  directions: z.string(),
  ex_description: z.string(),
  document_status: z.string().min(1, 'Status is required'),
  content_access_type: z.string().trim().min(1, 'Access type is required'),
  base_source: z.string(),
  base_id: z.string(),
  cover: z.custom<MediaObject>().nullable(),
  ex_image: z.custom<MediaObject>().nullable(),
  audio: z.custom<MediaObject>().nullable(),
  question_groups: z.array(editableQuestionGroupSchema).nullable(),
})
export type PartTestFormInput = z.input<typeof partTestFormSchema>
export type PartTestFormValues = z.output<typeof partTestFormSchema>

export const fullTestFormSchema = z.object({
  name: requiredName,
  test_type: z.string().min(1, 'Test type is required'),
  parent_test_type: z.string().min(1, 'Parent type is required'),
  level: z.string().min(1, 'Level is required'),
  total_question: nullableIntString,
  duration_in_second: nullableIntString,
  document_status: z.string().min(1, 'Status is required'),
  content_access_type: z.string().trim().min(1, 'Access type is required'),
  base_source: z.string(),
  base_id: z.string(),
  cover: z.custom<MediaObject>().nullable(),
})
export type FullTestFormInput = z.input<typeof fullTestFormSchema>
export type FullTestFormValues = z.output<typeof fullTestFormSchema>

// ---------- mappers ----------

const str = (v: string | null | undefined) => v ?? ''
const numStr = (v: number | null | undefined) => (v == null ? '' : String(v))

export function toPartTestDefaults(row: PartTestDetail): PartTestFormInput {
  return {
    name: str(row.name),
    part: str(row.part),
    test_type: str(row.test_type),
    level: str(row.level),
    flag_type: row.flag_type,
    total_question: numStr(row.total_question),
    start_part_order: numStr(row.start_part_order),
    end_part_order: numStr(row.end_part_order),
    duration_in_second: numStr(row.duration_in_second),
    audio_time: numStr(row.audio_time),
    directions: str(row.directions),
    ex_description: str(row.ex_description),
    document_status: row.document_status,
    content_access_type: row.content_access_type,
    base_source: str(row.base_source),
    base_id: str(row.base_id),
    cover: row.cover ?? null,
    ex_image: row.ex_image ?? null,
    audio: row.audio ?? null,
    question_groups: row.question_groups
      ? row.question_groups.map((g) => {
          const group = g as Record<string, unknown>
          const passage = group.passage as
            | { title?: string | null; body?: string | null }
            | null
            | undefined
          return {
            ...group,
            group_key: String(group.group_key ?? crypto.randomUUID()),
            group_title: (group.group_title as string | null) ?? '',
            passage: passage
              ? {
                  ...passage,
                  title: passage.title ?? '',
                  body: passage.body ?? '',
                }
              : { title: '', body: '' },
            image: (group.image as MediaObject) ?? null,
            questions: (
              (group.questions as Array<Record<string, unknown>>) ?? []
            ).map((q) => ({
              ...q,
              question_key: String(q.question_key ?? crypto.randomUUID()),
              question_text: String(q.question_text ?? ''),
              options: (
                (q.options as Array<Record<string, unknown>>) ?? []
              ).map((o) => ({
                ...o,
                text: String(o.text ?? ''),
                option_id: String(o.option_id ?? ''),
                is_correct: Boolean(o.is_correct),
              })),
              image: (q.image as MediaObject) ?? null,
            })),
          }
        })
      : null,
  } as PartTestFormInput
}

export function toFullTestDefaults(row: FullTestDetail): FullTestFormInput {
  return {
    name: str(row.name),
    test_type: str(row.test_type),
    parent_test_type: row.parent_test_type,
    level: str(row.level),
    total_question: numStr(row.total_question),
    duration_in_second: numStr(row.duration_in_second),
    document_status: str(row.document_status),
    content_access_type: str(row.content_access_type),
    base_source: str(row.base_source),
    base_id: str(row.base_id),
    cover: row.cover ?? null,
  }
}

// Update payloads: business columns only. Audit columns (version, updated_*)
// are added by the mutation; empty optional text becomes null.
const orNull = (v: string) => (v.trim() === '' ? null : v)

export function toPartTestPayload(values: PartTestFormValues) {
  const base = {
    name: values.name,
    part: values.part,
    test_type: values.test_type,
    level: values.level,
    flag_type: values.flag_type,
    total_question: values.total_question,
    start_part_order: values.start_part_order,
    end_part_order: values.end_part_order,
    duration_in_second: values.duration_in_second,
    audio_time: values.audio_time,
    directions: orNull(values.directions),
    ex_description: orNull(values.ex_description),
    document_status: values.document_status,
    content_access_type: values.content_access_type,
    base_source: orNull(values.base_source),
    base_id: orNull(values.base_id),
    cover: values.cover,
    ex_image: values.ex_image,
    audio: values.audio,
  }
  if (!values.question_groups) return base
  // Recompute orders/counts; total_question is derived from the groups.
  const normalized = normalizeQuestionGroups(
    values.question_groups.map((g) => ({
      ...g,
      group_title: g.group_title?.trim() === '' ? null : g.group_title,
      passage: g.passage
        ? {
            ...g.passage,
            title: g.passage.title?.trim() === '' ? null : g.passage.title,
            body: g.passage.body?.trim() === '' ? null : g.passage.body,
          }
        : null,
    }))
  )
  return {
    ...base,
    question_groups: normalized.groups,
    total_question: normalized.totalQuestions,
  }
}

export function toFullTestPayload(values: FullTestFormValues) {
  return {
    name: values.name,
    test_type: values.test_type,
    parent_test_type: values.parent_test_type,
    level: values.level,
    total_question: values.total_question,
    duration_in_second: values.duration_in_second,
    document_status: values.document_status,
    content_access_type: values.content_access_type,
    base_source: orNull(values.base_source),
    base_id: orNull(values.base_id),
    cover: values.cover,
  }
}
