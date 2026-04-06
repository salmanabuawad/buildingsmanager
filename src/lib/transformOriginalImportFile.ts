/**
 * Transforms a raw municipality-format Excel file into import-ready asset rows.
 *
 * Original format (sheet "מגורים"):
 *   Row 0: title (skip)
 *   Row 1: headers — מספר דירה | מספר מחסן | קומה | סוג נכס קיים | שם המחזיק | מספר נכס | תיאור | שטח קיים | סה"כ לחיוב
 *   Data rows: multiple rows per asset (one per sub-type), asset_id only on first row of each group
 *
 * Output: one row per asset_id, matching the import grid format.
 */

import * as XLSX from 'xlsx';

export interface TransformedAsset {
  building_number: number;
  asset_id: number;
  tax_region: number;
  main_asset_type: string;
  asset_size: number;
  sub_asset_type_1: string; sub_asset_size_1: number;
  sub_asset_type_2: string; sub_asset_size_2: number;
  sub_asset_type_3: string; sub_asset_size_3: number;
  sub_asset_type_4: string; sub_asset_size_4: number;
  sub_asset_type_5: string; sub_asset_size_5: number;
  sub_asset_type_6: string; sub_asset_size_6: number;
  apartment_number: string | null;
  apartment_floor: number | null;
  storage_number: string | null;
  storage_floor: number | null;
}

interface RawRow {
  apartmentNumber: string | null;
  storageNumber: string | null;
  floor: number | null;
  typeCode: string | null;
  assetId: number | null;
  description: string | null;
  area: number | null;
}

const APARTMENT_TYPE_CODES = new Set(['211', '212', '213', '214', '215']);
const STORAGE_TYPE_CODE = '250';
const SHARED_TYPE_CODE = '251';
const POOL_DESCRIPTION = 'בריכה';
const POOL_TYPE_CODE = '800';
const MULTI_TYPE_CODE = '199';

function toStr(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  return String(v).trim() || null;
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

export interface TransformResult {
  assets: TransformedAsset[];
  /** Sum of all shared area (type 251) across all assets */
  totalSharedArea: number;
  warnings: string[];
}

export function transformOriginalImportFile(
  file: File,
  buildingNumber: number,
  taxRegion: number,
): Promise<TransformResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const wb = XLSX.read(data, { type: 'array' });

        // Try sheet "מגורים" first, fall back to first sheet
        const sheetName = wb.SheetNames.includes('מגורים') ? 'מגורים' : wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

        // Row 0 is title, row 1 is headers, data starts at row 2
        const dataRows = raw.slice(2);

        // Parse raw rows and forward-fill asset_id
        let lastAssetId: number | null = null;
        let lastApartmentNumber: string | null = null;
        let lastStorageNumber: string | null = null;

        const rows: RawRow[] = dataRows.map((r) => {
          const assetIdRaw = toNum(r[5]);
          if (assetIdRaw !== null) {
            lastAssetId = assetIdRaw;
            lastApartmentNumber = toStr(r[0]);
            lastStorageNumber = toStr(r[1]);
          }
          return {
            apartmentNumber: lastApartmentNumber,
            storageNumber: lastStorageNumber,
            floor: toNum(r[2]),
            typeCode: toStr(r[3]),
            assetId: lastAssetId,
            description: toStr(r[6]),
            area: toNum(r[7]),
          };
        }).filter(r => r.assetId !== null);

        // Group rows by asset_id (preserving order)
        const groups = new Map<number, RawRow[]>();
        for (const row of rows) {
          const id = row.assetId!;
          if (!groups.has(id)) groups.set(id, []);
          groups.get(id)!.push(row);
        }

        const assets: TransformedAsset[] = [];
        const warnings: string[] = [];
        let totalSharedArea = 0;

        for (const [assetId, group] of groups) {
          const first = group[0];

          // Determine apartment/storage floor
          let apartmentFloor: number | null = null;
          let storageFloor: number | null = null;
          for (const r of group) {
            const code = r.typeCode ?? '';
            if (APARTMENT_TYPE_CODES.has(code) && r.floor !== null) apartmentFloor = r.floor;
            if (code === STORAGE_TYPE_CODE && r.floor !== null) storageFloor = r.floor;
          }

          if (group.length === 1) {
            // Single-row asset
            const typeCode = first.description === POOL_DESCRIPTION ? POOL_TYPE_CODE : (first.typeCode ?? '');
            const size = first.area ?? 0;
            if (typeCode === SHARED_TYPE_CODE) totalSharedArea += size;
            assets.push({
              building_number: buildingNumber,
              asset_id: assetId,
              tax_region: taxRegion,
              main_asset_type: typeCode,
              asset_size: Math.round(size * 100) / 100,
              sub_asset_type_1: '', sub_asset_size_1: 0,
              sub_asset_type_2: '', sub_asset_size_2: 0,
              sub_asset_type_3: '', sub_asset_size_3: 0,
              sub_asset_type_4: '', sub_asset_size_4: 0,
              sub_asset_type_5: '', sub_asset_size_5: 0,
              sub_asset_type_6: '', sub_asset_size_6: 0,
              apartment_number: first.apartmentNumber,
              apartment_floor: apartmentFloor,
              storage_number: first.storageNumber,
              storage_floor: storageFloor,
            });
          } else {
            // Multi-row asset → main type 199, subtypes from each row
            // Build sub-type pairs (skip rows with no type code)
            const subPairs: { type: string; size: number }[] = [];
            let totalSize = 0;

            for (const r of group) {
              let typeCode = r.description === POOL_DESCRIPTION ? POOL_TYPE_CODE : (r.typeCode ?? '');
              if (!typeCode) continue; // skip rows with no type
              const size = r.area ?? 0;
              totalSize += size;
              if (typeCode === SHARED_TYPE_CODE) totalSharedArea += size;
              subPairs.push({ type: typeCode, size: Math.round(size * 100) / 100 });
            }

            if (subPairs.length > 6) {
              warnings.push(`נכס ${assetId}: יש ${subPairs.length} תתי-נכסים, רק 6 הראשונים יישמרו`);
            }

            const sub = subPairs.slice(0, 6);
            assets.push({
              building_number: buildingNumber,
              asset_id: assetId,
              tax_region: taxRegion,
              main_asset_type: MULTI_TYPE_CODE,
              asset_size: Math.round(totalSize * 100) / 100,
              sub_asset_type_1: sub[0]?.type ?? '', sub_asset_size_1: sub[0]?.size ?? 0,
              sub_asset_type_2: sub[1]?.type ?? '', sub_asset_size_2: sub[1]?.size ?? 0,
              sub_asset_type_3: sub[2]?.type ?? '', sub_asset_size_3: sub[2]?.size ?? 0,
              sub_asset_type_4: sub[3]?.type ?? '', sub_asset_size_4: sub[3]?.size ?? 0,
              sub_asset_type_5: sub[4]?.type ?? '', sub_asset_size_5: sub[4]?.size ?? 0,
              sub_asset_type_6: sub[5]?.type ?? '', sub_asset_size_6: sub[5]?.size ?? 0,
              apartment_number: first.apartmentNumber,
              apartment_floor: apartmentFloor,
              storage_number: first.storageNumber,
              storage_floor: storageFloor,
            });
          }
        }

        resolve({ assets, totalSharedArea: Math.round(totalSharedArea * 100) / 100, warnings });
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}
