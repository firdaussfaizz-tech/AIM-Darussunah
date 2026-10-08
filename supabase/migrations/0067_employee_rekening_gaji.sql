-- =====================================================================
-- DATA REKENING GAJI PEGAWAI — fondasi untuk transfer/payroll bank.
--
-- Prasyarat fitur "ekspor file payroll bank" / integrasi bank: tiap pegawai
-- perlu nomor rekening tujuan transfer gaji. Sebelumnya tabel employees
-- belum punya field apa pun soal rekening. Migrasi ini menambahkannya.
--
--   bank_nama          : nama bank penerima (default 'Bank Muamalat
--                        Indonesia' karena penggajian yayasan via Muamalat;
--                        tetap bisa diubah per pegawai bila ada yang beda).
--   rekening_nomor     : nomor rekening tujuan transfer gaji.
--   rekening_atas_nama : nama pemilik rekening (kadang beda dengan nama
--                        pegawai — dipakai apa adanya oleh file transfer bank).
--
-- Semua nullable (diisi bertahap). Default bank_nama ikut terisi untuk baris
-- yang sudah ada — aman karena memang semua gaji disalurkan lewat Muamalat.
--
-- Non-destruktif & idempoten. Aman dijalankan kapan pun setelah 0066.
-- =====================================================================

alter table public.employees
  add column if not exists bank_nama text default 'Bank Muamalat Indonesia',
  add column if not exists rekening_nomor text,
  add column if not exists rekening_atas_nama text;
