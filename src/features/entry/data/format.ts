import { format } from 'date-fns'

/**
 * Format a duration as `mm:ss`.
 *
 * Despite its name, `duration_in_second` in the data_entry tables stores
 * MILLISECONDS (e.g. 907000 for a ~15min Part 4 audio), so convert first.
 * - 907000 -> "15:07"
 * - 0      -> "00:00"
 * - null/undefined -> "–"
 */
export function formatDuration(milliseconds: number | null | undefined): string {
  if (milliseconds == null || Number.isNaN(milliseconds)) return '–'
  const total = Math.max(0, Math.floor(milliseconds / 1000))
  const minutes = Math.floor(total / 60)
  const secs = total % 60
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

/**
 * Format an ISO timestamp as `MMM DD, YYYY`. Falls back gracefully when the
 * value is missing or unparseable.
 */
export function formatUpdatedAt(value: string | null | undefined): string {
  if (!value) return '–'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Invalid date'
  return format(date, 'MMM dd, yyyy')
}
