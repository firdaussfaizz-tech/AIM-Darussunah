-- =====================================================================
-- MODUL KESISWAAN (Student Information Management) — TAHAP 1
-- Fondasi: Tahun Ajaran, Data Induk Siswa, Rombongan Belajar (Rombel),
-- dan Riwayat Siswa (enrollment per tahun ajaran).
--
-- Field data siswa mengikuti struktur field inti Dapodik (NISN, NIK, data
-- ayah/ibu/wali sebagai kolom terpisah) supaya nanti bisa diekspor/dicocokkan
-- tanpa perombakan skema besar-besaran.
--
-- PENTING: jalankan migrasi 0021_add_bendahara_role.sql SENDIRIAN dan
-- SELESAI dulu sebelum menjalankan file ini (lihat catatan di file itu).
--
-- Non-destruktif: hanya menambah tabel, tipe, fungsi, kebijakan RLS, dan
-- bucket storage baru — tidak mengubah tabel modul SDM yang sudah ada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TAHUN AJARAN
-- ---------------------------------------------------------------------
create table public.tahun_ajaran (
  id uuid primary key default gen_random_uuid(),
  nama text not null unique, -- contoh: '2026/2027'
  tanggal_mulai date,
  tanggal_selesai date,
  status text not null default 'tidak_aktif' check (status in ('aktif', 'tidak_aktif')),
  created_at timestamptz not null default now()
);

-- Hanya boleh ada SATU tahun ajaran berstatus 'aktif' pada satu waktu —
-- unique partial index (bukan constraint biasa, karena hanya berlaku
-- untuk baris dengan status = 'aktif').
create unique index tahun_ajaran_satu_aktif_idx on public.tahun_ajaran (status) where status = 'aktif';

-- ---------------------------------------------------------------------
-- 2. DATA INDUK SISWA
-- ---------------------------------------------------------------------
create type siswa_status_enum as enum ('aktif', 'lulus', 'pindah', 'keluar');

create table public.siswa (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete set null,
  nis text,
  nisn text,
  nik text,
  nama_lengkap text not null,
  nama_panggilan text,
  jenis_kelamin jenis_kelamin_enum,
  tempat_lahir text,
  tanggal_lahir date,
  agama text,
  alamat text,
  anak_ke int,
  jumlah_saudara int,
  foto_url text,
  status siswa_status_enum not null default 'aktif',

  -- Data Ayah (mengikuti struktur field Dapodik)
  nama_ayah text,
  nik_ayah text,
  tahun_lahir_ayah int,
  pendidikan_ayah text,
  pekerjaan_ayah text,
  no_hp_ayah text,

  -- Data Ibu
  nama_ibu text,
  nik_ibu text,
  tahun_lahir_ibu int,
  pendidikan_ibu text,
  pekerjaan_ibu text,
  no_hp_ibu text,

  -- Data Wali (opsional, diisi hanya jika bukan diasuh orang tua kandung)
  nama_wali text,
  hubungan_wali text,
  no_hp_wali text,

  -- Dipakai untuk notifikasi otomatis ke orang tua (presensi, SPP, rapor)
  email_ortu text,

  catatan text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index siswa_nisn_unik_idx on public.siswa (nisn) where nisn is not null and nisn <> '';
create unique index siswa_nis_per_sekolah_idx on public.siswa (school_id, nis) where nis is not null and nis <> '';

create table public.siswa_dokumen (
  id uuid primary key default gen_random_uuid(),
  siswa_id uuid not null references public.siswa(id) on delete cascade,
  jenis_dokumen text not null, -- 'akta_lahir' | 'kartu_keluarga' | 'ijazah_sebelumnya' | 'foto' | 'lainnya'
  nama_file text,
  file_url text not null,
  uploaded_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. ROMBONGAN BELAJAR (ROMBEL/KELAS)
-- ---------------------------------------------------------------------
create table public.rombel (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  tahun_ajaran_id uuid not null references public.tahun_ajaran(id) on delete cascade,
  tingkat text not null, -- contoh: '1', '7', '10' (bebas teks supaya fleksibel lintas jenjang)
  nama_rombel text not null, -- contoh: '1A', 'VII-B', 'X IPA 1'
  wali_kelas_employee_id uuid references public.employees(id) on delete set null,
  kapasitas int,
  created_at timestamptz not null default now(),
  unique (school_id, tahun_ajaran_id, nama_rombel)
);

-- ---------------------------------------------------------------------
-- 4. RIWAYAT SISWA — satu baris per siswa per tahun ajaran (rombel &
--    status di tahun ajaran tsb). Dasar untuk kenaikan kelas, kelulusan,
--    dan mutasi (Tahap 2).
-- ---------------------------------------------------------------------
create table public.riwayat_siswa (
  id uuid primary key default gen_random_uuid(),
  siswa_id uuid not null references public.siswa(id) on delete cascade,
  rombel_id uuid not null references public.rombel(id) on delete cascade,
  tahun_ajaran_id uuid not null references public.tahun_ajaran(id) on delete cascade,
  status text not null default 'aktif' check (status in ('aktif', 'naik_kelas', 'tinggal_kelas', 'lulus', 'pindah', 'keluar')),
  tanggal_masuk date,
  tanggal_keluar date,
  keterangan text,
  created_at timestamptz not null default now(),
  unique (siswa_id, tahun_ajaran_id)
);

-- ---------------------------------------------------------------------
-- 5. FUNGSI BANTUAN RLS (security definer, mengikuti pola yang sudah
--    dipakai di modul SDM — is_yayasan_admin, has_school_access, dst.)
-- ---------------------------------------------------------------------
create function public.siswa_school_id(target_siswa_id uuid)
returns uuid language sql security definer stable set search_path = public as $$
  select school_id from public.siswa where id = target_siswa_id;
$$;

create function public.rombel_school_id(target_rombel_id uuid)
returns uuid language sql security definer stable set search_path = public as $$
  select school_id from public.rombel where id = target_rombel_id;
$$;

-- true jika pegawai yang login adalah Wali Kelas dari rombel tsb.
create function public.is_wali_kelas_of(target_rombel_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.rombel
    where id = target_rombel_id and wali_kelas_employee_id = public.current_employee_id()
  );
$$;

-- true jika pegawai yang login adalah Wali Kelas dari rombel siswa tsb
-- pada tahun ajaran manapun yang tercatat di riwayat_siswa.
create function public.is_wali_kelas_of_siswa(target_siswa_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.riwayat_siswa rs
    join public.rombel r on r.id = rs.rombel_id
    where rs.siswa_id = target_siswa_id and r.wali_kelas_employee_id = public.current_employee_id()
  );
$$;

create function public.is_bendahara()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.user_roles where user_id = auth.uid() and role = 'bendahara'
  );
$$;

-- ---------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
alter table public.tahun_ajaran enable row level security;
alter table public.siswa enable row level security;
alter table public.siswa_dokumen enable row level security;
alter table public.rombel enable row level security;
alter table public.riwayat_siswa enable row level security;

-- Tahun Ajaran: data referensi ringan, siapa pun yang login boleh baca
-- (dibutuhkan di banyak halaman untuk tahu tahun ajaran aktif); hanya
-- Admin Yayasan/HR yang boleh membuat/mengubah/mengaktifkan.
create policy tahun_ajaran_select on public.tahun_ajaran for select using (auth.uid() is not null);
create policy tahun_ajaran_write on public.tahun_ajaran for all
  using (public.is_yayasan_admin()) with check (public.is_yayasan_admin());

-- Siswa: baca untuk Admin Yayasan/HR (semua sekolah), Admin Sekolah/Kepala
-- Sekolah (sekolahnya sendiri — lewat has_school_access, pola sama dengan
-- tabel employees), atau Wali Kelas dari rombel siswa tsb. Tulis/ubah biodata
-- HANYA Admin Yayasan/HR/Admin Sekolah/Kepala Sekolah (bukan Wali Kelas —
-- guru mengelola presensi/nilai di tahap berikutnya, bukan biodata inti).
create policy siswa_select on public.siswa for select using (
  public.is_yayasan_admin() or public.has_school_access(school_id) or public.is_wali_kelas_of_siswa(id)
);
create policy siswa_write on public.siswa for all
  using (public.is_yayasan_admin() or public.has_school_access(school_id))
  with check (public.is_yayasan_admin() or public.has_school_access(school_id));

create policy siswa_dokumen_select on public.siswa_dokumen for select using (
  public.is_yayasan_admin() or public.has_school_access(public.siswa_school_id(siswa_id)) or public.is_wali_kelas_of_siswa(siswa_id)
);
create policy siswa_dokumen_write on public.siswa_dokumen for all
  using (public.is_yayasan_admin() or public.has_school_access(public.siswa_school_id(siswa_id)))
  with check (public.is_yayasan_admin() or public.has_school_access(public.siswa_school_id(siswa_id)));

-- Rombel: baca oleh Admin Yayasan/HR, Admin Sekolah/Kepala Sekolah
-- (sekolahnya), atau Wali Kelas rombel itu sendiri. Tulis hanya manajemen
-- sekolah/yayasan (penentuan Wali Kelas & pembuatan kelas bukan kewenangan
-- guru).
create policy rombel_select on public.rombel for select using (
  public.is_yayasan_admin() or public.has_school_access(school_id) or wali_kelas_employee_id = public.current_employee_id()
);
create policy rombel_write on public.rombel for all
  using (public.is_yayasan_admin() or public.has_school_access(school_id))
  with check (public.is_yayasan_admin() or public.has_school_access(school_id));

-- Riwayat Siswa (enrollment): baca sama seperti Rombel (termasuk Wali
-- Kelas rombel terkait); tulis hanya manajemen sekolah/yayasan (penempatan
-- siswa ke rombel bukan kewenangan guru di Tahap 1 ini).
create policy riwayat_siswa_select on public.riwayat_siswa for select using (
  public.is_yayasan_admin() or public.has_school_access(public.rombel_school_id(rombel_id)) or public.is_wali_kelas_of(rombel_id)
);
create policy riwayat_siswa_write on public.riwayat_siswa for all
  using (public.is_yayasan_admin() or public.has_school_access(public.rombel_school_id(rombel_id)))
  with check (public.is_yayasan_admin() or public.has_school_access(public.rombel_school_id(rombel_id)));

-- ---------------------------------------------------------------------
-- 7. INDEKS — kolom FK/RLS-kritis (lihat catatan di 0017_perf_indexes.sql
--    soal Postgres tidak otomatis mengindeks foreign key).
-- ---------------------------------------------------------------------
create index siswa_school_id_idx on public.siswa (school_id);
create index siswa_nama_lengkap_idx on public.siswa (nama_lengkap);
create index siswa_dokumen_siswa_id_idx on public.siswa_dokumen (siswa_id);
create index rombel_school_id_idx on public.rombel (school_id);
create index rombel_tahun_ajaran_id_idx on public.rombel (tahun_ajaran_id);
create index rombel_wali_kelas_employee_id_idx on public.rombel (wali_kelas_employee_id);
create index riwayat_siswa_siswa_id_idx on public.riwayat_siswa (siswa_id);
create index riwayat_siswa_rombel_id_idx on public.riwayat_siswa (rombel_id);
create index riwayat_siswa_tahun_ajaran_id_idx on public.riwayat_siswa (tahun_ajaran_id);

-- ---------------------------------------------------------------------
-- 8. STORAGE — bucket privat untuk foto & dokumen siswa (pola sama
--    dengan 'employee-files' di 0003_storage.sql).
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('siswa-files', 'siswa-files', false)
on conflict (id) do nothing;

create policy "siswa_files_read" on storage.objects
  for select using (bucket_id = 'siswa-files' and auth.uid() is not null);
create policy "siswa_files_insert" on storage.objects
  for insert with check (bucket_id = 'siswa-files' and auth.uid() is not null);
create policy "siswa_files_update" on storage.objects
  for update using (bucket_id = 'siswa-files' and auth.uid() is not null);
create policy "siswa_files_delete" on storage.objects
  for delete using (bucket_id = 'siswa-files' and auth.uid() is not null);
