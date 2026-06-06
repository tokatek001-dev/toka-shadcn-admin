import { CircleCheck, CircleDashed, LoaderCircle } from 'lucide-react'
import { type FeedbackStatus } from './schema'

export const feedbackStatuses = [
  { label: 'Not Started', value: 'NOT_STARTED', icon: CircleDashed },
  { label: 'In Progress', value: 'IN_PROGRESS', icon: LoaderCircle },
  { label: 'Completed', value: 'COMPLETED', icon: CircleCheck },
] as const

export const feedbackStatusColors = new Map<FeedbackStatus, string>([
  ['NOT_STARTED', 'bg-neutral-300/40 border-neutral-300'],
  [
    'IN_PROGRESS',
    'bg-sky-200/40 text-sky-900 dark:text-sky-100 border-sky-300',
  ],
  [
    'COMPLETED',
    'bg-teal-100/30 text-teal-900 dark:text-teal-200 border-teal-200',
  ],
])
