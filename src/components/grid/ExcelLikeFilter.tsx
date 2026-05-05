/**
 * ExcelLikeFilter – AG Grid Community custom filter that mimics Excel's column filter.
 *
 * Layout (matches Excel exactly):
 *  ┌─────────────────────────┐
 *  │ 🔍 Search...            │
 *  ├─────────────────────────┤
 *  │ ☑ (Select All)          │
 *  │ ☑ value1                │
 *  │ ☑ value2                │
 *  │  ...                    │
 *  ├─────────────────────────┤
 *  │  [OK]        [Cancel]   │
 *  └─────────────────────────┘
 */

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type { IFilterParams, IDoesFilterPassParams } from 'ag-grid-community';

// ─── constants ───────────────────────────────────────────────────────────────

const BLANK_LABEL = '(ריק)';

// ─── helpers ─────────────────────────────────────────────────────────────────

function toDisplayValue(raw: unknown): string {
  if (raw === null || raw === undefined || raw === '') return BLANK_LABEL;
  return String(raw);
}

function getFieldValue(node: any, field: string): unknown {
  const data = node.data;
  if (!data) return undefined;
  return data[field];
}

// ─── model type ──────────────────────────────────────────────────────────────

export interface ExcelLikeFilterModel {
  values: string[];
}

// ─── component ───────────────────────────────────────────────────────────────

const ExcelLikeFilter = forwardRef<unknown, IFilterParams>((props, ref) => {
  const field: string = (props.colDef as any).field ?? '';

  const collectAllValues = useCallback((): string[] => {
    const seen = new Set<string>();
    props.api.forEachNode((node) => {
      const raw = field ? getFieldValue(node, field) : undefined;
      seen.add(toDisplayValue(raw));
    });
    return Array.from(seen).sort((a, b) => {
      if (a === BLANK_LABEL) return 1;
      if (b === BLANK_LABEL) return -1;
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [field, props.api]);

  const [allValues, setAllValues] = useState<string[]>(() => collectAllValues());
  const [selected, setSelected] = useState<Set<string>>(() => new Set(collectAllValues()));
  const [committed, setCommitted] = useState<Set<string> | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fresh = collectAllValues();
    setAllValues(fresh);
    setSelected((prev) => {
      const next = new Set(prev);
      fresh.forEach((v) => next.add(v));
      return next;
    });
  }, [collectAllValues]);

  // ── derived ────────────────────────────────────────────────────────────────
  const visible = search
    ? allValues.filter((v) => v.toLowerCase().includes(search.toLowerCase()))
    : allValues;

  const allVisibleSelected = visible.length > 0 && visible.every((v) => selected.has(v));
  const someVisibleSelected = visible.some((v) => selected.has(v));

  // ── AG Grid filter interface ───────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    isFilterActive(): boolean {
      return committed !== null;
    },
    doesFilterPass(params: IDoesFilterPassParams): boolean {
      if (committed === null) return true;
      if (!field) return true;
      const raw = getFieldValue(params.node, field);
      return committed.has(toDisplayValue(raw));
    },
    getModel(): ExcelLikeFilterModel | null {
      if (committed === null) return null;
      return { values: Array.from(committed) };
    },
    setModel(model: ExcelLikeFilterModel | null) {
      if (!model) {
        setCommitted(null);
        setSelected(new Set(allValues));
      } else {
        const s = new Set(model.values);
        setCommitted(s);
        setSelected(s);
      }
    },
  }));

  // ── handlers ───────────────────────────────────────────────────────────────
  const toggleValue = (value: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visible.forEach((v) => next.delete(v));
      } else {
        visible.forEach((v) => next.add(v));
      }
      return next;
    });
  };

  const handleOk = () => {
    const isAll = allValues.every((v) => selected.has(v));
    setCommitted(isAll ? null : new Set(selected));
    props.filterChangedCallback();
  };

  const handleCancel = () => {
    // Revert pending selection to last committed state
    if (committed === null) {
      setSelected(new Set(allValues));
    } else {
      setSelected(new Set(committed));
    }
    setSearch('');
  };

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div style={styles.container} dir="rtl">
      {/* Search box */}
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

      {/* Unified checkbox list: (Select All) + values */}
      <div style={styles.listContainer}>
        {/* Select All row — always visible */}
        <label style={styles.itemLabel}>
          <input
            type="checkbox"
            checked={allVisibleSelected}
            ref={(el) => {
              if (el) el.indeterminate = !allVisibleSelected && someVisibleSelected;
            }}
            onChange={toggleSelectAll}
            style={styles.checkbox}
          />
          <span style={styles.selectAllText}>(בחר הכל)</span>
        </label>

        {/* Value rows */}
        {visible.length === 0 ? (
          <div style={styles.noResults}>אין תוצאות</div>
        ) : (
          visible.map((value) => (
            <label key={value} style={styles.itemLabel}>
              <input
                type="checkbox"
                checked={selected.has(value)}
                onChange={() => toggleValue(value)}
                style={styles.checkbox}
              />
              <span style={value === BLANK_LABEL ? styles.blankText : undefined}>{value}</span>
            </label>
          ))
        )}
      </div>

      {/* OK / Cancel buttons */}
      <div style={styles.buttonRow}>
        <button onClick={handleOk} style={styles.okBtn} type="button">
          אישור
        </button>
        <button onClick={handleCancel} style={styles.cancelBtn} type="button">
          ביטול
        </button>
      </div>
    </div>
  );
});

ExcelLikeFilter.displayName = 'ExcelLikeFilter';
export default ExcelLikeFilter;

// ─── styles ───────────────────────────────────────────────────────────────────

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
  searchRow: {
    marginBottom: 4,
  },
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
    maxHeight: 200,
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
  selectAllText: {
    fontWeight: 500,
  },
  noResults: {
    padding: '6px',
    color: '#999',
    textAlign: 'center',
    fontSize: 12,
  },
  blankText: {
    color: '#999',
    fontStyle: 'italic',
  },
  checkbox: {
    cursor: 'pointer',
    flexShrink: 0,
    margin: 0,
    accentColor: '#1565c0',
  },
  buttonRow: {
    display: 'flex',
    gap: 4,
    justifyContent: 'flex-end',
  },
  okBtn: {
    padding: '3px 12px',
    backgroundColor: '#fff',
    color: '#000',
    border: '1px solid #767676',
    borderRadius: 2,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 400,
  },
  cancelBtn: {
    padding: '3px 12px',
    backgroundColor: '#fff',
    color: '#000',
    border: '1px solid #767676',
    borderRadius: 2,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 400,
  },
};
