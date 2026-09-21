export function formatRupiah(value) {
  const n = Number(value) || 0
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(n)
}

export function formatDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(d)
}

export const BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]

export const STATUS_KEPEGAWAIAN_OPTIONS = ['PNS Dipekerjakan', 'Tetap Yayasan', 'Kontrak', 'Honorer', 'GTT', 'PTT']
export const EMPLOYEE_STATUS_OPTIONS = ['aktif', 'cuti', 'nonaktif', 'pensiun']
export const ROLE_OPTIONS = ['admin_yayasan', 'hr', 'admin_sekolah', 'kepala_sekolah', 'guru', 'staff', 'bendahara']

export const ROLE_LABELS = {
  admin_yayasan: 'Admin Yayasan',
  hr: 'HR / Kepegawaian',
  admin_sekolah: 'Admin Sekolah',
  kepala_sekolah: 'Kepala Sekolah',
  guru: 'Guru',
  staff: 'Staf',
  bendahara: 'Bendahara',
}

// ---- Modul Kesiswaan ----
export const SISWA_STATUS_OPTIONS = ['aktif', 'lulus', 'pindah', 'keluar']
export const SISWA_STATUS_LABELS = {
  aktif: 'Aktif',
  lulus: 'Lulus',
  pindah: 'Pindah',
  keluar: 'Keluar',
}
export const JENIS_DOKUMEN_SISWA_OPTIONS = [
  { value: 'akta_lahir', label: 'Akta Lahir' },
  { value: 'kartu_keluarga', label: 'Kartu Keluarga' },
  { value: 'ijazah_sebelumnya', label: 'Ijazah Jenjang Sebelumnya' },
  { value: 'foto', label: 'Foto' },
  { value: 'lainnya', label: 'Lainnya' },
]

export const STATUS_BADGE_COLOR = {
  aktif: 'success',
  hadir: 'success',
  disetujui: 'success',
  final: 'success',
  selesai: 'success',
  cuti: 'gold',
  izin: 'gold',
  pending: 'gold',
  draft: 'gold',
  terdaftar: 'gold',
  nonaktif: 'danger',
  alpa: 'danger',
  ditolak: 'danger',
  tidak_hadir: 'danger',
  pensiun: 'neutral',
  sakit: 'navy',
  dinas_luar: 'navy',
  berakhir: 'neutral',
  diperpanjang: 'navy',
  lulus: 'navy',
  pindah: 'gold',
  keluar: 'danger',
}
