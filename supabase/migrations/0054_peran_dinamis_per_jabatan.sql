-- =====================================================================
-- PERAN DINAMIS PER JABATAN + JEMBATAN TINGKAT AKSES (#7 lanjutan).
--
-- Keputusan pengguna (2026-09-24): peran (user_role) tidak lagi terbatas
-- pada 7 nilai enum tetap. Selain "Admin Yayasan" (super-role), SETIAP
-- JABATAN memiliki PERANNYA SENDIRI. Akses tiap peran ditentukan pada
-- tahap berikutnya; untuk sekarang tiap peran diberi "tingkat akses"
-- default yang masuk akal agar aplikasi tetap berfungsi.
--
-- STRATEGI AMAN (jembatan): model lama (enum app_role_enum + fungsi RLS)
-- TIDAK dibongkar. Kita TAMBAHKAN tabel `roles` dinamis + kolom
-- user_roles.role_id, lalu fungsi-fungsi RLS diperluas agar mengenali
-- peran dinamis lewat `tingkat_akses`-nya (di-OR dengan logika enum lama).
-- Dengan begitu akses yang sedang berjalan tetap utuh selama transisi.
--
-- tingkat_akses:
--   yayasan_penuh : setara Admin Yayasan/HR (akses seluruh unit)
--   manajer_unit  : setara Admin/Kepala Sekolah (akses unit sendiri)
--   bendahara     : peran finansial lintas unit (SPP/Keuangan)
--   pegawai       : akses pribadi saja (default paling aman)
--
-- Non-destruktif & idempoten. JALANKAN SETELAH 0053.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabel peran dinamis.
-- ---------------------------------------------------------------------
create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  kode text unique not null,
  nama text not null,
  keterangan text,
  tingkat_akses text not null default 'pegawai'
    check (tingkat_akses in ('yayasan_penuh', 'manajer_unit', 'bendahara', 'pegawai')),
  is_admin_yayasan boolean not null default false,
  aktif boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.roles enable row level security;
drop policy if exists roles_select on public.roles;
create policy roles_select on public.roles for select using (auth.uid() is not null);
drop policy if exists roles_write on public.roles;
create policy roles_write on public.roles for all
  using (public.is_yayasan_admin()) with check (public.is_yayasan_admin());

-- ---------------------------------------------------------------------
-- 2. Heuristik tingkat akses dari nama/jenis jabatan.
-- ---------------------------------------------------------------------
create or replace function public.roles_tebak_tingkat(p_nama text, p_jenis text)
returns text language sql immutable set search_path = public as $$
  select case
    when p_nama ilike '%ketua yayasan%' or p_nama ilike '%direktur%' or p_nama ilike '%pembina%'
         or p_nama ilike '%pengurus yayasan%' or p_nama ilike '%sekretaris yayasan%'
         or p_nama ilike '%hrd%' or p_nama ilike '%sumber daya manusia%' or p_nama ilike '%kepegawaian yayasan%'
      then 'yayasan_penuh'
    when p_nama ilike '%bendahara%'
      then 'bendahara'
    when p_nama ilike '%kepala sekolah%' or p_nama ilike '%wakil kepala%' or p_nama ilike '%waka%'
         or p_nama ilike '%tata usaha%' or p_nama ilike '%kepala tu%' or p_nama ilike '%ka. tu%'
         or p_nama ilike '%operator%' or p_nama ilike '%administrasi sekolah%'
      then 'manajer_unit'
    else 'pegawai'
  end;
$$;

-- ---------------------------------------------------------------------
-- 3. Kolom penghubung jabatan → peran (1:1).
-- ---------------------------------------------------------------------
alter table public.positions add column if not exists role_id uuid references public.roles(id) on delete set null;

-- Super-role Admin Yayasan (selalu ada, tidak terikat jabatan).
insert into public.roles (kode, nama, tingkat_akses, is_admin_yayasan)
select 'admin_yayasan', 'Admin Yayasan', 'yayasan_penuh', true
where not exists (select 1 from public.roles where kode = 'admin_yayasan');

-- Buat satu peran untuk tiap jabatan yang belum punya (idempoten via kode).
insert into public.roles (kode, nama, tingkat_akses)
select 'jab_' || substr(md5(p.id::text), 1, 10), p.nama, public.roles_tebak_tingkat(p.nama, p.jenis)
from public.positions p
where p.role_id is null
  and not exists (select 1 from public.roles r where r.kode = 'jab_' || substr(md5(p.id::text), 1, 10));

update public.positions p
  set role_id = r.id
from public.roles r
where r.kode = 'jab_' || substr(md5(p.id::text), 1, 10) and p.role_id is null;

-- Trigger: jabatan baru otomatis mendapat peran sendiri.
create or replace function public.positions_ensure_role()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_role uuid;
begin
  if new.role_id is null then
    insert into public.roles (kode, nama, tingkat_akses)
    values ('jab_' || substr(md5(new.id::text), 1, 10), new.nama, public.roles_tebak_tingkat(new.nama, new.jenis))
    on conflict (kode) do update set nama = excluded.nama
    returning id into v_role;
    new.role_id := v_role;
  end if;
  return new;
end;
$$;
drop trigger if exists positions_ensure_role_trg on public.positions;
create trigger positions_ensure_role_trg
  before insert on public.positions
  for each row execute function public.positions_ensure_role();

-- Jaga nama peran selaras bila nama jabatan diubah.
create or replace function public.positions_sync_role_nama()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role_id is not null and new.nama is distinct from old.nama then
    update public.roles set nama = new.nama where id = new.role_id;
  end if;
  return new;
end;
$$;
drop trigger if exists positions_sync_role_nama_trg on public.positions;
create trigger positions_sync_role_nama_trg
  after update on public.positions
  for each row execute function public.positions_sync_role_nama();

-- ---------------------------------------------------------------------
-- 4. user_roles: dukung penetapan lewat role_id (peran dinamis).
--    Kolom enum `role` dibuat NULLABLE (baris baru memakai role_id;
--    baris lama tetap valid). Unik per (user, role dinamis, unit).
-- ---------------------------------------------------------------------
alter table public.user_roles add column if not exists role_id uuid references public.roles(id) on delete cascade;
alter table public.user_roles alter column role drop not null;
create unique index if not exists user_roles_uniq_role_id
  on public.user_roles (user_id, role_id, school_id) where role_id is not null;

-- ---------------------------------------------------------------------
-- 5. JEMBATAN: perluas fungsi RLS agar mengenali peran dinamis.
--    Semantik enum lama DIPERTAHANKAN, ditambah cabang peran dinamis.
-- ---------------------------------------------------------------------
create or replace function public.is_yayasan_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.user_roles ur
    left join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
      and (ur.role in ('admin_yayasan', 'hr')
           or r.is_admin_yayasan
           or r.tingkat_akses = 'yayasan_penuh')
  );
$$;

create or replace function public.has_school_access(target_school_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.user_roles ur
    left join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
      and (ur.role in ('admin_yayasan', 'hr')
           or r.is_admin_yayasan
           or r.tingkat_akses = 'yayasan_penuh'
           or ur.school_id = target_school_id)
  ) or exists (
    select 1
    from public.employees e
    join public.positions p on p.id = e.position_id
    where e.user_id = auth.uid()
      and e.school_id = target_school_id
      and p.beri_akses_manajer
  );
$$;

create or replace function public.is_school_manager(target_school_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.user_roles ur
    left join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
      and ur.school_id = target_school_id
      and (ur.role in ('admin_sekolah', 'kepala_sekolah')
           or r.tingkat_akses = 'manajer_unit')
  ) or exists (
    select 1
    from public.employees e
    join public.positions p on p.id = e.position_id
    where e.user_id = auth.uid()
      and e.school_id = target_school_id
      and p.beri_akses_manajer
  );
$$;

create or replace function public.is_bendahara()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.user_roles ur
    left join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
      and (ur.role = 'bendahara' or r.tingkat_akses = 'bendahara')
  );
$$;

-- ---------------------------------------------------------------------
-- 6. Sinkron peran dari jabatan (versi peran dinamis, menggantikan
--    versi enum di 0053). Untuk tiap pegawai aktif ber-akun & jabatan
--    ber-peran, buat user_roles(role_id) bila belum ada. school_id diisi
--    untuk peran ber-lingkup unit. Hanya MENAMBAH (tak menghapus).
-- ---------------------------------------------------------------------
create or replace function public.sinkron_peran_dari_jabatan()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_before bigint;
  v_after bigint;
begin
  if not public.is_yayasan_admin() then
    raise exception 'Hanya Admin Yayasan yang boleh menyinkronkan peran.' using errcode = '42501';
  end if;

  select count(*) into v_before from public.user_roles;

  insert into public.user_roles (user_id, role_id, school_id, employee_id)
  select
    e.user_id,
    p.role_id,
    case when r.tingkat_akses = 'manajer_unit' then e.school_id else null end,
    e.id
  from public.employees e
  join public.positions p on p.id = e.position_id
  join public.roles r on r.id = p.role_id
  where e.user_id is not null
    and e.status = 'aktif'
    and p.role_id is not null
    and not exists (
      select 1 from public.user_roles ur
      where ur.user_id = e.user_id
        and ur.role_id = p.role_id
        and ur.school_id is not distinct from (case when r.tingkat_akses = 'manajer_unit' then e.school_id else null end)
    );

  select count(*) into v_after from public.user_roles;
  return (v_after - v_before)::int;
end;
$$;
