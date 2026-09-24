// Modul Academic Management (Manajemen Pembelajaran) — konstanta & area.

// Area = sub-menu /pembelajaran/<slug>. scope: 'manager' (khusus manajemen)
// atau 'all' (manajemen + guru; guru lihat data miliknya sendiri).
export const ACADEMIC_AREAS = [
  { slug: 'dashboard', label: 'Dashboard', scope: 'manager' },
  { slug: 'kalender', label: 'Kalender Akademik', scope: 'all' },
  { slug: 'mapel', label: 'Mata Pelajaran', scope: 'manager' },
  { slug: 'penugasan', label: 'Penugasan Mengajar', scope: 'manager' },
  { slug: 'jadwal', label: 'Jadwal Pelajaran', labelGuru: 'Jadwal Saya', scope: 'all' },
  { slug: 'jurnal', label: 'Jurnal KBM', scope: 'all' },
  { slug: 'rekap-kbm', label: 'Rekap Kehadiran Mengajar', labelGuru: 'Kehadiran Mengajar Saya', scope: 'all' },
  { slug: 'kurikulum', label: 'Kurikulum & KKM', scope: 'manager' },
  { slug: 'ekstrakurikuler', label: 'Ekstrakurikuler', scope: 'manager' },
  { slug: 'perangkat', label: 'Perangkat Ajar & Monev', labelGuru: 'Perangkat Ajar Saya', scope: 'all' },
  { slug: 'ppdb', label: 'PPDB', scope: 'manager' },
]

// Kalender Akademik
export const JENIS_KALENDER = ['kegiatan', 'ujian', 'rapat', 'pembagian_rapor', 'libur', 'lainnya']
export const JENIS_KALENDER_LABEL = {
  kegiatan: 'Kegiatan', ujian: 'Ujian (PTS/PAS/UTS/UAS)', rapat: 'Rapat', pembagian_rapor: 'Pembagian Rapor', libur: 'Libur', lainnya: 'Lainnya',
}
export const JENIS_KALENDER_BADGE = {
  kegiatan: 'navy', ujian: 'gold', rapat: 'neutral', pembagian_rapor: 'success', libur: 'danger', lainnya: 'neutral',
}

// PPDB
export const PPDB_STATUS = ['daftar', 'verifikasi', 'diterima', 'cadangan', 'ditolak', 'mengundurkan_diri']
export const PPDB_STATUS_LABEL = {
  daftar: 'Mendaftar', verifikasi: 'Terverifikasi', diterima: 'Diterima', cadangan: 'Cadangan', ditolak: 'Tidak Diterima', mengundurkan_diri: 'Mengundurkan Diri',
}
export const PPDB_STATUS_BADGE = {
  daftar: 'neutral', verifikasi: 'navy', diterima: 'success', cadangan: 'gold', ditolak: 'danger', mengundurkan_diri: 'neutral',
}
export const PPDB_JALUR = ['Reguler', 'Prestasi', 'Afirmasi', 'Pindahan', 'Tahfidz']

// Perangkat ajar yang wajib dilengkapi (bawaan Kurikulum Merdeka; bisa diubah di layar rekap).
export const PERANGKAT_WAJIB_DEFAULT = ['Modul Ajar', 'ATP', 'Prota', 'Prosem', 'KKTP']

// Hari ISO (1=Senin..7=Minggu) dari objek Date.
export const hariIso = (d) => { const x = d.getDay(); return x === 0 ? 7 : x }

// Dua slot jadwal bentrok bila hari sama dan (jam ke- sama ATAU rentang waktu beririsan).
export function slotBentrok(a, b) {
  if (Number(a.hari) !== Number(b.hari)) return false
  if (a.jam_ke != null && b.jam_ke != null && Number(a.jam_ke) === Number(b.jam_ke)) return true
  const s1 = a.jam_mulai?.slice(0, 5); const e1 = a.jam_selesai?.slice(0, 5)
  const s2 = b.jam_mulai?.slice(0, 5); const e2 = b.jam_selesai?.slice(0, 5)
  return !!(s1 && e1 && s2 && e2 && s1 < e2 && s2 < e1)
}
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

// Buka halaman cetak dokumen akademik di tab baru (siap print/PDF).
export function openCetakAkd(jenis, id, qs) {
  const q = qs ? `?${new URLSearchParams(Object.fromEntries(Object.entries(qs).filter(([, v]) => v != null && v !== '')))}` : ''
  window.open(`/cetak/${jenis}${id ? `/${id}` : ''}${q}`, '_blank', 'noopener')
}

// Tanggal ISO (YYYY-MM-DD) waktu lokal.
export const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// Rekap kehadiran mengajar per guru dari Jurnal KBM, dibandingkan jumlah
// sesi yang SEHARUSNYA terjadi menurut Jadwal (hari efektif, tanpa libur).
//   terlaksana% = (hadir + tugas dinas) / jurnal terisi
//   keterisian% = jurnal terisi / sesi terjadwal
export function hitungRekapKbm({ jurnal = [], jadwal = [], libur = [], d1, d2 }) {
  const liburSet = new Set(libur)
  const slotPerHari = {} // emp -> {hari: n}
  const nama = {}
  for (const s of jadwal) {
    if (!s.employee_id) continue
    nama[s.employee_id] = nama[s.employee_id] || s.employees?.nama
    const m = (slotPerHari[s.employee_id] ||= {})
    m[s.hari] = (m[s.hari] || 0) + 1
  }
  const hariEfektif = {} // hari iso -> jumlah tanggal dalam rentang
  if (d1 && d2) {
    const end = new Date(`${d2}T00:00:00`)
    for (let d = new Date(`${d1}T00:00:00`); d <= end; d.setDate(d.getDate() + 1)) {
      if (liburSet.has(isoLocal(d))) continue
      const h = hariIso(d)
      hariEfektif[h] = (hariEfektif[h] || 0) + 1
    }
  }
  const out = {}
  const row = (id) => (out[id] ||= { employee_id: id, nama: nama[id] || '—', jurnal: 0, hadir: 0, tugas: 0, izin: 0, sakit: 0, digantikan: 0, terjadwal: 0 })
  for (const [emp, perHari] of Object.entries(slotPerHari)) {
    const r = row(emp)
    for (const [h, n] of Object.entries(perHari)) r.terjadwal += n * (hariEfektif[h] || 0)
  }
  for (const j of jurnal) {
    if (!j.employee_id) continue
    const r = row(j.employee_id)
    if (j.employees?.nama) r.nama = j.employees.nama
    r.jurnal++
    if (r[j.kehadiran_guru] != null) r[j.kehadiran_guru]++
  }
  return Object.values(out).map((r) => ({
    ...r,
    terlaksanaPct: r.jurnal > 0 ? Math.round(((r.hadir + r.tugas) / r.jurnal) * 100) : null,
    keterisianPct: r.terjadwal > 0 ? Math.min(100, Math.round((r.jurnal / r.terjadwal) * 100)) : null,
  })).sort((a, b) => a.nama.localeCompare(b.nama))
}

// Daftar tanggal libur (YYYY-MM-DD) dari entri Kalender Akademik berjenis 'libur'.
export function liburDariKalender(rows = []) {
  const out = []
  for (const r of rows) {
    if (r.jenis !== 'libur' || !r.tanggal_mulai) continue
    const end = new Date(`${r.tanggal_selesai || r.tanggal_mulai}T00:00:00`)
    for (let d = new Date(`${r.tanggal_mulai}T00:00:00`); d <= end; d.setDate(d.getDate() + 1)) out.push(isoLocal(d))
  }
  return out
}
