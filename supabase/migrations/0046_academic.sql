-- =====================================================================
-- MODUL ACADEMIC MANAGEMENT (Manajemen Pembelajaran) — praktik SD/SMP/SMA.
--
-- Melengkapi modul Kesiswaan/Akademik yang sudah ada (tahun ajaran,
-- rombel, siswa, presensi siswa, mata pelajaran, nilai & rapor, kenaikan
-- kelas). Menambah sisi PEMBELAJARAN:
--   1. penugasan_mengajar  — guru × mapel × rombel (JTM) per semester
--   2. jadwal_pelajaran    — timetable per rombel (hari, jam ke-)
--   3. jurnal_kbm          — jurnal mengajar harian
--   4. kurikulum_kkm       — CP/KD & KKM per mapel
--   5. ekstrakurikuler(+peserta)
--   6. perangkat_ajar      — pengumpulan RPP/Modul Ajar/Prota/Prosem + MONEV
--
-- Integrasi: employees (guru), mata_pelajaran, rombel, tahun_ajaran, siswa.
-- Guru mengakses data miliknya sendiri lewat employee_id = current_employee_id().
-- Berkas perangkat ajar memakai ulang bucket storage 'employee-files'.
--
-- Idempoten & non-destruktif. JALANKAN SETELAH 0045.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PENUGASAN MENGAJAR (guru × mapel × rombel per semester)
-- ---------------------------------------------------------------------
create table if not exists public.penugasan_mengajar (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  tahun_ajaran_id uuid not null references public.tahun_ajaran(id) on delete cascade,
  semester text not null default 'Ganjil' check (semester in ('Ganjil', 'Genap')),
  employee_id uuid references public.employees(id) on delete set null,
  mata_pelajaran_id uuid not null references public.mata_pelajaran(id) on delete cascade,
  rombel_id uuid not null references public.rombel(id) on delete cascade,
  jam_per_minggu int not null default 0 check (jam_per_minggu >= 0),
  keterangan text,
  created_at timestamptz not null default now(),
  unique (tahun_ajaran_id, semester, mata_pelajaran_id, rombel_id)
);
create index if not exists penugasan_school_idx on public.penugasan_mengajar (school_id);
create index if not exists penugasan_guru_idx on public.penugasan_mengajar (employee_id);

alter table public.penugasan_mengajar enable row level security;
drop policy if exists penugasan_select on public.penugasan_mengajar;
create policy penugasan_select on public.penugasan_mengajar for select using (
  public.is_yayasan_admin() or public.has_school_access(school_id) or employee_id = public.current_employee_id()
);
drop policy if exists penugasan_write on public.penugasan_mengajar;
create policy penugasan_write on public.penugasan_mengajar for all using (
  public.is_yayasan_admin() or public.is_school_manager(school_id)
) with check (
  public.is_yayasan_admin() or public.is_school_manager(school_id)
);

-- ---------------------------------------------------------------------
-- 2. JADWAL PELAJARAN (timetable per rombel)
-- ---------------------------------------------------------------------
create table if not exists public.jadwal_pelajaran (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  tahun_ajaran_id uuid not null references public.tahun_ajaran(id) on delete cascade,
  semester text not null default 'Ganjil' check (semester in ('Ganjil', 'Genap')),
  rombel_id uuid not null references public.rombel(id) on delete cascade,
  hari int not null check (hari between 1 and 7),   -- 1=Senin .. 7=Minggu
  jam_ke int not null default 1 check (jam_ke >= 0),
  jam_mulai time,
  jam_selesai time,
  mata_pelajaran_id uuid references public.mata_pelajaran(id) on delete set null,
  employee_id uuid references public.employees(id) on delete set null,
  ruangan_id uuid references public.ruangan(id) on delete set null,
  keterangan text,
  created_at timestamptz not null default now()
);
create index if not exists jadwal_school_idx on public.jadwal_pelajaran (school_id);
create index if not exists jadwal_rombel_idx on public.jadwal_pelajaran (rombel_id);
create index if not exists jadwal_guru_idx on public.jadwal_pelajaran (employee_id);

alter table public.jadwal_pelajaran enable row level security;
drop policy if exists jadwal_select on public.jadwal_pelajaran;
create policy jadwal_select on public.jadwal_pelajaran for select using (
  public.is_yayasan_admin() or public.has_school_access(school_id) or employee_id = public.current_employee_id()
);
drop policy if exists jadwal_write on public.jadwal_pelajaran;
create policy jadwal_write on public.jadwal_pelajaran for all using (
  public.is_yayasan_admin() or public.is_school_manager(school_id)
) with check (
  public.is_yayasan_admin() or public.is_school_manager(school_id)
);

-- ---------------------------------------------------------------------
-- 3. JURNAL KBM (jurnal mengajar harian)
-- ---------------------------------------------------------------------
create table if not exists public.jurnal_kbm (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  tahun_ajaran_id uuid references public.tahun_ajaran(id) on delete set null,
  semester text check (semester is null or semester in ('Ganjil', 'Genap')),
  rombel_id uuid references public.rombel(id) on delete set null,
  mata_pelajaran_id uuid references public.mata_pelajaran(id) on delete set null,
  employee_id uuid references public.employees(id) on delete set null,
  jadwal_id uuid references public.jadwal_pelajaran(id) on delete set null,
  tanggal date not null default current_date,
  jam_ke int,
  materi text,
  kegiatan text,
  kehadiran_guru text not null default 'hadir' check (kehadiran_guru in ('hadir', 'izin', 'sakit', 'tugas', 'digantikan')),
  jml_siswa int,
  jml_hadir int,
  kendala text,
  catatan text,
  created_at timestamptz not null default now()
);
create index if not exists jurnal_school_idx on public.jurnal_kbm (school_id);
create index if not exists jurnal_guru_idx on public.jurnal_kbm (employee_id);
create index if not exists jurnal_tanggal_idx on public.jurnal_kbm (tanggal);

alter table public.jurnal_kbm enable row level security;
drop policy if exists jurnal_select on public.jurnal_kbm;
create policy jurnal_select on public.jurnal_kbm for select using (
  public.is_yayasan_admin() or public.has_school_access(school_id) or employee_id = public.current_employee_id()
);
-- Guru menulis jurnalnya sendiri; pengelola sekolah/yayasan bebas.
drop policy if exists jurnal_write on public.jurnal_kbm;
create policy jurnal_write on public.jurnal_kbm for all using (
  public.is_yayasan_admin() or public.is_school_manager(school_id) or employee_id = public.current_employee_id()
) with check (
  public.is_yayasan_admin() or public.is_school_manager(school_id) or employee_id = public.current_employee_id()
);

-- ---------------------------------------------------------------------
-- 4. KURIKULUM & KKM (CP/KD & KKM per mapel)
-- ---------------------------------------------------------------------
create table if not exists public.kurikulum_kkm (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  mata_pelajaran_id uuid not null references public.mata_pelajaran(id) on delete cascade,
  tingkat text,
  tahun_ajaran_id uuid references public.tahun_ajaran(id) on delete set null,
  semester text check (semester is null or semester in ('Ganjil', 'Genap')),
  kkm int check (kkm is null or (kkm >= 0 and kkm <= 100)),
  cp_kd text,
  keterangan text,
  created_at timestamptz not null default now()
);
create index if not exists kurikulum_school_idx on public.kurikulum_kkm (school_id);
create index if not exists kurikulum_mapel_idx on public.kurikulum_kkm (mata_pelajaran_id);

alter table public.kurikulum_kkm enable row level security;
drop policy if exists kurikulum_select on public.kurikulum_kkm;
create policy kurikulum_select on public.kurikulum_kkm for select using (
  public.is_yayasan_admin() or public.has_school_access(school_id) or public.is_wali_kelas_of_school(school_id)
);
drop policy if exists kurikulum_write on public.kurikulum_kkm;
create policy kurikulum_write on public.kurikulum_kkm for all using (
  public.is_yayasan_admin() or public.is_school_manager(school_id)
) with check (
  public.is_yayasan_admin() or public.is_school_manager(school_id)
);

-- ---------------------------------------------------------------------
-- 5. EKSTRAKURIKULER + PESERTA
-- ---------------------------------------------------------------------
create table if not exists public.ekstrakurikuler (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  tahun_ajaran_id uuid references public.tahun_ajaran(id) on delete set null,
  nama text not null,
  pembina_employee_id uuid references public.employees(id) on delete set null,
  jadwal text,
  keterangan text,
  created_at timestamptz not null default now()
);
create index if not exists ekskul_school_idx on public.ekstrakurikuler (school_id);

create table if not exists public.ekskul_peserta (
  id uuid primary key default gen_random_uuid(),
  ekskul_id uuid not null references public.ekstrakurikuler(id) on delete cascade,
  siswa_id uuid not null references public.siswa(id) on delete cascade,
  nilai text,
  catatan text,
  created_at timestamptz not null default now(),
  unique (ekskul_id, siswa_id)
);
create index if not exists ekskul_peserta_ekskul_idx on public.ekskul_peserta (ekskul_id);

alter table public.ekstrakurikuler enable row level security;
drop policy if exists ekskul_select on public.ekstrakurikuler;
create policy ekskul_select on public.ekstrakurikuler for select using (
  public.is_yayasan_admin() or public.has_school_access(school_id) or pembina_employee_id = public.current_employee_id()
);
drop policy if exists ekskul_write on public.ekstrakurikuler;
create policy ekskul_write on public.ekstrakurikuler for all using (
  public.is_yayasan_admin() or public.is_school_manager(school_id) or pembina_employee_id = public.current_employee_id()
) with check (
  public.is_yayasan_admin() or public.is_school_manager(school_id) or pembina_employee_id = public.current_employee_id()
);

alter table public.ekskul_peserta enable row level security;
drop policy if exists ekskul_peserta_select on public.ekskul_peserta;
create policy ekskul_peserta_select on public.ekskul_peserta for select using (
  exists (select 1 from public.ekstrakurikuler e where e.id = ekskul_id and (public.is_yayasan_admin() or public.has_school_access(e.school_id) or e.pembina_employee_id = public.current_employee_id()))
);
drop policy if exists ekskul_peserta_write on public.ekskul_peserta;
create policy ekskul_peserta_write on public.ekskul_peserta for all using (
  exists (select 1 from public.ekstrakurikuler e where e.id = ekskul_id and (public.is_yayasan_admin() or public.is_school_manager(e.school_id) or e.pembina_employee_id = public.current_employee_id()))
) with check (
  exists (select 1 from public.ekstrakurikuler e where e.id = ekskul_id and (public.is_yayasan_admin() or public.is_school_manager(e.school_id) or e.pembina_employee_id = public.current_employee_id()))
);

-- ---------------------------------------------------------------------
-- 6. PERANGKAT AJAR (RPP/Modul Ajar/Prota/Prosem/Silabus/ATP) + MONEV
--    Guru mengumpulkan; Kepala Sekolah/Waka Kurikulum memverifikasi (monev).
-- ---------------------------------------------------------------------
create table if not exists public.perangkat_ajar (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  tahun_ajaran_id uuid references public.tahun_ajaran(id) on delete set null,
  semester text check (semester is null or semester in ('Ganjil', 'Genap')),
  employee_id uuid references public.employees(id) on delete set null,   -- guru pengumpul
  mata_pelajaran_id uuid references public.mata_pelajaran(id) on delete set null,
  rombel_id uuid references public.rombel(id) on delete set null,
  jenis text not null,   -- RPP / Modul Ajar / Prota / Prosem / Silabus / ATP / KKTP
  judul text,
  file_url text,         -- path di bucket 'employee-files' ATAU URL eksternal
  is_link boolean not null default false,
  tanggal_kumpul date not null default current_date,
  -- MONEV
  status text not null default 'dikumpulkan' check (status in ('draft', 'dikumpulkan', 'diverifikasi', 'revisi')),
  reviewer_employee_id uuid references public.employees(id) on delete set null,
  review_catatan text,
  review_at timestamptz,
  nilai_monev int check (nilai_monev is null or (nilai_monev >= 0 and nilai_monev <= 100)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists perangkat_school_idx on public.perangkat_ajar (school_id);
create index if not exists perangkat_guru_idx on public.perangkat_ajar (employee_id);
create index if not exists perangkat_status_idx on public.perangkat_ajar (status);

create or replace function public.perangkat_ajar_touch()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and new.status is distinct from old.status and new.status in ('diverifikasi', 'revisi') then
    new.reviewer_employee_id := public.current_employee_id();
    new.review_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists perangkat_ajar_touch_trg on public.perangkat_ajar;
create trigger perangkat_ajar_touch_trg
  before update on public.perangkat_ajar
  for each row execute function public.perangkat_ajar_touch();

alter table public.perangkat_ajar enable row level security;
drop policy if exists perangkat_select on public.perangkat_ajar;
create policy perangkat_select on public.perangkat_ajar for select using (
  public.is_yayasan_admin() or public.has_school_access(school_id) or employee_id = public.current_employee_id()
);
-- Guru mengelola pengumpulannya sendiri.
drop policy if exists perangkat_write_guru on public.perangkat_ajar;
create policy perangkat_write_guru on public.perangkat_ajar for all using (
  employee_id = public.current_employee_id()
) with check (
  employee_id = public.current_employee_id()
);
-- Pengelola (Yayasan/Kepala Sekolah/Waka) memverifikasi (monev).
drop policy if exists perangkat_write_manajer on public.perangkat_ajar;
create policy perangkat_write_manajer on public.perangkat_ajar for all using (
  public.is_yayasan_admin() or public.is_school_manager(school_id)
) with check (
  public.is_yayasan_admin() or public.is_school_manager(school_id)
);

-- ---------------------------------------------------------------------
-- 7. Akses BACA rombel & mapel untuk GURU PENGAMPU (bukan hanya wali kelas)
--    supaya form Jadwal/Jurnal/Perangkat menampilkan nama kelas & mapel.
--    Additive (menambah klausa OR) — tidak mengubah kewenangan tulis.
-- ---------------------------------------------------------------------
create or replace function public.is_pengajar_of_school(target_school_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.penugasan_mengajar pm
    where pm.school_id = target_school_id and pm.employee_id = public.current_employee_id()
  ) or exists (
    select 1 from public.jadwal_pelajaran jp
    where jp.school_id = target_school_id and jp.employee_id = public.current_employee_id()
  );
$$;

drop policy if exists rombel_select on public.rombel;
create policy rombel_select on public.rombel for select using (
  public.is_yayasan_admin() or public.has_school_access(school_id) or wali_kelas_employee_id = public.current_employee_id() or public.is_pengajar_of_school(school_id)
);

drop policy if exists mata_pelajaran_select on public.mata_pelajaran;
create policy mata_pelajaran_select on public.mata_pelajaran for select using (
  public.is_yayasan_admin() or public.has_school_access(school_id) or public.is_wali_kelas_of_school(school_id) or public.is_pengajar_of_school(school_id)
);
