import z from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { Feedback } from '@/features/feedback'
import { feedbackStatusValues } from '@/features/feedback/data/schema'

const feedbackSearchSchema = z.object({
  page: z.number().optional().catch(1),
  pageSize: z.number().optional().catch(10),
  // Facet filter
  status: z.array(z.enum(feedbackStatusValues)).optional().catch([]),
  // Text search over feedback content (server-side)
  search: z.string().optional().catch(''),
})

export const Route = createFileRoute('/_authenticated/feedback/')({
  validateSearch: feedbackSearchSchema,
  component: Feedback,
})
