// A full test (`data_entry_full_test`) is assembled from ordered child tests.
// The slots are fixed by the full test's own `test_type`:
//   FTL -> 4 LISTENING part tests (Part 1..4)
//   FTR -> 3 READING part tests (Part 5..7)
//   FT  -> 2 child full tests (Reading = FTR, Listening = FTL)
// `all_test_ids` stores the chosen child ids ordered by slot. Each child maps
// back to its slot by `part` (part-test slots) or `test_type` (FT slots).

export type ChildSlotTable = 'data_entry_part_test' | 'data_entry_full_test'

export type ChildSlot = {
  /** Stable slot identity: a part code (PART_1) or a child test_type (FTR). */
  key: string
  label: string
  table: ChildSlotTable
  /** Candidate `test_type` filter. */
  testType: string
  /** Candidate `part` filter (part-test slots only). */
  part?: string
}

export function childSlots(fullTestType: string | null | undefined): ChildSlot[] {
  switch (fullTestType) {
    case 'FTL':
      return [1, 2, 3, 4].map((n) => ({
        key: `PART_${n}`,
        label: `Part ${n}`,
        table: 'data_entry_part_test',
        testType: 'LISTENING',
        part: `PART_${n}`,
      }))
    case 'FTR':
      return [5, 6, 7].map((n) => ({
        key: `PART_${n}`,
        label: `Part ${n}`,
        table: 'data_entry_part_test',
        testType: 'READING',
        part: `PART_${n}`,
      }))
    case 'FT':
      return [
        {
          key: 'FTR',
          label: 'Reading',
          table: 'data_entry_full_test',
          testType: 'FTR',
        },
        {
          key: 'FTL',
          label: 'Listening',
          table: 'data_entry_full_test',
          testType: 'FTL',
        },
      ]
    default:
      return []
  }
}

/** The table all slots of a full test query (uniform per full-test type). */
export function childSlotTable(slots: ChildSlot[]): ChildSlotTable | null {
  return slots[0]?.table ?? null
}

type ChildLike = { part?: string | null; test_type?: string | null }

/** Which slot a resolved child belongs to (by part, or test_type for FT). */
export function slotKeyForChild(
  slots: ChildSlot[],
  child: ChildLike
): string | null {
  for (const s of slots) {
    if (s.table === 'data_entry_part_test') {
      if (child.part && s.part === child.part) return s.key
    } else if (child.test_type && s.testType === child.test_type) {
      return s.key
    }
  }
  return null
}

/** Flatten a slotKey -> id map back into an ordered, gap-free id array. */
export function orderedIdsFromSlots(
  slots: ChildSlot[],
  byKey: Record<string, string | undefined>
): string[] {
  return slots
    .map((s) => byKey[s.key])
    .filter((v): v is string => typeof v === 'string' && v !== '')
}
