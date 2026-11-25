import { useEffect, useMemo, useRef, useState } from 'react'
import { requiredDocumentScanError } from './document-file-limits'
import { Button } from '#/components/ui/button'
import { receiptDocumentKey, receiptDocumentLabel } from './receipt-documents'
import { normalizeDocumentNumber } from './document-number'
import { normalizeCalendarDate } from './calendar-date'
import { DocumentScanDialog, ScanPaperclip } from './document-scan-picker'
import { loadDocumentCatalog, uploadDocumentScans } from './document-scans'
import type { ScanSelection, DocumentCatalog } from './document-scans'
import type {
  ReceiptDocument,
  ReceiptDocumentFields,
} from './receipt-documents'

import type { DocumentFile } from './document-registry'
import type { M15Reconciliation } from './m15-reconciliation'

type ScanField =
  | 'certificate'
  | 'qualityDocument'
  | 'customerArvk'
  | 'technicalDecision'
type ScanReceipt = {
  id: string
  projectLineId?: string
  appDocumentId?: string
  m15DocumentId?: string
} & Record<ScanField, string>
export type ReceiptScanTarget =
  | {
      type: 'document'
      document: Pick<ReceiptDocument, 'kind' | 'number' | 'date'>
      label: string
    }
  | {
      type: 'field'
      receiptId: string
      field: ScanField
      value: string
      label: string
    }
type PendingScan = { target: ReceiptScanTarget; selection: ScanSelection }
export const receiptScanKey = (target: ReceiptScanTarget) =>
  target.type === 'document'
    ? receiptDocumentKey({
        ...target.document,
        number: normalizeDocumentNumber(target.document.number),
      })
    : JSON.stringify([target.receiptId, target.field, target.value.trim()])
export function receiptScanDocumentId(
  target: ReceiptScanTarget,
  documents: ReceiptDocument[],
) {
  if (target.type === 'field')
    return JSON.stringify(['receipt-field', target.receiptId, target.field])
  const exact = receiptDocumentKey(target.document)
  const normalized = receiptScanKey(target)
  const document =
    documents.find((doc) => receiptDocumentKey(doc) === exact) ??
    documents.find(
      (doc) =>
        receiptDocumentKey({
          ...doc,
          number: normalizeDocumentNumber(doc.number),
        }) === normalized,
    )
  return document ? JSON.stringify(['receipt-document', document.id]) : null
}
export function resolveReceiptScan(
  target: ReceiptScanTarget,
  entries: ScanReceipt[],
  documents: ReceiptDocument[],
  records: M15Reconciliation[] = [],
) {
  const id = receiptScanDocumentId(target, documents)
  const used =
    target.type === 'field'
      ? entries.some(
          (entry) =>
            entry.id === target.receiptId &&
            entry[target.field].trim() === target.value.trim(),
        )
      : entries.some((entry) =>
          [entry.appDocumentId, entry.m15DocumentId].some(
            (value) =>
              value && JSON.stringify(['receipt-document', value]) === id,
          ),
        )
  const linkedM15 =
    target.type === 'document' &&
    target.document.kind === 'm15' &&
    records.some(
      (record) =>
        JSON.stringify(['receipt-document', record.id]) === id &&
        record.allocations.some((link) =>
          entries.some((entry) => entry.id === link.receiptId),
        ),
    )
  if (!id || (!used && !linkedM15))
    throw new Error(
      `«${target.label}»: реквизиты изменены или материал не включён в получение. Уберите эти файлы из списка и прикрепите к нужному документу.`,
    )
  return id
}

export function useReceiptScans(open: boolean, documents: ReceiptDocument[]) {
  const [catalog, setCatalog] = useState<DocumentCatalog | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [pending, setPending] = useState<Record<string, PendingScan>>({})
  const pendingRef = useRef(pending)
  pendingRef.current = pending
  const [active, setActive] = useState<ReceiptScanTarget | null>(null)
  const generation = useRef(0)
  const filesByDocument = useMemo(() => {
    const result = new Map<string, DocumentFile[]>()
    for (const file of catalog?.manifest.files ?? []) {
      const files = result.get(file.documentId) ?? []
      files.push(file)
      result.set(file.documentId, files)
    }
    return result
  }, [catalog])
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (open && Object.keys(pendingRef.current).length) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [open])
  async function refresh() {
    const current = ++generation.current
    setLoading(true)
    setError('')
    try {
      const result = await loadDocumentCatalog()
      if (current === generation.current) setCatalog(result)
    } catch (cause) {
      if (current === generation.current)
        setError(
          cause instanceof Error
            ? cause.message
            : 'Не удалось прочитать файлы.',
        )
    } finally {
      if (current === generation.current) setLoading(false)
    }
  }
  useEffect(() => {
    if (open) {
      setPending({})
      setActive(null)
      void refresh()
    }
    return () => {
      generation.current++
    }
  }, [open])
  function show(target: ReceiptScanTarget) {
    setActive(target)
    void refresh()
  }
  function forget(key: string) {
    const next = { ...pendingRef.current }
    delete next[key]
    pendingRef.current = next
    setPending(next)
  }
  function stored(target: ReceiptScanTarget) {
    const id = receiptScanDocumentId(target, documents)
    return id ? (filesByDocument.get(id) ?? []) : []
  }
  function clip(target: ReceiptScanTarget) {
    return (
      <ScanPaperclip
        label={target.label}
        count={stored(target).length}
        pending={pending[receiptScanKey(target)]?.selection.files.length}
        onClick={() => show(target)}
      />
    )
  }
  function documentClip(
    kind: ReceiptDocument['kind'],
    fields: ReceiptDocumentFields,
  ) {
    const number = fields[`${kind}Number`],
      date = fields[`${kind}Date`]
    const document = { kind, number, date }
    return clip({
      type: 'document',
      document,
      label: number
        ? receiptDocumentLabel({ ...document, id: '' })
        : kind === 'app'
          ? 'АПП'
          : 'М-15',
    })
  }
  function fieldClip(
    receiptId: string,
    field: ScanField,
    value: string,
    label: string,
  ) {
    return clip({
      type: 'field',
      receiptId,
      field,
      value,
      label: `${label}${value.trim() ? `: ${value.trim()}` : ''}`,
    })
  }
  const activeKey = active ? receiptScanKey(active) : ''
  return {
    hasPending: Object.keys(pending).length > 0,
    documentClip,
    fieldClip,
    validate(
      entries: ScanReceipt[],
      docs: ReceiptDocument[],
      records: M15Reconciliation[],
    ) {
      for (const { target } of Object.values(pendingRef.current))
        resolveReceiptScan(target, entries, docs, records)
    },
    async uploadRequired(
      entries: ScanReceipt[],
      docs: ReceiptDocument[],
      records: M15Reconciliation[],
    ) {
      let current = await loadDocumentCatalog()
      const appIds = new Set(entries.map((entry) => entry.appDocumentId))
      for (const id of appIds) {
        const doc = docs.find((item) => item.id === id && item.kind === 'app')
        if (!doc)
          throw new Error('Укажите АПП и прикрепите обязательный документ.')
        const documentId = JSON.stringify(['receipt-document', doc.id])
        const pendingDocument = Object.values(pendingRef.current).find(
          ({ target }) =>
            target.type === 'document' &&
            receiptScanDocumentId(target, docs) === documentId,
        )
        const scanError = requiredDocumentScanError(
          'app',
          pendingDocument?.selection.files.length
            ? pendingDocument.selection.files
            : current.manifest.files.filter(
                (file) => file.documentId === documentId,
              ),
        )
        if (scanError)
          throw new Error(
            `${receiptDocumentLabel(doc)}: ${scanError} Прикрепите файл через скрепку рядом с реквизитами АПП.`,
          )
      }
      for (const [key, { target, selection }] of Object.entries(
        pendingRef.current,
      )) {
        if (target.type !== 'document') continue
        const documentId = resolveReceiptScan(target, entries, docs, records)
        const doc = docs.find(
          (item) =>
            JSON.stringify(['receipt-document', item.id]) === documentId,
        )!
        const manifest = await uploadDocumentScans(documentId, selection, {
          ...doc,
          lineIds: [
            ...new Set(
              entries
                .filter((entry) => entry.appDocumentId === doc.id)
                .map((entry) => entry.projectLineId)
                .filter((id): id is string => !!id),
            ),
          ],
        })
        if (manifest) {
          current = { ...current, manifest }
          setCatalog(current)
        }
        forget(key)
      }
    },
    async upload(
      entries: ScanReceipt[],
      docs: ReceiptDocument[],
      records: M15Reconciliation[],
    ) {
      for (const [key, { target, selection }] of Object.entries(
        pendingRef.current,
      )) {
        await uploadDocumentScans(
          resolveReceiptScan(target, entries, docs, records),
          selection,
        )
        forget(key)
      }
    },
    summary: Object.keys(pending).length > 0 && (
      <section
        aria-label="Выбранные сканы"
        className="mb-4 grid gap-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm"
      >
        <p className="font-medium">Сканы документов к получению</p>
        {Object.entries(pending).map(([key, { target, selection }]) => (
          <div key={key} className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1 break-words">
              {target.label} · {selection.files.length} файл(ов)
              {selection.replace ? ' · замена прежних' : ''}
            </span>
            <Button size="sm" variant="outline" onClick={() => show(target)}>
              Проверить файлы
            </Button>
            <Button size="sm" variant="ghost" onClick={() => forget(key)}>
              Убрать
            </Button>
          </div>
        ))}
      </section>
    ),
    dialog: active && (
      <DocumentScanDialog
        key={activeKey}
        label={active.label}
        stored={stored(active)}
        initial={pending[activeKey]?.selection}
        loading={loading}
        error={error}
        requirement={
          active.type === 'document'
            ? !active.document.number.trim() ||
              !normalizeCalendarDate(active.document.date)
              ? 'Сначала укажите номер и дату документа в форме получения, затем прикрепите скан.'
              : ''
            : !active.value.trim()
              ? 'Сначала заполните реквизиты этого документа в дополнительных сведениях, затем прикрепите скан.'
              : ''
        }
        onRefresh={() => void refresh()}
        onClose={() => setActive(null)}
        onConfirm={(selection) => {
          if (!selection.files.length) forget(activeKey)
          else
            setPending((current) => ({
              ...current,
              [activeKey]: { target: active, selection },
            }))
          setActive(null)
        }}
      />
    ),
  }
}
