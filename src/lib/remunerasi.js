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
//
// Keputusan tambahan (2026-09-22, #1): hari kerja efektif yang BELUM ada
// baris `attendance` sama sekali (presensi belum sempat dicatat/di-
// impor Tata Usaha untuk tanggal tsb) dianggap HADIR PENUH secara
// default, BUKAN Alpa. Presensi di halaman Presensi Pegawai memang baru
// tercatat kalau ada yang menekan tombol status (atau via impor
// fingerprint) untuk tanggal tsb — sebelumnya hari yang belum sempat
// diisi ikut dihitung Alpa (potongan 0,10/hari), sehingga IH pegawai
// baru/di awal bulan sering tampak 0% dan Tunjangan Remunerasi tampak
// Rp 0 padahal belum tentu benar-benar tidak hadir. Sekarang Alpa HANYA
// dihitung dari status 'alpa' yang secara eksplisit dicatat/dipilih oleh
// Tata Usaha/Admin — sesuai maksud Pasal 24 (Alpa = tidak hadir tanpa
// keterangan, bukan sekadar data belum diinput).
//
// Keputusan tambahan (2026-09-22, #2) — MEREVISI aturan Izin Sakit dari
// keputusan 2026-09-18 di atas: Izin Sakit TIDAK LAGI memakai mekanisme
// batas_kejadian_per_bulan/pengurangan_ih_setelah_batas (yang juga tidak
// pernah bisa diisi admin — tidak ada field-nya di form "Jenis Cuti &
// Izin"). Aturan barunya, murni lewat nilaiHadir per hari:
//   - Izin Sakit TANPA SKD -> nilaiHadir 0 (mengurangi Kehadiran Efektif).
//   - Izin Sakit DENGAN SKD -> nilaiHadir 1 (hadir penuh), dibatasi
//     maksimal `jatah_per_bulan` hari BER-SKD per bulan (field yang sama
//     dengan yang sudah ada & bisa diisi admin di form Jenis Cuti & Izin,
//     default 4 hari/bulan bila kosong). Kejadian ber-SKD ke-(jatah+1)
//     dst dalam bulan yang sama ikut nilaiHadir 0, sama seperti tanpa SKD.
//   - Tidak ada potongan Indeks Kehadiran (IH) tambahan akibat Izin
//     Sakit — satu-satunya dampaknya adalah lewat persentase Kehadiran
//     Efektif, yang kemudian menentukan IH Dasar dari IH_BASE_TABLE.
// Mekanisme batas_kejadian_per_bulan/pengurangan_ih_setelah_batas lama
// TETAP berlaku untuk kode lain (mis. ITMK/Izin Meninggalkan Tugas
// Sementara) yang datanya mengisi kedua kolom tsb — hanya kode 'IS' yang
// sekarang sengaja dilewati dari mekanisme itu.
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

/**
 * Semester PKP mengikuti Pasal 9 Draft SK: Jul-Des dinilai di semester
 * genap, Jan-Jul di semester ganjil — dipakai untuk mengisi otomatis
 * rentang tanggal "berlaku untuk periode gaji" saat mencatat Indeks
 * Kinerja (baik lewat form Kinerja maupun tab Indeks Kehadiran), boleh
 * diubah manual oleh admin di masing-masing form.
 */
export function defaultPeriodeKinerja(tahun, bulan) {
  if (bulan >= 8 && bulan <= 12) return { mulai: `${tahun}-08-01`, selesai: `${tahun}-12-31` }
  return { mulai: `${tahun}-01-01`, selesai: `${tahun}-07-31` }
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
 * Mengikuti pola Pegawai Reguler (Senin-Sabtu kerja, Minggu libur) dari
 * Pasal 3 Draft SK, dan sejak ditambahkannya kalender `school_holidays`
 * (Roadmap B Otomasi #6), tanggal yang terdaftar sebagai hari libur juga
 * dikecualikan — lihat `holidayDates`.
 *
 * @param {number} tahun
 * @param {number} bulan - 1-12
 * @param {Iterable<string>} [holidayDates] - tanggal 'YYYY-MM-DD' yang dikecualikan.
 */
export function hitungHariKerjaWajibDefault(tahun, bulan, holidayDates = []) {
  const holidaySet = holidayDates instanceof Set ? holidayDates : new Set(holidayDates)
  const totalHari = new Date(tahun, bulan, 0).getDate()
  let count = 0
  for (let d = 1; d <= totalHari; d++) {
    const dow = new Date(tahun, bulan - 1, d).getDay()
    const iso = `${tahun}-${String(bulan).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    if (dow !== 0 && !holidaySet.has(iso)) count++
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
 * @param {Iterable<string>} [params.holidayDates] - tanggal 'YYYY-MM-DD' dari
 *   `school_holidays` (yayasan + sekolah pegawai) yang dikecualikan dari
 *   Hari Kerja Wajib, diperlakukan sama seperti libur mingguan hari Minggu.
 */
export function hitungIH({
  attendanceRows = [],
  tahun,
  bulan,
  scheduleByDay = null,
  manualAdjustments = [],
  lateThreshold = LATE_THRESHOLD,
  holidayDates = [],
}) {
  const holidaySet = holidayDates instanceof Set ? holidayDates : new Set(holidayDates)
  const totalHariBulan = new Date(tahun, bulan, 0).getDate()
  const attendanceByDate = {}
  attendanceRows.forEach((r) => { attendanceByDate[r.tanggal] = r })

  let hariKerjaWajib = 0
  let hariHadirPenuh = 0
  let terlambatCount = 0
  let pulangAwalCount = 0
  let alpaCount = 0
  let hariLiburKalenderCount = 0
  let isDenganSkdCount = 0 // penghitung berjalan Izin Sakit BER-SKD bulan ini, lihat catatan 2026-09-22
  const byKodeCount = {}
  const byKodeMeta = {}
  const detail = []

  for (let d = 1; d <= totalHariBulan; d++) {
    const dow = new Date(tahun, bulan - 1, d).getDay()
    const iso = `${tahun}-${String(bulan).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const jadwalHari = scheduleByDay?.[dow]
    const hariLiburMingguan = jadwalHari ? jadwalHari.aktif === false : dow === 0
    if (holidaySet.has(iso) && !hariLiburMingguan) hariLiburKalenderCount++
    if (hariLiburMingguan || holidaySet.has(iso)) continue

    const att = attendanceByDate[iso]
    const lr = att?.leave_requests
    const lt = lr?.leave_types

    if (att?.leave_request_id && lt) {
      const kode = lt.kode
      let nilaiHadir = lt.nilai_hari_hadir
      let catatanNilai = null

      // Kasus khusus per kode (dibedakan dari data pengajuan, bukan hardcode nilai):
      if (kode === 'IMTS' && lr.durasi_jam != null && Number(lr.durasi_jam) > 2) {
        nilaiHadir = 0
        catatanNilai = 'meninggalkan tugas > 2 jam'
      }

      // Izin Sakit (kode 'IS'), aturan direvisi 2026-09-22:
      //   - Tanpa SKD -> langsung mengurangi 1 Hari Hadir Efektif (nilaiHadir 0).
      //   - Dengan SKD -> dihitung hadir penuh, TAPI dibatasi maksimal
      //     `jatah_per_bulan` hari dengan SKD per bulan (nilai yang sama
      //     dipakai di form "Jenis Cuti & Izin", default 4 bila kosong).
      //     Kejadian ke-(jatah+1) dst dalam bulan yang sama, walau ada
      //     SKD, tetap diperlakukan seperti tanpa SKD (nilaiHadir 0).
      //   - TIDAK ADA potongan Indeks Kehadiran terpisah untuk Izin Sakit
      //     (mekanisme batas_kejadian_per_bulan/pengurangan_ih_setelah_batas
      //     di bawah sengaja DILEWATI untuk kode 'IS') — satu-satunya efek
      //     Izin Sakit adalah lewat persentase Kehadiran Efektif, yang lalu
      //     menentukan IH Dasar (IH_BASE_TABLE).
      if (kode === 'IS') {
        if (!lr.dokumen_terlampir) {
          nilaiHadir = 0
          catatanNilai = 'tanpa Surat Keterangan Dokter'
        } else {
          isDenganSkdCount += 1
          const kuotaSkd = lt.jatah_per_bulan ?? 4
          if (isDenganSkdCount > kuotaSkd) {
            nilaiHadir = 0
            catatanNilai = `dengan SKD, melebihi kuota ${kuotaSkd} hari/bulan`
          } else {
            nilaiHadir = 1
          }
        }
      }

      if (lt.hitung_hari_kerja_wajib) hariKerjaWajib++
      if (nilaiHadir != null) hariHadirPenuh += Number(nilaiHadir)
      if (lt.batas_kejadian_per_bulan != null && kode !== 'IS') {
        byKodeCount[kode] = (byKodeCount[kode] || 0) + 1
        byKodeMeta[kode] = lt
      }
      detail.push({
        tanggal: iso, jenis: 'leave', kode, nama: lt.nama,
        nilaiHadir, hitungWajib: lt.hitung_hari_kerja_wajib, catatan: catatanNilai,
      })
      continue
    }

    hariKerjaWajib++

    // Alpa HANYA dari status 'alpa' yang eksplisit dicatat — bukan lagi
    // dari ketiadaan baris attendance (lihat catatan keputusan 2026-09-22
    // di atas).
    if (att?.status === 'alpa') {
      alpaCount++
      detail.push({ tanggal: iso, jenis: 'alpa', nilaiHadir: 0 })
      continue
    }

    // Default: hadir penuh — baik karena eksplisit dicatat 'hadir',
    // maupun karena belum ada baris attendance sama sekali untuk
    // tanggal ini (dianggap hadir sampai ada yang mencatat sebaliknya).
    if (!att || att.status === 'hadir') {
      hariHadirPenuh += 1
      let terlambat = false
      let pulangAwal = false
      if (att?.jam_masuk && att.jam_masuk > lateThreshold) { terlambat = true; terlambatCount++ }
      if (jadwalHari?.jam_pulang && att?.jam_pulang && att.jam_pulang < jadwalHari.jam_pulang) { pulangAwal = true; pulangAwalCount++ }
      detail.push({ tanggal: iso, jenis: att ? 'hadir' : 'belum_tercatat', nilaiHadir: 1, terlambat, pulangAwal, belumTercatat: !att })
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
    hariLiburKalenderCount,
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
