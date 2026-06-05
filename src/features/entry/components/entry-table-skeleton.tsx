import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'

type EntryTableSkeletonProps = {
  columnCount: number
  rowCount?: number
}

export function EntryTableSkeleton({
  columnCount,
  rowCount = 8,
}: EntryTableSkeletonProps) {
  return (
    <Table>
      <TableBody>
        {Array.from({ length: rowCount }).map((_, rowIndex) => (
          <TableRow key={rowIndex}>
            {Array.from({ length: columnCount }).map((__, cellIndex) => (
              <TableCell key={cellIndex}>
                <Skeleton className='h-5 w-full' />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
