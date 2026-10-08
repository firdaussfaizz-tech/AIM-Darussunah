import { useEffect, useMemo, useState } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { FileBarChart, FileSpreadsheet, FileText, FileDown, BarChart3 } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, SectionCard, Select, Table, Tr, Td, FullPageSpinner, EmptyState, Button, Badge } from '../../components/ui'
import { formatRupiah, BULAN } from '../../lib/format'
import { exportExcel, exportCsv, exportPdf, fmtCell } from '../../lib/reportExport'

const BULAN_SINGKAT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const JENJANG_ORDER = { SD: 0, SMP: 1, SMA: 2, Pesantren: 3 }

// Daftar laporan yang tersedia di modul Analitik. Setiap laporan punya
// filter sendiri (lihat state di bawah) dan fungsi pemuat data yang
// mengembalikan { columns, rows, chart }.
const LAPORAN = [
  { id: 'gaji-unit', label: 'Biaya Gaji per Unit', desc: 'Rekap gaji bruto, potongan, dan bersih per satuan pendidikan untuk satu periode penggajian.' },
  { id: 'spp-unit', label: 'Kolektibilitas SPP per Unit', desc: 'Tagihan, pembayaran, tunggakan, dan persentase lunas SPP per unit pada tahun ajaran tertentu.' },
  { id: 'kehadiran-pegawai', label: 'Tren Kehadiran Pegawai', desc: 'Persentase presensi berstatus Hadir per bulan.' },
  { id: 'kehadiran-siswa', label: 'Tren Kehadiran Siswa', desc: 'Persentase presensi siswa berstatus Hadir per bulan.' },
  { id: 'sebaran-pegawai', label: 'Sebaran Pegawai', desc: 'Jumlah pegawai aktif dan total per jenjang satuan pendidikan.' },
]

const RENTANG_OPTIONS = [
  { value: 3, label: '3 bulan terakhir' },
  { value: 6, label: '6 bulan terakhir' },
  { value: 12, label: '12 bulan terakhir' },
]

function slug(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// Bangun daftar label bulan (YYYY-MM) mundur dari bulan berjalan.
function bulanRange(months) {
  const out = []
  const cursor = new Date()
  cursor.setDate(1)
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(cursor.getFullYear(), cursor.getMonth() - i, 1)
    out.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: `${BULAN_SINGKAT[d.getMonth()]} ${d.getFullYear()}` })
  }
  return out
}

function trenKehadiran(rows, months) {
  const map = {}
  for (const a of rows) {
    if (!a.tanggal) continue
    const key = a.tanggal.slice(0, 7)
    if (!map[key]) map[key] = { total: 0, hadir: 0 }
    map[key].total += 1
    if (a.status === 'hadir') map[key].hadir += 1
  }
  return bulanRange(months).map((b) => {
    const m = map[b.key]
    return {
      bulan: b.label,
      total: m ? m.total : 0,
      hadir: m ? m.hadir : 0,
      persen: m && m.total > 0 ? Math.round((m.hadir / m.total) * 1000) / 10 : 0,
    }
  })
}

export default function Analitik() {
  const { isManager, hasFullAccess, permsReady, can } = useAuth()
  const boleh = isManager || (permsReady && can('analitik', 'lihat'))

  const [reportId, setReportId] = useState('gaji-unit')
  const [loading, setLoading] = useState(true)
  const [result, setResult] = useState({ columns: [], rows: [], chart: null, meta: [] })

  // Filter per-laporan
  const [payrollRuns, setPayrollRuns] = useState([])
  const [runId, setRunId] = useState('')
  const [tahunAjaranList, setTahunAjaranList] = useState([])
  const [taId, setTaId] = useState('')
  const [sppBulan, setSppBulan] = useState('') // '' = seluruh tahun ajaran
  const [months, setMonths] = useState(6)

  // Muat opsi selektor sekali.
  useEffect(() => {
    if (!boleh) return
    const loadOptions = async () => {
      const [{ data: runs }, { data: taList }] = await Promise.all([
        supabase.from('payroll_runs').select('id, periode_bulan, periode_tahun, status').order('periode_tahun', { ascending: false }).order('periode_bulan', { ascending: false }),
        supabase.from('tahun_ajaran').select('id, nama, status').order('nama', { ascending: false }),
      ])
      setPayrollRuns(runs || [])
      setRunId((runs && runs.length > 0) ? runs[0].id : '')
      setTahunAjaranList(taList || [])
      const aktif = (taList || []).find((t) => t.status === 'aktif')
      setTaId(aktif ? aktif.id : (taList && taList.length > 0 ? taList[0].id : ''))
    }
    loadOptions()
  }, [boleh])

  const scopeNote = hasFullAccess ? 'Cakupan: seluruh yayasan (lintas unit)' : 'Cakupan: unit sesuai hak akses Anda'

  // Muat data laporan terpilih.
  useEffect(() => {
    if (!boleh) { setLoading(false); return }
    let batal = false
    const load = async () => {
      setLoading(true)
      let out = { columns: [], rows: [], chart: null, meta: [] }
      const tgl = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })

      if (reportId === 'gaji-unit') {
        if (!runId) { out.meta = ['Belum ada periode penggajian.']; if (!batal) { setResult(out); setLoading(false) }; return }
        const run = payrollRuns.find((r) => r.id === runId)
        const { data } = await supabase
          .from('payroll_details')
          .select('gaji_pokok, total_tunjangan, total_potongan, gaji_bersih, employees(schools!school_id(nama, jenjang))')
          .eq('payroll_run_id', runId)
        const map = {}
        for (const d of (data || [])) {
          const sch = d.employees?.schools
          const key = sch ? `${sch.jenjang} — ${sch.nama}` : 'Kantor Yayasan'
          if (!map[key]) map[key] = { unit: key, jenjang: sch?.jenjang || 'zzz', jumlah: 0, bruto: 0, potongan: 0, bersih: 0 }
          const m = map[key]
          m.jumlah += 1
          m.bruto += Number(d.gaji_pokok || 0) + Number(d.total_tunjangan || 0)
          m.potongan += Number(d.total_potongan || 0)
          m.bersih += Number(d.gaji_bersih || 0)
        }
        const rows = Object.values(map).sort((a, b) => (JENJANG_ORDER[a.jenjang] ?? 9) - (JENJANG_ORDER[b.jenjang] ?? 9) || a.unit.localeCompare(b.unit))
        out = {
          columns: [
            { key: 'unit', label: 'Unit', align: 'left', type: 'text' },
            { key: 'jumlah', label: 'Pegawai', align: 'right', type: 'number' },
            { key: 'bruto', label: 'Bruto', align: 'right', type: 'rupiah' },
            { key: 'potongan', label: 'Potongan', align: 'right', type: 'rupiah' },
            { key: 'bersih', label: 'Bersih', align: 'right', type: 'rupiah' },
          ],
          rows,
          chart: { kind: 'bar', xKey: 'unit', bars: [{ key: 'bersih', label: 'Gaji Bersih' }], valueType: 'rupiah' },
          meta: [`Periode: ${run ? `${BULAN[run.periode_bulan - 1]} ${run.periode_tahun}${run.status === 'final' ? ' (final)' : ' (draft)'}` : '—'}`, scopeNote, `Dibuat: ${tgl}`],
          title: 'Biaya Gaji per Unit',
          fileslug: `gaji-unit-${run ? run.periode_tahun + '-' + String(run.periode_bulan).padStart(2, '0') : ''}`,
        }
      } else if (reportId === 'spp-unit') {
        if (!taId) { out.meta = ['Belum ada tahun ajaran.']; if (!batal) { setResult(out); setLoading(false) }; return }
        const ta = tahunAjaranList.find((t) => t.id === taId)
        const { data } = await supabase.rpc('spp_rekap_per_unit', { p_tahun_ajaran_id: taId, p_bulan: sppBulan === '' ? null : Number(sppBulan) })
        const rows = (data || []).map((u) => {
          const dt = Number(u.total_tagihan || 0)
          const db = Number(u.total_dibayar || 0)
          const jt = Number(u.jumlah_tagihan || 0)
          const jl = Number(u.jumlah_lunas || 0)
          return {
            unit: u.jenjang ? `${u.jenjang} — ${u.nama}` : (u.nama || 'Tanpa unit'),
            jenjang: u.jenjang || 'zzz',
            ditagih: dt, dibayar: db, tunggakan: Math.max(0, dt - db),
            persen: jt > 0 ? Math.round((jl / jt) * 100) : 0,
          }
        }).sort((a, b) => (JENJANG_ORDER[a.jenjang] ?? 9) - (JENJANG_ORDER[b.jenjang] ?? 9) || a.unit.localeCompare(b.unit))
        out = {
          columns: [
            { key: 'unit', label: 'Unit', align: 'left', type: 'text' },
            { key: 'ditagih', label: 'Ditagih', align: 'right', type: 'rupiah' },
            { key: 'dibayar', label: 'Dibayar', align: 'right', type: 'rupiah' },
            { key: 'tunggakan', label: 'Tunggakan', align: 'right', type: 'rupiah' },
            { key: 'persen', label: '% Lunas', align: 'right', type: 'persen' },
          ],
          rows,
          chart: { kind: 'bar', xKey: 'unit', bars: [{ key: 'tunggakan', label: 'Tunggakan' }], valueType: 'rupiah' },
          meta: [`Tahun Ajaran: ${ta ? ta.nama : '—'}${ta?.status === 'aktif' ? ' (aktif)' : ''}`, `Bulan: ${sppBulan === '' ? 'Semua bulan' : BULAN[Number(sppBulan) - 1]}`, scopeNote, `Dibuat: ${tgl}`],
          title: 'Kolektibilitas SPP per Unit',
          fileslug: `spp-unit-${ta ? slug(ta.nama) : ''}`,
        }
      } else if (reportId === 'kehadiran-pegawai' || reportId === 'kehadiran-siswa') {
        const isSiswa = reportId === 'kehadiran-siswa'
        const awal = new Date(); awal.setMonth(awal.getMonth() - (months - 1)); awal.setDate(1)
        const awalStr = awal.toISOString().slice(0, 10)
        const { data } = await supabase.from(isSiswa ? 'presensi_siswa' : 'attendance').select('tanggal, status').gte('tanggal', awalStr)
        const rows = trenKehadiran(data || [], months)
        out = {
          columns: [
            { key: 'bulan', label: 'Bulan', align: 'left', type: 'text' },
            { key: 'total', label: 'Total Presensi', align: 'right', type: 'number' },
            { key: 'hadir', label: 'Hadir', align: 'right', type: 'number' },
            { key: 'persen', label: '% Hadir', align: 'right', type: 'persen' },
          ],
          rows,
          chart: { kind: 'line', xKey: 'bulan', lines: [{ key: 'persen', label: '% Hadir' }], valueType: 'persen' },
          meta: [`Rentang: ${months} bulan terakhir`, scopeNote, `Dibuat: ${tgl}`],
          title: isSiswa ? 'Tren Kehadiran Siswa' : 'Tren Kehadiran Pegawai',
          fileslug: `${isSiswa ? 'kehadiran-siswa' : 'kehadiran-pegawai'}-${months}bln`,
        }
      } else if (reportId === 'sebaran-pegawai') {
        const { data } = await supabase.from('employees').select('status, schools!school_id(jenjang)')
        const map = {}
        for (const e of (data || [])) {
          const j = e.schools?.jenjang || 'Kantor Yayasan'
          if (!map[j]) map[j] = { jenjang: j, aktif: 0, total: 0 }
          map[j].total += 1
          if (e.status === 'aktif') map[j].aktif += 1
        }
        const rows = Object.values(map).sort((a, b) => (JENJANG_ORDER[a.jenjang] ?? 9) - (JENJANG_ORDER[b.jenjang] ?? 9))
        out = {
          columns: [
            { key: 'jenjang', label: 'Jenjang', align: 'left', type: 'text' },
            { key: 'aktif', label: 'Pegawai Aktif', align: 'right', type: 'number' },
            { key: 'total', label: 'Total Tercatat', align: 'right', type: 'number' },
          ],
          rows,
          chart: { kind: 'bar', xKey: 'jenjang', bars: [{ key: 'aktif', label: 'Pegawai Aktif' }], valueType: 'number' },
          meta: [scopeNote, `Dibuat: ${tgl}`],
          title: 'Sebaran Pegawai per Jenjang',
          fileslug: 'sebaran-pegawai',
        }
      }
      if (!batal) { setResult(out); setLoading(false) }
    }
    load()
    return () => { batal = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boleh, reportId, runId, taId, sppBulan, months, payrollRuns, tahunAjaranList])

  // Baris total untuk kolom numerik (selain kolom teks pertama & persen).
  const totalRow = useMemo(() => {
    if (!result.rows.length) return null
    const t = {}
    let ada = false
    for (const c of result.columns) {
      if (c.type === 'rupiah' || c.type === 'number') {
        t[c.key] = result.rows.reduce((a, r) => a + (Number(r[c.key]) || 0), 0)
        ada = true
      }
    }
    return ada ? t : null
  }, [result])

  if (!boleh) {
    return (
      <div>
        <PageHeader title="Analitik & Laporan" />
        <EmptyState icon={BarChart3} title="Akses terbatas" description="Modul Analitik & Laporan hanya untuk manajemen (Yayasan/HR/Kepala Sekolah)." />
      </div>
    )
  }

  const laporan = LAPORAN.find((l) => l.id === reportId)
  const baseName = result.fileslug || reportId
  const doExport = (fn) => fn({
    filename: baseName,
    title: result.title || laporan?.label,
    meta: result.meta,
    sheetName: (laporan?.label || 'Laporan').slice(0, 31),
    columns: result.columns,
    rows: result.rows,
  })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Analitik & Laporan"
        description="Laporan lintas-modul siap-pakai dengan filter dan ekspor Excel/CSV/PDF — untuk Pengurus/Pembina & manajemen unit."
      />

      {/* Pemilih laporan */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {LAPORAN.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => setReportId(l.id)}
            className={`rounded-xl border p-3.5 text-left transition ${
              reportId === l.id
                ? 'border-[var(--color-navy)] bg-[var(--color-navy-50)] shadow-sm'
                : 'border-[var(--color-border)] bg-white hover:border-[var(--color-navy)]/40'
            }`}
          >
            <div className="flex items-center gap-2">
              <FileBarChart className="h-4 w-4 text-[var(--color-navy)]" strokeWidth={2} />
              <span className="text-sm font-semibold text-[var(--color-ink)]">{l.label}</span>
            </div>
            <p className="mt-1 text-xs leading-snug text-[var(--color-ink-soft)]">{l.desc}</p>
          </button>
        ))}
      </div>

      <SectionCard
        title={laporan?.label}
        description={result.meta?.join(' · ')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Filter kontekstual per laporan */}
            {reportId === 'gaji-unit' && payrollRuns.length > 0 && (
              <Select containerClassName="w-44" value={runId} onChange={(e) => setRunId(e.target.value)}>
                {payrollRuns.map((r) => (
                  <option key={r.id} value={r.id}>{BULAN[r.periode_bulan - 1]} {r.periode_tahun}{r.status === 'final' ? '' : ' (draft)'}</option>
                ))}
              </Select>
            )}
            {reportId === 'spp-unit' && tahunAjaranList.length > 0 && (
              <>
                <Select containerClassName="w-44" value={taId} onChange={(e) => setTaId(e.target.value)}>
                  {tahunAjaranList.map((t) => (
                    <option key={t.id} value={t.id}>{t.nama}{t.status === 'aktif' ? ' (aktif)' : ''}</option>
                  ))}
                </Select>
                <Select containerClassName="w-40" value={sppBulan} onChange={(e) => setSppBulan(e.target.value)}>
                  <option value="">Semua Bulan</option>
                  {BULAN.map((b, i) => <option key={i} value={i + 1}>{b}</option>)}
                </Select>
              </>
            )}
            {(reportId === 'kehadiran-pegawai' || reportId === 'kehadiran-siswa') && (
              <Select containerClassName="w-44" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
                {RENTANG_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            )}
          </div>
        }
      >
        {loading ? (
          <div className="py-10"><FullPageSpinner /></div>
        ) : result.rows.length === 0 ? (
          <EmptyState icon={FileBarChart} title="Belum ada data" description="Tidak ada data untuk filter/periode yang dipilih, atau data di luar cakupan akses Anda." />
        ) : (
          <div className="flex flex-col gap-5">
            {/* Tombol ekspor */}
            <div className="flex flex-wrap items-center gap-2">
              <Badge color="navy">{result.rows.length} baris</Badge>
              <div className="flex-1" />
              <Button variant="outline" size="sm" onClick={() => doExport(exportExcel)}>
                <FileSpreadsheet className="h-4 w-4" /> Excel
              </Button>
              <Button variant="outline" size="sm" onClick={() => doExport(exportCsv)}>
                <FileDown className="h-4 w-4" /> CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => doExport(exportPdf)}>
                <FileText className="h-4 w-4" /> PDF
              </Button>
            </div>

            {/* Grafik */}
            {result.chart && (
              <div className="rounded-xl border border-[var(--color-border)] p-3">
                <ResponsiveContainer width="100%" height={260}>
                  {result.chart.kind === 'bar' ? (
                    <BarChart data={result.rows} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                      <XAxis dataKey={result.chart.xKey} tick={{ fontSize: 11, fill: 'var(--color-ink-soft)' }} axisLine={{ stroke: 'var(--color-border)' }} tickLine={false} interval={0} angle={result.rows.length > 4 ? -15 : 0} textAnchor={result.rows.length > 4 ? 'end' : 'middle'} height={result.rows.length > 4 ? 56 : 30} />
                      <YAxis tick={{ fontSize: 11, fill: 'var(--color-ink-soft)' }} axisLine={false} tickLine={false} tickFormatter={(v) => result.chart.valueType === 'rupiah' ? `${Math.round(v / 1_000_000)}jt` : v} />
                      <Tooltip cursor={{ fill: 'var(--color-navy-50)' }} contentStyle={{ borderRadius: 8, borderColor: 'var(--color-border)', fontSize: 13 }} formatter={(v) => result.chart.valueType === 'rupiah' ? formatRupiah(v) : (result.chart.valueType === 'persen' ? `${v}%` : v)} />
                      {result.chart.bars.map((b) => <Bar key={b.key} dataKey={b.key} name={b.label} fill="var(--color-navy)" radius={[4, 4, 0, 0]} maxBarSize={56} />)}
                    </BarChart>
                  ) : (
                    <LineChart data={result.rows} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                      <XAxis dataKey={result.chart.xKey} tick={{ fontSize: 11, fill: 'var(--color-ink-soft)' }} axisLine={{ stroke: 'var(--color-border)' }} tickLine={false} />
                      <YAxis domain={result.chart.valueType === 'persen' ? [0, 100] : [0, 'auto']} tick={{ fontSize: 11, fill: 'var(--color-ink-soft)' }} axisLine={false} tickLine={false} tickFormatter={(v) => result.chart.valueType === 'persen' ? `${v}%` : v} />
                      <Tooltip cursor={{ stroke: 'var(--color-border)' }} contentStyle={{ borderRadius: 8, borderColor: 'var(--color-border)', fontSize: 13 }} formatter={(v) => result.chart.valueType === 'persen' ? `${v}%` : v} />
                      {result.chart.lines.map((l) => <Line key={l.key} type="monotone" dataKey={l.key} name={l.label} stroke="var(--color-navy)" strokeWidth={2} dot={{ r: 3 }} />)}
                    </LineChart>
                  )}
                </ResponsiveContainer>
              </div>
            )}

            {/* Tabel */}
            <Table columns={result.columns.map((c) => c.label)}>
              {result.rows.map((r, i) => (
                <Tr key={i}>
                  {result.columns.map((c) => (
                    <Td key={c.key} className={c.align === 'right' ? 'text-right tabular-nums' : ''}>
                      {fmtCell(r[c.key], c.type)}
                    </Td>
                  ))}
                </Tr>
              ))}
              {totalRow && (
                <Tr>
                  {result.columns.map((c, idx) => (
                    <Td key={c.key} className={`font-semibold ${c.align === 'right' ? 'text-right tabular-nums' : ''}`}>
                      {idx === 0 ? 'Total' : (totalRow[c.key] != null ? fmtCell(totalRow[c.key], c.type) : '')}
                    </Td>
                  ))}
                </Tr>
              )}
            </Table>
          </div>
        )}
      </SectionCard>
    </div>
  )
}
