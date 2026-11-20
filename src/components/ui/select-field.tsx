import { Children, isValidElement } from 'react'
import type { ReactNode } from 'react'
import { AppSelect } from './app-select'

/** Declarative option syntax for the same searchable application selector. */
export function SelectField({
  children,
  value,
  onChange,
  disabled,
  className,
  'aria-label': ariaLabel,
  title,
  id,
  name,
}: {
  children: ReactNode
  value: string | number
  onChange: (event: {
    target: { value: string }
    currentTarget: { value: string }
  }) => void
  disabled?: boolean
  className?: string
  'aria-label'?: string
  title?: string
  id?: string
  name?: string
}) {
  const options: Array<{ value: string; label: string; disabled?: boolean }> =
    []
  function visit(nodes: ReactNode) {
    Children.forEach(nodes, (node) => {
      if (
        !isValidElement<{
          children?: ReactNode
          value?: string | number
          disabled?: boolean
        }>(node)
      )
        return
      if (node.type === 'option')
        options.push({
          value: String(node.props.value ?? ''),
          label: Children.toArray(node.props.children).join(''),
          disabled: node.props.disabled,
        })
      else visit(node.props.children)
    })
  }
  visit(children)
  return (
    <div id={id} className={className}>
      <AppSelect
        label={ariaLabel ?? title ?? name ?? 'Выбор значения'}
        value={String(value)}
        options={options}
        disabled={disabled}
        onChange={(next) =>
          onChange({ target: { value: next }, currentTarget: { value: next } })
        }
      />
      {name && <input type="hidden" name={name} value={value} />}
    </div>
  )
}
