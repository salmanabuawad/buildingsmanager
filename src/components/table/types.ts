import { ReactNode, CSSProperties } from 'react';

export interface ColumnDef<T = any> {
  id?: string;
  field?: string;
  header: string;
  headerTooltip?: string;
  editable?: boolean | ((row: T) => boolean);
  pinned?: 'left' | 'right';
  hidden?: boolean;
  width?: number;
  minWidth?: number;
  type?: 'text' | 'number' | 'checkbox';
  sortable?: boolean;
  render?: (props: CellRenderProps<T>) => ReactNode;
  cellStyle?: CSSProperties | ((row: T) => CSSProperties | null | undefined);
  formatValue?: (value: any, row: T) => string;
  parseValue?: (value: string, row: T) => any;
  tooltip?: (value: any, row: T) => string;
  onCellClick?: (row: T) => void;
  editor?: 'text' | 'number' | 'largeText';
  editorParams?: Record<string, any>;
}

export interface CellRenderProps<T = any> {
  data: T;
  value: any;
  field: string;
  rowIndex: number;
}

export interface CellChangeEvent<T = any> {
  rowId: string;
  field: string;
  oldValue: any;
  newValue: any;
  data: T;
}

export interface CellEditStartEvent<T = any> {
  rowId: string;
  field: string;
  value: any;
  data: T;
}

export interface CellEditStopEvent<T = any> {
  rowId: string;
  field: string;
  oldValue: any;
  newValue: any;
  data: T;
  cancelled: boolean;
}

export interface EditableTableProps<T = any> {
  data: T[];
  columns: ColumnDef<T>[];
  getRowId: (row: T) => string;
  getRowStyle?: (row: T) => CSSProperties | null | undefined;
  onCellChange?: (event: CellChangeEvent<T>) => void;
  onCellEditStart?: (event: CellEditStartEvent<T>) => void;
  onCellEditStop?: (event: CellEditStopEvent<T>) => void;
  height?: string;
  rowHeight?: number;
  className?: string;
  rtl?: boolean;
  loading?: boolean;
}

export interface EditingCell {
  rowId: string;
  field: string;
}
