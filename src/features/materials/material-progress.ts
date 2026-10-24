export type MaterialProgress = {
  projectQuantity: number
  requestedQuantity: number
  /** Receipts less rejected material actually returned to the customer. */
  receivedQuantity: number
  /** Signed AVKs less accepted material actually returned to the customer. */
  qcSignedQuantity: number
}

export function materialProgressStatus(value: MaterialProgress) {
  const {
    projectQuantity: plan,
    requestedQuantity,
    receivedQuantity,
    qcSignedQuantity,
  } = value
  const precise = (amount: number) => Number(amount.toPrecision(15))
  if (plan > 0) {
    if (
      [requestedQuantity, receivedQuantity, qcSignedQuantity].some(
        (amount) => precise(amount) > precise(plan),
      )
    )
      return 'excess'
    if (precise(qcSignedQuantity) >= precise(plan)) return 'approved'
    if (
      precise(receivedQuantity) >= precise(plan) ||
      precise(requestedQuantity) >= precise(plan)
    )
      return 'in-progress'
  }
  return requestedQuantity > 0 ? 'requested' : 'empty'
}
