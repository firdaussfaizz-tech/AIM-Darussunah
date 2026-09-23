-- =====================================================================
-- MODUL ASET — MELENGKAPI SIKLUS HIDUP (5 area sekaligus).
--
-- Melanjutkan roadmap Sarpras. Menambah fitur pencatatan + OTOMASI +
-- INTEGRASI ke Inventaris/DKA untuk lima area yang tersisa:
--   1. Penggunaan (BAB VI)         → aset_penggunaan
--   2. Pemeliharaan (BAB IX)       → aset_pemeliharaan_log  (sync kondisi aset)
--   3. Penerimaan & Penyaluran (V) → aset_penyaluran        (pindah lokasi aset)
--   4. Inventarisasi (BAB VII)     → aset_opname(+_item)    (sync kondisi aset)
--   5. Penghapusan (BAB X & XI)    → aset_penghapusan(+_item) (set aset dihapus)
--
-- Semua terhubung ke tabel `aset` (Inventaris) & memakai helper RLS yang
-- sudah ada (is_yayasan_admin / has_school_access / is_school_manager /
-- current_employee_id). Alur persetujuan penghapusan memakai ulang enum
-- dka_status_enum (draft→diajukan→disahkan/dikembalikan) & pola
-- usulan-keputusan (sekolah mengusulkan, Yayasan memutuskan).
--
-- Aman dijalankan ulang (idempoten). JALANKAN SETELAH 0043.
-- =====================================================================

-- =====================================================================
-- 1. PENGGUNAAN (Status Penggunaan) — BAB VI
-- =====================================================================
create table if not exists public.aset_penggunaan (
  id uuid primary key default gen_random_uuid(),
  aset_id uuid not null references public.aset(id) on delete cascade,
  pengguna_employee_id uuid references public.employees(id) on delete set null,
  pengguna_nama text,                 -- fallback / nama unit bila bukan pegawai
  unit_kerja text,
  tanggal_penetapan date not null default current_date,
  nomor_ba text,                      -- No. Berita Acara Status Penggunaan
  keterangan text,
  status text not null default 'aktif' check (status in ('aktif', 'dikembalikan')),
  tanggal_kembali date,
  created_at timestamptz not null default now()
);
create index if not exists aset_penggunaan_aset_idx on public.aset_penggunaan (aset_id);

alter table public.aset_penggunaan enable row level security;
drop policy if exists aset_penggunaan_select on public.aset_penggunaan;
create policy aset_penggunaan_select on public.aset_penggunaan for select using (
  exists (select 1 from public.aset a where a.id = aset_id and (public.is_yayasan_admin() or public.has_school_access(a.school_id)))
);
drop policy if exists aset_penggunaan_write on public.aset_penggunaan;
create policy aset_penggunaan_write on public.aset_penggunaan for all using (
  exists (select 1 from public.aset a where a.id = aset_id and (public.is_yayasan_admin() or public.is_school_manager(a.school_id)))
) with check (
  exists (select 1 from public.aset a where a.id = aset_id and (public.is_yayasan_admin() or public.is_school_manager(a.school_id)))
);

-- =====================================================================
-- 2. PEMELIHARAAN & PERBAIKAN (pelaksanaan) — BAB IX
--    Logbook; bisa bersumber dari Rencana Pemeliharaan DKA (0038).
--    OTOMASI: kondisi_sesudah → perbarui kondisi aset di Inventaris.
-- =====================================================================
create table if not exists public.aset_pemeliharaan_log (
  id uuid primary key default gen_random_uuid(),
  aset_id uuid not null references public.aset(id) on delete cascade,
  dka_pemeliharaan_item_id uuid references public.dka_pemeliharaan_item(id) on delete set null,
  tanggal date not null default current_date,
  jenis text,                         -- Preventif / Korektif / Perbaikan
  uraian text,
  bahan text,
  biaya numeric(16,2) not null default 0 check (biaya >= 0),
  pelaksana text,                     -- internal / eksternal (nama)
  kondisi_sebelum text check (kondisi_sebelum is null or kondisi_sebelum in ('baik', 'rusak_ringan', 'rusak_berat')),
  kondisi_sesudah text check (kondisi_sesudah is null or kondisi_sesudah in ('baik', 'rusak_ringan', 'rusak_berat')),
  tindak_lanjut text,
  created_at timestamptz not null default now()
);
create index if not exists aset_pemeliharaan_log_aset_idx on public.aset_pemeliharaan_log (aset_id);

alter table public.aset_pemeliharaan_log enable row level security;
drop policy if exists aset_pemeliharaan_log_select on public.aset_pemeliharaan_log;
create policy aset_pemeliharaan_log_select on public.aset_pemeliharaan_log for select using (
  exists (select 1 from public.aset a where a.id = aset_id and (public.is_yayasan_admin() or public.has_school_access(a.school_id)))
);
drop policy if exists aset_pemeliharaan_log_write on public.aset_pemeliharaan_log;
create policy aset_pemeliharaan_log_write on public.aset_pemeliharaan_log for all using (
  exists (select 1 from public.aset a where a.id = aset_id and (public.is_yayasan_admin() or public.is_school_manager(a.school_id)))
) with check (
  exists (select 1 from public.aset a where a.id = aset_id and (public.is_yayasan_admin() or public.is_school_manager(a.school_id)))
);

create or replace function public.aset_pemeliharaan_sync_kondisi()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kondisi_sesudah is not null and new.aset_id is not null
     and (tg_op = 'INSERT' or new.kondisi_sesudah is distinct from old.kondisi_sesudah) then
    update public.aset set kondisi = new.kondisi_sesudah where id = new.aset_id;
  end if;
  return new;
end;
$$;
drop trigger if exists aset_pemeliharaan_sync_kondisi_trg on public.aset_pemeliharaan_log;
create trigger aset_pemeliharaan_sync_kondisi_trg
  after insert or update on public.aset_pemeliharaan_log
  for each row execute function public.aset_pemeliharaan_sync_kondisi();

-- =====================================================================
-- 3. PENERIMAAN & PENYALURAN — BAB V
--    SPA (permintaan) → SPPA (penyaluran). OTOMASI: saat 'disalurkan',
--    pindahkan lokasi aset (ruangan) — kode lokasi ikut ter-generate ulang.
-- =====================================================================
create table if not exists public.aset_penyaluran (
  id uuid primary key default gen_random_uuid(),
  aset_id uuid not null references public.aset(id) on delete cascade,
  ruangan_tujuan_id uuid references public.ruangan(id) on delete set null,
  tujuan_lokasi text,                 -- manual bila tanpa ruangan
  penerima text,
  jumlah numeric(12,2) not null default 1 check (jumlah >= 0),
  tanggal_permintaan date not null default current_date,   -- SPA
  nomor_spa text,
  tanggal_penyaluran date,                                 -- SPPA
  nomor_sppa text,
  status text not null default 'diminta' check (status in ('diminta', 'disalurkan', 'ditolak')),
  keterangan text,
  created_at timestamptz not null default now()
);
create index if not exists aset_penyaluran_aset_idx on public.aset_penyaluran (aset_id);

alter table public.aset_penyaluran enable row level security;
drop policy if exists aset_penyaluran_select on public.aset_penyaluran;
create policy aset_penyaluran_select on public.aset_penyaluran for select using (
  exists (select 1 from public.aset a where a.id = aset_id and (public.is_yayasan_admin() or public.has_school_access(a.school_id)))
);
drop policy if exists aset_penyaluran_write on public.aset_penyaluran;
create policy aset_penyaluran_write on public.aset_penyaluran for all using (
  exists (select 1 from public.aset a where a.id = aset_id and (public.is_yayasan_admin() or public.is_school_manager(a.school_id)))
) with check (
  exists (select 1 from public.aset a where a.id = aset_id and (public.is_yayasan_admin() or public.is_school_manager(a.school_id)))
);

create or replace function public.aset_penyaluran_apply()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'disalurkan' and (tg_op = 'INSERT' or old.status is distinct from 'disalurkan') then
    if new.tanggal_penyaluran is null then new.tanggal_penyaluran := current_date; end if;
    if new.ruangan_tujuan_id is not null then
      update public.aset set ruangan_id = new.ruangan_tujuan_id where id = new.aset_id;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists aset_penyaluran_apply_trg on public.aset_penyaluran;
create trigger aset_penyaluran_apply_trg
  before insert or update on public.aset_penyaluran
  for each row execute function public.aset_penyaluran_apply();

-- =====================================================================
-- 4. INVENTARISASI & PELAPORAN — BAB VII
--    Sesi opname per unit+tahun; item di-generate dari Inventaris.
--    OTOMASI: kondisi_aktual → perbarui kondisi aset (rekonsiliasi).
-- =====================================================================
create table if not exists public.aset_opname (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  tahun int not null,
  judul text,
  tanggal_mulai date,
  tanggal_selesai date,
  status text not null default 'berjalan' check (status in ('berjalan', 'selesai')),
  catatan text,
  created_at timestamptz not null default now()
);
create index if not exists aset_opname_school_idx on public.aset_opname (school_id);

create table if not exists public.aset_opname_item (
  id uuid primary key default gen_random_uuid(),
  opname_id uuid not null references public.aset_opname(id) on delete cascade,
  aset_id uuid references public.aset(id) on delete set null,
  kode_aset text,
  nama_aset text,
  kondisi_tercatat text,
  ditemukan boolean,                  -- null=belum dicek, true=ada, false=hilang
  kondisi_aktual text check (kondisi_aktual is null or kondisi_aktual in ('baik', 'rusak_ringan', 'rusak_berat')),
  catatan text,
  created_at timestamptz not null default now()
);
create index if not exists aset_opname_item_opname_idx on public.aset_opname_item (opname_id);

alter table public.aset_opname enable row level security;
drop policy if exists aset_opname_select on public.aset_opname;
create policy aset_opname_select on public.aset_opname for select using (
  public.is_yayasan_admin() or public.has_school_access(school_id)
);
drop policy if exists aset_opname_write on public.aset_opname;
create policy aset_opname_write on public.aset_opname for all using (
  public.is_yayasan_admin() or public.is_school_manager(school_id)
) with check (
  public.is_yayasan_admin() or public.is_school_manager(school_id)
);

alter table public.aset_opname_item enable row level security;
drop policy if exists aset_opname_item_select on public.aset_opname_item;
create policy aset_opname_item_select on public.aset_opname_item for select using (
  exists (select 1 from public.aset_opname o where o.id = opname_id and (public.is_yayasan_admin() or public.has_school_access(o.school_id)))
);
drop policy if exists aset_opname_item_write on public.aset_opname_item;
create policy aset_opname_item_write on public.aset_opname_item for all using (
  exists (select 1 from public.aset_opname o where o.id = opname_id and (public.is_yayasan_admin() or public.is_school_manager(o.school_id)))
) with check (
  exists (select 1 from public.aset_opname o where o.id = opname_id and (public.is_yayasan_admin() or public.is_school_manager(o.school_id)))
);

-- Generate item opname dari Inventaris aktif unit ybs (snapshot).
create or replace function public.aset_opname_generate(p_opname_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_school uuid;
begin
  select school_id into v_school from public.aset_opname where id = p_opname_id and status = 'berjalan';
  if v_school is null then raise exception 'Sesi opname tidak ditemukan atau sudah selesai.' using errcode = 'P0001'; end if;
  if not (public.is_yayasan_admin() or public.is_school_manager(v_school)) then
    raise exception 'Tidak berwenang.' using errcode = '42501';
  end if;
  delete from public.aset_opname_item where opname_id = p_opname_id;
  insert into public.aset_opname_item (opname_id, aset_id, kode_aset, nama_aset, kondisi_tercatat)
  select p_opname_id, a.id, a.kode_aset, a.nama, a.kondisi
  from public.aset a
  where a.school_id = v_school and a.status = 'aktif'
  order by a.kode_aset nulls last, a.nama;
end;
$$;

-- Rekonsiliasi: kondisi_aktual → perbarui kondisi aset.
create or replace function public.aset_opname_item_sync_kondisi()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kondisi_aktual is not null and new.aset_id is not null
     and (tg_op = 'INSERT' or new.kondisi_aktual is distinct from old.kondisi_aktual) then
    update public.aset set kondisi = new.kondisi_aktual where id = new.aset_id;
  end if;
  return new;
end;
$$;
drop trigger if exists aset_opname_item_sync_kondisi_trg on public.aset_opname_item;
create trigger aset_opname_item_sync_kondisi_trg
  after insert or update on public.aset_opname_item
  for each row execute function public.aset_opname_item_sync_kondisi();

-- =====================================================================
-- 5. PENGHAPUSAN & PEMINDAHTANGANAN — BAB X & XI
--    Usulan (sekolah) → keputusan (Yayasan). OTOMASI: saat disahkan
--    (disetujui), aset yang diusulkan otomatis berstatus 'dihapus'.
-- =====================================================================
create table if not exists public.aset_penghapusan (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  judul text,
  alasan text,                        -- rusak berat / idle / efisiensi / kehilangan
  cara text,                          -- Penghapusan / Penjualan / Hibah / Tukar menukar
  status public.dka_status_enum not null default 'draft',
  catatan_yayasan text,
  nomor_sk text,
  diajukan_by uuid references public.employees(id),
  diajukan_by_user_id uuid references auth.users(id),
  diajukan_at timestamptz,
  diputuskan_by uuid references public.employees(id),
  diputuskan_by_user_id uuid references auth.users(id),
  diputuskan_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists aset_penghapusan_school_idx on public.aset_penghapusan (school_id);

create table if not exists public.aset_penghapusan_item (
  id uuid primary key default gen_random_uuid(),
  penghapusan_id uuid not null references public.aset_penghapusan(id) on delete cascade,
  aset_id uuid references public.aset(id) on delete set null,
  kode_aset text,
  nama_aset text,
  kondisi text,
  nilai numeric(16,2),
  keterangan text,
  created_at timestamptz not null default now()
);
create index if not exists aset_penghapusan_item_hdr_idx on public.aset_penghapusan_item (penghapusan_id);

-- Nama pengaju (untuk tampilan) — pola sama dgn dka_usulan_diajukan_nama.
create or replace function public.aset_penghapusan_diajukan_nama(u public.aset_penghapusan)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select nama from public.employees where id = u.diajukan_by),
    (select coalesce(full_name, email) from public.profiles where id = u.diajukan_by_user_id)
  );
$$;

-- Catat aktor pengaju/pemutus.
create or replace function public.aset_penghapusan_set_workflow_actor()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'diajukan' and (tg_op = 'INSERT' or new.status is distinct from old.status) then
    new.diajukan_by := public.current_employee_id();
    new.diajukan_by_user_id := auth.uid();
    new.diajukan_at := now();
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status and new.status in ('disahkan', 'dikembalikan') then
    new.diputuskan_by := public.current_employee_id();
    new.diputuskan_by_user_id := auth.uid();
    new.diputuskan_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists aset_penghapusan_workflow_actor on public.aset_penghapusan;
create trigger aset_penghapusan_workflow_actor
  before insert or update on public.aset_penghapusan
  for each row execute function public.aset_penghapusan_set_workflow_actor();

-- OTOMASI: saat disahkan (disetujui) → tandai aset 'dihapus' di Inventaris.
create or replace function public.aset_penghapusan_terapkan()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'disahkan' and old.status is distinct from 'disahkan' then
    update public.aset set status = 'dihapus'
    where id in (select aset_id from public.aset_penghapusan_item where penghapusan_id = new.id and aset_id is not null);
  end if;
  return new;
end;
$$;
drop trigger if exists aset_penghapusan_terapkan_trg on public.aset_penghapusan;
create trigger aset_penghapusan_terapkan_trg
  after update on public.aset_penghapusan
  for each row execute function public.aset_penghapusan_terapkan();

alter table public.aset_penghapusan enable row level security;
drop policy if exists aset_penghapusan_select on public.aset_penghapusan;
create policy aset_penghapusan_select on public.aset_penghapusan for select using (
  public.is_yayasan_admin() or public.has_school_access(school_id)
);
drop policy if exists aset_penghapusan_write_sekolah on public.aset_penghapusan;
create policy aset_penghapusan_write_sekolah on public.aset_penghapusan for all using (
  status in ('draft', 'dikembalikan') and public.is_school_manager(school_id)
) with check (
  status in ('draft', 'diajukan') and public.is_school_manager(school_id)
);
drop policy if exists aset_penghapusan_write_yayasan on public.aset_penghapusan;
create policy aset_penghapusan_write_yayasan on public.aset_penghapusan for all
  using (public.is_yayasan_admin()) with check (public.is_yayasan_admin());

alter table public.aset_penghapusan_item enable row level security;
drop policy if exists aset_penghapusan_item_select on public.aset_penghapusan_item;
create policy aset_penghapusan_item_select on public.aset_penghapusan_item for select using (
  exists (select 1 from public.aset_penghapusan u where u.id = penghapusan_id and (public.is_yayasan_admin() or public.has_school_access(u.school_id)))
);
drop policy if exists aset_penghapusan_item_write on public.aset_penghapusan_item;
create policy aset_penghapusan_item_write on public.aset_penghapusan_item for all using (
  exists (
    select 1 from public.aset_penghapusan u where u.id = penghapusan_id and (
      public.is_yayasan_admin() or (u.status in ('draft', 'dikembalikan') and public.is_school_manager(u.school_id))
    )
  )
) with check (
  exists (
    select 1 from public.aset_penghapusan u where u.id = penghapusan_id and (
      public.is_yayasan_admin() or (u.status in ('draft', 'dikembalikan') and public.is_school_manager(u.school_id))
    )
  )
);
