-- =====================================================================
-- MODUL KESISWAAN — TAHAP 5 (TERAKHIR): Nilai & Rapor.
--
-- Ini melengkapi seluruh roadmap awal modul Kesiswaan: Data Induk+Rombel
-- (Tahap 1), Mutasi & Kenaikan Kelas (Tahap 2), Presensi Siswa (Tahap 3),
-- SPP (Tahap 4), dan sekarang Nilai & Rapor.
--
-- Input nilai boleh dilakukan oleh Wali Kelas dari rombel siswa tsb (sama
-- seperti Presensi di Tahap 3), selain manajemen unit/yayasan. Struktur
-- nilai sengaja disederhanakan (Pengetahuan, Keterampilan, Sikap per mata
-- pelajaran per semester) — bukan mengikuti struktur rapor K13/Kurikulum
-- Merdeka yang lebih rinci per kompetensi dasar, supaya cepat dipakai;
-- bisa dikembangkan lebih lanjut kalau dibutuhkan.
--
-- Non-destruktif: hanya menambah tabel, fungsi & trigger baru.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. MATA PELAJARAN — daftar mapel per unit sekolah.
-- ---------------------------------------------------------------------
create table public.mata_pelajaran (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  nama text not null,
  created_at timestamptz not null default now(),
  unique (school_id, nama)
);

-- ---------------------------------------------------------------------
-- 2. NILAI SISWA — satu baris per siswa per mapel per tahun ajaran per
--    semester.
-- ---------------------------------------------------------------------
create table public.nilai_siswa (
  id uuid primary key default gen_random_uuid(),
  siswa_id uuid not null references public.siswa(id) on delete cascade,
  rombel_id uuid not null references public.rombel(id) on delete cascade,
  tahun_ajaran_id uuid not null references public.tahun_ajaran(id) on delete cascade,
  mata_pelajaran_id uuid not null references public.mata_pelajaran(id) on delete cascade,
  semester text not null check (semester in ('ganjil', 'genap')),
  nilai_pengetahuan numeric(5,2),
  nilai_keterampilan numeric(5,2),
  nilai_sikap text, -- 'A' | 'B' | 'C' | 'D'
  catatan_guru text,
  dicatat_oleh uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (siswa_id, mata_pelajaran_id, tahun_ajaran_id, semester)
);

create index nilai_siswa_siswa_id_idx on public.nilai_siswa (siswa_id);
create index nilai_siswa_rombel_id_idx on public.nilai_siswa (rombel_id);

create trigger trg_nilai_siswa_updated_at
  before update on public.nilai_siswa
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 3. CATATAN RAPOR — catatan wali kelas per siswa per tahun ajaran per
--    semester (satu rekap, terpisah dari nilai per mapel).
-- ---------------------------------------------------------------------
create table public.rapor_catatan (
  id uuid primary key default gen_random_uuid(),
  siswa_id uuid not null references public.siswa(id) on delete cascade,
  rombel_id uuid not null references public.rombel(id) on delete cascade,
  tahun_ajaran_id uuid not null references public.tahun_ajaran(id) on delete cascade,
  semester text not null check (semester in ('ganjil', 'genap')),
  catatan_wali_kelas text,
  updated_at timestamptz not null default now(),
  unique (siswa_id, tahun_ajaran_id, semester)
);

create trigger trg_rapor_catatan_updated_at
  before update on public.rapor_catatan
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY — pola sama dengan Presensi Siswa (Tahap 3):
--    manajemen ATAU Wali Kelas dari rombel tsb. mata_pelajaran dibaca
--    siapa saja yang login (dipakai untuk dropdown di banyak tempat),
--    ditulis hanya manajemen unit/yayasan (bukan Wali Kelas — daftar
--    mapel adalah kurikulum unit, bukan wewenang guru per kelas).
-- ---------------------------------------------------------------------
alter table public.mata_pelajaran enable row level security;
alter table public.nilai_siswa enable row level security;
alter table public.rapor_catatan enable row level security;

create policy mata_pelajaran_select on public.mata_pelajaran for select using (auth.uid() is not null);
create policy mata_pelajaran_write on public.mata_pelajaran for all
  using (public.is_yayasan_admin() or public.has_school_access(school_id))
  with check (public.is_yayasan_admin() or public.has_school_access(school_id));

create policy nilai_siswa_select on public.nilai_siswa for select using (
  public.is_yayasan_admin() or public.has_school_access(public.rombel_school_id(rombel_id)) or public.is_wali_kelas_of(rombel_id)
);
-- PENTING: klausa is_wali_kelas_of_siswa(siswa_id) di sini (selain
-- is_wali_kelas_of(rombel_id)) SENGAJA ditambahkan untuk menangani upsert
-- setelah siswa dimutasi ke rombel lain di tengah tahun ajaran (lihat
-- RosterModal di AcademicSettings.jsx). Baris nilai_siswa/rapor_catatan
-- LAMA masih menyimpan rombel_id yang LAMA; tanpa klausa ini, RLS UPDATE
-- (dievaluasi terhadap rombel_id yang tersimpan, bukan rombel_id baru di
-- payload) akan menolak Wali Kelas BARU menyimpan nilai/rapor untuk siswa
-- yang baru saja masuk ke rombelnya.
create policy nilai_siswa_write on public.nilai_siswa for all
  using (public.is_yayasan_admin() or public.has_school_access(public.rombel_school_id(rombel_id)) or public.is_wali_kelas_of(rombel_id) or public.is_wali_kelas_of_siswa(siswa_id))
  with check (public.is_yayasan_admin() or public.has_school_access(public.rombel_school_id(rombel_id)) or public.is_wali_kelas_of(rombel_id) or public.is_wali_kelas_of_siswa(siswa_id));

create policy rapor_catatan_select on public.rapor_catatan for select using (
  public.is_yayasan_admin() or public.has_school_access(public.rombel_school_id(rombel_id)) or public.is_wali_kelas_of(rombel_id)
);
-- Alasan is_wali_kelas_of_siswa(siswa_id) sama seperti nilai_siswa_write di atas.
create policy rapor_catatan_write on public.rapor_catatan for all
  using (public.is_yayasan_admin() or public.has_school_access(public.rombel_school_id(rombel_id)) or public.is_wali_kelas_of(rombel_id))
  with check (public.is_yayasan_admin() or public.has_school_access(public.rombel_school_id(rombel_id)) or public.is_wali_kelas_of(rombel_id));
