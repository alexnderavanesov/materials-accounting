import { useState } from 'react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import {
  documentKinds,
  documentLabels,
  documentNumberingSchema,
  initialNumbering,
  numberTokens,
  suggestDocumentNumber,
} from './document-numbering'
import type {
  DocumentKind,
  DocumentNumbering,
  NumberHistory,
} from './document-numbering'
import { localDateInputValue } from './calendar-date'

export function DocumentNumberingSettings({
  value,
  history,
  onSave,
}: {
  value?: DocumentNumbering
  history: NumberHistory
  onSave: (next: DocumentNumbering) => void
}) {
  const [draft, setDraft] = useState(() => value ?? initialNumbering(history))
  const [kind, setKind] = useState<DocumentKind>('request')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const rule = draft[kind]
  const update = (patch: Partial<typeof rule>) => {
    setDraft((current) => ({
      ...current,
      [kind]: { ...current[kind], ...patch },
    }))
    setError('')
    setSaved(false)
  }
  const parsed = documentNumberingSchema.safeParse(draft)
  let preview = '—'
  if (parsed.success) {
    try {
      preview = suggestDocumentNumber(parsed.data, history, kind, {
        date: localDateInputValue(),
        cipher: 'ТК1',
        materialType: 'Трубопроводы',
      }).number
    } catch {
      preview = 'Счётчик исчерпан'
    }
  }
  return (
    <section
      className="grid content-start gap-5 rounded-lg border bg-white p-5"
      aria-label="Нумерация документов"
    >
      <label className="grid gap-2 text-sm">
        Документ
        <select
          className="h-10 rounded-md border bg-white px-3"
          value={kind}
          onChange={(event) => {
            setKind(event.target.value as DocumentKind)
            setError('')
          }}
        >
          {documentKinds.map((item) => (
            <option key={item} value={item}>
              {documentLabels[item]}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-2 text-sm">
        Шаблон номера
        <Input
          value={rule.pattern}
          onChange={(event) => update({ pattern: event.target.value })}
        />
      </label>
      <div className="flex flex-wrap gap-2" aria-label="Поля номера">
        {numberTokens.map((token) => (
          <Button
            key={token}
            size="sm"
            variant="outline"
            onClick={() => update({ pattern: rule.pattern + `{${token}}` })}
          >
            {token.charAt(0).toUpperCase() + token.slice(1)}
          </Button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm">
          Цифр в порядковом номере
          <Input
            type="number"
            min="1"
            max="9"
            value={rule.padding}
            onChange={(event) =>
              update({ padding: Number(event.target.value) })
            }
          />
        </label>
        <label className="grid gap-2 text-sm">
          Текущее значение счётчика
          <div className="flex gap-2">
            <Input
              type="number"
              min="0"
              max="999999999"
              value={rule.lastValue}
              onChange={(event) =>
                update({ lastValue: Number(event.target.value) })
              }
            />
            <Button variant="outline" onClick={() => update({ lastValue: 0 })}>
              Обнулить
            </Button>
          </div>
        </label>
      </div>
      <div className="rounded-md bg-slate-50 p-4">
        <div className="mb-1 text-xs text-slate-500">
          Следующий номер · пример
        </div>
        <output className="break-words font-medium">{preview}</output>
      </div>
      <p className="text-sm text-slate-500">
        Сохранённые номера не меняются. Занятые номера пропускаются. АПП и М-15
        сохраняют номера заказчика.
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="text-sm text-emerald-700">
          Настройки нумерации применены.
        </p>
      )}
      <div className="flex gap-2">
        <Button
          onClick={() => {
            const result = documentNumberingSchema.safeParse(draft)
            if (!result.success) {
              setError(
                result.error.issues[0]?.message ?? 'Проверьте настройки.',
              )
              return
            }
            try {
              onSave(result.data)
              setSaved(true)
              setError('')
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : 'Не удалось сохранить настройки.',
              )
            }
          }}
        >
          Сохранить
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setDraft(value ?? initialNumbering(history))
            setError('')
            setSaved(false)
          }}
        >
          Отменить изменения
        </Button>
      </div>
    </section>
  )
}
