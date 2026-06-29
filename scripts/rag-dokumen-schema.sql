-- RAG dokumen pembelajaran (buku/SPLN) → pgvector. Jalankan di Supabase SQL Editor.
-- Embedding 768 dim cosine (nomic-embed-text via Ollama, atau gemini-768).

create extension if not exists vector;

create table if not exists public.dokumen_chunks (
  id          bigserial primary key,
  buku        text not null,          -- label sumber (dari nama file PDF)
  halaman     int,                    -- nomor halaman PDF
  bagian      int,                    -- urutan potongan dalam halaman
  konten      text not null,
  embedding   vector(768),
  created_at  timestamptz default now()
);

create index if not exists idx_dokumen_buku on public.dokumen_chunks (buku);
-- Index vektor cosine (HNSW dukung dimensi <= 2000).
create index if not exists idx_dokumen_embedding on public.dokumen_chunks
  using hnsw (embedding vector_cosine_ops);

-- Pencarian top-k potongan termirip. similarity 0..1 (makin besar makin mirip).
create or replace function public.match_dokumen(
  query_embedding vector(768),
  match_count int default 6,
  filter_buku text default null
)
returns table (id bigint, buku text, halaman int, konten text, similarity float)
language sql stable
security definer            -- jalan sbg pemilik → tembus RLS (cari aman lewat fungsi ini saja)
set search_path = public
as $$
  select c.id, c.buku, c.halaman, c.konten,
         1 - (c.embedding <=> query_embedding) as similarity
  from public.dokumen_chunks c
  where filter_buku is null or c.buku = filter_buku
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- Akses baca utk role aplikasi (data referensi, bukan rahasia). Ingest pakai service role.
grant select on public.dokumen_chunks to anon, authenticated;
grant execute on function public.match_dokumen(vector, int, text) to anon, authenticated;
