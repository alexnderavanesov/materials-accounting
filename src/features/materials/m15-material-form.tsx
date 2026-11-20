import { useState } from 'react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { m15LineSchema } from './m15-reconciliation'
import type { M15Line } from './m15-reconciliation'

export function M15MaterialForm({
  onAdd,
  onCancel,
}: {
  onAdd: (line: M15Line) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(''),
    [unit, setUnit] = useState(''),
    [quantity, setQuantity] = useState(''),
    [error, setError] = useState('')
  return (
    <form
      aria-label="Добавление материала в М-15"
      className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
      onSubmit={(event) => {
        event.preventDefault()
        const raw = quantity
          .trim()
          .replace(/[\s\u00a0\u202f]/g, '')
          .replace(',', '.')
        const parsed = m15LineSchema.safeParse({
          id: crypto.randomUUID(),
          position: '',
          name: name.trim(),
          unit: unit.trim(),
          quantity: Number(raw),
        })
        if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw) || !parsed.success) {
          setError(
            'Заполните наименование, единицу и количество: ноль или положительное число.',
          )
          return
        }
        try {
          onAdd(parsed.data)
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Не удалось добавить материал.',
          )
        }
      }}
    >
      <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_110px_160px]">
        <label className="grid gap-1 text-sm">
          Наименование по М-15
          <Input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="grid gap-1 text-sm">
          Единица
          <Input
            placeholder="м, шт, кг…"
            value={unit}
            onChange={(event) => setUnit(event.target.value)}
          />
        </label>
        <label className="grid gap-1 text-sm">
          Количество по М-15
          <Input
            inputMode="decimal"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </label>
      </div>
      <p className="text-xs text-slate-500">
        Если такой материал с этой единицей уже есть, количество будет
        прибавлено к нему.
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit">Добавить в состав</Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Отмена добавления
        </Button>
      </div>
    </form>
  )
}
