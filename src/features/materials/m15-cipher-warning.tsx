import { Button } from '#/components/ui/button'
import { WorkflowDialog } from './workflow-dialog'
import type { M15CipherBalance } from './m15-independent'

const format = (value: number | null) =>
  value?.toLocaleString('ru-RU', { maximumFractionDigits: 9 }) ?? '—'

export function M15CipherWarning({
  cipher,
  rows,
  onClose,
  onContinue,
}: {
  cipher: string
  rows: M15CipherBalance[]
  onClose: () => void
  onContinue: () => void
}) {
  return (
    <WorkflowDialog
      title="Превышение по шифру"
      compact
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Вернуться к количествам
          </Button>
          <Button onClick={onContinue}>Продолжить с превышением</Button>
        </>
      }
    >
      <p className="text-sm text-slate-600">
        С учётом этой накладной количество по М-15 превышает проектное
        количество по шифру {cipher}. Можно исправить количество или продолжить:
        превышение будет видно в сверке материалов.
      </p>
      <ul className="grid max-h-80 gap-3 overflow-auto">
        {rows.slice(0, 50).map((row) => (
          <li
            key={row.projectLineId}
            className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm"
          >
            <p className="font-medium text-slate-800">{row.name}</p>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-slate-600">
              <dt>По шифру</dt>
              <dd className="text-right">
                {format(row.planned)} {row.unit}
              </dd>
              <dt>Другие М-15</dt>
              <dd className="text-right">
                {format(row.documented)} {row.unit}
              </dd>
              <dt>Эта М-15</dt>
              <dd className="text-right">
                {format(row.draft)} {row.unit}
              </dd>
              <dt>Итого по М-15</dt>
              <dd className="text-right">
                {format(row.total)} {row.unit}
              </dd>
              <dt className="font-medium text-amber-900">Превышение</dt>
              <dd className="text-right font-medium text-amber-900">
                {format(row.excess)} {row.unit}
              </dd>
            </dl>
          </li>
        ))}
      </ul>
      {rows.length > 50 && (
        <p className="text-sm text-slate-600">
          Ещё позиций с превышением: {rows.length - 50}. Подтверждение относится
          ко всем {rows.length} позициям.
        </p>
      )}
    </WorkflowDialog>
  )
}
