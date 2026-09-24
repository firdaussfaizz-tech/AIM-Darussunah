// Modul Manajemen Keuangan — RKAS (Anggaran), Buku Kas, & Laporan.
// Status workflow RKAS memakai kosakata & enum yang sama dengan DKA
// Sarpras (public.dka_status_enum) karena polanya identik.

export const RKAS_STATUS_LABEL = {
  draft: 'Draft',
  diajukan: 'Diajukan',
  disahkan: 'Disahkan Yayasan',
  dikembalikan: 'Dikembalikan',
}
export const RKAS_STATUS_BADGE = {
  draft: 'neutral',
  diajukan: 'gold',
  disahkan: 'success',
  dikembalikan: 'danger',
}

// Dipakai juga sebagai opsi "sumber dana" pada Buku Kas & RKAS — sengaja
// disamakan dengan SUMBER_ANGGARAN_OPTIONS di lib/dka.js supaya satu
// kosakata dari perencanaan Sarpras s/d realisasi keuangan.
export const SUMBER_DANA_OPTIONS = [
  'BOS',
  'Dana Yayasan',
  'SPP',
  'Infak',
  'Bantuan Pemerintah',
  'Donatur',
  'Lainnya',
]

// Bidang belanja RKAS (kategori tingkat tinggi untuk pengelompokan laporan).
export const BIDANG_BELANJA_OPTIONS = [
  'Kurikulum & Pembelajaran',
  'Kesiswaan',
  'Sarana Prasarana',
  'Kepegawaian',
  'Operasional Kantor',
  'Humas & Kerja Sama',
  'Lainnya',
]

// Kategori transaksi Buku Kas — 'SPP', 'Pengadaan', 'Penggajian' dibuat
// otomatis oleh sistem (lihat referensi_tabel); sisanya dientri manual.
export const KATEGORI_KAS_OPTIONS = [
  'SPP',
  'Infak',
  'Donasi',
  'Bantuan Pemerintah',
  'Pengadaan',
  'Penggajian',
  'Operasional',
  'Pemeliharaan',
  'Kegiatan',
  'Lainnya',
]

export const JENIS_KAS_LABEL = { masuk: 'Pemasukan', keluar: 'Pengeluaran' }
export const JENIS_KAS_BADGE = { masuk: 'success', keluar: 'danger' }

// Sumber pencatatan — menandai baris yang dibuat otomatis oleh sistem
// (tidak bisa diubah/dihapus manual, lihat trigger buku_kas_guard_auto).
export const SUMBER_KAS_LABEL = {
  Manual: 'Entri Manual',
  SPP: 'Otomatis — Pembayaran SPP',
  Pengadaan: 'Otomatis — Realisasi Pengadaan',
  Penggajian: 'Otomatis — Penggajian',
}

export function isTransaksiOtomatis(trx) {
  return Boolean(trx?.referensi_id)
}

// Rekap saldo berjalan dihitung di frontend (bukan kolom tersimpan di DB)
// supaya selalu konsisten walau ada koreksi/penghapusan transaksi. Urutkan
// dulu berdasarkan tanggal lalu created_at sebelum memanggil fungsi ini.
export function hitungSaldoBerjalan(transaksiTerurut) {
  let saldo = 0
  return transaksiTerurut.map((trx) => {
    saldo += trx.jenis === 'masuk' ? Number(trx.nominal || 0) : -Number(trx.nominal || 0)
    return { ...trx, saldo_berjalan: saldo }
  })
}

export function totalKas(transaksi, jenis) {
  return transaksi
    .filter((t) => t.jenis === jenis)
    .reduce((sum, t) => sum + Number(t.nominal || 0), 0)
}

// Definisi area modul Keuangan — dipakai bersama oleh Sidebar (Layout) &
// halaman /keuangan/:area (KeuanganManagement), sama pola dgn lib/sarpras.js.
export const KEUANGAN_AREAS = [
  { slug: 'dashboard', label: 'Dashboard', kind: 'live-dashboard' },
  { slug: 'rkas', label: 'RKAS / Anggaran', kind: 'live-rkas' },
  { slug: 'buku-kas', label: 'Buku Kas', kind: 'live-buku-kas' },
  { slug: 'laporan', label: 'Laporan', kind: 'live-laporan' },
]

export const KEUANGAN_DEFAULT = 'dashboard'
