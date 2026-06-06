import { createFileRoute } from '@tanstack/react-router'
import { PartTestDetail } from '@/features/entry/components/detail/part-test-detail'

export const Route = createFileRoute('/_authenticated/entry/part-tests/$id')({
  component: PartTestDetailPage,
})

// eslint-disable-next-line react-refresh/only-export-components
function PartTestDetailPage() {
  const { id } = Route.useParams()
  return <PartTestDetail id={id} />
}
