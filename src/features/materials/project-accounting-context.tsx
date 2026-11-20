import { createContext, useContext } from 'react'
import type { ProjectAccounting } from './project-change-types'

export const ProjectAccountingContext = createContext<ProjectAccounting>({})
export const useProjectAccounting = () => useContext(ProjectAccountingContext)
