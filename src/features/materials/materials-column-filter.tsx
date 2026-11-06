import { useMemo, useRef, useState } from 'react'
import { useGridFilterDisplay } from 'ag-grid-react'
import type { CustomFilterDisplayProps } from 'ag-grid-react'
import { ArrowDown, ArrowUp, Plus, Search, X } from 'lucide-react'
import {
  compileMaterialsFilter,
  createMaterialsFilterHandler,
  filterValueKey,
} from './grid-filter-model'
import type { MaterialsFilterModel } from './grid-filter-model'
import './materials-column-filter.css'

type SortLevel = { colId: string; sort: 'asc' | 'desc' }
type ValueOption = { key: string | null; label: string; value: unknown }
const collator = new Intl.Collator('ru', { numeric: true, sensitivity: 'base' })
const valueHeight = 36
const listHeight = 216

export const materialsColumnFilter = {
  component: MaterialsColumnFilter,
  handler: createMaterialsFilterHandler,
}

function MaterialsColumnFilter({
  api,
  column,
  model,
  onModelChange,
  getValue,
}: CustomFilterDisplayProps<unknown, unknown, MaterialsFilterModel>) {
  const colId = column.getColId()
  const title = api.getDisplayNameForColumn(column, 'header')
  const [draft, setDraft] = useState(model)
  const [levels, setLevels] = useState<Array<SortLevel>>([])
  const [singleColumn, setSingleColumn] = useState(false)
  const [options, setOptions] = useState<Array<ValueOption>>([])
  const [query, setQuery] = useState('')
  const [scrollTop, setScrollTop] = useState(0)
  const [activeIndex, setActiveIndex] = useState(0)
  const search = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const closePopup = useRef<(() => void) | undefined>(undefined)
  const opened = useRef(false)
  const matches = useMemo(() => compileMaterialsFilter(draft), [draft])
  const refreshValues = () => {
    const values = new Map<string | null, ValueOption>()
    api.forEachLeafNode((node) => {
      const value = getValue(node)
      const key = filterValueKey(value)
      if (!values.has(key))
        values.set(key, {
          key,
          value,
          label:
            key === null
              ? '(Пустые)'
              : api.getCellValue({
                  rowNode: node,
                  colKey: column,
                  useFormatter: true,
                }) || key,
        })
    })
    setOptions(
      [...values.values()].sort((a, b) =>
        a.key === null
          ? -1
          : b.key === null
            ? 1
            : typeof a.value === 'number' && typeof b.value === 'number'
              ? a.value - b.value
              : collator.compare(a.label, b.label),
      ),
    )
  }
  useGridFilterDisplay({
    afterGuiAttached: (params) => {
      opened.current = true
      closePopup.current = params?.hidePopup
      setDraft(model)
      setLevels(
        api
          .getColumnState()
          .filter((state) => state.sort === 'asc' || state.sort === 'desc')
          .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0))
          .map((state) => ({ colId: state.colId, sort: state.sort! })),
      )
      setSingleColumn(false)
      setQuery('')
      setScrollTop(0)
      setActiveIndex(0)
      if (list.current) list.current.scrollTop = 0
      refreshValues()
      if (!params?.suppressFocus) search.current?.focus()
    },
    afterGuiDetached: () => {
      opened.current = false
    },
    onNewRowsLoaded: () => {
      if (opened.current) refreshValues()
    },
  })
  const visible = useMemo(() => {
    const text = query.trim().toLocaleLowerCase('ru-RU')
    return options.filter(
      (option) =>
        option.label.toLocaleLowerCase('ru-RU').includes(text) ||
        (option.key ?? '').toLocaleLowerCase('ru-RU').includes(text),
    )
  }, [options, query])
  const selectedCount = visible.reduce(
    (sum, option) => sum + Number(matches(option.value)),
    0,
  )
  const allSelected = visible.length > 0 && selectedCount === visible.length
  const sortableColumns = (api.getColumns() ?? []).filter(
    (item) =>
      item.isSortable() &&
      (item.isVisible() ||
        levels.some((level) => level.colId === item.getColId())),
  )
  const currentSort = levels.find((level) => level.colId === colId)?.sort
  const setCurrentSort = (sort: 'asc' | 'desc') => {
    setLevels((current) =>
      singleColumn
        ? [{ colId, sort }]
        : current.some((level) => level.colId === colId)
          ? current.map((level) =>
              level.colId === colId ? { colId, sort } : level,
            )
          : [...current, { colId, sort }],
    )
  }
  const moveLevel = (index: number, offset: number) => {
    setLevels((current) => {
      const next = [...current]
      ;[next[index], next[index + offset]] = [
        next[index + offset]!,
        next[index]!,
      ]
      return next
    })
  }
  const selectValues = (values: Array<ValueOption>, checked: boolean) => {
    const selected = new Set(
      draft?.filterType === 'set'
        ? draft.values
        : options
            .filter((option) => matches(option.value))
            .map((option) => option.key),
    )
    for (const value of values) {
      if (checked) selected.add(value.key)
      else selected.delete(value.key)
    }
    setDraft(
      options.length > 0 && options.every((option) => selected.has(option.key))
        ? null
        : { filterType: 'set', values: [...selected] },
    )
  }
  const start = Math.max(0, Math.floor(scrollTop / valueHeight) - 3)
  const end = Math.min(
    visible.length,
    start + Math.ceil(listHeight / valueHeight) + 6,
  )
  const close = () => closePopup.current?.()
  const applyFilter = () => {
    // The search narrows the applied selection too. Hidden checked
    // values must not silently keep unrelated rows in the table.
    onModelChange(
      query.trim()
        ? {
            filterType: 'set',
            values: visible
              .filter((option) => matches(option.value))
              .map((option) => option.key),
          }
        : draft,
    )
    api.applyColumnState({
      state: levels.map((level, sortIndex) => ({ ...level, sortIndex })),
      defaultState: { sort: null, sortIndex: null },
    })
    close()
  }
  return (
    <section
      className="materials-column-filter"
      aria-label={`${title}: сортировка и фильтры`}
    >
      <header className="materials-filter-heading">
        <div>
          <h2>{title}</h2>
          <p>Сортировка и фильтры</p>
        </div>
        <button
          type="button"
          className="materials-filter-icon"
          aria-label="Закрыть фильтр"
          onClick={close}
        >
          <X size={20} />
        </button>
      </header>
      <div className="materials-filter-body">
        <section className="materials-filter-section">
          <div className="materials-filter-section-title">
            <h3>Сортировка</h3>
            <button
              type="button"
              className="materials-filter-link"
              disabled={!levels.length}
              onClick={() => setLevels([])}
            >
              Сбросить сортировку
            </button>
          </div>
          <label className="materials-filter-field">
            Порядок строк
            <select
              value={singleColumn ? 'single' : 'multi'}
              onChange={(event) => {
                const single = event.target.value === 'single'
                setSingleColumn(single)
                if (single)
                  setLevels((current) =>
                    current.filter((level) => level.colId === colId),
                  )
              }}
            >
              <option value="multi">
                По нескольким столбцам / текущий порядок
              </option>
              <option value="single">Только этот столбец</option>
            </select>
          </label>
          <div className="materials-filter-sort-buttons">
            <button
              type="button"
              disabled={!column.isSortable()}
              aria-pressed={currentSort === 'asc'}
              onClick={() => setCurrentSort('asc')}
            >
              <ArrowUp size={16} />
              По возрастанию
            </button>
            <button
              type="button"
              disabled={!column.isSortable()}
              aria-pressed={currentSort === 'desc'}
              onClick={() => setCurrentSort('desc')}
            >
              <ArrowDown size={16} />
              По убыванию
            </button>
            <button
              type="button"
              disabled={!currentSort}
              onClick={() =>
                setLevels((current) =>
                  current.filter((level) => level.colId !== colId),
                )
              }
            >
              Убрать
            </button>
          </div>
          {!singleColumn && (
            <>
              <div className="materials-filter-levels">
                {levels.map((level, index) => (
                  <div className="materials-filter-level" key={level.colId}>
                    <span className="materials-filter-level-number">
                      {index + 1}
                    </span>
                    <select
                      className="materials-filter-level-column"
                      aria-label={`Столбец уровня ${index + 1}`}
                      value={level.colId}
                      onChange={(event) =>
                        setLevels((current) =>
                          current.map((item, i) =>
                            i === index
                              ? { ...item, colId: event.target.value }
                              : item,
                          ),
                        )
                      }
                    >
                      {sortableColumns.map((item) => (
                        <option
                          key={item.getColId()}
                          value={item.getColId()}
                          disabled={levels.some(
                            (other, i) =>
                              i !== index && other.colId === item.getColId(),
                          )}
                        >
                          {api.getDisplayNameForColumn(item, 'header')}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label={`Направление уровня ${index + 1}`}
                      value={level.sort}
                      onChange={(event) =>
                        setLevels((current) =>
                          current.map((item, i) =>
                            i === index
                              ? {
                                  ...item,
                                  sort: event.target.value as 'asc' | 'desc',
                                }
                              : item,
                          ),
                        )
                      }
                    >
                      <option value="asc">↑ По возрастанию</option>
                      <option value="desc">↓ По убыванию</option>
                    </select>
                    <div className="materials-filter-level-actions">
                      <button
                        type="button"
                        className="materials-filter-icon"
                        aria-label={`Поднять уровень ${index + 1}`}
                        disabled={index === 0}
                        onClick={() => moveLevel(index, -1)}
                      >
                        <ArrowUp size={16} />
                      </button>
                      <button
                        type="button"
                        className="materials-filter-icon"
                        aria-label={`Опустить уровень ${index + 1}`}
                        disabled={index === levels.length - 1}
                        onClick={() => moveLevel(index, 1)}
                      >
                        <ArrowDown size={16} />
                      </button>
                      <button
                        type="button"
                        className="materials-filter-icon"
                        aria-label={`Удалить уровень ${index + 1}`}
                        onClick={() =>
                          setLevels((current) =>
                            current.filter((_, i) => i !== index),
                          )
                        }
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="materials-filter-add"
                disabled={levels.length >= sortableColumns.length}
                onClick={() => {
                  const next = sortableColumns.find(
                    (item) =>
                      !levels.some((level) => level.colId === item.getColId()),
                  )
                  if (next)
                    setLevels((current) => [
                      ...current,
                      { colId: next.getColId(), sort: 'asc' },
                    ])
                }}
              >
                <Plus size={16} />
                Добавить уровень
              </button>
            </>
          )}
          <p className="materials-filter-hint">
            Уровни применяются сверху вниз. Изменения вступят в силу после
            «Применить».
          </p>
        </section>
        <section className="materials-filter-section">
          <h3>Показать значения</h3>
          <label className="materials-filter-search">
            <Search size={18} />
            <input
              ref={search}
              aria-label="Поиск значений"
              placeholder="Поиск…"
              enterKeyHint="search"
              value={query}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || event.nativeEvent.isComposing)
                  return
                event.preventDefault()
                event.stopPropagation()
                applyFilter()
              }}
              onChange={(event) => {
                setQuery(event.target.value)
                setScrollTop(0)
                setActiveIndex(0)
                if (list.current) list.current.scrollTop = 0
              }}
            />
          </label>
          <label className="materials-filter-value materials-filter-select-all">
            <input
              type="checkbox"
              checked={allSelected}
              disabled={!visible.length}
              ref={(input) => {
                if (input)
                  input.indeterminate = selectedCount > 0 && !allSelected
              }}
              onChange={(event) => selectValues(visible, event.target.checked)}
            />
            <span>{query.trim() ? 'Выбрать найденные' : 'Выбрать все'}</span>
          </label>
          <div
            ref={list}
            className="materials-filter-values"
            style={{
              height:
                Math.min(listHeight, visible.length * valueHeight) ||
                valueHeight,
            }}
            onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
          >
            {visible.length === 0 ? (
              <p className="materials-filter-empty">
                {options.length ? 'Ничего не найдено' : 'Нет значений'}
              </p>
            ) : (
              <div
                style={{
                  height: visible.length * valueHeight,
                  position: 'relative',
                }}
              >
                {visible.slice(start, end).map((option, offset) => {
                  const index = start + offset
                  return (
                    <label
                      className="materials-filter-value"
                      key={JSON.stringify(option.key)}
                      title={option.label}
                      style={{
                        position: 'absolute',
                        top: index * valueHeight,
                        height: valueHeight,
                        width: '100%',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={matches(option.value)}
                        tabIndex={
                          index ===
                          (activeIndex >= start && activeIndex < end
                            ? activeIndex
                            : start)
                            ? 0
                            : -1
                        }
                        data-value-index={index}
                        onFocus={() => setActiveIndex(index)}
                        onChange={(event) =>
                          selectValues([option], event.target.checked)
                        }
                        onKeyDown={(event) => {
                          const next =
                            event.key === 'ArrowDown'
                              ? Math.min(visible.length - 1, index + 1)
                              : event.key === 'ArrowUp'
                                ? Math.max(0, index - 1)
                                : event.key === 'Home'
                                  ? 0
                                  : event.key === 'End'
                                    ? visible.length - 1
                                    : null
                          if (next === null) return
                          event.preventDefault()
                          setActiveIndex(next)
                          if (list.current) {
                            const top = next * valueHeight
                            if (
                              top < list.current.scrollTop ||
                              top + valueHeight >
                                list.current.scrollTop + listHeight
                            ) {
                              list.current.scrollTop = top
                              setScrollTop(top)
                            }
                          }
                          requestAnimationFrame(() =>
                            list.current
                              ?.querySelector<HTMLInputElement>(
                                `[data-value-index="${next}"]`,
                              )
                              ?.focus(),
                          )
                        }}
                      />
                      <span>{option.label}</span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
          <p className="materials-filter-hint materials-filter-count">
            {query.trim()
              ? `Найдено: ${visible.length} из ${options.length}`
              : `Значений: ${options.length}`}
          </p>
          {query.trim() && (
            <p className="materials-filter-hint">
              Применятся только отмеченные найденные значения.
            </p>
          )}
        </section>
      </div>
      <footer className="materials-filter-footer">
        <button
          type="button"
          className="materials-filter-clear"
          onClick={() => {
            setDraft(null)
            setQuery('')
            setScrollTop(0)
            setActiveIndex(0)
            if (list.current) list.current.scrollTop = 0
          }}
        >
          Очистить
        </button>
        <button type="button" onClick={close}>
          Отмена
        </button>
        <button
          type="button"
          className="materials-filter-apply"
          title="Применить (Enter)"
          onClick={applyFilter}
        >
          Применить
        </button>
      </footer>
    </section>
  )
}
