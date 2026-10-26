// Logika Keringanan Biaya Siswa (potongan/beasiswa) untuk SPP & Uang
// Pangkal. Dipakai bersama oleh halaman generate SPP, Uang Pangkal, dan
// pengelola Keringanan. Perhitungan dilakukan saat generate.
import { formatRupiah } from './format'

export const SASARAN_OPTIONS = [
  { v: 'spp', l: 'SPP' },
  { v: 'uang_pangkal', l: 'Uang Pangkal' },
]
export const SASARAN_LABEL = { spp: 'SPP', uang_pangkal: 'Uang Pangkal' }
export const TIPE_OPTIONS = [
  { v: 'persen', l: 'Persen (%)' },
  { v: 'nominal', l: 'Nominal (Rp)' },
]
export const KRITERIA_OPTIONS = [
  { v: 'semua', l: 'Semua siswa (sesuai sasaran)' },
  { v: 'anak_pegawai', l: 'Anak pegawai (tertaut ke pegawai)' },
  { v: 'anak_ke_min', l: 'Anak ke-N atau lebih' },
]
export const KRITERIA_LABEL = { semua: 'Semua siswa', anak_pegawai: 'Anak pegawai', anak_ke_min: 'Anak ke-N+' }

export const potonganLabel = (tipe, nilai) => tipe === 'persen' ? `${Number(nilai)}%` : formatRupiah(nilai)

// Apakah sebuah kebijakan berlaku untuk siswa & konteks generate tertentu.
export function kebijakanBerlaku(k, { sasaran, siswa, ctx }) {
  if (!k.aktif) return false
  if (k.sasaran !== sasaran) return false
  if (ctx?.tahunAjaranId && k.tahun_ajaran_id !== ctx.tahunAjaranId) return false
  if (k.school_id && k.school_id !== (siswa?.school_id ?? ctx?.schoolId)) return false
  if (k.program && k.program !== (siswa?.program || 'fullday')) return false
  const tgl = ctx?.tanggal || null
  if (k.berlaku_mulai && tgl && tgl < k.berlaku_mulai) return false
  if (k.berlaku_sampai && tgl && tgl > k.berlaku_sampai) return false
  if (k.kriteria === 'anak_pegawai') return !!siswa?.employee_ortu_id
  if (k.kriteria === 'anak_ke_min') return Number(siswa?.anak_ke || 0) >= Number(k.anak_ke_min || 0) && Number(k.anak_ke_min || 0) > 0
  return true // 'semua'
}

// Hitung potongan untuk satu tagihan.
//  komponenMap: { komponen: nominal } (Uang Pangkal) atau null (SPP → seluruh).
// Mengembalikan { potongan, net, lines:[{label,nominal,komponen}], catatan }.
export function hitungPotongan({ sasaran, totalBruto, komponenMap = null, siswa, kebijakanList = [], keringananSiswaList = [], ctx }) {
  const lines = []
  let potongan = 0
  const bruto = Number(totalBruto || 0)

  const apply = (r, labelAwal) => {
    const base = (r.komponen && komponenMap) ? Number(komponenMap[r.komponen] || 0) : bruto
    if (base <= 0) return
    let amt = r.tipe === 'persen' ? base * Number(r.nilai || 0) / 100 : Math.min(Number(r.nilai || 0), base)
    amt = Math.round(amt)
    if (amt <= 0) return
    potongan += amt
    const label = `${labelAwal}${r.komponen ? ` — ${r.komponen}` : ''} (${potonganLabel(r.tipe, r.nilai)})`
    lines.push({ label, nominal: amt, komponen: r.komponen || null })
  }

  for (const k of kebijakanList) {
    if (kebijakanBerlaku(k, { sasaran, siswa, ctx })) apply(k, k.nama)
  }
  for (const g of keringananSiswaList) {
    if (g.aktif && g.sasaran === sasaran && (!g.tahun_ajaran_id || g.tahun_ajaran_id === ctx?.tahunAjaranId)) {
      apply(g, 'Keringanan khusus')
    }
  }

  potongan = Math.min(potongan, bruto)
  const net = Math.max(0, bruto - potongan)
  const catatan = lines.map((l) => l.label).join('; ') || null
  return { potongan, net, lines, catatan }
}
