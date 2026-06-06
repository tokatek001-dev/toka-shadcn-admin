/**
 * Join a CDN-relative media `path` (e.g. `PUBLIC/MEDIA/foo.png`) onto a base
 * URL, normalizing slashes. Returns `null` when either part is missing so
 * callers can render a placeholder.
 */
export function joinMediaUrl(
  path: string | null | undefined,
  base: string | null | undefined
): string | null {
  if (!path || path.trim() === '') return null
  if (!base || base.trim() === '') return null
  const cleanBase = base.trim().replace(/\/+$/, '')
  const cleanPath = path.trim().replace(/^\/+/, '')
  return `${cleanBase}/${cleanPath}`
}

/**
 * Resolve a media `path` stored in the data_entry tables:
 * - `PUBLIC/...`  → legacy DOL CDN (`VITE_MEDIA_BASE_URL`)
 * - absolute URL  → returned as-is (defensive)
 * - anything else → R2 CDN (`VITE_MEDIA_R2_BASE_URL`)
 * This rule is shared with the other consumers of these tables.
 */
export function mediaUrl(path: string | null | undefined): string | null {
  if (!path || path.trim() === '') return null
  const clean = path.trim()
  if (/^https?:\/\//.test(clean)) return clean
  const env = import.meta.env as Record<string, string | undefined>
  const base = clean.startsWith('PUBLIC/')
    ? env.VITE_MEDIA_BASE_URL
    : env.VITE_MEDIA_R2_BASE_URL
  return joinMediaUrl(clean, base)
}
