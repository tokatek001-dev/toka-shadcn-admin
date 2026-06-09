import { describe, expect, it } from 'vitest'
import {
  childSlotTable,
  childSlots,
  orderedIdsFromSlots,
  slotKeyForChild,
} from './child-test-slots'

describe('childSlots', () => {
  it('maps FTL to four listening part slots', () => {
    const slots = childSlots('FTL')
    expect(slots.map((s) => s.key)).toEqual([
      'PART_1',
      'PART_2',
      'PART_3',
      'PART_4',
    ])
    expect(slots.every((s) => s.testType === 'LISTENING')).toBe(true)
    expect(childSlotTable(slots)).toBe('data_entry_part_test')
  })

  it('maps FTR to three reading part slots (5-7)', () => {
    expect(childSlots('FTR').map((s) => s.key)).toEqual([
      'PART_5',
      'PART_6',
      'PART_7',
    ])
  })

  it('maps FT to reading + listening full-test slots', () => {
    const slots = childSlots('FT')
    expect(slots.map((s) => [s.key, s.label])).toEqual([
      ['FTR', 'Reading'],
      ['FTL', 'Listening'],
    ])
    expect(childSlotTable(slots)).toBe('data_entry_full_test')
  })

  it('returns no slots for unknown types', () => {
    expect(childSlots('SOMETHING')).toEqual([])
    expect(childSlots(null)).toEqual([])
    expect(childSlotTable([])).toBeNull()
  })
})

describe('slotKeyForChild', () => {
  it('keys part-test children by part', () => {
    const slots = childSlots('FTL')
    expect(slotKeyForChild(slots, { part: 'PART_3' })).toBe('PART_3')
    expect(slotKeyForChild(slots, { part: 'PART_9' })).toBeNull()
  })

  it('keys FT children by test_type', () => {
    const slots = childSlots('FT')
    expect(slotKeyForChild(slots, { test_type: 'FTL' })).toBe('FTL')
    expect(slotKeyForChild(slots, { test_type: 'FTR' })).toBe('FTR')
  })
})

describe('orderedIdsFromSlots', () => {
  it('emits ids in slot order, skipping empty slots', () => {
    const slots = childSlots('FTL')
    expect(
      orderedIdsFromSlots(slots, {
        PART_1: 'a',
        PART_3: 'c',
        // PART_2 and PART_4 empty
      })
    ).toEqual(['a', 'c'])
  })

  it('preserves slot order regardless of insertion order', () => {
    const slots = childSlots('FT')
    expect(orderedIdsFromSlots(slots, { FTL: 'l', FTR: 'r' })).toEqual([
      'r',
      'l',
    ])
  })
})
