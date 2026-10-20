import { z } from 'zod'
import type { TemplateSheet } from './request-print'

export type QualityPrintKind = 'zni' | 'avk'
export const qualityPrintFields = {
  number: 'Номер документа',
  date: 'Дата документа',
  day: 'День',
  month: 'Месяц прописью',
  year: 'Год',
  signatureLine: 'Дата и место подписи',
  revision: 'Ревизия',
  signedOn: 'Дата подписания',
  zniNumber: 'Номер ЗНИ',
  zniDate: 'Дата ЗНИ',
  zniSignedOn: 'ЗНИ подписана',
  appNumber: 'Номер АПП',
  appDate: 'Дата АПП',
  inspectionDate: 'Дата инспекции',
  inspectionTime: 'Время инспекции',
  customer: 'Заказчик',
  generalContractor: 'Генподрядчик',
  contractor: 'Подрядчик',
  project: 'Объект строительства',
  location: 'Место',
  issuerRole: 'Должность составителя',
  issuerName: 'Составитель',
  customerRepresentative: 'Представитель заказчика',
  generalRepresentative: 'Представитель генподрядчика',
  contractorRepresentative: 'Представитель подрядчика',
  chairmanRole: 'Должность председателя',
  chairmanName: 'Председатель',
  contractorRole: 'Должность представителя подрядчика',
  generalRole: 'Должность представителя генподрядчика',
  customerRole: 'Должность представителя заказчика',
  description: 'Описание инспекции / ссылка на АПП',
  materials: 'Наименования материалов',
  ciphers: 'Шифры',
  remarks: 'Замечания и результаты по позициям',
  acceptedMark: 'Отметка: принято',
  remarksMark: 'Отметка: принято с замечаниями',
  rejectedMark: 'Отметка: не принято',
  buyer: 'Покупатель',
  supplier: 'Поставщик',
  manufacturer: 'Изготовитель',
  standards: 'Нормативные документы',
  conclusion: 'Заключение и частичная приёмка',
  attachments: 'Приложения',
  photosYes: 'Фото: да',
  photosNo: 'Фото: нет',
  check1: '1. Документация',
  check2: '2. Маркировка',
  check3: '3. Упаковка',
  check4: '4. Комплектность',
  check5: '5. Визуальный контроль',
  check6: '6. Соответствие проекту',
  check7: '7. Хранение',
  check8: '8. Консервация',
  check9: '9. Срок годности',
  check10: '10. Прочее',
} as const
export const qualityMaterialColumns = {
  index: '№',
  name: 'Наименование',
  cipher: 'Шифр',
  factoryNumber: 'Заводской номер',
  heatBatch: 'Партия',
  quantity: 'Предъявленное количество',
  unit: 'Единица',
  accepted: 'Принятое количество',
  altQuantity: 'Альтернативно предъявлено',
  altAccepted: 'Альтернативно принято',
  altUnit: 'Альтернативная единица',
  appNumber: 'Номер АПП',
  appDate: 'Дата АПП',
  document: 'Нормативный документ',
  alloy: 'Состав',
  remarks: 'Замечания',
} as const
export const qualityDocumentColumns = {
  index: '№',
  name: 'Наименование документа',
  number: 'Номер документа',
  date: 'Дата документа',
  orderNumber: 'Номер заказа',
} as const
const address = z.string().regex(/^[A-Z]{1,2}[1-9]\d{0,2}$/)
export const qualityPrintConfigSchema = z
  .object({
    version: z.literal(2),
    sheetName: z.string().min(1),
    printArea: z
      .string()
      .regex(/^[A-Z]{1,2}[1-9]\d{0,2}:[A-Z]{1,2}[1-9]\d{0,2}$/),
    headerRows: z.string().regex(/^(?:[1-9]\d{0,2}:[1-9]\d{0,2})?$/),
    fields: z.record(z.string(), z.array(address).max(10)),
    tables: z
      .array(
        z
          .object({
            kind: z.enum(['materials', 'documents']),
            row: z.number().int().min(1).max(200),
            columns: z.record(z.string(), z.string().regex(/^[A-Z]{1,2}$/)),
          })
          .strict(),
      )
      .max(2),
  })
  .strict()
export type QualityPrintConfig = z.infer<typeof qualityPrintConfigSchema>
export type QualityPrintTemplate = {
  fileName: string
  base64: string
  config: QualityPrintConfig
  revision: string
  sheet: TemplateSheet
}
export type QualityPrintData = {
  fields: Record<string, string | number>
  materials: Array<Record<string, string | number | null>>
  documents: Array<Record<string, string | number | null>>
}
export const defaultQualityPrintConfig = (
  kind: QualityPrintKind,
): QualityPrintConfig =>
  kind === 'zni'
    ? {
        version: 2,
        sheetName: 'ЗНИ',
        printArea: 'A1:G38',
        headerRows: '',
        tables: [],
        fields: {
          customer: ['C7'],
          generalContractor: ['C8'],
          contractor: ['C9'],
          number: ['F7'],
          date: ['F8'],
          inspectionDate: ['F9'],
          inspectionTime: ['G9'],
          project: ['C10'],
          location: ['F10'],
          description: ['C11'],
          ciphers: ['C13'],
          revision: ['D13'],
          issuerRole: ['C14'],
          issuerName: ['D14'],
          generalRepresentative: ['C16', 'B35'],
          customerRepresentative: ['F16', 'C35'],
          contractorRepresentative: ['D35'],
          acceptedMark: ['A20'],
          remarksMark: ['A21'],
          rejectedMark: ['A22'],
          remarks: ['A24'],
          signatureLine: ['A38', 'C38', 'D38'],
        },
      }
    : {
        version: 2,
        sheetName: 'АВК',
        printArea: 'A1:P99',
        headerRows: '',
        fields: {
          day: ['C2'],
          month: ['E2'],
          year: ['F2'],
          number: ['I2'],
          location: ['L2'],
          chairmanRole: ['C5', 'C88'],
          chairmanName: ['N5', 'N88'],
          contractorRole: ['C8', 'C92'],
          contractorRepresentative: ['N8', 'N92'],
          generalRole: ['C10', 'C95'],
          generalRepresentative: ['N10', 'N95'],
          customerRole: ['C12', 'C98'],
          customerRepresentative: ['N12', 'N98'],
          project: ['C21'],
          materials: ['C23'],
          standards: ['G30'],
          buyer: ['F34'],
          supplier: ['F36'],
          manufacturer: ['F38'],
          check1: ['C43'],
          check2: ['C46'],
          check3: ['C49'],
          check4: ['C52'],
          check5: ['C55'],
          check6: ['C58'],
          check7: ['C61'],
          check8: ['C64'],
          check9: ['C67'],
          check10: ['C70'],
          conclusion: ['C73'],
          acceptedMark: ['C75'],
          remarksMark: ['C77'],
          rejectedMark: ['C79'],
          attachments: ['C82'],
          photosYes: ['F84'],
          photosNo: ['J84'],
        },
        tables: [
          {
            kind: 'documents',
            row: 28,
            columns: {
              index: 'C',
              name: 'D',
              number: 'K',
              date: 'L',
              orderNumber: 'M',
            },
          },
          {
            kind: 'materials',
            row: 33,
            columns: {
              index: 'C',
              name: 'D',
              cipher: 'K',
              factoryNumber: 'L',
              quantity: 'M',
              unit: 'N',
              appNumber: 'O',
              appDate: 'P',
            },
          },
        ],
      }
