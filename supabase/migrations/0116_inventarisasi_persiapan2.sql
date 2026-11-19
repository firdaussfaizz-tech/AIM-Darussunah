-- 0116: Persiapan Inventarisasi mandiri (lepas dari sesi opname) + gerbang Pendataan.
--
-- Persiapan per unit: periode, Tim Inventarisasi, pengesahan Yayasan. Pendataan
-- baru dapat dimulai setelah Persiapan DISAHKAN Yayasan (tim_disahkan = true).

create table if not exists public.inventarisasi_persiapan (
  school_id uuid primary key references public.schools(id) on delete cascade,
  periode_nama text,
  periode_jenis text,
  periode_mulai date,
  periode_selesai date,
  no_sk text,
  catatan text,
  tim_disahkan boolean not null default false,
  disahkan_at timestamptz,
  disahkan_by uuid references public.employees(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventarisasi_tim (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  nama text not null,
  peran text not null default 'anggota' check (peran in ('penanggung_jawab', 'ketua', 'sekretaris', 'anggota', 'pengelola_aset', 'petugas')),
  employee_id uuid references public.employees(id) on delete set null,
  jabatan_asal text,
  created_at timestamptz not null default now()
);
create index if not exists inventarisasi_tim_school_idx on public.inventarisasi_tim (school_id);

alter table public.inventarisasi_persiapan enable row level security;
alter table public.inventarisasi_tim enable row level security;

drop policy if exists inv_persiapan_select on public.inventarisasi_persiapan;
create policy inv_persiapan_select on public.inventarisasi_persiapan for select using (public.is_yayasan_admin() or public.has_school_access(school_id));
drop policy if exists inv_persiapan_write on public.inventarisasi_persiapan;
create policy inv_persiapan_write on public.inventarisasi_persiapan for all
  using (public.is_yayasan_admin() or public.is_school_manager(school_id))
  with check (public.is_yayasan_admin() or public.is_school_manager(school_id));

drop policy if exists inv_tim_select on public.inventarisasi_tim;
create policy inv_tim_select on public.inventarisasi_tim for select using (public.is_yayasan_admin() or public.has_school_access(school_id));
drop policy if exists inv_tim_write on public.inventarisasi_tim;
create policy inv_tim_write on public.inventarisasi_tim for all
  using (public.is_yayasan_admin() or public.is_school_manager(school_id))
  with check (public.is_yayasan_admin() or public.is_school_manager(school_id));

-- Guard pengesahan: hanya Yayasan boleh set tim_disahkan = true; catat aktor.
create or replace function public.inv_persiapan_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and new.tim_disahkan is distinct from old.tim_disahkan then
    if new.tim_disahkan and not public.is_yayasan_admin() then
      raise exception 'Hanya Yayasan yang dapat mengesahkan Persiapan Inventarisasi.' using errcode = 'P0001';
    end if;
    new.disahkan_by := case when new.tim_disahkan then public.current_employee_id() else null end;
    new.disahkan_at := case when new.tim_disahkan then now() else null end;
  end if;
  return new;
end $$;
drop trigger if exists inv_persiapan_guard_trg on public.inventarisasi_persiapan;
create trigger inv_persiapan_guard_trg
  before update on public.inventarisasi_persiapan
  for each row execute function public.inv_persiapan_guard();

notify pgrst, 'reload schema';
