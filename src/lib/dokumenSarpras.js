// =====================================================================
// MESIN DOKUMEN KERJA SARPRAS — cetak/PDF otomatis dari data.
//
// Tiap dokumen kerja pada SOP tiap area (juknis) dibuatkan versi CETAK
// yang terisi OTOMATIS dari data aplikasi (DKA, pengadaan, penggunaan,
// penyaluran, opname, penghapusan, inventaris). Dokumen yang sumbernya
// dari luar (surat penawaran, dll) disediakan sebagai FORMULIR kosong
// siap isi/cetak.
//
// - DOKUMEN_LIST : metadata (untuk daftar di tab Dokumen & Formulir).
// - loadDokumen(jenis, id) : ambil + rangkai data → objek `data`.
// - buildDokumen(jenis, data) : hasilkan definisi dokumen (docDef) yang
//   dirender seragam oleh <DokumenCetak>.
//
// docDef = { judul, nomor, unit, tanggalTempat, meta[[k,v]], intro,
//            tables[{title,columns,rows,footer}], narasi[], catatan,
//            ttd[{peran,jabatan,nama}], blankRows }
// =====================================================================
import { supabase } from './supabaseClient'

export const KOP = {
  yayasan: 'YAYASAN PENDIDIKAN ISLAM DARUSSUNAH',
  singkat: 'YPI Darussunah',
  alamat: 'Jl. Pendidikan No. 1 — Sekretariat YPI Darussunah',
}

const rp = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID')
const tgl = (d) => (d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '.............................')
const unitName = (s) => (s ? `${s.jenjang} — ${s.nama}` : 'Kantor Yayasan Pusat')
const KON = { baik: 'Baik', rusak_ringan: 'Rusak Ringan', rusak_berat: 'Rusak Berat' }
const kon = (k) => KON[k] || k || '—'
const blank = '____________________'

// Daftar dokumen per area. pick = jenis entitas untuk dipilih (null = formulir kosong).
export const DOKUMEN_LIST = [
  // Perencanaan
  { jenis: 'dka', area: 'Perencanaan', label: 'Dokumen DKA (Daftar Kebutuhan Aset)', pick: 'dka' },
  { jenis: 'rencana_pengadaan', area: 'Perencanaan', label: 'Formulir Rencana Kebutuhan Pengadaan Aset', pick: 'dka' },
  { jenis: 'rencana_pemeliharaan', area: 'Perencanaan', label: 'Formulir Rencana Kebutuhan Pemeliharaan Aset', pick: 'dka' },
  // Pengadaan
  { jenis: 'kerangka_pengadaan', area: 'Pengadaan', label: 'Kerangka Kerja Pengadaan (formulir)', pick: null },
  { jenis: 'surat_penawaran', area: 'Pengadaan', label: 'Surat Penawaran / Invoice (formulir)', pick: null },
  { jenis: 'spk', area: 'Pengadaan', label: 'Surat Perintah Kerja (SPK)', pick: 'proses' },
  { jenis: 'ba_pemeriksaan', area: 'Pengadaan', label: 'Berita Acara Pemeriksaan', pick: 'proses' },
  { jenis: 'bast_pengadaan', area: 'Pengadaan', label: 'Berita Acara Serah Terima (Pengadaan)', pick: 'proses' },
  { jenis: 'daftar_hasil_pengadaan', area: 'Pengadaan', label: 'Daftar Hasil Pengadaan Aset', pick: 'dka' },
  // Penerimaan & Penyaluran
  { jenis: 'spa', area: 'Penerimaan & Penyaluran', label: 'Surat Permintaan Aset (SPA)', pick: 'penyaluran' },
  { jenis: 'sppa', area: 'Penerimaan & Penyaluran', label: 'Surat Perintah Penyaluran Aset (SPPA)', pick: 'penyaluran' },
  { jenis: 'kartu_persediaan', area: 'Penerimaan & Penyaluran', label: 'Kartu Persediaan Aset (formulir)', pick: null },
  { jenis: 'buku_pengeluaran', area: 'Penerimaan & Penyaluran', label: 'Buku Pengeluaran Aset (formulir)', pick: null },
  { jenis: 'bukti_pengambilan', area: 'Penerimaan & Penyaluran', label: 'Bukti Pengambilan Aset (formulir)', pick: null },
  // Penggunaan
  { jenis: 'surat_pengajuan_penggunaan', area: 'Penggunaan', label: 'Surat Pengajuan Status Penggunaan (formulir)', pick: null },
  { jenis: 'ba_penggunaan', area: 'Penggunaan', label: 'Berita Acara Status Penggunaan', pick: 'penggunaan' },
  // Penatausahaan / Inventaris
  { jenis: 'kia', area: 'Inventaris', label: 'Kartu Inventaris Aset (KIA)', pick: 'aset' },
  { jenis: 'kir', area: 'Inventaris', label: 'Kartu Inventaris Ruangan (KIR)', pick: 'ruangan' },
  { jenis: 'buku_inventaris', area: 'Inventaris', label: 'Buku Inventaris Aset Satuan Pendidikan', pick: 'school' },
  { jenis: 'label_aset', area: 'Inventaris', label: 'Label Kode Aset & Kode Lokasi', pick: 'aset' },
  // Inventarisasi
  { jenis: 'rencana_inventarisasi', area: 'Inventarisasi', label: 'Rencana Kerja Inventarisasi (formulir)', pick: null },
  { jenis: 'lhi', area: 'Inventarisasi', label: 'Laporan Hasil Inventarisasi (LHI)', pick: 'opname' },
  { jenis: 'ba_inventarisasi', area: 'Inventarisasi', label: 'Berita Acara Hasil Inventarisasi', pick: 'opname' },
  { jenis: 'laporan_aset', area: 'Inventarisasi', label: 'Laporan Aset (Semester/Tahunan)', pick: 'school' },
  // Pemeliharaan
  { jenis: 'jadwal_pemeliharaan', area: 'Pemeliharaan', label: 'Program & Jadwal Pemeliharaan (formulir)', pick: null },
  { jenis: 'logbook_pemeliharaan', area: 'Pemeliharaan', label: 'Logbook Pemeliharaan & Perbaikan', pick: 'school' },
  // Penghapusan
  { jenis: 'permohonan_penghapusan', area: 'Penghapusan', label: 'Permohonan Penghapusan Aset', pick: 'penghapusan' },
  { jenis: 'persetujuan_penghapusan', area: 'Penghapusan', label: 'Surat Persetujuan Penghapusan', pick: 'penghapusan' },
  { jenis: 'sk_penghapusan', area: 'Penghapusan', label: 'SK Penghapusan Aset', pick: 'penghapusan' },
  { jenis: 'formulir_disposal', area: 'Penghapusan', label: 'Formulir Disposal (Penjualan/Hibah)', pick: 'penghapusan' },
  { jenis: 'bast_penghapusan', area: 'Penghapusan', label: 'Berita Acara Serah Terima (Pemindahtanganan)', pick: 'penghapusan' },
]

export const DOKUMEN_BY_JENIS = Object.fromEntries(DOKUMEN_LIST.map((d) => [d.jenis, d]))

// --------------------------------------------------------------------
// Loader per entitas — dipakai baik untuk dokumen maupun pemilih record.
// --------------------------------------------------------------------
export async function listRecords(pick, schoolId) {
  if (!schoolId) return []
  if (pick === 'dka') {
    const { data } = await supabase.from('dka_usulan').select('id, tahun, judul, status').eq('school_id', schoolId).order('tahun', { ascending: false })
    return (data || []).map((r) => ({ id: r.id, label: `DKA ${r.tahun}${r.judul ? ' — ' + r.judul : ''} (${r.status})` }))
  }
  if (pick === 'proses') {
    const { data } = await supabase.from('dka_pengadaan_proses')
      .select('id, status, nomor_spk, dka_usulan_item!inner(nama_aset, dka_usulan!inner(school_id))')
      .eq('dka_usulan_item.dka_usulan.school_id', schoolId)
    return (data || []).map((r) => ({ id: r.id, label: `${r.dka_usulan_item?.nama_aset || 'Item'}${r.nomor_spk ? ' · SPK ' + r.nomor_spk : ''} (${r.status})` }))
  }
  if (pick === 'penggunaan') {
    const { data } = await supabase.from('aset_penggunaan').select('id, tanggal_penetapan, aset!inner(nama, school_id), employees(nama)').eq('aset.school_id', schoolId).order('tanggal_penetapan', { ascending: false })
    return (data || []).map((r) => ({ id: r.id, label: `${r.aset?.nama} → ${r.employees?.nama || 'unit'} (${tgl(r.tanggal_penetapan)})` }))
  }
  if (pick === 'penyaluran') {
    const { data } = await supabase.from('aset_penyaluran').select('id, status, aset!inner(nama, school_id)').eq('aset.school_id', schoolId).order('tanggal_permintaan', { ascending: false })
    return (data || []).map((r) => ({ id: r.id, label: `${r.aset?.nama} (${r.status})` }))
  }
  if (pick === 'opname') {
    const { data } = await supabase.from('aset_opname').select('id, judul, tahun, status').eq('school_id', schoolId).order('created_at', { ascending: false })
    return (data || []).map((r) => ({ id: r.id, label: `${r.judul || 'Opname'} ${r.tahun} (${r.status})` }))
  }
  if (pick === 'penghapusan') {
    const { data } = await supabase.from('aset_penghapusan').select('id, judul, status').eq('school_id', schoolId).order('created_at', { ascending: false })
    return (data || []).map((r) => ({ id: r.id, label: `${r.judul || 'Usulan'} (${r.status})` }))
  }
  if (pick === 'aset') {
    const { data } = await supabase.from('aset').select('id, kode_aset, nama').eq('school_id', schoolId).eq('status', 'aktif').order('nama')
    return (data || []).map((r) => ({ id: r.id, label: `${r.kode_aset || '—'} · ${r.nama}` }))
  }
  if (pick === 'ruangan') {
    const { data } = await supabase.from('ruangan').select('id, nama').eq('school_id', schoolId).order('nama')
    return (data || []).map((r) => ({ id: r.id, label: r.nama }))
  }
  if (pick === 'school') {
    const { data } = await supabase.from('schools').select('id, nama, jenjang').eq('id', schoolId).maybeSingle()
    return data ? [{ id: data.id, label: unitName(data) }] : []
  }
  return []
}

export async function loadDokumen(jenis, id) {
  const meta = DOKUMEN_BY_JENIS[jenis]
  if (!meta) return null
  if (!meta.pick || !id) return { _meta: meta }
  const g = meta.pick

  if (g === 'dka') {
    const { data: u } = await supabase.from('dka_usulan').select('*, schools!school_id(nama, jenjang), diajukan_nama:dka_usulan_diajukan_nama').eq('id', id).maybeSingle()
    if (!u) return { _meta: meta }
    const [{ data: items }, { data: pemel }, { data: proses }] = await Promise.all([
      supabase.from('dka_usulan_item').select('*, aset_klasifikasi(kode)').eq('usulan_id', id).order('urutan'),
      supabase.from('dka_pemeliharaan_item').select('*').eq('usulan_id', id).order('urutan'),
      supabase.from('dka_pengadaan_proses').select('*, dka_usulan_item!inner(nama_aset, usulan_id)').eq('dka_usulan_item.usulan_id', id),
    ])
    return { _meta: meta, u, items: items || [], pemel: pemel || [], proses: proses || [] }
  }
  if (g === 'proses') {
    const { data: p } = await supabase.from('dka_pengadaan_proses').select('*, dka_usulan_item(*, dka_usulan(*, schools!school_id(nama, jenjang)))').eq('id', id).maybeSingle()
    return { _meta: meta, p, item: p?.dka_usulan_item, u: p?.dka_usulan_item?.dka_usulan, school: p?.dka_usulan_item?.dka_usulan?.schools }
  }
  if (g === 'penggunaan') {
    const { data: r } = await supabase.from('aset_penggunaan').select('*, aset(*, schools!school_id(nama, jenjang), ruangan(nama)), employees(nama)').eq('id', id).maybeSingle()
    return { _meta: meta, r, aset: r?.aset, school: r?.aset?.schools }
  }
  if (g === 'penyaluran') {
    const { data: r } = await supabase.from('aset_penyaluran').select('*, aset(*, schools!school_id(nama, jenjang)), ruangan:ruangan_tujuan_id(nama)').eq('id', id).maybeSingle()
    return { _meta: meta, r, aset: r?.aset, school: r?.aset?.schools }
  }
  if (g === 'opname') {
    const { data: o } = await supabase.from('aset_opname').select('*, schools!school_id(nama, jenjang)').eq('id', id).maybeSingle()
    const { data: items } = await supabase.from('aset_opname_item').select('*').eq('opname_id', id).order('kode_aset', { nullsFirst: false })
    return { _meta: meta, o, items: items || [], school: o?.schools }
  }
  if (g === 'penghapusan') {
    const { data: u } = await supabase.from('aset_penghapusan').select('*, schools!school_id(nama, jenjang), diajukan_nama:aset_penghapusan_diajukan_nama').eq('id', id).maybeSingle()
    const { data: items } = await supabase.from('aset_penghapusan_item').select('*').eq('penghapusan_id', id).order('created_at')
    return { _meta: meta, u, items: items || [], school: u?.schools }
  }
  if (g === 'aset') {
    const { data: a } = await supabase.from('aset').select('*, schools!school_id(nama, jenjang), ruangan(nama), aset_klasifikasi(kode, uraian)').eq('id', id).maybeSingle()
    return { _meta: meta, a, school: a?.schools }
  }
  if (g === 'ruangan') {
    const { data: rg } = await supabase.from('ruangan').select('*, schools!school_id(nama, jenjang)').eq('id', id).maybeSingle()
    const { data: aset } = await supabase.from('aset').select('*, aset_klasifikasi(kode)').eq('ruangan_id', id).eq('status', 'aktif').order('nama')
    return { _meta: meta, rg, aset: aset || [], school: rg?.schools }
  }
  if (g === 'school') {
    const { data: school } = await supabase.from('schools').select('id, nama, jenjang').eq('id', id).maybeSingle()
    if (jenis === 'logbook_pemeliharaan') {
      const { data: logs } = await supabase.from('aset_pemeliharaan_log').select('*, aset!inner(nama, kode_aset, school_id)').eq('aset.school_id', id).order('tanggal', { ascending: false })
      return { _meta: meta, school, logs: logs || [] }
    }
    const { data: aset } = await supabase.from('aset').select('*, aset_klasifikasi(kode, uraian), ruangan(nama)').eq('school_id', id).order('kode_aset', { nullsFirst: false })
    return { _meta: meta, school, aset: aset || [] }
  }
  return { _meta: meta }
}

// --------------------------------------------------------------------
// Builder docDef per jenis.
// --------------------------------------------------------------------
export function buildDokumen(jenis, data) {
  const d = data || {}
  const B = BUILDERS[jenis]
  const def = B ? B(d) : { judul: 'DOKUMEN', narasi: ['Definisi dokumen tidak ditemukan.'] }
  return { unit: def.unit || '', tanggalTempat: def.tanggalTempat || `${blank}, ${tgl(null)}`, ...def }
}

const ttdDua = (kiri, kanan) => [kiri, kanan]

const BUILDERS = {
  // ---------------- Perencanaan ----------------
  dka: ({ u, items = [], pemel = [], school }) => ({
    judul: 'DAFTAR KEBUTUHAN ASET (DKA)',
    nomor: `Tahun Anggaran ${u?.tahun ?? ''}`,
    unit: unitName(school),
    meta: [['Unit', unitName(school)], ['Tahun Anggaran', String(u?.tahun ?? '—')], ['Status', u?.status ?? '—'], ['Diajukan oleh', u?.diajukan_nama || '—']],
    tables: [
      { title: 'A. Rencana Kebutuhan Pengadaan', columns: ['No', 'Kode', 'Nama Aset', 'Spesifikasi', 'Jml', 'Sat', 'Harga Satuan', 'Jumlah'],
        rows: items.map((r, i) => [i + 1, r.aset_klasifikasi?.kode || '—', r.nama_aset, r.spesifikasi || '—', Number(r.jumlah_pengajuan), r.satuan, rp(r.harga_satuan), rp(r.jumlah_harga)]),
        footer: ['', '', '', '', '', '', 'Total', rp(items.reduce((a, r) => a + Number(r.jumlah_harga || 0), 0))] },
      { title: 'B. Rencana Kebutuhan Pemeliharaan', columns: ['No', 'Nama Aset', 'Kondisi', 'Jenis', 'Vol', 'Sat', 'Harga Satuan', 'Jumlah Biaya'],
        rows: pemel.map((r, i) => [i + 1, r.nama_aset, kon(r.kondisi), r.jenis_pemeliharaan || '—', Number(r.volume), r.satuan, rp(r.harga_satuan), rp(r.jumlah_biaya)]),
        footer: ['', '', '', '', '', '', 'Total', rp(pemel.reduce((a, r) => a + Number(r.jumlah_biaya || 0), 0))] },
    ],
    ttd: ttdDua({ peran: 'Menyetujui,\nPengurus Yayasan Bidang Sarpras', jabatan: '', nama: blank }, { peran: 'Kepala Satuan Pendidikan', jabatan: '', nama: u?.diajukan_nama || blank }),
  }),
  rencana_pengadaan: ({ u, items = [], school }) => ({
    judul: 'FORMULIR RENCANA KEBUTUHAN PENGADAAN ASET',
    nomor: `Tahun Anggaran ${u?.tahun ?? ''}`,
    unit: unitName(school),
    meta: [['Unit', unitName(school)], ['Tahun Anggaran', String(u?.tahun ?? '—')]],
    tables: [{ columns: ['No', 'Kegiatan', 'Nama Aset', 'Spesifikasi', 'Alasan', 'Cara', 'Jml', 'Sat', 'Harga Satuan', 'Jumlah', 'Sumber Dana'],
      rows: items.map((r, i) => [i + 1, r.nama_kegiatan || '—', r.nama_aset, r.spesifikasi || '—', r.alasan_kebutuhan || '—', r.cara_pengadaan || '—', Number(r.jumlah_pengajuan), r.satuan, rp(r.harga_satuan), rp(r.jumlah_harga), r.sumber_anggaran || '—']),
      footer: ['', '', '', '', '', '', '', '', 'Total', rp(items.reduce((a, r) => a + Number(r.jumlah_harga || 0), 0)), ''] }],
    ttd: ttdDua({ peran: 'Mengetahui,\nKepala Satuan Pendidikan', jabatan: '', nama: blank }, { peran: 'Penyusun,\nWakasek/PKS Sarpras', jabatan: '', nama: blank }),
  }),
  rencana_pemeliharaan: ({ u, pemel = [], school }) => ({
    judul: 'FORMULIR RENCANA KEBUTUHAN PEMELIHARAAN ASET',
    nomor: `Tahun Anggaran ${u?.tahun ?? ''}`,
    unit: unitName(school),
    meta: [['Unit', unitName(school)], ['Tahun Anggaran', String(u?.tahun ?? '—')]],
    tables: [{ columns: ['No', 'Kegiatan', 'Kode', 'Nama Aset', 'Jml', 'Lokasi', 'Kondisi', 'Jenis', 'Vol', 'Harga Satuan', 'Jumlah Biaya'],
      rows: pemel.map((r, i) => [i + 1, r.nama_kegiatan || '—', r.kode_aset || '—', r.nama_aset, Number(r.jumlah_aset), r.lokasi || '—', kon(r.kondisi), r.jenis_pemeliharaan || '—', Number(r.volume), rp(r.harga_satuan), rp(r.jumlah_biaya)]),
      footer: ['', '', '', '', '', '', '', '', '', 'Total', rp(pemel.reduce((a, r) => a + Number(r.jumlah_biaya || 0), 0))] }],
    ttd: ttdDua({ peran: 'Mengetahui,\nKepala Satuan Pendidikan', jabatan: '', nama: blank }, { peran: 'Penyusun,\nWakasek/PKS Sarpras', jabatan: '', nama: blank }),
  }),
  daftar_hasil_pengadaan: ({ u, proses = [], school }) => ({
    judul: 'DAFTAR HASIL PENGADAAN ASET',
    nomor: `Tahun Anggaran ${u?.tahun ?? ''}`,
    unit: unitName(school),
    meta: [['Unit', unitName(school)], ['Tahun Anggaran', String(u?.tahun ?? '—')]],
    tables: [{ columns: ['No', 'Nama Aset', 'Metode', 'Penyedia', 'No. SPK/Nota', 'Jml', 'Harga Satuan', 'Status'],
      rows: proses.map((r, i) => [i + 1, r.dka_usulan_item?.nama_aset || '—', r.metode_realisasi || '—', r.penyedia || '—', r.nomor_spk || r.nomor_bukti || '—', Number(r.jumlah_realisasi ?? 0), rp(r.harga_realisasi), r.status]) }],
    ttd: ttdDua({ peran: 'Mengetahui,\nKepala Satuan Pendidikan', jabatan: '', nama: blank }, { peran: 'Tata Usaha / Sarpras', jabatan: '', nama: blank }),
  }),

  // ---------------- Pengadaan ----------------
  spk: ({ p, item, u, school }) => ({
    judul: 'SURAT PERINTAH KERJA (SPK)',
    nomor: p?.nomor_spk || blank,
    unit: unitName(school),
    tanggalTempat: `${school?.nama || blank}, ${tgl(p?.tanggal_spk)}`,
    meta: [['Nomor SPK', p?.nomor_spk || '—'], ['Tanggal', tgl(p?.tanggal_spk)], ['Penyedia', p?.penyedia || '—'], ['Metode', p?.metode_realisasi || '—']],
    intro: `Berdasarkan Daftar Kebutuhan Aset (DKA) Tahun ${u?.tahun ?? ''} yang telah disahkan, Kepala Satuan Pendidikan ${unitName(school)} memerintahkan pekerjaan pengadaan berikut:`,
    tables: [{ columns: ['Nama Aset', 'Spesifikasi', 'Jumlah', 'Harga Satuan', 'Jumlah'],
      rows: [[item?.nama_aset || '—', item?.spesifikasi || '—', Number(p?.jumlah_realisasi ?? item?.jumlah_pengajuan ?? 0), rp(p?.harga_realisasi ?? item?.harga_satuan), rp(Number(p?.jumlah_realisasi ?? item?.jumlah_pengajuan ?? 0) * Number(p?.harga_realisasi ?? item?.harga_satuan ?? 0))]] }],
    narasi: ['Pekerjaan dilaksanakan sesuai spesifikasi, mutu, dan waktu yang disepakati. Pembayaran dilakukan setelah pemeriksaan dan serah terima disetujui.'],
    ttd: ttdDua({ peran: 'Penyedia', jabatan: p?.penyedia || '', nama: blank }, { peran: 'Kepala Satuan Pendidikan', jabatan: '', nama: blank }),
  }),
  ba_pemeriksaan: ({ p, item, school }) => ({
    judul: 'BERITA ACARA PEMERIKSAAN',
    nomor: blank,
    unit: unitName(school),
    tanggalTempat: `${school?.nama || blank}, ${tgl(p?.ba_pemeriksaan_tanggal)}`,
    intro: `Pada hari ini, ${tgl(p?.ba_pemeriksaan_tanggal)}, Panitia/Pemeriksa pada ${unitName(school)} telah memeriksa aset hasil pengadaan sebagai berikut:`,
    tables: [{ columns: ['Nama Aset', 'Spesifikasi', 'Jumlah', 'Penyedia', 'Hasil Pemeriksaan'],
      rows: [[item?.nama_aset || '—', item?.spesifikasi || '—', Number(p?.jumlah_realisasi ?? 0), p?.penyedia || '—', p?.ba_pemeriksaan_hasil === 'sesuai' ? 'SESUAI' : (p?.ba_pemeriksaan_hasil === 'tidak_sesuai' ? 'TIDAK SESUAI' : '—')]] }],
    narasi: [p?.ba_pemeriksaan_catatan ? `Catatan: ${p.ba_pemeriksaan_catatan}` : 'Hasil pemeriksaan dituangkan dalam berita acara ini untuk ditindaklanjuti dengan serah terima.'],
    ttd: ttdDua({ peran: 'Penyedia', jabatan: p?.penyedia || '', nama: blank }, { peran: 'Pemeriksa / Panitia', jabatan: '', nama: blank }),
  }),
  bast_pengadaan: ({ p, item, school }) => ({
    judul: 'BERITA ACARA SERAH TERIMA',
    nomor: blank,
    unit: unitName(school),
    tanggalTempat: `${school?.nama || blank}, ${tgl(p?.ba_serah_terima_tanggal)}`,
    intro: `Pada hari ini, ${tgl(p?.ba_serah_terima_tanggal)}, telah dilaksanakan serah terima aset hasil pengadaan dari Penyedia kepada ${unitName(school)}:`,
    tables: [{ columns: ['Nama Aset', 'Spesifikasi', 'Jumlah', 'No. SPK', 'Nilai'],
      rows: [[item?.nama_aset || '—', item?.spesifikasi || '—', Number(p?.jumlah_realisasi ?? 0), p?.nomor_spk || '—', rp(Number(p?.jumlah_realisasi ?? 0) * Number(p?.harga_realisasi ?? 0))]] }],
    narasi: ['Aset dinyatakan diterima dalam kondisi baik dan selanjutnya dicatat pada Buku Inventaris satuan pendidikan.', p?.ba_serah_terima_catatan ? `Catatan: ${p.ba_serah_terima_catatan}` : ''].filter(Boolean),
    ttd: ttdDua({ peran: 'Yang Menyerahkan,\nPenyedia', jabatan: p?.penyedia || '', nama: blank }, { peran: 'Yang Menerima,\nKepala Satuan Pendidikan', jabatan: '', nama: blank }),
  }),

  // ---------------- Penyaluran ----------------
  spa: ({ r, aset, school }) => ({
    judul: 'SURAT PERMINTAAN ASET (SPA)',
    nomor: r?.nomor_spa || blank,
    unit: unitName(school),
    tanggalTempat: `${school?.nama || blank}, ${tgl(r?.tanggal_permintaan)}`,
    meta: [['Nomor', r?.nomor_spa || '—'], ['Tanggal', tgl(r?.tanggal_permintaan)], ['Peminta/Penerima', r?.penerima || '—'], ['Tujuan', r?.ruangan?.nama || r?.tujuan_lokasi || '—']],
    intro: 'Dengan ini mengajukan permintaan penyaluran aset sebagai berikut:',
    tables: [{ columns: ['Nama Aset', 'Kode', 'Jumlah', 'Tujuan'], rows: [[aset?.nama || '—', aset?.kode_aset || '—', Number(r?.jumlah ?? 1), r?.ruangan?.nama || r?.tujuan_lokasi || '—']] }],
    ttd: ttdDua({ peran: 'Mengetahui,\nKepala Satuan Pendidikan', jabatan: '', nama: blank }, { peran: 'Pemohon', jabatan: r?.penerima || '', nama: blank }),
  }),
  sppa: ({ r, aset, school }) => ({
    judul: 'SURAT PERINTAH PENYALURAN ASET (SPPA)',
    nomor: r?.nomor_sppa || blank,
    unit: unitName(school),
    tanggalTempat: `${school?.nama || blank}, ${tgl(r?.tanggal_penyaluran)}`,
    meta: [['Nomor', r?.nomor_sppa || '—'], ['Tanggal', tgl(r?.tanggal_penyaluran)], ['Dasar', `SPA ${r?.nomor_spa || '—'}`], ['Status', r?.status || '—']],
    intro: 'Memerintahkan penyaluran aset berikut kepada penerima yang ditunjuk:',
    tables: [{ columns: ['Nama Aset', 'Kode', 'Jumlah', 'Tujuan', 'Penerima'], rows: [[aset?.nama || '—', aset?.kode_aset || '—', Number(r?.jumlah ?? 1), r?.ruangan?.nama || r?.tujuan_lokasi || '—', r?.penerima || '—']] }],
    ttd: ttdDua({ peran: 'Penerima', jabatan: r?.penerima || '', nama: blank }, { peran: 'Tata Usaha', jabatan: '', nama: blank }),
  }),

  // ---------------- Penggunaan ----------------
  ba_penggunaan: ({ r, aset, school }) => ({
    judul: 'BERITA ACARA STATUS PENGGUNAAN',
    nomor: r?.nomor_ba || blank,
    unit: unitName(school),
    tanggalTempat: `${school?.nama || blank}, ${tgl(r?.tanggal_penetapan)}`,
    intro: `Pada hari ini, ${tgl(r?.tanggal_penetapan)}, Kepala ${unitName(school)} menetapkan status penggunaan aset kepada:`,
    meta: [['Nama Pengguna', r?.employees?.nama || r?.pengguna_nama || '—'], ['Unit Kerja', r?.unit_kerja || '—'], ['Nomor BA', r?.nomor_ba || '—']],
    tables: [{ columns: ['Nama Aset', 'Kode', 'Lokasi', 'Kondisi'], rows: [[aset?.nama || '—', aset?.kode_aset || '—', aset?.ruangan?.nama || '—', kon(aset?.kondisi)]] }],
    narasi: ['Pemegang status penggunaan bertanggung jawab menatausahakan, menggunakan, dan mengamankan aset tersebut.', r?.keterangan ? `Keterangan: ${r.keterangan}` : ''].filter(Boolean),
    ttd: ttdDua({ peran: 'Pengguna', jabatan: r?.unit_kerja || '', nama: r?.employees?.nama || r?.pengguna_nama || blank }, { peran: 'Kepala Satuan Pendidikan', jabatan: '', nama: blank }),
  }),

  // ---------------- Inventaris ----------------
  kia: ({ a, school }) => ({
    judul: 'KARTU INVENTARIS ASET (KIA)',
    nomor: a?.kode_aset || blank,
    unit: unitName(school),
    meta: [['Kode Aset', a?.kode_aset || '—'], ['Kode Lokasi', a?.kode_lokasi || '—'], ['Nama Aset', a?.nama || '—'], ['Klasifikasi', a?.aset_klasifikasi?.uraian || '—'],
      ['Merk/Tipe', a?.merk_tipe || '—'], ['Ruangan', a?.ruangan?.nama || '—'], ['Tahun Perolehan', String(a?.tahun_perolehan || '—')], ['Nilai Perolehan', rp(a?.nilai_perolehan)],
      ['Jumlah', `${Number(a?.jumlah ?? 1)} ${a?.satuan || 'unit'}`], ['Kondisi', kon(a?.kondisi)], ['Sumber Dana', a?.sumber_dana || '—']],
    ttd: ttdDua({ peran: 'Mengetahui,\nKepala Satuan Pendidikan', jabatan: '', nama: blank }, { peran: 'Penatausaha Aset', jabatan: '', nama: blank }),
  }),
  kir: ({ rg, aset = [], school }) => ({
    judul: 'KARTU INVENTARIS RUANGAN (KIR)',
    nomor: `Ruangan: ${rg?.nama || '—'}`,
    unit: unitName(school),
    meta: [['Ruangan', rg?.nama || '—'], ['Kode Ruangan', rg?.kode_ruangan || rg?.kode || '—'], ['Penanggung Jawab', rg?.pic_nama || '—']],
    tables: [{ columns: ['No', 'Kode Aset', 'Nama Aset', 'Merk', 'Jml', 'Kondisi'],
      rows: aset.map((r, i) => [i + 1, r.kode_aset || '—', r.nama, r.merk_tipe || '—', Number(r.jumlah ?? 1), kon(r.kondisi)]) }],
    ttd: ttdDua({ peran: 'Mengetahui,\nKepala Satuan Pendidikan', jabatan: '', nama: blank }, { peran: 'Penanggung Jawab Ruangan', jabatan: '', nama: rg?.pic_nama || blank }),
  }),
  buku_inventaris: ({ school, aset = [] }) => ({
    judul: 'BUKU INVENTARIS ASET SATUAN PENDIDIKAN',
    nomor: unitName(school),
    unit: unitName(school),
    tables: [{ columns: ['No', 'Kode Aset', 'Kode Lokasi', 'Nama Aset', 'Klasifikasi', 'Ruangan', 'Jml', 'Kondisi', 'Nilai Perolehan'],
      rows: aset.map((r, i) => [i + 1, r.kode_aset || '—', r.kode_lokasi || '—', r.nama, r.aset_klasifikasi?.uraian || '—', r.ruangan?.nama || '—', Number(r.jumlah ?? 1), kon(r.kondisi), rp(r.nilai_perolehan)]),
      footer: ['', '', '', '', '', '', '', 'Total', rp(aset.reduce((a, r) => a + Number(r.nilai_perolehan || 0), 0))] }],
    ttd: ttdDua({ peran: 'Mengetahui,\nPengurus Yayasan Bidang Sarpras', jabatan: '', nama: blank }, { peran: 'Kepala Satuan Pendidikan', jabatan: '', nama: blank }),
  }),
  label_aset: ({ a, school }) => ({
    judul: 'LABEL KODE ASET',
    nomor: '',
    unit: unitName(school),
    meta: [['Kode Aset', a?.kode_aset || '—'], ['Kode Lokasi', a?.kode_lokasi || '—'], ['Nama Aset', a?.nama || '—'], ['Unit', unitName(school)]],
    narasi: ['Potong dan tempelkan label ini pada aset yang bersangkutan.'],
  }),

  // ---------------- Inventarisasi ----------------
  lhi: ({ o, items = [], school }) => ({
    judul: 'LAPORAN HASIL INVENTARISASI (LHI)',
    nomor: `${o?.judul || 'Opname'} — ${o?.tahun ?? ''}`,
    unit: unitName(school),
    meta: [['Unit', unitName(school)], ['Periode', String(o?.tahun ?? '—')], ['Mulai', tgl(o?.tanggal_mulai)], ['Selesai', tgl(o?.tanggal_selesai)], ['Status', o?.status || '—']],
    tables: [{ columns: ['No', 'Kode', 'Nama Aset', 'Kondisi Tercatat', 'Temuan', 'Kondisi Aktual', 'Catatan'],
      rows: items.map((r, i) => [i + 1, r.kode_aset || '—', r.nama_aset || '—', kon(r.kondisi_tercatat), r.ditemukan === null ? 'belum dicek' : (r.ditemukan ? 'Ada' : 'Hilang'), r.kondisi_aktual ? kon(r.kondisi_aktual) : '—', r.catatan || '—']) }],
    ttd: ttdDua({ peran: 'Mengesahkan,\nPengurus Yayasan Bidang Sarpras', jabatan: '', nama: blank }, { peran: 'Ketua Tim Inventarisasi', jabatan: '', nama: blank }),
  }),
  ba_inventarisasi: ({ o, items = [], school }) => ({
    judul: 'BERITA ACARA HASIL INVENTARISASI',
    nomor: blank,
    unit: unitName(school),
    tanggalTempat: `${school?.nama || blank}, ${tgl(o?.tanggal_selesai)}`,
    intro: `Pada hari ini telah dilaksanakan inventarisasi (opname) aset pada ${unitName(school)} periode ${o?.tahun ?? ''} dengan hasil sebagai berikut:`,
    tables: [{ columns: ['Keterangan', 'Jumlah'],
      rows: [['Total aset diperiksa', String(items.length)], ['Ditemukan (ada)', String(items.filter((i) => i.ditemukan === true).length)], ['Tidak ditemukan (hilang)', String(items.filter((i) => i.ditemukan === false).length)], ['Belum diperiksa', String(items.filter((i) => i.ditemukan === null).length)]] }],
    narasi: [o?.catatan ? `Catatan: ${o.catatan}` : 'Hasil inventarisasi menjadi dasar pemutakhiran KIA/KIR dan tindak lanjut aset rusak berat/hilang.'],
    ttd: ttdDua({ peran: 'Mengetahui,\nKepala Satuan Pendidikan', jabatan: '', nama: blank }, { peran: 'Ketua Tim Inventarisasi', jabatan: '', nama: blank }),
  }),
  laporan_aset: ({ school, aset = [] }) => {
    const byKon = { baik: 0, rusak_ringan: 0, rusak_berat: 0 }
    aset.forEach((a) => { if (a.status === 'aktif') byKon[a.kondisi] = (byKon[a.kondisi] || 0) + 1 })
    return {
      judul: 'LAPORAN ASET SATUAN PENDIDIKAN',
      nomor: unitName(school),
      unit: unitName(school),
      tables: [{ columns: ['Ringkasan', 'Nilai'],
        rows: [['Jumlah aset (baris)', String(aset.filter((a) => a.status === 'aktif').length)], ['Kondisi Baik', String(byKon.baik)], ['Rusak Ringan', String(byKon.rusak_ringan)], ['Rusak Berat', String(byKon.rusak_berat)], ['Total Nilai Perolehan', rp(aset.reduce((a, r) => a + (r.status === 'aktif' ? Number(r.nilai_perolehan || 0) : 0), 0))]] }],
      ttd: ttdDua({ peran: 'Mengetahui,\nPengurus Yayasan Bidang Sarpras', jabatan: '', nama: blank }, { peran: 'Kepala Satuan Pendidikan', jabatan: '', nama: blank }),
    }
  },

  // ---------------- Pemeliharaan ----------------
  logbook_pemeliharaan: ({ school, logs = [] }) => ({
    judul: 'LOGBOOK PEMELIHARAAN & PERBAIKAN ASET',
    nomor: unitName(school),
    unit: unitName(school),
    tables: [{ columns: ['No', 'Tanggal', 'Aset', 'Jenis', 'Uraian', 'Biaya', 'Pelaksana', 'Kondisi Akhir'],
      rows: logs.map((r, i) => [i + 1, tgl(r.tanggal), r.aset?.nama || '—', r.jenis || '—', r.uraian || '—', rp(r.biaya), r.pelaksana || '—', r.kondisi_sesudah ? kon(r.kondisi_sesudah) : '—']),
      footer: ['', '', '', '', '', rp(logs.reduce((a, r) => a + Number(r.biaya || 0), 0)), '', ''] }],
    ttd: ttdDua({ peran: 'Mengetahui,\nKepala Satuan Pendidikan', jabatan: '', nama: blank }, { peran: 'PKS Sarpras', jabatan: '', nama: blank }),
  }),

  // ---------------- Penghapusan ----------------
  permohonan_penghapusan: ({ u, items = [], school }) => ({
    judul: 'PERMOHONAN PENGHAPUSAN ASET',
    nomor: blank,
    unit: unitName(school),
    tanggalTempat: `${school?.nama || blank}, ${tgl(u?.diajukan_at)}`,
    intro: `Dengan hormat, ${unitName(school)} mengajukan permohonan penghapusan aset dengan alasan ${u?.alasan || '—'} dan rencana tindak lanjut ${u?.cara || '—'}, atas aset berikut:`,
    tables: [{ columns: ['No', 'Kode', 'Nama Aset', 'Kondisi', 'Nilai', 'Keterangan'],
      rows: items.map((r, i) => [i + 1, r.kode_aset || '—', r.nama_aset || '—', kon(r.kondisi), r.nilai != null ? rp(r.nilai) : '—', r.keterangan || '—']) }],
    ttd: ttdDua({ peran: 'Mengetahui,\nPengurus Yayasan Bidang Sarpras', jabatan: '', nama: blank }, { peran: 'Kepala Satuan Pendidikan', jabatan: '', nama: u?.diajukan_nama || blank }),
  }),
  persetujuan_penghapusan: ({ u, items = [], school }) => ({
    judul: 'SURAT PERSETUJUAN PENGHAPUSAN',
    nomor: blank,
    unit: unitName(school),
    tanggalTempat: `${blank}, ${tgl(u?.diputuskan_at)}`,
    intro: `Menyetujui permohonan penghapusan aset dari ${unitName(school)} sejumlah ${items.length} aset dengan alasan ${u?.alasan || '—'}. Tindak lanjut: ${u?.cara || '—'}.`,
    narasi: ['Persetujuan ini menjadi dasar penerbitan Surat Keputusan Penghapusan Aset oleh Pengelola Aset.'],
    ttd: [{ peran: 'Ketua Yayasan', jabatan: KOP.singkat, nama: blank }],
  }),
  sk_penghapusan: ({ u, items = [], school }) => ({
    judul: 'SURAT KEPUTUSAN PENGHAPUSAN ASET',
    nomor: u?.nomor_sk || blank,
    unit: unitName(school),
    tanggalTempat: `${blank}, ${tgl(u?.diputuskan_at)}`,
    meta: [['Nomor SK', u?.nomor_sk || '—'], ['Unit', unitName(school)], ['Alasan', u?.alasan || '—'], ['Tindak Lanjut', u?.cara || '—']],
    intro: 'Memutuskan menghapus aset berikut dari Buku Inventaris:',
    tables: [{ columns: ['No', 'Kode', 'Nama Aset', 'Kondisi', 'Nilai'],
      rows: items.map((r, i) => [i + 1, r.kode_aset || '—', r.nama_aset || '—', kon(r.kondisi), r.nilai != null ? rp(r.nilai) : '—']) }],
    ttd: [{ peran: 'Pengelola Aset / Pengurus Yayasan Bidang Sarpras', jabatan: '', nama: blank }],
  }),
  formulir_disposal: ({ u, items = [], school }) => ({
    judul: `FORMULIR ${(u?.cara || 'DISPOSAL').toUpperCase()} ASET`,
    nomor: blank,
    unit: unitName(school),
    meta: [['Unit', unitName(school)], ['Cara', u?.cara || '—'], ['Dasar', `SK ${u?.nomor_sk || '—'}`]],
    tables: [{ columns: ['No', 'Kode', 'Nama Aset', 'Kondisi', 'Nilai Taksiran', 'Penerima/Pembeli'],
      rows: items.map((r, i) => [i + 1, r.kode_aset || '—', r.nama_aset || '—', kon(r.kondisi), r.nilai != null ? rp(r.nilai) : blank, blank]) }],
    ttd: ttdDua({ peran: 'Penerima/Pembeli', jabatan: '', nama: blank }, { peran: 'Kepala Satuan Pendidikan', jabatan: '', nama: blank }),
  }),
  bast_penghapusan: ({ u, items = [], school }) => ({
    judul: 'BERITA ACARA SERAH TERIMA (PEMINDAHTANGANAN)',
    nomor: blank,
    unit: unitName(school),
    tanggalTempat: `${school?.nama || blank}, ${tgl(u?.diputuskan_at)}`,
    intro: `Telah dilaksanakan serah terima pemindahtanganan aset (${u?.cara || '—'}) dari ${unitName(school)} berdasarkan SK ${u?.nomor_sk || '—'} atas aset berikut:`,
    tables: [{ columns: ['No', 'Kode', 'Nama Aset', 'Kondisi'],
      rows: items.map((r, i) => [i + 1, r.kode_aset || '—', r.nama_aset || '—', kon(r.kondisi)]) }],
    ttd: ttdDua({ peran: 'Yang Menerima', jabatan: '', nama: blank }, { peran: 'Yang Menyerahkan,\nKepala Satuan Pendidikan', jabatan: '', nama: blank }),
  }),

  // ---------------- Formulir kosong (sumber luar / manual) ----------------
  kerangka_pengadaan: () => ({ judul: 'KERANGKA KERJA PENGADAAN', nomor: blank, meta: [['Nama Aset', blank], ['Merk & Spesifikasi', blank], ['Jumlah', blank], ['Harga Satuan', blank], ['Pagu Anggaran', blank], ['Waktu & Lokasi', blank], ['Persyaratan Penyedia', blank]], narasi: ['Formulir disusun berdasarkan DKA yang ditetapkan & RKAS satuan pendidikan.'], ttd: ttdDua({ peran: 'Menyetujui,\nKetua Yayasan', jabatan: '', nama: blank }, { peran: 'Kepala Satuan Pendidikan', jabatan: '', nama: blank }) }),
  surat_penawaran: () => ({ judul: 'SURAT PENAWARAN / INVOICE', nomor: blank, tables: [{ columns: ['No', 'Nama Barang', 'Spesifikasi', 'Jumlah', 'Harga Satuan', 'Jumlah'], rows: Array.from({ length: 6 }, (_, i) => [i + 1, '', '', '', '', '']) }], ttd: [{ peran: 'Hormat kami,\nPenyedia', jabatan: '', nama: blank }] }),
  kartu_persediaan: () => ({ judul: 'KARTU PERSEDIAAN ASET', nomor: blank, meta: [['Nama Barang', blank], ['Satuan', blank]], tables: [{ columns: ['Tanggal', 'Uraian', 'Masuk', 'Keluar', 'Saldo'], rows: Array.from({ length: 10 }, () => ['', '', '', '', '']) }], ttd: [{ peran: 'Petugas Gudang / Tata Usaha', jabatan: '', nama: blank }] }),
  buku_pengeluaran: () => ({ judul: 'BUKU PENGELUARAN ASET', nomor: blank, tables: [{ columns: ['Tanggal', 'Nama Aset', 'Jumlah', 'Tujuan/Penerima', 'No. SPPA', 'Paraf'], rows: Array.from({ length: 12 }, () => ['', '', '', '', '', '']) }], ttd: [{ peran: 'Tata Usaha', jabatan: '', nama: blank }] }),
  bukti_pengambilan: () => ({ judul: 'BUKTI PENGAMBILAN ASET', nomor: blank, meta: [['Nama Pengambil', blank], ['Unit/Jabatan', blank], ['Tanggal', blank]], tables: [{ columns: ['Nama Aset', 'Kode', 'Jumlah', 'Keperluan'], rows: Array.from({ length: 4 }, () => ['', '', '', '']) }], ttd: ttdDua({ peran: 'Pengambil', jabatan: '', nama: blank }, { peran: 'Petugas', jabatan: '', nama: blank }) }),
  surat_pengajuan_penggunaan: () => ({ judul: 'SURAT PENGAJUAN STATUS PENGGUNAAN', nomor: blank, intro: 'Dengan ini mengajukan permohonan penggunaan aset untuk mendukung pelaksanaan tugas sebagai berikut:', tables: [{ columns: ['Nama Aset', 'Jumlah', 'Keperluan/Tugas'], rows: Array.from({ length: 4 }, () => ['', '', '']) }], ttd: ttdDua({ peran: 'Menyetujui,\nKepala Satuan Pendidikan', jabatan: '', nama: blank }, { peran: 'Pemohon', jabatan: '', nama: blank }) }),
  rencana_inventarisasi: () => ({ judul: 'RENCANA KERJA INVENTARISASI', nomor: blank, meta: [['Tim Inventarisasi', blank], ['Periode', blank], ['Lokasi/Ruangan', blank]], tables: [{ columns: ['No', 'Kegiatan', 'Jadwal', 'Penanggung Jawab'], rows: Array.from({ length: 6 }, (_, i) => [i + 1, '', '', '']) }], ttd: ttdDua({ peran: 'Menyetujui,\nPengurus Yayasan Bidang Sarpras', jabatan: '', nama: blank }, { peran: 'Ketua Tim Inventarisasi', jabatan: '', nama: blank }) }),
  jadwal_pemeliharaan: () => ({ judul: 'PROGRAM & JADWAL PEMELIHARAAN', nomor: blank, tables: [{ columns: ['No', 'Nama Aset', 'Jenis Pemeliharaan', 'Frekuensi/Jadwal', 'Pelaksana'], rows: Array.from({ length: 8 }, (_, i) => [i + 1, '', '', '', '']) }], ttd: ttdDua({ peran: 'Mengetahui,\nKepala Satuan Pendidikan', jabatan: '', nama: blank }, { peran: 'PKS Sarpras', jabatan: '', nama: blank }) }),
}
