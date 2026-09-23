// Modul Aset — label & perhitungan penyusutan (garis lurus).
// Penyusutan memakai kebijakan per-GOLONGAN (aset_golongan): tiap aset
// mewarisi umur ekonomis & nilai residu dari golongan klasifikasinya.

export const KONDISI_OPTIONS = ['baik', 'rusak_ringan', 'rusak_berat']
export const KONDISI_LABEL = { baik: 'Baik', rusak_ringan: 'Rusak Ringan', rusak_berat: 'Rusak Berat' }
export const KONDISI_BADGE = { baik: 'success', rusak_ringan: 'gold', rusak_berat: 'danger' }

// Penyusutan METODE GARIS LURUS.
//   penyusutan/bulan = (nilai_perolehan − nilai_residu) / umur_ekonomis_bulan
//   nilai_buku = maks(nilai_residu, nilai_perolehan − akumulasi)
// golongan = { umur_ekonomis_bulan, nilai_residu_persen } dari aset_golongan.
// Golongan tanpa umur (Tanah, Konstruksi) atau aset tanpa tanggal → tidak disusut.
export function hitungPenyusutan(aset, golongan, asOf = new Date()) {
  const nilaiPerolehan = Number(aset?.nilai_perolehan || 0)
  const umur = golongan?.umur_ekonomis_bulan
  const residuPersen = Number(golongan?.nilai_residu_persen || 0)
  const nilaiResidu = (nilaiPerolehan * residuPersen) / 100

  if (!umur || umur <= 0 || !aset?.tanggal_perolehan) {
    return { disusutkan: false, nilaiResidu, penyusutanPerBulan: 0, bulanBerjalan: 0, akumulasi: 0, nilaiBuku: nilaiPerolehan }
  }

  const start = new Date(aset.tanggal_perolehan)
  let bulan = (asOf.getFullYear() - start.getFullYear()) * 12 + (asOf.getMonth() - start.getMonth())
  if (asOf.getDate() < start.getDate()) bulan -= 1
  bulan = Math.max(0, Math.min(umur, bulan))

  const penyusutanPerBulan = (nilaiPerolehan - nilaiResidu) / umur
  const akumulasi = penyusutanPerBulan * bulan
  const nilaiBuku = Math.max(nilaiResidu, nilaiPerolehan - akumulasi)
  return { disusutkan: true, nilaiResidu, penyusutanPerBulan, bulanBerjalan: bulan, akumulasi, nilaiBuku }
}

export function umurLabel(bulan) {
  if (!bulan) return 'Tidak disusutkan'
  if (bulan % 12 === 0) return `${bulan / 12} tahun`
  return `${bulan} bulan`
}
