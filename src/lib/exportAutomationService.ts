/**
 * Shared Export-to-Automation Service
 * Single source of truth for all "שליחת נתונים לעירייה" exports.
 */
import { Building, AssetType, api } from './api';
import { createExcelBlob } from './excelExport';
import { getAssetFileBlobForZip } from './apiClient';
import { formatDateToDDMMYYYY } from './dateUtils';
import { setLatestExportDate } from './validation';

export interface ExportAutomationConfig {
  assets: any[];
  buildingsMap?: Map<number, Building>;   // pre-fetched (optional, used as cache)
  assetTypes: AssetType[];
  onProgress?: (message: string) => void;
  createUpdateSheet?: boolean;            // default true
  markAsExported?: boolean;               // default true
  sendEmails?: boolean;                   // default true — set false for re-runs/preview
  zipFilenamePrefix?: string;             // default 'שליחת_נתונים'
}

export interface ExportAutomationResult {
  exported: number;
  sentEmails: number;
  failedEmails: number;
  emailError?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

// Main automation sheet — city-facing. The city's parser expects this exact
// 24-column layout; do NOT add payer_full_name here (it stays in the internal
// UPDATE_SHEET / grids / other exports).
export const MAIN_SHEET_HEADERS: string[] = [
  'זיהוי משלם',
  'זיהוי נכס',
  'תחילת שינוי',
  'סוף שינוי',
  'סוג נכס',
  'גודל נכס',
  'נכס משנה 1',
  'גודל נכס משנה 1',
  'נכס משנה 2',
  'גודל נכס משנה 2',
  'נכס משנה 3',
  'גודל נכס משנה 3',
  'נכס משנה 4',
  'גודל נכס משנה 4',
  'נכס משנה 5',
  'גודל נכס משנה 5',
  'נכס משנה 6',
  'גודל נכס משנה 6',
  'מנה',
  'מקום גביה',
  'מספר פקודה',
  'שנת כספים',
  'תאריך גביה',
  'יום ערך',
];

export const UPDATE_SHEET_HEADERS: string[] = [
  'זיהוי נכס',
  'זיהוי משלם',
  'שם המשלם',
  'מספר בניין',
  'מספר דירה',
  'קומה',
  'מספר מחסן',
  'קומת מחסן',
  'מהות שימוש',
  'הערה',
  'מספר יחידות חניה',
  'מעלית',
  'בית צמוד/דו משפחתי',
  'דירת גג',
  'גוש',
  'חלקה',
  'מספר בניין ברחוב',
  'קוד רחוב',
];

export const MAIN_SHEET_COL_WIDTHS = [
  { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 12 },
  { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
  { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
  { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 15 },
];

export const UPDATE_SHEET_COL_WIDTHS = [
  { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 12 },
  { wch: 18 }, { wch: 20 }, { wch: 18 }, { wch: 10 }, { wch: 18 }, { wch: 12 },
  { wch: 11 }, { wch: 11 }, { wch: 18 }, { wch: 12 },
];

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function boolToHe(v: any): string {
  return v === true ? 'כן' : '';
}

function formatFloor(f: any): string {
  if (f == null || f === '') return '';
  const s = String(f);
  const trailing = s.match(/^(\d+)-$/);
  return trailing ? '-' + trailing[1] : s;
}

/**
 * Resolve a file's storage path (bucket-relative) given the file record and the owning asset id.
 * Mirrors the identical logic found in AssetsList.tsx / AssetDetails.tsx.
 */
function resolveFilePath(assetId: number, file: any): string {
  const fp = typeof file?.file_path === 'string' ? file.file_path.trim() : '';
  if (fp && !fp.startsWith('http') && !fp.startsWith('/'))
    return fp.includes('/') ? fp : `${assetId}/${fp}`;
  const url = file?.file_url;
  if (typeof url === 'string' && url) {
    const u = url.replace(/\\/g, '/');
    const idx = u.indexOf('structure-drawings/');
    if (idx !== -1) return u.substring(idx + 'structure-drawings/'.length).split('?')[0];
    const fn = u.split('/').pop()?.split('?')[0] ?? '';
    if (fn) return `${assetId}/${fn}`;
  }
  const name = typeof file?.file_name === 'string' ? file.file_name.trim() : '';
  return name ? `${assetId}/${name}` : `${assetId}/unknown`;
}

function getExportAssetSize(asset: any, assetTypes: AssetType[]): number | string {
  const assetSize = Number(asset.asset_size) || 0;
  const dist = Number(asset.business_distribution_area) || 0;
  const sharedParking = Number(asset.shared_parking_area) || 0;
  const total = assetSize + dist + sharedParking;
  return total > 0 ? total : '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Exported row builders
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply business_distribution_area and shared_parking_area to the appropriate
 * sub-type size columns. Mirrors applySharedAreasToExportRow in AssetsList.tsx
 * and AssetDetails.tsx exactly.
 */
export function applySharedAreasToRow(asset: any, row: any[], assetTypes: AssetType[]): any[] {
  const result = [...row];

  // MAIN_SHEET_HEADERS is 24 cols (payer_full_name is NOT exported to the city):
  //   0 payer_id, 1 asset_id, 2 discount_from, 3 discount_to,
  //   4 main_asset_type, 5 asset_size, 6 sub_asset_type_1, 7 sub_asset_size_1, …
  //   sub-type pairs live at (6,7), (8,9), (10,11), (12,13), (14,15), (16,17).

  // Add business_distribution_area to sub_asset_size_1 (index 7)
  // only when sub_asset_type_1 (index 6) is non-empty.
  const businessDistributionArea = Number(asset.business_distribution_area) || 0;
  if (businessDistributionArea > 0 && String(result[6] || '').trim()) {
    result[7] = (Number(result[7]) || 0) + businessDistributionArea;
  }

  // Add shared_parking_area to the parking type column
  const sharedParkingArea = Number(asset.shared_parking_area) || 0;
  if (sharedParkingArea > 0) {
    const findType = (typeName: string): AssetType | undefined => {
      if (!typeName) return undefined;
      let at = assetTypes.find((t: any) => String(t.name || '').trim() === typeName);
      if (!at) {
        const n = parseInt(typeName, 10);
        if (!isNaN(n)) at = assetTypes.find((t: any) => parseInt(String(t.name || ''), 10) === n);
      }
      return at;
    };
    const isParkingType = (typeName: string) => !!(findType(typeName) as any)?.use_for_parking_shared_area;

    const mainTypeName = String(result[4] || '').trim();
    if (mainTypeName && isParkingType(mainTypeName)) {
      // Main type is the parking type — add to sub_asset_size_1 only when sub1 exists
      if (String(result[6] || '').trim()) {
        result[7] = (Number(result[7]) || 0) + sharedParkingArea;
      }
    } else {
      let foundParking = false;
      for (let i = 0; i < 6; i++) {
        const typeIdx = 6 + i * 2;
        const sizeIdx = 7 + i * 2;
        const subtypeName = String(result[typeIdx] || '').trim();
        if (!subtypeName) continue;
        if (isParkingType(subtypeName)) {
          result[sizeIdx] = (Number(result[sizeIdx]) || 0) + sharedParkingArea;
          foundParking = true;
          break;
        }
      }
      // Fallback: flag not set but asset has parking units — add to last non-empty sub-type
      if (!foundParking && Number(asset.number_of_parking_units) > 0) {
        for (let i = 5; i >= 0; i--) {
          const typeIdx = 6 + i * 2;
          const sizeIdx = 7 + i * 2;
          if (String(result[typeIdx] || '').trim()) {
            result[sizeIdx] = (Number(result[sizeIdx]) || 0) + sharedParkingArea;
            break;
          }
        }
      }
    }
  }

  return result;
}

/** Build the main sheet row for a single asset (24 billing columns). */
export function buildMainSheetRow(asset: any, assetTypes: AssetType[]): any[] {
  const baseRow = [
    asset.payer_id || '',
    asset.asset_id != null ? String(asset.asset_id) : '',
    formatDateToDDMMYYYY(asset.discount_date_from) || '',
    formatDateToDDMMYYYY(asset.discount_date_to) || '',
    asset.main_asset_type || '',
    getExportAssetSize(asset, assetTypes),
    asset.sub_asset_type_1 || '',
    asset.sub_asset_size_1 || '',
    asset.sub_asset_type_2 || '',
    asset.sub_asset_size_2 || '',
    asset.sub_asset_type_3 || '',
    asset.sub_asset_size_3 || '',
    asset.sub_asset_type_4 || '',
    asset.sub_asset_size_4 || '',
    asset.sub_asset_type_5 || '',
    asset.sub_asset_size_5 || '',
    asset.sub_asset_type_6 || '',
    asset.sub_asset_size_6 || '',
    '',
    '',
    '',
    '',
    '',
    '',
  ];
  return applySharedAreasToRow(asset, baseRow, assetTypes);
}

/** Build the 17-column update sheet row for a single asset. */
export function buildUpdateSheetRow(asset: any, building: Building | undefined): any[] {
  return [
    asset.asset_id != null ? String(asset.asset_id) : '',
    asset.payer_id || '',
    asset.payer_full_name || '',
    asset.building_number != null ? String(asset.building_number) : '',
    asset.apartment_number || '',
    formatFloor(asset.apartment_floor),
    asset.storage_number || '',
    asset.storage_floor || '',
    asset.use_nature || '',
    asset.comment || '',
    asset.number_of_parking_units != null ? asset.number_of_parking_units : '',
    boolToHe(asset.elevator),
    boolToHe(asset.single_double_family),
    boolToHe(asset.penthouse),
    building?.gosh ?? '',
    building?.helka ?? '',
    building?.building_number_in_street ?? '',
    building?.address ?? '',
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Main orchestration
// ─────────────────────────────────────────────────────────────────────────────

export async function runExportToAutomation(config: ExportAutomationConfig): Promise<ExportAutomationResult> {
  const {
    assets,
    buildingsMap: preFetchedBuildings,
    assetTypes,
    onProgress,
    createUpdateSheet = true,
    markAsExported = true,
    sendEmails = true,
    zipFilenamePrefix = 'שליחת_נתונים',
  } = config;

  const progress = (msg: string) => onProgress?.(msg);

  // ── 1. Build buildings map (merge pre-fetched + fetch missing) ──────────────
  const buildingsMap = new Map<number, Building>(preFetchedBuildings ?? []);

  const uniqueBuildingNumbers = [
    ...new Set(
      assets
        .map((a) => (typeof a.building_number === 'string' ? parseInt(a.building_number, 10) : Number(a.building_number)))
        .filter((bn) => !isNaN(bn) && bn > 0)
    ),
  ];

  const missingBnList = uniqueBuildingNumbers.filter((bn) => !buildingsMap.has(bn));
  if (missingBnList.length > 0) {
    progress('טוען נתוני בניינים...');
    const fetched = await Promise.all(
      missingBnList.map((bn) =>
        api.buildings.getOne(bn).catch((err: any) => {
          console.warn(`[exportAutomationService] Failed to fetch building ${bn}:`, err);
          return null;
        })
      )
    );
    missingBnList.forEach((bn, i) => {
      if (fetched[i]) buildingsMap.set(bn, fetched[i]!);
    });
  }

  // ── 2. Fetch all asset files ────────────────────────────────────────────────
  const numericAssetIds = assets
    .map((a) => {
      const id = typeof a.asset_id === 'string' ? parseInt(a.asset_id, 10) : Number(a.asset_id);
      return !isNaN(id) && id > 0 ? id : null;
    })
    .filter((id): id is number => id !== null);

  progress('טוען קבצים...');
  const filesByAsset: Map<number, any[]> =
    numericAssetIds.length > 0
      ? await api.assets.files.getAllBulk(numericAssetIds)
      : new Map<number, any[]>();

  // ── 3. Group assets by tax region ──────────────────────────────────────────
  const assetsByTaxRegion = new Map<string, any[]>();
  for (const asset of assets) {
    const tr = asset.tax_region ? String(asset.tax_region).trim() : 'unknown';
    if (!assetsByTaxRegion.has(tr)) assetsByTaxRegion.set(tr, []);
    assetsByTaxRegion.get(tr)!.push(asset);
  }

  // ── 4. Build ZIP contents ───────────────────────────────────────────────────
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
  const zipFiles: Array<{ filename: string; data: Blob }> = [];

  progress('מכין קבצים ל-ZIP...');

  for (const [taxRegion, regionAssets] of assetsByTaxRegion.entries()) {
    // ── 4a. Main sheet ──────────────────────────────────────────────────────
    const mainRows = regionAssets.map((asset) => buildMainSheetRow(asset, assetTypes));
    const mainFilename = `${zipFilenamePrefix}_${taxRegion}_${dateStr}.xlsx`;
    const mainBlob = createExcelBlob({
      filename: mainFilename,
      sheetName: 'נכסים',
      data: [MAIN_SHEET_HEADERS, ...mainRows],
      decimalFormatColumnIndices: [5, 7, 9, 11, 13, 15, 17],
      columnWidths: MAIN_SHEET_COL_WIDTHS,
    });
    zipFiles.push({ filename: `${taxRegion}/${mainFilename}`, data: mainBlob });

    // ── 4b. Update sheet (optional) ─────────────────────────────────────────
    if (createUpdateSheet) {
      const updateRows = regionAssets.map((asset) => {
        const bn =
          typeof asset.building_number === 'string'
            ? parseInt(asset.building_number, 10)
            : Number(asset.building_number);
        return buildUpdateSheetRow(asset, buildingsMap.get(bn));
      });
      const updateFilename = `עדכון_פרטי_נכס_${taxRegion}_${dateStr}.xlsx`;
      const updateBlob = createExcelBlob({
        filename: updateFilename,
        sheetName: 'עדכון פרטי נכס',
        data: [UPDATE_SHEET_HEADERS, ...updateRows],
        columnWidths: UPDATE_SHEET_COL_WIDTHS,
      });
      zipFiles.push({ filename: `${taxRegion}/${updateFilename}`, data: updateBlob });
    }

    // ── 4c. Asset files ─────────────────────────────────────────────────────
    // file_name is the sanitized {asset_id}_{N}.{ext} name produced on upload;
    // file_description carries the original Hebrew/spaces name the user uploaded
    // so the automation operator still sees what each file actually is.
    const fileListData: any[][] = [['מזהה נכס', 'מזהה משלם', 'שם המשלם', 'שם קובץ', 'תיאור קובץ']];

    // Collect download tasks for this tax region
    const downloadTasks: Array<{
      filePath: string;
      assetId: number;
      fileName: string;
      fileUrl?: string;
    }> = [];

    for (const asset of regionAssets) {
      const assetId =
        typeof asset.asset_id === 'string' ? parseInt(asset.asset_id, 10) : Number(asset.asset_id);
      if (isNaN(assetId) || assetId <= 0) continue;

      const files = filesByAsset.get(assetId) ?? [];
      const payerId = asset.payer_id || '';
      const payerFullName = asset.payer_full_name || '';

      for (const file of files) {
        let fileName: string = file.file_name || '';
        if (!fileName && file.file_url) {
          const u = (file.file_url as string).replace(/\\/g, '/');
          fileName = u.split('/').pop()?.split('?')[0] ?? '';
        }
        const fileDescription = (file as any).file_description || file.file_name || '';

        fileListData.push([assetId, payerId, payerFullName, fileName, fileDescription]);

        const filePath = resolveFilePath(assetId, file);
        if (filePath) {
          downloadTasks.push({ filePath, assetId, fileName, fileUrl: file.file_url });
        }
      }
    }

    // Download files in batches of 6
    const CONCURRENCY = 6;
    for (let i = 0; i < downloadTasks.length; i += CONCURRENCY) {
      const batch = downloadTasks.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map(async (task) => {
          try {
            const r = await getAssetFileBlobForZip(task.filePath, task.fileUrl);
            if (r.error || !r.data) {
              console.warn(`[exportAutomationService] Error downloading file for asset ${task.assetId}:`, r.error?.message);
              return null;
            }
            return { data: r.data, task };
          } catch (err) {
            console.warn(`[exportAutomationService] Error processing file for asset ${task.assetId}:`, err);
            return null;
          }
        })
      );
      for (const r of results) {
        if (r) {
          // file_name is already {asset_id}_{N}.{ext}, unique across the building,
          // so no need to re-prefix the asset_id here. Legacy rows whose file_name
          // is still the original Hebrew name keep the prefix for uniqueness.
          const alreadyAssetPrefixed = new RegExp(`^${r.task.assetId}_`).test(r.task.fileName);
          const zipName = alreadyAssetPrefixed ? r.task.fileName : `${r.task.assetId}_${r.task.fileName}`;
          const zipFilePath = `${taxRegion}/${zipName}`;
          zipFiles.push({ filename: zipFilePath, data: r.data });
        }
      }
    }

    // ── 4d. File list sheet (if any files) ──────────────────────────────────
    if (fileListData.length > 1) {
      const fileListFilename = `רשימת_קבצים_${taxRegion}_${dateStr}.xlsx`;
      const fileListBlob = createExcelBlob({
        filename: fileListFilename,
        sheetName: 'רשימת קבצים',
        data: fileListData,
        columnWidths: [{ wch: 15 }, { wch: 15 }, { wch: 22 }, { wch: 40 }],
      });
      zipFiles.push({ filename: `${taxRegion}/${fileListFilename}`, data: fileListBlob });
    }
  }

  // ── 5. Prepare email send items ─────────────────────────────────────────────
  progress('מכין מיילים לפקידים/ות ולמנהלים...');

  const dateStrHe = now.toLocaleDateString('he-IL');
  const [templateOp, templateMgr] = await Promise.all([
    api.systemConfiguration.getEmailTemplate('email_template_operator'),
    api.systemConfiguration.getEmailTemplate('email_template_manager'),
  ]).catch(() => [null, null] as [null, null]);

  const applyTpl = (t: string, name: string, assetCount?: number) =>
    t
      .replace(/\{\{name\}\}/g, name)
      .replace(/\{\{date\}\}/g, dateStrHe)
      .replace(/\{\{assetCount\}\}/g, assetCount != null ? String(assetCount) : '');

  const operatorsList = await api.operators.getAll();

  const sendItems: Array<{
    to: string;
    subject: string;
    body: string;
    attachments: Array<{ filename: string; content: Blob; contentType?: string }>;
  }> = [];

  // Group by operator
  const byOperator = new Map<number, any[]>();
  for (const a of assets) {
    const id = a.operator_id;
    if (id != null) {
      if (!byOperator.has(id)) byOperator.set(id, []);
      byOperator.get(id)!.push(a);
    }
  }

  // Per-operator emails. Only assets that carry an operator_id are sent, and
  // each operator receives only their own assets. Assets without an
  // operator_id are NOT broadcast — if no asset is assigned to an operator,
  // no operator email goes out (the previous "send full list to all operators"
  // fallback was removed by request). Manager emails (filtered by tax_region)
  // are still sent below regardless.
  for (const [operatorId, operatorAssets] of byOperator) {
    const operator = operatorsList.find((o: any) => o.id === operatorId);
    if (!operator?.email || !operator.email.includes('@')) continue;

    const opRows = operatorAssets.map((asset) => buildMainSheetRow(asset, assetTypes));
    const opMainFilename = `נכסים_מפעיל_${operatorId}_${dateStr}_${operatorAssets.length}נכסים.xlsx`;
    const opExcelBlob = createExcelBlob({
      filename: opMainFilename,
      sheetName: 'נכסים',
      data: [MAIN_SHEET_HEADERS, ...opRows],
      decimalFormatColumnIndices: [5, 7, 9, 11, 13, 15, 17],
      columnWidths: MAIN_SHEET_COL_WIDTHS,
    });

    // Operator also receives the property-details update sheet (same fields as
    // the main export's "עדכון פרטי נכס" sheet) — NOT the asset-files list.
    const opUpdateRows = operatorAssets.map((asset) => {
      const bn =
        typeof asset.building_number === 'string'
          ? parseInt(asset.building_number, 10)
          : Number(asset.building_number);
      return buildUpdateSheetRow(asset, buildingsMap.get(bn));
    });
    const opUpdateFilename = `עדכון_פרטי_נכס_מפעיל_${operatorId}_${dateStr}.xlsx`;
    const opUpdateBlob = createExcelBlob({
      filename: opUpdateFilename,
      sheetName: 'עדכון פרטי נכס',
      data: [UPDATE_SHEET_HEADERS, ...opUpdateRows],
      columnWidths: UPDATE_SHEET_COL_WIDTHS,
    });

    const subj = templateOp
      ? applyTpl(templateOp.subject, operator.name, operatorAssets.length)
      : `שליחת נתונים - ${dateStrHe}`;
    const body = templateOp
      ? applyTpl(templateOp.body, operator.name, operatorAssets.length)
      : `שלום ${operator.name},\n\nמצורפים קבצי הנתונים ועדכון פרטי הנכס.\nתאריך: ${dateStrHe}\n\nבברכה,\nמערכת ניהול נכסים`;

    sendItems.push({
      to: operator.email,
      subject: subj,
      body,
      attachments: [
        {
          filename: opMainFilename,
          content: opExcelBlob,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
        {
          filename: opUpdateFilename,
          content: opUpdateBlob,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      ],
    });
  }

  // Manager emails (filtered by tax_regions)
  const managersList = await api.managers.getAll();
  for (const manager of managersList) {
    if (!manager.email || !manager.email.includes('@')) continue;
    const regionStrs = (manager.tax_regions || '')
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean);
    const regionSet = new Set(
      regionStrs
        .map((s: string) => { const n = parseInt(s, 10); return isNaN(n) ? null : n; })
        .filter((n: number | null): n is number => n !== null)
    );
    const managerAssets = assets.filter((a: any) => {
      const tr =
        a.tax_region != null
          ? typeof a.tax_region === 'string'
            ? parseInt(a.tax_region, 10)
            : a.tax_region
          : null;
      return tr != null && regionSet.has(tr);
    });
    if (managerAssets.length === 0) continue;

    const mgrRows = managerAssets.map((asset) => buildMainSheetRow(asset, assetTypes));
    const mgrMainFilename = `נכסים_מנהל_${manager.id}_${dateStr}_${managerAssets.length}נכסים.xlsx`;
    const mgrExcelBlob = createExcelBlob({
      filename: mgrMainFilename,
      sheetName: 'נכסים',
      data: [MAIN_SHEET_HEADERS, ...mgrRows],
      decimalFormatColumnIndices: [5, 7, 9, 11, 13, 15, 17],
      columnWidths: MAIN_SHEET_COL_WIDTHS,
    });

    // Manager also receives the property-details update sheet — symmetric with
    // the operator email, NOT the asset-files list.
    const mgrUpdateRows = managerAssets.map((asset) => {
      const bn =
        typeof asset.building_number === 'string'
          ? parseInt(asset.building_number, 10)
          : Number(asset.building_number);
      return buildUpdateSheetRow(asset, buildingsMap.get(bn));
    });
    const mgrUpdateFilename = `עדכון_פרטי_נכס_מנהל_${manager.id}_${dateStr}.xlsx`;
    const mgrUpdateBlob = createExcelBlob({
      filename: mgrUpdateFilename,
      sheetName: 'עדכון פרטי נכס',
      data: [UPDATE_SHEET_HEADERS, ...mgrUpdateRows],
      columnWidths: UPDATE_SHEET_COL_WIDTHS,
    });

    const subj = templateMgr
      ? applyTpl(templateMgr.subject, manager.name, managerAssets.length)
      : `שליחת נתונים - ${dateStrHe}`;
    const body = templateMgr
      ? applyTpl(templateMgr.body, manager.name, managerAssets.length)
      : `שלום ${manager.name},\n\nמצורפים קבצי הנתונים ועדכון פרטי הנכס.\nתאריך: ${dateStrHe}\n\nבברכה,\nמערכת ניהול נכסים`;

    sendItems.push({
      to: manager.email,
      subject: subj,
      body,
      attachments: [
        {
          filename: mgrMainFilename,
          content: mgrExcelBlob,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
        {
          filename: mgrUpdateFilename,
          content: mgrUpdateBlob,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      ],
    });
  }

  // ── 6. Send emails ──────────────────────────────────────────────────────────
  let sentEmails = 0;
  let emailError: string | undefined;

  if (sendEmails && sendItems.length > 0) {
    const { emailService } = await import('./emailService');
    const { sentCount, lastError } = await emailService.sendExportEmailsWithProgress(
      sendItems,
      {
        concurrency: 3,
        onProgress: (sent, total) => progress(`שולח מיילים ${sent} מתוך ${total}...`),
      }
    );
    sentEmails = sentCount;
    emailError = lastError;
  }

  // ── 7. Download ZIP ─────────────────────────────────────────────────────────
  progress('מוריד קובץ ZIP...');
  const zipFilename = `${zipFilenamePrefix}_${dateStr}.zip`;
  const { createAndDownloadZip } = await import('./zipExport');
  await createAndDownloadZip(zipFilename, zipFiles);

  // ── 8. Mark as exported ─────────────────────────────────────────────────────
  if (markAsExported && numericAssetIds.length > 0) {
    try {
      await api.assets.markExportedByIds(numericAssetIds);
      const d = new Date();
      setLatestExportDate(
        `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
      );
    } catch (markErr: any) {
      console.error('[exportAutomationService] Error marking assets as exported:', markErr);
    }
  }

  // ── 9. Return result ────────────────────────────────────────────────────────
  return {
    exported: numericAssetIds.length,
    sentEmails,
    failedEmails: sendItems.length - sentEmails,
    emailError,
  };
}
