-- =====================================================================
-- PERBAIKAN — mata_pelajaran_select terlalu terbuka.
--
-- Migrasi 0025 (Nilai & Rapor) membuat kebijakan SELECT mata_pelajaran
-- dengan `using (auth.uid() is not null)` — artinya SEMUA pengguna yang
-- login (termasuk Admin Sekolah/Kepala Sekolah/Wali Kelas dari unit lain,
-- bahkan Bendahara) bisa membaca daftar mata pelajaran unit sekolah MANA
-- PUN, bukan cuma unit sendiri. Ini satu-satunya tabel di modul Kesiswaan
-- yang belum di-scope per unit sekolah pada SELECT-nya (mata_pelajaran_write
-- sudah benar sejak awal — lihat 0025).
--
-- Perbaikan ini menyamakan pola mata_pelajaran_select dengan
-- mata_pelajaran_write: manajemen unit/yayasan ATAU Wali Kelas dari rombel
-- di unit sekolah tsb (Wali Kelas perlu membaca daftar mapel unitnya
-- sendiri untuk form Input Nilai — lihat NilaiModal di NilaiRapor.jsx).
--
-- CREATE POLICY tidak punya "OR REPLACE" — kita DROP dulu baru buat ulang.
-- Non-destruktif: hanya menambah satu fungsi bantuan baru & mengganti
-- definisi kebijakan RLS, tidak mengubah data apa pun.
-- =====================================================================

-- true jika pegawai yang login adalah Wali Kelas dari rombel manapun di
-- unit sekolah tsb (dipakai supaya Wali Kelas bisa membaca daftar mapel
-- unitnya sendiri saat Input Nilai, tanpa perlu akses has_school_access).
create function public.is_wali_kelas_of_school(target_school_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.rombel
    where school_id = target_school_id and wali_kelas_employee_id = public.current_employee_id()
  );
$$;

drop policy if exists mata_pelajaran_select on public.mata_pelajaran;
create policy mata_pelajaran_select on public.mata_pelajaran for select using (
  public.is_yayasan_admin() or public.has_school_access(school_id) or public.is_wali_kelas_of_school(school_id)
);
