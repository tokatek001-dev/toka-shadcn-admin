import { type Control, type FieldPath, type FieldValues } from 'react-hook-form'
import { Link } from '@tanstack/react-router'
import { AlertCircle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { SelectDropdown } from '@/components/select-dropdown'

// TT (transformed values) is left open so forms whose zod schema transforms
// inputs (e.g. string → number | null) type-check when passing `form.control`.
type FieldProps<T extends FieldValues, TT extends FieldValues = T> = {
  control: Control<T, unknown, TT>
  name: FieldPath<T>
  label: string
  disabled?: boolean
  className?: string
}

export function TextField<T extends FieldValues, TT extends FieldValues = T>({
  control,
  name,
  label,
  disabled,
  className,
}: FieldProps<T, TT>) {
  return (
    <FormField
      control={control as unknown as Control<T>}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input disabled={disabled} {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

export function TextareaField<
  T extends FieldValues,
  TT extends FieldValues = T,
>({ control, name, label, disabled, className }: FieldProps<T, TT>) {
  return (
    <FormField
      control={control as unknown as Control<T>}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Textarea rows={4} disabled={disabled} {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

export function SelectField<T extends FieldValues, TT extends FieldValues = T>({
  control,
  name,
  label,
  disabled,
  className,
  items,
}: FieldProps<T, TT> & { items: { label: string; value: string }[] }) {
  return (
    <FormField
      control={control as unknown as Control<T>}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel>{label}</FormLabel>
          <SelectDropdown
            isControlled
            defaultValue={field.value}
            onValueChange={field.onChange}
            items={items}
            disabled={disabled}
          />
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

export function DetailSkeleton() {
  return (
    <div className='flex flex-col gap-4 p-8'>
      <Skeleton className='h-8 w-1/3' />
      <Skeleton className='h-64 w-full max-w-3xl' />
      <Skeleton className='h-64 w-full max-w-3xl' />
    </div>
  )
}

export function NotFound() {
  return (
    <div className='flex flex-col items-center gap-3 p-16'>
      <h2 className='text-xl font-semibold'>Test not found</h2>
      <Button asChild variant='outline'>
        <Link to='/entry'>Back to Entry Browser</Link>
      </Button>
    </div>
  )
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <div className='p-8'>
      <Alert variant='destructive'>
        <AlertCircle />
        <AlertTitle>Failed to load test</AlertTitle>
        <AlertDescription>
          {message}
          <Button
            variant='outline'
            size='sm'
            className='mt-2'
            onClick={onRetry}
          >
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  )
}
