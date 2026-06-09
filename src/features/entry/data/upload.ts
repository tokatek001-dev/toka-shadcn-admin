import { supabase } from '@/lib/supabase'
import { type MediaObject } from './schema'

const env = import.meta.env as Record<string, string | undefined>

/** Backend caps uploads at 100 MB (r2_max_upload_size). */
export const MAX_UPLOAD_BYTES = 104_857_600

type UploadedFile = {
  path: string
  size: number
  contentType: string
}

export function isUploadConfigured(): boolean {
  return !!env.VITE_UPLOAD_API_URL
}

/**
 * Upload a file to the R2 upload API (`POST /api/files?prefix=entry`).
 * Always sends the Supabase access token — the deployed instance currently
 * runs AUTH_ENABLED=false, but enabling auth must be a client no-op.
 */
export async function uploadMedia(file: File): Promise<UploadedFile> {
  const base = env.VITE_UPLOAD_API_URL
  if (!base) throw new Error('VITE_UPLOAD_API_URL is not configured')
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('File quá lớn (giới hạn 100 MB)')
  }

  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`

  const body = new FormData()
  body.append('file', file)

  const res = await fetch(
    `${base.replace(/\/+$/, '')}/api/files?prefix=entry`,
    { method: 'POST', headers, body }
  )
  if (!res.ok) {
    let message = `Upload failed (${res.status})`
    try {
      const err = (await res.json()) as { detail?: unknown }
      if (typeof err.detail === 'string') message = err.detail
    } catch {
      // keep the status-based message
    }
    throw new Error(message)
  }

  const json = (await res.json()) as {
    status?: string
    data?: { path?: string; size?: number; content_type?: string }
  }
  if (json.status !== 'success' || !json.data?.path) {
    throw new Error('Unexpected upload response')
  }
  return {
    path: json.data.path,
    size: json.data.size ?? file.size,
    contentType: json.data.content_type ?? file.type,
  }
}

/**
 * Merge an upload result into an existing media jsonb object, preserving its
 * key shape (part-level media uses camelCase extras like `fileType`; media
 * inside question_groups uses snake_case like `file_type`). Only
 * name/path/size are overwritten.
 */
export function mergeMediaObject(
  existing: MediaObject | null | undefined,
  file: File,
  uploaded: UploadedFile
): NonNullable<MediaObject> {
  return {
    alt: null,
    caption: null,
    ...(existing ?? {}),
    name: file.name,
    path: uploaded.path,
    size: uploaded.size,
  }
}
