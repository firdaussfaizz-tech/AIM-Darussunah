-- 0103: Kerangka Kerja Pengadaan sebagai LANGKAH BERSTATUS & GERBANG pengadaan.
--
-- Aturan (permintaan pengguna):
--  1) DKA yang disahkan belum bisa dilaksanakan pengadaannya sebelum Kerangka
--     Kerja Pengadaan disusun (Kepala Sekolah) dan disahkan (Yayasan).
--  2) Aksi "Catat Pemesanan" (status proses → 'dipesan') DITOLAK sampai
--     Kerangka Kerja untuk DKA tsb berstatus 'disahkan'.
--
-- Satu kerangka per DKA (usulan). Alur: draft → diajukan (oleh Kepsek) →
-- disahkan/ditolak (oleh Yayasan).

do $$ begin
  if not exists (select 1 from pg_type where typname = 'kerangka_status_enum') then
    create type public.kerangka_status_enum as enum ('draft', 'diajukan', 'disahkan', 'ditolak');
  end if;
end $$;

create table if not exists public.dka_kerangka (
  id uuid primary key default gen_random_uuid(),
  usulan_id uuid not null unique references public.dka_usulan(id) on delete cascade,
  status public.kerangka_status_enum not null default 'draft',
  waktu_pelaksanaan text,
  lokasi text,
  persyaratan_penyedia text,
  catatan text,
  disusun_oleh uuid references public.employees(id),
  disusun_nama text,
  diajukan_at timestamptz,
  direviu_oleh uuid references public.employees(id),
  direviu_nama text,
  direviu_at timestamptz,
  catatan_reviu text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.dka_kerangka enable row level security;

-- Unit DKA (untuk RLS & guard).
create or replace function public._kerangka_school_id(p_usulan uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select school_id from public.dka_usulan where id = p_usulan
$$;

drop policy if exists dka_kerangka_read on public.dka_kerangka;
create policy dka_kerangka_read on public.dka_kerangka for select to authenticated
  using (public.is_yayasan_admin() or public.is_school_manager(public._kerangka_school_id(usulan_id)));
drop policy if exists dka_kerangka_write on public.dka_kerangka;
create policy dka_kerangka_write on public.dka_kerangka for all to authenticated
  using (public.is_yayasan_admin() or public.is_school_manager(public._kerangka_school_id(usulan_id)))
  with check (public.is_yayasan_admin() or public.is_school_manager(public._kerangka_school_id(usulan_id)));

-- Guard transisi status + catat aktor.
create or replace function public.dka_kerangka_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    -- Pengesahan/penolakan HANYA Yayasan.
    if new.status in ('disahkan', 'ditolak') and not public.is_yayasan_admin() then
      raise exception 'Hanya Yayasan yang dapat mengesahkan/menolak kerangka kerja.' using errcode = 'P0001';
    end if;
    -- draft/diajukan oleh manajer unit (atau Yayasan).
    if new.status in ('draft', 'diajukan')
       and not (public.is_yayasan_admin() or public.is_school_manager(public._kerangka_school_id(new.usulan_id))) then
      raise exception 'Tidak berwenang mengubah status kerangka kerja.' using errcode = 'P0001';
    end if;
    if new.status = 'diajukan' then
      new.disusun_oleh := coalesce(new.disusun_oleh, public.current_employee_id());
      new.diajukan_at := now();
    elsif new.status in ('disahkan', 'ditolak') then
      new.direviu_oleh := public.current_employee_id();
      new.direviu_at := now();
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists trg_dka_kerangka_guard on public.dka_kerangka;
create trigger trg_dka_kerangka_guard before update on public.dka_kerangka
  for each row execute function public.dka_kerangka_guard();

-- Buat baris kerangka (draft) otomatis saat DKA disahkan.
create or replace function public.dka_seed_kerangka()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'disahkan' and (tg_op = 'INSERT' or old.status is distinct from 'disahkan') then
    insert into public.dka_kerangka (usulan_id, status) values (new.id, 'draft')
    on conflict (usulan_id) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists trg_dka_seed_kerangka on public.dka_usulan;
create trigger trg_dka_seed_kerangka after insert or update of status on public.dka_usulan
  for each row execute function public.dka_seed_kerangka();

-- GERBANG: cegah proses → 'dipesan' bila kerangka DKA belum 'disahkan'.
create or replace function public.dka_gate_pemesanan()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_usulan uuid; v_ok boolean;
begin
  if new.status = 'dipesan' and (tg_op = 'INSERT' or old.status is distinct from 'dipesan') then
    select usulan_id into v_usulan from public.dka_usulan_item where id = new.usulan_item_id;
    select exists (select 1 from public.dka_kerangka where usulan_id = v_usulan and status = 'disahkan') into v_ok;
    if not v_ok then
      raise exception 'Pengadaan belum dapat dilaksanakan: Kerangka Kerja Pengadaan untuk DKA ini belum disahkan Yayasan.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_dka_gate_pemesanan on public.dka_pengadaan_proses;
create trigger trg_dka_gate_pemesanan before insert or update on public.dka_pengadaan_proses
  for each row execute function public.dka_gate_pemesanan();

-- Backfill: DKA disahkan yang ada.
--  * Yang SUDAH memulai pengadaan (ada proses 'dipesan'/lanjut) → kerangka
--    langsung 'disahkan' (grandfather, agar tidak terblokir).
--  * Lainnya → 'draft'.
insert into public.dka_kerangka (usulan_id, status)
select u.id,
  case when exists (
    select 1 from public.dka_pengadaan_proses p
    join public.dka_usulan_item it on it.id = p.usulan_item_id
    where it.usulan_id = u.id and p.status in ('dipesan', 'pemeriksaan', 'diterima')
  ) then 'disahkan'::public.kerangka_status_enum else 'draft'::public.kerangka_status_enum end
from public.dka_usulan u
where u.status = 'disahkan'
on conflict (usulan_id) do nothing;

notify pgrst, 'reload schema';
