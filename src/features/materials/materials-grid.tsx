import { createElement } from 'react'
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
    postProcessPopup: (params) => {
      if (params.type === 'columnFilter') {
        const popup = params.ePopup
        const left =
          params.eventSource?.getBoundingClientRect().left ??
          popup.getBoundingClientRect().left
        popup.classList.add('materials-filter-popup')
        Object.assign(popup.style, {
          position: 'fixed',
          top: '16px',
          left: `max(12px, min(${left}px, calc(100vw - 452px)))`,
          maxHeight: 'calc(100dvh - 32px)',
        })
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
