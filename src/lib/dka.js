// Modul DKA (Daftar Kebutuhan Aset) — label opsi & validasi harga.
// Mengangkat daftar rujukan dari Lampiran SOP Perencanaan & Penganggaran
// Aset (sheet "Ref") ke satu tempat agar konsisten dg dropdown FM-01.

export const DKA_STATUS_LABEL = {
  draft: 'Draft',
  diajukan: 'Diajukan',
  disahkan: 'Disahkan Yayasan',
  dikembalikan: 'Dikembalikan',
}
export const DKA_STATUS_BADGE = {
  draft: 'neutral',
  diajukan: 'gold',
  disahkan: 'success',
  dikembalikan: 'danger',
}

// Sheet "Ref" — Alasan Kebutuhan.
export const ALASAN_KEBUTUHAN_OPTIONS = [
  'Belum tersedia',
  'Jumlah kurang',
  'Penggantian rusak berat',
  'Penggantian hilang',
  'Penambahan rombel',
  'Penambahan pegawai',
  'Peningkatan mutu',
]

// Sheet "Ref" — Cara Pengadaan.
export const CARA_PENGADAAN_OPTIONS = [
  'Pembelian langsung',
  'Pemesanan khusus',
  'Sewa',
  'Hibah',
  'Pembangunan sendiri',
]

// Sheet "Ref" — Jenis Pemeliharaan.
export const JENIS_PEMELIHARAAN_OPTIONS = ['Preventif', 'Korektif']

// Sheet "Ref" — Sumber Anggaran.
export const SUMBER_ANGGARAN_OPTIONS = [
  'BOS',
  'Dana Yayasan',
  'SPP',
  'Infak',
  'Bantuan Pemerintah',
  'Donatur',
  'Lainnya',
]

// Status proses pengadaan per item DKA disahkan (Tahap Pengadaan → Penerimaan).
export const PENGADAAN_STATUS_LABEL = {
  menunggu: 'Menunggu Pengadaan',
  dipesan: 'Sudah Dipesan',
  pemeriksaan: 'Lolos Pemeriksaan',
  ditolak: 'Tidak Sesuai — Perlu Pemesanan Ulang',
  diterima: 'Diterima (masuk Inventaris)',
}
export const PENGADAAN_STATUS_BADGE = {
  menunggu: 'neutral',
  dipesan: 'gold',
  pemeriksaan: 'navy',
  ditolak: 'danger',
  diterima: 'success',
}

// SOP BAB IV — cara/metode realisasi pengadaan.
export const METODE_REALISASI_OPTIONS = [
  'Pembelian langsung',
  'Pengadaan langsung (SPK)',
  'Swakelola',
  'Hibah/Wakaf',
  'Tukar menukar',
]

// Validasi harga item vs Standar Harga (SOP): harga_satuan > standar →
// perlu justifikasi + persetujuan Ketua Yayasan. Tanpa standar → netral.
export function validasiHargaItem(item) {
  const harga = Number(item?.harga_satuan || 0)
  const standar = item?.standar_harga == null || item?.standar_harga === ''
    ? null
    : Number(item.standar_harga)
  if (standar == null || standar === 0) {
    return { status: 'tanpa_standar', label: 'Tanpa standar', badge: 'neutral', perluJustifikasi: false }
  }
  if (harga > standar) {
    return { status: 'melebihi', label: 'Di atas standar', badge: 'danger', perluJustifikasi: true }
  }
  return { status: 'sesuai', label: 'Sesuai standar', badge: 'success', perluJustifikasi: false }
}
