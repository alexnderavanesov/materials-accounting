import { jsonEqual } from './workspace-protocol'
import type { Json } from './workspace-protocol'
import type { EditConflict } from './workspace-collaboration'

const labels: Record<string, string> = {
  lines: 'Строки М-15',
  allocations: 'Сопоставления с поступлениями',
  quantity: 'Количество',
  plannedQuantity: 'По проекту',
  projectMaterialName: 'Материал',
  actualName: 'Фактическое наименование',
  date: 'Дата',
  number: 'Номер',
  document: 'Документ',
  note: 'Примечание',
  requestNote: 'Примечание заявки',
  unit: 'Единица',
  projectUnit: 'Единица',
  cipher: 'Шифр',
  receiver: 'Получатель',
  requester: 'Заявитель',
  revisions: 'Ревизии ЗНИ / АВК',
  lastValue: 'Счётчик',
  pattern: 'Формат номера',
  padding: 'Число цифр',
  material: 'Марка / сплав',
  materialType: 'Тип материала',
  description: 'Описание',
  name: 'Название',
}
const display = (value: Json | undefined) =>
  value === undefined || value === null
    ? '—'
    : typeof value === 'object'
      ? JSON.stringify(value, null, 2)
      : String(value)
export function WorkspaceConflicts({
  conflicts,
  resolve,
}: {
  conflicts: EditConflict[]
  resolve: (choice: 'mine' | 'server') => Promise<void>
}) {
  return (
    <details
      className="shrink-0 border-b border-amber-300 bg-amber-50 p-3 text-sm"
      open
    >
      <summary className="cursor-pointer font-medium">
        Сравнение одновременных изменений ({conflicts.length})
      </summary>
      <div className="my-3 max-h-72 overflow-auto">
        {conflicts.map((conflict) => {
          const objects = [conflict.before, conflict.mine, conflict.theirs].map(
            (value) =>
              value && typeof value === 'object' && !Array.isArray(value)
                ? value
                : { value },
          )
          const keys = [...new Set(objects.flatMap(Object.keys))].filter(
            (key) =>
              !jsonEqual(objects[0]![key], objects[1]![key]) ||
              !jsonEqual(objects[0]![key], objects[2]![key]),
          )
          const title =
            objects[1]!.projectMaterialName ??
            objects[1]!.actualName ??
            objects[1]!.number ??
            objects[1]!.name ??
            conflict.key
          return (
            <div className="mb-3" key={conflict.key}>
              <p className="mb-1 font-medium">{display(title)}</p>
              <table className="w-full table-fixed border-collapse bg-white text-left text-xs">
                <thead>
                  <tr>
                    {['Поле', 'Было', 'Ваше изменение', 'Сейчас в базе'].map(
                      (name) => (
                        <th className="border p-2" key={name}>
                          {name}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {keys.map((key) => (
                    <tr key={key}>
                      <th className="border p-2 align-top">
                        {labels[key] ?? key}
                      </th>
                      {objects.map((object, index) => (
                        <td className="border p-2 align-top" key={index}>
                          <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words font-sans">
                            {display(object[key])}
                          </pre>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          className="rounded border bg-white px-3 py-2"
          onClick={() => void resolve('mine')}
        >
          Сохранить мои изменения
        </button>
        <button
          className="rounded border bg-white px-3 py-2"
          onClick={() => void resolve('server')}
        >
          Принять значения из базы
        </button>
      </div>
      <p className="mt-2 text-xs text-stone-600">
        Выбор относится к конфликтующим записям. Остальные ваши правки
        сохранятся; проверки остатков и подписанных документов выполняются
        повторно.
      </p>
    </details>
  )
}
