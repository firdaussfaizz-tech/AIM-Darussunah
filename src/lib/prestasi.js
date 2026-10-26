// Konstanta modul Prestasi Siswa.

export const KATEGORI_OPTIONS = [
  { v: 'akademik', l: 'Akademik' },
  { v: 'non_akademik', l: 'Non-Akademik' },
]
export const KATEGORI_LABEL = { akademik: 'Akademik', non_akademik: 'Non-Akademik' }
export const KATEGORI_BADGE = { akademik: 'navy', non_akademik: 'gold' }

export const TINGKAT_OPTIONS = ['sekolah', 'kecamatan', 'kabupaten', 'provinsi', 'nasional', 'internasional']
export const TINGKAT_LABEL = {
  sekolah: 'Sekolah', kecamatan: 'Kecamatan', kabupaten: 'Kabupaten/Kota',
  provinsi: 'Provinsi', nasional: 'Nasional', internasional: 'Internasional',
}
export const TINGKAT_BADGE = {
  sekolah: 'neutral', kecamatan: 'neutral', kabupaten: 'navy',
  provinsi: 'gold', nasional: 'success', internasional: 'success',
}

// Saran isian (datalist) — bukan pembatas.
export const PERINGKAT_SUGGEST = ['Juara 1', 'Juara 2', 'Juara 3', 'Harapan 1', 'Harapan 2', 'Medali Emas', 'Medali Perak', 'Medali Perunggu', 'Finalis', 'Peserta']
export const BIDANG_SUGGEST = ['Matematika', 'Sains/IPA', 'Bahasa', 'Tahfidz Qur’an', 'Pidato/Dakwah', 'Olahraga', 'Seni', 'Teknologi/IT', 'Keagamaan', 'Lainnya']

export const tingkatLabel = (t) => TINGKAT_LABEL[t] || t || '—'
export const kategoriLabel = (k) => KATEGORI_LABEL[k] || k || '—'
