/**
 * ExcelLikeFilter – AG Grid v34 React custom filter (Excel-style).
 *
 * Uses the v34 API: CustomFilterProps + useGridFilter hook.
 * Popup close uses the official hidePopup callback from afterGuiAttached.
 *
 * Layout:
 *  ┌─────────────────────────┐
 *  │ 🔍 Search...            │
 *  ├─────────────────────────┤
 *  │ ☑ (בחר הכל)             │
 *  │ ☑ value1                │
 *  │ ☑ value2                │
 *  ├─────────────────────────┤
 *  │  [אישור]    [ביטול]     │
 *  └─────────────────────────┘
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useGridFilter } from 'ag-grid-react';
import type { CustomFilterProps, IAfterGuiAttachedParams, IDoesFilterPassParams } from 'ag-grid-community';

// ─── constants ───────────────────────────────────────────────────────────────

const BLANK_LABEL = '(ריק)';

// ─── model ───────────────────────────────────────────────────────────────────

export interface ExcelLikeFilterModel {
  values: string[]; // display-values that are checked (kept visible)
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function toDisplayValue(raw: unknown): string {
  if (raw === null || raw === undefined || raw === '') return BLANK_LABEL;
  return String(raw);
}

// ─── component ───────────────────────────────────────────────────────────────

const ExcelLikeFilter = ({
  model,
  onModelChange,
  onUiChange,
  api,
  getValue,
}: CustomFilterProps<any, any, ExcelLikeFilterModel>) => {

  // Official AG Grid hook to close the popup: captured from afterGuiAttached
  const hidePopupRef = useRef<(() => void) | undefined>();

  // Collect unique values from all rows using getValue (handles valueGetters)
  const collectAllValues = useCallback((): string[] => {
    const seen = new Set<string>();
    api.forEachNode((node: any) => {
      if (!node.data) return; // skip group/loading nodes
      const raw = getValue(node);
      seen.add(toDisplayValue(raw));
    });
    return Array.from(seen).sort((a, b) => {
      if (a === BLANK_LABEL) return 1;
      if (b === BLANK_LABEL) return -1;
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [api, getValue]);

  const [allValues, setAllValues] = useState<string[]>(() => collectAllValues());
  // "pending" = what the checkboxes show (not yet applied)
  const [pending, setPending] = useState<Set<string>>(() => {
    if (model) return new Set(model.values);
    return new Set(collectAllValues());
  });
  const [search, setSearch] = useState('');

  // Keep a ref of the current committed model for doesFilterPass
  const modelRef = useRef<ExcelLikeFilterModel | null>(model);
  useEffect(() => { modelRef.current = model; }, [model]);

  // Register doesFilterPass + afterGuiAttached with the grid.
  // afterGuiAttached fires each time the popup opens — ideal to refresh values
  // and capture the hidePopup callback.
  useGridFilter({
    doesFilterPass(params: IDoesFilterPassParams): boolean {
      if (!modelRef.current) return true;
      const raw = getValue(params.node);
      return modelRef.current.values.includes(toDisplayValue(raw));
    },
    afterGuiAttached(params?: IAfterGuiAttachedParams) {
      // Capture official popup-close callback
      hidePopupRef.current = params?.hidePopup;
      // Refresh value list every time popup opens
      const fresh = collectAllValues();
      setAllValues(fresh);
      if (!modelRef.current) {
        setPending(new Set(fresh));
      }
    },
  });

  // Sync pending state when model changes from outside (e.g. setModel / reset).
  // IMPORTANT: depend only on `model` — including `collectAllValues` here caused
  // pending to reset on every render where AG Grid handed back a new `getValue`
  // or `api` reference, wiping mid-selection state and leaving the (בחר הכל)
  // checkbox stuck in the checked state. afterGuiAttached already refreshes
  // `allValues` when the popup opens, so we don't need to refresh it here.
  useEffect(() => {
    if (model) {
      setPending(new Set(model.values));
    } else {
      setPending(new Set(collectAllValues()));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  // ── derived ────────────────────────────────────────────────────────────────
  const visible = search
    ? allValues.filter((v) => v.toLowerCase().includes(search.toLowerCase()))
    : allValues;

  const allVisibleSelected = visible.length > 0 && visible.every((v) => pending.has(v));
  const someVisibleSelected = visible.some((v) => pending.has(v));

  // ── handlers ───────────────────────────────────────────────────────────────
  const toggleValue = (value: string) => {
    setPending((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
    onUiChange();
  };

  const toggleSelectAll = () => {
    setPending((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visible.forEach((v) => next.delete(v));
      else visible.forEach((v) => next.add(v));
      return next;
    });
    onUiChange();
  };

  const handleOk = () => {
    const isAll = allValues.every((v) => pending.has(v));
    onModelChange(isAll ? null : { values: Array.from(pending) });
    hidePopupRef.current?.();
  };

  const handleCancel = () => {
    // Revert pending to current committed model
    if (model) setPending(new Set(model.values));
    else setPending(new Set(allValues));
    setSearch('');
    hidePopupRef.current?.();
  };

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div style={styles.container} dir="rtl">
      {/* Search */}
      <div style={styles.searchRow}>
        <input
          type="text"
          placeholder="חיפוש..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={styles.searchInput}
          autoFocus
        />
      </div>

      {/* Checkbox list */}
      <div style={styles.listContainer}>
        {/* (בחר הכל) */}
        <label style={styles.itemLabel}>
          <input
            type="checkbox"
            checked={allVisibleSelected}
            ref={(el) => { if (el) el.indeterminate = !allVisibleSelected && someVisibleSelected; }}
            onChange={toggleSelectAll}
            style={styles.checkbox}
          />
          <span style={styles.selectAllText}>(בחר הכל)</span>
        </label>

        {/* Values */}
        {visible.length === 0 ? (
          <div style={styles.noResults}>אין תוצאות</div>
        ) : (
          visible.map((value) => (
            <label key={value} style={styles.itemLabel}>
              <input
                type="checkbox"
                checked={pending.has(value)}
                onChange={() => toggleValue(value)}
                style={styles.checkbox}
              />
              <span style={value === BLANK_LABEL ? styles.blankText : undefined}>{value}</span>
            </label>
          ))
        )}
      </div>

      {/* Buttons */}
      <div style={styles.buttonRow}>
        <button onClick={handleOk} style={styles.okBtn} type="button">אישור</button>
        <button onClick={handleCancel} style={styles.cancelBtn} type="button">ביטול</button>
      </div>
    </div>
  );
};

export default ExcelLikeFilter;

// ─── styles ──────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: 220,
    padding: '6px',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    fontSize: 13,
    backgroundColor: '#fff',
    direction: 'rtl',
    border: '1px solid #b0b0b0',
    boxShadow: '2px 2px 6px rgba(0,0,0,0.15)',
  },
  searchRow: { marginBottom: 4 },
  searchInput: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '3px 6px',
    border: '1px solid #b0b0b0',
    borderRadius: 2,
    fontSize: 12,
    direction: 'rtl',
    textAlign: 'right',
    outline: 'none',
  },
  listContainer: {
    maxHeight: 150,
    overflowY: 'auto',
    border: '1px solid #b0b0b0',
    marginBottom: 6,
    backgroundColor: '#fff',
  },
  itemLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    padding: '2px 6px',
    cursor: 'pointer',
    userSelect: 'none',
    direction: 'rtl',
    fontSize: 12,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  selectAllText: { fontWeight: 500 },
  noResults: { padding: '6px', color: '#999', textAlign: 'center', fontSize: 12 },
  blankText: { color: '#999', fontStyle: 'italic' },
  checkbox: { cursor: 'pointer', flexShrink: 0, margin: 0, accentColor: '#1565c0' },
  buttonRow: { display: 'flex', gap: 4, justifyContent: 'flex-end' },
  okBtn: {
    padding: '3px 12px',
    backgroundColor: '#fff',
    color: '#000',
    border: '1px solid #767676',
    borderRadius: 2,
    cursor: 'pointer',
    fontSize: 12,
  },
  cancelBtn: {
    padding: '3px 12px',
    backgroundColor: '#fff',
    color: '#000',
    border: '1px solid #767676',
    borderRadius: 2,
    cursor: 'pointer',
    fontSize: 12,
  },
};
