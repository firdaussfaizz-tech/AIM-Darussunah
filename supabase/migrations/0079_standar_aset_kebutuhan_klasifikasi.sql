-- =====================================================================
-- 0079 — Integrasi Standar Aset (STD-01) & Standar Kebutuhan (STD-02)
--        dengan Kodefikasi Aset (public.aset_klasifikasi).
--
-- Latar: kolom kode_ref pada dka_standar_aset & dka_standar_kebutuhan
-- sejak 0039 dimaksudkan "sementara, akan dipetakan ke kodefikasi resmi".
-- Standar Harga (dka_standar_harga) sudah memakai klasifikasi_id sejak awal;
-- migrasi ini menyelaraskan kedua tabel standar lainnya agar Kode Ref dapat
-- ditarik dari tabel kodefikasi yang sama (konsisten lintas STD-01/02/harga).
--
-- Aman dijalankan berulang (idempoten) & drift-safe: hanya bertindak bila
-- tabel target ada; kolom & FK dibuat dengan "if not exists".
-- kode_ref DIPERTAHANKAN sebagai kode manual opsional / cadangan data lama.
-- =====================================================================

do $$
begin
  -- Butuh tabel kodefikasi sebagai acuan FK.
  if to_regclass('public.aset_klasifikasi') is null then
    raise notice '0079: public.aset_klasifikasi tidak ditemukan — dilewati.';
    return;
  end if;

  -- 1) Standar Aset (STD-01)
  if to_regclass('public.dka_standar_aset') is not null then
    alter table public.dka_standar_aset
      add column if not exists klasifikasi_id uuid;
    if not exists (
      select 1 from information_schema.table_constraints
      where constraint_schema = 'public'
        and table_name = 'dka_standar_aset'
        and constraint_name = 'dka_standar_aset_klasifikasi_id_fkey'
    ) then
      alter table public.dka_standar_aset
        add constraint dka_standar_aset_klasifikasi_id_fkey
        foreign key (klasifikasi_id) references public.aset_klasifikasi (id) on delete set null;
    end if;
    create index if not exists dka_standar_aset_klasifikasi_idx
      on public.dka_standar_aset (klasifikasi_id);
    comment on column public.dka_standar_aset.klasifikasi_id is
      'Kodefikasi aset resmi (aset_klasifikasi). Sumber Kode Ref; kode_ref tinggal kode manual opsional.';
  end if;

  -- 2) Standar Kebutuhan (STD-02)
  if to_regclass('public.dka_standar_kebutuhan') is not null then
    alter table public.dka_standar_kebutuhan
      add column if not exists klasifikasi_id uuid;
    if not exists (
      select 1 from information_schema.table_constraints
      where constraint_schema = 'public'
        and table_name = 'dka_standar_kebutuhan'
        and constraint_name = 'dka_standar_kebutuhan_klasifikasi_id_fkey'
    ) then
      alter table public.dka_standar_kebutuhan
        add constraint dka_standar_kebutuhan_klasifikasi_id_fkey
        foreign key (klasifikasi_id) references public.aset_klasifikasi (id) on delete set null;
    end if;
    create index if not exists dka_standar_kebutuhan_klasifikasi_idx
      on public.dka_standar_kebutuhan (klasifikasi_id);
    comment on column public.dka_standar_kebutuhan.klasifikasi_id is
      'Kodefikasi aset resmi (aset_klasifikasi). Sumber Kode Ref; kode_ref tinggal kode manual opsional.';
  end if;
end $$;

-- Segarkan cache skema PostgREST agar embed aset_klasifikasi(...) langsung aktif.
notify pgrst, 'reload schema';
