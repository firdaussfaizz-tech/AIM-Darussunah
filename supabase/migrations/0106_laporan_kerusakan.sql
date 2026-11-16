-- 0106: Laporan Kerusakan & Permintaan Perbaikan (BAB IX) — mekanisme lengkap.
--
-- Alur (analog siklus lain):
--   Dilaporkan → Diverifikasi (oleh pengelola/Yayasan) / Ditolak
--   → Perbaikan dilaksanakan (catat Logbook, boleh eksternal + BAST)
--   → otomatis 'Selesai'.
--
-- Otomasi:
--   * Saat Diverifikasi → kondisi aset diperbarui sesuai tingkat kerusakan.
--   * Gerbang: Logbook perbaikan yang merujuk laporan hanya boleh dicatat
--     bila laporan sudah 'diverifikasi'.
--   * Saat Logbook perbaikan dicatat untuk laporan itu → laporan 'selesai'
--     (kondisi 'sesudah' pada Logbook tetap memperbarui kondisi aset via 0044).

do $$ begin
  create type public.kerusakan_status_enum as enum ('dilaporkan', 'diverifikasi', 'ditolak', 'selesai');
exception when duplicate_object then null;
end $$;

create table if not exists public.aset_kerusakan (
  id uuid primary key default gen_random_uuid(),
  aset_id uuid not null references public.aset(id) on delete cascade,
  tanggal_lapor date not null default current_date,
  pelapor text,
  pelapor_id uuid references public.employees(id),
  uraian_kerusakan text not null,
  perkiraan_penyebab text,
  usulan_perbaikan text,
  tingkat text not null default 'ringan' check (tingkat in ('ringan', 'berat')),
  perlu_sparepart boolean not null default false,
  status public.kerusakan_status_enum not null default 'dilaporkan',
  verifikator_id uuid references public.employees(id),
  verifikasi_at timestamptz,
  catatan_verifikasi text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists aset_kerusakan_aset_idx on public.aset_kerusakan (aset_id);
create index if not exists aset_kerusakan_status_idx on public.aset_kerusakan (status);

-- Tautan Logbook → laporan kerusakan (perbaikan yang menindaklanjuti laporan).
alter table public.aset_pemeliharaan_log
  add column if not exists kerusakan_id uuid references public.aset_kerusakan(id) on delete set null;

alter table public.aset_kerusakan enable row level security;

-- Visibilitas & penulisan mengikuti sekolah pemilik aset.
drop policy if exists aset_kerusakan_select on public.aset_kerusakan;
create policy aset_kerusakan_select on public.aset_kerusakan for select using (
  exists (select 1 from public.aset a where a.id = aset_id
    and (public.is_yayasan_admin() or public.has_school_access(a.school_id)))
);
drop policy if exists aset_kerusakan_write on public.aset_kerusakan;
create policy aset_kerusakan_write on public.aset_kerusakan for all using (
  exists (select 1 from public.aset a where a.id = aset_id
    and (public.is_yayasan_admin() or public.is_school_manager(a.school_id)))
) with check (
  exists (select 1 from public.aset a where a.id = aset_id
    and (public.is_yayasan_admin() or public.is_school_manager(a.school_id)))
);

-- Catat aktor verifikasi + updated_at.
create or replace function public.aset_kerusakan_set_actor()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and new.status is distinct from old.status
     and new.status in ('diverifikasi', 'ditolak') then
    new.verifikator_id := coalesce(new.verifikator_id, public.current_employee_id());
    new.verifikasi_at := coalesce(new.verifikasi_at, now());
  end if;
  return new;
end $$;
drop trigger if exists aset_kerusakan_actor_trg on public.aset_kerusakan;
create trigger aset_kerusakan_actor_trg
  before insert or update on public.aset_kerusakan
  for each row execute function public.aset_kerusakan_set_actor();

-- Saat diverifikasi → perbarui kondisi aset sesuai tingkat kerusakan.
create or replace function public.aset_kerusakan_sync_kondisi()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'diverifikasi' and (tg_op = 'INSERT' or old.status is distinct from 'diverifikasi') then
    update public.aset
      set kondisi = case when new.tingkat = 'berat' then 'rusak_berat' else 'rusak_ringan' end
      where id = new.aset_id and status = 'aktif';
  end if;
  return new;
end $$;
drop trigger if exists aset_kerusakan_sync_kondisi_trg on public.aset_kerusakan;
create trigger aset_kerusakan_sync_kondisi_trg
  after insert or update on public.aset_kerusakan
  for each row execute function public.aset_kerusakan_sync_kondisi();

-- GERBANG: Logbook perbaikan yang merujuk laporan hanya boleh dicatat bila
-- laporan sudah 'diverifikasi' (atau sudah 'selesai').
create or replace function public.kerusakan_gate_perbaikan()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_status public.kerusakan_status_enum;
begin
  if new.kerusakan_id is not null then
    select status into v_status from public.aset_kerusakan where id = new.kerusakan_id;
    if v_status is not null and v_status not in ('diverifikasi', 'selesai') then
      raise exception 'Perbaikan belum dapat dicatat: Laporan Kerusakan belum diverifikasi.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists kerusakan_gate_perbaikan_trg on public.aset_pemeliharaan_log;
create trigger kerusakan_gate_perbaikan_trg
  before insert on public.aset_pemeliharaan_log
  for each row execute function public.kerusakan_gate_perbaikan();

-- Tutup lingkaran: Logbook perbaikan untuk laporan → laporan 'selesai'.
create or replace function public.kerusakan_tandai_selesai()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kerusakan_id is not null then
    update public.aset_kerusakan set status = 'selesai'
      where id = new.kerusakan_id and status is distinct from 'selesai';
  end if;
  return new;
end $$;
drop trigger if exists kerusakan_tandai_selesai_trg on public.aset_pemeliharaan_log;
create trigger kerusakan_tandai_selesai_trg
  after insert on public.aset_pemeliharaan_log
  for each row execute function public.kerusakan_tandai_selesai();

notify pgrst, 'reload schema';
