/** A number field does not include the № supplied by its label or print form. */
export function normalizeDocumentNumber(number: string) {
  // Keep trailing spaces while typing multi-part numbers; persistence trims them.
  return number.trimStart().replace(/^(?:№\s*)+/, '')
}

export function documentNumberLabel(kind: string, number: string) {
  return `${kind} №${normalizeDocumentNumber(number).trim()}`
}
