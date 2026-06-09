import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'

const { resolved, candidates } = vi.hoisted(() => ({
  resolved: { data: [] as unknown[], isLoading: false },
  candidates: {
    data: [] as unknown[],
    isLoading: false,
    isFetching: false,
    error: null as unknown,
  },
}))

vi.mock('../../hooks/use-child-test-candidates', () => ({
  useTestsByIds: () => resolved,
  useSlotCandidates: () => candidates,
}))

import { ChildTestsSection } from './child-tests-section'

const test = (id: string, part: string, name: string, q: number, ms: number) => ({
  id,
  name,
  base_id: `TOEIC-${id}`,
  part,
  level: 'TOEIC_750',
  test_type: 'LISTENING',
  flag_type: 'PRACTICE',
  total_question: q,
  duration_in_second: ms,
})

beforeEach(() => {
  resolved.data = [
    test('p1', 'PART_1', 'L Test - Part 1', 6, 295000),
    test('p2', 'PART_2', 'L Test - Part 2', 25, 601000),
  ]
  resolved.isLoading = false
  candidates.data = []
})

describe('ChildTestsSection', () => {
  it('renders a slot per part, filling resolved children and leaving the rest empty', async () => {
    const screen = await render(
      <ChildTestsSection
        testType='FTL'
        excludeId='self'
        childIds={['p1', 'p2']}
        disabled={false}
        onChange={() => {}}
      />
    )

    await expect
      .element(screen.getByText('L Test - Part 1', { exact: true }))
      .toBeInTheDocument()
    await expect
      .element(screen.getByText('L Test - Part 2', { exact: true }))
      .toBeInTheDocument()
    // 4 listening slots, 2 filled shown in the title
    await expect
      .element(screen.getByText(/Child tests \(2\/4\)/))
      .toBeInTheDocument()
    // Part 3 and Part 4 are empty -> two "Chọn bài" buttons
    expect(screen.getByRole('button', { name: /chọn bài/i }).elements()).toHaveLength(2)
  })

  it('picking a test for an empty slot emits ordered all_test_ids', async () => {
    candidates.data = [test('p3', 'PART_3', 'L Test - Part 3', 39, 1164000)]
    const onChange = vi.fn()
    const screen = await render(
      <ChildTestsSection
        testType='FTL'
        excludeId='self'
        childIds={['p1', 'p2']}
        disabled={false}
        onChange={onChange}
      />
    )

    // Open the first empty slot (Part 3) picker, choose the candidate, confirm.
    await screen.getByRole('button', { name: /chọn bài/i }).first().click()
    await screen.getByRole('button', { name: /^chọn$/i }).first().click()
    await screen.getByRole('button', { name: /^ok$/i }).click()

    expect(onChange).toHaveBeenCalledWith(['p1', 'p2', 'p3'])
  })
})
