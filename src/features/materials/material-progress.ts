export type MaterialProgress = {
  projectQuantity: number
  requestedQuantity: number
  /** Receipts less rejected material actually returned to the customer. */
  receivedQuantity: number
  /** Signed AVKs less accepted material actually returned to the customer. */
  qcSignedQuantity: number
}

export function remainingMaterialQuantity(
  value: Pick<MaterialProgress, 'projectQuantity' | 'receivedQuantity'>,
) {
  const precise = (amount: number) => Number(amount.toPrecision(15))
  return Math.max(
    0,
    precise(precise(value.projectQuantity) - precise(value.receivedQuantity)),
  )
}

export function isMaterialFullyReceived(value: MaterialProgress) {
  return value.projectQuantity > 0 && remainingMaterialQuantity(value) === 0
}
