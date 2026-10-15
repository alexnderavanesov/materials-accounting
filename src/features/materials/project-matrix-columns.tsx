import { useEffect, useId, useRef, useState } from 'react'
import { Settings } from 'lucide-react'
import { Button } from '#/components/ui/button'

export const projectMatrixColumns = [
  { key: 'materialType', label: 'Тип материала', width: 192, align: 'left' },
  {
    key: 'projectMaterialName',
    label: 'Наименование по проекту',
    width: 390,
    align: 'left',
  },
  {
    key: 'normativeDocument',
    label: 'Нормативный документ',
    width: 192,
    align: 'left',
  },
  { key: 'unit', label: 'Единица измерения', width: 112, align: 'center' },
  { key: 'material', label: 'Состав', width: 144, align: 'center' },
  { key: 'unitWeight', label: 'Масса единицы', width: 128, align: 'center' },
  { key: 'alternativeUnit', label: 'А.ЕИ', width: 144, align: 'center' },
  {
    key: 'alternativeUnitFactor',
    label: 'А.КОЛ-ВО НА 1 ЕИ',
    width: 176,
    align: 'center',
  },
] as const

const storageKey = 'materials.projectMatrix.hiddenColumns.v1'

export function useProjectMatrixColumns() {
  const [hiddenColumns, setHiddenColumns] = useState<Array<string>>(() => {
    try {
      const saved: unknown = JSON.parse(
        window.localStorage.getItem(storageKey) ?? '[]',
      )
      return Array.isArray(saved)
        ? saved.filter((key): key is string => typeof key === 'string')
        : []
    } catch {
      return []
    }
  })

  function changeHiddenColumns(next: Array<string>) {
    setHiddenColumns(next)
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next))
    } catch {
      // Display preferences still work when browser storage is unavailable.
    }
  }

  return { hiddenColumns, changeHiddenColumns }
}

export function ProjectMatrixColumnSettings({
  ciphers,
  hiddenColumns,
  onChange,
}: {
  ciphers: Array<string>
  hiddenColumns: Array<string>
  onChange: (hiddenColumns: Array<string>) => void
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  const columns = [
    ...projectMatrixColumns,
    ...ciphers.map((cipher) => ({ key: `cipher:${cipher}`, label: cipher })),
    { key: 'actions', label: 'Действия' },
  ]

  useEffect(() => {
    if (!open) return
    function closeOutside(event: Event) {
      if (
        event.target instanceof Node &&
        !containerRef.current?.contains(event.target)
      ) {
        setOpen(false)
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('focusin', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('focusin', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative mt-3 w-fit">
      <Button
        ref={triggerRef}
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Настроить столбцы"
        title="Настроить столбцы"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <Settings size={18} />
      </Button>
      {open ? (
        <div
          id={panelId}
          role="group"
          aria-label="Отображаемые столбцы"
          className="absolute left-0 top-full z-50 mt-1 w-80 max-w-[calc(100vw-5rem)] rounded-lg border border-slate-200 bg-white p-3 shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-slate-800">
              Столбцы
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange([])}
            >
              Показать все
            </Button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {columns.map((column) => (
              <label
                key={column.key}
                className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 shrink-0 accent-slate-700"
                  checked={!hiddenColumns.includes(column.key)}
                  onChange={(event) =>
                    onChange(
                      event.target.checked
                        ? hiddenColumns.filter((key) => key !== column.key)
                        : [...hiddenColumns, column.key],
                    )
                  }
                />
                {column.label}
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
