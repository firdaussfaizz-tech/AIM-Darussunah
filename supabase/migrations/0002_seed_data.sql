-- =====================================================================
-- DATA AWAL — sesuaikan nama sekolah, alamat, dsb dengan data yayasan
-- Bapak/Ibu sebelum dijalankan. Aman dijalankan sekali di awal.
-- =====================================================================

insert into public.schools (jenjang, nama, npsn, alamat) values
  ('SD',  'SD Yayasan — isi nama sekolah', null, null),
  ('SMP', 'SMP Yayasan — isi nama sekolah', null, null),
  ('SMA', 'SMA Yayasan — isi nama sekolah', null, null);

-- Unit tingkat yayasan pusat (school_id null)
insert into public.departments (school_id, nama) values
  (null, 'Kantor Yayasan'),
  (null, 'HRD / Kepegawaian'),
  (null, 'Keuangan Yayasan');

-- Unit kerja standar di tiap sekolah
insert into public.departments (school_id, nama)
select id, unit
from public.schools, (values ('Tata Usaha'), ('Kurikulum'), ('Kesiswaan'), ('Perpustakaan')) as u(unit);

-- Jabatan struktural dasar
insert into public.positions (department_id, nama, jenis)
select d.id, 'Kepala Sekolah', 'struktural' from public.departments d
  join public.schools s on s.id = d.school_id and d.nama = 'Tata Usaha';

insert into public.positions (nama, jenis) values
  ('Guru Kelas', 'guru'),
  ('Guru Mata Pelajaran', 'guru'),
  ('Guru BK', 'guru'),
  ('Staf Tata Usaha', 'tenaga_kependidikan'),
  ('Pustakawan', 'tenaga_kependidikan'),
  ('Petugas Kebersihan', 'tenaga_kependidikan'),
  ('Satpam', 'tenaga_kependidikan');

-- Jenis cuti standar (menyesuaikan aturan kepegawaian yayasan pendidikan pada umumnya)
insert into public.leave_types (nama, jatah_hari_per_tahun) values
  ('Cuti Tahunan', 12),
  ('Cuti Sakit', 14),
  ('Cuti Melahirkan', 90),
  ('Cuti Penting/Keperluan Keluarga', 3),
  ('Izin Tanpa Potong Cuti', 0);

-- Periode penilaian kinerja tahun berjalan
insert into public.performance_periods (nama, tahun, semester) values
  ('Semester Ganjil', extract(year from current_date)::int, 1),
  ('Semester Genap', extract(year from current_date)::int, 2);

-- =====================================================================
-- LANGKAH SETELAH INI (lakukan manual, lihat README):
-- 1. Daftarkan akun login pertama Bapak/Ibu lewat halaman Login
--    aplikasi (opsi "Daftar") atau lewat Supabase Dashboard >
--    Authentication > Users > Add user.
-- 2. Jalankan query di bawah ini (ganti EMAIL_ANDA) untuk menjadikan
--    akun tersebut admin_yayasan pertama:
--
--    insert into public.user_roles (user_id, role)
--    select id, 'admin_yayasan' from auth.users where email = 'EMAIL_ANDA@contoh.com';
-- =====================================================================
