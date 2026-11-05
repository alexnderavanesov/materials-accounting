import { createContext, useContext, useMemo, useCallback } from 'react'
import {
  emptyNumberHistory,
  initialNumbering,
  suggestDocumentNumber,
  DocumentNumberExhaustedError,
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
    (kind: DocumentKind, context: NumberContext = {}) => {
      try {
        return suggestDocumentNumber(rules, history, kind, context).number
      } catch (error) {
        // A numbering limit must not crash mounted forms or prevent opening
        // settings. Leave the field editable; never invent a duplicate number.
        if (error instanceof DocumentNumberExhaustedError) return ''
        throw error
      }
    },
    [rules, history],
  )
}
