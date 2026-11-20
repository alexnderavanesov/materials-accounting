import { z } from 'zod'

export const receiptOverageApprovalSchema = z
  .object({
    requestId: z.string().min(1),
    quantity: z.number().finite().positive(),
    excessQuantity: z.number().finite().positive(),
    approvedAt: z.string().datetime(),
  })
  .strict()
  .refine((approval) => approval.excessQuantity <= approval.quantity)

export type ReceiptOverageApproval = z.infer<
  typeof receiptOverageApprovalSchema
>

const precise = (value: number) => Number(value.toPrecision(15))

export function isReceiptOverageApproved(
  approval: ReceiptOverageApproval | undefined,
  requestId: string,
  quantity: number,
  remaining: number,
) {
  return Boolean(
    approval &&
    approval.requestId === requestId &&
    approval.quantity === quantity &&
    approval.excessQuantity >= precise(quantity - remaining),
  )
}

/** Approval belongs to this receipt; returned excess cannot fund another receipt. */
export function receiptQuantityWithinRequest(
  receipt: {
    requestId?: unknown
    quantity?: unknown
    overageApproval?: unknown
  },
  rejectedReturnQuantity = 0,
) {
  const quantity = Number(receipt.quantity)
  const net = Math.max(0, precise(quantity - rejectedReturnQuantity))
  if (receipt.overageApproval === undefined) return net
  const parsed = receiptOverageApprovalSchema.safeParse(receipt.overageApproval)
  if (
    !parsed.success ||
    parsed.data.requestId !== receipt.requestId ||
    parsed.data.quantity !== quantity
  )
    return net
  const remainingExcess = Math.max(
    0,
    precise(parsed.data.excessQuantity - rejectedReturnQuantity),
  )
  return precise(net - remainingExcess)
}
