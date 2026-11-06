type OperationActivity = { projectLineId: string; date: string }

export function buildOperationActivityIndex({
  materialReceipts,
  materialRequests,
  qualityControls,
  additionalOperations = [],
}: {
  materialReceipts: Array<OperationActivity>
  materialRequests: Array<OperationActivity>
  qualityControls: Array<OperationActivity>
  additionalOperations?: Array<OperationActivity>
}) {
  const latestByLineId = new Map<string, number>()

  function register(lineId: string, date: string, order: number) {
    if (!lineId) return
    const time = getOperationActivityTime(date, order)
    latestByLineId.set(lineId, Math.max(latestByLineId.get(lineId) ?? 0, time))
  }

  materialRequests.forEach((entry, index) => {
    register(entry.projectLineId, entry.date, materialRequests.length - index)
  })
  materialReceipts.forEach((entry, index) => {
    register(
      entry.projectLineId,
      entry.date,
      materialRequests.length + materialReceipts.length - index,
    )
  })
  qualityControls.forEach((entry, index) => {
    register(
      entry.projectLineId,
      entry.date,
      materialRequests.length +
        materialReceipts.length +
        qualityControls.length -
        index,
    )
  })
  additionalOperations.forEach((entry, index) => {
    register(
      entry.projectLineId,
      entry.date,
      materialRequests.length +
        materialReceipts.length +
        qualityControls.length +
        additionalOperations.length -
        index,
    )
  })

  return latestByLineId
}

function getOperationActivityTime(date: string, order: number) {
  const timestamp = Date.parse(`${date}T00:00:00`)

  if (Number.isNaN(timestamp)) {
    return order
  }

  return timestamp + order / 1000
}
