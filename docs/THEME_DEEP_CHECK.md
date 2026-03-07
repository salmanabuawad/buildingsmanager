# Theme Deep Check Report – Ocean & Mist

**Date:** 2026-03-05

---

## 1. Theme variables (configured)

### Ocean (`[data-theme="ocean"]`)
| Variable | Value | Purpose |
|----------|-------|---------|
| Colors | header, sidebar, tab-active, action-accent, etc. | Main UI colors |
| `--theme-font-size-base` | 14px | Root font |
| `--theme-sidebar-width` | 13rem | Sidebar width |
| `--theme-btn-radius` | 0.5rem | Button corner radius |
| `--theme-icon-size` | 1rem | Icon size |
| Tabs | padding 0.5rem, gap 0.5rem, font 0.75rem | Tab layout |

### Mist (`[data-theme="mist"]`)
| Variable | Value | Purpose |
|----------|-------|---------|
| Colors | Same keys, slate/sky-blue palette | Different palette |
| `--theme-font-size-base` | 15px | Slightly larger |
| `--theme-sidebar-width` | 11rem | Narrower sidebar |
| `--theme-btn-radius` | 0.75rem | Softer corners |
| `--theme-icon-size` | 1.125rem | Larger icons |
| Tabs | More padding, font 0.8125rem | Bigger touch targets |

---

## 2. Theme-driven areas

| Area | Status | Notes |
|------|--------|-------|
| App shell (header, sidebar, content) | OK | `bg-theme-*`, `md:w-theme-sidebar` |
| Tab bar | OK | `.theme-tabs-bar`, `.theme-tab-item` |
| `.btn`, `.btn-menu`, `.btn-menu-item` | OK | `border-radius: var(--theme-btn-radius)` |
| Base font | OK | `html { font-size: var(--theme-font-size-base) }` |
| `.theme-icon` class | OK | Uses `--theme-icon-size` |
| Focus outline | OK | `rgb(var(--theme-action-accent))` |

---

## 3. Hardcoded colors not theme-driven

### 3.1 `teal-*` (60+ occurrences)

| File | Count | Usages |
|------|-------|--------|
| AssetsList.tsx | 15 | Loaders, gradients, buttons, badges |
| BuildingsList.tsx | 12 | Loaders, gradients, buttons, focus rings |
| AssetDetails.tsx | 16 | Loaders, progress bar, gradients, buttons |
| TransferAreas.tsx | 10 | Buttons, focus rings |
| SystemConfiguration.tsx | 6 | Buttons (partially mixed with theme-*) |
| AssetTypes.tsx | 8 | Focus rings (teal-500) |
| ValidationRulesManager.tsx | 7 | Buttons, icons |
| FieldConfigManager.tsx | 2 | Buttons |
| AddressList.tsx | 6 | Gradients, buttons |
| DistributionHistoryModal.tsx | 5 | Header, tabs, loader |
| AssetStatisticsModal.tsx | 2 | Header, text |
| AssetSearchByRange.tsx | 3 | Focus rings, gradient hover |
| AssetDataEntry.tsx | 2 | Focus rings, button |
| Others | 5+ | Various |

**Replace with:** `bg-theme-tab-active`, `text-theme-tab-active`, `focus:ring-theme-action-accent`, etc.

### 3.2 `blue-*` (40+ occurrences)

| File | Usages |
|------|--------|
| index.css | `active:bg-blue-800` in btn-primary/btn-secondary |
| BuildingListImport, AssetSearch | Borders, text, gradients |
| MeasurementHistory | Buttons, links |
| AuditDetailsModal | Grid borders |
| ChangeTaxRegionModal | Icons, focus, buttons |
| DetailRowRenderer | Links, borders |
| SystemConfiguration | Links, labels |
| DistributionHistoryModal | Links |

**Replace with:** `theme-action-accent` or `theme-tab-active` where they act as primary accent.

### 3.3 `purple-*`, `indigo-*`, `emerald-*`

| File | Usages |
|------|--------|
| MeasurementProgressDashboard | ~20 | Headers, borders, buttons, focus |
| MobileTasksAndUpload | 5 | Icons, buttons, focus |
| ChangeTaxRegionModal | 2 | Buttons |

**Note:** These screens use a distinct purple/indigo palette and do not follow the Ocean/Mist theme.

---

## 4. AG-Grid

| Item | Status |
|------|--------|
| Header, row, border colors | Hardcoded in `.ag-theme-alpine` (#e8ecf0, #c1e0f0, etc.) |
| Focus/editing box-shadow | `#2563eb` |
| Selected row | `#dbeafe` |

**Impact:** Grids keep the same look in both themes. To theme them, AG-Grid vars would need to use `var(--theme-*)`.

---

## 5. Hex colors in index.css

| Element | Color | Theme-aware? |
|---------|-------|---------------|
| AG-Grid vars | #e8ecf0, #374151, #2563eb, etc. | No |
| Tooltips | #f9fafb, #1f2937, #9ca3af | No |
| Error cells | #fee2e2, #ef4444 | No |
| Focus rings in grid | #2563eb | No |

---

## 6. Icon sizes

| Location | Current | Theme-aware? |
|----------|---------|--------------|
| App.tsx sidebar | h-4 w-4, h-3 w-3 | No – fixed |
| App.tsx tabs | h-4 w-4 | No |
| Components (Loader2, etc.) | h-6 w-6, h-8 w-8, h-12 w-12 | No |
| `.theme-icon` | Uses var | Yes, but rarely used |

---

## 7. Summary

### Theme-driven
- App shell layout and colors
- Tabs layout and colors
- Button shape (radius)
- Base font size
- Sidebar width
- `.theme-icon` when used

### Not theme-driven
- `teal-*` in 15+ components
- `blue-*` in 10+ components
- `purple-*` / `indigo-*` / `emerald-*` in MeasurementProgressDashboard, MobileTasksAndUpload
- AG-Grid styling
- Tooltip colors
- Most icon sizes (`h-4 w-4` etc.)
- `active:bg-blue-800` in `.btn` classes
- Several hardcoded hex values in `index.css`

### Recommendations
1. Replace all `teal-*` with `theme-tab-active` / `theme-action-accent` and equivalents.
2. Replace remaining `blue-*` accents with theme variables.
3. Add `--theme-ag-*` and wire AG-Grid vars to theme.
4. Use `theme-icon` for lucide icons where size should follow theme.
5. Decide whether MeasurementProgressDashboard / MobileTasksAndUpload should use the main theme or keep a separate palette and document the choice.
