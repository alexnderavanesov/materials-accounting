import { receiptDocumentLabel } from './receipt-documents'
import { getOperationAlternative, getOperationConversion } from './domain'
import type { SubobjectMaterialMetric } from './types'
import type { WorkspaceSnapshot } from './workspace-snapshot'
import type { QualityPrintData, QualityPrintKind } from './quality-print'
import { findInspectionMaterial, resultLabels } from './quality-workflow'

const dateText = (value: string | null) =>
  value ? value.split('-').reverse().join('.') : ''
export function buildQualityPrintData(
  workspace: WorkspaceSnapshot,
  caseId: string,
  revisionNumber: number,
  kind: QualityPrintKind,
): QualityPrintData {
  const entry = workspace.qualityWorkflow?.cases.find(
    (item) => item.id === caseId,
  )
  const revision = entry?.revisions.find(
    (item) => item.revision === revisionNumber,
  )
  if (!entry || !revision) throw new Error('Документ или ревизия не найдены.')
  const { zni, avk } = revision
  if (kind === 'avk' && !avk) throw new Error('АВК этой ревизии ещё не создан.')
  const lines = workspace.lines as unknown as Array<SubobjectMaterialMetric>
  const acceptedAct = kind === 'avk'
  const materials = zni.rows
    .filter((row) => !acceptedAct || (row.accepted ?? 0) > 0)
    .map((row, index) => {
      const receipt = workspace.materialReceipts.find(
        (item) => item.id === row.receiptId,
      )
      const previous = {
        quantity: Number(receipt?.quantity ?? row.presented),
        projectUnit: row.unit,
        altUnit: String(receipt?.altUnit ?? row.altUnit),
        altUnitFactor:
          (receipt?.altUnitFactor as number | null | undefined) ??
          row.altUnitFactor,
        altQuantity: (receipt?.altQuantity as number | null) ?? null,
      }
      const conversion = getOperationConversion(
        findInspectionMaterial(lines, row.projectLineId),
        row.unit,
        previous,
      )
      const alternative = getOperationAlternative(
        acceptedAct ? row.accepted : row.presented,
        conversion,
        previous,
      )
      const acceptedAlternative = getOperationAlternative(
        row.accepted,
        conversion,
        row.accepted === null ? null : previous,
      )
      if (alternative.error || acceptedAlternative.error)
        throw new Error(alternative.error || acceptedAlternative.error)
      return {
        index: index + 1,
        name: row.name,
        cipher: row.cipher,
        factoryNumber: row.factoryNumber,
        heatBatch: row.heatBatch,
        quantity: acceptedAct ? row.accepted : row.presented,
        accepted: row.accepted,
        unit: row.unit,
        altQuantity: alternative.altQuantity,
        altAccepted: acceptedAlternative.altQuantity,
        altUnit: alternative.altUnit,
        document: row.document,
        alloy: row.alloy,
        remarks: row.remarks,
        receiptDocument: `${entry.basis.kind === 'app' ? 'АПП' : 'М-15'} №${entry.basis.number}`,
        receiptDocumentDate: dateText(entry.basis.date),
        appNumber: row.appNumber ?? '',
        appDate: dateText(row.appDate ?? ''),
      }
    })
  const partial = zni.rows
    .filter((row) => row.result && (row.result !== 'accepted' || row.remarks))
    .map(
      (row) =>
        `${row.name}${row.factoryNumber ? ` (зав. №${row.factoryNumber})` : ''}: предъявлено ${row.presented} ${row.unit}; принято ${row.accepted ?? '—'} ${row.unit}; не принято ${row.accepted === null ? '—' : Number((row.presented - row.accepted).toPrecision(15))} ${row.unit}. ${resultLabels[row.result]}. ${row.remarks}`,
    )
    .join('\n')
  const complete = zni.rows.every((row) => row.result && row.accepted !== null)
  const result = !complete
    ? ''
    : zni.rows.every((row) => row.result === 'accepted')
      ? 'accepted'
      : zni.rows.every((row) => row.result === 'rejected')
        ? 'rejected'
        : 'remarks'
  const materialDescription = zni.rows
    .map((row) =>
      [
        `${row.name} — ${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 9 }).format(row.presented)} ${row.unit}`,
        row.requestNumber ? `заявка ${row.requestNumber}` : '',
        row.cipher ? `шифр ${row.cipher}` : '',
        row.factoryNumber ? `зав. №${row.factoryNumber}` : '',
        row.heatBatch ? `партия ${row.heatBatch}` : '',
      ]
        .filter(Boolean)
        .join(', '),
    )
    .join(';\n')
  const documentDate = kind === 'zni' ? zni.date : avk!.date
  const appNumbers = [
    ...new Set(materials.map((row) => row.appNumber).filter(Boolean)),
  ].join('; ')
  const appDates = [
    ...new Set(materials.map((row) => row.appDate).filter(Boolean)),
  ].join('; ')
  const fields: QualityPrintData['fields'] = {
    ...zni.details,
    processVersion: entry.processVersion,
    number: kind === 'zni' ? zni.number : avk!.number,
    date: dateText(documentDate),
    day: Number(documentDate.slice(8)),
    month: [
      'января',
      'февраля',
      'марта',
      'апреля',
      'мая',
      'июня',
      'июля',
      'августа',
      'сентября',
      'октября',
      'ноября',
      'декабря',
    ][Number(documentDate.slice(5, 7)) - 1]!,
    year: Number(documentDate.slice(0, 4)),
    signatureLine: `Дата ${dateText(kind === 'zni' ? zni.signedOn : avk!.signedOn) || '__________'}  Подпись __________`,
    revision: `РЕВИЗИЯ ${revision.revision}`,
    signedOn: dateText(kind === 'zni' ? zni.signedOn : avk!.signedOn),
    zniNumber: zni.number,
    zniDate: dateText(zni.date),
    zniSignedOn: dateText(zni.signedOn),
    basisLabel: receiptDocumentLabel(entry.basis),
    basisNumber: entry.basis.number,
    basisDate: dateText(entry.basis.date),
    appNumber: appNumbers,
    appDate: appDates,
    inspectionDate: dateText(zni.inspectionDate),
    inspectionTime: zni.inspectionTime,
    description: `Входной контроль материалов по ${receiptDocumentLabel(entry.basis)}.
${materialDescription}`,
    materials: [...new Set(materials.map((row) => row.name))].join('; '),
    ciphers: [
      ...new Set(zni.rows.map((row) => row.cipher).filter(Boolean)),
    ].join('; '),
    remarks: [zni.remarks, partial].filter(Boolean).join('\n'),
    acceptedMark: result === 'accepted' ? '☑' : '☐',
    remarksMark: result === 'remarks' ? '☑' : '☐',
    rejectedMark: result === 'rejected' ? '☑' : '☐',
    contractorRole: zni.details.contractorRole,
    generalRole: zni.details.generalRole,
    customerRole: zni.details.customerRole,
    buyer: avk?.buyer ?? '',
    supplier: avk?.supplier ?? '',
    manufacturer: avk?.manufacturer ?? '',
    standards: avk?.standards ?? '',
    conclusion: [
      `Основание: ${receiptDocumentLabel(entry.basis)}.`,
      avk?.conclusion,
      partial,
    ]
      .filter(Boolean)
      .join('\n'),
    attachments: avk?.attachments ?? '',
    photosYes: avk?.photos === 'yes' ? '☑' : '☐',
    photosNo: avk?.photos === 'no' ? '☑' : '☐',
  }
  for (let index = 0; index < 10; index++)
    fields[`check${index + 1}`] = avk?.checks[index] ?? ''
  return {
    fields,
    materials,
    documents: (avk?.documents ?? zni.documents).map((doc, index) => ({
      index: index + 1,
      name: doc.name,
      number: doc.number,
      date: dateText(doc.date),
      orderNumber: doc.orderNumber,
    })),
  }
}
export const sampleQualityPrintData: QualityPrintData = {
  fields: {
    number: '1',
    date: '19.10.2026',
    day: 19,
    month: 'октября',
    year: 2026,
    project: 'Пример объекта строительства',
    description: 'Входной контроль материалов: клапан запорный Ду 25 Ру 160.',
    ciphers: 'ТКМ5',
    revision: 'РЕВИЗИЯ 1',
    location: 'Площадка строительства',
    inspectionDate: '20.10.2026',
    inspectionTime: '11:00',
    remarks: 'Примерные данные. Рабочая база не изменяется.',
    contractor: 'Подрядчик',
    customer: 'Заказчик',
    generalContractor: 'Генподрядчик',
    acceptedMark: '☐',
    remarksMark: '☐',
    rejectedMark: '☐',
  },
  materials: [
    {
      index: 1,
      name: 'Клапан запорный Ду 25 Ру 160, сталь 15ХМ',
      cipher: 'ТКМ5',
      factoryNumber: '25050261',
      quantity: 2,
      unit: 'шт',
      appNumber: '12',
      appDate: '18.10.2026',
    },
  ],
  documents: [
    {
      index: 1,
      name: 'Паспорт изделия',
      number: 'ПС-125',
      date: '15.10.2026',
      orderNumber: '32',
    },
  ],
}
