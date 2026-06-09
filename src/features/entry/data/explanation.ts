// Helpers for the `explanation` field: a serialized Plate/Slate rich-text
// document. The learner app consumes this JSON, so parse/serialize must keep
// every node property — including marks this admin cannot edit — untouched.
import type { BaseEditor } from 'slate'
import type { HistoryEditor } from 'slate-history'
import type { ReactEditor } from 'slate-react'

// Loose node shapes: unknown properties (formula, iconKey, TEXT_COLOR, ids…)
// ride along verbatim.
export type ExplanationElement = {
  type?: string
  children: ExplanationNode[]
  [key: string]: unknown
}
export type ExplanationText = { text: string; [key: string]: unknown }
export type ExplanationNode = ExplanationElement | ExplanationText

declare module 'slate' {
  interface CustomTypes {
    Editor: BaseEditor & ReactEditor & HistoryEditor
    Element: ExplanationElement
    Text: ExplanationText
  }
}

/**
 * Stored string → Slate document. Valid JSON arrays are used as-is; plain
 * strings become a single paragraph; null/empty becomes one empty paragraph.
 */
export function parseExplanation(
  raw: string | null | undefined
): ExplanationNode[] {
  if (!raw || raw.trim() === '')
    return [{ type: 'p', children: [{ text: '' }] }]
  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed) && parsed.length > 0)
      return parsed as ExplanationNode[]
  } catch {
    // not JSON — treat as plain text below
  }
  return [{ type: 'p', children: [{ text: raw.trim() }] }]
}

const hasContent = (node: ExplanationNode): boolean => {
  if (typeof (node as ExplanationText).text === 'string')
    return (node as ExplanationText).text.trim() !== ''
  return ((node as ExplanationElement).children ?? []).some(hasContent)
}

/** Slate document → stored string; an all-empty document stores null. */
export function serializeExplanation(value: ExplanationNode[]): string | null {
  return value.some(hasContent) ? JSON.stringify(value) : null
}

// Palettes observed in production data. CSS values are an admin-side
// approximation — the saved key is the contract with the learner app.
export const COLOR_KEYS = [
  { key: 'blue100', css: '#2f80ed', label: 'Xanh dương' },
  { key: 'green40', css: '#27ae60', label: 'Xanh lá' },
  { key: 'yellow40', css: '#b8860b', label: 'Vàng' },
  { key: 'purple100', css: '#9b51e0', label: 'Tím' },
  { key: 'primary100', css: '#e8590c', label: 'Cam' },
] as const

export const HIGHLIGHT_KEYS = [
  { key: 'green40', css: '#b7efc5', label: 'Nền xanh lá' },
  { key: 'yellow40', css: '#fff3b0', label: 'Nền vàng' },
  { key: 'primary40', css: '#ffd9b3', label: 'Nền cam' },
  { key: 'blue40', css: '#cfe3ff', label: 'Nền xanh dương' },
  { key: 'purple40', css: '#e5d4f8', label: 'Nền tím' },
] as const

export const colorCss = (key: unknown): string | undefined =>
  COLOR_KEYS.find((c) => c.key === key)?.css

export const highlightCss = (key: unknown): string | undefined =>
  HIGHLIGHT_KEYS.find((c) => c.key === key)?.css
