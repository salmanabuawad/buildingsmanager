/**
 * Data layer stub – backend is FastAPI only. This module exists so code that
 * still imports "supabase" does not break; all calls return empty/error.
 * Auth and API calls use apiClient (FastAPI).
 */
const empty = { data: null, error: { message: 'Use FastAPI backend (apiClient).' } };
const emptyPromise = Promise.resolve(empty);

function noopRpc(): Promise<{ data: null; error: { message: string } }> {
  return emptyPromise;
}

function createChain(): any {
  const c: any = () => c;
  c.eq = c;
  c.neq = c;
  c.not = c;
  c.in = c;
  c.is = c;
  c.like = c;
  c.ilike = c;
  c.select = c;
  c.order = c;
  c.limit = c;
  c.range = c;
  c.single = c;
  c.maybeSingle = c;
  c.count = c;
  c.then = (fn: (x: typeof empty) => void) => {
    fn(empty);
    return emptyPromise;
  };
  return c;
}

const chain = createChain();

const fromStub = () => ({
  select: (..._args: any[]) => chain,
  insert: () => ({ select: () => chain, then: () => emptyPromise }),
  update: () => ({ eq: () => chain, then: () => emptyPromise }),
  upsert: () => ({ then: () => emptyPromise }),
  delete: () => ({ eq: () => chain, then: () => emptyPromise }),
});

const storageStub = {
  from: () => ({
    upload: () => emptyPromise,
    getPublicUrl: () => ({ data: { publicUrl: '' } }),
    createSignedUrl: () => emptyPromise,
    download: () => emptyPromise,
    remove: () => emptyPromise,
  }),
};

export const supabase = {
  from: fromStub,
  rpc: noopRpc,
  storage: storageStub,
};

export interface Building {
  id: string;
  name: string;
  storage_area: number;
  pergola_area: number;
  balcony_area: number;
  total_building_area: number;
  created_at: string;
}
