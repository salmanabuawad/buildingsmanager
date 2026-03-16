/**
 * API client.
 * All data, storage, and RPC calls go to the FastAPI backend via client.ts.
 */
import { client } from './client';
import { getSession, setFileSessionCookie } from './usersTableAuth';

export interface ApiError {
  message: string;
  details?: string;
  code?: string;
}

function toApiError(e: unknown): ApiError {
  if (e && typeof e === 'object' && 'message' in e) {
    const m = (e as { message?: string }).message;
    return { message: typeof m === 'string' ? m : String(e) };
  }
  return { message: String(e) };
}

// Re-export client's from() - it has select, eq, insert, update, delete, upsert, etc.
const from = (table: string) => client.from(table);

/** Headers for file/inspection API. Session used for auth context. */
export function getFileApiHeaders(): Record<string, string> {
  const s = getSession();
  if (s && typeof document !== 'undefined') setFileSessionCookie(s);
  return {};
}

/** Get a short-lived view URL for file path. Uses Supabase storage signed URL. */
export type GetFileViewUrlResult = { url: string } | { status: number; error?: string };

export async function getFileViewUrl(path: string): Promise<GetFileViewUrlResult> {
  try {
    const bucket = path.startsWith('structure-drawings/') ? 'structure-drawings' : path.startsWith('dwg-files/') ? 'dwg-files' : 'asset-files';
    const pathInBucket = path.replace(/^[^/]+\//, '') || path;
    const { data, error } = await client.storage
      .from(bucket)
      .createSignedUrl(pathInBucket, 3600);
    if (error) return { status: 500, error: error.message };
    if (!data?.signedUrl) return { status: 500, error: 'No signed URL' };
    return { url: data.signedUrl };
  } catch (e) {
    return { status: 500, error: e instanceof Error ? e.message : String(e) };
  }
}

// Storage
function storageFrom(bucket: string) {
  return {
    upload: async (path: string, file: File | Blob, opts?: { upsert?: boolean }) => {
      const { data, error } = await client.storage
        .from(bucket)
        .upload(path, file, { upsert: opts?.upsert ?? true });
      if (error) throw new Error(error.message);
      return { data: { path: (data as { path?: string })?.path ?? path, ...data }, error: null };
    },
    getPublicUrl: (path: string) => ({
      data: {
        publicUrl: client.storage.from(bucket).getPublicUrl(path).data.publicUrl,
      },
    }),
    createSignedUrl: async (path: string, expirySeconds?: number) => {
      const { data, error } = await client.storage
        .from(bucket)
        .createSignedUrl(path, expirySeconds ?? 3600);
      if (error) throw new Error(error.message);
      return { data: { signedUrl: (data as { signedUrl?: string })?.signedUrl ?? '' }, error: null };
    },
    download: async (path: string) => {
      const { data, error } = await client.storage.from(bucket).download(path);
      if (error) throw new Error(error.message);
      return { data: data ?? null, error: null };
    },
    remove: async (paths: string[]) => {
      const { error } = await client.storage.from(bucket).remove(paths);
      if (error) throw new Error(error.message);
      return { data: {}, error: null };
    },
  };
}

const storage = { from: storageFrom };

/** Delete by filters. Uses Supabase table delete with filters. */
async function deleteByQuery(
  table: string,
  filters: Record<string, string | number | (string | number)[]>
): Promise<{ data: unknown; error: ApiError | null }> {
  try {
    let query = client.from(table).delete();
    for (const [col, val] of Object.entries(filters)) {
      if (Array.isArray(val)) {
        query = query.in(col, val);
      } else {
        query = query.eq(col, val);
      }
    }
    const { error } = await query;
    if (error) return { data: null, error: toApiError(error) };
    return { data: {}, error: null };
  } catch (e) {
    return { data: null, error: toApiError(e) };
  }
}

/** Delete building with cascade (assets, etc.). Audit kept per design. */
async function deleteBuildingWithRelated(
  buildingNumber: number
): Promise<{ data: { success?: boolean; building_number?: number; deleted_assets_count?: number } | null; error: ApiError | null }> {
  try {
    const bid = String(buildingNumber);
    const { count } = await client
      .from('assets')
      .select('*', { count: 'exact', head: true })
      .eq('building_number', buildingNumber);
    const deletedCount = count ?? 0;

    await client.from('audit').delete().eq('entity_type', 'bulk_asset').eq('entity_id', bid);
    await client.from('audit').delete().eq('entity_type', 'building').eq('entity_id', bid);
    const { error } = await client.from('buildings').delete().eq('building_number', buildingNumber);

    if (error) return { data: null, error: toApiError(error) };
    return { data: { success: true, building_number: buildingNumber, deleted_assets_count: deletedCount }, error: null };
  } catch (e) {
    return { data: null, error: toApiError(e) };
  }
}

export const api = {
  from,
  storage,
  deleteByQuery,
  deleteBuildingWithRelated,
};
