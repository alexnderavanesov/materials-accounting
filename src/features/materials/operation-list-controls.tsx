import { AppSelect } from '#/components/ui/app-select'
import { OperationDisplayToggle } from './operation-display'
import { ArrowUpWideNarrow, Search } from 'lucide-react'
import { Input } from '#/components/ui/input'
import { HoverTooltip } from '#/components/ui/hover-tooltip'
import type { OperationListView } from './operation-list-view'

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
    <div className="operation-search-controls grid min-w-0 grid-cols-2 items-center gap-2 xl:grid-cols-[minmax(180px,1fr)_140px_180px_auto]">
      <div className="col-span-2 flex min-w-0 items-center gap-2 xl:col-span-1">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            size={18}
          />
          <Input
            className="h-10 bg-white pl-10 text-sm"
            aria-label={label}
            placeholder="Поиск по материалу, документу, нормативному документу или составу"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
          />
        </div>
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
      <div className="col-span-2 justify-self-end xl:col-span-1">
        <OperationDisplayToggle />
      </div>
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
  return (
    <AppSelect
      label={placeholder}
      allowCustom
      value={value}
      options={[
        { value: '', label: placeholder },
        ...Array.from(new Set(options.filter(Boolean)))
          .sort((a, b) => a.localeCompare(b, 'ru'))
          .map((option) => ({ value: option, label: option })),
      ]}
      onChange={onChange}
    />
  )
}
