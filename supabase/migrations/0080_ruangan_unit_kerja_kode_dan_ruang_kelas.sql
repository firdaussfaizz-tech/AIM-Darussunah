-- =====================================================================
-- 0080 — Kodefikasi Unit Kerja + Integrasi Ruang Kelas (Sarpras ⇄ Kesiswaan)
--
-- A. Master Kode Unit Kerja (public.unit_kerja_kode): daftar baku unit kerja
--    + kode 2 digit yang menjadi segmen "unit" pada Kode Lokasi aset
--    (kepemilikan.lembaga.UNIT.ruang.tahun — lihat 0037). Dikelola Yayasan.
--    Sebelumnya kode_unit_kerja diketik manual tanpa acuan; kini ditarik dari
--    master ini (dropdown di form Ruangan).
--
-- B. Ruangan: kolom `jenis` (umum | kelas) + `rombel_id` (FK ke rombel) agar
--    ruang kelas dapat ditautkan & dibuat otomatis dari data kelas (rombel)
--    di Kesiswaan.
--
-- Idempoten & drift-safe (to_regclass + if not exists). kode_unit_kerja pada
-- ruangan DIPERTAHANKAN sebagai teks (nilai kode dari master) agar trigger
-- aset_generate_kode (0037) tetap bekerja tanpa perubahan.
-- =====================================================================

-- ---------------------------------------------------------------------
-- A. Master Kode Unit Kerja
-- ---------------------------------------------------------------------
create table if not exists public.unit_kerja_kode (
  kode text primary key,          -- 2 digit, mis. '03'
  nama text not null,
  urutan int,
  aktif boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.unit_kerja_kode enable row level security;
drop policy if exists unit_kerja_kode_select on public.unit_kerja_kode;
create policy unit_kerja_kode_select on public.unit_kerja_kode
  for select using (auth.uid() is not null);
drop policy if exists unit_kerja_kode_write on public.unit_kerja_kode;
create policy unit_kerja_kode_write on public.unit_kerja_kode
  for all using (public.is_yayasan_admin()) with check (public.is_yayasan_admin());

-- Daftar baku (boleh diubah/ditambah Yayasan). Kode '03' = Ruang Kelas,
-- dipakai otomatis saat men-generate ruang kelas dari rombel.
insert into public.unit_kerja_kode (kode, nama, urutan) values
  ('01', 'Pimpinan / Kepala Sekolah', 1),
  ('02', 'Tata Usaha / Administrasi', 2),
  ('03', 'Ruang Kelas', 3),
  ('04', 'Perpustakaan', 4),
  ('05', 'Laboratorium', 5),
  ('06', 'Ruang Guru', 6),
  ('07', 'Bimbingan Konseling (BK)', 7),
  ('08', 'UKS', 8),
  ('09', 'Ibadah / Masjid / Musala', 9),
  ('10', 'Sarana Olahraga', 10),
  ('11', 'Aula / Serbaguna', 11),
  ('12', 'Gudang / Penyimpanan', 12),
  ('13', 'Kantin / Koperasi', 13),
  ('14', 'Toilet / Sanitasi', 14),
  ('15', 'Pos Keamanan', 15),
  ('99', 'Lainnya', 99)
on conflict (kode) do nothing;

-- ---------------------------------------------------------------------
-- B. Ruangan: jenis + tautan rombel (ruang kelas)
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.ruangan') is null then
    raise notice '0080: public.ruangan tidak ditemukan — bagian B dilewati.';
    return;
  end if;

  alter table public.ruangan
    add column if not exists jenis text not null default 'umum';

  -- Tautan ke rombel hanya bila tabel rombel ada.
  if to_regclass('public.rombel') is not null
     and not exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'ruangan' and column_name = 'rombel_id'
     ) then
    alter table public.ruangan add column rombel_id uuid;
    alter table public.ruangan
      add constraint ruangan_rombel_id_fkey
      foreign key (rombel_id) references public.rombel (id) on delete set null;
  end if;
  create index if not exists ruangan_rombel_idx on public.ruangan (rombel_id);

  comment on column public.ruangan.jenis is 'umum | kelas — ''kelas'' menandai ruang kelas yang (dapat) ditautkan ke rombel Kesiswaan.';
  comment on column public.ruangan.rombel_id is 'Kelas (rombel) yang menempati ruang ini — integrasi dengan modul Kesiswaan.';
end $$;

notify pgrst, 'reload schema';
