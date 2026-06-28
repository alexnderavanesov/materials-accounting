import * as React from 'react'

import { cn } from '#/lib/utils'

export function Input({
  autoComplete = 'off',
  className,
  type,
  ...props
}: React.ComponentProps<'input'>) {
  return (
    <input
      autoComplete={autoComplete}
      type={type}
      className={cn(
        'h-10 w-full rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-900 shadow-sm outline-none transition-colors placeholder:text-stone-400 focus:border-stone-400 focus:ring-2 focus:ring-stone-100',
        className,
      )}
      {...props}
    />
  )
}
