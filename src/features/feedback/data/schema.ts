import { z } from 'zod'

export const feedbackStatusValues = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'COMPLETED',
] as const
export type FeedbackStatus = (typeof feedbackStatusValues)[number]

// Rows come from PostgREST with an embedded user_profiles join (nullable if
// the profile is missing).
const feedbackRowSchema = z
  .object({
    id: z.string(),
    user_id: z.string(),
    content: z.string(),
    status: z.enum(feedbackStatusValues),
    created_at: z.coerce.date(),
    updated_at: z.coerce.date(),
    user_profiles: z
      .object({
        display_name: z.string().nullable(),
        avatar_url: z.string().nullable(),
      })
      .nullable(),
  })
  .transform((row) => ({
    id: row.id,
    userId: row.user_id,
    content: row.content,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    submitterName: row.user_profiles?.display_name ?? 'Unknown user',
    submitterAvatarUrl: row.user_profiles?.avatar_url ?? null,
  }))

export const feedbackRowsSchema = z.array(feedbackRowSchema)
export type Feedback = z.infer<typeof feedbackRowSchema>
