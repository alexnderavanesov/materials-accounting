import { createElement, useEffect, useRef, useState } from 'react'
import { useEscapeAction } from '#/components/ui/escape-layer'
import type { GridApi } from 'ag-grid-community'
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
} from 'ag-grid-community'
import {
  CellSelectionModule,
  ClipboardModule,
  ColumnsToolPanelModule,
  ColumnMenuModule,
  ContextMenuModule,
  ExcelExportModule,
  LicenseManager,
  StatusBarModule,
} from 'ag-grid-enterprise'
import { AgGridReact } from 'ag-grid-react'
import type { AgGridReactProps } from 'ag-grid-react'
import { materialsSelectionStatusBar } from './grid-selection-status-panel'
import { trackGridFilterPosition } from './grid-filter-position'

ModuleRegistry.registerModules([
  AllCommunityModule,
  CellSelectionModule,
  ClipboardModule,
  ColumnsToolPanelModule,
  ColumnMenuModule,
  ContextMenuModule,
  ExcelExportModule,
  StatusBarModule,
])
// A browser licence is intentionally included in the client bundle; keep it out of Git.
const licence = import.meta.env.VITE_AG_GRID_LICENSE_KEY
if (licence) LicenseManager.setLicenseKey(licence)

export const materialsGridTheme = themeQuartz.withParams({
  accentColor: '#2563eb',
  backgroundColor: '#ffffff',
  foregroundColor: '#334155',
  borderColor: '#e2e8f0',
  headerBackgroundColor: '#f8fafc',
  headerTextColor: '#475569',
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: 13,
  spacing: 6,
  rowHoverColor: '#f8fafc',
  wrapperBorderRadius: 0,
})
export function MaterialsGridView<T>(
  props: AgGridReactProps<T> & { 'data-tsd-source'?: string },
) {
  const stopFilterPosition = useRef<(() => void) | undefined>(undefined)
  const api = useRef<GridApi<T> | null>(null)
  const [popup, setPopup] = useState<{
    element: HTMLElement
    type: string
  } | null>(null)
  const [editing, setEditing] = useState(false)
  useEscapeAction({
    kind: 'filters',
    active: () =>
      !!api.current &&
      !api.current.isDestroyed() &&
      api.current.isAnyFilterPresent(),
    onEscape: () => api.current?.setFilterModel(null),
  })
  useEscapeAction({
    kind: 'popup',
    enabled: editing,
    active: () =>
      !!api.current &&
      !api.current.isDestroyed() &&
      api.current.getEditingCells().length > 0,
    onEscape: () => api.current?.stopEditing(true),
  })
  useEscapeAction({
    kind: 'popup',
    enabled: !!popup,
    active: () =>
      !!popup?.element.isConnected &&
      !!api.current &&
      !api.current.isDestroyed(),
    onEscape: () => {
      if (popup?.type === 'columnChooser') api.current?.hideColumnChooser()
      else api.current?.hidePopupMenu()
      setPopup(null)
    },
  })
  useEffect(() => () => stopFilterPosition.current?.(), [])
  // The source inspector adds an HTML attribute that is not a valid grid option.
  const gridProps = { ...props }
  delete gridProps['data-tsd-source']
  return createElement(AgGridReact<T>, {
    ...gridProps,
    statusBar: gridProps.statusBar ?? materialsSelectionStatusBar,
    enableFilterHandlers: true,
    popupParent:
      gridProps.popupParent ??
      (typeof document === 'undefined' ? undefined : document.body),
    suppressCsvExport: true,
    onGridReady: (event) => {
      api.current = event.api
      gridProps.onGridReady?.(event)
    },
    onCellEditingStarted: (event) => {
      setEditing(true)
      gridProps.onCellEditingStarted?.(event)
    },
    onCellEditingStopped: (event) => {
      setEditing(event.api.getEditingCells().length > 0)
      gridProps.onCellEditingStopped?.(event)
    },
    onContextMenuVisibleChanged: (event) => {
      if (!event.visible)
        setPopup((current) =>
          current?.type === 'contextMenu' ? null : current,
        )
      gridProps.onContextMenuVisibleChanged?.(event)
    },
    onColumnMenuVisibleChanged: (event) => {
      // Opening the chooser closes the menu that launched it afterwards.
      // That older close event must not unregister the new keyboard layer.
      if (!event.visible)
        setPopup((current) => (current?.type === event.key ? null : current))
      if (!event.visible && event.key === 'columnFilter') {
        stopFilterPosition.current?.()
        stopFilterPosition.current = undefined
      }
      gridProps.onColumnMenuVisibleChanged?.(event)
    },
    postProcessPopup: (params) => {
      if (
        ['columnFilter', 'columnChooser', 'columnMenu', 'contextMenu'].includes(
          params.type,
        )
      )
        setPopup({ element: params.ePopup, type: params.type })
      if (params.type === 'columnFilter') {
        stopFilterPosition.current?.()
        stopFilterPosition.current = trackGridFilterPosition(params)
      }
      if (params.type === 'columnChooser') {
        const count = (params.api.getColumns() ?? []).filter(
          (column) => !column.getColDef().suppressColumnsToolPanel,
        ).length
        const height = Math.max(200, count * 24 + 108)
        Object.assign(params.ePopup.style, {
          position: 'fixed',
          height: `min(${height}px, calc(100dvh - 32px))`,
          minHeight: 'min(200px, calc(100dvh - 32px))',
          maxHeight: 'calc(100dvh - 32px)',
          top: `max(16px, calc((100dvh - ${height}px) / 2))`,
        })
      }
      gridProps.postProcessPopup?.(params)
    },
  })
}
