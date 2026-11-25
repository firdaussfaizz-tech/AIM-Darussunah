// Definisi area modul Sarana & Prasarana (Manajemen Aset), urut siklus
// hidup aset (juknis BAB III–XIII). Dipakai bersama oleh Sidebar (Layout)
// & halaman /aset/:area (AsetList) agar sumber kebenarannya satu.
//
//   slug   : bagian URL /aset/<slug>
//   label  : teks menu & judul
//   sop    : kunci SOP di sopSarpras.js (null = tab kebijakan)
//   kind   : live-* (fitur sudah ada) | menyusul | kebijakan
//   fullAccessOnly : hanya Yayasan (Admin Yayasan/HR)
export const SARPRAS_AREAS = [
  { slug: 'dashboard', label: 'Dashboard', sop: null, kind: 'live-dashboard', modul: 'srp_dashboard' },
  { slug: 'perencanaan', label: 'Perencanaan', sop: 'perencanaan', kind: 'live-dka', modul: 'srp_perencanaan' },
  { slug: 'pengadaan', label: 'Pengadaan', sop: 'pengadaan', kind: 'live-pengadaan', modul: 'srp_pengadaan' },
  { slug: 'penerimaan', label: 'Penerimaan & Penyaluran', sop: 'penyaluran', kind: 'live-penyaluran', modul: 'srp_penerimaan' },
  { slug: 'penggunaan', label: 'Penggunaan', sop: 'penggunaan', kind: 'live-penggunaan', modul: 'srp_penggunaan' },
  { slug: 'inventaris', label: 'Inventaris', sop: 'inventaris', kind: 'live-inventaris', modul: 'srp_inventaris' },
  { slug: 'ruangan', label: 'Ruangan', sop: 'inventaris', kind: 'live-ruangan', modul: 'srp_ruangan' },
  { slug: 'habis-pakai', label: 'Barang Habis Pakai', sop: 'penyaluran', kind: 'live-bhp', modul: 'srp_bhp' },
  { slug: 'inventarisasi', label: 'Inventarisasi', sop: 'inventarisasi', kind: 'live-inventarisasi', modul: 'srp_inventarisasi' },
  { slug: 'pemeliharaan', label: 'Pemeliharaan', sop: 'pemeliharaan', kind: 'live-pemeliharaan', modul: 'srp_pemeliharaan' },
  { slug: 'penghapusan', label: 'Penghapusan', sop: 'penghapusan', kind: 'live-penghapusan', modul: 'srp_penghapusan' },
  { slug: 'kodefikasi', label: 'Kodefikasi', sop: 'kodefikasi', kind: 'live-kodefikasi', fullAccessOnly: true, modul: 'srp_kodefikasi' },
  { slug: 'dokumen', label: 'Dokumen & Formulir', sop: null, kind: 'live-dokumen', modul: 'srp_dokumen' },
  { slug: 'kebijakan', label: 'Kebijakan & SOP', sop: null, kind: 'kebijakan', modul: 'srp_kebijakan' },
]

// Area default saat membuka /aset tanpa slug.
export const SARPRAS_DEFAULT = 'dashboard'
