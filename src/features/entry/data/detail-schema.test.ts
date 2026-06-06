import { describe, expect, it } from 'vitest'
import {
  fullTestDetailSchema,
  nullableIntString,
  partTestDetailSchema,
  partTestFormSchema,
  toPartTestDefaults,
  toPartTestPayload,
} from './detail-schema'

const basePartRow = {
  id: 'c0a8666f-0000-0000-0000-000000000001',
  base_id: 'legacy-1',
  name: 'ETS Part 4 Test',
  part_number: 4,
  start_part_order: 71,
  end_part_order: 100,
  total_question: 30,
  duration_in_second: 907000,
  audio_time: 907000,
  test_type: 'LISTENING',
  part: 'PART_4',
  level: 'TOEIC_600',
  base_source: 'ETS',
  cover: { name: 'c.png', path: 'PUBLIC/MEDIA/c.png', extra: 1 },
  ex_image: null,
  audio: null,
  directions: 'Listen carefully.',
  ex_description: null,
  knowledge_codes: null,
  transcript_characters: null,
  question_groups: [
    { group_title: 'Group A', number_of_question: 3, questions: [{}, {}, {}] },
  ],
  reading_part: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
  document_status: 'PUBLISHED',
  content_access_type: 'FREE',
  version: 3,
  created_by: 'system',
  updated_by: 'system',
  flag_type: 'PRACTICE',
}

describe('partTestDetailSchema', () => {
  it('parses a full row and keeps question group titles', () => {
    const row = partTestDetailSchema.parse(basePartRow)
    expect(row.version).toBe(3)
    expect(row.question_groups?.[0]?.group_title).toBe('Group A')
  })

  it('tolerates null jsonb columns', () => {
    const row = partTestDetailSchema.parse({
      ...basePartRow,
      cover: null,
      question_groups: null,
    })
    expect(row.cover).toBeNull()
    expect(row.question_groups).toBeNull()
  })
})

describe('fullTestDetailSchema', () => {
  it('parses all_test_ids as a string array', () => {
    const row = fullTestDetailSchema.parse({
      id: 'c0a8666f-0000-0000-0000-000000000002',
      base_id: null,
      name: 'Full Test 1',
      test_type: 'FT',
      level: 'TOEIC_600',
      base_source: null,
      cover: null,
      total_question: 200,
      duration_in_second: 7200000,
      document_status: 'DRAFT',
      content_ids: null,
      all_test_ids: ['a', 'b'],
      created_at: null,
      updated_at: null,
      parent_test_type: 'SKILL_TEST',
      content_access_type: 'FREE',
      version: 1,
      created_by: 'system',
      updated_by: 'system',
    })
    expect(row.all_test_ids).toEqual(['a', 'b'])
  })
})

describe('nullableIntString', () => {
  it('maps empty string to null and numeric strings to numbers', () => {
    expect(nullableIntString.parse('')).toBeNull()
    expect(nullableIntString.parse('  ')).toBeNull()
    expect(nullableIntString.parse('42')).toBe(42)
  })

  it('rejects negatives and non-integers', () => {
    expect(() => nullableIntString.parse('-1')).toThrow()
    expect(() => nullableIntString.parse('1.5')).toThrow()
    expect(() => nullableIntString.parse('abc')).toThrow()
  })
})

describe('part form schema + mappers', () => {
  it('round-trips row → defaults → payload', () => {
    const row = partTestDetailSchema.parse(basePartRow)
    const defaults = toPartTestDefaults(row)
    expect(defaults.name).toBe('ETS Part 4 Test')
    expect(defaults.duration_in_second).toBe('907000')
    const values = partTestFormSchema.parse(defaults)
    const payload = toPartTestPayload(values)
    expect(payload.duration_in_second).toBe(907000)
    expect(payload.name).toBe('ETS Part 4 Test')
    expect(payload).not.toHaveProperty('version')
    expect(payload).not.toHaveProperty('updated_by')
  })

  it('requires a non-empty name', () => {
    const row = partTestDetailSchema.parse(basePartRow)
    const defaults = { ...toPartTestDefaults(row), name: '  ' }
    expect(() => partTestFormSchema.parse(defaults)).toThrow()
  })
})
