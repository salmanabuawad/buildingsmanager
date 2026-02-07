import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ColumnDef, EditingCell } from './types';

interface EditableCellProps<T = any> {
  row: T;
  column: ColumnDef<T>;
  rowId: string;
  rowIndex: number;
  editingCell: EditingCell | null;
  onStartEdit: (rowId: string, field: string) => void;
  onCommitEdit: (rowId: string, field: string, oldValue: any, newValue: any) => void;
  onCancelEdit: (rowId: string, field: string) => void;
}

function EditableCellInner<T>({
  row,
  column,
  rowId,
  rowIndex,
  editingCell,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
}: EditableCellProps<T>) {
  const field = column.field || column.id || '';
  const rawValue = field ? (row as any)[field] : undefined;
  const isEditing = editingCell?.rowId === rowId && editingCell?.field === field;
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const committedRef = useRef(false);
  const cellRef = useRef<HTMLDivElement>(null);

  const isEditable = typeof column.editable === 'function'
    ? column.editable(row)
    : column.editable === true;

  useEffect(() => {
    if (isEditing) {
      committedRef.current = false;
      const displayVal = column.formatValue
        ? column.formatValue(rawValue, row)
        : (rawValue ?? '');
      setEditValue(String(displayVal));
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [isEditing]);

  const commitValue = useCallback(() => {
    if (committedRef.current) return;
    committedRef.current = true;
    const parsed = column.parseValue
      ? column.parseValue(editValue, row)
      : editValue;
    onCommitEdit(rowId, field, rawValue, parsed);
  }, [editValue, rawValue, rowId, field, column, row, onCommitEdit]);

  const cancelEdit = useCallback(() => {
    if (committedRef.current) return;
    committedRef.current = true;
    onCancelEdit(rowId, field);
  }, [rowId, field, onCancelEdit]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && column.editor !== 'largeText') {
      e.preventDefault();
      commitValue();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      commitValue();
    }
  }, [commitValue, cancelEdit, column.editor]);

  const handleBlur = useCallback(() => {
    if (!committedRef.current) {
      commitValue();
    }
  }, [commitValue]);

  const handleDoubleClick = useCallback(() => {
    if (isEditable && !isEditing) {
      onStartEdit(rowId, field);
    }
  }, [isEditable, isEditing, rowId, field, onStartEdit]);

  const dynamicStyle: React.CSSProperties = typeof column.cellStyle === 'function'
    ? (column.cellStyle(row) || {})
    : (column.cellStyle || {});

  const cellStyle: React.CSSProperties = {
    width: column.width || 100,
    minWidth: column.minWidth || column.width || 40,
    maxWidth: column.width || undefined,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    padding: '0 6px',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    boxSizing: 'border-box',
    borderLeft: '1px solid #e5e7eb',
    cursor: isEditable ? 'text' : 'default',
    ...dynamicStyle,
  };

  if (isEditing) {
    if (column.editor === 'largeText') {
      const maxLength = column.editorParams?.maxLength || 1000;
      const rows = column.editorParams?.rows || 5;
      return (
        <div ref={cellRef} style={{ ...cellStyle, position: 'relative', overflow: 'visible', zIndex: 100 }}>
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 100,
            background: 'white',
            border: '2px solid #3b82f6',
            borderRadius: 4,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            padding: 4,
          }}>
            <textarea
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelEdit();
                }
              }}
              onBlur={handleBlur}
              maxLength={maxLength}
              rows={rows}
              style={{
                width: '100%',
                resize: 'vertical',
                fontSize: 12,
                fontFamily: 'inherit',
                border: 'none',
                outline: 'none',
                padding: 4,
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginTop: 2 }}>
              <button
                onMouseDown={e => { e.preventDefault(); commitValue(); }}
                style={{ fontSize: 11, padding: '2px 8px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 3, cursor: 'pointer' }}
              >OK</button>
              <button
                onMouseDown={e => { e.preventDefault(); cancelEdit(); }}
                style={{ fontSize: 11, padding: '2px 8px', background: '#e5e7eb', border: 'none', borderRadius: 3, cursor: 'pointer' }}
              >Cancel</button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div ref={cellRef} style={{ ...cellStyle, padding: 0 }}>
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type={column.editor === 'number' ? 'number' : 'text'}
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          style={{
            width: '100%',
            height: '100%',
            border: '2px solid #3b82f6',
            borderRadius: 2,
            padding: '0 4px',
            fontSize: 12,
            fontFamily: 'inherit',
            outline: 'none',
            boxSizing: 'border-box',
            textAlign: 'inherit',
          }}
        />
      </div>
    );
  }

  if (column.render) {
    return (
      <div
        ref={cellRef}
        style={cellStyle}
        onDoubleClick={handleDoubleClick}
        onClick={column.onCellClick ? () => column.onCellClick!(row) : undefined}
        title={column.tooltip ? column.tooltip(rawValue, row) : undefined}
      >
        {column.render({ data: row, value: rawValue, field, rowIndex })}
      </div>
    );
  }

  const displayValue = column.formatValue
    ? column.formatValue(rawValue, row)
    : (rawValue ?? '');

  return (
    <div
      ref={cellRef}
      style={cellStyle}
      onDoubleClick={handleDoubleClick}
      onClick={column.onCellClick ? () => column.onCellClick!(row) : undefined}
      title={column.tooltip ? column.tooltip(rawValue, row) : String(displayValue)}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {String(displayValue)}
      </span>
    </div>
  );
}

export const EditableCell = React.memo(EditableCellInner) as typeof EditableCellInner;
