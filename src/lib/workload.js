// =====================================================================
// Mesin perhitungan Analisis Beban Kerja Individu, mengadaptasi
// "Analisis Beban Kerja YPI Darussunah" (FRM-SDM-02, Revisi 01).
//
// Seluruh beban dinyatakan dalam JAM KERJA (60 menit) per minggu:
//   Jam Tatap Muka        = JP Mengajar x Durasi 1 JP / 60
//   Jam Tugas Tambahan    = (JP ekuivalensi Jabatan Struktural
//                             + Σ JP ekuivalensi seluruh Tugas Tambahan
//                               yang diemban) x Durasi 1 JP / 60
//   Jam Manajerial KS     = jam tugas Kepala Sekolah (manajerial +
//                             pengembangan kewirausahaan + supervisi),
//                             mengacu Kepmendikdasmen No. 221/P/2025 —
//                             diekuivalensikan dengan pemenuhan 24 JTM,
//                             tanpa wajib mengajar tatap muka reguler.
//   Total Jam Terpakai    = Jam Tatap Muka + Jam Tugas Tambahan
//                             + Jam Manajerial KS + Jam Ketatausahaan
//   Sisa Jam Kerja Efektif = Kapasitas Jam Kerja − Total Jam Terpakai
//   Utilisasi              = Total Jam Terpakai / Kapasitas Jam Kerja
//
// PENTING: berbeda dari Tunjangan Fungsional (Komponen Gaji) yang
// hanya membayar SATU Tugas Tambahan (nominal tertinggi), Beban Kerja
// menjumlahkan SEMUA Tugas Tambahan yang diemban — karena setiap tugas
// memang menghabiskan waktu nyata, walau yang dibayar cuma satu.
// =====================================================================

export const DEFAULT_BEBAN_KERJA_SETTINGS = {
  kapasitas_jam_kerja: 37,
  beban_mengajar_maks: 40,
  beban_mengajar_min: 24,
  ambang_longgar: 0.7,
  ambang_padat: 0.9,
  durasi_jp_sd: 35,
  durasi_jp_smp: 40,
  durasi_jp_sma: 45,
  durasi_jp_boarding: 40,
  // Bimbingan Konseling (Permendikbud 111/2014): 150 siswa bimbingan = 24 JTM.
  bk_rasio_siswa: 150,
  bk_jp_penuh: 24,
  bk_koordinator_jp: 2,
}

/** Durasi 1 JP (menit) berdasarkan jenjang unit sekolah pegawai. */
export function durasiJpMenit(jenjang, settings) {
  const s = settings || DEFAULT_BEBAN_KERJA_SETTINGS
  const map = {
    SD: s.durasi_jp_sd,
    SMP: s.durasi_jp_smp,
    SMA: s.durasi_jp_sma,
    Boarding: s.durasi_jp_boarding,
  }
  const v = map[jenjang]
  return v != null ? Number(v) : 40
}

/**
 * Hitung seluruh komponen Beban Kerja satu pegawai.
 *
 * @param {Object} p
 * @param {Object|null} p.position - baris positions { nama, tunjangan_jenis, jp_ekuivalensi }
 * @param {string|null} p.jenjang - jenjang unit sekolah pegawai (SD/SMP/SMA/Boarding)
 * @param {Array} [p.tugasTambahanList] - daftar tugas tambahan yang diemban { nama, jp_ekuivalensi }
 * @param {number} [p.jpMengajar] - JP Mengajar per minggu
 * @param {number} [p.jamKetatausahaan] - Jam Ketatausahaan per minggu (staf TU)
 * @param {number} [p.jamManajerial] - Jam Manajerial Kepala Sekolah per minggu (Kepmendikdasmen 221/P/2025)
 * @param {number} [p.siswaBimbingan] - Jumlah siswa bimbingan Guru BK (Permendikbud 111/2014)
 * @param {boolean} [p.koordinatorBk] - true bila menjabat Koordinator BK (tambahan ekuivalensi JP)
 * @param {Object} p.settings - baris beban_kerja_settings
 */
export function hitungBebanKerja({
  position,
  jenjang,
  tugasTambahanList = [],
  jpMengajar = 0,
  jamKetatausahaan = 0,
  jamManajerial = 0,
  siswaBimbingan = 0,
  koordinatorBk = false,
  settings = DEFAULT_BEBAN_KERJA_SETTINGS,
}) {
  const durasiJp = durasiJpMenit(jenjang, settings)
  const isStruktural = position?.tunjangan_jenis === 'struktural'

  const jamTatapMuka = ((Number(jpMengajar) || 0) * durasiJp) / 60

  const rincianTugasTambahan = []
  if (isStruktural && Number(position?.jp_ekuivalensi) > 0) {
    rincianTugasTambahan.push({ nama: position.nama || 'Jabatan Struktural', jp: Number(position.jp_ekuivalensi) })
  }
  for (const t of tugasTambahanList || []) {
    const jp = Number(t.jp_ekuivalensi) || 0
    if (jp > 0) rincianTugasTambahan.push({ nama: t.nama, jp })
  }
  const jpTugasTambahan = rincianTugasTambahan.reduce((sum, t) => sum + t.jp, 0)
  const jamTugasTambahan = (jpTugasTambahan * durasiJp) / 60

  const jamKetatausahaanN = Number(jamKetatausahaan) || 0
  const jamManajerialN = Number(jamManajerial) || 0

  // Bimbingan Konseling — ekuivalensi JP dari jumlah siswa bimbingan
  // (proporsional terhadap rasio penuh) + tambahan Koordinator BK.
  const bkRasio = Number(settings.bk_rasio_siswa) || DEFAULT_BEBAN_KERJA_SETTINGS.bk_rasio_siswa
  const bkJpPenuh = Number(settings.bk_jp_penuh) || DEFAULT_BEBAN_KERJA_SETTINGS.bk_jp_penuh
  const bkKoorJp = settings.bk_koordinator_jp != null ? Number(settings.bk_koordinator_jp) : DEFAULT_BEBAN_KERJA_SETTINGS.bk_koordinator_jp
  const siswaBk = Number(siswaBimbingan) || 0
  const jpBimbingan = bkRasio > 0 ? Math.round(((siswaBk / bkRasio) * bkJpPenuh) * 100) / 100 : 0
  const jpKoordinatorBk = koordinatorBk ? (Number(bkKoorJp) || 0) : 0
  const jpBk = jpBimbingan + jpKoordinatorBk
  const jamBk = (jpBk * durasiJp) / 60

  const totalJamTerpakai = jamTatapMuka + jamTugasTambahan + jamManajerialN + jamKetatausahaanN + jamBk

  const kapasitas = Number(settings.kapasitas_jam_kerja) || DEFAULT_BEBAN_KERJA_SETTINGS.kapasitas_jam_kerja
  const sisaJamKerja = kapasitas - totalJamTerpakai
  const utilisasi = kapasitas > 0 ? totalJamTerpakai / kapasitas : 0

  const ambangPadat = Number(settings.ambang_padat) || DEFAULT_BEBAN_KERJA_SETTINGS.ambang_padat
  const ambangLonggar = Number(settings.ambang_longgar) || DEFAULT_BEBAN_KERJA_SETTINGS.ambang_longgar
  let status = 'Wajar'
  if (utilisasi > 1) status = 'Melebihi kapasitas'
  else if (utilisasi >= ambangPadat) status = 'Padat'
  else if (utilisasi < ambangLonggar) status = 'Longgar'

  return {
    durasiJp,
    jpMengajar: Number(jpMengajar) || 0,
    jamTatapMuka,
    rincianTugasTambahan,
    jpTugasTambahan,
    jamTugasTambahan,
    jamKetatausahaan: jamKetatausahaanN,
    jamManajerial: jamManajerialN,
    siswaBimbingan: siswaBk,
    jpBimbingan,
    koordinatorBk: !!koordinatorBk,
    jpKoordinatorBk,
    jpBk,
    jamBk,
    totalJamTerpakai,
    kapasitas,
    sisaJamKerja,
    utilisasi,
    status,
  }
}

export const STATUS_BADGE_COLOR_BEBAN_KERJA = {
  Longgar: 'gold',
  Wajar: 'success',
  Padat: 'gold',
  'Melebihi kapasitas': 'danger',
}
