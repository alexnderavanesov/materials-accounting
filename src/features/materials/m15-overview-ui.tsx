import { formatM15Total } from './m15-overview'
import type { M15Overview } from './m15-overview'

export function M15OverviewPanel({
  overview,
  onlyProblems,
  onOnlyProblems,
  pending,
}: {
  overview: M15Overview
  onlyProblems: boolean
  onOnlyProblems: (value: boolean) => void
  pending: boolean
}) {
  return (
    <section
      aria-label="Общая сверка М-15"
      className="grid shrink-0 gap-3 rounded-xl border border-slate-200 bg-white p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">Общая сверка М-15 с получениями</h3>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onlyProblems}
            onChange={(event) => onOnlyProblems(event.target.checked)}
          />
          Только требующие проверки
        </label>
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        <span className="rounded bg-slate-100 px-2 py-1">
          Всего М-15: {overview.documents.size}
        </span>
        <span className="rounded bg-emerald-50 px-2 py-1 text-emerald-800">
          Совпадают: {overview.matched}
        </span>
        <span className="rounded bg-amber-50 px-2 py-1 text-amber-900">
          С расхождениями: {overview.differences}
        </span>
        {overview.incomplete > 0 && (
          <span className="rounded bg-slate-100 px-2 py-1">
            Не заполнены полностью: {overview.incomplete}
          </span>
        )}
        {overview.conversion > 0 && (
          <span className="rounded bg-amber-50 px-2 py-1 text-amber-900">
            Нужен пересчёт единиц: {overview.conversion}
          </span>
        )}
      </div>
      {overview.totals.length ? (
        <div className="max-h-48 overflow-auto">
          <table
            className="w-full min-w-[580px] text-left text-sm"
            aria-label="Итоги сверки по единицам"
          >
            <thead className="sticky top-0 bg-slate-50 text-slate-600">
              <tr>
                {[
                  'Единица',
                  'По М-15',
                  'Получено',
                  'Недостаёт',
                  'Больше по получениям',
                ].map((label) => (
                  <th key={label} className="px-3 py-2 font-medium">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {overview.totals.map((total) => (
                <tr key={total.unit} className="border-t border-slate-100">
                  <th className="px-3 py-2 font-medium">{total.unit || '—'}</th>
                  <td className="px-3 py-2 tabular-nums">
                    {formatM15Total(total.documented)}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {formatM15Total(total.received)}
                  </td>
                  <td
                    className={`px-3 py-2 tabular-nums ${total.shortage ? 'font-medium text-amber-800' : 'text-slate-400'}`}
                  >
                    {total.shortage ? formatM15Total(total.shortage) : '—'}
                  </td>
                  <td
                    className={`px-3 py-2 tabular-nums ${total.excess ? 'font-medium text-amber-800' : 'text-slate-400'}`}
                  >
                    {total.excess ? formatM15Total(total.excess) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          {overview.documents.size
            ? 'Итог появится после ввода количеств по М-15.'
            : 'Учётных М-15 пока нет.'}
        </p>
      )}

      {overview.unlinkedReceipts > 0 && (
        <p className="text-xs text-amber-800">
          Получений без учётной М-15: {overview.unlinkedReceipts}. В эти итоги
          они не включены.
        </p>
      )}
      {pending && (
        <p role="status" className="text-xs text-amber-800">
          Есть изменения сверок, сохранение которых ещё не подтверждено.
        </p>
      )}
    </section>
  )
}
