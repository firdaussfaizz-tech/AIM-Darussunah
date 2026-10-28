-- =====================================================================
-- 0094 — BEBAN KERJA: komponen BIMBINGAN KONSELING (Guru BK & Koordinator BK)
--
-- Guru BK tidak dihitung dari JP tatap muka reguler, melainkan dari
-- jumlah peserta didik yang dibimbing. Mengacu Permendikbud No. 111/2014
-- (Bimbingan dan Konseling pada Dikdasmen): 1 Guru BK/Konselor mengampu
-- paling sedikit 150 peserta didik, dan membimbing 150 peserta didik
-- diekuivalensikan dengan pemenuhan 24 jam tatap muka (JTM).
--
-- Ekuivalensi JP BK = (siswa_bimbingan / bk_rasio_siswa) x bk_jp_penuh.
-- Koordinator BK memperoleh tambahan ekuivalensi bk_koordinator_jp JP.
-- Konversi ke jam memakai durasi 1 JP jenjang unit (lihat workload.js).
--
-- Non-destruktif & idempoten; aman atas drift skema (tabel beban kerja
-- historisnya dibuat langsung di Supabase tanpa file migrasi).
-- =====================================================================

do $$
begin
  if to_regclass('public.employee_beban_kerja') is not null then
    alter table public.employee_beban_kerja
      add column if not exists siswa_bimbingan integer not null default 0;
    alter table public.employee_beban_kerja
      add column if not exists koordinator_bk boolean not null default false;

    comment on column public.employee_beban_kerja.siswa_bimbingan is
      'Jumlah peserta didik yang dibimbing Guru BK/Konselor. Dasar ekuivalensi beban kerja BK (Permendikbud 111/2014: 150 siswa = 24 JTM). 0 untuk non-Guru BK.';
    comment on column public.employee_beban_kerja.koordinator_bk is
      'true bila pegawai menjabat Koordinator BK — menambah ekuivalensi bk_koordinator_jp JP pada beban kerja.';
  end if;

  if to_regclass('public.beban_kerja_settings') is not null then
    alter table public.beban_kerja_settings
      add column if not exists bk_rasio_siswa numeric not null default 150;
    alter table public.beban_kerja_settings
      add column if not exists bk_jp_penuh numeric not null default 24;
    alter table public.beban_kerja_settings
      add column if not exists bk_koordinator_jp numeric not null default 2;

    comment on column public.beban_kerja_settings.bk_rasio_siswa is
      'Jumlah siswa bimbingan yang setara beban penuh Guru BK (default 150, Permendikbud 111/2014).';
    comment on column public.beban_kerja_settings.bk_jp_penuh is
      'Ekuivalensi JP untuk rasio siswa bimbingan penuh (default 24 JTM).';
    comment on column public.beban_kerja_settings.bk_koordinator_jp is
      'Tambahan ekuivalensi JP untuk Koordinator BK (default 2; set 0 bila tidak diberlakukan).';
  end if;
end $$;

notify pgrst, 'reload schema';
