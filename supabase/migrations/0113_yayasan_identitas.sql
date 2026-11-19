-- 0113: Identitas Yayasan (kop surat/label) — dapat diedit lewat Pengaturan.
-- Dibaca semua pengguna yang login (untuk kop dokumen), diubah hanya Yayasan.
create table if not exists public.yayasan_identitas (
  id integer primary key default 1 check (id = 1),
  nama text not null default 'YAYASAN PENDIDIKAN ISLAM DARUSSUNAH',
  singkat text not null default 'YPI Darussunah',
  alamat text not null default 'Jl. Pendidikan No. 1 — Sekretariat YPI Darussunah',
  kota text,
  logo_url text,
  updated_at timestamptz not null default now()
);

insert into public.yayasan_identitas (id) values (1) on conflict (id) do nothing;

alter table public.yayasan_identitas enable row level security;
drop policy if exists yayasan_identitas_select on public.yayasan_identitas;
create policy yayasan_identitas_select on public.yayasan_identitas for select to authenticated using (true);
drop policy if exists yayasan_identitas_write on public.yayasan_identitas;
create policy yayasan_identitas_write on public.yayasan_identitas for all
  using (public.is_yayasan_admin()) with check (public.is_yayasan_admin());

notify pgrst, 'reload schema';
