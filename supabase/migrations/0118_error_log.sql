-- 0118: Perekam error klien (error_log).
--
-- Menyimpan error yang terjadi saat pengguna memakai aplikasi, beserta konteks
-- peran/akun/halaman — untuk menemukan bug yang spesifik per peran. Ditulis
-- otomatis oleh src/lib/errorLog.js (window error, unhandledrejection, respons
-- Supabase 4xx/5xx, dan crash render React).

create table if not exists public.error_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  nama text,                 -- snapshot nama pengguna saat error
  peran text,                -- snapshot peran (bisa lebih dari satu, dipisah koma)
  school_id uuid references public.schools(id) on delete set null,
  route text,                -- path halaman saat error (window.location.pathname)
  kind text,                 -- window.error | unhandledrejection | http.4xx/5xx | react | supabase
  message text,
  stack text,
  detail jsonb,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists error_log_created_idx on public.error_log (created_at desc);
create index if not exists error_log_peran_idx on public.error_log (peran);
create index if not exists error_log_route_idx on public.error_log (route);
create index if not exists error_log_kind_idx on public.error_log (kind);

alter table public.error_log enable row level security;

-- MENULIS: setiap pengguna terautentikasi boleh menulis log (logging tak boleh gagal).
drop policy if exists error_log_insert on public.error_log;
create policy error_log_insert on public.error_log for insert to authenticated with check (true);

-- MEMBACA: hanya Admin Yayasan.
drop policy if exists error_log_select on public.error_log;
create policy error_log_select on public.error_log for select using (public.is_yayasan_admin());

-- MENGHAPUS (housekeeping): hanya Admin Yayasan.
drop policy if exists error_log_delete on public.error_log;
create policy error_log_delete on public.error_log for delete using (public.is_yayasan_admin());

notify pgrst, 'reload schema';
