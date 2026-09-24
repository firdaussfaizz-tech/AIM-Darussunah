-- =====================================================================
-- SKOR KINERJA PEGAWAI LEBIH OBJEKTIF & TERINTEGRASI (#4).
--
-- Nilai Akhir penilaian kinerja sudah otomatis (rata-rata skor KPI
-- berbobot), tetapi SKOR per indikator KPI masih diketik manajer —
-- bagian yang subjektif. Migrasi ini menandai tiap indikator KPI
-- (kpi_indicators) dengan SUMBER OTOMATIS opsional, sehingga skornya bisa
-- ditarik dari data operasional / KPI Lembaga lalu tinggal dikonfirmasi
-- manusia (prinsip "otomasi = semi-otomatis + konfirmasi", sama pola A13):
--   - 'kehadiran_pegawai' : skor = Indeks Kehadiran pegawai ybs pada
--                           periode (dihitung di aplikasi, memakai ulang
--                           mesin hitungIH — lihat src/lib/kpiAuto.js).
--   - 'kpi_lembaga_unit'  : skor = rata-rata capaian KPI Lembaga unit
--                           pegawai pada Tahun Ajaran periode (RPC di
--                           bawah).
--   - 'manual' (default)  : tetap diisi tangan.
--
-- Non-destruktif & idempoten. JALANKAN SETELAH 0051.
-- =====================================================================

-- 1. Penanda sumber otomatis pada indikator KPI penilaian pegawai.
alter table public.kpi_indicators
  add column if not exists sumber_otomatis text not null default 'manual';

alter table public.kpi_indicators drop constraint if exists kpi_indicators_sumber_otomatis_check;
alter table public.kpi_indicators
  add constraint kpi_indicators_sumber_otomatis_check
  check (sumber_otomatis in ('manual', 'kehadiran_pegawai', 'kpi_lembaga_unit'));

-- 2. RPC: skor KPI Lembaga unit (0-100) untuk satu sekolah + tahun ajaran.
--    Mengambil capaian TERMIN TERAKHIR tiap indikator aktif unit tsb pada
--    TA ybs, dirata-ratakan, dikali 100, dibatasi maksimum 100.
create or replace function public.kinerja_skor_kpi_lembaga_unit(p_school_id uuid, p_tahun_ajaran_id uuid)
returns numeric language plpgsql security definer stable set search_path = public as $$
declare
  v_skor numeric;
begin
  if p_school_id is null or p_tahun_ajaran_id is null then
    return null;
  end if;
  if not (public.is_yayasan_admin() or public.has_school_access(p_school_id)) then
    raise exception 'Tidak berwenang membaca KPI Lembaga unit ini.' using errcode = '42501';
  end if;

  select least(round(avg(latest.capaian) * 100, 2), 100)
    into v_skor
  from (
    select distinct on (k.id) p.capaian
    from public.kpi_lembaga_indikator k
    join public.kpi_lembaga_pengukuran p on p.indikator_id = k.id
    where k.school_id = p_school_id
      and k.tahun_ajaran_id = p_tahun_ajaran_id
      and p.capaian is not null
    order by k.id, p.termin_urut desc
  ) latest;

  return v_skor;
end;
$$;
