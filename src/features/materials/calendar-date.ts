/** Calendar dates have no time zone; use the user's local day for defaults. */
export function localDateInputValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function normalizeCalendarDate(value: string): string | null {
  const text = value.trim()
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text)
  const dotted = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text)
  const parts = iso ? iso.slice(1) : dotted?.slice(1).reverse()
  if (!parts) return null
  const [year, month, day] = parts.map(Number)
  if (!year || !month || !day) return null
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return null
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
