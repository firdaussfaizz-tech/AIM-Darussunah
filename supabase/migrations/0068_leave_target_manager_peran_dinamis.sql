-- =====================================================================
-- PERBAIKAN KEWENANGAN PERSETUJUAN CUTI/IZIN — deteksi "manajer" (pemohon
-- yang pengajuannya WAJIB naik ke Yayasan) agar mengenali MODEL PERAN
-- DINAMIS (migrasi 0054) dan JABATAN BER-AKSES MANAJER (migrasi 0040),
-- bukan hanya enum lama.
--
-- Masalah yang diperbaiki:
--   Fungsi public.leave_target_is_manager(emp_id) (migrasi 0029) semula
--   hanya mengecek user_roles.role IN ('admin_sekolah','kepala_sekolah')
--   (enum lama). Setelah RBAC peran dinamis (0054), seorang Kepala
--   Sekolah/Mudir bisa ditetapkan lewat:
--     - peran dinamis (roles.tingkat_akses = 'manajer_unit'), atau
--     - jabatan dengan positions.beri_akses_manajer = true (mis. Mudir/Waka),
--   sehingga TIDAK terdeteksi oleh pengecekan enum lama. Akibatnya
--   izin/cuti milik Kepala Sekolah/Mudir salah dialirkan ke tahap
--   "Kepala Sekolah/Mudir" (bisa disetujui sesama Kepala Sekolah) —
--   padahal menurut kebijakan HARUS disetujui oleh Yayasan.
--
-- Perbaikan: perluas deteksi menjadi (OR):
--   1. Enum lama: admin_sekolah / kepala_sekolah (dan admin_yayasan / hr,
--      agar pengajuan milik orang Yayasan sendiri pun tidak bisa diputus
--      oleh Kepala Sekolah — tetap naik ke Yayasan).
--   2. Peran dinamis: roles.tingkat_akses IN ('manajer_unit','yayasan_penuh')
--      ATAU roles.is_admin_yayasan = true (lewat user_roles.role_id).
--   3. Jabatan: positions.beri_akses_manajer = true (Mudir/Wakil Kepala
--      Sekolah yang diberi akses setara manajer unit).
--   Peran 'bendahara' SENGAJA tidak termasuk — bendahara bukan manajer unit,
--   izin/cutinya tetap diputus Kepala Sekolah seperti pegawai biasa.
--
-- Efeknya otomatis mengalir ke:
--   - kolom komputasi leave_requests_target_is_manager (dipakai frontend
--     untuk label "Wewenang" & menyaring antrean Approval), dan
--   - kebijakan RLS leave_update_sekolah / leave_update_yayasan (migrasi
--     0029) yang sudah memakai fungsi ini — tanpa perlu diubah lagi.
--
-- Non-destruktif & idempoten (CREATE OR REPLACE). Tanda tangan fungsi tidak
-- berubah, jadi computed column & policy yang memakainya tetap valid.
-- JALANKAN SETELAH migrasi 0067.
-- =====================================================================

create or replace function public.leave_target_is_manager(emp_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
    -- (1) Enum peran lama: manajer unit & Yayasan.
    exists (
      select 1
      from public.employees e
      join public.user_roles ur on ur.user_id = e.user_id
      where e.id = emp_id
        and ur.role in ('admin_sekolah', 'kepala_sekolah', 'admin_yayasan', 'hr')
    )
    -- (2) Peran dinamis (0054): manajer unit / akses penuh Yayasan.
    or exists (
      select 1
      from public.employees e
      join public.user_roles ur on ur.user_id = e.user_id
      join public.roles r on r.id = ur.role_id
      where e.id = emp_id
        and (r.tingkat_akses in ('manajer_unit', 'yayasan_penuh') or r.is_admin_yayasan)
    )
    -- (3) Jabatan diberi akses manajer (0040): Mudir / Wakil Kepala Sekolah.
    or exists (
      select 1
      from public.employees e
      join public.positions p on p.id = e.position_id
      where e.id = emp_id
        and coalesce(p.beri_akses_manajer, false)
    );
$$;

comment on function public.leave_target_is_manager(uuid) is
  'TRUE bila pemohon cuti/izin berperan manajer unit (Kepala Sekolah/Admin Sekolah/Mudir/Waka) atau Yayasan — enum lama, peran dinamis (tingkat_akses), maupun jabatan beri_akses_manajer. Pengajuannya wajib disetujui Yayasan, bukan Kepala Sekolah.';
