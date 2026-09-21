-- Scaffold notifikasi email (Roadmap B Otomasi #4 — keputusan pengguna:
-- "Pakai email dulu saja", belum WhatsApp). Dikirim lewat Resend
-- (https://resend.com) memakai ekstensi pg_net, LANGSUNG dari database
-- trigger — TIDAK memakai Supabase Edge Function, supaya tidak perlu
-- Supabase CLI/terminal untuk deploy (sesuai keterbatasan pengguna: tidak
-- ada environment development lokal). Pengaturan (API key, alamat
-- pengirim) diisi lewat halaman "Notifikasi Email" di aplikasi (khusus
-- Admin Yayasan/HR) setelah migrasi ini dijalankan.
--
-- Titik pemicu (trigger points):
--   1. Cuti/izin diajukan       -> email ke Admin Yayasan/HR + Kepala
--                                   Sekolah/Admin Sekolah unit pegawai.
--   2. Cuti/izin disetujui/ditolak -> email ke pegawai pengaju.
--   3. Slip gaji terbit (payroll_runs.status -> 'final') -> email ke
--      setiap pegawai pada periode tersebut.
--
-- Non-destruktif: tabel & trigger baru, tidak mengubah tabel yang ada.
-- Kegagalan kirim email TIDAK PERNAH menggagalkan transaksi utama
-- (pengajuan cuti/persetujuan/finalisasi tetap tersimpan) — lihat blok
-- exception di fn_send_email.

create extension if not exists pg_net;

-- Pengaturan notifikasi email — baris tunggal (id selalu 1), diisi lewat
-- halaman "Notifikasi Email" di aplikasi. RLS dibatasi HANYA Admin
-- Yayasan/HR yang boleh membaca/mengubah, karena berisi API key.
create table if not exists public.app_settings (
  id integer primary key default 1 check (id = 1),
  resend_api_key text,
  notif_from_email text,
  notif_from_name text default 'SIMPEG Yayasan',
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

drop policy if exists app_settings_select on public.app_settings;
create policy app_settings_select on public.app_settings for select using (public.is_yayasan_admin());
drop policy if exists app_settings_write on public.app_settings;
create policy app_settings_write on public.app_settings for all using (public.is_yayasan_admin()) with check (public.is_yayasan_admin());

-- Fungsi pengirim email generik lewat Resend API (https://resend.com/docs/api-reference/emails/send-email).
-- security definer supaya bisa membaca app_settings (dibatasi RLS admin-only
-- di atas) dan dipanggil dari trigger tabel manapun tanpa terhalang RLS.
create or replace function public.fn_send_email(p_to text, p_subject text, p_html text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_from_email text;
  v_from_name text;
  v_from text;
begin
  if p_to is null or p_to = '' then
    return;
  end if;

  select resend_api_key, notif_from_email, notif_from_name
    into v_key, v_from_email, v_from_name
  from public.app_settings where id = 1;

  if v_key is null or v_key = '' or v_from_email is null or v_from_email = '' then
    return; -- belum dikonfigurasi lewat halaman Notifikasi Email — diamkan saja
  end if;

  v_from := coalesce(v_from_name, 'SIMPEG Yayasan') || ' <' || v_from_email || '>';

  perform net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'Content-Type', 'application/json'),
    body := jsonb_build_object('from', v_from, 'to', jsonb_build_array(p_to), 'subject', p_subject, 'html', p_html)
  );
exception when others then
  -- Kegagalan kirim email (mis. API key salah, Resend sedang down) TIDAK
  -- BOLEH menggagalkan transaksi utama yang memicunya.
  null;
end;
$$;

-- RPC untuk tombol "Kirim Email Uji Coba" di halaman Notifikasi Email.
create or replace function public.test_send_notification(p_to text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_yayasan_admin() then
    raise exception 'Hanya Admin Yayasan/HR yang dapat mengirim email uji coba.';
  end if;
  perform public.fn_send_email(
    p_to,
    'Uji Coba Notifikasi Email — SIMPEG Yayasan',
    '<p>Ini email uji coba dari SIMPEG Yayasan. Jika Anda menerima email ini, pengaturan notifikasi email sudah berfungsi dengan benar.</p>'
  );
end;
$$;
grant execute on function public.test_send_notification(text) to authenticated;

-- ---------------------------------------------------------------------
-- 1. Cuti/izin diajukan -> Admin Yayasan/HR + Kepala Sekolah/Admin
--    Sekolah unit pegawai yang mengajukan.
-- ---------------------------------------------------------------------
create or replace function public.fn_notify_cuti_diajukan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp_nama text;
  v_emp_school_id uuid;
  v_leave_type_nama text;
  v_html text;
  r record;
begin
  select nama, school_id into v_emp_nama, v_emp_school_id from public.employees where id = new.employee_id;
  select nama into v_leave_type_nama from public.leave_types where id = new.leave_type_id;

  v_html := format(
    '<p>Pengajuan %s baru dari <b>%s</b>.</p><p>Periode: %s s/d %s (%s hari)</p><p>Alasan: %s</p><p>Silakan tinjau di aplikasi SIMPEG Yayasan, menu Cuti.</p>',
    coalesce(v_leave_type_nama, 'cuti/izin'), coalesce(v_emp_nama, '-'), new.tanggal_mulai, new.tanggal_selesai, coalesce(new.jumlah_hari::text, '-'), coalesce(new.alasan, '-')
  );

  for r in
    select distinct p.email
    from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    where p.email is not null and p.email <> ''
      and (
        ur.role in ('admin_yayasan', 'hr')
        or (ur.role in ('admin_sekolah', 'kepala_sekolah') and ur.school_id = v_emp_school_id)
      )
  loop
    perform public.fn_send_email(r.email, 'Pengajuan Cuti/Izin Baru — ' || coalesce(v_emp_nama, ''), v_html);
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_notify_cuti_diajukan on public.leave_requests;
create trigger trg_notify_cuti_diajukan
  after insert on public.leave_requests
  for each row execute function public.fn_notify_cuti_diajukan();

-- ---------------------------------------------------------------------
-- 2. Cuti/izin disetujui/ditolak -> pegawai pengaju (jika akun login
--    pegawai tersebut sudah tertaut & punya email).
-- ---------------------------------------------------------------------
create or replace function public.fn_notify_cuti_keputusan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_leave_type_nama text;
  v_html text;
  v_status_label text;
begin
  if new.status is distinct from old.status and new.status in ('disetujui', 'ditolak') then
    select p.email into v_email
    from public.employees e
    join public.profiles p on p.id = e.user_id
    where e.id = new.employee_id;

    if v_email is null or v_email = '' then
      return new; -- pegawai belum tertaut akun login / belum punya email tercatat
    end if;

    select nama into v_leave_type_nama from public.leave_types where id = new.leave_type_id;
    v_status_label := case when new.status = 'disetujui' then 'Disetujui' else 'Ditolak' end;

    v_html := format(
      '<p>Pengajuan %s Anda (%s s/d %s) telah <b>%s</b>.</p><p>Silakan cek rincian di aplikasi SIMPEG Yayasan, menu Cuti Saya.</p>',
      coalesce(v_leave_type_nama, 'cuti/izin'), new.tanggal_mulai, new.tanggal_selesai, v_status_label
    );

    perform public.fn_send_email(v_email, 'Pengajuan Cuti/Izin Anda ' || v_status_label, v_html);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_cuti_keputusan on public.leave_requests;
create trigger trg_notify_cuti_keputusan
  after update of status on public.leave_requests
  for each row execute function public.fn_notify_cuti_keputusan();

-- ---------------------------------------------------------------------
-- 3. Slip gaji terbit (payroll_runs.status berubah menjadi 'final') ->
--    setiap pegawai pada periode tersebut (jika akun login sudah tertaut).
-- ---------------------------------------------------------------------
create or replace function public.fn_notify_slip_gaji_terbit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_periode text;
  v_nama_bulan text[] := array['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
begin
  if new.status is distinct from old.status and new.status = 'final' then
    v_periode := v_nama_bulan[new.periode_bulan] || ' ' || new.periode_tahun;

    for r in
      select p.email, e.nama
      from public.payroll_details pd
      join public.employees e on e.id = pd.employee_id
      join public.profiles p on p.id = e.user_id
      where pd.payroll_run_id = new.id and p.email is not null and p.email <> ''
    loop
      perform public.fn_send_email(
        r.email,
        'Slip Gaji ' || v_periode || ' Sudah Terbit',
        format('<p>Slip gaji periode <b>%s</b> atas nama %s sudah dapat dilihat di aplikasi SIMPEG Yayasan, menu Slip Gaji.</p>', v_periode, coalesce(r.nama, ''))
      );
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_slip_gaji_terbit on public.payroll_runs;
create trigger trg_notify_slip_gaji_terbit
  after update of status on public.payroll_runs
  for each row execute function public.fn_notify_slip_gaji_terbit();
