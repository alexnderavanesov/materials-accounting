import { createContext, useContext, useMemo, useCallback } from 'react'
import {
  emptyNumberHistory,
  initialNumbering,
  suggestDocumentNumber,
} from './document-numbering'
import type {
  DocumentKind,
  DocumentNumbering,
  NumberContext,
  NumberHistory,
} from './document-numbering'

export const DocumentNumberingContext = createContext<{
  settings?: DocumentNumbering
  history: NumberHistory
}>({ history: emptyNumberHistory() })
export function useDocumentNumber() {
  const { settings, history } = useContext(DocumentNumberingContext)
  const rules = useMemo(
    () => settings ?? initialNumbering(history),
    [settings, history],
  )
  return useCallback(
    (kind: DocumentKind, context: NumberContext = {}) =>
      suggestDocumentNumber(rules, history, kind, context).number,
    [rules, history],
  )
}
