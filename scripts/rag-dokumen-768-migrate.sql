-- Pindah embedding RAG: 1536 (Gemini) → 768 (nomic-embed-text / gemini-768).
-- Jalankan di Supabase SQL Editor. Data lama (1536) tak kompatibel → dikosongkan,
-- lalu re-ingest dengan embedder baru.

drop index if exists idx_dokumen_embedding;
truncate table public.dokumen_chunks;
alter table public.dokumen_chunks alter column embedding type vector(768);
create index idx_dokumen_embedding on public.dokumen_chunks
  using hnsw (embedding vector_cosine_ops);

drop function if exists public.match_dokumen(vector, int, text);
create or replace function public.match_dokumen(
  query_embedding vector(768),
  match_count int default 6,
  filter_buku text default null
)
returns table (id bigint, buku text, halaman int, konten text, similarity float)
language sql stable
security definer
set search_path = public
as $$
  select c.id, c.buku, c.halaman, c.konten,
         1 - (c.embedding <=> query_embedding) as similarity
  from public.dokumen_chunks c
  where filter_buku is null or c.buku = filter_buku
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
grant execute on function public.match_dokumen(vector, int, text) to anon, authenticated;
