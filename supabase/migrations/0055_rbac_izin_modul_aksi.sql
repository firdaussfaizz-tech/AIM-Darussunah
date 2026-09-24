-- =====================================================================
-- FASE 2 — IZIN PER-MODUL × PER-AKSI (RBAC granular). FONDASI.
--
-- Keputusan pengguna (2026-09-24): akses tiap peran ditentukan per MODUL
-- dan per AKSI (lihat/tambah/ubah/hapus), ditegakkan sampai level DB.
--
-- File ini membangun FONDASI yang dipakai semua modul:
--   - Tabel `modules`         : daftar modul aplikasi (untuk matriks izin).
--   - Tabel `role_permissions`: (peran, modul, aksi) — ADA baris = diizinkan.
--   - Fungsi `has_perm(modul, aksi)` : dipakai kebijakan RLS tiap tabel.
--   - Fungsi `my_permissions()`      : dipakai aplikasi (AuthContext.can()).
--   - Seed izin default dari tingkat_akses peran (0054).
--
-- JEMBATAN kompatibilitas (agar tak ada akses yang putus):
--   - Super admin (is_admin_yayasan / enum admin_yayasan) → semua izin.
--   - Peran ENUM lama dipetakan ke tingkat_akses lalu memakai default.
--   - Pemegang jabatan Waka (positions.beri_akses_manajer) → default
--     setara 'manajer_unit'.
--
-- Penegakan RLS per tabel dilakukan BERTAHAP per modul (migrasi terpisah);
-- 0056 memulai dengan modul Data Siswa sebagai pola.
--
-- Non-destruktif & idempoten. JALANKAN SETELAH 0054.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Daftar modul aplikasi.
-- ---------------------------------------------------------------------
create table if not exists public.modules (
  kode text primary key,
  nama text not null,
  area text not null,
  urutan int not null default 0
);

insert into public.modules (kode, nama, area, urutan) values
  ('pegawai', 'Data Pegawai', 'Kepegawaian', 10),
  ('presensi', 'Presensi Pegawai', 'Kepegawaian', 20),
  ('cuti', 'Cuti & Izin', 'Kepegawaian', 30),
  ('penggajian', 'Penggajian', 'Kepegawaian', 40),
  ('kinerja', 'Penilaian Kinerja', 'Kepegawaian', 50),
  ('okr_kpi', 'OKR & KPI Lembaga', 'Kepegawaian', 60),
  ('beban_kerja', 'Beban Kerja', 'Kepegawaian', 70),
  ('pelatihan', 'Pelatihan', 'Kepegawaian', 80),
  ('kalender_libur', 'Kalender Libur', 'Kepegawaian', 90),
  ('struktur', 'Struktur Organisasi', 'Kepegawaian', 100),
  ('siswa', 'Data Siswa', 'Kesiswaan', 110),
  ('kelas_ta', 'Kelas & Tahun Ajaran', 'Kesiswaan', 120),
  ('presensi_siswa', 'Presensi Siswa', 'Kesiswaan', 130),
  ('spp', 'SPP', 'Kesiswaan', 140),
  ('nilai_rapor', 'Nilai & Rapor', 'Kesiswaan', 150),
  ('akademik', 'Akademik / Pembelajaran', 'Akademik', 160),
  ('sarpras', 'Sarana & Prasarana', 'Sarpras', 170),
  ('keuangan', 'Manajemen Keuangan', 'Keuangan', 180),
  ('pengguna', 'Pengguna & Peran', 'Sistem', 190),
  ('log', 'Log Aktivitas', 'Sistem', 200),
  ('notifikasi', 'Notifikasi Email', 'Sistem', 210)
on conflict (kode) do update set nama = excluded.nama, area = excluded.area, urutan = excluded.urutan;

alter table public.modules enable row level security;
drop policy if exists modules_select on public.modules;
create policy modules_select on public.modules for select using (auth.uid() is not null);
drop policy if exists modules_write on public.modules;
create policy modules_write on public.modules for all
  using (public.is_yayasan_admin()) with check (public.is_yayasan_admin());

-- ---------------------------------------------------------------------
-- 2. Tabel izin peran (ADA baris = diizinkan).
-- ---------------------------------------------------------------------
create table if not exists public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  modul text not null references public.modules(kode) on delete cascade,
  aksi text not null check (aksi in ('lihat', 'tambah', 'ubah', 'hapus')),
  primary key (role_id, modul, aksi)
);

alter table public.role_permissions enable row level security;
drop policy if exists role_permissions_select on public.role_permissions;
create policy role_permissions_select on public.role_permissions for select
  using (public.is_yayasan_admin());
drop policy if exists role_permissions_write on public.role_permissions;
create policy role_permissions_write on public.role_permissions for all
  using (public.is_yayasan_admin()) with check (public.is_yayasan_admin());

-- ---------------------------------------------------------------------
-- 3. Helper: enum lama → tingkat_akses, & matriks izin default per tingkat.
-- ---------------------------------------------------------------------
create or replace function public.enum_to_tingkat(p_role app_role_enum)
returns text language sql immutable set search_path = public as $$
  select case p_role
    when 'admin_yayasan' then 'yayasan_penuh'
    when 'hr' then 'yayasan_penuh'
    when 'admin_sekolah' then 'manajer_unit'
    when 'kepala_sekolah' then 'manajer_unit'
    when 'bendahara' then 'bendahara'
    else 'pegawai'
  end;
$$;

-- Default izin per tingkat akses. Dipakai untuk seed peran dinamis &
-- sebagai jembatan enum/waka pada has_perm/my_permissions.
create or replace function public.roles_tingkat_default(p_tingkat text, p_modul text, p_aksi text)
returns boolean language sql immutable set search_path = public as $$
  select case
    when p_tingkat = 'yayasan_penuh' then true
    when p_tingkat = 'manajer_unit' then p_modul not in ('pengguna', 'log', 'notifikasi', 'struktur')
    when p_tingkat = 'bendahara' then p_modul in ('spp', 'keuangan')
    else false
  end;
$$;

-- ---------------------------------------------------------------------
-- 4. Seed izin peran dinamis dari tingkat_akses-nya.
--    Super-role (is_admin_yayasan) tidak perlu di-seed — has_perm/
--    my_permissions memberi semua secara implisit.
-- ---------------------------------------------------------------------
insert into public.role_permissions (role_id, modul, aksi)
select r.id, m.kode, a.aksi
from public.roles r
cross join public.modules m
cross join (values ('lihat'), ('tambah'), ('ubah'), ('hapus')) a(aksi)
where not r.is_admin_yayasan
  and public.roles_tingkat_default(r.tingkat_akses, m.kode, a.aksi)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 5. has_perm(modul, aksi) — dipakai kebijakan RLS. security definer.
-- ---------------------------------------------------------------------
create or replace function public.has_perm(p_modul text, p_aksi text)
returns boolean language sql security definer stable set search_path = public as $$
  select
    -- Super admin
    exists (
      select 1 from public.user_roles ur left join public.roles r on r.id = ur.role_id
      where ur.user_id = auth.uid() and (ur.role = 'admin_yayasan' or r.is_admin_yayasan)
    )
    -- Izin eksplisit peran dinamis
    or exists (
      select 1 from public.user_roles ur
      join public.role_permissions rp on rp.role_id = ur.role_id
      where ur.user_id = auth.uid() and rp.modul = p_modul and rp.aksi = p_aksi
    )
    -- Jembatan enum lama
    or exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role is not null
        and public.roles_tingkat_default(public.enum_to_tingkat(ur.role), p_modul, p_aksi)
    )
    -- Jembatan jabatan Waka (beri_akses_manajer) → setara manajer_unit
    or (
      public.roles_tingkat_default('manajer_unit', p_modul, p_aksi)
      and exists (
        select 1 from public.employees e
        join public.positions p on p.id = e.position_id
        where e.user_id = auth.uid() and p.beri_akses_manajer
      )
    );
$$;

-- ---------------------------------------------------------------------
-- 6. my_permissions() — himpunan (modul, aksi) efektif pengguna login.
--    Dipakai aplikasi (AuthContext.can()).
-- ---------------------------------------------------------------------
create or replace function public.my_permissions()
returns table (modul text, aksi text) language sql security definer stable set search_path = public as $$
  with su as (
    select exists (
      select 1 from public.user_roles ur left join public.roles r on r.id = ur.role_id
      where ur.user_id = auth.uid() and (ur.role = 'admin_yayasan' or r.is_admin_yayasan)
    ) as is_su,
    exists (
      select 1 from public.employees e
      join public.positions p on p.id = e.position_id
      where e.user_id = auth.uid() and p.beri_akses_manajer
    ) as is_waka
  )
  -- Super admin: semua modul × aksi.
  select m.kode, a.aksi
  from public.modules m
  cross join (values ('lihat'), ('tambah'), ('ubah'), ('hapus')) a(aksi)
  cross join su where su.is_su
  union
  -- Peran dinamis.
  select rp.modul, rp.aksi
  from public.user_roles ur
  join public.role_permissions rp on rp.role_id = ur.role_id
  where ur.user_id = auth.uid()
  union
  -- Jembatan enum lama.
  select m.kode, a.aksi
  from public.user_roles ur
  cross join public.modules m
  cross join (values ('lihat'), ('tambah'), ('ubah'), ('hapus')) a(aksi)
  where ur.user_id = auth.uid() and ur.role is not null
    and public.roles_tingkat_default(public.enum_to_tingkat(ur.role), m.kode, a.aksi)
  union
  -- Jembatan Waka.
  select m.kode, a.aksi
  from public.modules m
  cross join (values ('lihat'), ('tambah'), ('ubah'), ('hapus')) a(aksi)
  cross join su where su.is_waka and public.roles_tingkat_default('manajer_unit', m.kode, a.aksi);
$$;
