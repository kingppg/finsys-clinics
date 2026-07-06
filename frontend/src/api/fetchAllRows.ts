// ============================================================================
// fetchAllRows — page through a Supabase/PostgREST query past the 1000-row cap.
// ----------------------------------------------------------------------------
// PostgREST silently caps a single response at 1000 rows. Components that load a
// whole table client-side (`.select('*').eq('clinic_id', …)`) therefore lose the
// oldest rows once a clinic crosses 1000 — with no error. This helper repeats
// the query with `.range()` until a short page proves the end is reached, so
// callers get EVERY row.
//
// Pass a factory that builds a FRESH query each call (a Supabase query can only
// be awaited once). The query MUST include a stable `.order(...)` so paging is
// deterministic — otherwise rows can shift between pages and be missed/dupliated.
//
//   const rows = await fetchAllRows((from, to) =>
//     supabase.from('appointments')
//       .select('*')
//       .eq('clinic_id', clinicId)
//       .eq('deleted', false)
//       .order('id', { ascending: true })   // <-- required for stable paging
//       .range(from, to)
//   );
// ============================================================================

const PAGE_SIZE = 1000;

export async function fetchAllRows<T = any>(
  makeQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;

  // Hard stop guards against an accidental infinite loop (e.g. a query missing
  // its .order()). 1,000,000 rows is far beyond any realistic single-clinic table.
  const MAX_PAGES = 1000;
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await makeQuery(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = data || [];
    all.push(...batch);
    if (batch.length < PAGE_SIZE) break; // last (short) page reached
    from += PAGE_SIZE;
  }

  return all;
}
