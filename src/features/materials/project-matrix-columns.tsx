import { useState } from 'react'

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
