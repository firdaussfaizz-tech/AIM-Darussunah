import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { Users, CalendarCheck, CalendarClock, FileWarning } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { PageHeader, Card, SectionCard, StatCard, FullPageSpinner, Badge, EmptyState, Select, Table, Tr, Td } from '../components/ui'
import { formatDate, formatRupiah, STATUS_BADGE_COLOR, BULAN } from '../lib/format'
import { hitungBebanKerja, DEFAULT_BEBAN_KERJA_SETTINGS } from '../lib/workload'

const H_PERINGATAN_KADALUARSA = 30
const BULAN_SINGKAT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

export default function Dashboard() {
  const { isManager, hasFullAccess, employee, profile } = useAuth()
  return (
    <div>
      <PageHeader
        title={`Selamat datang, ${(profile?.full_name || '').split(' ')[0] || ''}`}
        description={isManager ? 'Ringkasan kepegawaian yayasan hari ini.' : 'Ringkasan data kepegawaian Anda.'}
      />
      {isManager ? <ManagerDashboard hasFullAccess={hasFullAccess} /> : <SelfDashboard employeeId={employee?.id} />}
    </div>
  )
}

function ManagerDashboard({ hasFullAccess }) {
  const [loading, setLoading] = useState(true)
  const [employees, setEmployees] = useState([])
  const [pendingLeave, setPendingLeave] = useState([])
  const [todayAttendance, setTodayAttendance] = useState([])
  const [trainings, setTrainings] = useState([])
  const [expiringContracts, setExpiringContracts] = useState([])
  const [expiringDocs, setExpiringDocs] = useState([])

  // Data ringkasan tingkat Yayasan (Roadmap B Integrasi #12) — hanya untuk
  // Admin Yayasan/HR, karena mencakup data lintas unit sekolah yang di luar
  // wewenang Kepala Sekolah/Admin Sekolah per school_id masing-masing.
  const [yayasanLoading, setYayasanLoading] = useState(true)
  const [payrollRuns, setPayrollRuns] = useState([])
  const [selectedRunId, setSelectedRunId] = useState('')
  const [payrollDetails, setPayrollDetails] = useState([])
  const [payrollDetailsLoading, setPayrollDetailsLoading] = useState(false)
  const [attendanceTrendRows, setAttendanceTrendRows] = useState([])
  const [bebanEmployees, setBebanEmployees] = useState([])
  const [bebanRows, setBebanRows] = useState([])
  const [tugasRows, setTugasRows] = useState([])
  const [bebanSettings, setBebanSettings] = useState(DEFAULT_BEBAN_KERJA_SETTINGS)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const today = new Date().toISOString().slice(0, 10)
      const batasAtas = new Date()
      batasAtas.setDate(batasAtas.getDate() + H_PERINGATAN_KADALUARSA)
      const batasAtasStr = batasAtas.toISOString().slice(0, 10)
      const [emp, leave, att, tr, contracts, docs] = await Promise.all([
        supabase.from('employees').select('id, status, status_kepegawaian, schools!school_id(nama, jenjang)'),
        supabase
          .from('leave_requests')
          .select('id, tanggal_mulai, tanggal_selesai, employees!employee_id(nama), leave_types(nama)')
          .in('status', ['pending', 'menunggu_yayasan'])
          .order('created_at', { ascending: false })
          .limit(5),
        supabase.from('attendance').select('status').eq('tanggal', today),
        supabase
          .from('trainings')
          .select('id, nama_pelatihan, tanggal_mulai, lokasi')
          .gte('tanggal_mulai', today)
          .order('tanggal_mulai', { ascending: true })
          .limit(4),
        // Kontrak aktif yang berakhir dalam H-30 — termasuk yang sudah lewat
        // (tanggal_selesai < today) supaya admin tetap melihat kontrak yang
        // terlambat diperpanjang/diubah statusnya.
        supabase
          .from('employment_contracts')
          .select('id, jenis_kontrak, tanggal_selesai, employees!employee_id(nama)')
          .eq('status', 'aktif')
          .not('tanggal_selesai', 'is', null)
          .lte('tanggal_selesai', batasAtasStr)
          .order('tanggal_selesai', { ascending: true })
          .limit(10),
        supabase
          .from('employee_documents')
          .select('id, jenis_dokumen, tanggal_kadaluarsa, employees!employee_id(nama)')
          .not('tanggal_kadaluarsa', 'is', null)
          .lte('tanggal_kadaluarsa', batasAtasStr)
          .order('tanggal_kadaluarsa', { ascending: true })
          .limit(10),
      ])
      setEmployees(emp.data || [])
      setPendingLeave(leave.data || [])
      setTodayAttendance(att.data || [])
      setTrainings(tr.data || [])
      setExpiringContracts(contracts.data || [])
      setExpiringDocs(docs.data || [])
      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    if (!hasFullAccess) { setYayasanLoading(false); return }
    const loadYayasan = async () => {
      setYayasanLoading(true)
      const enamBulanLalu = new Date()
      enamBulanLalu.setMonth(enamBulanLalu.getMonth() - 5)
      enamBulanLalu.setDate(1)
      const enamBulanLaluStr = enamBulanLalu.toISOString().slice(0, 10)

      const [{ data: runs }, { data: att }, { data: emp }, { data: beban }, { data: tugas }, { data: bebanSet }] = await Promise.all([
        supabase.from('payroll_runs').select('id, periode_bulan, periode_tahun, status').order('periode_tahun', { ascending: false }).order('periode_bulan', { ascending: false }),
        supabase.from('attendance').select('tanggal, status').gte('tanggal', enamBulanLaluStr),
        supabase.from('employees').select('id, schools!school_id(jenjang), positions(nama, tunjangan_jenis, jp_ekuivalensi)').eq('status', 'aktif'),
        supabase.from('employee_beban_kerja').select('*'),
        supabase.from('employee_tugas_tambahan').select('employee_id, tugas_tambahan(nama, jp_ekuivalensi)'),
        supabase.from('beban_kerja_settings').select('*').maybeSingle(),
      ])
      setAttendanceTrendRows(att || [])
      setBebanEmployees(emp || [])
      setBebanRows(beban || [])
      setTugasRows(tugas || [])
      setBebanSettings(bebanSet || DEFAULT_BEBAN_KERJA_SETTINGS)
      setPayrollRuns(runs || [])
      setSelectedRunId((runs && runs.length > 0) ? runs[0].id : '')
      setYayasanLoading(false)
    }
    loadYayasan()
  }, [hasFullAccess])

  // Ambil rincian slip untuk periode yang DIPILIH (bukan hanya terbaru),
  // supaya biaya gaji per unit bisa ditinjau lintas periode.
  useEffect(() => {
    if (!hasFullAccess || !selectedRunId) { setPayrollDetails([]); return }
    let batal = false
    const loadDetails = async () => {
      setPayrollDetailsLoading(true)
      const { data } = await supabase
        .from('payroll_details')
        .select('gaji_pokok, total_tunjangan, total_potongan, gaji_bersih, employees(schools!school_id(nama, jenjang))')
        .eq('payroll_run_id', selectedRunId)
      if (batal) return
      setPayrollDetails(data || [])
      setPayrollDetailsLoading(false)
    }
    loadDetails()
    return () => { batal = true }
  }, [hasFullAccess, selectedRunId])

  const JENJANG_ORDER = { SD: 0, SMP: 1, SMA: 2, Pesantren: 3 }

  // Biaya gaji per UNIT untuk periode terpilih — rincian penuh (Bruto =
  // Gaji Pokok + Tunjangan, Potongan, Bersih). Dikelompokkan per satuan
  // pendidikan (bukan hanya jenjang) sehingga semua unit — termasuk
  // Pesantren & Kantor Yayasan — ikut tampil.
  const biayaPerUnit = useMemo(() => {
    const map = {}
    for (const d of payrollDetails) {
      const sch = d.employees?.schools
      const key = sch ? `${sch.jenjang} — ${sch.nama}` : 'Kantor Yayasan'
      if (!map[key]) map[key] = { unit: key, jenjang: sch?.jenjang || 'zzz', jumlah: 0, bruto: 0, potongan: 0, bersih: 0 }
      const m = map[key]
      m.jumlah += 1
      m.bruto += Number(d.gaji_pokok || 0) + Number(d.total_tunjangan || 0)
      m.potongan += Number(d.total_potongan || 0)
      m.bersih += Number(d.gaji_bersih || 0)
    }
    return Object.values(map).sort((a, b) => (JENJANG_ORDER[a.jenjang] ?? 9) - (JENJANG_ORDER[b.jenjang] ?? 9) || a.unit.localeCompare(b.unit))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payrollDetails])

  const totalBiaya = useMemo(() => biayaPerUnit.reduce(
    (acc, u) => ({ jumlah: acc.jumlah + u.jumlah, bruto: acc.bruto + u.bruto, potongan: acc.potongan + u.potongan, bersih: acc.bersih + u.bersih }),
    { jumlah: 0, bruto: 0, potongan: 0, bersih: 0 },
  ), [biayaPerUnit])

  // Tren kehadiran 6 bulan terakhir (persentase hadir dari seluruh baris
  // presensi tercatat bulan itu, seluruh yayasan).
  const trenKehadiran = useMemo(() => {
    const map = {}
    for (const a of attendanceTrendRows) {
      const key = a.tanggal.slice(0, 7)
      if (!map[key]) map[key] = { total: 0, hadir: 0 }
      map[key].total += 1
      if (a.status === 'hadir') map[key].hadir += 1
    }
    const out = []
    const cursor = new Date()
    cursor.setDate(1)
    for (let i = 5; i >= 0; i--) {
      const d = new Date(cursor.getFullYear(), cursor.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const m = map[key]
      out.push({
        bulan: `${BULAN_SINGKAT[d.getMonth()]} ${d.getFullYear()}`,
        persen: m && m.total > 0 ? Math.round((m.hadir / m.total) * 1000) / 10 : 0,
      })
    }
    return out
  }, [attendanceTrendRows])

  // Rata-rata utilisasi Beban Kerja per unit sekolah — logika sama persis
  // dengan rekapUnit di WorkloadList.jsx (ManagerWorkload), dipakai lagi di
  // sini untuk ringkasan lintas unit.
  const utilisasiPerUnit = useMemo(() => {
    const bebanByEmployee = Object.fromEntries(bebanRows.map((b) => [b.employee_id, b]))
    const tugasByEmployee = {}
    for (const t of tugasRows) {
      if (!t.tugas_tambahan) continue
      ;(tugasByEmployee[t.employee_id] ||= []).push(t.tugas_tambahan)
    }
    const map = {}
    for (const e of bebanEmployees) {
      const b = bebanByEmployee[e.id]
      const hasil = hitungBebanKerja({
        position: e.positions,
        jenjang: e.schools?.jenjang,
        tugasTambahanList: tugasByEmployee[e.id] || [],
        jpMengajar: b?.jp_mengajar || 0,
        jamKetatausahaan: b?.jam_ketatausahaan || 0,
        settings: bebanSettings,
      })
      const jenjang = e.schools?.jenjang || 'Kantor Yayasan'
      if (!map[jenjang]) map[jenjang] = { jenjang, jumlah: 0, totalTerpakai: 0, kapasitas: 0 }
      map[jenjang].jumlah += 1
      map[jenjang].totalTerpakai += hasil.totalJamTerpakai
      map[jenjang].kapasitas += hasil.kapasitas
    }
    return Object.values(map).map((u) => ({ ...u, utilisasi: u.kapasitas > 0 ? Math.round((u.totalTerpakai / u.kapasitas) * 100) : 0 }))
  }, [bebanEmployees, bebanRows, tugasRows, bebanSettings])

  if (loading) return <FullPageSpinner />

  const totalAktif = employees.filter((e) => e.status === 'aktif').length
  // Dinamis dari data — mencakup SEMUA jenjang yang ada (termasuk Pesantren)
  // dan pegawai tanpa unit (Kantor Yayasan), bukan hanya SD/SMP/SMA.
  const byJenjang = (() => {
    const map = {}
    for (const e of employees) {
      const j = e.schools?.jenjang || 'Kantor Yayasan'
      map[j] = (map[j] || 0) + 1
    }
    return Object.entries(map)
      .map(([jenjang, jumlah]) => ({ jenjang, jumlah }))
      .sort((a, b) => (JENJANG_ORDER[a.jenjang] ?? 9) - (JENJANG_ORDER[b.jenjang] ?? 9))
  })()
  const hadirHariIni = todayAttendance.filter((a) => a.status === 'hadir').length

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Pegawai Aktif" value={totalAktif} sub={`${employees.length} total tercatat`} />
        <StatCard label="Hadir Hari Ini" value={hadirHariIni} sub={`dari ${todayAttendance.length} presensi tercatat`} accent="gold" />
        <StatCard label="Pengajuan Cuti Menunggu" value={pendingLeave.length} sub="perlu persetujuan" />
        <StatCard label="Pelatihan Mendatang" value={trainings.length} sub="terjadwal" accent="gold" />
        <StatCard
          label="Kontrak/Dokumen Akan Berakhir"
          value={expiringContracts.length + expiringDocs.length}
          sub={`dalam ${H_PERINGATAN_KADALUARSA} hari`}
          accent={expiringContracts.length + expiringDocs.length > 0 ? 'gold' : undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <SectionCard title="Sebaran Pegawai per Jenjang" className="lg:col-span-3">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={byJenjang}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="jenjang" tick={{ fontSize: 13, fill: 'var(--color-ink-soft)' }} axisLine={{ stroke: 'var(--color-border)' }} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: 'var(--color-ink-soft)' }} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: 'var(--color-navy-50)' }} contentStyle={{ borderRadius: 8, borderColor: 'var(--color-border)', fontSize: 13 }} />
              <Bar dataKey="jumlah" fill="var(--color-navy)" radius={[4, 4, 0, 0]} maxBarSize={64} />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>

        <SectionCard title="Pelatihan Mendatang" className="lg:col-span-2">
          {trainings.length === 0 ? (
            <p className="text-sm text-[var(--color-ink-soft)]">Belum ada pelatihan terjadwal.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--color-border)]">
              {trainings.map((t) => (
                <li key={t.id} className="py-2.5 first:pt-0 last:pb-0">
                  <p className="text-sm font-medium text-[var(--color-ink)]">{t.nama_pelatihan}</p>
                  <p className="text-xs text-[var(--color-ink-soft)]">{formatDate(t.tanggal_mulai)} · {t.lokasi || 'Lokasi belum diisi'}</p>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      {hasFullAccess && !yayasanLoading && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SectionCard
            title="Total Biaya Gaji per Unit"
            description="Bruto = Gaji Pokok + Tunjangan · Bersih = setelah potongan"
            actions={payrollRuns.length > 0 && (
              <Select containerClassName="w-44" value={selectedRunId} onChange={(e) => setSelectedRunId(e.target.value)}>
                {payrollRuns.map((r) => (
                  <option key={r.id} value={r.id}>{BULAN[r.periode_bulan - 1]} {r.periode_tahun}{r.status === 'final' ? '' : ' (draft)'}</option>
                ))}
              </Select>
            )}
          >
            {payrollRuns.length === 0 ? (
              <p className="text-sm text-[var(--color-ink-soft)]">Belum ada periode penggajian yang diproses.</p>
            ) : payrollDetailsLoading ? (
              <p className="text-sm text-[var(--color-ink-soft)]">Memuat…</p>
            ) : biayaPerUnit.length === 0 ? (
              <p className="text-sm text-[var(--color-ink-soft)]">Belum ada slip diproses pada periode ini.</p>
            ) : (
              <Table columns={['Unit', 'Pegawai', 'Bruto', 'Potongan', 'Bersih']}>
                {biayaPerUnit.map((u) => (
                  <Tr key={u.unit}>
                    <Td>{u.unit}</Td>
                    <Td>{u.jumlah}</Td>
                    <Td>{formatRupiah(u.bruto)}</Td>
                    <Td className="text-[var(--color-danger)]">-{formatRupiah(u.potongan)}</Td>
                    <Td className="font-medium">{formatRupiah(u.bersih)}</Td>
                  </Tr>
                ))}
                <Tr>
                  <Td className="font-semibold">Total</Td>
                  <Td className="font-semibold">{totalBiaya.jumlah}</Td>
                  <Td className="font-semibold">{formatRupiah(totalBiaya.bruto)}</Td>
                  <Td className="font-semibold text-[var(--color-danger)]">-{formatRupiah(totalBiaya.potongan)}</Td>
                  <Td className="font-semibold">{formatRupiah(totalBiaya.bersih)}</Td>
                </Tr>
              </Table>
            )}
          </SectionCard>

          <SectionCard title="Tren Kehadiran (6 Bulan Terakhir)" description="Persentase presensi berstatus Hadir dari seluruh baris presensi tercatat, seluruh yayasan">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trenKehadiran}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="bulan" tick={{ fontSize: 12, fill: 'var(--color-ink-soft)' }} axisLine={{ stroke: 'var(--color-border)' }} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: 'var(--color-ink-soft)' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                <Tooltip cursor={{ stroke: 'var(--color-border)' }} contentStyle={{ borderRadius: 8, borderColor: 'var(--color-border)', fontSize: 13 }} formatter={(v) => `${v}%`} />
                <Line type="monotone" dataKey="persen" stroke="var(--color-navy)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </SectionCard>
        </div>
      )}

      {hasFullAccess && !yayasanLoading && utilisasiPerUnit.length > 0 && (
        <SectionCard title="Rata-rata Utilisasi Beban Kerja per Unit" description="Total Jam Terpakai vs Kapasitas Jam Kerja seluruh pegawai aktif per unit, bulan berjalan">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {utilisasiPerUnit.map((u) => (
              <Card key={u.jenjang} className="bg-[var(--color-navy-50)]">
                <p className="text-[13px] font-medium text-[var(--color-ink-soft)]">{u.jenjang}</p>
                <p className="mt-1 font-[family-name:var(--font-display)] text-[22px] font-semibold text-[var(--color-navy)]">{u.utilisasi}%</p>
                <p className="text-xs text-[var(--color-ink-soft)]">{u.jumlah} pegawai</p>
              </Card>
            ))}
          </div>
          <Link to="/beban-kerja" className="mt-3 inline-block text-sm font-medium text-[var(--color-navy)] hover:underline">Lihat rincian per pegawai →</Link>
        </SectionCard>
      )}

      <SectionCard
        title="Pengajuan Cuti Menunggu Persetujuan"
        actions={<Link to="/cuti" className="text-sm font-medium text-[var(--color-navy)] hover:underline">Lihat semua</Link>}
      >
        {pendingLeave.length === 0 ? (
          <EmptyState icon={CalendarClock} title="Tidak ada pengajuan menunggu" description="Semua pengajuan cuti sudah diproses." />
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--color-border)]">
            {pendingLeave.map((l) => (
              <li key={l.id} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                <div>
                  <p className="text-sm font-medium text-[var(--color-ink)]">{l.employees?.nama}</p>
                  <p className="text-xs text-[var(--color-ink-soft)]">
                    {l.leave_types?.nama} · {formatDate(l.tanggal_mulai)} – {formatDate(l.tanggal_selesai)}
                  </p>
                </div>
                <Badge color="gold">Menunggu</Badge>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {(expiringContracts.length > 0 || expiringDocs.length > 0) && (
        <SectionCard title={`Kontrak & Dokumen Akan Berakhir (H-${H_PERINGATAN_KADALUARSA})`}>
          <ul className="flex flex-col divide-y divide-[var(--color-border)]">
            {expiringContracts.map((c) => {
              const terlambat = new Date(c.tanggal_selesai) < new Date(new Date().toDateString())
              return (
                <li key={`kontrak-${c.id}`} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                  <div>
                    <p className="text-sm font-medium text-[var(--color-ink)]">{c.employees?.nama}</p>
                    <p className="text-xs text-[var(--color-ink-soft)]">Kontrak {c.jenis_kontrak} · berakhir {formatDate(c.tanggal_selesai)}</p>
                  </div>
                  <Badge color={terlambat ? 'danger' : 'gold'}>
                    <FileWarning className="mr-1 inline h-3 w-3" />{terlambat ? 'Sudah berakhir' : 'Kontrak'}
                  </Badge>
                </li>
              )
            })}
            {expiringDocs.map((d) => {
              const terlambat = new Date(d.tanggal_kadaluarsa) < new Date(new Date().toDateString())
              return (
                <li key={`dok-${d.id}`} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                  <div>
                    <p className="text-sm font-medium text-[var(--color-ink)]">{d.employees?.nama}</p>
                    <p className="text-xs text-[var(--color-ink-soft)]">Dokumen {d.jenis_dokumen} · kadaluarsa {formatDate(d.tanggal_kadaluarsa)}</p>
                  </div>
                  <Badge color={terlambat ? 'danger' : 'gold'}>
                    <FileWarning className="mr-1 inline h-3 w-3" />{terlambat ? 'Sudah kadaluarsa' : 'Dokumen'}
                  </Badge>
                </li>
              )
            })}
          </ul>
        </SectionCard>
      )}
    </div>
  )
}

function SelfDashboard({ employeeId }) {
  const [loading, setLoading] = useState(true)
  const [attendanceCount, setAttendanceCount] = useState(0)
  const [leaveRequests, setLeaveRequests] = useState([])
  const [lastPayslip, setLastPayslip] = useState(null)
  const [trainings, setTrainings] = useState([])

  useEffect(() => {
    if (!employeeId) {
      setLoading(false)
      return
    }
    const load = async () => {
      setLoading(true)
      const monthStart = new Date()
      monthStart.setDate(1)
      const monthStartStr = monthStart.toISOString().slice(0, 10)
      const [att, leave, payslip, tr] = await Promise.all([
        supabase.from('attendance').select('id', { count: 'exact', head: true }).eq('employee_id', employeeId).eq('status', 'hadir').gte('tanggal', monthStartStr),
        supabase.from('leave_requests').select('id, status, tanggal_mulai, tanggal_selesai, leave_types(nama)').eq('employee_id', employeeId).order('created_at', { ascending: false }).limit(5),
        supabase.from('payroll_details').select('gaji_bersih, payroll_runs(periode_bulan, periode_tahun)').eq('employee_id', employeeId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('training_participants').select('status, trainings(nama_pelatihan, tanggal_mulai)').eq('employee_id', employeeId).order('id', { ascending: false }).limit(4),
      ])
      setAttendanceCount(att.count || 0)
      setLeaveRequests(leave.data || [])
      setLastPayslip(payslip.data)
      setTrainings(tr.data || [])
      setLoading(false)
    }
    load()
  }, [employeeId])

  if (loading) return <FullPageSpinner />

  if (!employeeId) {
    return (
      <EmptyState
        icon={Users}
        title="Akun Anda belum ditautkan ke data pegawai"
        description="Hubungi Admin Yayasan / HR agar akun login Anda ditautkan ke data kepegawaian, sehingga Anda bisa melihat presensi, cuti, dan slip gaji Anda."
      />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Hadir Bulan Ini" value={attendanceCount} icon={CalendarCheck} />
        <StatCard label="Pengajuan Cuti" value={leaveRequests.length} sub="riwayat terbaru" accent="gold" />
        <StatCard
          label="Gaji Bersih Terakhir"
          value={lastPayslip ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(lastPayslip.gaji_bersih) : '—'}
        />
      </div>

      <SectionCard title="Riwayat Cuti Saya" actions={<Link to="/cuti" className="text-sm font-medium text-[var(--color-navy)] hover:underline">Ajukan / lihat semua</Link>}>
        {leaveRequests.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-soft)]">Belum ada pengajuan cuti.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--color-border)]">
            {leaveRequests.map((l, i) => (
              <li key={i} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                <div>
                  <p className="text-sm font-medium text-[var(--color-ink)]">{l.leave_types?.nama}</p>
                  <p className="text-xs text-[var(--color-ink-soft)]">{formatDate(l.tanggal_mulai)} – {formatDate(l.tanggal_selesai)}</p>
                </div>
                <Badge color={STATUS_BADGE_COLOR[l.status]}>{l.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Pelatihan Saya" actions={<Link to="/pelatihan" className="text-sm font-medium text-[var(--color-navy)] hover:underline">Lihat semua</Link>}>
        {trainings.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-soft)]">Belum terdaftar pelatihan apa pun.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--color-border)]">
            {trainings.map((t, i) => (
              <li key={i} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                <div>
                  <p className="text-sm font-medium text-[var(--color-ink)]">{t.trainings?.nama_pelatihan}</p>
                  <p className="text-xs text-[var(--color-ink-soft)]">{formatDate(t.trainings?.tanggal_mulai)}</p>
                </div>
                <Badge color={STATUS_BADGE_COLOR[t.status]}>{t.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  )
}
