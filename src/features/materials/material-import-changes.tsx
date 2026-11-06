import type { MaterialImportPreview } from './project-material-data'
import type { NormalizedImportRow } from './types'

const numberFormat = new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 12,
})
const formatValue = (value: string | number) =>
  typeof value === 'number' ? numberFormat.format(value) : value || 'не указано'

export function MaterialImportChanges({
  preview,
  row,
}: {
  preview: MaterialImportPreview
  row: NormalizedImportRow
}) {
  if (preview.supersededBy !== null) {
    return (
      <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        Эта позиция повторяется в файле. Будут применены значения из позиции №
        {preview.supersededBy}; сравнение с базой показано у неё.
      </p>
    )
  }
  if (!preview.existing) {
    return (
      <p className="mt-3 text-sm text-slate-600">
        {preview.existingMaterial
          ? 'Материал уже есть в базе. Количество добавится в новый для него шифр.'
          : 'Будет добавлена новая позиция материала.'}
      </p>
    )
  }
  if (preview.changes.length === 0) {
    return (
      <p className="mt-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
        Совпадение без изменений. Количество по шифру:{' '}
        {formatValue(row.quantity)} {row.unit}.
      </p>
    )
  }
  return (
    <div className="mt-3 overflow-hidden rounded-md border border-amber-200 bg-white">
      <p className="bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950">
        Существующая позиция будет изменена
      </p>
      <table
        className="w-full table-fixed text-left text-sm"
        aria-label="Изменения существующей позиции"
      >
        <thead className="bg-slate-50 text-xs text-slate-500">
          <tr>
            <th className="w-1/2 px-3 py-2 font-medium">Показатель</th>
            <th className="w-1/4 px-3 py-2 font-medium">Было</th>
            <th className="w-1/4 px-3 py-2 font-medium">Станет</th>
          </tr>
        </thead>
        <tbody>
          {preview.changes.map((change) => (
            <tr key={change.field} className="border-t border-slate-100">
              <th className="break-words px-3 py-2 font-normal text-slate-600">
                {change.label}
              </th>
              <td className="break-words px-3 py-2 text-slate-600">
                {formatValue(change.before)}
                {change.field === 'plannedQuantity' ? ` ${row.unit}` : ''}
              </td>
              <td className="break-words px-3 py-2 font-medium text-slate-900">
                {formatValue(change.after)}
                {change.field === 'plannedQuantity' ? ` ${row.unit}` : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
