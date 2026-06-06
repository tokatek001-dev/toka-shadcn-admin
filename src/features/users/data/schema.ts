import { z } from 'zod'

export const userRoleValues = ['admin', 'user', 'anonymous'] as const
export type UserRole = (typeof userRoleValues)[number]

// Rows come from the admin_list_user_profiles RPC (snake_case, with a
// total_count window column repeated on every row).
const userRowSchema = z
  .object({
    id: z.string(),
    display_name: z.string().nullable(),
    nick_name: z.string().nullable(),
    avatar_url: z.string().nullable(),
    email: z.string(),
    role: z.enum(userRoleValues),
    created_at: z.coerce.date(),
    updated_at: z.coerce.date(),
    total_count: z.number(),
  })
  .transform((row) => ({
    id: row.id,
    displayName: row.display_name ?? '',
    nickName: row.nick_name ?? '',
    avatarUrl: row.avatar_url,
    email: row.email,
    role: row.role,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    totalCount: row.total_count,
  }))

export const userRowsSchema = z.array(userRowSchema)
export type UserWithCount = z.infer<typeof userRowSchema>
export type User = Omit<UserWithCount, 'totalCount'>
