-- =====================================================================
-- 0096 — KURIKULUM: LAMPIRAN DOKUMEN SUMBER (unggah file per bagian)
--
-- Memungkinkan Tim Penyusun MENGUNGGAH dokumen yang sudah dibuat
-- (mis. .docx) ke sebuah bagian Kurikulum Islam Plus / KOSP, seperti
-- unggahan dokumen ijazah pada Kepegawaian. Isi dokumen .docx juga dapat
-- diekstrak di sisi aplikasi menjadi isi bagian (lihat src/lib/docxImport.js).
--
-- Bucket privat 'kurikulum-files' + tabel referensi kurikulum_lampiran.
-- Non-destruktif & idempoten.
-- =====================================================================

-- Bucket penyimpanan privat.
insert into storage.buckets (id, name, public)
values ('kurikulum-files', 'kurikulum-files', false)
on conflict (id) do nothing;

drop policy if exists "kurikulum_files_read" on storage.objects;
create policy "kurikulum_files_read" on storage.objects
  for select using (bucket_id = 'kurikulum-files' and auth.uid() is not null);
drop policy if exists "kurikulum_files_insert" on storage.objects;
create policy "kurikulum_files_insert" on storage.objects
  for insert with check (bucket_id = 'kurikulum-files' and auth.uid() is not null);
drop policy if exists "kurikulum_files_update" on storage.objects;
create policy "kurikulum_files_update" on storage.objects
  for update using (bucket_id = 'kurikulum-files' and auth.uid() is not null);
drop policy if exists "kurikulum_files_delete" on storage.objects;
create policy "kurikulum_files_delete" on storage.objects
  for delete using (bucket_id = 'kurikulum-files' and auth.uid() is not null);

-- Tabel referensi lampiran per (dokumen, unit, bagian).
create table if not exists public.kurikulum_lampiran (
  id uuid primary key default gen_random_uuid(),
  dokumen text not null check (dokumen in ('islam_plus', 'kosp')),
  school_id uuid not null references public.schools(id) on delete cascade,
  bagian_kode text not null,
  nama_file text not null,
  file_url text not null,            -- path objek di bucket kurikulum-files
  diunggah_oleh uuid references public.employees(id) on delete set null,
  diunggah_nama text,
  created_at timestamptz not null default now()
);

create index if not exists kurikulum_lampiran_idx
  on public.kurikulum_lampiran (dokumen, school_id, bagian_kode);

alter table public.kurikulum_lampiran enable row level security;

drop policy if exists kurikulum_lampiran_select on public.kurikulum_lampiran;
create policy kurikulum_lampiran_select on public.kurikulum_lampiran for select
  using (public.is_yayasan_admin() or public.is_school_manager(school_id));

drop policy if exists kurikulum_lampiran_insert on public.kurikulum_lampiran;
create policy kurikulum_lampiran_insert on public.kurikulum_lampiran for insert
  with check (public.is_yayasan_admin() or public.is_school_manager(school_id));

drop policy if exists kurikulum_lampiran_delete on public.kurikulum_lampiran;
create policy kurikulum_lampiran_delete on public.kurikulum_lampiran for delete
  using (public.is_yayasan_admin() or public.is_school_manager(school_id));

notify pgrst, 'reload schema';
