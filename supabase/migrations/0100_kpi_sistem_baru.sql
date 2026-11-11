-- 0100: Sistem KPI baru (menggantikan OKR & KPI Lembaga + tab KPI Struktur
-- Organisasi). Dua lapis: Institusional (bidang → indikator, per jenjang) dan
-- Individu (profil GURU/TENDIK → aspek). Realisasi/penilaian/evaluasi per unit
-- (school_id) per Tahun Pelajaran + Semester. Rumus capaian/skor/predikat sama
-- dengan model mutu (ISO 9001): capaian naik=real/target, turun=target/real;
-- skor=min(capaian,100); berbobot per indikator (Σbobot=100 per jenjang).
--
-- Prefiks tabel: kpi2_*. Tabel lama kpi_indicators TIDAK dihapus (data lama
-- tetap ada), hanya tidak dipakai lagi oleh UI.

-- ========================= MASTER (kerangka) =========================

-- Bidang/kategori (global, sama lintas jenjang).
create table if not exists public.kpi2_bidang (
  kode text primary key,
  nama text not null,
  urutan int not null default 0
);

-- Indikator institusional per jenjang.
create table if not exists public.kpi2_indikator (
  id uuid primary key default gen_random_uuid(),
  jenjang jenjang_enum not null,
  bidang_kode text not null references public.kpi2_bidang(kode) on delete restrict,
  kode text not null,
  nama text not null,
  satuan text not null default '%',
  target numeric not null default 100,
  arah text not null default 'naik' check (arah in ('naik','turun')),
  bobot numeric not null default 0,
  sumber text not null default 'manual'
    check (sumber in ('manual','kehadiran_mengajar','kehadiran_siswa','kehadiran_pegawai','rata_nilai_kinerja','tunggakan_spp')),
  pic text,
  urutan int not null default 0,
  status_aktif boolean not null default true,
  unique (jenjang, kode)
);
create index if not exists kpi2_indikator_jenjang_idx on public.kpi2_indikator (jenjang);

-- Profil penilaian individu (global).
create table if not exists public.kpi2_profil (
  kode text primary key,
  nama text not null
);
create table if not exists public.kpi2_aspek (
  id uuid primary key default gen_random_uuid(),
  profil_kode text not null references public.kpi2_profil(kode) on delete cascade,
  kode text not null,
  nama text not null,
  satuan text not null default '%',
  target numeric not null default 100,
  arah text not null default 'naik' check (arah in ('naik','turun')),
  bobot numeric not null default 0,
  urutan int not null default 0,
  unique (profil_kode, kode)
);

-- ===================== DATA PER UNIT & PERIODE =======================

-- Realisasi indikator institusional.
create table if not exists public.kpi2_realisasi (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  tahun_pelajaran text not null,
  semester text not null check (semester in ('Ganjil','Genap')),
  indikator_id uuid not null references public.kpi2_indikator(id) on delete cascade,
  nilai numeric,
  updated_at timestamptz not null default now(),
  unique (school_id, tahun_pelajaran, semester, indikator_id)
);
create index if not exists kpi2_realisasi_periode_idx on public.kpi2_realisasi (school_id, tahun_pelajaran, semester);

-- Profil penilaian tiap pegawai (rubrik mana yang dipakai).
create table if not exists public.kpi2_personel (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  profil_kode text not null references public.kpi2_profil(kode) on delete restrict
);

-- Realisasi penilaian individu per aspek.
create table if not exists public.kpi2_individu (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete set null,
  employee_id uuid not null references public.employees(id) on delete cascade,
  tahun_pelajaran text not null,
  semester text not null check (semester in ('Ganjil','Genap')),
  aspek_id uuid not null references public.kpi2_aspek(id) on delete cascade,
  nilai numeric,
  updated_at timestamptz not null default now(),
  unique (employee_id, tahun_pelajaran, semester, aspek_id)
);
create index if not exists kpi2_individu_periode_idx on public.kpi2_individu (school_id, tahun_pelajaran, semester);

-- Register evaluasi & tindak lanjut (ISO 9001) per indikator+periode.
create table if not exists public.kpi2_evaluasi (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  tahun_pelajaran text not null,
  semester text not null check (semester in ('Ganjil','Genap')),
  indikator_id uuid not null references public.kpi2_indikator(id) on delete cascade,
  akar text,
  tindakan text,
  pic text,
  tenggat date,
  status text not null default '' check (status in ('','Belum mulai','Dalam proses','Selesai','Dibatalkan')),
  updated_at timestamptz not null default now(),
  unique (school_id, tahun_pelajaran, semester, indikator_id)
);

-- ============================== RLS ==================================
alter table public.kpi2_bidang enable row level security;
alter table public.kpi2_indikator enable row level security;
alter table public.kpi2_profil enable row level security;
alter table public.kpi2_aspek enable row level security;
alter table public.kpi2_realisasi enable row level security;
alter table public.kpi2_personel enable row level security;
alter table public.kpi2_individu enable row level security;
alter table public.kpi2_evaluasi enable row level security;

-- Kerangka (master): semua authenticated boleh baca; hanya Yayasan boleh ubah.
do $$
declare t text;
begin
  foreach t in array array['kpi2_bidang','kpi2_indikator','kpi2_profil','kpi2_aspek'] loop
    execute format('drop policy if exists %1$s_read on public.%1$s', t);
    execute format('create policy %1$s_read on public.%1$s for select to authenticated using (true)', t);
    execute format('drop policy if exists %1$s_write on public.%1$s', t);
    execute format('create policy %1$s_write on public.%1$s for all to authenticated using (public.is_yayasan_admin()) with check (public.is_yayasan_admin())', t);
  end loop;
end $$;

-- Data per unit: Yayasan atau manajer unit ybs.
drop policy if exists kpi2_realisasi_rw on public.kpi2_realisasi;
create policy kpi2_realisasi_rw on public.kpi2_realisasi for all to authenticated
  using (public.is_yayasan_admin() or public.is_school_manager(school_id))
  with check (public.is_yayasan_admin() or public.is_school_manager(school_id));
drop policy if exists kpi2_evaluasi_rw on public.kpi2_evaluasi;
create policy kpi2_evaluasi_rw on public.kpi2_evaluasi for all to authenticated
  using (public.is_yayasan_admin() or public.is_school_manager(school_id))
  with check (public.is_yayasan_admin() or public.is_school_manager(school_id));
drop policy if exists kpi2_individu_rw on public.kpi2_individu;
create policy kpi2_individu_rw on public.kpi2_individu for all to authenticated
  using (public.is_yayasan_admin() or public.is_school_manager(school_id))
  with check (public.is_yayasan_admin() or public.is_school_manager(school_id));
drop policy if exists kpi2_personel_read on public.kpi2_personel;
create policy kpi2_personel_read on public.kpi2_personel for select to authenticated using (true);
drop policy if exists kpi2_personel_write on public.kpi2_personel;
create policy kpi2_personel_write on public.kpi2_personel for all to authenticated
  using (public.is_yayasan_admin() or public.is_school_manager((select e.school_id from public.employees e where e.id = employee_id)))
  with check (public.is_yayasan_admin() or public.is_school_manager((select e.school_id from public.employees e where e.id = employee_id)));

-- ============================== SEED =================================
insert into public.kpi2_bidang (kode, nama, urutan) values
  ('KUR','Kurikulum & Pembelajaran',1),
  ('KSW','Kesiswaan & Keislaman',2),
  ('SAR','Sarana & Prasarana',3),
  ('HMS','Humas & Kerjasama',4),
  ('TUK','Ketatausahaan & Keuangan',5)
on conflict (kode) do nothing;

-- Indikator per jenjang (dari Katalog KPI Lembaga per Jenjang 8 Okt 2026).
-- bobot: SD / SMP / SMA. Σ = 100 tiap jenjang.
insert into public.kpi2_indikator (jenjang, bidang_kode, kode, nama, satuan, target, arah, bobot, sumber, pic, urutan)
select j.jenjang, d.bidang_kode, d.kode, d.nama, d.satuan, d.target, d.arah,
       case j.jenjang when 'SD' then d.sd when 'SMP' then d.smp else d.sma end,
       d.sumber, d.pic, d.urutan
from (values
  ('KUR','KBM','Keterlaksanaan KBM','%',95,'naik','kehadiran_mengajar','Wakakur',1, 15,15,15),
  ('KUR','KKM','Ketuntasan Akademik (KKM)','%',85,'naik','manual','Wakakur',2, 15,18,20),
  ('KSW','SIS','Kehadiran Siswa','%',95,'naik','kehadiran_siswa','Wakasis',3, 10,10,10),
  ('KSW','THF','Capaian Tahfidz & Keagamaan','%',90,'naik','manual','Kasie Keislaman',4, 15,12,10),
  ('TUK','PEG','Kehadiran & Disiplin Pegawai','%',97,'naik','kehadiran_pegawai','Ka. TU',5, 10,10,10),
  ('TUK','KIN','Kinerja Pegawai','skor',85,'naik','rata_nilai_kinerja','Kepsek',6, 10,10,10),
  ('TUK','SPP','Kolektibilitas SPP','%',95,'naik','tunggakan_spp','Bendahara',7, 15,15,15),
  ('HMS','ORT','Kepuasan Orang Tua / Wali','%',85,'naik','manual','Wakahumas',8, 10,10,10)
) as d(bidang_kode,kode,nama,satuan,target,arah,sumber,pic,urutan,sd,smp,sma)
cross join (values ('SD'::jenjang_enum),('SMP'::jenjang_enum),('SMA'::jenjang_enum)) as j(jenjang)
on conflict (jenjang, kode) do nothing;

-- Profil & aspek individu (dari model mutu artifact).
insert into public.kpi2_profil (kode, nama) values
  ('GURU','Guru / Pendidik'),
  ('TENDIK','Tenaga Kependidikan / Staf')
on conflict (kode) do nothing;

insert into public.kpi2_aspek (profil_kode, kode, nama, satuan, target, arah, bobot, urutan) values
  ('GURU','G-01','Kelengkapan & ketepatan perangkat pembelajaran','%',100,'naik',15,1),
  ('GURU','G-02','Kehadiran & ketepatan jam mengajar','%',98,'naik',15,2),
  ('GURU','G-03','Pelaksanaan pembelajaran (kesesuaian modul & metode)','%',90,'naik',15,3),
  ('GURU','G-04','Administrasi penilaian & ketepatan input nilai','%',100,'naik',10,4),
  ('GURU','G-05','Hasil supervisi / observasi kelas','%',85,'naik',15,5),
  ('GURU','G-06','Ketuntasan belajar siswa yang diampu','%',85,'naik',15,6),
  ('GURU','G-07','Pengembangan diri (diklat/pelatihan)','jam',24,'naik',5,7),
  ('GURU','G-08','Tugas tambahan & kontribusi lembaga','%',100,'naik',5,8),
  ('GURU','G-09','Kedisiplinan & keteladanan (tata tertib/SOP)','%',100,'naik',5,9),
  ('TENDIK','T-01','Kehadiran & kedisiplinan','%',98,'naik',20,1),
  ('TENDIK','T-02','Ketepatan & kelengkapan tugas administrasi','%',100,'naik',25,2),
  ('TENDIK','T-03','Kualitas & kecepatan layanan','%',90,'naik',20,3),
  ('TENDIK','T-04','Ketaatan SOP & dokumen mutu','%',100,'naik',15,4),
  ('TENDIK','T-05','Inisiatif & tugas tambahan','%',100,'naik',10,5),
  ('TENDIK','T-06','Kerjasama tim','%',90,'naik',10,6)
on conflict (profil_kode, kode) do nothing;

notify pgrst, 'reload schema';
