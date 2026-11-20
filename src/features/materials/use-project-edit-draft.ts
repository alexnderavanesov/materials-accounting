import { useEffect, useRef, useState } from 'react'
import type { ProjectChangeWorkspace } from './project-changes'
import { projectDraftChanges, refreshProjectDraft } from './project-edit-draft'
import type { ProjectEditDraft } from './project-edit-draft'
import type { SubobjectMaterialMetric } from './types'

export function useProjectEditDraft(workspace: ProjectChangeWorkspace) {
  const [draft, setDraft] = useState<ProjectEditDraft | null>(null)
  const ref = useRef(draft)
  function update(
    change: (lines: SubobjectMaterialMetric[]) => SubobjectMaterialMetric[],
  ) {
    const current = ref.current ?? {
      baseline: workspace,
      lines: workspace.lines,
    }
    const next = { ...current, lines: change(current.lines) }
    const value = projectDraftChanges(next).length ? next : null
    ref.current = value
    setDraft(value)
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
    const next = refreshProjectDraft(ref.current, latest)
    const value = projectDraftChanges(next).length ? next : null
    ref.current = value
    setDraft(value)
  }
  return {
    refresh,
    draft,
    lines: draft?.lines ?? workspace.lines,
    update,
    clear,
    read: () => ref.current,
  }
}
