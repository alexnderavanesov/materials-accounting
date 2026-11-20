export const m15Precise = (value: number) => Number(value.toPrecision(15))
export const equalAmount = (a: number, b: number) =>
  Number.isFinite(a) &&
  Number.isFinite(b) &&
  Math.abs(a - b) <= Number.EPSILON * 8 * Math.max(Math.abs(a), Math.abs(b))
export const m15Remaining = (received: number, allocated: number) =>
  equalAmount(received, allocated) ? 0 : m15Precise(received - allocated)
export const m15Unit = (value: string) =>
  value.trim().toLocaleLowerCase('ru').replace(/\./g, '').replace(/\s+/g, ' ')
