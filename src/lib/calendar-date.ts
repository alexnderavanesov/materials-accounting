/** Calendar dates have no time zone; use the user's local day for defaults. */
export function localDateInputValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function normalizeCalendarDate(value: string): string | null {
  const text = value.trim()
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text)
  const local = /^(\d{1,2})([.-])(\d{1,2})\2(\d{4}|\d{2})$/.exec(text)
  if (!iso && !local) return null
  const yearText = iso?.[1] ?? local![4]!
  const year = Number(yearText) + (yearText.length === 2 ? 2000 : 0)
  const month = Number(iso?.[2] ?? local![3])
  const day = Number(iso?.[3] ?? local![1])
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

/** Display only; persisted dates keep their full ISO year. */
export function formatCalendarDate(
  value: string | null | undefined,
  empty = '—',
) {
  if (!value) return empty
  const iso = normalizeCalendarDate(value)
  return iso
    ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(2, 4)}`
    : value
}
