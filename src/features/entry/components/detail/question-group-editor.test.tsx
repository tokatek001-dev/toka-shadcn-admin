import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { Form } from '@/components/ui/form'
import {
  partTestFormSchema,
  type EditableQuestionGroup,
  type PartTestFormInput,
  type PartTestFormValues,
} from '../../data/detail-schema'
import { GroupPanel, GroupsNav } from './question-group-editor'

const someMinimalDefaults: Omit<PartTestFormInput, 'question_groups'> = {
  name: 'T',
  part: 'PART_4',
  test_type: 'LISTENING',
  level: 'TOEIC_600',
  flag_type: 'PRACTICE',
  total_question: '',
  start_part_order: '',
  end_part_order: '',
  duration_in_second: '',
  audio_time: '',
  directions: '',
  ex_description: '',
  document_status: 'DRAFT',
  content_access_type: 'FREE',
  base_source: '',
  base_id: '',
  cover: null,
  ex_image: null,
  audio: null,
}

const oneGroup = (): EditableQuestionGroup[] => [
  {
    group_key: 'g1',
    group_title: 'Group A',
    passage: { title: null, body: null },
    image: null,
    questions: [
      {
        question_key: 'q1',
        question_text: 'What is it?',
        image: null,
        options: [
          { text: 'Alpha', option_id: 'A', is_correct: true },
          { text: 'Beta', option_id: 'B', is_correct: false },
        ],
      },
    ],
  },
]

function Harness({ groups }: { groups: EditableQuestionGroup[] }) {
  const form = useForm<PartTestFormInput, unknown, PartTestFormValues>({
    resolver: zodResolver(partTestFormSchema),
    defaultValues: { ...someMinimalDefaults, question_groups: groups },
  })
  const [selected, setSelected] = useState<number | 'general'>(0)
  const watched = useWatch({ control: form.control, name: 'question_groups' })
  return (
    <Form {...form}>
      <GroupsNav
        groups={watched ?? []}
        selected={selected}
        onSelect={setSelected}
        canEdit
      />
      {typeof selected === 'number' && (
        <GroupPanel form={form} groupIndex={selected} disabled={false} />
      )}
    </Form>
  )
}

describe('question-group-editor', () => {
  it("renders the selected group's questions and options", async () => {
    const { getByLabelText, getByRole } = await render(
      <Harness groups={oneGroup()} />
    )
    await expect
      .element(getByLabelText(/question text/i))
      .toHaveValue('What is it?')
    await expect.element(getByLabelText(/^option a$/i)).toHaveValue('Alpha')
    await expect.element(getByLabelText(/^option b$/i)).toHaveValue('Beta')
    await expect
      .element(getByRole('radio', { name: /đáp án đúng a/i }))
      .toBeChecked()
  })

  it('picking another option enforces single-correct', async () => {
    const { getByRole } = await render(<Harness groups={oneGroup()} />)
    const radioB = getByRole('radio', { name: /đáp án đúng b/i })
    await radioB.click()
    await expect.element(radioB).toBeChecked()
    await expect
      .element(getByRole('radio', { name: /đáp án đúng a/i }))
      .not.toBeChecked()
  })

  it('add question appends a card and updates the nav count', async () => {
    const { getByRole, getByText } = await render(
      <Harness groups={oneGroup()} />
    )
    await getByRole('button', { name: /thêm câu hỏi/i }).click()
    await expect.element(getByText('Câu 2')).toBeInTheDocument()
    await expect.element(getByText(/2 câu/)).toBeInTheDocument()
  })
})
