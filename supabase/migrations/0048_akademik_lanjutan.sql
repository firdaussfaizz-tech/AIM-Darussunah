-- =====================================================================
-- ACADEMIC LANJUTAN — Kalender Akademik, PPDB, kehadiran mengajar (KPI),
-- dan RPC kehadiran rombel untuk Jurnal KBM.
--
--   1. kalender_akademik        — agenda (UTS/UAS/rapat/kegiatan/pembagian
--                                  rapor), per unit atau seluruh yayasan.
--   2. ppdb_pendaftar           — Penerimaan Peserta Didik Baru; nomor
--                                  pendaftaran otomatis; RPC
--                                  ppdb_jadikan_siswa() memindahkan pendaftar
--                                  diterima ke Data Siswa (+ rombel).
--   3. rombel_kehadiran_hari()  — jumlah siswa & hadir per rombel per tanggal
--                                  (dari Presensi Siswa) untuk mengisi Jurnal
--                                  KBM otomatis; bisa dipanggil guru pengampu.
--   4. Sumber KPI Lembaga baru `kehadiran_mengajar` — rasio sesi mengajar
--      terlaksana (hadir/tugas dinas) dari Jurnal KBM.
--
-- Idempoten & non-destruktif. JALANKAN SETELAH 0047.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. KALENDER AKADEMIK
-- ---------------------------------------------------------------------
create table if not exists public.kalender_akademik (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade,   -- null = seluruh yayasan
  tahun_ajaran_id uuid references public.tahun_ajaran(id) on delete set null,
  judul text not null,
  jenis text not null default 'kegiatan'
    check (jenis in ('kegiatan', 'ujian', 'rapat', 'pembagian_rapor', 'libur', 'lainnya')),
  tanggal_mulai date not null,
  tanggal_selesai date,
  keterangan text,
  created_at timestamptz not null default now(),
  check (tanggal_selesai is null or tanggal_selesai >= tanggal_mulai)
);
create index if not exists kalender_akademik_school_idx on public.kalender_akademik (school_id);
create index if not exists kalender_akademik_tanggal_idx on public.kalender_akademik (tanggal_mulai);

alter table public.kalender_akademik enable row level security;
drop policy if exists kalender_akademik_select on public.kalender_akademik;
create policy kalender_akademik_select on public.kalender_akademik for select using (auth.uid() is not null);
drop policy if exists kalender_akademik_write on public.kalender_akademik;
create policy kalender_akademik_write on public.kalender_akademik for all using (
  (school_id is null and public.is_yayasan_admin())
  or (school_id is not null and (public.is_yayasan_admin() or public.is_school_manager(school_id)))
) with check (
  (school_id is null and public.is_yayasan_admin())
  or (school_id is not null and (public.is_yayasan_admin() or public.is_school_manager(school_id)))
);

-- ---------------------------------------------------------------------
-- 2. PPDB
-- ---------------------------------------------------------------------
create table if not exists public.ppdb_pendaftar (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  tahun_ajaran_id uuid references public.tahun_ajaran(id) on delete set null,
  no_pendaftaran text,
  nama_lengkap text not null,
  jenis_kelamin jenis_kelamin_enum,
  tempat_lahir text,
  tanggal_lahir date,
  nik text,
  nisn text,
  agama text,
  alamat text,
  asal_sekolah text,
  nama_ayah text,
  nama_ibu text,
  no_hp text,
  email_ortu text,
  jalur text not null default 'Reguler',
  tingkat_tujuan text,
  nilai_seleksi numeric(6,2),
  status text not null default 'daftar'
    check (status in ('daftar', 'verifikasi', 'diterima', 'cadangan', 'ditolak', 'mengundurkan_diri')),
  catatan text,
  siswa_id uuid references public.siswa(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ppdb_school_idx on public.ppdb_pendaftar (school_id);
create index if not exists ppdb_status_idx on public.ppdb_pendaftar (status);

-- Nomor pendaftaran otomatis per unit + tahun (memakai doc_counter 0045).
create or replace function public.ppdb_set_nomor()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_no int; v_th int;
begin
  if tg_op = 'INSERT' and (new.no_pendaftaran is null or new.no_pendaftaran = '') then
    v_th := extract(year from now())::int;
    insert into public.doc_counter (school_id, kode, tahun, last_no)
    values (new.school_id, 'PPDB', v_th, 1)
    on conflict (school_id, kode, tahun) do update set last_no = doc_counter.last_no + 1
    returning last_no into v_no;
    new.no_pendaftaran := 'PPDB-' || v_th::text || '-' || lpad(v_no::text, 4, '0');
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists ppdb_set_nomor_trg on public.ppdb_pendaftar;
create trigger ppdb_set_nomor_trg
  before insert or update on public.ppdb_pendaftar
  for each row execute function public.ppdb_set_nomor();

alter table public.ppdb_pendaftar enable row level security;
drop policy if exists ppdb_select on public.ppdb_pendaftar;
create policy ppdb_select on public.ppdb_pendaftar for select using (
  public.is_yayasan_admin() or public.has_school_access(school_id)
);
drop policy if exists ppdb_write on public.ppdb_pendaftar;
create policy ppdb_write on public.ppdb_pendaftar for all using (
  public.is_yayasan_admin() or public.is_school_manager(school_id)
) with check (
  public.is_yayasan_admin() or public.is_school_manager(school_id)
);

-- Pindahkan pendaftar diterima → Data Siswa (+ masuk rombel bila dipilih).
create or replace function public.ppdb_jadikan_siswa(p_pendaftar_id uuid, p_rombel_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  p public.ppdb_pendaftar%rowtype;
  v_siswa uuid;
  v_ta uuid;
  v_rombel_school uuid;
begin
  select * into p from public.ppdb_pendaftar where id = p_pendaftar_id;
  if p.id is null then raise exception 'Pendaftar tidak ditemukan.'; end if;
  if not (public.is_yayasan_admin() or public.is_school_manager(p.school_id)) then
    raise exception 'Tidak berwenang.' using errcode = '42501';
  end if;
  if p.siswa_id is not null then return p.siswa_id; end if;
  if p.status <> 'diterima' then
    raise exception 'Hanya pendaftar berstatus Diterima yang dapat dijadikan siswa.';
  end if;
  if coalesce(p.nisn, '') <> '' and exists (select 1 from public.siswa where nisn = p.nisn) then
    raise exception 'NISN % sudah terdaftar di Data Siswa. Periksa data siswa tersebut atau kosongkan NISN pendaftar.', p.nisn;
  end if;

  insert into public.siswa (school_id, nik, nisn, nama_lengkap, jenis_kelamin, tempat_lahir, tanggal_lahir,
                            agama, alamat, nama_ayah, nama_ibu, no_hp_ayah, email_ortu, status)
  values (p.school_id, p.nik, p.nisn, p.nama_lengkap, p.jenis_kelamin, p.tempat_lahir, p.tanggal_lahir,
          p.agama, p.alamat, p.nama_ayah, p.nama_ibu, p.no_hp, p.email_ortu, 'aktif')
  returning id into v_siswa;

  if p_rombel_id is not null then
    select school_id, tahun_ajaran_id into v_rombel_school, v_ta from public.rombel where id = p_rombel_id;
    if v_rombel_school is distinct from p.school_id then
      raise exception 'Rombel bukan milik unit pendaftar.';
    end if;
    insert into public.riwayat_siswa (siswa_id, rombel_id, tahun_ajaran_id, status, tanggal_masuk, keterangan)
    values (v_siswa, p_rombel_id, v_ta, 'aktif', current_date, 'Diterima melalui PPDB ' || coalesce(p.no_pendaftaran, ''));
  end if;

  update public.ppdb_pendaftar set status = 'diterima', siswa_id = v_siswa where id = p.id;
  return v_siswa;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Kehadiran siswa per rombel per tanggal (untuk Jurnal KBM otomatis)
-- ---------------------------------------------------------------------
create or replace function public.rombel_kehadiran_hari(p_rombel_id uuid, p_tanggal date)
returns table (jml_siswa int, jml_hadir int, tercatat int)
language plpgsql stable security definer set search_path = public as $$
declare v_school uuid; v_wali uuid;
begin
  select school_id, wali_kelas_employee_id into v_school, v_wali from public.rombel where id = p_rombel_id;
  if v_school is null then return; end if;
  if not (public.is_yayasan_admin() or public.has_school_access(v_school)
          or public.is_pengajar_of_school(v_school) or v_wali = public.current_employee_id()) then
    raise exception 'Tidak berwenang.' using errcode = '42501';
  end if;
  return query select
    (select count(*)::int from public.riwayat_siswa rs where rs.rombel_id = p_rombel_id and rs.status = 'aktif'),
    (select count(*)::int from public.presensi_siswa ps where ps.rombel_id = p_rombel_id and ps.tanggal = p_tanggal and ps.status = 'hadir'),
    (select count(*)::int from public.presensi_siswa ps where ps.rombel_id = p_rombel_id and ps.tanggal = p_tanggal);
end;
$$;

-- ---------------------------------------------------------------------
-- 4. KPI Lembaga — sumber otomatis baru: kehadiran_mengajar
--    (definisi ulang fungsi 0034 dengan satu cabang tambahan; cabang lain
--     identik dengan aslinya).
-- ---------------------------------------------------------------------
alter table public.kpi_lembaga_indikator drop constraint if exists kpi_lembaga_indikator_sumber_otomatis_check;
alter table public.kpi_lembaga_indikator
  add constraint kpi_lembaga_indikator_sumber_otomatis_check
  check (sumber_otomatis in ('manual', 'kehadiran_pegawai', 'kehadiran_siswa', 'tunggakan_spp', 'rata_nilai_kinerja', 'kehadiran_mengajar'));

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

  else
    -- 'kehadiran_pegawai' dihitung di aplikasi; 'manual' tak punya sumber.
    raise exception 'Sumber % tidak dihitung lewat RPC ini', v_sumber;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. KKM dapat dibaca guru pengampu (untuk status Tuntas di Nilai & Rapor)
-- ---------------------------------------------------------------------
drop policy if exists kurikulum_select on public.kurikulum_kkm;
create policy kurikulum_select on public.kurikulum_kkm for select using (
  public.is_yayasan_admin() or public.has_school_access(school_id)
  or public.is_wali_kelas_of_school(school_id) or public.is_pengajar_of_school(school_id)
);
