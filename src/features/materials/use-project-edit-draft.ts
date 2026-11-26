import { useEffect, useRef, useState } from 'react'
import type { ProjectChangeWorkspace } from './project-changes'
import {
  importProjectDraft,
  projectDraftChanges,
  refreshProjectDraft,
} from './project-edit-draft'
import type { ProjectEditDraft } from './project-edit-draft'
import type { ImportRowInput, SubobjectMaterialMetric } from './types'

export function useProjectEditDraft(workspace: ProjectChangeWorkspace) {
  const [draft, setDraft] = useState<ProjectEditDraft | null>(null)
  const ref = useRef(draft)
  function currentDraft(): ProjectEditDraft {
    return (
      ref.current ?? {
        baseline: workspace,
        lines: workspace.lines,
      }
    )
  }
  function stage(next: ProjectEditDraft) {
    const value = projectDraftChanges(next).length ? next : null
    ref.current = value
    setDraft(value)
  }
  function update(
    change: (lines: SubobjectMaterialMetric[]) => SubobjectMaterialMetric[],
  ) {
    const current = currentDraft()
    stage({ ...current, lines: change(current.lines) })
  }
  function importRows(rows: ImportRowInput[], mode: 'full' | 'changes') {
    stage(importProjectDraft(currentDraft(), rows, mode))
  }
  function clear() {
    ref.current = null
    setDraft(null)
  }
  const dirty = draft !== null
  useEffect(() => {
    if (!dirty) return
    const listener = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', listener)
    return () => window.removeEventListener('beforeunload', listener)
  }, [dirty])
  function refresh(latest: ProjectChangeWorkspace) {
    if (!ref.current) return
    stage(refreshProjectDraft(ref.current, latest))
  }
  return {
    refresh,
    draft,
    lines: draft?.lines ?? workspace.lines,
    update,
    importRows,
    clear,
    read: () => ref.current,
  }
}
