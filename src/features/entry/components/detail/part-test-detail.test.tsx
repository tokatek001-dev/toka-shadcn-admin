import { type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { type PartTestDetail as PartTestRow } from '../../data/detail-schema'
import { PartTestDetail } from './part-test-detail'

// --- hoisted mock fns ---
const { detailState, isAdminState, updateState, mutateAsync } = vi.hoisted(
  () => ({
    detailState: {
      data: undefined as unknown,
      isLoading: false,
      error: null as unknown,
      refetch: vi.fn(),
    },
    isAdminState: { isAdmin: true, isLoading: false },
    updateState: { isPending: false },
    mutateAsync: vi.fn(),
  })
)

vi.mock('../../hooks/use-test-detail', async (importOriginal) => {
  const mod =
    await importOriginal<typeof import('../../hooks/use-test-detail')>()
  return { ...mod, usePartTestDetail: () => detailState }
})

vi.mock('../../hooks/use-update-test', async (importOriginal) => {
  const mod =
    await importOriginal<typeof import('../../hooks/use-update-test')>()
  return {
    ...mod,
    useUpdateTest: () => ({ ...updateState, mutateAsync }),
  }
})

vi.mock('@/hooks/use-is-admin', () => ({
  useIsAdmin: () => isAdminState,
}))

// Layout chrome needs sidebar/auth providers that aren't mounted in tests.
vi.mock('@/components/layout/header', () => ({
  Header: ({ children }: { children?: ReactNode }) => (
    <header>{children}</header>
  ),
}))
vi.mock('@/components/profile-dropdown', () => ({
  ProfileDropdown: () => null,
}))
vi.mock('@/components/theme-switch', () => ({
  ThemeSwitch: () => null,
}))

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...mod,
    useRouter: () => ({ history: { back: vi.fn() }, navigate: vi.fn() }),
    useCanGoBack: () => false,
    useBlocker: () => ({
      proceed: undefined,
      reset: undefined,
      status: 'idle',
    }),
    Link: ({ children }: { children?: ReactNode }) => <a>{children}</a>,
  }
})

const row: PartTestRow = {
  id: 'x',
  base_id: null,
  name: 'ETS Part 4',
  part_number: 4,
  start_part_order: 71,
  end_part_order: 100,
  total_question: 30,
  duration_in_second: 907000,
  audio_time: null,
  test_type: 'LISTENING',
  part: 'PART_4',
  level: 'TOEIC_600',
  base_source: null,
  cover: null,
  ex_image: null,
  audio: null,
  directions: null,
  ex_description: null,
  question_groups: [
    {
      group_key: 'grp-a',
      group_title: 'Group A',
      number_of_question: 3,
      questions: [1, 2, 3].map((n) => ({
        question_key: `q${n}`,
        question_text: `Question ${n}?`,
        options: [
          { text: 'a', option_id: 'A', is_correct: n === 1 },
          { text: 'b', option_id: 'B', is_correct: n !== 1 },
        ],
      })),
    },
  ],
  created_at: null,
  updated_at: null,
  document_status: 'PUBLISHED',
  content_access_type: 'FREE',
  version: 3,
  created_by: 'system',
  updated_by: 'system',
  flag_type: 'PRACTICE',
}

describe('PartTestDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    detailState.data = row
    detailState.isLoading = false
    detailState.error = null
    isAdminState.isAdmin = true
    isAdminState.isLoading = false
    updateState.isPending = false
  })

  it('renders the loaded row for an admin', async () => {
    const { getByLabelText } = await render(<PartTestDetail id='x' />)

    await expect.element(getByLabelText(/^name$/i)).toHaveValue('ETS Part 4')
    await expect.element(getByLabelText(/directions/i)).toBeInTheDocument()
  })

  it('switches to a group panel from the nav and shows its questions', async () => {
    const { getByRole, getByLabelText } = await render(
      <PartTestDetail id='x' />
    )

    const navButton = getByRole('button', { name: /group a.*3 câu/i })
    await expect.element(navButton).toBeInTheDocument()
    await navButton.click()

    await expect
      .element(getByLabelText(/question text/i).first())
      .toHaveValue('Question 1?')
  })

  it('disables Save while the form is pristine', async () => {
    const { getByRole } = await render(<PartTestDetail id='x' />)

    await expect
      .element(getByRole('button', { name: /^save$/i }))
      .toBeDisabled()
  })

  it('hides Save and disables fields for a non-admin', async () => {
    isAdminState.isAdmin = false
    const screen = await render(<PartTestDetail id='x' />)

    await expect.element(screen.getByLabelText(/^name$/i)).toBeDisabled()
    expect(screen.container.querySelector('button')).not.toBeNull() // Back button exists
    await expect
      .element(screen.getByRole('button', { name: /^save$/i }))
      .not.toBeInTheDocument()
  })
})
