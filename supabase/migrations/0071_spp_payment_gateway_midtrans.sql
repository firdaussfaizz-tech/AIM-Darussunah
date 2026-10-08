-- =====================================================================
-- PAYMENT GATEWAY SPP — MIDTRANS (VA + QRIS)
-- (Rekomendasi Asesmen ERP/HRIS #5).
--
-- Menambah kolom status gateway pada tagihan SPP, kolom dedup pada
-- pembayaran, dan tabel log notifikasi (webhook). Integrasi sengaja
-- MINIM INVASIF: begitu pembayaran online lunas, Edge Function cukup
-- MENYISIPKAN baris ke public.spp_pembayaran — trigger yang sudah ada
-- otomatis: (a) menghitung ulang status tagihan (lunas/sebagian),
-- (b) memposting pemasukan ke Buku Kas (A19, migrasi 0049), dan
-- (c) mengirim email "SPP lunas" bila notifikasi aktif. Tidak ada logika
-- uang yang digandakan di sini.
--
-- RAHASIA (Server Key Midtrans) TIDAK disimpan di database — disimpan
-- sebagai secret Edge Function (lihat panduan di
-- supabase/functions/README-midtrans-spp.md).
--
-- Non-destruktif & idempoten; aman atas drift skema (guard to_regclass).
-- JALANKAN SETELAH migrasi 0070.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Kolom status gateway pada tagihan (menyimpan VA/QRIS aktif + status).
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.spp_tagihan') is not null then
    alter table public.spp_tagihan
      add column if not exists gateway_order_id text,
      add column if not exists gateway_status text,
      add column if not exists gateway_payment_type text,
      add column if not exists gateway_va_bank text,
      add column if not exists gateway_va_number text,
      add column if not exists gateway_qris_url text,
      add column if not exists gateway_expiry timestamptz,
      add column if not exists gateway_updated_at timestamptz;
    create index if not exists spp_tagihan_gateway_order_id_idx
      on public.spp_tagihan (gateway_order_id);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. Dedup pembayaran dari gateway: simpan transaction_id Midtrans dan
--    pastikan satu transaksi hanya tercatat sekali (idempoten webhook).
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.spp_pembayaran') is not null then
    alter table public.spp_pembayaran
      add column if not exists gateway_ref text;
    create unique index if not exists spp_pembayaran_gateway_ref_uidx
      on public.spp_pembayaran (gateway_ref) where gateway_ref is not null;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. Log notifikasi/aktivitas gateway (audit). Diisi oleh Edge Function
--    (service role, melewati RLS). Dibaca oleh Admin Yayasan/HR & Bendahara.
-- ---------------------------------------------------------------------
create table if not exists public.spp_gateway_events (
  id uuid primary key default gen_random_uuid(),
  order_id text,
  transaction_id text,
  transaction_status text,
  payment_type text,
  gross_amount numeric(14,2),
  signature_valid boolean,
  raw jsonb,
  created_at timestamptz not null default now()
);
create index if not exists spp_gateway_events_order_id_idx on public.spp_gateway_events (order_id);
create index if not exists spp_gateway_events_created_at_idx on public.spp_gateway_events (created_at desc);

alter table public.spp_gateway_events enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'spp_gateway_events' and policyname = 'spp_gateway_events_select') then
    create policy spp_gateway_events_select on public.spp_gateway_events for select
      using (public.is_yayasan_admin() or public.is_bendahara());
  end if;
end $$;
