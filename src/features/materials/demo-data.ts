import { summarizeSubobjectMaterials } from './domain'
import type { SubobjectMaterialMetric } from './types'

export const demoObjects = [
  {
    id: 'object-1',
    name: 'Проект',
    code: '',
    subobjects: [{ id: 'project-1', name: 'Проектная база', code: '' }],
  },
]

export const demoMaterialMetrics: Array<SubobjectMaterialMetric> = []

export const demoCategorySummary =
  summarizeSubobjectMaterials(demoMaterialMetrics)

export const demoDocuments: Array<{
  id: string
  typeLabel: string
  number: string
  status: string
  date: string
  title: string
}> = []
