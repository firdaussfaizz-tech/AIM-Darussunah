-- =====================================================================
-- 0093 — AKADEMIK: SISTEM PEMBANGUN KURIKULUM SATUAN PENDIDIKAN (KOSP)
--
-- Setelah Kurikulum Islam Plus (0092) ditetapkan, tiap SATUAN PENDIDIKAN
-- (SD / SMP / SMA / Boarding) menyusun Kurikulum Operasional Satuan
-- Pendidikan (KOSP) yang MEMADUKAN Kurikulum Islam Plus dengan Kurikulum
-- Nasional (Merdeka).
--
-- Alur sama dengan Islam Plus, namun PER-SATUAN:
--   Tim Penyusun satuan (manajemen unit) menyusun tiap bagian → AJUAN →
--   Admin Yayasan MENETAPKAN (acc) / MENOLAK. Versi lama diarsipkan.
--
--   draft → diajukan → ditetapkan / ditolak / diarsipkan
--
-- Akses: is_school_manager(school_id) (manajemen unit ybs) + Admin
-- Yayasan dapat menyusun/mengajukan; penetapan/penolakan hanya Admin
-- Yayasan (is_yayasan_admin).
--
-- Non-destruktif & idempoten.
-- =====================================================================

create table if not exists public.ksp_entri (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  bagian_kode text not null,              -- kunci bagian outline KOSP, mis. 'I.A', 'III.D'
  bagian_judul text not null,
  konten text not null default '',
  status text not null default 'draft'
    check (status in ('draft', 'diajukan', 'ditetapkan', 'ditolak', 'diarsipkan')),
  versi integer not null default 1,
  catatan_penyusun text,
  catatan_reviu text,
  disusun_oleh uuid references public.employees(id) on delete set null,
  disusun_nama text,
  diajukan_at timestamptz,
  direviu_oleh uuid references public.employees(id) on delete set null,
  direviu_nama text,
  direviu_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Satu entri aktif (draft/diajukan) per (satuan, bagian).
create unique index if not exists ksp_entri_satu_aktif
  on public.ksp_entri (school_id, bagian_kode)
  where status in ('draft', 'diajukan');

create index if not exists ksp_entri_school_idx on public.ksp_entri (school_id);
create index if not exists ksp_entri_bagian_idx on public.ksp_entri (school_id, bagian_kode);
create index if not exists ksp_entri_status_idx on public.ksp_entri (status);

drop trigger if exists trg_ksp_entri_updated_at on public.ksp_entri;
create trigger trg_ksp_entri_updated_at
  before update on public.ksp_entri
  for each row execute function public.set_updated_at();

-- --- Guard transisi status --------------------------------------------
create or replace function public.ksp_guard_transisi()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'diajukan') and not public.is_yayasan_admin() then
      raise exception 'Tim Penyusun hanya dapat membuat draft atau ajuan.';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status
       and new.status in ('ditetapkan', 'ditolak')
       and not public.is_yayasan_admin() then
      raise exception 'Hanya Admin Yayasan yang dapat menetapkan atau menolak ajuan.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ksp_guard_transisi on public.ksp_entri;
create trigger trg_ksp_guard_transisi
  before insert or update on public.ksp_entri
  for each row execute function public.ksp_guard_transisi();

-- --- Arsipkan versi lama saat ada penetapan baru (per satuan+bagian) --
create or replace function public.ksp_arsip_versi_lama()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.ksp_entri
     set status = 'diarsipkan', updated_at = now()
   where school_id = new.school_id
     and bagian_kode = new.bagian_kode
     and id <> new.id
     and status = 'ditetapkan';
  return new;
end;
$$;

drop trigger if exists trg_ksp_arsip_versi_lama on public.ksp_entri;
create trigger trg_ksp_arsip_versi_lama
  after insert or update of status on public.ksp_entri
  for each row when (new.status = 'ditetapkan')
  execute function public.ksp_arsip_versi_lama();

-- --- RLS ---------------------------------------------------------------
alter table public.ksp_entri enable row level security;

drop policy if exists ksp_entri_select on public.ksp_entri;
create policy ksp_entri_select on public.ksp_entri for select
  using (public.is_yayasan_admin() or public.is_school_manager(school_id));

drop policy if exists ksp_entri_insert on public.ksp_entri;
create policy ksp_entri_insert on public.ksp_entri for insert
  with check (public.is_yayasan_admin() or public.is_school_manager(school_id));

drop policy if exists ksp_entri_update on public.ksp_entri;
create policy ksp_entri_update on public.ksp_entri for update
  using (public.is_yayasan_admin() or public.is_school_manager(school_id))
  with check (public.is_yayasan_admin() or public.is_school_manager(school_id));

drop policy if exists ksp_entri_delete on public.ksp_entri;
create policy ksp_entri_delete on public.ksp_entri for delete
  using (public.is_yayasan_admin()
         or (public.is_school_manager(school_id) and status = 'draft'));

notify pgrst, 'reload schema';
