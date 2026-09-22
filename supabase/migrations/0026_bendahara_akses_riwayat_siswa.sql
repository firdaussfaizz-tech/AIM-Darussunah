-- =====================================================================
-- PERBAIKAN — Bendahara belum bisa membaca riwayat_siswa & siswa.
--
-- Migrasi 0024 (SPP) memberi Bendahara akses LINTAS UNIT ke spp_tarif,
-- spp_tagihan, dan spp_pembayaran lewat is_bendahara() — tapi lupa
-- menambahkannya ke riwayat_siswa_select dan siswa_select (dibuat di
-- 0022, SUDAH BERJALAN di database produksi). Kedua tabel ini adalah
-- dependensi langsung fitur "Generate Tagihan Bulanan" (SppList.jsx),
-- yang perlu membaca siswa aktif + rombel/tingkatnya lintas seluruh unit
-- sekolah untuk Bendahara yang TIDAK punya baris user_roles per-sekolah
-- (has_school_access() akan selalu bernilai false untuknya).
--
-- Tanpa perbaikan ini, tombol "Generate Tagihan Bulanan" akan terlihat
-- berhasil tapi diam-diam menghasilkan 0 tagihan untuk Bendahara lintas
-- unit, dan nama/unit siswa di daftar tagihan SPP akan tampil kosong.
--
-- CREATE POLICY tidak punya "OR REPLACE" — kita DROP dulu baru buat ulang
-- dengan isi yang sama ditambah klausa is_bendahara(). Non-destruktif:
-- hanya mengganti definisi kebijakan RLS, tidak mengubah data apa pun.
-- =====================================================================

drop policy if exists riwayat_siswa_select on public.riwayat_siswa;
create policy riwayat_siswa_select on public.riwayat_siswa for select using (
  public.is_yayasan_admin() or public.is_bendahara() or public.has_school_access(public.rombel_school_id(rombel_id)) or public.is_wali_kelas_of(rombel_id)
);

drop policy if exists siswa_select on public.siswa;
create policy siswa_select on public.siswa for select using (
  public.is_yayasan_admin() or public.is_bendahara() or public.has_school_access(school_id) or public.is_wali_kelas_of_siswa(id)
);
