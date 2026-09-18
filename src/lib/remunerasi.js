// =====================================================================
// Mesin perhitungan Indeks Kehadiran (IH), Indeks Kinerja (IK), dan
// Tunjangan Remunerasi.
//
// Sumber (dibaca langsung dari kedua dokumen, bukan kutipan tidak
// langsung):
//   - SK Nomor 01.012/SK-YDC/VIII/26 "Panduan Penggajian dan Remunerasi"
//     Pasal 4 (Gaji Pokok), Pasal 7 (Tunjangan Remunerasi), Pasal 8-10
//     (Indeks Kinerja), Pasal 11 (Indeks Kehadiran), Pasal 12 (contoh).
//   - Draft SK Waktu Kerja, Izin, dan Cuti YPI Darussunah, Pasal 24
//     (Matriks Pengaruh terhadap Indeks Kehadiran) dan Pasal 25
//     (Penegasan Pembacaan SK 01.012).
//
// Keputusan yang sudah dikonfirmasi bersama pengguna (2026-09-18):
//   - Potongan Alpa (0,10) berlaku PER HARI/PER KEJADIAN, dikalikan
//     jumlah kejadian dalam bulan berjalan (bukan sekali per bulan).
//   - Izin pribadi (ITMK) & Sakit tanpa Surat Keterangan Dokter yang
//     melewati batas kuota bulanan sama-sama dikenakan potongan 0,05
//     per kejadian (bukan 0,5 — angka di Pasal 11 ayat 4 SK 01.012
//     dianggap salah ketik; Pasal 24 Draft SK yang menjadi acuan).
//   - Batas kuota "sakit tanpa SKD" tidak didefinisikan eksplisit di
//     kedua SK, sehingga nilainya mengikuti kolom leave_types (dapat
//     diubah admin di halaman Jenis Cuti & Izin), default disamakan
//     dengan izin pribadi (2 hari/bulan).
// =====================================================================

/** Batas waktu terlambat datang, Pasal 8 ayat (1) Draft SK. */
export const LATE_THRESHOLD = '06:55:00'

/** Tabel Indeks Kinerja (IK), Pasal 8 ayat 2 SK 01.012 jo. Pasal 25 Draft SK. */
export const IK_TABLE = [
  { kategori: 'A', min: 91, max: 100, indeks: 1.00, label: 'Sangat Baik' },
  { kategori: 'B', min: 76, max: 90, indeks: 0.85, label: 'Baik' },
  { kategori: 'C', min: 61, max: 75, indeks: 0.70, label: 'Cukup' },
  { kategori: 'D', min: 0, max: 60, indeks: 0.50, label: 'Kurang' },
]

/** Ambil baris kategori IK dari skor 0-100. */
export function kategoriFromSkor(skor) {
  if (skor == null || Number.isNaN(Number(skor))) return null
  const s = Number(skor)
  return IK_TABLE.find((r) => s >= r.min && s <= r.max) || IK_TABLE[IK_TABLE.length - 1]
}

/** Ambil nilai indeks kinerja (angka) dari kode kategori A/B/C/D. */
export function indeksFromKategori(kategori) {
  return IK_TABLE.find((r) => r.kategori === kategori)?.indeks ?? null
}

/** Tabel dasar Indeks Kehadiran dari persentase kehadiran efektif, Pasal 11 ayat 7 SK 01.012. */
export const IH_BASE_TABLE = [
  { batasBawah: 100, ih: 1.00, label: 'Kehadiran sempurna' },
  { batasBawah: 95, ih: 0.95, label: 'Kehadiran sangat baik' },
  { batasBawah: 90, ih: 0.85, label: 'Kehadiran baik' },
  { batasBawah: 85, ih: 0.70, label: 'Kehadiran cukup' },
  { batasBawah: 80, ih: 0.50, label: 'Kehadiran kurang' },
  { batasBawah: 0, ih: 0.00, label: 'Tidak berhak atas Tunjangan Remunerasi bulan berjalan' },
]

export function ihDasarDariPersen(persen) {
  const row = IH_BASE_TABLE.find((r) => persen >= r.batasBawah)
  return row || IH_BASE_TABLE[IH_BASE_TABLE.length - 1]
}

/**
 * Hitung Ruang (A-D) dari masa kerja efektif, Pasal 4 ayat 3 SK 01.012:
 * A: 0-4 th, B: 5-9 th, C: 10-14 th, D: >=15 th.
 */
export function hitungRuang(tanggalMasuk, tanggalRef = new Date()) {
  if (!tanggalMasuk) return null
  const masuk = new Date(tanggalMasuk)
  const ref = new Date(tanggalRef)
  let tahun = ref.getFullYear() - masuk.getFullYear()
  const bedaBulan = ref.getMonth() - masuk.getMonth()
  if (bedaBulan < 0 || (bedaBulan === 0 && ref.getDate() < masuk.getDate())) tahun -= 1
  if (tahun >= 15) return 'D'
  if (tahun >= 10) return 'C'
  if (tahun >= 5) return 'B'
  return 'A'
}

/** Ambil baris {gaji_pokok, nilai_jabatan} dari data salary_scale. */
export function ambilSkalaGaji(salaryScaleRows, golongan, ruang) {
  if (!golongan || !ruang) return null
  return salaryScaleRows.find((r) => r.golongan === golongan && r.ruang === ruang) || null
}

/**
 * Hitung jumlah Hari Kerja Wajib dalam satu bulan.
 * ASUMSI: mengikuti pola Pegawai Reguler (Senin-Sabtu kerja, Minggu
 * libur) dari Pasal 3 Draft SK, BELUM memperhitungkan hari libur
 * nasional/kalender pendidikan — lihat catatan di UI transparansi.
 */
export function hitungHariKerjaWajibDefault(tahun, bulan) {
  const totalHari = new Date(tahun, bulan, 0).getDate()
  let count = 0
  for (let d = 1; d <= totalHari; d++) {
    const dow = new Date(tahun, bulan - 1, d).getDay()
    if (dow !== 0) count++
  }
  return count
}

/**
 * Mesin utama: hitung Indeks Kehadiran satu pegawai untuk satu bulan.
 *
 * @param {Object} params
 * @param {Array} params.attendanceRows - baris `attendance` bulan berjalan,
 *   masing-masing boleh menyertakan relasi `leave_requests` (dengan
 *   `dokumen_terlampir`, `durasi_jam`) dan `leave_requests.leave_types`
 *   (dengan `kode`, `nilai_hari_hadir`, `hitung_hari_kerja_wajib`,
 *   `batas_kejadian_per_bulan`, `pengurangan_ih_setelah_batas`).
 * @param {number} params.tahun
 * @param {number} params.bulan - 1-12
 * @param {Object} [params.scheduleByDay] - { 0..6: { jam_pulang: 'HH:MM:SS' } }, 0 = Minggu
 * @param {Array} [params.manualAdjustments] - koreksi manual admin:
 *   [{ jenis: 'tidak_ikut_rapat', jumlah_kejadian }, { jenis: 'lainnya', nilai_pengurangan, keterangan }]
 * @param {string} [params.lateThreshold]
 */
export function hitungIH({
  attendanceRows = [],
  tahun,
  bulan,
  scheduleByDay = null,
  manualAdjustments = [],
  lateThreshold = LATE_THRESHOLD,
}) {
  const totalHariBulan = new Date(tahun, bulan, 0).getDate()
  const attendanceByDate = {}
  attendanceRows.forEach((r) => { attendanceByDate[r.tanggal] = r })

  let hariKerjaWajib = 0
  let hariHadirPenuh = 0
  let terlambatCount = 0
  let pulangAwalCount = 0
  let alpaCount = 0
  const byKodeCount = {}
  const byKodeMeta = {}
  const detail = []

  for (let d = 1; d <= totalHariBulan; d++) {
    const dow = new Date(tahun, bulan - 1, d).getDay()
    const iso = `${tahun}-${String(bulan).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const jadwalHari = scheduleByDay?.[dow]
    const hariLiburMingguan = jadwalHari ? jadwalHari.aktif === false : dow === 0
    if (hariLiburMingguan) continue

    const att = attendanceByDate[iso]
    const lr = att?.leave_requests
    const lt = lr?.leave_types

    if (att?.leave_request_id && lt) {
      const kode = lt.kode
      let nilaiHadir = lt.nilai_hari_hadir
      // Kasus khusus per kode (dibedakan dari data pengajuan, bukan hardcode nilai):
      if (kode === 'IMTS' && lr.durasi_jam != null && Number(lr.durasi_jam) > 2) nilaiHadir = 0
      if (kode === 'IS' && !lr.dokumen_terlampir) nilaiHadir = 0

      if (lt.hitung_hari_kerja_wajib) hariKerjaWajib++
      if (nilaiHadir != null) hariHadirPenuh += Number(nilaiHadir)
      if (lt.batas_kejadian_per_bulan != null) {
        byKodeCount[kode] = (byKodeCount[kode] || 0) + 1
        byKodeMeta[kode] = lt
      }
      detail.push({
        tanggal: iso, jenis: 'leave', kode, nama: lt.nama,
        nilaiHadir, hitungWajib: lt.hitung_hari_kerja_wajib,
      })
      continue
    }

    hariKerjaWajib++

    if (!att || att.status === 'alpa') {
      alpaCount++
      detail.push({ tanggal: iso, jenis: 'alpa', nilaiHadir: 0 })
      continue
    }

    if (att.status === 'hadir') {
      hariHadirPenuh += 1
      let terlambat = false
      let pulangAwal = false
      if (att.jam_masuk && att.jam_masuk > lateThreshold) { terlambat = true; terlambatCount++ }
      if (jadwalHari?.jam_pulang && att.jam_pulang && att.jam_pulang < jadwalHari.jam_pulang) { pulangAwal = true; pulangAwalCount++ }
      detail.push({ tanggal: iso, jenis: 'hadir', nilaiHadir: 1, terlambat, pulangAwal })
      continue
    }

    // status izin/sakit/cuti/dinas_luar tapi belum tertaut ke pengajuan resmi
    // (leave_request_id kosong) — dihitung tidak hadir secara default,
    // dan ditandai di rincian agar admin bisa menautkannya.
    detail.push({ tanggal: iso, jenis: att.status, nilaiHadir: 0, belumTertaut: true })
  }

  const persentase = hariKerjaWajib > 0 ? (hariHadirPenuh / hariKerjaWajib) * 100 : 100
  const ihDasarRow = ihDasarDariPersen(persentase)

  let pengurangan = 0
  const rincianPengurangan = []

  if (terlambatCount > 0) { const v = terlambatCount * 0.02; pengurangan += v; rincianPengurangan.push({ label: 'Terlambat datang', kejadian: terlambatCount, nilai: v }) }
  if (pulangAwalCount > 0) { const v = pulangAwalCount * 0.02; pengurangan += v; rincianPengurangan.push({ label: 'Pulang sebelum waktunya', kejadian: pulangAwalCount, nilai: v }) }
  if (alpaCount > 0) { const v = alpaCount * 0.10; pengurangan += v; rincianPengurangan.push({ label: 'Alpa (tidak hadir tanpa keterangan)', kejadian: alpaCount, nilai: v }) }

  const rapatAdj = manualAdjustments.filter((a) => a.jenis === 'tidak_ikut_rapat')
  const rapatCount = rapatAdj.reduce((s, a) => s + (a.jumlah_kejadian || 1), 0)
  if (rapatCount > 0) { const v = rapatCount * 0.02; pengurangan += v; rincianPengurangan.push({ label: 'Tidak mengikuti rapat/upacara wajib', kejadian: rapatCount, nilai: v }) }

  const lainAdj = manualAdjustments.filter((a) => a.jenis === 'lainnya')
  lainAdj.forEach((a) => {
    pengurangan += a.nilai_pengurangan || 0
    rincianPengurangan.push({ label: a.keterangan || 'Koreksi manual', kejadian: 1, nilai: a.nilai_pengurangan || 0 })
  })

  Object.entries(byKodeCount).forEach(([kode, count]) => {
    const meta = byKodeMeta[kode]
    if (!meta?.batas_kejadian_per_bulan) return
    const lebih = Math.max(0, count - meta.batas_kejadian_per_bulan)
    if (lebih > 0) {
      const v = lebih * (meta.pengurangan_ih_setelah_batas || 0)
      pengurangan += v
      rincianPengurangan.push({
        label: `${meta.nama || kode} melebihi batas (${meta.batas_kejadian_per_bulan}/bulan)`,
        kejadian: lebih, nilai: v,
      })
    }
  })

  const ihFinal = Math.max(0, Math.round((ihDasarRow.ih - pengurangan) * 100) / 100)

  return {
    tahun, bulan,
    hariKerjaWajib, hariHadirPenuh,
    persentase: Math.round(persentase * 100) / 100,
    ihDasar: ihDasarRow.ih,
    ihDasarLabel: ihDasarRow.label,
    totalPengurangan: Math.round(pengurangan * 100) / 100,
    rincianPengurangan,
    ihFinal,
    terlambatCount, pulangAwalCount, alpaCount,
    detail,
  }
}

/**
 * Tunjangan Remunerasi = Nilai Jabatan x Indeks Kinerja x Indeks Kehadiran
 * (Pasal 7 SK 01.012), dibulatkan ke Rp 1.000 terdekat sesuai contoh
 * Pasal 12.
 */
export function hitungRemunerasi(nilaiJabatan, indeksKinerja, ihFinal) {
  if (nilaiJabatan == null || indeksKinerja == null || ihFinal == null) return null
  const nilai = Number(nilaiJabatan) * Number(indeksKinerja) * Number(ihFinal)
  return Math.round(nilai / 1000) * 1000
}
