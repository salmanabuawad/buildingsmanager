import { RefObject, useEffect, useRef, useCallback, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { CellPosition } from 'ag-grid-community';

interface FillHandleOptions<T = any> {
  gridRef: RefObject<AgGridReact<T>>;
  onFillComplete?: (
    startRow: number,
    startCol: string,
    endRow: number,
    endCol: string,
    values: any[][]
  ) => void;
  enabled?: boolean;
}

export function useFillHandle<T = any>({ gridRef, onFillComplete, enabled = true }: FillHandleOptions<T>) {
  const [isDragging, setIsDragging] = useState(false);
  const [fillRange, setFillRange] = useState<{
    startRow: number;
    startCol: string;
    endRow: number;
    endCol: string;
  } | null>(null);

  const dragStartPos = useRef<{ row: number; col: string; value: any } | null>(null);
  const handleElement = useRef<HTMLDivElement | null>(null);

  const createFillHandle = useCallback(() => {
    if (!enabled) return null;

    const handle = document.createElement('div');
    handle.className = 'ag-fill-handle';
    handle.style.cssText = `
      position: absolute;
      width: 8px;
      height: 8px;
      background: #1976d2;
      border: 1px solid white;
      cursor: crosshair;
      z-index: 10000;
      pointer-events: auto;
      box-shadow: 0 0 4px rgba(0,0,0,0.3);
    `;
    return handle;
  }, [enabled]);

  const getFillValues = useCallback((
    startValue: any,
    count: number,
    direction: 'down' | 'right'
  ): any[] => {
    const values: any[] = [];

    if (startValue === null || startValue === undefined || startValue === '') {
      return Array(count).fill(startValue);
    }

    const numValue = parseFloat(startValue);
    if (!isNaN(numValue) && String(startValue).trim() === String(numValue)) {
      for (let i = 0; i < count; i++) {
        values.push(numValue + i + 1);
      }
    } else {
      for (let i = 0; i < count; i++) {
        values.push(startValue);
      }
    }

    return values;
  }, []);

  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (!enabled || !gridRef.current) return;

    const target = e.target as HTMLElement;
    if (!target.classList.contains('ag-fill-handle')) return;

    e.preventDefault();
    e.stopPropagation();

    const api = gridRef.current.api;
    if (!api) return;

    const focusedCell = api.getFocusedCell();
    if (!focusedCell) return;

    const rowNode = api.getDisplayedRowAtIndex(focusedCell.rowIndex);
    if (!rowNode) return;

    const column = api.getColumn(focusedCell.column);
    if (!column) return;

    const colId = column.getColId();
    const value = api.getValue(colId, rowNode);

    dragStartPos.current = {
      row: focusedCell.rowIndex,
      col: colId,
      value: value
    };

    setIsDragging(true);
    setFillRange({
      startRow: focusedCell.rowIndex,
      startCol: colId,
      endRow: focusedCell.rowIndex,
      endCol: colId
    });

  }, [enabled, gridRef]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !dragStartPos.current || !gridRef.current) return;

    const api = gridRef.current.api;
    if (!api) return;

    const gridElement = gridRef.current.eGridDiv;
    if (!gridElement) return;

    const rect = gridElement.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const cellPosition = api.getCellRendererInstances({
      columns: [dragStartPos.current.col]
    })[0]?.getGui?.()?.parentElement;

    if (!cellPosition) return;

    let currentRow = dragStartPos.current.row;
    const cellHeight = 42;
    const relativeY = y - (dragStartPos.current.row * cellHeight);

    if (relativeY > cellHeight) {
      currentRow = dragStartPos.current.row + Math.floor(relativeY / cellHeight);
    } else if (relativeY < 0) {
      currentRow = dragStartPos.current.row + Math.ceil(relativeY / cellHeight);
    }

    const rowCount = api.getDisplayedRowCount();
    currentRow = Math.max(0, Math.min(currentRow, rowCount - 1));

    setFillRange({
      startRow: dragStartPos.current.row,
      startCol: dragStartPos.current.col,
      endRow: currentRow,
      endCol: dragStartPos.current.col
    });

  }, [isDragging, gridRef]);

  const handleMouseUp = useCallback(() => {
    if (!isDragging || !dragStartPos.current || !fillRange || !gridRef.current) {
      setIsDragging(false);
      setFillRange(null);
      return;
    }

    const api = gridRef.current.api;
    if (!api) {
      setIsDragging(false);
      setFillRange(null);
      return;
    }

    const { row: startRow, col: colId, value: startValue } = dragStartPos.current;
    const { endRow } = fillRange;

    if (startRow === endRow) {
      setIsDragging(false);
      setFillRange(null);
      return;
    }

    const direction = endRow > startRow ? 'down' : 'up';
    const rowCount = Math.abs(endRow - startRow);

    const values = getFillValues(startValue, rowCount, 'down');

    const column = api.getColumn(colId);
    if (!column) {
      setIsDragging(false);
      setFillRange(null);
      return;
    }

    const colDef = column.getColDef();
    if (colDef.editable === false) {
      setIsDragging(false);
      setFillRange(null);
      return;
    }

    const rowsToUpdate = [];
    const actualStartRow = Math.min(startRow, endRow);
    const actualEndRow = Math.max(startRow, endRow);

    for (let i = actualStartRow + 1; i <= actualEndRow; i++) {
      const rowNode = api.getDisplayedRowAtIndex(i);
      if (rowNode && rowNode.data) {
        const valueIndex = direction === 'down' ? i - startRow - 1 : startRow - i - 1;
        const newValue = values[valueIndex];

        const updatedData = { ...rowNode.data, [colId]: newValue };
        rowsToUpdate.push(updatedData);
      }
    }

    if (rowsToUpdate.length > 0) {
      api.applyTransaction({ update: rowsToUpdate });

      rowsToUpdate.forEach((data, index) => {
        const rowIndex = actualStartRow + 1 + index;
        const rowNode = api.getDisplayedRowAtIndex(rowIndex);
        if (rowNode) {
          const event = {
            type: 'cellValueChanged',
            node: rowNode,
            data: data,
            oldValue: rowNode.data[colId],
            newValue: data[colId],
            rowIndex: rowIndex,
            column: column,
            colDef: colDef,
            api: api,
            columnApi: null,
            context: null,
            source: 'fillHandle'
          };

          api.dispatchEvent(event);
        }
      });
    }

    if (onFillComplete) {
      onFillComplete(
        actualStartRow,
        colId,
        actualEndRow,
        colId,
        [values]
      );
    }

    setIsDragging(false);
    setFillRange(null);
    dragStartPos.current = null;

  }, [isDragging, fillRange, gridRef, getFillValues, onFillComplete]);

  const updateHandlePosition = useCallback(() => {
    if (!enabled || !gridRef.current || !handleElement.current) return;

    const api = gridRef.current.api;
    if (!api) return;

    const focusedCell = api.getFocusedCell();
    if (!focusedCell) {
      handleElement.current.style.display = 'none';
      return;
    }

    const cellElement = api.getCellRendererInstances({
      rowNodes: [api.getDisplayedRowAtIndex(focusedCell.rowIndex)!],
      columns: [focusedCell.column]
    })[0]?.getGui?.()?.parentElement;

    if (!cellElement) {
      handleElement.current.style.display = 'none';
      return;
    }

    const gridElement = gridRef.current.eGridDiv;
    if (!gridElement) return;

    const gridRect = gridElement.getBoundingClientRect();
    const cellRect = cellElement.getBoundingClientRect();

    handleElement.current.style.display = 'block';
    handleElement.current.style.left = `${cellRect.right - gridRect.left - 4}px`;
    handleElement.current.style.top = `${cellRect.bottom - gridRect.top - 4}px`;

  }, [enabled, gridRef]);

  useEffect(() => {
    if (!enabled || !gridRef.current) return;

    const handle = createFillHandle();
    if (!handle) return;

    const gridElement = gridRef.current.eGridDiv;
    if (!gridElement) return;

    gridElement.style.position = 'relative';
    gridElement.appendChild(handle);
    handleElement.current = handle;

    return () => {
      if (handle.parentElement) {
        handle.parentElement.removeChild(handle);
      }
    };
  }, [enabled, gridRef, createFillHandle]);

  useEffect(() => {
    if (!enabled || !gridRef.current) return;

    const api = gridRef.current.api;
    if (!api) return;

    const onCellFocusChanged = () => {
      updateHandlePosition();
    };

    const onBodyScroll = () => {
      updateHandlePosition();
    };

    api.addEventListener('cellFocused', onCellFocusChanged);
    api.addEventListener('bodyScroll', onBodyScroll);

    return () => {
      api.removeEventListener('cellFocused', onCellFocusChanged);
      api.removeEventListener('bodyScroll', onBodyScroll);
    };
  }, [enabled, gridRef, updateHandlePosition]);

  useEffect(() => {
    if (!enabled) return;

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [enabled, handleMouseDown, handleMouseMove, handleMouseUp]);

  useEffect(() => {
    if (!enabled || !fillRange || !isDragging || !gridRef.current) return;

    const api = gridRef.current.api;
    if (!api) return;

    const startRow = Math.min(fillRange.startRow, fillRange.endRow);
    const endRow = Math.max(fillRange.startRow, fillRange.endRow);

    for (let i = startRow; i <= endRow; i++) {
      const rowNode = api.getDisplayedRowAtIndex(i);
      if (rowNode) {
        api.flashCells({
          rowNodes: [rowNode],
          columns: [fillRange.startCol],
          flashDelay: 0,
          fadeDelay: 0
        });
      }
    }

  }, [enabled, fillRange, isDragging, gridRef]);

  return {
    isDragging,
    fillRange
  };
}
