import { acceptFixture } from './quality-workflow.fixtures'
import { localToday } from './quality-workflow'
import type { ProjectChangeWorkspace } from './project-changes'

export function projectChangeFixture(accepted = 10): ProjectChangeWorkspace {
  const source = acceptFixture(accepted)
  return {
    ...source,
    materialRequests: [
      {
        id: 'request',
        projectLineId: 'line',
        quantity: 10,
        date: localToday(),
        number: 'ЗП-1',
      },
    ],
  } as unknown as ProjectChangeWorkspace
}
