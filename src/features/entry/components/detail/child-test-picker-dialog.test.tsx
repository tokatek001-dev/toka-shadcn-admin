import { type ReactElement } from 'react'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { childSlots } from '../../data/child-test-slots'

// The preview button is a router <Link>, so the dialog needs a router context.
// Register the detail routes its links target so hrefs resolve.
function renderWithRouter(ui: ReactElement) {
  const rootRoute = createRootRoute({ component: () => ui })
  const partRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/entry/part-tests/$id',
    component: () => null,
  })
  const fullRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/entry/full-tests/$id',
    component: () => null,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([partRoute, fullRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return render(<RouterProvider router={router as any} />)
}

const { candidatesState } = vi.hoisted(() => ({
  candidatesState: {
    data: [] as unknown[],
    isLoading: false,
    isFetching: false,
    error: null as unknown,
  },
}))

vi.mock('../../hooks/use-child-test-candidates', () => ({
  useSlotCandidates: () => candidatesState,
}))

import { ChildTestPickerDialog } from './child-test-picker-dialog'

const slot = childSlots('FTL')[0] // Part 1

const candidate = (id: string, name: string) => ({
  id,
  name,
  base_id: `TOEIC-L1-${id}`,
  part: 'PART_1',
  level: 'TOEIC_750',
  test_type: 'LISTENING',
  flag_type: 'PRACTICE',
  total_question: 6,
  duration_in_second: 295000,
})

beforeEach(() => {
  candidatesState.data = [candidate('1', 'Listening Test 1 - Part 1'), candidate('2', 'Listening Test 2 - Part 1')]
  candidatesState.isLoading = false
  candidatesState.error = null
})

describe('ChildTestPickerDialog', () => {
  it('lists candidates and confirms the picked id (single-select)', async () => {
    const onConfirm = vi.fn()
    const { getByText, getByRole } = await renderWithRouter(
      <ChildTestPickerDialog
        open
        onOpenChange={() => {}}
        slot={slot}
        excludeId='self'
        value={undefined}
        onConfirm={onConfirm}
      />
    )

    await expect.element(getByText('Listening Test 1 - Part 1')).toBeInTheDocument()
    await expect.element(getByText('Listening Test 2 - Part 1')).toBeInTheDocument()

    // Pick the first row, then confirm.
    await getByRole('button', { name: /^chọn$/i }).first().click()
    await getByRole('button', { name: /^ok$/i }).click()
    expect(onConfirm).toHaveBeenCalledWith('1')
  })

  it('preview link targets the part-test detail route', async () => {
    const { getByRole } = await renderWithRouter(
      <ChildTestPickerDialog
        open
        onOpenChange={() => {}}
        slot={slot}
        excludeId='self'
        value={undefined}
        onConfirm={() => {}}
      />
    )
    const preview = getByRole('link', { name: /xem trước/i }).first()
    await expect.element(preview).toHaveAttribute('href', '/entry/part-tests/1')
  })
})
