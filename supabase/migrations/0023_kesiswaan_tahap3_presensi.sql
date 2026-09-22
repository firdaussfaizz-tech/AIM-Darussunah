-- =====================================================================
-- MODUL KESISWAAN — TAHAP 3: Presensi Siswa + notifikasi email ortu.
--
-- Presensi dicatat oleh Wali Kelas (guru) untuk rombel yang diampunya
-- SENDIRI (bukan hanya Admin Yayasan/HR/Admin Sekolah/Kepala Sekolah
-- seperti tabel Kesiswaan lain) — ini tabel PERTAMA di modul Kesiswaan
-- yang memberi akses TULIS ke Wali Kelas biasa, sesuai keputusan scoping
-- awal ("Wali Kelas login sendiri"). Wali Kelas login memakai akun
-- pegawai yang SUDAH ADA (tidak perlu role baru) — akses ditentukan lewat
-- is_wali_kelas_of(rombel_id) yang sudah dibuat di migrasi Tahap 1.
--
-- Notifikasi ke orang tua (email_ortu di tabel siswa) dikirim otomatis
-- lewat database trigger (pola sama dengan 0015_email_notifications.sql)
-- HANYA saat status BUKAN 'hadir' (izin/sakit/alpa) — supaya ortu tidak
-- dibanjiri email tiap hari anaknya masuk sekolah seperti biasa.
--
-- Non-destruktif: hanya menambah tabel, tipe, fungsi & trigger baru.
-- =====================================================================

create type presensi_siswa_status_enum as enum ('hadir', 'izin', 'sakit', 'alpa');

create table public.presensi_siswa (
  id uuid primary key default gen_random_uuid(),
  siswa_id uuid not null references public.siswa(id) on delete cascade,
  rombel_id uuid not null references public.rombel(id) on delete cascade,
  tanggal date not null,
  status presensi_siswa_status_enum not null default 'hadir',
  keterangan text,
  dicatat_oleh uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (siswa_id, tanggal)
);

create index presensi_siswa_rombel_tanggal_idx on public.presensi_siswa (rombel_id, tanggal);
create index presensi_siswa_siswa_id_idx on public.presensi_siswa (siswa_id);

-- public.set_updated_at() sudah ada sejak 0001_init_hr_schema.sql — dipakai
-- ulang di sini, tidak perlu bikin fungsi baru yang isinya sama persis.
create trigger trg_presensi_siswa_updated_at
  before update on public.presensi_siswa
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- RLS — baca & tulis: Admin Yayasan/HR (semua), Admin Sekolah/Kepala
-- Sekolah (unit sendiri lewat has_school_access), ATAU Wali Kelas dari
-- rombel tsb (is_wali_kelas_of, dibuat di migrasi 0022).
-- ---------------------------------------------------------------------
alter table public.presensi_siswa enable row level security;

create policy presensi_siswa_select on public.presensi_siswa for select using (
  public.is_yayasan_admin() or public.has_school_access(public.rombel_school_id(rombel_id)) or public.is_wali_kelas_of(rombel_id)
);
create policy presensi_siswa_write on public.presensi_siswa for all
  using (public.is_yayasan_admin() or public.has_school_access(public.rombel_school_id(rombel_id)) or public.is_wali_kelas_of(rombel_id))
  with check (public.is_yayasan_admin() or public.has_school_access(public.rombel_school_id(rombel_id)) or public.is_wali_kelas_of(rombel_id));

-- ---------------------------------------------------------------------
-- Notifikasi email ke orang tua saat siswa izin/sakit/alpa. Terkirim
-- saat baris baru dibuat langsung dengan status bukan 'hadir', ATAU saat
-- status baris yang sudah ada diubah ke izin/sakit/alpa (mis. dikoreksi
-- dari hadir). TIDAK terkirim ulang kalau status tidak berubah.
-- ---------------------------------------------------------------------
create or replace function public.fn_notify_presensi_siswa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_nama text;
  v_status_label text;
  v_html text;
begin
  if new.status = 'hadir' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  select nama_lengkap, email_ortu into v_nama, v_email from public.siswa where id = new.siswa_id;
  if v_email is null or v_email = '' then
    return new; -- orang tua belum mengisi email notifikasi
  end if;

  v_status_label := case new.status when 'izin' then 'Izin' when 'sakit' then 'Sakit' when 'alpa' then 'Tanpa Keterangan (Alpa)' else new.status::text end;

  v_html := format(
    '<p>Kami informasikan bahwa <b>%s</b> tercatat <b>%s</b> pada tanggal %s.</p>%s<p>Email ini dikirim otomatis oleh sistem SIMPEG Yayasan.</p>',
    coalesce(v_nama, '-'), v_status_label, new.tanggal,
    case when new.keterangan is not null and new.keterangan <> '' then format('<p>Keterangan: %s</p>', new.keterangan) else '' end
  );

  perform public.fn_send_email(v_email, format('Info Presensi — %s (%s)', coalesce(v_nama, ''), v_status_label), v_html);
  return new;
end;
$$;

drop trigger if exists trg_notify_presensi_siswa on public.presensi_siswa;
create trigger trg_notify_presensi_siswa
  after insert or update of status on public.presensi_siswa
  for each row execute function public.fn_notify_presensi_siswa();
