-- 0109: Persiapan Inventarisasi (BAB VII langkah 1) + alur berurutan 1-6.
--
-- Menambah struktur Persiapan pada sesi opname: Tim Inventarisasi (disahkan
-- Yayasan) dan pemetaan PJ ruangan, plus penanda tahap (1..6) agar alur
-- dijalankan berurutan. Langkah 2-5 (pendataan → tindak lanjut) sudah ada.

alter table public.aset_opname
  add column if not exists tahap int not null default 1,
  add column if not exists tim_disahkan boolean not null default false,
  add column if not exists tim_disahkan_at timestamptz,
  add column if not exists tim_disahkan_oleh uuid references public.employees(id),
  add column if not exists persiapan_catatan text,
  add column if not exists disahkan_pengelola boolean not null default false,
  add column if not exists disahkan_yayasan boolean not null default false;

-- Tim Inventarisasi + pemetaan PJ ruangan (langkah 1).
create table if not exists public.aset_opname_tim (
  id uuid primary key default gen_random_uuid(),
  opname_id uuid not null references public.aset_opname(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  nama text not null,
  peran text not null default 'anggota' check (peran in ('ketua', 'sekretaris', 'anggota', 'pj_ruangan')),
  ruangan_id uuid references public.ruangan(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists aset_opname_tim_opname_idx on public.aset_opname_tim (opname_id);

alter table public.aset_opname_tim enable row level security;

drop policy if exists aset_opname_tim_select on public.aset_opname_tim;
create policy aset_opname_tim_select on public.aset_opname_tim for select using (
  exists (select 1 from public.aset_opname o where o.id = opname_id
    and (public.is_yayasan_admin() or public.has_school_access(o.school_id)))
);
drop policy if exists aset_opname_tim_write on public.aset_opname_tim;
create policy aset_opname_tim_write on public.aset_opname_tim for all using (
  exists (select 1 from public.aset_opname o where o.id = opname_id
    and (public.is_yayasan_admin() or public.is_school_manager(o.school_id)))
) with check (
  exists (select 1 from public.aset_opname o where o.id = opname_id
    and (public.is_yayasan_admin() or public.is_school_manager(o.school_id)))
);

-- Guard pengesahan Tim: hanya Yayasan yang boleh menyetujui tim; catat aktor.
create or replace function public.aset_opname_persiapan_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.tim_disahkan is distinct from old.tim_disahkan then
    if new.tim_disahkan and not public.is_yayasan_admin() then
      raise exception 'Hanya Yayasan yang dapat mengesahkan Tim Inventarisasi.' using errcode = 'P0001';
    end if;
    if new.tim_disahkan then
      new.tim_disahkan_oleh := public.current_employee_id();
      new.tim_disahkan_at := now();
      if new.tahap < 2 then new.tahap := 2; end if;  -- lanjut ke Pendataan
    else
      new.tim_disahkan_oleh := null;
      new.tim_disahkan_at := null;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists aset_opname_persiapan_guard_trg on public.aset_opname;
create trigger aset_opname_persiapan_guard_trg
  before update on public.aset_opname
  for each row execute function public.aset_opname_persiapan_guard();

notify pgrst, 'reload schema';
