// =====================================================================
// DOKUMEN CETAK MODUL AKADEMIK — terisi otomatis dari data.
// Dirender oleh <DokumenCetak> (format docDef sama dengan dokumen Sarpras).
// Parameter tambahan dikirim lewat query string: ta (tahun ajaran id),
// sem (Ganjil/Genap), d1/d2 (rentang tanggal).
// =====================================================================
import { supabase } from './supabaseClient'
import { HARI_LABEL, JENIS_KALENDER_LABEL, PPDB_STATUS_LABEL, hitungRekapKbm, liburDariKalender } from './academic'

const tgl = (d) => (d ? new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '.............................')
const unitName = (s) => (s ? `${s.jenjang} — ${s.nama}` : 'Kantor Yayasan Pusat')
const blank = '____________________'
const jam = (r) => (r?.jam_mulai ? `${r.jam_mulai.slice(0, 5)}${r.jam_selesai ? `–${r.jam_selesai.slice(0, 5)}` : ''}` : '')

export const DOKUMEN_AKD = [
  { jenis: 'jadwal_rombel', label: 'Jadwal Pelajaran Kelas' },
  { jenis: 'jadwal_guru', label: 'Jadwal Mengajar Guru' },
  { jenis: 'sk_tugas_mengajar', label: 'SK Pembagian Tugas Mengajar' },
  { jenis: 'kalender_akademik', label: 'Kalender Akademik' },
  { jenis: 'bukti_ppdb', label: 'Bukti Pendaftaran PPDB' },
  { jenis: 'hasil_ppdb', label: 'Pengumuman Hasil Seleksi PPDB' },
  { jenis: 'rekap_kbm', label: 'Rekap Kehadiran Mengajar Guru' },
]
export const DOKUMEN_AKD_BY_JENIS = Object.fromEntries(DOKUMEN_AKD.map((d) => [d.jenis, d]))

async function tahunAjaran(id) {
  if (!id) return null
  const { data } = await supabase.from('tahun_ajaran').select('id, nama, tanggal_mulai, tanggal_selesai').eq('id', id).maybeSingle()
  return data
}

// Grid Jam × Hari dari daftar slot jadwal. cellText(slot) → isi sel.
function gridJadwal(rows, cellText) {
  const hariSet = new Set([1, 2, 3, 4, 5])
  rows.forEach((r) => hariSet.add(Number(r.hari)))
  const hari = [...hariSet].sort((a, b) => a - b)
  const jamList = [...new Set(rows.map((r) => Number(r.jam_ke)))].sort((a, b) => a - b)
  const bodyRows = jamList.map((j) => {
    const any = rows.find((r) => Number(r.jam_ke) === j && r.jam_mulai)
    return [`Ke-${j}${any ? `\n${jam(any)}` : ''}`, ...hari.map((h) => rows.filter((r) => Number(r.jam_ke) === j && Number(r.hari) === h).map(cellText).join(' / ') || '')]
  })
  return { columns: ['Jam', ...hari.map((h) => HARI_LABEL[h])], rows: bodyRows }
}

export async function loadDokumenAkd(jenis, id, qs = {}) {
  const ta = await tahunAjaran(qs.ta)
  const sem = qs.sem || 'Ganjil'

  if (jenis === 'jadwal_rombel') {
    const { data: rombel } = await supabase.from('rombel').select('id, nama_rombel, tingkat, schools!school_id(nama, jenjang), wali:wali_kelas_employee_id(nama)').eq('id', id).maybeSingle()
    let q = supabase.from('jadwal_pelajaran').select('*, mata_pelajaran(nama), employees(nama), ruangan(nama)').eq('rombel_id', id).eq('semester', sem)
    if (qs.ta) q = q.eq('tahun_ajaran_id', qs.ta)
    const { data: rows } = await q
    return { ta, sem, rombel, rows: rows || [] }
  }
  if (jenis === 'jadwal_guru') {
    const { data: guru } = await supabase.from('employees').select('id, nama, nip, schools!school_id(nama, jenjang)').eq('id', id).maybeSingle()
    let q = supabase.from('jadwal_pelajaran').select('*, mata_pelajaran(nama), rombel(nama_rombel), ruangan(nama)').eq('employee_id', id).eq('semester', sem)
    if (qs.ta) q = q.eq('tahun_ajaran_id', qs.ta)
    const { data: rows } = await q
    return { ta, sem, guru, rows: rows || [] }
  }
  if (jenis === 'sk_tugas_mengajar') {
    const { data: school } = await supabase.from('schools').select('id, nama, jenjang, kepala:kepala_sekolah_id(nama, nip)').eq('id', id).maybeSingle()
    let q = supabase.from('penugasan_mengajar').select('*, employees(nama, nip), mata_pelajaran(nama), rombel(nama_rombel)').eq('school_id', id).eq('semester', sem)
    if (qs.ta) q = q.eq('tahun_ajaran_id', qs.ta)
    const { data: rows } = await q
    return { ta, sem, school, rows: rows || [] }
  }
  if (jenis === 'kalender_akademik') {
    const { data: school } = await supabase.from('schools').select('id, nama, jenjang').eq('id', id).maybeSingle()
    let aq = supabase.from('kalender_akademik').select('*').or(`school_id.is.null,school_id.eq.${id}`).order('tanggal_mulai')
    let hq = supabase.from('school_holidays').select('tanggal, keterangan').or(`school_id.is.null,school_id.eq.${id}`).order('tanggal')
    if (ta?.tanggal_mulai) { aq = aq.gte('tanggal_mulai', ta.tanggal_mulai); hq = hq.gte('tanggal', ta.tanggal_mulai) }
    if (ta?.tanggal_selesai) { aq = aq.lte('tanggal_mulai', ta.tanggal_selesai); hq = hq.lte('tanggal', ta.tanggal_selesai) }
    const [{ data: agenda }, { data: libur }] = await Promise.all([aq, hq])
    return { ta, school, agenda: agenda || [], libur: libur || [] }
  }
  if (jenis === 'bukti_ppdb') {
    const { data: p } = await supabase.from('ppdb_pendaftar').select('*, schools!school_id(nama, jenjang), tahun_ajaran(nama)').eq('id', id).maybeSingle()
    return { p }
  }
  if (jenis === 'hasil_ppdb') {
    const { data: school } = await supabase.from('schools').select('id, nama, jenjang, kepala:kepala_sekolah_id(nama, nip)').eq('id', id).maybeSingle()
    let q = supabase.from('ppdb_pendaftar').select('*').eq('school_id', id)
    if (qs.ta) q = q.eq('tahun_ajaran_id', qs.ta)
    const { data: rows } = await q
    return { ta, school, rows: rows || [] }
  }
  if (jenis === 'rekap_kbm') {
    const { data: school } = await supabase.from('schools').select('id, nama, jenjang, kepala:kepala_sekolah_id(nama, nip)').eq('id', id).maybeSingle()
    let jq = supabase.from('jurnal_kbm').select('employee_id, tanggal, kehadiran_guru, employees(nama)').eq('school_id', id).gte('tanggal', qs.d1).lte('tanggal', qs.d2)
    let sq = supabase.from('jadwal_pelajaran').select('employee_id, hari, employees(nama)').eq('school_id', id).eq('semester', sem)
    if (qs.ta) sq = sq.eq('tahun_ajaran_id', qs.ta)
    if (qs.emp) { jq = jq.eq('employee_id', qs.emp); sq = sq.eq('employee_id', qs.emp) }
    const hq = supabase.from('school_holidays').select('tanggal').or(`school_id.is.null,school_id.eq.${id}`).gte('tanggal', qs.d1).lte('tanggal', qs.d2)
    // Batasi rentang ke periode tahun ajaran agar sesi terjadwal tidak menggelembung.
    const c1 = ta?.tanggal_mulai && ta.tanggal_mulai > qs.d1 ? ta.tanggal_mulai : qs.d1
    const c2 = ta?.tanggal_selesai && ta.tanggal_selesai < qs.d2 ? ta.tanggal_selesai : qs.d2
    const kq = supabase.from('kalender_akademik').select('jenis, tanggal_mulai, tanggal_selesai').eq('jenis', 'libur').or(`school_id.is.null,school_id.eq.${id}`).lte('tanggal_mulai', qs.d2)
    const [{ data: jurnal }, { data: jadwal }, { data: libur }, { data: kal }] = await Promise.all([jq, sq, hq, kq])
    const liburAll = [...(libur || []).map((l) => l.tanggal), ...liburDariKalender(kal || [])]
    return { school, d1: qs.d1, d2: qs.d2, rekap: hitungRekapKbm({ jurnal: jurnal || [], jadwal: jadwal || [], libur: liburAll, d1: c1, d2: c2 }) }
  }
  return {}
}

const ttdKepala = (school) => ({ peran: `Ditetapkan, ${tgl(new Date())}\nKepala Sekolah`, jabatan: school?.kepala?.nip ? `NIP. ${school.kepala.nip}` : '', nama: school?.kepala?.nama || blank })

export function buildDokumenAkd(jenis, d = {}) {
  const taNama = d.ta?.nama || '—'

  if (jenis === 'jadwal_rombel') {
    const g = gridJadwal(d.rows || [], (r) => `${r.mata_pelajaran?.nama || '—'}${r.employees?.nama ? `\n(${r.employees.nama})` : ''}`)
    return {
      orientasi: 'landscape',
      judul: 'JADWAL PELAJARAN',
      nomor: `Kelas ${d.rombel?.nama_rombel || '—'} · Semester ${d.sem} · Tahun Ajaran ${taNama}`,
      unit: unitName(d.rombel?.schools),
      meta: [['Kelas', d.rombel?.nama_rombel || '—'], ['Wali Kelas', d.rombel?.wali?.nama || '—']],
      tables: [g],
      ttd: [{ peran: 'Mengetahui,\nWakasek Kurikulum', jabatan: '', nama: blank }, { peran: 'Wali Kelas', jabatan: '', nama: d.rombel?.wali?.nama || blank }],
    }
  }
  if (jenis === 'jadwal_guru') {
    const rows = d.rows || []
    const g = gridJadwal(rows, (r) => `${r.mata_pelajaran?.nama || '—'}${r.rombel?.nama_rombel ? `\n${r.rombel.nama_rombel}` : ''}`)
    return {
      orientasi: 'landscape',
      judul: 'JADWAL MENGAJAR GURU',
      nomor: `Semester ${d.sem} · Tahun Ajaran ${taNama}`,
      unit: unitName(d.guru?.schools),
      meta: [['Nama Guru', d.guru?.nama || '—'], ['NIP', d.guru?.nip || '—'], ['Jumlah Tatap Muka', `${rows.length} JP / minggu`]],
      tables: [g],
      ttd: [{ peran: 'Mengetahui,\nWakasek Kurikulum', jabatan: '', nama: blank }, { peran: 'Guru', jabatan: d.guru?.nip ? `NIP. ${d.guru.nip}` : '', nama: d.guru?.nama || blank }],
    }
  }
  if (jenis === 'sk_tugas_mengajar') {
    const byGuru = {}
    for (const r of d.rows || []) {
      const k = r.employee_id || '__none'
      const g = (byGuru[k] ||= { nama: r.employees?.nama || '(belum ditetapkan)', nip: r.employees?.nip, mapel: {}, jp: 0 })
      const m = r.mata_pelajaran?.nama || '—'
      ;(g.mapel[m] ||= []).push(r.rombel?.nama_rombel || '—')
      g.jp += Number(r.jam_per_minggu || 0)
    }
    const list = Object.values(byGuru).sort((a, b) => a.nama.localeCompare(b.nama))
    return {
      judul: 'KEPUTUSAN KEPALA SEKOLAH',
      nomor: `Nomor: ${blank}\nTENTANG PEMBAGIAN TUGAS MENGAJAR GURU\nSEMESTER ${String(d.sem).toUpperCase()} TAHUN AJARAN ${taNama}`,
      unit: unitName(d.school),
      intro: `Kepala ${unitName(d.school)}, dalam rangka kelancaran kegiatan belajar mengajar pada Semester ${d.sem} Tahun Ajaran ${taNama}, MEMUTUSKAN: menetapkan pembagian tugas mengajar guru sebagaimana tercantum pada lampiran berikut.`,
      tables: [{
        columns: ['No', 'Nama Guru', 'NIP', 'Mata Pelajaran (Kelas)', 'Jumlah JP'],
        rows: list.map((g, i) => [i + 1, g.nama, g.nip || '—', Object.entries(g.mapel).map(([m, kls]) => `${m} (${kls.join(', ')})`).join('; '), `${g.jp} JP`]),
        footer: ['', '', '', 'Total', `${list.reduce((a, g) => a + g.jp, 0)} JP`],
      }],
      narasi: ['Keputusan ini berlaku sejak tanggal ditetapkan, dengan ketentuan apabila di kemudian hari terdapat kekeliruan akan diperbaiki sebagaimana mestinya.'],
      ttd: [ttdKepala(d.school)],
    }
  }
  if (jenis === 'kalender_akademik') {
    const items = [
      ...(d.agenda || []).map((a) => ({ t: a.tanggal_mulai, t2: a.tanggal_selesai, judul: a.judul, jenis: JENIS_KALENDER_LABEL[a.jenis] || a.jenis, ket: a.keterangan || '' })),
      ...(d.libur || []).map((l) => ({ t: l.tanggal, t2: null, judul: l.keterangan, jenis: 'Libur', ket: 'Kalender Libur' })),
    ].sort((a, b) => String(a.t).localeCompare(String(b.t)))
    return {
      judul: 'KALENDER AKADEMIK',
      nomor: `Tahun Ajaran ${taNama}`,
      unit: unitName(d.school),
      tables: [{ columns: ['No', 'Tanggal', 'Kegiatan', 'Jenis', 'Keterangan'], rows: items.map((x, i) => [i + 1, x.t2 && x.t2 !== x.t ? `${tgl(x.t)} – ${tgl(x.t2)}` : tgl(x.t), x.judul, x.jenis, x.ket]) }],
      ttd: [ttdKepala(d.school)],
    }
  }
  if (jenis === 'bukti_ppdb') {
    const p = d.p || {}
    return {
      judul: 'BUKTI PENDAFTARAN PESERTA DIDIK BARU',
      nomor: p.no_pendaftaran || blank,
      unit: unitName(p.schools),
      meta: [['No. Pendaftaran', p.no_pendaftaran || '—'], ['Tahun Ajaran', p.tahun_ajaran?.nama || '—'], ['Nama Lengkap', p.nama_lengkap || '—'],
        ['Jenis Kelamin', p.jenis_kelamin === 'L' ? 'Laki-laki' : p.jenis_kelamin === 'P' ? 'Perempuan' : '—'], ['Tempat, Tgl Lahir', `${p.tempat_lahir || '—'}, ${tgl(p.tanggal_lahir)}`],
        ['NISN', p.nisn || '—'], ['Asal Sekolah', p.asal_sekolah || '—'], ['Jalur', p.jalur || '—'], ['Kelas Tujuan', p.tingkat_tujuan || '—'],
        ['Nama Ayah / Ibu', `${p.nama_ayah || '—'} / ${p.nama_ibu || '—'}`], ['No. HP', p.no_hp || '—'], ['Status', PPDB_STATUS_LABEL[p.status] || p.status || '—']],
      narasi: ['Simpan bukti pendaftaran ini dan bawa saat verifikasi berkas / daftar ulang.'],
      ttd: [{ peran: 'Pendaftar / Orang Tua', jabatan: '', nama: p.nama_ayah || p.nama_ibu || blank }, { peran: 'Panitia PPDB', jabatan: '', nama: blank }],
    }
  }
  if (jenis === 'hasil_ppdb') {
    const urut = { diterima: 0, cadangan: 1, verifikasi: 2, daftar: 3, ditolak: 4, mengundurkan_diri: 5 }
    const rows = [...(d.rows || [])].sort((a, b) => (urut[a.status] - urut[b.status]) || (Number(b.nilai_seleksi || 0) - Number(a.nilai_seleksi || 0)) || a.nama_lengkap.localeCompare(b.nama_lengkap))
    return {
      judul: 'PENGUMUMAN HASIL SELEKSI PPDB',
      nomor: `Tahun Ajaran ${taNama}`,
      unit: unitName(d.school),
      intro: `Berdasarkan hasil seleksi Penerimaan Peserta Didik Baru ${unitName(d.school)} Tahun Ajaran ${taNama}, dengan ini diumumkan hasil seleksi sebagai berikut:`,
      tables: [{ columns: ['No', 'No. Pendaftaran', 'Nama Lengkap', 'Asal Sekolah', 'Jalur', 'Nilai', 'Hasil'],
        rows: rows.map((r, i) => [i + 1, r.no_pendaftaran || '—', r.nama_lengkap, r.asal_sekolah || '—', r.jalur || '—', r.nilai_seleksi ?? '—', PPDB_STATUS_LABEL[r.status] || r.status]) }],
      narasi: ['Peserta yang dinyatakan diterima wajib melakukan daftar ulang sesuai jadwal yang ditetapkan panitia.'],
      ttd: [ttdKepala(d.school)],
    }
  }
  if (jenis === 'rekap_kbm') {
    const pct = (v) => (v == null ? '—' : `${v}%`)
    return {
      orientasi: 'landscape',
      judul: 'REKAP KEHADIRAN MENGAJAR GURU',
      nomor: `Periode ${tgl(d.d1)} s.d. ${tgl(d.d2)}`,
      unit: unitName(d.school),
      tables: [{ columns: ['No', 'Nama Guru', 'Sesi Terjadwal', 'Jurnal Terisi', 'Hadir', 'Tugas Dinas', 'Izin', 'Sakit', 'Digantikan', 'Terlaksana', 'Keterisian Jurnal'],
        rows: (d.rekap || []).map((r, i) => [i + 1, r.nama, r.terjadwal, r.jurnal, r.hadir, r.tugas, r.izin, r.sakit, r.digantikan, pct(r.terlaksanaPct), pct(r.keterisianPct)]) }],
      narasi: ['Terlaksana = (hadir + tugas dinas) ÷ jurnal terisi. Keterisian jurnal = jurnal terisi ÷ sesi terjadwal (hari efektif sesuai jadwal, di luar hari libur).'],
      ttd: [ttdKepala(d.school)],
    }
  }
  return { judul: 'DOKUMEN', narasi: ['Definisi dokumen tidak ditemukan.'] }
}
