-- =====================================================================
-- AKTIFKAN SUPABASE REALTIME UNTUK DAFTAR UTAMA (#1 — auto-refresh).
--
-- Agar langganan realtime di aplikasi (src/lib/useAutoRefresh.js) benar-
-- benar menerima perubahan, tabel-tabel di bawah harus terdaftar pada
-- publication `supabase_realtime`. Migrasi ini menambahkannya secara
-- IDEMPOTEN (dilewati bila sudah terdaftar) dan AMAN bila publication
-- belum ada (mis. lingkungan non-Supabase) — cukup dilewati.
--
-- Non-destruktif. Aman dijalankan ulang. JALANKAN SETELAH 0050.
-- =====================================================================
do $$
declare
  t text;
begin
  -- Publication bawaan Supabase; bila tak ada, lewati seluruhnya.
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;

  for t in select unnest(array[
    'siswa', 'attendance', 'employees',
    'spp_tagihan', 'spp_pembayaran',
    'buku_kas_transaksi', 'rkas_anggaran', 'rkas_belanja_item', 'rkas_pendapatan_item',
    'dka_usulan', 'dka_usulan_item', 'dka_pengadaan_proses',
    'performance_reviews'
  ]) loop
    if to_regclass('public.' || t) is not null
       and not exists (
         select 1 from pg_publication_tables
         where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
       ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
