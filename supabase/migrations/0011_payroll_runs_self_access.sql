-- =====================================================================
-- Fix: halaman "Slip Gaji Saya" blank/kosong untuk pegawai non Admin
-- Yayasan (guru/staff/HR/Kepala Sekolah/Admin Sekolah).
--
-- Akar masalah: policy SELECT pada payroll_runs (dibuat di migrasi 0001)
-- hanya mengizinkan is_yayasan_admin(). Halaman Slip Gaji Saya meng-embed
-- payroll_runs(periode_bulan, periode_tahun, status) lewat payroll_details
-- — pegawai memang boleh baca baris payroll_details miliknya sendiri,
-- tapi RLS memblokir join ke payroll_runs-nya sehingga relasi itu balik
-- null dan halaman gagal render.
--
-- Migrasi ini TIDAK mengganti/menghapus policy admin yang sudah ada
-- (payroll_runs_select) — hanya MENAMBAH policy baru yang mengizinkan
-- pegawai melihat baris payroll_runs untuk periode di mana dia punya
-- slip (payroll_details) sendiri. Aman & non-destruktif: hanya
-- menambahkan hak baca metadata periode (bulan/tahun/status), bukan
-- data gaji pegawai lain.
--
-- Jalankan langsung di Supabase SQL Editor. Aman dijalankan berkali-kali
-- (drop if exists sebelum create).
-- =====================================================================

drop policy if exists payroll_runs_select_self on public.payroll_runs;

create policy payroll_runs_select_self on public.payroll_runs for select using (
  exists (
    select 1 from public.payroll_details pd
    where pd.payroll_run_id = payroll_runs.id
      and pd.employee_id = public.current_employee_id()
  )
);
