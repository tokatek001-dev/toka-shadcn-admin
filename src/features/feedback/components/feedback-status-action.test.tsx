import { type Row } from '@tanstack/react-table'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { type Feedback } from '../data/schema'
import { FeedbackStatusAction } from './feedback-status-action'

const { updateMutateAsync } = vi.hoisted(() => ({ updateMutateAsync: vi.fn() }))
updateMutateAsync.mockResolvedValue(undefined)

vi.mock('../hooks/use-feedback-mutations', () => ({
  useUpdateFeedbackStatus: () => ({
    mutateAsync: updateMutateAsync,
    isPending: false,
  }),
}))

const FEEDBACK: Feedback = {
  id: 'fb-1',
  userId: 'u-1',
  content: 'Please add dark mode',
  status: 'NOT_STARTED',
  createdAt: new Date('2026-06-01'),
  updatedAt: new Date('2026-06-01'),
  submitterName: 'Hậu Lư',
  submitterAvatarUrl: null,
}

const row = { original: FEEDBACK } as Row<Feedback>

describe('FeedbackStatusAction', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the three statuses with the current one checked', async () => {
    const { getByRole } = await render(<FeedbackStatusAction row={row} />)

    await userEvent.click(getByRole('button', { name: /open menu/i }))

    await expect
      .element(getByRole('menuitemradio', { name: /not started/i }))
      .toBeChecked()
    await expect
      .element(getByRole('menuitemradio', { name: /in progress/i }))
      .toBeInTheDocument()
    await expect
      .element(getByRole('menuitemradio', { name: /completed/i }))
      .toBeInTheDocument()
  })

  it('updates the status when another option is chosen', async () => {
    const { getByRole } = await render(<FeedbackStatusAction row={row} />)

    await userEvent.click(getByRole('button', { name: /open menu/i }))
    await userEvent.click(getByRole('menuitemradio', { name: /in progress/i }))

    await vi.waitFor(() => expect(updateMutateAsync).toHaveBeenCalledOnce())
    expect(updateMutateAsync).toHaveBeenCalledWith({
      id: 'fb-1',
      status: 'IN_PROGRESS',
    })
  })

  it('does nothing when the current status is re-selected', async () => {
    const { getByRole } = await render(<FeedbackStatusAction row={row} />)

    await userEvent.click(getByRole('button', { name: /open menu/i }))
    await userEvent.click(getByRole('menuitemradio', { name: /not started/i }))

    expect(updateMutateAsync).not.toHaveBeenCalled()
  })
})
