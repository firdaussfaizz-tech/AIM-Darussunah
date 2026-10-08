# Pembayaran SPP Online — Midtrans (VA + QRIS)

Integrasi SPP ↔ Midtrans. Alurnya: Admin/Bendahara membuat VA/QRIS dari aplikasi →
orang tua membayar → Midtrans mengirim notifikasi ke webhook → pembayaran tercatat
otomatis di aplikasi → status tagihan jadi **lunas**, masuk **Buku Kas** (A19), dan
**email "SPP lunas"** terkirim (bila aktif). Tidak ada entri manual.

## Komponen
- **Migrasi `0071_spp_payment_gateway_midtrans.sql`** — kolom gateway di `spp_tagihan`,
  dedup di `spp_pembayaran`, tabel log `spp_gateway_events`.
- **Edge Function `spp-create-payment`** — membuat VA/QRIS (Core API `/v2/charge`).
- **Edge Function `spp-webhook`** — menerima & memverifikasi notifikasi Midtrans.
- **UI** — tombol "Bayar Online (Midtrans)" di modal Kelola Pembayaran SPP.

## Langkah pemasangan (sekali saja)

1. **Jalankan migrasi** `0071` (setelah `0070`) di Supabase.

2. **Akun Midtrans** — daftar di https://dashboard.midtrans.com. Ambil **Server Key**
   (Settings → Access Keys). Pakai environment **Sandbox** dulu untuk uji coba.

3. **Set secret Edge Function** (lewat Supabase CLI):
   ```bash
   supabase secrets set MIDTRANS_SERVER_KEY="SB-Mid-server-xxxxxxxx"
   supabase secrets set MIDTRANS_IS_PRODUCTION="false"   # 'true' saat produksi
   ```
   `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` sudah otomatis tersedia.

4. **Deploy kedua fungsi:**
   ```bash
   supabase functions deploy spp-create-payment
   supabase functions deploy spp-webhook --no-verify-jwt
   ```
   > `--no-verify-jwt` WAJIB untuk webhook — Midtrans tidak mengirim token Supabase;
   > keamanannya dijamin verifikasi **signature SHA-512** di dalam fungsi.

5. **Daftarkan URL webhook di Midtrans** — Dashboard → Settings → Configuration →
   **Payment Notification URL**:
   ```
   https://<project-ref>.functions.supabase.co/spp-webhook
   ```

## Uji coba (Sandbox)
1. Di aplikasi: buka SPP → Kelola Pembayaran sebuah tagihan → **Bayar Online** →
   pilih QRIS atau VA → **Buat Tagihan Online**. Nomor VA / gambar QRIS muncul.
2. Bayar dengan **simulator** Midtrans: https://simulator.sandbox.midtrans.com
   (pilih VA bank yang sama lalu bayar, atau scan QRIS di simulator).
3. Dalam beberapa detik, webhook mencatat pembayaran: status tagihan jadi **lunas**,
   muncul di Buku Kas, dan `spp_gateway_events` berisi log notifikasi.

## Catatan keamanan & operasional
- **Server Key tidak pernah disimpan di database/aplikasi** — hanya sebagai secret Edge Function.
- Webhook **idempoten**: kolom unik `spp_pembayaran.gateway_ref` (transaction_id) mencegah
  pembayaran ganda walau Midtrans mengirim notifikasi berkali-kali.
- Semua notifikasi (termasuk yang gagal verifikasi signature) tercatat di
  `spp_gateway_events` untuk audit.
- Ganti ke produksi: ganti Server Key produksi + `MIDTRANS_IS_PRODUCTION=true`, lalu
  daftarkan ulang Payment Notification URL di dashboard **Production** Midtrans.
- Mengganti provider (mis. Xendit): cukup tulis ulang kedua Edge Function dengan API
  provider tersebut; skema database & UI tetap sama.
