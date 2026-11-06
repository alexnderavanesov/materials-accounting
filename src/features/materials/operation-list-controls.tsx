import { useState } from 'react'
import { ArrowUpWideNarrow, Search, X } from 'lucide-react'
import { Input } from '#/components/ui/input'
import { HoverTooltip } from '#/components/ui/hover-tooltip'
import type { OperationListView } from './operation-list-view'
import { normalizeOperationSearch } from './operation-list-view'

export function OperationIndicatorBadge({
  label,
  value,
  details,
  active,
  onClick,
  subject = 'материалы',
}: {
  label: string
  value: string
  details: string
  active: boolean
  onClick: () => void
  subject?: 'материалы' | 'документы'
}) {
  const description = `${details}\n${active ? 'Вернуть обычный порядок' : `Сначала ${subject}: ${label.toLocaleLowerCase('ru')}`}`
  return (
    <HoverTooltip text={description} className="flex min-w-0" focusable={false}>
      <button
        type="button"
        aria-pressed={active}
        onClick={onClick}
        aria-description={description}
        className={`w-full min-w-0 rounded-lg border px-3 py-2 text-left shadow-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 ${active ? 'border-slate-500 bg-slate-100' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
      >
        <span className="flex items-center justify-between gap-1 text-[10px] font-medium uppercase leading-4 tracking-wide text-slate-500">
          {label}
          {active && (
            <ArrowUpWideNarrow
              size={14}
              className="shrink-0 text-slate-700"
              aria-hidden="true"
            />
          )}
        </span>
        <span className="mt-0.5 block break-words text-sm leading-5 text-slate-900">
          {value}
        </span>
      </button>
    </HoverTooltip>
  )
}

export function OperationSearchControls({
  search,
  label,
  view,
  ciphers,
  materialTypes,
  onSearch,
  onView,
}: {
  search: string
  label: string
  view: OperationListView
  ciphers: Array<string>
  materialTypes: Array<string>
  onSearch: (value: string) => void
  onView: (value: OperationListView) => void
}) {
  return (
    <div className="grid min-w-0 gap-2 md:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_200px_240px]">
      <div className="relative min-w-0 md:col-span-2 xl:col-span-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          size={18}
        />
        <Input
          className="h-11 bg-white pl-10 text-sm"
          aria-label={label}
          placeholder="Поиск по материалу, документу, нормативному документу или составу"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
        />
      </div>
      <FilterAutocompleteInput
        options={ciphers}
        placeholder="Шифр"
        value={view.cipher}
        onChange={(cipher) => onView({ ...view, cipher })}
      />
      <FilterAutocompleteInput
        options={materialTypes}
        placeholder="Тип материала"
        value={view.materialType}
        onChange={(materialType) => onView({ ...view, materialType })}
      />
    </div>
  )
}

export function FilterAutocompleteInput({
  options,
  placeholder,
  value,
  onChange,
}: {
  options: Array<string>
  placeholder: string
  value: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const values = Array.from(new Set(options.filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, 'ru'),
  )
  const query = normalizeOperationSearch(value)
  const matches = (
    query
      ? values.filter((option) =>
          normalizeOperationSearch(option).includes(query),
        )
      : values
  ).slice(0, 12)

  return (
    <div className="relative min-w-0">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        size={16}
      />
      <Input
        className="h-11 bg-white pl-9 pr-8 text-sm"
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 120)
        }}
        onChange={(event) => {
          onChange(event.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
      />
      {value ? (
        <button
          className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          type="button"
          aria-label={`Очистить фильтр ${placeholder.toLocaleLowerCase('ru')}`}
          onMouseDown={(event) => {
            event.preventDefault()
            onChange('')
            setOpen(false)
          }}
        >
          <X size={14} />
        </button>
      ) : null}
      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-64 overflow-auto rounded-md border border-slate-200 bg-white p-1 shadow-lg shadow-slate-200/80">
          {matches.length > 0 ? (
            matches.map((option) => (
              <button
                key={option}
                className="block w-full rounded px-3 py-2 text-left text-sm leading-5 text-slate-700 hover:bg-blue-50 hover:text-slate-950"
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault()
                  onChange(option)
                  setOpen(false)
                }}
              >
                {option}
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-slate-400">
              Значений не найдено
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
