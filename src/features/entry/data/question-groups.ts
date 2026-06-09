// Helpers for editing the `question_groups` jsonb of data_entry_part_test.
// All functions are pure; extra/unknown keys always pass through verbatim.

export const OPTION_IDS = ['A', 'B', 'C', 'D', 'E', 'F'] as const
export const MAX_OPTIONS = OPTION_IDS.length
export const MIN_OPTIONS = 2

type AnyOption = { option_id?: string | null } & Record<string, unknown>
type AnyQuestion = {
  options?: AnyOption[] | null
  order_in_part?: number | null
} & Record<string, unknown>
type AnyGroup = {
  questions?: AnyQuestion[] | null
  order?: number | null
  number_of_question?: number | null
  start_part_order?: number | null
  end_part_order?: number | null
} & Record<string, unknown>

/**
 * Recompute all derived ordering/count fields after edits:
 * group.order (0-based), question.order_in_part (1-based, continuous across
 * the whole part), option_id (A…F by index), number_of_question, and the
 * cumulative start/end_part_order per group.
 */
export function normalizeQuestionGroups(groups: AnyGroup[]): {
  groups: AnyGroup[]
  totalQuestions: number
} {
  let counter = 0
  const out = groups.map((group, gi) => {
    const start = counter + 1
    const questions = (group.questions ?? []).map((question) => ({
      ...question,
      order_in_part: ++counter,
      options: (question.options ?? []).map((option, oi) => ({
        ...option,
        option_id: OPTION_IDS[oi] ?? String(oi + 1),
      })),
    }))
    return {
      ...group,
      order: gi,
      questions,
      number_of_question: questions.length,
      start_part_order: start,
      end_part_order: counter,
    }
  })
  return { groups: out, totalQuestions: counter }
}

export function newQuestion() {
  return {
    question_key: crypto.randomUUID(),
    question_text: '',
    options: OPTION_IDS.slice(0, 4).map((id) => ({
      text: '',
      option_id: id as string,
      is_correct: false,
      display_type: null,
    })),
    image: null,
    explanation: null,
    transcripts: null,
    is_valid: true,
    order_in_part: 0,
    start_time_in_milliseconds: null,
    end_time_in_milliseconds: null,
  }
}

export function newGroup() {
  return {
    group_key: crypto.randomUUID(),
    group_title: '',
    passage: { title: null, body: null },
    image: null,
    questions: [] as ReturnType<typeof newQuestion>[],
    group_valid: true,
    has_image: false,
    part_type: null,
    has_passage_title: null,
    passage_templates: null,
    order: 0,
    number_of_question: 0,
    start_part_order: 0,
    end_part_order: 0,
  }
}

type PlateNode = { text?: unknown; children?: PlateNode[] }

/**
 * Best-effort plain-text preview of a serialized Plate rich-text document
 * (the `explanation` field). Never throws: non-JSON input is returned as-is.
 */
export function plateToText(raw: string | null | undefined): string {
  if (!raw) return ''
  let nodes: PlateNode[]
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return String(raw).trim()
    nodes = parsed as PlateNode[]
  } catch {
    return String(raw).trim()
  }
  const blockText = (node: PlateNode): string => {
    if (typeof node.text === 'string') return node.text
    return (node.children ?? []).map(blockText).join('')
  }
  return nodes.map(blockText).join('\n').trim()
}
