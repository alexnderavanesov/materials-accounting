import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Button } from '#/components/ui/button'

export function WorkflowSteps({
  step,
  onStep,
  compact = false,
}: {
  step: number
  onStep: (step: number) => void
  compact?: boolean
}) {
  return (
    <nav
      aria-label="Шаги оформления"
      className={
        compact
          ? 'grid shrink-0 grid-cols-3 gap-2 border-b border-slate-200 px-4 py-3 sm:px-5'
          : 'flex shrink-0 gap-1 border-b border-slate-200 px-3 py-3 sm:gap-2 sm:px-5'
      }
    >
      {['Реквизиты', 'Материалы и количества', 'Проверка и сохранение'].map(
        (label, index) => (
          <button
            type="button"
            key={label}
            aria-label={compact ? `${index + 1} ${label}` : undefined}
            aria-current={step === index ? 'step' : undefined}
            onClick={() => onStep(index)}
            className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-md px-2 py-2 text-center text-xs sm:flex-initial sm:flex-row sm:gap-2 sm:px-3 sm:text-left sm:text-sm ${compact ? 'sm:justify-center' : ''} ${step === index ? 'bg-blue-50 font-medium text-blue-800' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <span
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs ${step === index ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}
            >
              {index + 1}
            </span>
            <span>
              {compact ? ['Реквизиты', 'Количество', 'Проверка'][index] : label}
            </span>
          </button>
        ),
      )}
    </nav>
  )
}
export function WorkflowDialog({
  title,
  children,
  footer,
  onClose,
  dirty = false,
  busy = false,
  step,
  onStep,
  embedded = false,
  fillBody = false,
  compact = false,
}: {
  title: string
  children: ReactNode
  footer?: ReactNode | ((close: () => void) => ReactNode)
  onClose: () => void
  dirty?: boolean
  busy?: boolean
  step?: number
  onStep?: (step: number) => void
  embedded?: boolean
  fillBody?: boolean
  compact?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [confirmClose, setConfirmClose] = useState(false)
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    if (!embedded) {
      document.body.style.overflow = 'hidden'
    }
    ref.current?.focus()
    const unload = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', unload)
    return () => {
      if (!embedded) {
        document.body.style.overflow = overflow
        previous?.focus()
      }
      window.removeEventListener('beforeunload', unload)
    }
  }, [embedded])
  const close = () => {
    if (!busy) {
      if (dirty) setConfirmClose(true)
      else onClose()
    }
  }
  const content = (
    <div
      ref={ref}
      role={embedded ? undefined : 'dialog'}
      aria-modal={embedded ? undefined : true}
      aria-label={title}
      tabIndex={-1}
      className={
        embedded
          ? 'flex min-h-0 flex-1 flex-col bg-white'
          : 'fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/35 p-3 sm:p-5'
      }
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.defaultPrevented) {
          event.preventDefault()
          event.stopPropagation()
          close()
        }
        if (event.key !== 'Tab' || embedded) return
        const fields = [
          ...(ref.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]),input:not([disabled]),textarea:not([disabled]),[tabindex="0"]',
          ) ?? []),
        ].filter((item) => item.getClientRects().length)
        const first = fields[0],
          last = fields.at(-1)
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first?.focus()
        }
      }}
    >
      <div
        className={`flex min-h-0 w-full flex-col overflow-hidden bg-white ${embedded ? 'flex-1' : compact ? 'max-h-[92dvh] max-w-xl rounded-xl shadow-xl' : 'h-[92dvh] max-w-7xl rounded-xl shadow-xl'}`}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Button
            variant="ghost"
            size="icon"
            className={embedded ? 'h-8 w-8' : undefined}
            onClick={close}
            disabled={busy}
            aria-label={`Закрыть: ${title}`}
          >
            <X size={18} />
          </Button>
        </header>
        {step !== undefined && onStep && (
          <WorkflowSteps step={step} onStep={onStep} compact={compact} />
        )}
        <div
          className={`min-h-0 flex-1 ${embedded ? 'px-5 py-4' : 'p-5'} ${fillBody ? 'flex flex-col overflow-hidden' : 'overflow-auto'}`}
        >
          {confirmClose && (
            <div
              className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm"
              role="alert"
            >
              <span className="mr-auto">Есть несохранённые изменения.</span>
              <Button variant="outline" onClick={() => setConfirmClose(false)}>
                Продолжить редактирование
              </Button>
              <Button onClick={onClose}>Выйти без сохранения</Button>
            </div>
          )}
          {children}
        </div>
        {footer && (
          <footer className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-slate-200 bg-white px-5 py-4">
            {typeof footer === 'function' ? footer(close) : footer}
          </footer>
        )}
      </div>
    </div>
  )
  return embedded ? content : createPortal(content, document.body)
}
