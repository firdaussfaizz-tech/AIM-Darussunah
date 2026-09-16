-- =====================================================================
-- SIMPEG YAYASAN — Skema Modul SDM/Kepegawaian (Tahap 1)
-- Dirancang untuk satu yayasan yang menaungi SD, SMP, dan SMA.
-- Tabel `schools`, `profiles`, dan `user_roles` di file ini akan dipakai
-- ulang oleh modul-modul berikutnya (Akademik, Keuangan, dsb).
-- Jalankan file ini secara berurutan di Supabase SQL Editor.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. PROFILES — cermin ringan dari auth.users, dibuat via trigger
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 1. STRUKTUR ORGANISASI — jenjang, sekolah, unit kerja, jabatan
-- ---------------------------------------------------------------------
create type jenjang_enum as enum ('SD', 'SMP', 'SMA');

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  jenjang jenjang_enum not null,
  nama text not null,
  npsn text,
  alamat text,
  telepon text,
  email text,
  kepala_sekolah_id uuid, -- diisi belakangan, FK ditambahkan setelah tabel employees ada
  created_at timestamptz not null default now()
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade, -- null = level yayasan pusat
  nama text not null,
  created_at timestamptz not null default now()
);

create table public.positions (
  id uuid primary key default gen_random_uuid(),
  department_id uuid references public.departments(id) on delete set null,
  nama text not null,
  jenis text check (jenis in ('struktural', 'guru', 'tenaga_kependidikan')) not null default 'struktural',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. DATA INDUK PEGAWAI
-- ---------------------------------------------------------------------
create type jenis_kelamin_enum as enum ('L', 'P');
create type status_kepegawaian_enum as enum ('PNS Dipekerjakan', 'Tetap Yayasan', 'Kontrak', 'Honorer', 'GTT', 'PTT');
create type employee_status_enum as enum ('aktif', 'cuti', 'nonaktif', 'pensiun');

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  nip text unique,
  nik text,
  nama text not null,
  jenis_kelamin jenis_kelamin_enum,
  tempat_lahir text,
  tanggal_lahir date,
  alamat text,
  no_hp text,
  email text,
  foto_url text,
  school_id uuid references public.schools(id) on delete set null,
  department_id uuid references public.departments(id) on delete set null,
  position_id uuid references public.positions(id) on delete set null,
  status_kepegawaian status_kepegawaian_enum not null default 'Kontrak',
  status employee_status_enum not null default 'aktif',
  tanggal_masuk date,
  pendidikan_terakhir text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.schools
  add constraint fk_schools_kepala_sekolah foreign key (kepala_sekolah_id) references public.employees(id) on delete set null;

create table public.employee_education (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  jenjang_pendidikan text not null,
  institusi text,
  jurusan text,
  tahun_lulus int,
  created_at timestamptz not null default now()
);

create table public.employee_work_history (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  nama_instansi text not null,
  jabatan text,
  tahun_mulai int,
  tahun_selesai int,
  created_at timestamptz not null default now()
);

create table public.employee_documents (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  jenis_dokumen text not null,
  nama_file text,
  file_url text not null,
  uploaded_at timestamptz not null default now()
);

create table public.employment_contracts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  jenis_kontrak text not null,
  nomor_sk text,
  tanggal_mulai date not null,
  tanggal_selesai date,
  file_url text,
  status text check (status in ('aktif', 'berakhir', 'diperpanjang')) not null default 'aktif',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. PRESENSI & CUTI
-- ---------------------------------------------------------------------
create type attendance_status_enum as enum ('hadir', 'izin', 'sakit', 'alpa', 'dinas_luar', 'cuti');

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  tanggal date not null,
  jam_masuk time,
  jam_pulang time,
  status attendance_status_enum not null default 'hadir',
  keterangan text,
  created_at timestamptz not null default now(),
  unique (employee_id, tanggal)
);

create table public.leave_types (
  id uuid primary key default gen_random_uuid(),
  nama text not null,
  jatah_hari_per_tahun int not null default 12
);

create type leave_status_enum as enum ('pending', 'disetujui', 'ditolak');

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  leave_type_id uuid references public.leave_types(id),
  tanggal_mulai date not null,
  tanggal_selesai date not null,
  jumlah_hari int not null,
  alasan text,
  status leave_status_enum not null default 'pending',
  approved_by uuid references public.employees(id),
  approved_at timestamptz,
  catatan_approval text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 4. PENGGAJIAN
-- ---------------------------------------------------------------------
create table public.employee_salary (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  gaji_pokok numeric(14,2) not null default 0,
  tunjangan_jabatan numeric(14,2) not null default 0,
  tunjangan_transport numeric(14,2) not null default 0,
  tunjangan_makan numeric(14,2) not null default 0,
  tunjangan_lainnya numeric(14,2) not null default 0,
  potongan_bpjs numeric(14,2) not null default 0,
  potongan_lainnya numeric(14,2) not null default 0,
  berlaku_sejak date not null default current_date,
  created_at timestamptz not null default now()
);

create type payroll_status_enum as enum ('draft', 'final');

create table public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  periode_bulan int not null check (periode_bulan between 1 and 12),
  periode_tahun int not null,
  status payroll_status_enum not null default 'draft',
  catatan text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (periode_bulan, periode_tahun)
);

create table public.payroll_details (
  id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid not null references public.payroll_runs(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  gaji_pokok numeric(14,2) not null default 0,
  total_tunjangan numeric(14,2) not null default 0,
  total_potongan numeric(14,2) not null default 0,
  gaji_bersih numeric(14,2) not null default 0,
  detail jsonb,
  created_at timestamptz not null default now(),
  unique (payroll_run_id, employee_id)
);

-- ---------------------------------------------------------------------
-- 5. PENILAIAN KINERJA & PENGEMBANGAN (pelatihan)
-- ---------------------------------------------------------------------
create table public.performance_periods (
  id uuid primary key default gen_random_uuid(),
  nama text not null,
  tahun int not null,
  semester int,
  created_at timestamptz not null default now()
);

create table public.performance_reviews (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  period_id uuid not null references public.performance_periods(id) on delete cascade,
  reviewer_id uuid references public.employees(id),
  nilai_kedisiplinan int check (nilai_kedisiplinan between 1 and 100),
  nilai_kinerja int check (nilai_kinerja between 1 and 100),
  nilai_kerjasama int check (nilai_kerjasama between 1 and 100),
  nilai_akhir numeric(5,2),
  catatan text,
  status text check (status in ('draft', 'final')) not null default 'draft',
  created_at timestamptz not null default now(),
  unique (employee_id, period_id)
);

create table public.trainings (
  id uuid primary key default gen_random_uuid(),
  nama_pelatihan text not null,
  penyelenggara text,
  jenis text check (jenis in ('internal', 'eksternal')) not null default 'internal',
  tanggal_mulai date,
  tanggal_selesai date,
  lokasi text,
  deskripsi text,
  created_at timestamptz not null default now()
);

create table public.training_participants (
  id uuid primary key default gen_random_uuid(),
  training_id uuid not null references public.trainings(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  status text check (status in ('terdaftar', 'hadir', 'selesai', 'tidak_hadir')) not null default 'terdaftar',
  sertifikat_url text,
  catatan text,
  unique (training_id, employee_id)
);

-- ---------------------------------------------------------------------
-- 6. PERAN PENGGUNA (akses berbasis peran)
-- ---------------------------------------------------------------------
create type app_role_enum as enum ('admin_yayasan', 'admin_sekolah', 'hr', 'kepala_sekolah', 'guru', 'staff');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role_enum not null,
  school_id uuid references public.schools(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, role, school_id)
);

-- =====================================================================
-- FUNGSI BANTUAN UNTUK ROW LEVEL SECURITY (security definer agar
-- tidak memicu rekursi RLS saat memeriksa peran pengguna)
-- =====================================================================
create function public.is_yayasan_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role in ('admin_yayasan', 'hr')
  );
$$;

create function public.has_school_access(target_school_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid()
      and (role in ('admin_yayasan', 'hr') or school_id = target_school_id)
  );
$$;

create function public.current_employee_id()
returns uuid language sql security definer stable set search_path = public as $$
  select id from public.employees where user_id = auth.uid() limit 1;
$$;

create function public.employee_school_id(emp_id uuid)
returns uuid language sql security definer stable set search_path = public as $$
  select school_id from public.employees where id = emp_id;
$$;

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.schools enable row level security;
alter table public.departments enable row level security;
alter table public.positions enable row level security;
alter table public.employees enable row level security;
alter table public.employee_education enable row level security;
alter table public.employee_work_history enable row level security;
alter table public.employee_documents enable row level security;
alter table public.employment_contracts enable row level security;
alter table public.attendance enable row level security;
alter table public.leave_types enable row level security;
alter table public.leave_requests enable row level security;
alter table public.employee_salary enable row level security;
alter table public.payroll_runs enable row level security;
alter table public.payroll_details enable row level security;
alter table public.performance_periods enable row level security;
alter table public.performance_reviews enable row level security;
alter table public.trainings enable row level security;
alter table public.training_participants enable row level security;
alter table public.user_roles enable row level security;

-- profiles
create policy profiles_select on public.profiles for select using (public.is_yayasan_admin() or id = auth.uid());
create policy profiles_update_self on public.profiles for update using (id = auth.uid());

-- schools / departments / positions (data induk — semua pengguna login boleh baca, hanya admin yayasan yang kelola)
create policy schools_select on public.schools for select using (auth.uid() is not null);
create policy schools_write on public.schools for all using (public.is_yayasan_admin()) with check (public.is_yayasan_admin());

create policy departments_select on public.departments for select using (auth.uid() is not null);
create policy departments_write on public.departments for all using (public.is_yayasan_admin()) with check (public.is_yayasan_admin());

create policy positions_select on public.positions for select using (auth.uid() is not null);
create policy positions_write on public.positions for all using (public.is_yayasan_admin()) with check (public.is_yayasan_admin());

-- employees
create policy employees_select on public.employees for select using (
  public.is_yayasan_admin() or public.has_school_access(school_id) or user_id = auth.uid()
);
create policy employees_insert on public.employees for insert with check (
  public.is_yayasan_admin() or public.has_school_access(school_id)
);
create policy employees_update on public.employees for update using (
  public.is_yayasan_admin() or public.has_school_access(school_id) or user_id = auth.uid()
);
create policy employees_delete on public.employees for delete using (public.is_yayasan_admin());

-- employee_education / work_history / documents / contracts (pola sama)
create policy edu_select on public.employee_education for select using (
  public.is_yayasan_admin() or public.has_school_access(public.employee_school_id(employee_id)) or employee_id = public.current_employee_id()
);
create policy edu_write on public.employee_education for all using (
  public.is_yayasan_admin() or public.has_school_access(public.employee_school_id(employee_id))
) with check (
  public.is_yayasan_admin() or public.has_school_access(public.employee_school_id(employee_id))
);

create policy work_select on public.employee_work_history for select using (
  public.is_yayasan_admin() or public.has_school_access(public.employee_school_id(employee_id)) or employee_id = public.current_employee_id()
);
create policy work_write on public.employee_work_history for all using (
  public.is_yayasan_admin() or public.has_school_access(public.employee_school_id(employee_id))
) with check (
  public.is_yayasan_admin() or public.has_school_access(public.employee_school_id(employee_id))
);

create policy docs_select on public.employee_documents for select using (
  public.is_yayasan_admin() or public.has_school_access(public.employee_school_id(employee_id)) or employee_id = public.current_employee_id()
);
create policy docs_write on public.employee_documents for all using (
  public.is_yayasan_admin() or public.has_school_access(public.employee_school_id(employee_id))
) with check (
  public.is_yayasan_admin() or public.has_school_access(public.employee_school_id(employee_id))
);

create policy contracts_select on public.employment_contracts for select using (
  public.is_yayasan_admin() or public.has_school_access(public.employee_school_id(employee_id)) or employee_id = public.current_employee_id()
);
create policy contracts_write on public.employment_contracts for all using (
  public.is_yayasan_admin() or public.has_school_access(public.employee_school_id(employee_id))
) with check (
  public.is_yayasan_admin() or public.has_school_access(public.employee_school_id(employee_id))
);

-- attendance
create policy attendance_select on public.attendance for select using (
  public.is_yayasan_admin() or public.has_school_access(public.employee_school_id(employee_id)) or employee_id = public.current_employee_id()
);
create policy attendance_write on public.attendance for all using (
  public.is_yayasan_admin() or public.has_school_access(public.employee_school_id(employee_id))
) with check (
  public.is_yayasan_admin() or public.has_school_access(public.employee_school_id(employee_id))
);

-- leave types (referensi)
create policy leave_types_select on public.leave_types for select using (auth.uid() is not null);
create policy leave_types_write on public.leave_types for all using (public.is_yayasan_admin()) with check (public.is_yayasan_admin());

-- leave requests
create policy leave_select on public.leave_requests for select using (
  public.is_yayasan_admin() or public.has_school_access(public.employee_school_id(employee_id)) or employee_id = public.current_employee_id()
);
create policy leave_insert on public.leave_requests for insert with check (
  employee_id = public.current_employee_id() or public.is_yayasan_admin() or public.has_school_access(public.employee_school_id(employee_id))
);
create policy leave_update on public.leave_requests for update using (
  public.is_yayasan_admin() or public.has_school_access(public.employee_school_id(employee_id))
  or (employee_id = public.current_employee_id() and status = 'pending')
);
create policy leave_delete on public.leave_requests for delete using (public.is_yayasan_admin());

-- salary & payroll (sensitif — hanya admin yayasan/hr yang kelola, pegawai hanya lihat data sendiri)
create policy salary_select on public.employee_salary for select using (
  public.is_yayasan_admin() or employee_id = public.current_employee_id()
);
create policy salary_write on public.employee_salary for all using (public.is_yayasan_admin()) with check (public.is_yayasan_admin());

create policy payroll_runs_select on public.payroll_runs for select using (public.is_yayasan_admin());
create policy payroll_runs_write on public.payroll_runs for all using (public.is_yayasan_admin()) with check (public.is_yayasan_admin());

create policy payroll_details_select on public.payroll_details for select using (
  public.is_yayasan_admin() or employee_id = public.current_employee_id()
);
create policy payroll_details_write on public.payroll_details for all using (public.is_yayasan_admin()) with check (public.is_yayasan_admin());

-- performance
create policy perf_periods_select on public.performance_periods for select using (auth.uid() is not null);
create policy perf_periods_write on public.performance_periods for all using (public.is_yayasan_admin()) with check (public.is_yayasan_admin());

create policy perf_reviews_select on public.performance_reviews for select using (
  public.is_yayasan_admin() or public.has_school_access(public.employee_school_id(employee_id)) or employee_id = public.current_employee_id()
);
create policy perf_reviews_write on public.performance_reviews for all using (
  public.is_yayasan_admin() or public.has_school_access(public.employee_school_id(employee_id))
) with check (
  public.is_yayasan_admin() or public.has_school_access(public.employee_school_id(employee_id))
);

-- trainings
create policy trainings_select on public.trainings for select using (auth.uid() is not null);
create policy trainings_write on public.trainings for all using (public.is_yayasan_admin()) with check (public.is_yayasan_admin());

create policy training_participants_select on public.training_participants for select using (
  public.is_yayasan_admin() or public.has_school_access(public.employee_school_id(employee_id)) or employee_id = public.current_employee_id()
);
create policy training_participants_write on public.training_participants for all using (
  public.is_yayasan_admin() or public.has_school_access(public.employee_school_id(employee_id))
) with check (
  public.is_yayasan_admin() or public.has_school_access(public.employee_school_id(employee_id))
);

-- user_roles (hanya admin yayasan yang boleh atur peran; pengguna boleh lihat perannya sendiri)
create policy user_roles_select on public.user_roles for select using (
  public.is_yayasan_admin() or user_id = auth.uid()
);
create policy user_roles_write on public.user_roles for all using (public.is_yayasan_admin()) with check (public.is_yayasan_admin());

-- =====================================================================
-- TRIGGER updated_at UNTUK employees
-- =====================================================================
create function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger employees_set_updated_at
  before update on public.employees
  for each row execute function public.set_updated_at();
