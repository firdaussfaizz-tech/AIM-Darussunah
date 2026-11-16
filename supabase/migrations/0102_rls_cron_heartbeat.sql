-- 0102: aktifkan RLS pada cron_heartbeat.
-- Tanpa RLS, tabel di schema public dapat dibaca/ditulis siapa pun pemegang
-- anon key (via PostgREST). Isinya memang remeh (penanda jadwal), tetapi tetap
-- dikunci. Fungsi cron_heartbeat_tick() berjalan SECURITY DEFINER (sebagai
-- owner) sehingga tetap bisa menulis walau tak ada policy untuk klien.
alter table public.cron_heartbeat enable row level security;

-- Hanya Admin Yayasan yang boleh membaca (mis. untuk diagnosa penjadwal).
drop policy if exists cron_heartbeat_read on public.cron_heartbeat;
create policy cron_heartbeat_read on public.cron_heartbeat for select
  using (public.is_yayasan_admin());

notify pgrst, 'reload schema';
