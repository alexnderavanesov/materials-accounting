import { expect, it } from 'vitest'
import {
  documentFileSelectionError,
  maxDocumentFileBytes,
} from './document-file-limits'

it('checks per-file and total limits before reading file contents', () => {
  const file = { name: 'Фото.jpg', size: maxDocumentFileBytes }
  expect(documentFileSelectionError([file])).toBe('')
  expect(documentFileSelectionError([{ ...file, size: 0 }])).toContain('пуст')
  expect(
    documentFileSelectionError([{ ...file, size: maxDocumentFileBytes + 1 }]),
  ).toContain('20 МБ')
  expect(
    documentFileSelectionError(Array.from({ length: 5 }, () => file)),
  ).toBe('')
  expect(
    documentFileSelectionError(Array.from({ length: 6 }, () => file)),
  ).toContain('100 МБ')
  expect(
    documentFileSelectionError(
      Array.from({ length: 51 }, () => ({ ...file, size: 1 })),
    ),
  ).toContain('50 файлов')
})
