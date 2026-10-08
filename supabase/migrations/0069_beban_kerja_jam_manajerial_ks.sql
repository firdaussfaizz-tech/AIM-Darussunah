-- =====================================================================
-- KOLOM "Jam Manajerial Kepala Sekolah" pada Analisis Beban Kerja.
--
-- Mengakomodasi Kepmendikdasmen No. 221/P/2025 (Juknis Pemenuhan Beban
-- Kerja Guru dan Kepala Sekolah): tugas Kepala Sekolah — Manajerial,
-- Pengembangan Kewirausahaan, dan Supervisi guru & tenaga kependidikan —
-- diekuivalensikan dengan pemenuhan 24 jam tatap muka (JTM) dan dihitung
-- sebagai bagian dari beban kerja 37 jam 30 menit/minggu, TANPA kewajiban
-- mengajar tatap muka reguler. Kolom ini menyimpan jam tugas tersebut
-- per minggu sehingga ikut diperhitungkan di mesin Analisis Beban Kerja
-- (lihat src/lib/workload.js: hitungBebanKerja → jamManajerial).
--
-- Nilai dalam JAM (60 menit) per minggu. Default 0 (hanya diisi untuk
-- Kepala Sekolah). Non-destruktif & idempoten; aman atas drift skema —
-- hanya dijalankan bila tabel employee_beban_kerja memang ada (tabel ini
-- historisnya dibuat langsung di Supabase tanpa file migrasi).
--
-- JALANKAN SETELAH migrasi 0068.
-- =====================================================================

do $$
begin
  if to_regclass('public.employee_beban_kerja') is not null then
    alter table public.employee_beban_kerja
      add column if not exists jam_manajerial numeric not null default 0;

    comment on column public.employee_beban_kerja.jam_manajerial is
      'Jam Manajerial Kepala Sekolah per minggu (manajerial + pengembangan kewirausahaan + supervisi) sesuai Kepmendikdasmen No. 221/P/2025. Diekuivalensikan dengan pemenuhan 24 JTM; 0 untuk non-Kepala Sekolah.';
  end if;
end $$;
