import { useEffect, useState } from 'react'
import type { ComponentProps } from 'react'
import { Input } from './input'

const parse = (text: string) =>
  Number(text.replace(/\s/g, '').replace(',', '.'))
/** Preserve intermediate decimal input ("1," / "1.") until the user finishes. */
export function DecimalInput({
  value,
  onValue,
  ...props
}: Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'type'> & {
  value: number
  onValue: (value: number) => void
}) {
  const [text, setText] = useState(value ? String(value) : '')
  useEffect(() => {
    setText((current) =>
      Object.is(parse(current), value) ? current : value ? String(value) : '',
    )
  }, [value])
  return (
    <Input
      {...props}
      inputMode="decimal"
      value={text}
      onChange={(event) => {
        setText(event.target.value)
        onValue(parse(event.target.value))
      }}
    />
  )
}
