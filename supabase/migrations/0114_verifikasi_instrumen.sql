-- 0114: Verifikasi aset berinstrumen + alur 2 tingkat (Sekolah → Yayasan).
--
-- Mengganti verifikasi "satu klik" menjadi: isi instrumen (blanko) lalu ajukan,
-- diverifikasi tingkat sekolah (Kepsek/pengelola), lalu DISAHKAN Yayasan.
-- Instrumen bersifat template PER GOLONGAN (klasifikasi), dengan fallback umum.

-- 1) Template instrumen per golongan (klasifikasi_id null = berlaku umum).
create table if not exists public.aset_instrumen_item (
  id uuid primary key default gen_random_uuid(),
  klasifikasi_id uuid references public.aset_klasifikasi(id) on delete cascade,
  poin text not null,
  tipe text not null default 'ya_tidak' check (tipe in ('ya_tidak', 'teks', 'angka', 'pilihan')),
  opsi text,                       -- untuk tipe 'pilihan': dipisah koma
  wajib boolean not null default true,
  urutan int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists aset_instrumen_item_klas_idx on public.aset_instrumen_item (klasifikasi_id);

alter table public.aset_instrumen_item enable row level security;
drop policy if exists aset_instrumen_item_select on public.aset_instrumen_item;
create policy aset_instrumen_item_select on public.aset_instrumen_item for select to authenticated using (true);
drop policy if exists aset_instrumen_item_write on public.aset_instrumen_item;
create policy aset_instrumen_item_write on public.aset_instrumen_item for all
  using (public.is_yayasan_admin()) with check (public.is_yayasan_admin());

-- 2) Kolom verifikasi berstatus pada aset.
do $$ begin
  create type public.verif_status_enum as enum ('belum', 'diajukan', 'diverifikasi', 'disahkan', 'ditolak');
exception when duplicate_object then null;
end $$;

alter table public.aset
  add column if not exists verif_status public.verif_status_enum not null default 'belum',
  add column if not exists verif_jawaban jsonb,
  add column if not exists verif_diajukan_at timestamptz,
  add column if not exists verif_diajukan_by uuid references public.employees(id),
  add column if not exists verif_kepsek_at timestamptz,
  add column if not exists verif_kepsek_by uuid references public.employees(id),
  add column if not exists verif_yayasan_at timestamptz,
  add column if not exists verif_yayasan_by uuid references public.employees(id),
  add column if not exists verif_catatan text;

-- Backfill: aset yang sudah 'verified' (0112) dianggap sudah disahkan.
update public.aset set verif_status = 'disahkan' where verified = true and verif_status = 'belum';

-- 3) Guard transisi + stempel aktor + sinkron kolom 'verified'.
create or replace function public.aset_verif_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.verif_status is distinct from old.verif_status then
    if new.verif_status in ('disahkan', 'ditolak') and not public.is_yayasan_admin() then
      raise exception 'Hanya Yayasan yang dapat mengesahkan/menolak verifikasi aset.' using errcode = 'P0001';
    end if;
    if new.verif_status = 'diverifikasi'
       and not (public.is_yayasan_admin() or public.is_school_manager(new.school_id)) then
      raise exception 'Verifikasi tingkat sekolah hanya oleh Kepala Sekolah/pengelola unit.' using errcode = 'P0001';
    end if;
    if new.verif_status = 'diajukan' then
      new.verif_diajukan_by := coalesce(new.verif_diajukan_by, public.current_employee_id());
      new.verif_diajukan_at := coalesce(new.verif_diajukan_at, now());
    elsif new.verif_status = 'diverifikasi' then
      new.verif_kepsek_by := public.current_employee_id();
      new.verif_kepsek_at := now();
    elsif new.verif_status in ('disahkan', 'ditolak') then
      new.verif_yayasan_by := public.current_employee_id();
      new.verif_yayasan_at := now();
    end if;
  end if;
  -- 'verified' tetap sinkron untuk kcompatibilitas (true hanya bila disahkan).
  new.verified := (new.verif_status = 'disahkan');
  new.verified_at := case when new.verif_status = 'disahkan' then coalesce(new.verif_yayasan_at, now()) else null end;
  return new;
end $$;
drop trigger if exists aset_verif_guard_trg on public.aset;
create trigger aset_verif_guard_trg
  before update on public.aset
  for each row execute function public.aset_verif_guard();

-- 4) Seed instrumen UMUM bawaan (bisa diubah Yayasan di Master Instrumen).
insert into public.aset_instrumen_item (klasifikasi_id, poin, tipe, urutan)
select null, p.poin, 'ya_tidak', p.urutan
from (values
  ('Fisik aset sesuai catatan (nama/merk/tipe)', 1),
  ('Jumlah/volume sesuai pencatatan', 2),
  ('Berfungsi / dapat digunakan', 3),
  ('Kode & label aset terpasang', 4),
  ('Lokasi/ruangan sesuai data', 5)
) as p(poin, urutan)
where not exists (select 1 from public.aset_instrumen_item where klasifikasi_id is null);

notify pgrst, 'reload schema';
