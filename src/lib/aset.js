// Modul Aset — label & perhitungan penyusutan (garis lurus).

export const KONDISI_OPTIONS = ['baik', 'rusak_ringan', 'rusak_berat']
export const KONDISI_LABEL = { baik: 'Baik', rusak_ringan: 'Rusak Ringan', rusak_berat: 'Rusak Berat' }
export const KONDISI_BADGE = { baik: 'success', rusak_ringan: 'gold', rusak_berat: 'danger' }

// Penyusutan METODE GARIS LURUS.
//   penyusutan/bulan = (nilai_perolehan − nilai_residu) / umur_ekonomis_bulan
//   nilai_buku = maks(nilai_residu, nilai_perolehan − akumulasi)
// kategori = { umur_ekonomis_bulan, nilai_residu_persen }. Kategori tanpa
// umur (mis. Tanah) atau aset tanpa tanggal perolehan → tidak disusutkan.
export function hitungPenyusutan(aset, kategori, asOf = new Date()) {
  const nilaiPerolehan = Number(aset?.nilai_perolehan || 0)
  const umur = kategori?.umur_ekonomis_bulan
  const residuPersen = Number(kategori?.nilai_residu_persen || 0)
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

// Umur ekonomis (bulan) → label ramah.
export function umurLabel(bulan) {
  if (!bulan) return 'Tidak disusutkan'
  if (bulan % 12 === 0) return `${bulan / 12} tahun`
  return `${bulan} bulan`
}
