import type { FilterHandler } from 'ag-grid-community'

type Condition = {
  filterType: 'text' | 'number'
  type?: string
  filter?: string | number | null
  filterTo?: number | null
}
export type MaterialsFilterModel =
  | { filterType: 'set'; values: Array<string | null> }
  | Condition
  | {
      filterType: 'text' | 'number'
      operator: 'AND' | 'OR'
      conditions: Array<Condition>
    }

export const filterValueKey = (value: unknown): string | null =>
  value == null || value === '' ? null : String(value)

/** Compile once per model change, not once per row (large selections use a Set). */
export function compileMaterialsFilter(
  model: MaterialsFilterModel | null,
): (value: unknown) => boolean {
  if (!model) return () => true
  if (model.filterType === 'set') {
    const selected = new Set(model.values)
    return (value) => selected.has(filterValueKey(value))
  }
  // Keep saved AG Grid text/number conditions effective until the user changes
  // the value selection. Opening or applying sorting must not rewrite them.
  if ('conditions' in model) {
    const conditions = model.conditions.map(compileMaterialsFilter)
    return (value) =>
      model.operator === 'OR'
        ? conditions.some((matches) => matches(value))
        : conditions.every((matches) => matches(value))
  }
  return (value) => {
    const blank = value == null || value === ''
    if (model.type === 'blank') return blank
    if (model.type === 'notBlank') return !blank
    if (blank)
      return (
        model.filterType === 'text' &&
        (model.type === 'notEqual' || model.type === 'notContains')
      )
    if (model.filterType === 'number') {
      const number = Number(value)
      const target = Number(model.filter)
      switch (model.type) {
        case 'equals':
          return number === target
        case 'notEqual':
          return number !== target
        case 'lessThan':
          return number < target
        case 'lessThanOrEqual':
          return number <= target
        case 'greaterThan':
          return number > target
        case 'greaterThanOrEqual':
          return number >= target
        case 'inRange':
          return number > target && number < Number(model.filterTo)
        default:
          return true
      }
    }
    const text = String(value).toLocaleLowerCase('ru-RU')
    const target = String(model.filter ?? '').toLocaleLowerCase('ru-RU')
    switch (model.type) {
      case 'equals':
        return text === target
      case 'notEqual':
        return text !== target
      case 'notContains':
        return !text.includes(target)
      case 'startsWith':
        return text.startsWith(target)
      case 'endsWith':
        return text.endsWith(target)
      default:
        return text.includes(target)
    }
  }
}

export function createMaterialsFilterHandler(): FilterHandler<
  unknown,
  unknown,
  MaterialsFilterModel
> {
  let matches = compileMaterialsFilter(null)
  return {
    init: ({ model }) => {
      matches = compileMaterialsFilter(model)
    },
    refresh: ({ model }) => {
      matches = compileMaterialsFilter(model)
    },
    doesFilterPass: ({ node, handlerParams }) =>
      matches(handlerParams.getValue(node)),
  }
}
