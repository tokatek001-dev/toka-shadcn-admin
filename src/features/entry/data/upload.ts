import { type MediaObject } from './schema'

export class UploadNotConfiguredError extends Error {
  constructor() {
    super('Upload chưa được cấu hình')
  }
}

/**
 * Seam for media upload (2b-infra). The destination (Supabase Storage vs the
 * DOL CDN upload API) is undecided; until it lands this always throws and the
 * UI keeps its Replace buttons disabled.
 */
export function uploadMedia(_file: File): Promise<MediaObject> {
  return Promise.reject(new UploadNotConfiguredError())
}

export const isUploadConfigured = false
