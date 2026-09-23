-- =====================================================================
-- MODUL ASET — TAHAP "PENGADAAN → PENERIMAAN" (konsumsi DKA disahkan).
--
-- Melanjutkan roadmap Sarpras (lihat dokumen roadmap Project): setelah
-- DKA disahkan (0037), satuan pendidikan melaksanakan pengadaan per item
-- (SOP BAB IV — Pengadaan Aset) sampai serah terima. Hasil serah terima
-- OTOMATIS menambah aset ke Inventaris (BAB V — "Aset yang dicatat
-- diserahkan ke ruang penyimpanan... dicatat sebagai Daftar Hasil
-- Pengadaan").
--
-- Tabel: dka_pengadaan_proses — SATU baris per item pengadaan DKA
-- (dka_usulan_item), mencatat realisasi pengadaan sampai BAST:
--   menunggu → dipesan → pemeriksaan (lolos) → diterima (masuk Inventaris)
--                      ↘ ditolak (tidak sesuai → pemesanan ulang) ↗
--
-- Baris dibuat OTOMATIS saat DKA disahkan (atau saat item baru ditambah
-- pada DKA yang sudah disahkan) — sekolah tak perlu membuatnya manual.
--
-- JALANKAN SETELAH 0041. Aman dijalankan ulang (idempoten).
-- =====================================================================

do $$ begin
  create type public.pengadaan_status_enum as enum ('menunggu', 'dipesan', 'pemeriksaan', 'ditolak', 'diterima');
exception when duplicate_object then null;
end $$;

create table if not exists public.dka_pengadaan_proses (
  id uuid primary key default gen_random_uuid(),
  usulan_item_id uuid not null unique references public.dka_usulan_item(id) on delete cascade,
  status public.pengadaan_status_enum not null default 'menunggu',

  -- Pemesanan (BAB IV): metode realisasi, penyedia, dokumen dasar.
  metode_realisasi text,   -- Pembelian langsung / Pengadaan langsung (SPK) / Swakelola / Hibah / Tukar Menukar
  penyedia text,
  nomor_spk text,
  tanggal_spk date,
  nomor_bukti text,        -- No. nota / kuitansi / invoice
  jumlah_realisasi numeric(12,2) check (jumlah_realisasi is null or jumlah_realisasi >= 0),
  harga_realisasi numeric(16,2) check (harga_realisasi is null or harga_realisasi >= 0),
  dipesan_at timestamptz,
  dipesan_by uuid references public.employees(id),

  -- Berita Acara Pemeriksaan.
  ba_pemeriksaan_tanggal date,
  ba_pemeriksaan_hasil text check (ba_pemeriksaan_hasil is null or ba_pemeriksaan_hasil in ('sesuai', 'tidak_sesuai')),
  ba_pemeriksaan_catatan text,
  ba_pemeriksaan_by uuid references public.employees(id),

  -- Berita Acara Serah Terima → pemicu tambah otomatis ke Inventaris.
  ba_serah_terima_tanggal date,
  ba_serah_terima_catatan text,
  ba_serah_terima_by uuid references public.employees(id),
  aset_id uuid references public.aset(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists dka_pengadaan_proses_status_idx on public.dka_pengadaan_proses (status);
create index if not exists dka_pengadaan_proses_aset_idx on public.dka_pengadaan_proses (aset_id);

create or replace function public.dka_pengadaan_proses_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists dka_pengadaan_proses_updated_at on public.dka_pengadaan_proses;
create trigger dka_pengadaan_proses_updated_at
  before update on public.dka_pengadaan_proses
  for each row execute function public.dka_pengadaan_proses_set_updated_at();

-- Catat aktor per tahap (dipesan / diperiksa / diserahterimakan).
create or replace function public.dka_pengadaan_proses_set_actor()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'dipesan' and (tg_op = 'INSERT' or old.status is distinct from 'dipesan') then
    new.dipesan_by := public.current_employee_id();
    new.dipesan_at := coalesce(new.dipesan_at, now());
  end if;
  if new.status in ('pemeriksaan', 'ditolak') and old.status is distinct from new.status then
    new.ba_pemeriksaan_by := public.current_employee_id();
  end if;
  if new.status = 'diterima' and old.status is distinct from 'diterima' then
    new.ba_serah_terima_by := public.current_employee_id();
  end if;
  return new;
end;
$$;
drop trigger if exists dka_pengadaan_proses_actor_trg on public.dka_pengadaan_proses;
create trigger dka_pengadaan_proses_actor_trg
  before insert or update on public.dka_pengadaan_proses
  for each row execute function public.dka_pengadaan_proses_set_actor();

alter table public.dka_pengadaan_proses enable row level security;

-- Visibilitas mengikuti sekolah pemilik DKA (lewat usulan_item → usulan).
drop policy if exists dka_pengadaan_proses_select on public.dka_pengadaan_proses;
create policy dka_pengadaan_proses_select on public.dka_pengadaan_proses for select using (
  exists (
    select 1 from public.dka_usulan_item it join public.dka_usulan u on u.id = it.usulan_id
    where it.id = usulan_item_id
      and (public.is_yayasan_admin() or public.has_school_access(u.school_id))
  )
);

-- Menulis/mengubah proses pengadaan: HANYA bila DKA induk sudah disahkan
-- (Yayasan sudah memutuskan) — sebelum itu belum ada dasar mengadakan.
drop policy if exists dka_pengadaan_proses_write on public.dka_pengadaan_proses;
create policy dka_pengadaan_proses_write on public.dka_pengadaan_proses for all using (
  exists (
    select 1 from public.dka_usulan_item it join public.dka_usulan u on u.id = it.usulan_id
    where it.id = usulan_item_id and u.status = 'disahkan'
      and (public.is_yayasan_admin() or public.is_school_manager(u.school_id))
  )
) with check (
  exists (
    select 1 from public.dka_usulan_item it join public.dka_usulan u on u.id = it.usulan_id
    where it.id = usulan_item_id and u.status = 'disahkan'
      and (public.is_yayasan_admin() or public.is_school_manager(u.school_id))
  )
);

-- ---------------------------------------------------------------------
-- Auto-tambah ke Inventaris saat status → 'diterima' (BAST selesai).
-- Menyalin data item DKA (klasifikasi, nama, ruangan, satuan) + realisasi
-- (jumlah, harga) ke tabel aset; kode_aset/kode_lokasi terisi otomatis
-- lewat trigger aset_generate_kode_trg (0037) yang sudah ada.
-- ---------------------------------------------------------------------
create or replace function public.dka_pengadaan_terima_ke_inventaris()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.dka_usulan_item%rowtype;
  v_school_id uuid;
  v_aset_id uuid;
begin
  if new.status = 'diterima' and (old.status is distinct from 'diterima') and new.aset_id is null then
    select * into v_item from public.dka_usulan_item where id = new.usulan_item_id;
    select school_id into v_school_id from public.dka_usulan where id = v_item.usulan_id;

    insert into public.aset (
      school_id, ruangan_id, nama, merk_tipe, tahun_perolehan, tanggal_perolehan,
      jumlah, satuan, nilai_perolehan, sumber_dana, kondisi, status, keterangan, klasifikasi_id
    ) values (
      v_school_id, v_item.ruangan_id, v_item.nama_aset, v_item.spesifikasi,
      extract(year from coalesce(new.ba_serah_terima_tanggal, current_date))::int,
      coalesce(new.ba_serah_terima_tanggal, current_date),
      coalesce(new.jumlah_realisasi, v_item.jumlah_pengajuan, 1),
      v_item.satuan,
      coalesce(new.harga_realisasi, v_item.harga_satuan, 0),
      v_item.sumber_anggaran,
      'baik', 'aktif',
      'Hasil pengadaan DKA' || case when new.nomor_spk is not null and new.nomor_spk <> '' then ' — SPK ' || new.nomor_spk else '' end,
      v_item.klasifikasi_id
    ) returning id into v_aset_id;

    new.aset_id := v_aset_id;
  end if;
  return new;
end;
$$;

drop trigger if exists dka_pengadaan_terima_trg on public.dka_pengadaan_proses;
create trigger dka_pengadaan_terima_trg
  before update on public.dka_pengadaan_proses
  for each row execute function public.dka_pengadaan_terima_ke_inventaris();

-- ---------------------------------------------------------------------
-- Seed otomatis: saat DKA disahkan, buat baris proses pengadaan
-- ('menunggu') untuk setiap item pengadaannya. Juga saat item baru
-- ditambahkan pada DKA yang sudah disahkan (kasus tepi, Yayasan bisa
-- menambah item kapan pun).
-- ---------------------------------------------------------------------
create or replace function public.dka_usulan_seed_pengadaan_proses()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'disahkan' and (tg_op = 'INSERT' or old.status is distinct from 'disahkan') then
    insert into public.dka_pengadaan_proses (usulan_item_id, status)
    select it.id, 'menunggu' from public.dka_usulan_item it
    where it.usulan_id = new.id
    on conflict (usulan_item_id) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists dka_usulan_seed_pengadaan_proses_trg on public.dka_usulan;
create trigger dka_usulan_seed_pengadaan_proses_trg
  after insert or update on public.dka_usulan
  for each row execute function public.dka_usulan_seed_pengadaan_proses();

create or replace function public.dka_usulan_item_seed_pengadaan_proses()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_status public.dka_status_enum;
begin
  select status into v_status from public.dka_usulan where id = new.usulan_id;
  if v_status = 'disahkan' then
    insert into public.dka_pengadaan_proses (usulan_item_id, status) values (new.id, 'menunggu')
    on conflict (usulan_item_id) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists dka_usulan_item_seed_pengadaan_proses_trg on public.dka_usulan_item;
create trigger dka_usulan_item_seed_pengadaan_proses_trg
  after insert on public.dka_usulan_item
  for each row execute function public.dka_usulan_item_seed_pengadaan_proses();

-- Backfill: DKA yang SUDAH disahkan sebelum migrasi ini dijalankan juga
-- perlu baris proses pengadaan untuk item-itemnya.
insert into public.dka_pengadaan_proses (usulan_item_id, status)
select it.id, 'menunggu'
from public.dka_usulan_item it
join public.dka_usulan u on u.id = it.usulan_id
where u.status = 'disahkan'
on conflict (usulan_item_id) do nothing;
