-- =====================================================================
-- PERENCANAAN — Rencana Kebutuhan PEMELIHARAAN Aset (melengkapi DKA).
--
-- Juknis BAB III: perencanaan kebutuhan meliputi (1) pengadaan &
-- (2) PEMELIHARAAN. Item pengadaan sudah ada (dka_usulan_item, migrasi
-- 0037). Migrasi ini menambah item PEMELIHARAAN pada usulan/DKA yang
-- SAMA (dka_usulan) — satu dokumen DKA memuat kedua rencana, diajukan &
-- disahkan bersama.
--
-- Dokumen perencanaan pemeliharaan (juknis) memuat:
--   * Nama Proker/Kegiatan/Output
--   * Data aset: kode aset, nama aset, jumlah aset, lokasi aset
--   * Kondisi aset: baik / rusak ringan / rusak berat
--   * Uraian pemeliharaan: jenis, volume, harga satuan, jumlah biaya
--
-- INTEGRASI ↔ INVENTARIS (Penatausahaan): tiap item pemeliharaan
-- MENUNJUK aset yang sudah ada (aset_id → public.aset). Data aset (kode,
-- nama, jumlah, lokasi, kondisi) ditarik dari Buku Inventaris/KIA/KIR
-- sebagai dokumen sumber; disimpan pula sebagai snapshot agar dokumen
-- perencanaan tetap utuh bila aset berubah kemudian.
--
-- Aman dijalankan ulang (idempoten). JALANKAN SETELAH 0037.
-- =====================================================================

create table if not exists public.dka_pemeliharaan_item (
  id uuid primary key default gen_random_uuid(),
  usulan_id uuid not null references public.dka_usulan(id) on delete cascade,
  urutan int not null default 0,
  nama_kegiatan text,
  -- Integrasi Inventaris: aset yang dipelihara (dokumen sumber BI/KIA/KIR).
  aset_id uuid references public.aset(id) on delete set null,
  -- Snapshot data aset saat direncanakan.
  kode_aset text,
  nama_aset text not null,
  jumlah_aset numeric(12,2) not null default 1 check (jumlah_aset >= 0),
  lokasi text,
  kondisi text not null default 'baik' check (kondisi in ('baik', 'rusak_ringan', 'rusak_berat')),
  -- Uraian pemeliharaan.
  jenis_pemeliharaan text,           -- Preventif / Korektif
  volume numeric(12,2) not null default 0 check (volume >= 0),
  satuan text not null default 'unit',
  harga_satuan numeric(16,2) not null default 0 check (harga_satuan >= 0),
  jumlah_biaya numeric(18,2) generated always as (volume * harga_satuan) stored,
  sumber_anggaran text,
  keterangan text,
  created_at timestamptz not null default now()
);
create index if not exists dka_pemeliharaan_item_usulan_idx on public.dka_pemeliharaan_item (usulan_id);
create index if not exists dka_pemeliharaan_item_aset_idx on public.dka_pemeliharaan_item (aset_id);

alter table public.dka_pemeliharaan_item enable row level security;

-- Visibilitas & kewenangan menulis mengikuti header DKA-nya (sama persis
-- dengan dka_usulan_item): Yayasan kapan pun; sekolah HANYA selama usulan
-- draft/dikembalikan.
drop policy if exists dka_pemeliharaan_item_select on public.dka_pemeliharaan_item;
create policy dka_pemeliharaan_item_select on public.dka_pemeliharaan_item for select using (
  exists (
    select 1 from public.dka_usulan u
    where u.id = usulan_id
      and (public.is_yayasan_admin() or public.has_school_access(u.school_id))
  )
);

drop policy if exists dka_pemeliharaan_item_write on public.dka_pemeliharaan_item;
create policy dka_pemeliharaan_item_write on public.dka_pemeliharaan_item for all using (
  exists (
    select 1 from public.dka_usulan u
    where u.id = usulan_id and (
      public.is_yayasan_admin() or
      (u.status in ('draft', 'dikembalikan') and public.is_school_manager(u.school_id))
    )
  )
) with check (
  exists (
    select 1 from public.dka_usulan u
    where u.id = usulan_id and (
      public.is_yayasan_admin() or
      (u.status in ('draft', 'dikembalikan') and public.is_school_manager(u.school_id))
    )
  )
);
