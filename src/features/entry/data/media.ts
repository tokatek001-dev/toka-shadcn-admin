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
 * Resolve a media `path` stored in the data_entry tables against the media
 * CDN. The base URL comes from `VITE_MEDIA_BASE_URL` — the CDN host is
 * expected to change, so never hardcode it elsewhere.
 */
export function mediaUrl(path: string | null | undefined): string | null {
  const base = (import.meta.env as Record<string, string | undefined>)
    .VITE_MEDIA_BASE_URL
  return joinMediaUrl(path, base)
}
