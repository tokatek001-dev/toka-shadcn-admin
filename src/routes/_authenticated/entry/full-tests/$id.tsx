import { createFileRoute } from '@tanstack/react-router'
import { FullTestDetail } from '@/features/entry/components/detail/full-test-detail'

export const Route = createFileRoute('/_authenticated/entry/full-tests/$id')({
  component: FullTestDetailPage,
})

// eslint-disable-next-line react-refresh/only-export-components
function FullTestDetailPage() {
  const { id } = Route.useParams()
  return <FullTestDetail id={id} />
}
