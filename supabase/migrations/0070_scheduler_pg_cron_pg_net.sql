-- =====================================================================
-- FONDASI OTOMASI TERJADWAL — pg_cron + pg_net
-- (Rekomendasi Asesmen ERP/HRIS #2).
--
-- Mengaktifkan penjadwal tugas latar di dalam Postgres (pg_cron) dan
-- kemampuan memanggil HTTP dari database (pg_net) — membuka otomasi
-- terjadwal TANPA menambah server/vendor baru. Dengan ini, otomasi yang
-- selama ini "tombol manual" bisa dijalankan terjadwal (mis. pengingat
-- tunggakan SPP, pengingat kontrak H-30, rekalkulasi malam hari).
--
-- PENTING — langkah di Supabase sebelum/sesudah menjalankan file ini:
--   1. Aktifkan ekstensi lewat Dashboard > Database > Extensions:
--      cari "pg_cron" lalu enable, dan "pg_net" lalu enable. (Perintah
--      CREATE EXTENSION di bawah juga mencoba mengaktifkannya; bila gagal
--      karena izin, pakai toggle Dashboard tersebut.)
--   2. pg_cron berjalan di database "postgres". Job dijalankan oleh peran
--      postgres. Simpan RAHASIA (mis. API key Brevo) di app_settings /
--      Vault, JANGAN ditulis langsung di definisi job.
--
-- File ini NON-DESTRUKTIF & IDEMPOTEN. Ia hanya memasang:
--   (a) kedua ekstensi,
--   (b) tabel + fungsi "heartbeat" untuk MEMVERIFIKASI scheduler hidup,
--   (c) satu job harian heartbeat (aman, tanpa efek samping),
--   (d) TEMPLATE job nyata dalam bentuk KOMENTAR (tidak aktif) — aktifkan
--       sendiri setelah Brevo/Edge Function siap.
--
-- JALANKAN SETELAH migrasi 0069.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Ekstensi. (Bila error izin, aktifkan via Dashboard > Extensions.)
-- ---------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------------------------------------------------------------------
-- 2. Heartbeat — bukti pg_cron benar-benar berjalan. Cek kapan saja:
--      select * from public.cron_heartbeat;
--    Bila last_run ter-update tiap hari, scheduler sehat.
-- ---------------------------------------------------------------------
create table if not exists public.cron_heartbeat (
  id smallint primary key default 1,
  last_run timestamptz,
  catatan text,
  constraint cron_heartbeat_tunggal check (id = 1)
);

create or replace function public.cron_heartbeat_tick()
returns void language sql security definer set search_path = public as $$
  insert into public.cron_heartbeat (id, last_run, catatan)
  values (1, now(), 'pg_cron aktif')
  on conflict (id) do update set last_run = excluded.last_run, catatan = excluded.catatan;
$$;

-- ---------------------------------------------------------------------
-- 3. Jadwalkan heartbeat harian (01:05). Guard: hanya bila pg_cron ada,
--    dan hapus dulu job senama agar idempoten.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regnamespace('cron') is not null then
    if exists (select 1 from cron.job where jobname = 'simpeg_heartbeat') then
      perform cron.unschedule('simpeg_heartbeat');
    end if;
    perform cron.schedule('simpeg_heartbeat', '5 1 * * *', $cron$ select public.cron_heartbeat_tick(); $cron$);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 4. TEMPLATE JOB NYATA (TIDAK AKTIF — hapus komentar untuk mengaktifkan).
--
-- Cara kerja umum: cron.schedule(nama, jadwal_cron, perintah_sql). Untuk
-- mengirim email/HTTP, panggil net.http_post (pg_net). Jadwal dalam UTC
-- (Supabase memakai UTC) — WIB = UTC+7, jadi "0 23 * * *" = 06:00 WIB.
--
-- a) PENGINGAT TUNGGAKAN SPP (harian 06:00 WIB) via Edge Function:
--    select cron.schedule(
--      'spp_reminder_harian', '0 23 * * *',
--      $cron$
--        select net.http_post(
--          url     := 'https://<project-ref>.functions.supabase.co/spp-reminder',
--          headers := jsonb_build_object(
--                       'Content-Type','application/json',
--                       'Authorization','Bearer ' || (select service_key from public.app_settings where id = 1)
--                     ),
--          body    := '{}'::jsonb
--        );
--      $cron$
--    );
--
-- b) PENGINGAT KONTRAK/DOKUMEN H-30 (harian 06:00 WIB): sama polanya,
--    arahkan ke Edge Function yang memindai employment_contracts /
--    employee_documents yang jatuh tempo 30 hari lagi lalu kirim email.
--
-- c) REKALKULASI MALAM (mis. 02:00 WIB tiap hari): panggil fungsi/Edge
--    Function yang menghitung ulang Indeks Kehadiran / realisasi KPI,
--    lalu hasilnya tetap dikonfirmasi manusia di layar (sesuai prinsip
--    "otomasi = semi-otomatis + konfirmasi" pada Peta Integrasi).
--
-- Melihat daftar job & riwayatnya:
--    select jobid, jobname, schedule, active from cron.job;
--    select * from cron.job_run_details order by start_time desc limit 20;
-- Menonaktifkan sebuah job:
--    select cron.unschedule('<nama_job>');
-- ---------------------------------------------------------------------
