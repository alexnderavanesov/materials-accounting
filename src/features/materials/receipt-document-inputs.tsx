import { DateInput } from '#/components/ui/date-input'
import type { ReactNode } from 'react'
import { AppSelect } from '#/components/ui/app-select'
import { Input } from '#/components/ui/input'
import { normalizeDocumentNumber } from './document-number'
import { localDateInputValue } from './calendar-date'
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
  renderScan,
  flat = false,
}: {
  flat?: boolean
  fields: ReceiptDocumentFields
  documents: Array<ReceiptDocument>
  onChange: (fields: ReceiptDocumentFields) => void
  renderScan?: (
    kind: ReceiptDocument['kind'],
    fields: ReceiptDocumentFields,
  ) => ReactNode
}) {
  return (
    <div className={flat ? 'min-w-0' : 'col-span-full min-w-0'}>
      {(['app'] as const).map((kind) => {
        const title = receiptDocumentKindLabel(kind)
        const options = documents.filter((doc) => doc.kind === kind)
        const selectDocument = (value: string) => {
          const document = options.find((doc) => doc.id === value)
          onChange({
            ...fields,
            [`${kind}Number`]:
              document?.number ?? normalizeDocumentNumber(value),
            [`${kind}Date`]:
              document?.date ??
              (value ? fields[`${kind}Date`] || localDateInputValue() : ''),
          })
        }
        return (
          <fieldset
            key={kind}
            className={`grid min-w-0 gap-3 sm:grid-cols-2 ${flat ? '' : 'rounded-lg border border-slate-200 bg-white p-3'}`}
          >
            <legend className={flat ? 'sr-only' : 'px-1 text-sm font-medium'}>
              {title}
            </legend>
            <div className="grid min-w-0 gap-1 text-sm">
              <span>Номер {title}</span>
              <div className="flex min-w-0 gap-1">
                <>
                  <Input
                    aria-label="Номер АПП"
                    placeholder="Введите номер"
                    className="min-w-0 flex-1"
                    value={fields.appNumber}
                    onChange={(event) => {
                      const number = normalizeDocumentNumber(event.target.value)
                      onChange({
                        ...fields,
                        appNumber: number,
                        appDate: number.trim()
                          ? fields.appDate || localDateInputValue()
                          : '',
                      })
                    }}
                  />
                </>
                <AppSelect
                  label="Выбрать существующий АПП"
                  iconOnly
                  value={
                    options.find(
                      (doc) =>
                        normalizeDocumentNumber(doc.number) ===
                          normalizeDocumentNumber(fields[`${kind}Number`]) &&
                        doc.date === fields[`${kind}Date`],
                    )?.id ?? fields[`${kind}Number`]
                  }
                  options={[
                    {
                      value: '',
                      label: 'Введите или выберите АПП',
                    },
                    ...options.map((doc) => ({
                      value: doc.id,
                      label: receiptDocumentLabel(doc),
                    })),
                  ]}
                  onChange={selectDocument}
                />
              </div>
            </div>
            <div className="flex min-w-0 items-end gap-1">
              <label className="grid min-w-0 flex-1 gap-1 text-sm">
                Дата {title}
                <DateInput
                  aria-label={`Дата ${title}`}
                  // An unused document shows today's default without requiring
                  // its number or adding it to the receipt until the user types one.
                  value={
                    fields[`${kind}Date`] ||
                    (!fields[`${kind}Number`] ? localDateInputValue() : '')
                  }
                  onValueChange={(value) =>
                    onChange({ ...fields, [`${kind}Date`]: value })
                  }
                />
              </label>
              {renderScan?.(kind, fields)}
            </div>
          </fieldset>
        )
      })}
    </div>
  )
}
