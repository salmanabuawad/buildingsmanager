import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { EditableTableProps, EditingCell, ColumnDef } from './types';
import { EditableCell } from './EditableCell';
import { useVirtualRows } from './useVirtualRows';

const DEFAULT_ROW_HEIGHT = 32;
const HEADER_HEIGHT = 40;

function EditableTableInner<T>({
  data,
  columns,
  getRowId,
  getRowStyle,
  onCellChange,
  onCellEditStart,
  onCellEditStop,
  height = '400px',
  rowHeight = DEFAULT_ROW_HEIGHT,
  className = '',
  rtl = false,
  loading = false,
}: EditableTableProps<T>) {
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [containerHeight, setContainerHeight] = useState(600);
  const bodyRef = useRef<HTMLDivElement>(null);
  const pinnedBodyRef = useRef<HTMLDivElement>(null);
  const syncingScroll = useRef(false);

  const visibleColumns = useMemo(
    () => columns.filter(c => !c.hidden),
    [columns]
  );

  const pinnedRightCols = useMemo(
    () => visibleColumns.filter(c => c.pinned === 'right'),
    [visibleColumns]
  );

  const scrollableCols = useMemo(
    () => visibleColumns.filter(c => c.pinned !== 'right' && c.pinned !== 'left'),
    [visibleColumns]
  );

  const pinnedLeftCols = useMemo(
    () => visibleColumns.filter(c => c.pinned === 'left'),
    [visibleColumns]
  );

  const bodyHeight = useMemo(() => {
    const h = parseInt(height);
    return isNaN(h) ? 600 : Math.max(100, (h / 100) * window.innerHeight - HEADER_HEIGHT);
  }, [height]);

  useEffect(() => {
    if (!bodyRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });
    ro.observe(bodyRef.current);
    return () => ro.disconnect();
  }, []);

  const virtual = useVirtualRows({
    totalRows: data.length,
    rowHeight,
    containerHeight,
    overscan: 15,
  });

  const handleBodyScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    virtual.onScroll(el.scrollTop);
    if (syncingScroll.current) return;
    syncingScroll.current = true;
    if (pinnedBodyRef.current) {
      pinnedBodyRef.current.scrollTop = el.scrollTop;
    }
    syncingScroll.current = false;
  }, [virtual]);

  const handlePinnedScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (syncingScroll.current) return;
    syncingScroll.current = true;
    if (bodyRef.current) {
      bodyRef.current.scrollTop = e.currentTarget.scrollTop;
    }
    virtual.onScroll(e.currentTarget.scrollTop);
    syncingScroll.current = false;
  }, [virtual]);

  const handleStartEdit = useCallback((rowId: string, field: string) => {
    const row = data.find(r => getRowId(r) === rowId);
    if (!row) return;
    const rawValue = field ? (row as any)[field] : undefined;
    setEditingCell({ rowId, field });
    onCellEditStart?.({
      rowId,
      field,
      value: rawValue,
      data: row,
    });
  }, [data, getRowId, onCellEditStart]);

  const handleCommitEdit = useCallback((rowId: string, field: string, oldValue: any, newValue: any) => {
    setEditingCell(null);
    const row = data.find(r => getRowId(r) === rowId);
    if (!row) return;
    onCellEditStop?.({
      rowId,
      field,
      oldValue,
      newValue,
      data: row,
      cancelled: false,
    });
    if (oldValue !== newValue) {
      onCellChange?.({
        rowId,
        field,
        oldValue,
        newValue,
        data: row,
      });
    }
  }, [data, getRowId, onCellChange, onCellEditStop]);

  const handleCancelEdit = useCallback((rowId: string, field: string) => {
    const row = data.find(r => getRowId(r) === rowId);
    setEditingCell(null);
    if (row) {
      const rawValue = field ? (row as any)[field] : undefined;
      onCellEditStop?.({
        rowId,
        field,
        oldValue: rawValue,
        newValue: rawValue,
        data: row,
        cancelled: true,
      });
    }
  }, [data, getRowId, onCellEditStop]);

  const renderHeaderCell = useCallback((col: ColumnDef<T>, idx: number) => {
    return (
      <div
        key={col.field || col.id || idx}
        title={col.headerTooltip || col.header}
        style={{
          width: col.width || 100,
          minWidth: col.minWidth || col.width || 40,
          maxWidth: col.width || undefined,
          padding: '0 6px',
          fontSize: 11,
          fontWeight: 500,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          borderLeft: '1px solid #d1d5db',
          display: 'flex',
          alignItems: 'center',
          boxSizing: 'border-box',
          lineHeight: '1.2',
          color: '#374151',
        }}
      >
        {col.header}
      </div>
    );
  }, []);

  const renderRow = useCallback((row: T, absIndex: number, cols: ColumnDef<T>[]) => {
    const rowId = getRowId(row);
    const rowStyle = getRowStyle?.(row) || {};
    return (
      <div
        key={rowId}
        data-row-id={rowId}
        style={{
          display: 'flex',
          height: rowHeight,
          borderBottom: '1px solid #f3f4f6',
          fontSize: 12,
          ...rowStyle,
        }}
      >
        {cols.map((col, ci) => (
          <EditableCell
            key={col.field || col.id || ci}
            row={row}
            column={col}
            rowId={rowId}
            rowIndex={absIndex}
            editingCell={editingCell}
            onStartEdit={handleStartEdit}
            onCommitEdit={handleCommitEdit}
            onCancelEdit={handleCancelEdit}
          />
        ))}
      </div>
    );
  }, [getRowId, getRowStyle, rowHeight, editingCell, handleStartEdit, handleCommitEdit, handleCancelEdit]);

  const visibleData = useMemo(
    () => data.slice(virtual.visibleRange.start, virtual.visibleRange.end),
    [data, virtual.visibleRange.start, virtual.visibleRange.end]
  );

  const scrollableWidth = useMemo(
    () => scrollableCols.reduce((sum, c) => sum + (c.width || 100), 0),
    [scrollableCols]
  );

  const pinnedRightWidth = useMemo(
    () => pinnedRightCols.reduce((sum, c) => sum + (c.width || 100), 0),
    [pinnedRightCols]
  );

  const pinnedLeftWidth = useMemo(
    () => pinnedLeftCols.reduce((sum, c) => sum + (c.width || 100), 0),
    [pinnedLeftCols]
  );

  if (loading) {
    return (
      <div className={className} style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#6b7280', fontSize: 14 }}>Loading...</div>
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{
        height,
        direction: rtl ? 'rtl' : 'ltr',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: '#fff',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        flexShrink: 0,
        borderBottom: '2px solid #d1d5db',
        background: '#f9fafb',
        height: HEADER_HEIGHT,
      }}>
        {/* Pinned left header */}
        {pinnedLeftCols.length > 0 && (
          <div style={{
            display: 'flex',
            flexShrink: 0,
            width: pinnedLeftWidth,
            borderRight: '2px solid #d1d5db',
          }}>
            {pinnedLeftCols.map(renderHeaderCell)}
          </div>
        )}

        {/* Scrollable header */}
        <div style={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
        }}>
          <div style={{ display: 'flex', minWidth: scrollableWidth }}>
            {scrollableCols.map(renderHeaderCell)}
          </div>
        </div>

        {/* Pinned right header */}
        {pinnedRightCols.length > 0 && (
          <div style={{
            display: 'flex',
            flexShrink: 0,
            width: pinnedRightWidth,
            borderLeft: '2px solid #d1d5db',
          }}>
            {pinnedRightCols.map(renderHeaderCell)}
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Pinned left body */}
        {pinnedLeftCols.length > 0 && (
          <div
            style={{
              width: pinnedLeftWidth,
              flexShrink: 0,
              overflowY: 'hidden',
              overflowX: 'hidden',
              borderRight: '2px solid #d1d5db',
            }}
          >
            <div style={{ height: virtual.offsetTop }} />
            {visibleData.map((row, vi) => renderRow(row, virtual.visibleRange.start + vi, pinnedLeftCols))}
            <div style={{ height: virtual.offsetBottom }} />
          </div>
        )}

        {/* Scrollable body */}
        <div
          ref={bodyRef}
          onScroll={handleBodyScroll}
          style={{
            flex: 1,
            overflow: 'auto',
          }}
        >
          <div style={{ minWidth: scrollableWidth }}>
            <div style={{ height: virtual.offsetTop }} />
            {visibleData.map((row, vi) => renderRow(row, virtual.visibleRange.start + vi, scrollableCols))}
            <div style={{ height: virtual.offsetBottom }} />
          </div>
        </div>

        {/* Pinned right body */}
        {pinnedRightCols.length > 0 && (
          <div
            ref={pinnedBodyRef}
            onScroll={handlePinnedScroll}
            style={{
              width: pinnedRightWidth,
              flexShrink: 0,
              overflowY: 'auto',
              overflowX: 'hidden',
              borderLeft: '2px solid #d1d5db',
            }}
            className="hide-scrollbar"
          >
            <div style={{ height: virtual.offsetTop }} />
            {visibleData.map((row, vi) => renderRow(row, virtual.visibleRange.start + vi, pinnedRightCols))}
            <div style={{ height: virtual.offsetBottom }} />
          </div>
        )}
      </div>

      <style>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}

export const EditableTable = React.memo(EditableTableInner) as typeof EditableTableInner;
