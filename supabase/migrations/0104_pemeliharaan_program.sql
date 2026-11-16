-- 0104: Program & Jadwal Pemeliharaan sebagai LANGKAH BERSTATUS turunan DKA.
--
-- Analog dengan Pengadaan (0042): DKA yang disahkan otomatis memunculkan
-- "proses" per item. Di sini, setiap item PEMELIHARAAN pada DKA yang disahkan
-- otomatis muncul sebagai baris Program & Jadwal Pemeliharaan (status
-- 'direncanakan'), tanpa perlu dibuat manual.
--
-- Alur: DKA disahkan → program 'direncanakan' → dijadwalkan (jadwal + pelaksana)
--       → dilaksanakan (otomatis saat logbook pelaksanaan dicatat untuk item itu).

do $$ begin
  create type public.pemeliharaan_status_enum as enum ('direncanakan', 'dijadwalkan', 'dilaksanakan', 'ditunda');
exception when duplicate_object then null;
end $$;

create table if not exists public.dka_pemeliharaan_proses (
  id uuid primary key default gen_random_uuid(),
  pemeliharaan_item_id uuid not null unique references public.dka_pemeliharaan_item(id) on delete cascade,
  status public.pemeliharaan_status_enum not null default 'direncanakan',
  frekuensi text,                 -- mis. Bulanan / Triwulan / Semester / Tahunan / Insidental
  jadwal_mulai date,
  jadwal_selesai date,
  pelaksana text,                 -- internal / eksternal (nama)
  catatan text,
  dijadwalkan_oleh uuid references public.employees(id),
  dijadwalkan_at timestamptz,
  dilaksanakan_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists dka_pemeliharaan_proses_status_idx on public.dka_pemeliharaan_proses (status);

create or replace function public.dka_pemeliharaan_proses_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists dka_pemeliharaan_proses_updated_at on public.dka_pemeliharaan_proses;
create trigger dka_pemeliharaan_proses_updated_at
  before update on public.dka_pemeliharaan_proses
  for each row execute function public.dka_pemeliharaan_proses_set_updated_at();

-- Catat aktor & waktu per tahap.
create or replace function public.dka_pemeliharaan_proses_set_actor()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'dijadwalkan' and (tg_op = 'INSERT' or old.status is distinct from 'dijadwalkan') then
    new.dijadwalkan_oleh := coalesce(new.dijadwalkan_oleh, public.current_employee_id());
    new.dijadwalkan_at := coalesce(new.dijadwalkan_at, now());
  end if;
  if new.status = 'dilaksanakan' and (tg_op = 'INSERT' or old.status is distinct from 'dilaksanakan') then
    new.dilaksanakan_at := coalesce(new.dilaksanakan_at, now());
  end if;
  return new;
end;
$$;
drop trigger if exists dka_pemeliharaan_proses_actor_trg on public.dka_pemeliharaan_proses;
create trigger dka_pemeliharaan_proses_actor_trg
  before insert or update on public.dka_pemeliharaan_proses
  for each row execute function public.dka_pemeliharaan_proses_set_actor();

alter table public.dka_pemeliharaan_proses enable row level security;

-- Visibilitas mengikuti sekolah pemilik DKA (lewat pemeliharaan_item → usulan).
drop policy if exists dka_pemeliharaan_proses_select on public.dka_pemeliharaan_proses;
create policy dka_pemeliharaan_proses_select on public.dka_pemeliharaan_proses for select using (
  exists (
    select 1 from public.dka_pemeliharaan_item it join public.dka_usulan u on u.id = it.usulan_id
    where it.id = pemeliharaan_item_id
      and (public.is_yayasan_admin() or public.has_school_access(u.school_id))
  )
);

-- Menulis/mengubah program: HANYA bila DKA induk sudah disahkan.
drop policy if exists dka_pemeliharaan_proses_write on public.dka_pemeliharaan_proses;
create policy dka_pemeliharaan_proses_write on public.dka_pemeliharaan_proses for all using (
  exists (
    select 1 from public.dka_pemeliharaan_item it join public.dka_usulan u on u.id = it.usulan_id
    where it.id = pemeliharaan_item_id and u.status = 'disahkan'
      and (public.is_yayasan_admin() or public.is_school_manager(u.school_id))
  )
) with check (
  exists (
    select 1 from public.dka_pemeliharaan_item it join public.dka_usulan u on u.id = it.usulan_id
    where it.id = pemeliharaan_item_id and u.status = 'disahkan'
      and (public.is_yayasan_admin() or public.is_school_manager(u.school_id))
  )
);

-- ---------------------------------------------------------------------
-- Seed otomatis: saat DKA disahkan, buat baris program pemeliharaan
-- ('direncanakan') untuk setiap item pemeliharaannya. Juga saat item baru
-- ditambahkan pada DKA yang sudah disahkan.
-- ---------------------------------------------------------------------
create or replace function public.dka_usulan_seed_pemeliharaan_proses()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'disahkan' and (tg_op = 'INSERT' or old.status is distinct from 'disahkan') then
    insert into public.dka_pemeliharaan_proses (pemeliharaan_item_id, status)
    select it.id, 'direncanakan' from public.dka_pemeliharaan_item it
    where it.usulan_id = new.id
    on conflict (pemeliharaan_item_id) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists dka_usulan_seed_pemeliharaan_proses_trg on public.dka_usulan;
create trigger dka_usulan_seed_pemeliharaan_proses_trg
  after insert or update on public.dka_usulan
  for each row execute function public.dka_usulan_seed_pemeliharaan_proses();

create or replace function public.dka_pemeliharaan_item_seed_proses()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_status public.dka_status_enum;
begin
  select status into v_status from public.dka_usulan where id = new.usulan_id;
  if v_status = 'disahkan' then
    insert into public.dka_pemeliharaan_proses (pemeliharaan_item_id, status) values (new.id, 'direncanakan')
    on conflict (pemeliharaan_item_id) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists dka_pemeliharaan_item_seed_proses_trg on public.dka_pemeliharaan_item;
create trigger dka_pemeliharaan_item_seed_proses_trg
  after insert on public.dka_pemeliharaan_item
  for each row execute function public.dka_pemeliharaan_item_seed_proses();

-- ---------------------------------------------------------------------
-- Tutup lingkaran: saat logbook pelaksanaan dicatat untuk sebuah item DKA
-- pemeliharaan, tandai programnya 'dilaksanakan' secara otomatis.
-- ---------------------------------------------------------------------
create or replace function public.pemeliharaan_log_tandai_dilaksanakan()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.dka_pemeliharaan_item_id is not null then
    update public.dka_pemeliharaan_proses
      set status = 'dilaksanakan'
      where pemeliharaan_item_id = new.dka_pemeliharaan_item_id
        and status is distinct from 'dilaksanakan';
  end if;
  return new;
end;
$$;
drop trigger if exists pemeliharaan_log_tandai_trg on public.aset_pemeliharaan_log;
create trigger pemeliharaan_log_tandai_trg
  after insert on public.aset_pemeliharaan_log
  for each row execute function public.pemeliharaan_log_tandai_dilaksanakan();

-- ---------------------------------------------------------------------
-- Backfill: DKA yang SUDAH disahkan sebelum migrasi ini — item
-- pemeliharaannya perlu baris program. Yang sudah pernah ada logbook-nya
-- ditandai 'dilaksanakan'.
-- ---------------------------------------------------------------------
insert into public.dka_pemeliharaan_proses (pemeliharaan_item_id, status)
select it.id,
  case when exists (
    select 1 from public.aset_pemeliharaan_log l where l.dka_pemeliharaan_item_id = it.id
  ) then 'dilaksanakan'::public.pemeliharaan_status_enum
  else 'direncanakan'::public.pemeliharaan_status_enum end
from public.dka_pemeliharaan_item it
join public.dka_usulan u on u.id = it.usulan_id
where u.status = 'disahkan'
on conflict (pemeliharaan_item_id) do nothing;

notify pgrst, 'reload schema';
