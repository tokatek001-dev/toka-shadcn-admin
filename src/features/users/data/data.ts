import { Ghost, Shield, UserRound } from 'lucide-react'
import { type UserRole } from './schema'

export const roleColors = new Map<UserRole, string>([
  ['admin', 'bg-sky-200/40 text-sky-900 dark:text-sky-100 border-sky-300'],
  ['user', 'bg-teal-100/30 text-teal-900 dark:text-teal-200 border-teal-200'],
  ['anonymous', 'bg-neutral-300/40 border-neutral-300'],
])

export const roles = [
  { label: 'Admin', value: 'admin', icon: Shield },
  { label: 'User', value: 'user', icon: UserRound },
  { label: 'Anonymous', value: 'anonymous', icon: Ghost },
] as const

// Roles an admin can assign from the dialogs ('anonymous' is system-managed).
export const assignableRoles = roles.filter((r) => r.value !== 'anonymous')
