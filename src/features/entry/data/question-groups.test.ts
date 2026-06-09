import { describe, expect, it } from 'vitest'
import {
  OPTION_IDS,
  newGroup,
  newQuestion,
  normalizeQuestionGroups,
  plateToText,
} from './question-groups'

const q = (over: Record<string, unknown> = {}) => ({
  question_key: 'k',
  question_text: 'Q?',
  options: [
    { text: 'a', option_id: 'X', is_correct: true },
    { text: 'b', option_id: 'Y', is_correct: false },
  ],
  image: null,
  explanation: null,
  transcripts: null,
  is_valid: true,
  order_in_part: 99,
  start_time_in_milliseconds: 5,
  ...over,
})

describe('normalizeQuestionGroups', () => {
  it('recomputes orders, counts and cumulative ranges across groups', () => {
    const { groups, totalQuestions } = normalizeQuestionGroups([
      { group_key: 'g1', order: 9, questions: [q(), q()], extra: 'keep' },
      { group_key: 'g2', order: 0, questions: [q()] },
    ] as never)

    expect(totalQuestions).toBe(3)
    expect(groups[0]).toMatchObject({
      order: 0, number_of_question: 2, start_part_order: 1, end_part_order: 2,
      extra: 'keep',
    })
    expect(groups[1]).toMatchObject({
      order: 1, number_of_question: 1, start_part_order: 3, end_part_order: 3,
    })
    const g = groups as Array<{ questions: Array<{ order_in_part: number }> }>
    expect(g[0].questions.map((x) => x.order_in_part)).toEqual([1, 2])
    expect(g[1].questions[0].order_in_part).toBe(3)
  })

  it('reassigns option_id alphabetically and preserves question extras', () => {
    const { groups } = normalizeQuestionGroups([
      { group_key: 'g', questions: [q()] },
    ] as never)
    const g = groups as Array<{
      questions: Array<{
        options: Array<{ option_id: string }>
        start_time_in_milliseconds: number
      }>
    }>
    expect(g[0].questions[0].options.map((o) => o.option_id)).toEqual(['A', 'B'])
    expect(g[0].questions[0].start_time_in_milliseconds).toBe(5)
  })

  it('handles empty input', () => {
    expect(normalizeQuestionGroups([])).toEqual({ groups: [], totalQuestions: 0 })
  })
})

describe('OPTION_IDS', () => {
  it('starts with A and has at least 4 entries', () => {
    expect(OPTION_IDS[0]).toBe('A')
    expect(OPTION_IDS.length).toBeGreaterThanOrEqual(4)
  })
})

describe('templates', () => {
  it('newQuestion has 4 empty options, none correct, a fresh key', () => {
    const a = newQuestion()
    const b = newQuestion()
    expect(a.question_key).not.toBe(b.question_key)
    expect(a.options).toHaveLength(4)
    expect(a.options.every((o) => !o.is_correct)).toBe(true)
    expect(a.options.map((o) => o.option_id)).toEqual(['A', 'B', 'C', 'D'])
    expect(a.is_valid).toBe(true)
  })

  it('newGroup is empty and valid with a fresh key', () => {
    const g = newGroup()
    expect(g.questions).toEqual([])
    expect(g.group_valid).toBe(true)
    expect(g.group_key).toBeTruthy()
  })
})

describe('plateToText', () => {
  it('extracts text from serialized Plate JSON', () => {
    const raw = JSON.stringify([
      { type: 'p', children: [{ text: 'Hello ' }, { text: 'world', bold: true }] },
      { type: 'p', children: [{ text: 'Line 2' }] },
    ])
    expect(plateToText(raw)).toBe('Hello world\nLine 2')
  })

  it('returns trimmed raw string for non-JSON input', () => {
    expect(plateToText('  just text  ')).toBe('just text')
  })

  it('returns empty string for null/empty', () => {
    expect(plateToText(null)).toBe('')
    expect(plateToText('')).toBe('')
  })
})
