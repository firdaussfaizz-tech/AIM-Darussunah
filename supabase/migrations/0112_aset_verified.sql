-- 0112: Penanda verifikasi aset (untuk tahap Identifikasi inventarisasi).
-- Aset yang sudah diperiksa & dicocokkan datanya ditandai 'verified'.
alter table public.aset
  add column if not exists verified boolean not null default false,
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid references public.employees(id);

notify pgrst, 'reload schema';
