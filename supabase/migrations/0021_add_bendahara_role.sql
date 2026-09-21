-- =====================================================================
-- Menambahkan nilai enum baru 'bendahara' ke app_role_enum, untuk peran
-- yang mengelola SPP/tagihan siswa (modul Kesiswaan) tanpa perlu akses
-- data gaji pegawai atau nilai akademik.
--
-- PENTING — JALANKAN FILE INI SENDIRIAN TERLEBIH DAHULU, TERPISAH dari
-- migrasi 0022 berikutnya. PostgreSQL tidak mengizinkan sebuah nilai enum
-- yang baru ditambahkan dipakai pada transaksi yang sama dengan perintah
-- ALTER TYPE ... ADD VALUE yang menambahkannya. Kalau kedua file dijalankan
-- sekaligus dalam satu eksekusi, Supabase SQL Editor akan menolak dengan
-- pesan "unsafe use of new value of enum type" atau sejenisnya.
--
-- Cara jalankan di Supabase SQL Editor:
--   1) Jalankan (Run) file 0021 ini SENDIRIAN, tunggu sampai selesai.
--   2) Baru jalankan file 0022 di query baru yang terpisah.
-- =====================================================================

alter type app_role_enum add value if not exists 'bendahara';
