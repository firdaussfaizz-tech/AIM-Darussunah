import { useEffect, useMemo, useState, useCallback } from 'react'
import { AlertTriangle, Info } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { Card, Input, Select, Button, Badge, FullPageSpinner, StatCard } from './ui'
import { formatRupiah, formatDate } from '../lib/format'
import { hitungIH, hitungRuang, hitungRemunerasi, ambilSkalaGaji, kategoriFromSkor, IK_TABLE } from '../lib/remunerasi'

const HARI_TO_DOW = {
  minggu: 0, senin: 1, selasa: 2, rabu: 3, kamis: 4, jumat: 5, "jum'at": 5, sabtu: 6,
}

function buildScheduleByDay(rows) {
  const map = {}
  rows.forEach((r) => {
    const dow = HARI_TO_DOW[(r.hari || '').trim().toLowerCase()]
    if (dow === undefined) return
    map[dow] = { jam_pulang: r.jam_pulang, aktif: true }
  })
  // Minggu default libur bila tidak ada baris eksplisit
  if (map[0] === undefined) map[0] = { aktif: false }
  return map
}

/** Semester PKP mengikuti Pasal 9 Draft SK: Jul-Des dinilai di semester genap, Jan-Jul di semester ganjil. */
function defaultPeriode(tahun, bulan) {
  if (bulan >= 8 && bulan <= 12) return { mulai: `${tahun}-08-01`, selesai: `${tahun}-12-31` }
  if (bulan === 7) return { mulai: `${tahun}-01-01`, selesai: `${tahun}-07-31` }
  return { mulai: `${tahun}-01-01`, selesai: `${tahun}-07-31` }
}

export default function IndeksKehadiranSection({ employee, canManage }) {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const [loading, setLoading] = useState(true)
  const [scheduleByDay, setScheduleByDay] = useState({})
  const [salaryScale, setSalaryScale] = useState([])
  const [attendanceRows, setAttendanceRows] = useState([])
  const [performanceIndex, setPerformanceIndex] = useState(null)
  const [ikForm, setIkForm] = useState({ open: false, skor: '', kategori: 'A' })
  const [savingIk, setSavingIk] = useState(false)

  const [tahun, bulan] = month.split('-').map(Number)

  const load = useCallback(async () => {
    setLoading(true)
    const start = `${month}-01`
    const endDate = new Date(tahun, bulan, 1).toISOString().slice(0, 10)
    const [{ data: ws }, { data: scale }, { data: att }, { data: perf }] = await Promise.all([
      supabase.from('work_schedules').select('hari, jam_pulang'),
      supabase.from('salary_scale').select('*'),
      supabase
        .from('attendance')
        .select('*, leave_requests(dokumen_terlampir, durasi_jam, leave_types(kode, nama, nilai_hari_hadir, hitung_hari_kerja_wajib, batas_kejadian_per_bulan, pengurangan_ih_setelah_batas))')
        .eq('employee_id', employee.id)
        .gte('tanggal', start)
        .lt('tanggal', endDate),
      supabase
        .from('performance_index')
        .select('*')
        .eq('employee_id', employee.id)
        .lte('periode_mulai', endDate)
        .gte('periode_selesai', start)
        .order('periode_mulai', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
    setScheduleByDay(buildScheduleByDay(ws || []))
    setSalaryScale(scale || [])
    setAttendanceRows(att || [])
    setPerformanceIndex(perf || null)
    setLoading(false)
  }, [employee.id, month, tahun, bulan])

  useEffect(() => { load() }, [load])

  const ruang = useMemo(() => hitungRuang(employee.tanggal_masuk), [employee.tanggal_masuk])
  const scaleRow = useMemo(() => ambilSkalaGaji(salaryScale, employee.golongan, ruang), [salaryScale, employee.golongan, ruang])

  const ih = useMemo(() => {
    if (loading) return null
    return hitungIH({ attendanceRows, tahun, bulan, scheduleByDay })
  }, [attendanceRows, tahun, bulan, scheduleByDay, loading])

  const remunerasi = useMemo(() => {
    if (!ih || !scaleRow || !performanceIndex) return null
    return hitungRemunerasi(scaleRow.nilai_jabatan, performanceIndex.indeks_kinerja, ih.ihFinal)
  }, [ih, scaleRow, performanceIndex])

  const openIkForm = () => {
    const periode = defaultPeriode(tahun, bulan)
    setIkForm({ open: true, skor: performanceIndex?.skor ?? '', kategori: performanceIndex?.kategori || 'A', ...periode })
  }

  const saveIk = async () => {
    setSavingIk(true)
    const skorNum = ikForm.skor === '' ? null : Number(ikForm.skor)
    const kategoriRow = skorNum != null ? kategoriFromSkor(skorNum) : IK_TABLE.find((r) => r.kategori === ikForm.kategori)
    await supabase.from('performance_index').upsert({
      employee_id: employee.id,
      periode_mulai: ikForm.mulai,
      periode_selesai: ikForm.selesai,
      skor: skorNum,
      kategori: kategoriRow.kategori,
      indeks_kinerja: kategoriRow.indeks,
    }, { onConflict: 'employee_id,periode_mulai' })
    setSavingIk(false)
    setIkForm((s) => ({ ...s, open: false }))
    load()
  }

  if (loading) return <FullPageSpinner />

  const nonHadirPenuh = ih.detail.filter((d) => d.nilaiHadir !== 1 || d.terlambat || d.pulangAwal)

  return (
    <div className="flex flex-col gap-5">
      <Card padded={false}>
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <Input type="month" containerClassName="sm:w-48" value={month} onChange={(e) => setMonth(e.target.value)} label="Bulan" />
          <p className="flex items-start gap-1.5 text-xs text-[var(--color-ink-soft)] sm:max-w-md">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Hari Kerja Wajib dihitung Senin–Sabtu mengikuti Jam Kerja yang berlaku, belum memperhitungkan libur nasional/kalender pendidikan.
          </p>
        </div>
      </Card>

      {(!employee.golongan || !scaleRow) && (
        <Card className="border-[var(--color-gold)] bg-[var(--color-gold-soft)]">
          <p className="flex items-center gap-2 text-sm font-medium text-[var(--color-gold)]">
            <AlertTriangle className="h-4 w-4" /> Golongan/Ruang pegawai ini belum lengkap sehingga Tunjangan Remunerasi belum dapat dihitung.
          </p>
          {canManage && <p className="mt-1 text-xs text-[var(--color-gold)]">Atur Golongan lewat tombol "Ubah Biodata" pada tab Biodata.</p>}
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Kehadiran Efektif" value={`${ih.persentase}%`} sub={`${ih.hariHadirPenuh} / ${ih.hariKerjaWajib} hari wajib`} />
        <StatCard label="IH Dasar" value={ih.ihDasar.toFixed(2)} sub={ih.ihDasarLabel} />
        <StatCard label="Total Potongan" value={`-${ih.totalPengurangan.toFixed(2)}`} sub={`${ih.rincianPengurangan.length} jenis potongan`} />
        <StatCard label="Indeks Kehadiran Final" value={ih.ihFinal.toFixed(2)} />
      </div>

      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[13px] font-medium text-[var(--color-ink-soft)]">Indeks Kinerja (periode berjalan)</p>
            {performanceIndex ? (
              <p className="mt-1 text-[15px] text-[var(--color-ink)]">
                Kategori <Badge color="navy">{performanceIndex.kategori}</Badge> · Indeks {performanceIndex.indeks_kinerja.toFixed(2)}
                <span className="ml-2 text-xs text-[var(--color-ink-soft)]">({formatDate(performanceIndex.periode_mulai)} – {formatDate(performanceIndex.periode_selesai)})</span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-[var(--color-ink-soft)]">Belum diatur untuk periode ini.</p>
            )}
          </div>
          {canManage && <Button variant="outline" size="sm" onClick={openIkForm}>{performanceIndex ? 'Ubah' : 'Atur'} Indeks Kinerja</Button>}
        </div>

        {ikForm.open && (
          <div className="mt-4 grid grid-cols-1 gap-3 rounded-[12px] border border-[var(--color-border)] p-4 sm:grid-cols-2">
            <Input label="Skor Penilaian (0-100, opsional)" type="number" min="0" max="100" value={ikForm.skor}
              onChange={(e) => setIkForm((s) => ({ ...s, skor: e.target.value }))} />
            <Select label="Kategori" value={ikForm.kategori} onChange={(e) => setIkForm((s) => ({ ...s, kategori: e.target.value }))} disabled={ikForm.skor !== ''}>
              {IK_TABLE.map((r) => <option key={r.kategori} value={r.kategori}>{r.kategori} — {r.label} ({r.indeks.toFixed(2)})</option>)}
            </Select>
            <Input label="Periode Mulai" type="date" value={ikForm.mulai} onChange={(e) => setIkForm((s) => ({ ...s, mulai: e.target.value }))} />
            <Input label="Periode Selesai" type="date" value={ikForm.selesai} onChange={(e) => setIkForm((s) => ({ ...s, selesai: e.target.value }))} />
            <div className="flex gap-2 sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setIkForm((s) => ({ ...s, open: false }))}>Batal</Button>
              <Button type="button" onClick={saveIk} disabled={savingIk}>{savingIk ? 'Menyimpan…' : 'Simpan'}</Button>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <p className="text-[13px] font-medium text-[var(--color-ink-soft)]">Tunjangan Remunerasi Bulan Ini</p>
        {remunerasi != null ? (
          <>
            <p className="mt-1 font-[family-name:var(--font-display)] text-[32px] font-semibold text-[var(--color-navy)]">{formatRupiah(remunerasi)}</p>
            <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
              Nilai Jabatan {formatRupiah(scaleRow.nilai_jabatan)} (Gol. {employee.golongan}/{ruang}) × IK {performanceIndex.indeks_kinerja.toFixed(2)} × IH {ih.ihFinal.toFixed(2)}
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Belum dapat dihitung — {!scaleRow ? 'Golongan/Ruang belum lengkap' : !performanceIndex ? 'Indeks Kinerja periode ini belum diatur' : 'data belum lengkap'}.
          </p>
        )}
      </Card>

      {ih.rincianPengurangan.length > 0 && (
        <Card>
          <p className="mb-3 text-[13px] font-medium text-[var(--color-ink-soft)]">Rincian Potongan Indeks Kehadiran</p>
          <div className="flex flex-col gap-2">
            {ih.rincianPengurangan.map((r, i) => (
              <div key={i} className="flex items-center justify-between border-b border-[var(--color-border)] py-2 text-sm last:border-0">
                <span className="text-[var(--color-ink)]">{r.label} <span className="text-[var(--color-ink-soft)]">({r.kejadian}x)</span></span>
                <span className="font-medium text-[var(--color-danger)]">-{r.nilai.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {nonHadirPenuh.length > 0 && (
        <Card>
          <p className="mb-3 text-[13px] font-medium text-[var(--color-ink-soft)]">Rincian Hari Tidak Hadir Penuh / Bermasalah</p>
          <div className="scroll-thin max-h-80 overflow-y-auto">
            {nonHadirPenuh.map((d) => (
              <div key={d.tanggal} className="flex items-center justify-between border-b border-[var(--color-border)] py-2 text-sm last:border-0">
                <span className="text-[var(--color-ink)]">{formatDate(d.tanggal)}</span>
                <span className="text-[var(--color-ink-soft)]">
                  {d.jenis === 'alpa' ? 'Alpa' : d.jenis === 'leave' ? d.nama : d.jenis}
                  {d.terlambat && ' · Terlambat'}
                  {d.pulangAwal && ' · Pulang awal'}
                  {d.belumTertaut && ' · belum tertaut pengajuan'}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
