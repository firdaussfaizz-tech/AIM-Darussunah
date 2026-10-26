-- =====================================================================
-- 0089 — KESISWAAN: PRESTASI SISWA (+ otomasi poin & integrasi KPI)
--
-- Permintaan: catat prestasi seluruh siswa, terotomasi & terintegrasi —
--   • tampil di profil siswa & rekap Dashboard Kesiswaan,
--   • poin otomatis dari tingkat + capaian (untuk analitik/piagam),
--   • menjadi SUMBER OTOMATIS realisasi KPI Lembaga ('prestasi_siswa').
--
-- Non-destruktif & idempoten.
-- =====================================================================

create table if not exists public.prestasi_siswa (
  id uuid primary key default gen_random_uuid(),
  siswa_id uuid not null references public.siswa(id) on delete cascade,
  tahun_ajaran_id uuid references public.tahun_ajaran(id) on delete set null,
  judul text not null,
  kategori text not null default 'akademik' check (kategori in ('akademik', 'non_akademik')),
  bidang text,
  tingkat text not null default 'sekolah'
    check (tingkat in ('sekolah', 'kecamatan', 'kabupaten', 'provinsi', 'nasional', 'internasional')),
  peringkat text,
  penyelenggara text,
  tanggal date,
  lokasi text,
  pembina text,
  deskripsi text,
  poin int not null default 0,
  dicatat_oleh uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists prestasi_siswa_siswa_idx on public.prestasi_siswa (siswa_id);
create index if not exists prestasi_siswa_ta_idx on public.prestasi_siswa (tahun_ajaran_id);
create index if not exists prestasi_siswa_tanggal_idx on public.prestasi_siswa (tanggal);

drop trigger if exists trg_prestasi_updated_at on public.prestasi_siswa;
create trigger trg_prestasi_updated_at
  before update on public.prestasi_siswa
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Poin otomatis = bobot tingkat × faktor capaian (bila poin tak diisi).
-- ---------------------------------------------------------------------
create or replace function public.fn_prestasi_poin()
returns trigger language plpgsql set search_path = public as $$
declare
  v_base int;
  v_factor numeric;
  v_p text;
begin
  v_base := case new.tingkat
    when 'sekolah' then 1 when 'kecamatan' then 2 when 'kabupaten' then 3
    when 'provinsi' then 5 when 'nasional' then 8 when 'internasional' then 13 else 1 end;
  v_p := lower(coalesce(new.peringkat, ''));
  v_factor := case
    when v_p like 'juara 1%' or v_p like '%emas%' or v_p like '%gold%' or v_p like 'medali emas%' or v_p like '%terbaik%' then 1.0
    when v_p like 'juara 2%' or v_p like '%perak%' or v_p like '%silver%' then 0.8
    when v_p like 'juara 3%' or v_p like '%perunggu%' or v_p like '%bronze%' then 0.6
    when v_p like 'harapan%' or v_p like '%finalis%' then 0.4
    when v_p = '' then 1.0
    else 0.3 end;
  -- Hitung otomatis saat INSERT atau bila poin tidak diisi (0/kosong);
  -- poin manual (>0) saat UPDATE dibiarkan.
  if tg_op = 'INSERT' or coalesce(new.poin, 0) = 0 then
    new.poin := greatest(1, round(v_base * v_factor))::int;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prestasi_poin on public.prestasi_siswa;
create trigger trg_prestasi_poin
  before insert or update on public.prestasi_siswa
  for each row execute function public.fn_prestasi_poin();

-- ---------------------------------------------------------------------
-- RLS — mengikuti pola akses data siswa (via siswa_school_id).
-- ---------------------------------------------------------------------
alter table public.prestasi_siswa enable row level security;

drop policy if exists prestasi_siswa_select on public.prestasi_siswa;
create policy prestasi_siswa_select on public.prestasi_siswa for select using (
  public.is_yayasan_admin() or public.has_school_access(public.siswa_school_id(siswa_id))
);
drop policy if exists prestasi_siswa_write on public.prestasi_siswa;
create policy prestasi_siswa_write on public.prestasi_siswa for all
  using (public.is_yayasan_admin() or public.is_school_manager(public.siswa_school_id(siswa_id)))
  with check (public.is_yayasan_admin() or public.is_school_manager(public.siswa_school_id(siswa_id)));

-- ---------------------------------------------------------------------
-- Integrasi KPI Lembaga: tambah sumber otomatis 'prestasi_siswa'.
-- Realisasi = jumlah prestasi pada rentang; total poin di catatan.
-- ---------------------------------------------------------------------
alter table public.kpi_lembaga_indikator drop constraint if exists kpi_lembaga_indikator_sumber_otomatis_check;
alter table public.kpi_lembaga_indikator
  add constraint kpi_lembaga_indikator_sumber_otomatis_check
  check (sumber_otomatis in ('manual', 'kehadiran_pegawai', 'kehadiran_siswa', 'tunggakan_spp', 'rata_nilai_kinerja', 'kehadiran_mengajar', 'prestasi_siswa'));

create or replace function public.kpi_hitung_otomatis(p_indikator_id uuid, p_d1 date, p_d2 date)
returns table (pembilang numeric, pembagi numeric, realisasi numeric, catatan text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_school uuid;
  v_sumber text;
  v_ta uuid;
  v_hadir numeric;
  v_total numeric;
  v_tagihan numeric;
  v_bayar numeric;
  v_avg numeric;
  v_n int;
begin
  select school_id, sumber_otomatis, tahun_ajaran_id
    into v_school, v_sumber, v_ta
  from public.kpi_lembaga_indikator where id = p_indikator_id;

  if v_school is null then
    raise exception 'Indikator tidak ditemukan';
  end if;
  if not (public.is_yayasan_admin() or public.is_school_manager(v_school)) then
    raise exception 'Tidak berwenang menghitung indikator ini';
  end if;

  if v_sumber = 'kehadiran_siswa' then
    if p_d1 is null or p_d2 is null then raise exception 'Rentang tanggal wajib diisi'; end if;
    select count(*) filter (where ps.status = 'hadir'), count(*)
      into v_hadir, v_total
    from public.presensi_siswa ps
    join public.siswa s on s.id = ps.siswa_id
    where s.school_id = v_school and ps.tanggal between p_d1 and p_d2;
    return query select v_hadir, v_total,
      case when coalesce(v_total, 0) > 0 then round(v_hadir / v_total * 100, 2) else null end,
      coalesce(v_total, 0)::text || ' baris presensi siswa';

  elsif v_sumber = 'kehadiran_mengajar' then
    if p_d1 is null or p_d2 is null then raise exception 'Rentang tanggal wajib diisi'; end if;
    select count(*) filter (where j.kehadiran_guru in ('hadir', 'tugas')), count(*)
      into v_hadir, v_total
    from public.jurnal_kbm j
    where j.school_id = v_school and j.tanggal between p_d1 and p_d2;
    return query select v_hadir, v_total,
      case when coalesce(v_total, 0) > 0 then round(v_hadir / v_total * 100, 2) else null end,
      coalesce(v_total, 0)::text || ' sesi mengajar (Jurnal KBM); terlaksana = hadir + tugas dinas';

  elsif v_sumber = 'tunggakan_spp' then
    if v_ta is null then raise exception 'Indikator belum punya Tahun Ajaran'; end if;
    select coalesce(sum(st.nominal_tagihan), 0)
      into v_tagihan
    from public.spp_tagihan st
    join public.siswa s on s.id = st.siswa_id
    where s.school_id = v_school and st.tahun_ajaran_id = v_ta;
    select coalesce(sum(sp.nominal_dibayar), 0)
      into v_bayar
    from public.spp_pembayaran sp
    join public.spp_tagihan st on st.id = sp.tagihan_id
    join public.siswa s on s.id = st.siswa_id
    where s.school_id = v_school and st.tahun_ajaran_id = v_ta;
    return query select
      greatest(0, v_tagihan - v_bayar)::numeric,
      v_tagihan,
      case when v_tagihan > 0 then round(greatest(0, v_tagihan - v_bayar) / v_tagihan * 100, 2) else null end,
      'Tunggakan = tagihan − dibayar (TA berjalan)';

  elsif v_sumber = 'rata_nilai_kinerja' then
    if v_ta is null then raise exception 'Indikator belum punya Tahun Ajaran'; end if;
    select avg(pr.nilai_akhir), count(*)
      into v_avg, v_n
    from public.performance_reviews pr
    join public.employees e on e.id = pr.employee_id
    join public.performance_periods pp on pp.id = pr.period_id
    where e.school_id = v_school and pp.tahun_ajaran_id = v_ta
      and pr.status = 'final' and pr.nilai_akhir is not null;
    if coalesce(v_n, 0) = 0 then
      return query select null::numeric, null::numeric, null::numeric, 'Belum ada penilaian final pada TA ini'::text;
    else
      return query select round(v_avg, 2), null::numeric, round(v_avg, 2), v_n::text || ' penilaian final';
    end if;

  elsif v_sumber = 'prestasi_siswa' then
    if p_d1 is null or p_d2 is null then raise exception 'Rentang tanggal wajib diisi'; end if;
    select count(*), coalesce(sum(pr.poin), 0)
      into v_n, v_avg
    from public.prestasi_siswa pr
    join public.siswa s on s.id = pr.siswa_id
    where s.school_id = v_school and pr.tanggal between p_d1 and p_d2;
    return query select v_n::numeric, null::numeric, v_n::numeric,
      v_n::text || ' prestasi (total poin ' || coalesce(v_avg, 0)::text || ')';

  else
    -- 'kehadiran_pegawai' dihitung di aplikasi; 'manual' tak punya sumber.
    raise exception 'Sumber % tidak dihitung lewat RPC ini', v_sumber;
  end if;
end;
$$;

notify pgrst, 'reload schema';
