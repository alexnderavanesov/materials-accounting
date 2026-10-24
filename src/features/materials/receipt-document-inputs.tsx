import { useId } from 'react'
import { Input } from '#/components/ui/input'
import {
  receiptDocumentKindLabel,
  receiptDocumentLabel,
} from './receipt-documents'
import type {
  ReceiptDocument,
  ReceiptDocumentFields,
} from './receipt-documents'

export function ReceiptDocumentInputs({
  fields,
  documents,
  onChange,
}: {
  fields: ReceiptDocumentFields
  documents: Array<ReceiptDocument>
  onChange: (fields: ReceiptDocumentFields) => void
}) {
  const id = useId()
  return (
    <div className="col-span-full grid gap-3 sm:grid-cols-2">
      {(['app', 'm15'] as const).map((kind) => {
        const title = receiptDocumentKindLabel(kind)
        const options = documents.filter((doc) => doc.kind === kind)
        return (
          <fieldset
            key={kind}
            className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-white p-3"
          >
            <legend className="px-1 text-sm font-medium">{title}</legend>
            <label className="grid gap-1 text-sm">
              Номер {title}
              <Input
                aria-label={`Номер ${title}`}
                list={`${id}-${kind}`}
                value={fields[`${kind}Number`]}
                onChange={(event) => {
                  const number = event.target.value
                  const matching = options.filter(
                    (doc) => doc.number === number,
                  )
                  onChange({
                    ...fields,
                    [`${kind}Number`]: number,
                    ...(matching.length === 1
                      ? { [`${kind}Date`]: matching[0]!.date }
                      : {}),
                  })
                }}
              />
              <datalist id={`${id}-${kind}`}>
                {options.map((doc) => (
                  <option key={doc.id} value={doc.number}>
                    {receiptDocumentLabel(doc)}
                  </option>
                ))}
              </datalist>
            </label>
            <label className="grid gap-1 text-sm">
              Дата {title}
              <Input
                aria-label={`Дата ${title}`}
                type="date"
                value={fields[`${kind}Date`]}
                onChange={(event) =>
                  onChange({ ...fields, [`${kind}Date`]: event.target.value })
                }
              />
            </label>
          </fieldset>
        )
      })}
      <p className="col-span-full text-xs text-slate-500">
        Укажите номер и дату хотя бы одного документа. М-15 можно добавить к
        этому поступлению позднее.
      </p>
    </div>
  )
}
