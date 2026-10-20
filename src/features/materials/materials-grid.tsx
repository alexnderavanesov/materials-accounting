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
  FiltersToolPanelModule,
  LicenseManager,
} from 'ag-grid-enterprise'
import { AgGridReact } from 'ag-grid-react'
import type { AgGridReactProps } from 'ag-grid-react'

ModuleRegistry.registerModules([
  AllCommunityModule,
  CellSelectionModule,
  ClipboardModule,
  ColumnsToolPanelModule,
  ColumnMenuModule,
  ContextMenuModule,
  ExcelExportModule,
  FiltersToolPanelModule,
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
export const materialsGridSideBar = {
  toolPanels: [
    {
      id: 'columns',
      labelDefault: 'Столбцы',
      labelKey: 'columns',
      iconKey: 'columns',
      toolPanel: 'agColumnsToolPanel',
      toolPanelParams: {
        suppressRowGroups: true,
        suppressValues: true,
        suppressPivots: true,
        suppressPivotMode: true,
      },
    },
    {
      id: 'filters',
      labelDefault: 'Фильтры',
      labelKey: 'filters',
      iconKey: 'filter',
      toolPanel: 'agFiltersToolPanel',
    },
  ],
}

export function MaterialsGridView<T>(
  props: AgGridReactProps<T> & { 'data-tsd-source'?: string },
) {
  // The source inspector adds an HTML attribute that is not a valid grid option.
  const gridProps = { ...props }
  delete gridProps['data-tsd-source']
  return createElement(AgGridReact<T>, gridProps)
}
