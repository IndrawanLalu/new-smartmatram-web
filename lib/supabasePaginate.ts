/**
 * Ambil SEMUA baris dari sebuah query Supabase.
 *
 * PostgREST membatasi maksimal 1000 baris/response — tanpa paginasi, query yang
 * menarik data untuk agregasi/daftar/peta akan ter-truncate diam-diam (angka salah,
 * baris hilang) begitu tabel > 1000 baris.
 *
 * `buildQuery()` harus mengembalikan query FRESH tiap dipanggil, diakhiri `.order(...)`
 * pada kolom unik/stabil agar paginasi tidak lompat/duplikat antar halaman.
 *
 * Contoh:
 *   const rows = await fetchAllRows(() =>
 *     supabaseBrowser.from("inspeksi").select("penyulang,status").order("id"));
 */
export async function fetchAllRows<Row>(
  buildQuery: () => {
    range: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>;
  },
): Promise<Row[]> {
  const all: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await buildQuery().range(from, from + 999);
    if (error) throw new Error(error.message);
    all.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return all;
}
