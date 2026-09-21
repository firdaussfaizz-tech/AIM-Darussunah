// =====================================================================
// Mesin perhitungan Komponen Gaji (P1 Komponen Tetap, P2 Remunerasi &
// Honor), sesuai Pasal 2-3 (struktur), Pasal 5 (tunjangan jabatan
// struktural), Pasal 6 (tunjangan fungsional/tugas tambahan), Pasal 17
// (honor mengajar/lembur) SK 01.012/SK-YDC/VIII/26, dan Pasal 9 ayat 5
// Draft SK (honor lembur tidak berlaku untuk jabatan struktural).
//
// Filosofi (disepakati bersama pengguna 2026-09-18): Gaji Pokok dan
// Tunjangan Remunerasi TIDAK diinput manual — keduanya dihitung otomatis
// dari Golongan/Ruang, Jabatan, dan Indeks Kehadiran/Kinerja. Input
// manual per bulan hanya untuk: jumlah JP tambahan (Honor Mengajar),
// jumlah jam lembur (Honor Lembur), dan Potongan Pinjaman/Cicilan.
//
// Koreksi arsitektur (disepakati 2026-09-18): Tunjangan Struktural
// melekat pada Jabatan formal (maks 1/pegawai, Pasal 5 ayat 3).
// Tunjangan Fungsional TIDAK melekat pada Jabatan — melainkan pada
// Tugas Tambahan (tabel tugas_tambahan / employee_tugas_tambahan).
// Pegawai BOLEH mengemban lebih dari satu Tugas Tambahan sekaligus
// (mis. Wali Kelas + Sarpras) — dicatat semua untuk keperluan Beban
// Kerja (lib/workload.js) — tetapi Tunjangan Fungsional yang DIBAYAR
// hanya SATU: yang nominalnya PALING TINGGI (disepakati 2026-09-18,
// koreksi dari versi sebelumnya yang menjumlahkan semuanya).
// =====================================================================

import { hitungRuang, ambilSkalaGaji } from './remunerasi'

/**
 * Honor Jam Mengajar Tambahan (Pasal 17 ayat 1-2): berlaku untuk JP di
 * luar 40 JP reguler & di luar jam kerja efektif (Kelas Pengganti,
 * Kelas Tambahan, Kelas Pendalaman/Persiapan Ujian). Tarif berbeda per
 * Golongan — aplikasi TIDAK memvalidasi otomatis apakah syarat 40 JP
 * terpenuhi (di luar cakupan data presensi/jadwal mengajar), sehingga
 * admin bertanggung jawab hanya menginput JP yang memang memenuhi syarat.
 */
export function hitungHonorMengajar(golongan, jpTambahan, settings) {
  const jp = Number(jpTambahan) || 0
  if (jp <= 0) return 0
  const tarif = golongan === 'IV' ? settings.honor_mengajar_gol4 : settings.honor_mengajar_gol3
  return jp * Number(tarif)
}

/**
 * Honor Lembur (Pasal 9 Draft SK): Rp15.000/jam, maksimum 2 jam/hari
 * dan 8 jam/minggu. TIDAK berlaku untuk pegawai berjabatan struktural
 * (ayat 5) — tanggung jawabnya sudah dikompensasi Tunjangan Struktural.
 */
export function hitungHonorLembur(jamLembur, settings, isJabatanStruktural) {
  if (isJabatanStruktural) return 0
  const jam = Number(jamLembur) || 0
  if (jam <= 0) return 0
  return jam * Number(settings.honor_lembur_per_jam)
}

/**
 * Batas wajar jam lembur sebulan berdasarkan jumlah minggu efektif,
 * dipakai untuk peringatan (bukan pemblokiran keras) di UI.
 */
export function batasLemburBulanan(settings, jumlahMingguEfektif = 4.3) {
  return Math.round(Number(settings.lembur_maks_jam_per_minggu) * jumlahMingguEfektif)
}

/**
 * Hitung seluruh komponen gaji satu pegawai untuk satu bulan.
 *
 * @param {Object} p
 * @param {Object} p.employee - { golongan, tanggal_masuk }
 * @param {Object|null} p.position - baris positions { tunjangan_jenis, tunjangan_nominal }
 * @param {Array} [p.tugasTambahanList] - daftar tugas tambahan yang diemban { nama, tunjangan_nominal }
 * @param {Array} p.salaryScaleRows - seluruh baris salary_scale
 * @param {Object} p.settings - baris payroll_settings
 * @param {Object|null} p.ihResult - hasil hitungIH() bulan berjalan (boleh null bila belum ada data presensi)
 * @param {Object|null} p.performanceIndex - baris performance_index periode berjalan (boleh null)
 * @param {number} [p.jpTambahan]
 * @param {number} [p.jamLembur]
 * @param {number} [p.potonganPinjaman]
 * @param {number} [p.potonganBpjs]
 * @param {number} [p.potonganLainnya]
 */
export function hitungKomponenGaji({
  employee,
  position,
  tugasTambahanList = [],
  salaryScaleRows = [],
  settings,
  ihResult = null,
  performanceIndex = null,
  jpTambahan = 0,
  jamLembur = 0,
  potonganPinjaman = 0,
  potonganBpjs = 0,
  potonganLainnya = 0,
}) {
  if (!settings) {
    throw new Error('Pengaturan Penggajian (tarif honor/lembur/transport) belum diisi. Buka Penggajian → Pengaturan untuk mengisinya terlebih dahulu.')
  }

  const ruang = hitungRuang(employee.tanggal_masuk)
  const scaleRow = ambilSkalaGaji(salaryScaleRows, employee.golongan, ruang)
  const isStruktural = position?.tunjangan_jenis === 'struktural'

  const gajiPokok = scaleRow?.gaji_pokok ?? 0
  const nilaiJabatan = scaleRow?.nilai_jabatan ?? 0
  const tunjanganStruktural = isStruktural ? Number(position.tunjangan_nominal) : 0

  // Tugas Tambahan diurutkan dari nominal tertinggi — hanya baris pertama
  // (dibayarkan=true) yang masuk ke Tunjangan Fungsional; sisanya tetap
  // dicatat (untuk Beban Kerja) tapi tidak dibayarkan.
  const rincianFungsional = (tugasTambahanList || [])
    .map((t) => ({ nama: t.nama, nominal: Number(t.tunjangan_nominal) || 0 }))
    .sort((a, b) => b.nominal - a.nominal || a.nama.localeCompare(b.nama))
    .map((t, i) => ({ ...t, dibayarkan: i === 0 }))
  const tunjanganFungsional = rincianFungsional[0]?.nominal || 0
  const tunjanganFungsionalSumber = rincianFungsional[0]?.nama || null
  const transportMakan = Number(settings.transport_makan_nominal) || 0

  const totalP1 = gajiPokok + tunjanganStruktural + tunjanganFungsional + transportMakan

  const ihFinal = ihResult?.ihFinal ?? null
  const indeksKinerja = performanceIndex?.indeks_kinerja ?? null
  const tunjanganRemunerasi = (nilaiJabatan && ihFinal != null && indeksKinerja != null)
    ? Math.round((nilaiJabatan * indeksKinerja * ihFinal) / 1000) * 1000
    : 0

  const honorMengajar = hitungHonorMengajar(employee.golongan, jpTambahan, settings)
  const honorLembur = hitungHonorLembur(jamLembur, settings, isStruktural)

  const totalP2 = tunjanganRemunerasi + honorMengajar + honorLembur

  const totalTunjangan = totalP1 - gajiPokok + totalP2 // semua di luar gaji pokok, utk kolom "total_tunjangan" existing
  const totalPotongan = Number(potonganBpjs) + Number(potonganPinjaman) + Number(potonganLainnya)
  const gajiBersih = gajiPokok + totalTunjangan - totalPotongan

  return {
    golongan: employee.golongan || null,
    ruang,
    gajiPokok,
    nilaiJabatan,
    tunjanganStruktural,
    tunjanganFungsional,
    tunjanganFungsionalSumber,
    rincianFungsional,
    transportMakan,
    totalP1,
    tunjanganRemunerasi,
    honorMengajar,
    honorLembur,
    totalP2,
    ihFinal,
    indeksKinerja,
    jpTambahan: Number(jpTambahan) || 0,
    jamLembur: Number(jamLembur) || 0,
    potonganBpjs: Number(potonganBpjs) || 0,
    potonganPinjaman: Number(potonganPinjaman) || 0,
    potonganLainnya: Number(potonganLainnya) || 0,
    totalTunjangan,
    totalPotongan,
    gajiBersih,
    lengkap: !!(employee.golongan && scaleRow && ihResult && performanceIndex),
  }
}
