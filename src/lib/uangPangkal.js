// Konstanta modul Uang Pangkal & Program siswa (Fullday/Boarding).
// Dipakai halaman Uang Pangkal, form siswa, dan tab Tagihan akumulatif.

export const PROGRAM_OPTIONS = [
  { v: 'fullday', l: 'Fullday' },
  { v: 'boarding', l: 'Boarding' },
]
export const PROGRAM_LABEL = { fullday: 'Fullday', boarding: 'Boarding' }
export const PROGRAM_BADGE = { fullday: 'navy', boarding: 'gold' }

// Komponen "SPP (bulan pertama)" = daftar ulang. Dipakai sebagai penanda
// agar tidak dobel dengan SPP bulanan.
export const KOMPONEN_SPP = 'SPP (bulan pertama)'

// Preset komponen uang pangkal per program (nominal diisi di Tarif).
// Boarding = komponen fullday + Sarana.
export const UP_KOMPONEN_PRESET = {
  fullday: [KOMPONEN_SPP, 'Gedung', 'Pendidikan', 'Buku', 'Seragam'],
  boarding: [KOMPONEN_SPP, 'Gedung', 'Pendidikan', 'Buku', 'Seragam', 'Sarana'],
}

export const programLabel = (p) => PROGRAM_LABEL[p] || p || '—'
