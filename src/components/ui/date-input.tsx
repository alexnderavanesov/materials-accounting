import { useEffect, useRef, useState } from 'react'
import type { ComponentProps } from 'react'
import { CalendarDays } from 'lucide-react'
import { cn } from '#/lib/utils'
import { formatCalendarDate, normalizeCalendarDate } from '#/lib/calendar-date'
import { Input } from './input'

/** Text keeps the chosen display format; the native picker and callbacks use ISO. */
export function DateInput({
  value,
  onValueChange,
  className,
  disabled,
  readOnly,
  min,
  max,
  onBlur,
  ...props
}: Omit<
  ComponentProps<'input'>,
  'value' | 'defaultValue' | 'onChange' | 'type'
> & {
  value: string
  onValueChange: (value: string) => void
}) {
  const picker = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(() => formatCalendarDate(value, ''))
  useEffect(() => {
    setText((current) =>
      (normalizeCalendarDate(current) ?? current) ===
      (normalizeCalendarDate(value) ?? value)
        ? current
        : formatCalendarDate(value, ''),
    )
  }, [value])
  const iso = normalizeCalendarDate(value)
  const invalid = Boolean(
    value && (!iso || (min && iso < String(min)) || (max && iso > String(max))),
  )
  return (
    <span className={cn('relative block min-w-0', className)}>
      <Input
        {...props}
        type="text"
        placeholder="ДД-ММ-ГГ"
        disabled={disabled}
        readOnly={readOnly}
        aria-invalid={props['aria-invalid'] || invalid || undefined}
        className="pr-10 disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-500"
        value={text}
        onChange={(event) => {
          const entered = event.target.value
          setText(
            /^\d{4}-\d{1,2}-\d{1,2}$/.test(entered)
              ? formatCalendarDate(entered, '')
              : entered,
          )
          onValueChange(normalizeCalendarDate(entered) ?? entered)
        }}
        onBlur={(event) => {
          setText(formatCalendarDate(value, ''))
          onBlur?.(event)
        }}
      />
      <input
        ref={picker}
        type="date"
        aria-hidden="true"
        tabIndex={-1}
        className="pointer-events-none absolute bottom-0 right-0 h-0 w-0 opacity-0"
        value={iso ?? ''}
        disabled={disabled || readOnly}
        min={min}
        max={max}
        onChange={(event) => {
          setText(formatCalendarDate(event.target.value, ''))
          onValueChange(event.target.value)
        }}
      />
      <button
        type="button"
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-stone-500 hover:text-stone-900 focus-visible:outline focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-40"
        aria-label={`Выбрать дату в календаре${props['aria-label'] ? `: ${props['aria-label']}` : ''}`}
        disabled={disabled || readOnly}
        onClick={() => picker.current?.showPicker()}
      >
        <CalendarDays size={16} aria-hidden="true" />
      </button>
    </span>
  )
}
