import { z } from 'zod'

// Enum-ish values mirror the CHECK constraints on the Supabase tables.
export const partValues = [
  'PART_1',
  'PART_2',
  'PART_3',
  'PART_4',
  'PART_5',
  'PART_6',
  'PART_7',
] as const

export const partTestTypeValues = ['LISTENING', 'READING'] as const

export const levelValues = [
  'TOEIC_300',
  'TOEIC_450',
  'TOEIC_600',
  'TOEIC_750',
  'TOEIC_900',
] as const

export const fullTestTypeValues = ['FTL', 'FTR', 'FT'] as const

export const parentTestTypeValues = ['SKILL_TEST', 'FULL_TEST'] as const

export const partDocumentStatusValues = [
  'PUBLISHED',
  'EDITING',
  'DRAFT',
] as const

export const fullDocumentStatusValues = [
  'EDITING',
  'PUBLISHED',
  'DRAFT',
] as const

// Media objects (cover, audio, ex_image) are loose jsonb blobs; we only care
// about `path` (CDN-relative) and `name` here. Extra keys pass through.
export const mediaObjectSchema = z
  .looseObject({
    name: z.string().nullable().optional(),
    path: z.string().nullable().optional(),
  })
  .nullable()
export type MediaObject = z.infer<typeof mediaObjectSchema>

// Rows come from PostgREST: enum-constrained columns are nullable varchars,
// so we keep them as plain strings and let the UI map them to labels.
const partTestSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  part: z.string().nullable(),
  test_type: z.string().nullable(),
  level: z.string().nullable(),
  total_question: z.number().nullable(),
  duration_in_second: z.number().nullable(),
  document_status: z.string().nullable(),
  content_access_type: z.string().nullable(),
  cover: mediaObjectSchema,
  version: z.number(),
  created_by: z.string(),
  updated_by: z.string(),
  updated_at: z.string().nullable(),
})
export type PartTest = z.infer<typeof partTestSchema>

const fullTestSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  test_type: z.string().nullable(),
  parent_test_type: z.string().nullable(),
  level: z.string().nullable(),
  total_question: z.number().nullable(),
  duration_in_second: z.number().nullable(),
  document_status: z.string().nullable(),
  content_access_type: z.string().nullable(),
  cover: mediaObjectSchema,
  version: z.number(),
  created_by: z.string(),
  updated_by: z.string(),
  updated_at: z.string().nullable(),
})
export type FullTest = z.infer<typeof fullTestSchema>

export const partTestRowsSchema = z.array(partTestSchema)
export const fullTestRowsSchema = z.array(fullTestSchema)

// Columns selected from Supabase for each table (avoid pulling heavy jsonb;
// `cover` is the only jsonb column and stays small).
export const PART_TEST_SELECT =
  'id, name, part, test_type, level, total_question, duration_in_second, document_status, content_access_type, cover, version, created_by, updated_by, updated_at'

export const FULL_TEST_SELECT =
  'id, name, test_type, parent_test_type, level, total_question, duration_in_second, document_status, content_access_type, cover, version, created_by, updated_by, updated_at'

// Shared option lists for toolbar faceted filters.
export const partOptions = partValues.map((value) => ({
  label: value.replace('_', ' '),
  value,
}))

export const partTestTypeOptions = partTestTypeValues.map((value) => ({
  label: value.charAt(0) + value.slice(1).toLowerCase(),
  value,
}))

export const levelOptions = levelValues.map((value) => ({
  label: value.replace('_', ' '),
  value,
}))

export const fullTestTypeOptions = fullTestTypeValues.map((value) => ({
  label: value,
  value,
}))

export const parentTestTypeOptions = parentTestTypeValues.map((value) => ({
  label: value
    .replace('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase()),
  value,
}))

export const partDocumentStatusOptions = partDocumentStatusValues.map(
  (value) => ({
    label: value.charAt(0) + value.slice(1).toLowerCase(),
    value,
  })
)

export const fullDocumentStatusOptions = fullDocumentStatusValues.map(
  (value) => ({
    label: value.charAt(0) + value.slice(1).toLowerCase(),
    value,
  })
)

// Server-side sortable columns, shared by both tabs. Anything else in the
// URL falls back to the default `updated_at desc`.
export const sortableEntryColumns = [
  'name',
  'total_question',
  'duration_in_second',
  'updated_at',
  'version',
] as const
