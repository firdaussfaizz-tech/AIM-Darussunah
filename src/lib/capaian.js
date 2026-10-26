// Helper Capaian/Progres Pembelajaran — ketuntasan nilai terhadap KKM
// (Kurikulum & KKM, modul Akademik). Logika diselaraskan dengan Nilai & Rapor.

export const SEMESTER_NILAI = [
  { v: 'ganjil', l: 'Ganjil' },
  { v: 'genap', l: 'Genap' },
]
export function tebakSemesterNilai() {
  return (new Date().getMonth() + 1) >= 7 ? 'ganjil' : 'genap'
}

// Nilai akhir = rata-rata pengetahuan & keterampilan yang terisi.
export function nilaiAkhir(p, k) {
  const arr = [p, k].filter((x) => x !== '' && x != null && !Number.isNaN(Number(x))).map(Number)
  return arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100 : null
}

export function statusTuntas(p, k, kkm) {
  if (kkm == null) return null
  const na = nilaiAkhir(p, k)
  if (na == null) return null
  return na >= kkm ? 'Tuntas' : 'Belum Tuntas'
}

// Pilih KKM paling spesifik dari daftar kurikulum_kkm untuk satu mapel.
// Prioritas: tingkat (4) > semester (2) > tahun ajaran (1). semester
// dibandingkan case-insensitive (KKM 'Ganjil' vs nilai 'ganjil').
export function pilihKkm(kkmRows, { mataPelajaranId, tingkat, semester, tahunAjaranId }) {
  let best = null
  for (const k of kkmRows || []) {
    if (k.mata_pelajaran_id !== mataPelajaranId || k.kkm == null) continue
    if (k.tingkat && tingkat != null && String(k.tingkat).trim() !== String(tingkat).trim()) continue
    if (k.semester && semester && String(k.semester).toLowerCase() !== String(semester).toLowerCase()) continue
    if (k.tahun_ajaran_id && tahunAjaranId && k.tahun_ajaran_id !== tahunAjaranId) continue
    const skor = (k.tingkat ? 4 : 0) + (k.semester ? 2 : 0) + (k.tahun_ajaran_id ? 1 : 0)
    if (!best || skor > best.skor) best = { kkm: Number(k.kkm), skor }
  }
  return best ? best.kkm : null
}
