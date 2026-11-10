import { expect, it } from 'vitest'
import { documentNumberLabel, normalizeDocumentNumber } from './document-number'

it.each(['221', '№221', '№ № 221', '  №\u00a0№221  '])(
  'adds a single number sign to %s',
  (number) => {
    expect(documentNumberLabel('АПП', number)).toBe('АПП №221')
  },
)

it('preserves prefixes, suffixes and spaces inside user-defined numbers', () => {
  expect(normalizeDocumentNumber('№ АВК-221 / А ')).toBe('АВК-221 / А ')
  expect(normalizeDocumentNumber('ЗНИ-№221')).toBe('ЗНИ-№221')
})
