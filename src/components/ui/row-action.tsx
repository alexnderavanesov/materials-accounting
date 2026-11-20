import type { ComponentProps } from 'react'
import { cva } from 'class-variance-authority'
import { Button } from './button'
import { HoverTooltip } from './hover-tooltip'
import { cn } from '#/lib/utils'

export const rowActionStyle = cva(
  'inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-stone-200 bg-white text-xs font-medium leading-none text-stone-600 shadow-[0_1px_2px_rgb(28_25_23/0.04)] transition-colors hover:border-stone-400 hover:bg-stone-100 hover:text-stone-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-300 disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0',
  {
    variants: {
      iconOnly: { true: 'w-8 px-0', false: 'px-2.5' },
      danger: {
        true: 'text-red-700 hover:border-red-300 hover:bg-red-50 hover:text-red-800',
      },
    },
    defaultVariants: { iconOnly: false },
  },
)

export function RowActionButton({
  iconOnly = false,
  danger = false,
  className,
  title,
  ...props
}: Omit<ComponentProps<typeof Button>, 'size' | 'variant'> & {
  iconOnly?: boolean
  danger?: boolean
}) {
  const tooltip = iconOnly ? (title ?? props['aria-label']) : undefined
  const button = (
    <Button
      {...props}
      title={iconOnly ? undefined : title}
      aria-description={props['aria-description'] ?? tooltip}
      size="sm"
      variant="outline"
      className={cn(rowActionStyle({ iconOnly, danger }), className)}
    />
  )
  return tooltip ? (
    <HoverTooltip
      text={tooltip}
      className="inline-flex shrink-0"
      focusable={false}
    >
      {button}
    </HoverTooltip>
  ) : (
    button
  )
}

export function RowActionLink({
  className,
  iconOnly = false,
  title,
  ...props
}: ComponentProps<'a'> & { iconOnly?: boolean }) {
  const tooltip = iconOnly ? (title ?? props['aria-label']) : undefined
  const link = (
    <a
      {...props}
      title={iconOnly ? undefined : title}
      aria-description={props['aria-description'] ?? tooltip}
      className={cn(rowActionStyle({ iconOnly }), className)}
    />
  )
  return tooltip ? (
    <HoverTooltip
      text={tooltip}
      className="inline-flex shrink-0"
      focusable={false}
    >
      {link}
    </HoverTooltip>
  ) : (
    link
  )
}

export function RowActions({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      {...props}
      className={cn('flex min-w-0 flex-wrap items-start gap-1.5', className)}
    />
  )
}

export function DocumentActionButton({
  kind,
  ...props
}: Omit<ComponentProps<typeof RowActionButton>, 'iconOnly' | 'children'> & {
  kind: 'ЗНИ' | 'АВК'
}) {
  return (
    <RowActionButton
      {...props}
      iconOnly
      aria-label={`Создать ${kind}`}
      title={`Создать ${kind}`}
    >
      {kind}
    </RowActionButton>
  )
}
