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

type DurationMsFieldProps<T extends FieldValues> = {
  control: Control<T>
  name: FieldPath<T>
  label: string
  disabled?: boolean
}

/**
 * Millisecond input with a live mm:ss hint — `duration_in_second`/`audio_time`
 * store MILLISECONDS despite their names.
 */
export function DurationMsField<T extends FieldValues>({
  control,
  name,
  label,
  disabled,
}: DurationMsFieldProps<T>) {
  return (
    <FormField
      control={control}
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
