// Modul Academic Management (Manajemen Pembelajaran) — konstanta & area.

// Area = sub-menu /pembelajaran/<slug>. scope: 'manager' (khusus manajemen)
// atau 'all' (manajemen + guru; guru lihat data miliknya sendiri).
export const ACADEMIC_AREAS = [
  { slug: 'dashboard', label: 'Dashboard', scope: 'manager' },
  { slug: 'penugasan', label: 'Penugasan Mengajar', scope: 'manager' },
  { slug: 'jadwal', label: 'Jadwal Pelajaran', labelGuru: 'Jadwal Saya', scope: 'all' },
  { slug: 'jurnal', label: 'Jurnal KBM', scope: 'all' },
  { slug: 'kurikulum', label: 'Kurikulum & KKM', scope: 'manager' },
  { slug: 'ekstrakurikuler', label: 'Ekstrakurikuler', scope: 'manager' },
  { slug: 'perangkat', label: 'Perangkat Ajar & Monev', labelGuru: 'Perangkat Ajar Saya', scope: 'all' },
]
export const ACADEMIC_DEFAULT_MANAGER = 'dashboard'
export const ACADEMIC_DEFAULT_GURU = 'jadwal'

export const SEMESTER_OPTIONS = ['Ganjil', 'Genap']

export const HARI_LIST = [
  { v: 1, l: 'Senin' }, { v: 2, l: 'Selasa' }, { v: 3, l: 'Rabu' },
  { v: 4, l: 'Kamis' }, { v: 5, l: 'Jumat' }, { v: 6, l: 'Sabtu' }, { v: 7, l: 'Minggu' },
]
export const HARI_LABEL = Object.fromEntries(HARI_LIST.map((h) => [h.v, h.l]))

export const JENIS_PERANGKAT = ['RPP', 'Modul Ajar', 'Prota', 'Prosem', 'Silabus', 'ATP', 'KKTP']

export const KEHADIRAN_GURU_OPTIONS = ['hadir', 'izin', 'sakit', 'tugas', 'digantikan']
export const KEHADIRAN_GURU_LABEL = {
  hadir: 'Hadir', izin: 'Izin', sakit: 'Sakit', tugas: 'Tugas Dinas', digantikan: 'Digantikan',
}

export const PERANGKAT_STATUS_LABEL = {
  draft: 'Draft', dikumpulkan: 'Dikumpulkan', diverifikasi: 'Terverifikasi', revisi: 'Perlu Revisi',
}
export const PERANGKAT_STATUS_BADGE = {
  draft: 'neutral', dikumpulkan: 'gold', diverifikasi: 'success', revisi: 'danger',
}
