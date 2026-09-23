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
  { slug: 'perencanaan', label: 'Perencanaan', sop: 'perencanaan', kind: 'live-dka' },
  { slug: 'pengadaan', label: 'Pengadaan', sop: 'pengadaan', kind: 'menyusul' },
  { slug: 'penerimaan', label: 'Penerimaan & Penyaluran', sop: 'penyaluran', kind: 'menyusul' },
  { slug: 'penggunaan', label: 'Penggunaan', sop: 'penggunaan', kind: 'menyusul' },
  { slug: 'inventaris', label: 'Inventaris', sop: 'inventaris', kind: 'live-inventaris' },
  { slug: 'ruangan', label: 'Ruangan', sop: 'inventaris', kind: 'live-ruangan' },
  { slug: 'inventarisasi', label: 'Inventarisasi', sop: 'inventarisasi', kind: 'menyusul' },
  { slug: 'pemeliharaan', label: 'Pemeliharaan', sop: 'pemeliharaan', kind: 'menyusul' },
  { slug: 'penghapusan', label: 'Penghapusan', sop: 'penghapusan', kind: 'menyusul' },
  { slug: 'kodefikasi', label: 'Kodefikasi', sop: 'kodefikasi', kind: 'live-kodefikasi', fullAccessOnly: true },
  { slug: 'kebijakan', label: 'Kebijakan & SOP', sop: null, kind: 'kebijakan' },
]

// Area default saat membuka /aset tanpa slug.
export const SARPRAS_DEFAULT = 'inventaris'
