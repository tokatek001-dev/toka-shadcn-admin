import { describe, expect, it } from 'vitest'
import { parseExplanation, serializeExplanation } from './explanation'

// Mirrors real DB data: ids, unknown marks (formula, TEXT_COLOR, firstDelete),
// unknown block (borderShading), nested ul > li > p.
const richDoc = [
  {
    id: 'blk1',
    type: 'p',
    children: [
      { text: 'Câu hỏi:', bold: true },
      { text: ' keyword ', colorKey: 'blue100', annotationText: 'S' },
      { text: 'x = y', formula: true, TEXT_COLOR: '{"colorKey": "red100"}' },
      { text: 'gone', firstDelete: true },
    ],
  },
  {
    id: 'blk2',
    type: 'borderShading',
    children: [
      {
        id: 'blk3',
        type: 'p',
        children: [{ text: 'inside box', highlightKey: 'green40' }],
      },
    ],
  },
  {
    type: 'ul',
    children: [
      { type: 'li', children: [{ type: 'p', children: [{ text: 'item' }] }] },
    ],
  },
]

describe('parseExplanation', () => {
  it('returns a parsed Plate document as-is', () => {
    expect(parseExplanation(JSON.stringify(richDoc))).toEqual(richDoc)
  })

  it('wraps a plain (non-JSON) string in a paragraph', () => {
    expect(parseExplanation('chỉ là text ')).toEqual([
      { type: 'p', children: [{ text: 'chỉ là text' }] },
    ])
  })

  it('returns one empty paragraph for null/empty', () => {
    const empty = [{ type: 'p', children: [{ text: '' }] }]
    expect(parseExplanation(null)).toEqual(empty)
    expect(parseExplanation('')).toEqual(empty)
    expect(parseExplanation(undefined)).toEqual(empty)
  })

  it('returns fresh objects each call (no shared mutable state)', () => {
    expect(parseExplanation(null)).not.toBe(parseExplanation(null))
    expect(parseExplanation(null)[0]).not.toBe(parseExplanation(null)[0])
  })
})

describe('serializeExplanation', () => {
  it('round-trips an untouched document byte-identically', () => {
    const raw = JSON.stringify(richDoc)
    expect(serializeExplanation(parseExplanation(raw))).toBe(raw)
  })

  it('serializes an empty document to null', () => {
    expect(serializeExplanation([{ type: 'p', children: [{ text: '' }] }])).toBeNull()
    expect(
      serializeExplanation([
        { type: 'p', children: [{ text: '  ' }] },
        { type: 'p', children: [{ text: '' }] },
      ])
    ).toBeNull()
  })

  it('upgrades a plain string to Plate JSON', () => {
    const out = serializeExplanation(parseExplanation('plain'))
    expect(out).toBe(JSON.stringify([{ type: 'p', children: [{ text: 'plain' }] }]))
  })
})
