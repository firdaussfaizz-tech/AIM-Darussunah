// Penghitung realisasi KPI Lembaga OTOMATIS dari modul operasional (A13).
// - kehadiran_pegawai: dihitung di sini dengan MEMAKAI ULANG mesin Indeks
//   Kehadiran hitungIH() (remunerasi.js) agar persis mengikuti aturan yang
//   sudah ada (cuti dihitung hadir, Izin Sakit ber-SKD berjatah, libur).
// - kehadiran_siswa / tunggakan_spp / rata_nilai_kinerja: dihitung di SQL
//   lewat RPC public.kpi_hitung_otomatis (0034_kpi_sumber_otomatis.sql).
//
// Semua mengembalikan { pembilang, pembagi, realisasi, catatan }. Nilai
// ini MENGISI form realisasi (pembilang/pembagi), lalu tetap dikonfirmasi
// & disimpan manusia — tidak ada penyimpanan otomatis.
import { supabase } from './supabaseClient'
import { hitungIH } from './remunerasi'

const round2 = (v) => (v === null || v === undefined ? null : Math.round(Number(v) * 100) / 100)

export const SUMBER_OTOMATIS_LABEL = {
  manual: 'Manual (diisi tangan)',
  kehadiran_pegawai: 'Kehadiran pegawai (Presensi)',
  kehadiran_siswa: 'Kehadiran siswa (Presensi Siswa)',
  tunggakan_spp: 'Tunggakan SPP',
  rata_nilai_kinerja: 'Rata-rata nilai kinerja',
}

// Daftar {tahun, bulan} dari d1..d2 (inklusif per bulan kalender).
function monthsBetween(d1, d2) {
  const start = new Date(d1)
  const end = new Date(d2)
  const out = []
  let y = start.getFullYear()
  let m = start.getMonth() // 0-11
  while (y < end.getFullYear() || (y === end.getFullYear() && m <= end.getMonth())) {
    out.push({ tahun: y, bulan: m + 1 })
    m += 1
    if (m > 11) { m = 0; y += 1 }
  }
  return out
}

// kehadiran_pegawai — memakai ulang hitungIH per (pegawai, bulan) lalu
// menjumlahkan Hari Hadir Efektif & Hari Kerja Wajib se-unit.
async function kehadiranPegawai(schoolId, d1, d2) {
  if (!d1 || !d2) throw new Error('Isi rentang tanggal lebih dulu.')
  const { data: emps, error: e1 } = await supabase
    .from('employees').select('id').eq('school_id', schoolId).eq('status', 'aktif')
  if (e1) throw new Error(e1.message)
  const empIds = (emps || []).map((e) => e.id)
  if (empIds.length === 0) return { pembilang: 0, pembagi: 0, realisasi: null, catatan: 'Tidak ada pegawai aktif di unit ini.' }

  const [{ data: att, error: e2 }, { data: hol }] = await Promise.all([
    supabase
      .from('attendance')
      .select('employee_id, tanggal, status, jam_masuk, jam_pulang, leave_request_id, leave_requests(dokumen_terlampir, durasi_jam, leave_types(kode, nama, nilai_hari_hadir, hitung_hari_kerja_wajib, jatah_per_bulan, batas_kejadian_per_bulan, pengurangan_ih_setelah_batas))')
      .in('employee_id', empIds)
      .gte('tanggal', d1)
      .lte('tanggal', d2),
    supabase
      .from('school_holidays')
      .select('tanggal')
      .or(`school_id.is.null,school_id.eq.${schoolId}`)
      .gte('tanggal', d1)
      .lte('tanggal', d2),
  ])
  if (e2) throw new Error(e2.message)
  const holidayDates = (hol || []).map((h) => h.tanggal)
  const months = monthsBetween(d1, d2)

  const byEmp = {}
  for (const r of (att || [])) (byEmp[r.employee_id] ||= []).push(r)

  let sumHadir = 0
  let sumWajib = 0
  for (const empId of empIds) {
    const rows = byEmp[empId] || []
    for (const { tahun, bulan } of months) {
      const monthRows = rows.filter((r) => {
        const dt = new Date(r.tanggal)
        return dt.getFullYear() === tahun && dt.getMonth() + 1 === bulan
      })
      const ih = hitungIH({ attendanceRows: monthRows, tahun, bulan, holidayDates })
      sumHadir += ih.hariHadirPenuh
      sumWajib += ih.hariKerjaWajib
    }
  }
  return {
    pembilang: round2(sumHadir),
    pembagi: round2(sumWajib),
    realisasi: sumWajib > 0 ? round2((sumHadir / sumWajib) * 100) : null,
    catatan: `${empIds.length} pegawai × ${months.length} bulan (aturan Indeks Kehadiran).`,
  }
}

// Sumber berbasis SQL — dihitung server-side lewat RPC.
async function viaRpc(indikatorId, d1, d2) {
  const { data, error } = await supabase.rpc('kpi_hitung_otomatis', {
    p_indikator_id: indikatorId,
    p_d1: d1 || null,
    p_d2: d2 || null,
  })
  if (error) throw new Error(error.message)
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new Error('Tidak ada hasil perhitungan.')
  return {
    pembilang: row.pembilang ?? null,
    pembagi: row.pembagi ?? null,
    realisasi: row.realisasi ?? null,
    catatan: row.catatan || null,
  }
}

// Titik masuk tunggal. `indikator` butuh { id, school_id, sumber_otomatis }.
export async function hitungKpiOtomatis({ indikator, d1, d2 }) {
  const sumber = indikator?.sumber_otomatis
  if (!sumber || sumber === 'manual') throw new Error('Indikator ini tidak memakai sumber otomatis.')
  if (sumber === 'kehadiran_pegawai') return kehadiranPegawai(indikator.school_id, d1, d2)
  return viaRpc(indikator.id, d1, d2)
}

// Apakah sumber ini butuh rentang tanggal (vs berbasis Tahun Ajaran)?
export function butuhRentangTanggal(sumber) {
  return sumber === 'kehadiran_pegawai' || sumber === 'kehadiran_siswa'
}
