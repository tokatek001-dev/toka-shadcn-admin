import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { Entry } from '@/features/entry'

const entrySearchSchema = z.object({
  // Tab state. Invalid values fall back to the default 'part_tests' tab.
  tab: z
    .union([z.literal('part_tests'), z.literal('full_tests')])
    .optional()
    .catch('part_tests'),
  page: z.number().optional().catch(1),
  pageSize: z.number().optional().catch(20),
  // Text search (by name)
  name: z.string().optional().catch(''),
  // Faceted filters (arrays). Shared between tabs by key; each tab only reads
  // the keys relevant to it.
  part: z.array(z.string()).optional().catch([]),
  test_type: z.array(z.string()).optional().catch([]),
  level: z.array(z.string()).optional().catch([]),
  parent_test_type: z.array(z.string()).optional().catch([]),
  document_status: z.array(z.string()).optional().catch([]),
  // Server-side sorting; invalid values fall back to updated_at desc in the
  // table layer (allowedColumns whitelist).
  sortBy: z.string().optional().catch(undefined),
  sortDesc: z.boolean().optional().catch(undefined),
})

export const Route = createFileRoute('/_authenticated/entry/')({
  validateSearch: entrySearchSchema,
  component: Entry,
})
