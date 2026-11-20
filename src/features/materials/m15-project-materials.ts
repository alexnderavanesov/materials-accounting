import type { M15Line } from './m15-reconciliation'
import { m15Unit } from './m15-quantity'

export type M15ProjectMaterial = {
  id: string
  cipher: string
  name: string
  unit: string
}

// Preserve punctuation in model numbers and dimensions; only ignore case/spacing.
const materialKey = (line: Pick<M15Line, 'name' | 'unit'>) =>
  JSON.stringify([
    line.name.trim().toLocaleLowerCase('ru').replace(/\s+/g, ' '),
    m15Unit(line.unit),
  ])

/** Match only within the chosen cipher. Duplicate names require explicit selection. */
export function matchM15ProjectMaterials(
  lines: readonly M15Line[],
  previous: readonly M15Line[],
  materials: readonly M15ProjectMaterial[],
  cipher: string,
): M15Line[] {
  const byId = new Map<string, M15ProjectMaterial>()
  const byName = new Map<string, string | null>()
  for (const material of materials) {
    if (material.cipher !== cipher) continue
    byId.set(material.id, material)
    const key = materialKey(material)
    byName.set(key, byName.has(key) ? null : material.id)
  }
  const oldById = new Map(previous.map((line) => [line.id, line]))
  return lines.map((line) => {
    const old = oldById.get(line.id)
    const retained =
      old?.projectLineId &&
      byId.has(old.projectLineId) &&
      materialKey(old) === materialKey(line)
        ? old.projectLineId
        : undefined
    return {
      ...line,
      projectLineId: retained ?? byName.get(materialKey(line)) ?? undefined,
    }
  })
}
