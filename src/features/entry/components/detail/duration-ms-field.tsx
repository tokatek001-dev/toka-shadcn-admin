import { type Control, type FieldPath, type FieldValues } from 'react-hook-form'
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { formatDuration } from '../../data/format'

// TT (transformed values) is left open so forms whose zod schema transforms
// inputs (e.g. string → number | null) type-check when passing `form.control`.
type DurationMsFieldProps<T extends FieldValues, TT extends FieldValues = T> = {
  control: Control<T, unknown, TT>
  name: FieldPath<T>
  label: string
  disabled?: boolean
}

/**
 * Millisecond input with a live mm:ss hint — `duration_in_second`/`audio_time`
 * store MILLISECONDS despite their names.
 */
export function DurationMsField<
  T extends FieldValues,
  TT extends FieldValues = T,
>({ control, name, label, disabled }: DurationMsFieldProps<T, TT>) {
  return (
    <FormField
      control={control as unknown as Control<T>}
      name={name}
      render={({ field }) => {
        const ms = /^\d+$/.test(String(field.value ?? '').trim())
          ? Number(String(field.value).trim())
          : null
        return (
          <FormItem>
            <FormLabel>{label}</FormLabel>
            <FormControl>
              <Input inputMode='numeric' disabled={disabled} {...field} />
            </FormControl>
            <FormDescription>
              Milliseconds{ms != null ? ` — ${formatDuration(ms)}` : ''}
            </FormDescription>
            <FormMessage />
          </FormItem>
        )
      }}
    />
  )
}
