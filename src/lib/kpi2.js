// Logika Sistem KPI (mutu ISO 9001). Rumus identik dengan model mutu:
// capaian naik = real/target×100; turun = target/real×100; skor = min(capaian,100);
// nilai berbobot = skor×bobot/100. Σ bobot indikator per jenjang = 100.

export function capaian(target, real, arah) {
  if (real === '' || real === null || real === undefined || Number.isNaN(Number(real))) return null
  const r = Number(real); const t = Number(target)
  if (arah === 'naik') return t === 0 ? 100 : (r / t) * 100
  return r === 0 ? 120 : (t / r) * 100
}
export const skor = (cap) => (cap === null ? null : Math.min(cap, 100))

export function predikat(n) {
  if (n === null || Number.isNaN(n)) return { k: '-', t: 'Belum dinilai', color: 'slate' }
  if (n >= 95) return { k: 'A', t: 'Sangat Baik', color: 'success' }
  if (n >= 85) return { k: 'B', t: 'Baik', color: 'success' }
  if (n >= 70) return { k: 'C', t: 'Cukup', color: 'gold' }
  if (n >= 60) return { k: 'D', t: 'Kurang', color: 'gold' }
  return { k: 'E', t: 'Sangat Kurang', color: 'danger' }
}
// Warna hex untuk grafik (donut/bar) — selaras badge.
export function predikatHex(n) {
  if (n === null || Number.isNaN(n)) return '#94a3b8'
  if (n >= 95) return '#2e7d32'
  if (n >= 85) return '#43a047'
  if (n >= 70) return '#f9a825'
  if (n >= 60) return '#fb8c00'
  return '#e53935'
}
export const fmt = (n, d = 1) => (n === null || n === undefined || Number.isNaN(Number(n)) ? '–' : Number(n).toFixed(d))

// Skor satu bidang (0–100) dari indikatornya + realisasi {indikator_id: nilai}.
export function skorBidang(indikators, realisasi) {
  let tot = 0; let bobot = 0
  for (const i of indikators) {
    const s = skor(capaian(i.target, realisasi[i.id], i.arah))
    if (s !== null) { tot += s * Number(i.bobot); bobot += Number(i.bobot) }
  }
  return bobot > 0 ? tot / bobot : null
}
// Skor sekolah (0–100) = Σ(skor×bobot)/Σbobot seluruh indikator terisi.
export function skorSekolah(indikators, realisasi) {
  return skorBidang(indikators, realisasi)
}
// Skor individu dari aspek profil + realisasi {aspek_id: nilai}.
export function skorIndividu(aspek, realisasi) {
  return skorBidang(aspek, realisasi) // rumus sama (berbobot, ternormalisasi)
}

// Kelompokkan indikator per bidang (urut sesuai bidang.urutan lalu indikator.urutan).
export function kelompokBidang(bidangList, indikators) {
  return bidangList
    .slice().sort((a, b) => a.urutan - b.urutan)
    .map((b) => ({ ...b, indikator: indikators.filter((i) => i.bidang_kode === b.kode).sort((x, y) => x.urutan - y.urutan) }))
    .filter((b) => b.indikator.length > 0)
}

export const SEMESTER = ['Ganjil', 'Genap']
export const SUMBER_LABEL = {
  manual: 'Manual',
  kehadiran_mengajar: 'Kehadiran mengajar (otomatis)',
  kehadiran_siswa: 'Kehadiran siswa (otomatis)',
  kehadiran_pegawai: 'Kehadiran pegawai (otomatis)',
  rata_nilai_kinerja: 'Rata nilai kinerja (otomatis)',
  tunggakan_spp: 'Kolektibilitas SPP (otomatis)',
}
// Teks format perhitungan satu indikator/aspek (target, arah, bobot, sumber).
export function rumusText(item) {
  const t = item.target
  const cap = item.arah === 'naik'
    ? `Capaian = (Realisasi ÷ ${t}) × 100%`
    : `Capaian = (${t} ÷ Realisasi) × 100%`
  const arahNote = item.arah === 'naik' ? 'makin tinggi makin baik' : 'makin rendah makin baik'
  let s = `${cap} · Skor = min(Capaian, 100) · Kontribusi = Skor × ${item.bobot}% · ${arahNote}`
  if (item.sumber && item.sumber !== 'manual') s += ` · Sumber: ${SUMBER_LABEL[item.sumber] || item.sumber}`
  return s
}

export const tahunPelajaranSekarang = () => {
  const d = new Date(); const y = d.getFullYear()
  return d.getMonth() + 1 >= 7 ? `${y}/${y + 1}` : `${y - 1}/${y}`
}
