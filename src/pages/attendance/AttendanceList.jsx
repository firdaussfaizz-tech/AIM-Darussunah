import { useEffect, useState, useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CalendarCheck, UploadCloud } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, Card, Select, Input, Button, Table, Tr, Td, Badge, EmptyState, FullPageSpinner } from '../../components/ui'
import { STATUS_BADGE_COLOR, formatDate } from '../../lib/format'
import FingerprintImportModal from './FingerprintImportModal'
import { useAutoRefresh } from '../../lib/useAutoRefresh'

const LATE_THRESHOLD = '06:55:00' // Pasal 8 ayat (1) SK 01.014/SK-YDC/IX/26

const STATUS_OPTIONS = ['hadir', 'izin', 'sakit', 'alpa', 'dinas_luar', 'cuti']
const STATUS_LABELS = { hadir: 'Hadir', izin: 'Izin', sakit: 'Sakit', alpa: 'Alpa', dinas_luar: 'Dinas Luar', cuti: 'Cuti' }

export default function AttendanceList() {
  const { isManager, employee, loading: authLoading } = useAuth()
  const [sp] = useSearchParams()
  const asManager = isManager && sp.get('me') !== '1'
  if (authLoading) return <FullPageSpinner />
  return (
    <div>
      <PageHeader title={asManager ? 'Presensi Pegawai' : 'Presensi Saya'} description={asManager ? 'Catat dan pantau kehadiran pegawai harian.' : 'Riwayat kehadiran Anda.'} />
      {asManager ? <ManagerAttendance /> : <SelfAttendance employeeId={employee?.id} />}
    </div>
  )
}

function ManagerAttendance() {
  const { hasFullAccess, roles } = useAuth()
  // Unit yang benar-benar dikelola pengguna tingkat sekolah (Admin/Kepala
  // Sekolah). Admin Yayasan/HR (hasFullAccess) melihat semua unit; manajer
  // sekolah HANYA boleh mengatur presensi unitnya sendiri (#6). RLS sudah
  // menegakkan ini di server; pembatasan dropdown ini mencegah kebingungan
  // (memilih unit lain lalu kosong) & menegaskan cakupan wewenang.
  const mySchools = useMemo(() => {
    const seen = new Map()
    for (const r of roles || []) {
      if (['admin_sekolah', 'kepala_sekolah'].includes(r.role) && r.school_id && !seen.has(r.school_id)) {
        seen.set(r.school_id, { id: r.school_id, nama: r.schools?.nama, jenjang: r.schools?.jenjang })
      }
    }
    return Array.from(seen.values())
  }, [roles])

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [schools, setSchools] = useState([])
  const [schoolFilter, setSchoolFilter] = useState(!hasFullAccess && mySchools.length === 1 ? mySchools[0].id : '')
  const [employees, setEmployees] = useState([])
  const [attendanceMap, setAttendanceMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState({})
  const [importOpen, setImportOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: sch }, empQuery] = await Promise.all([
      hasFullAccess
        ? supabase.from('schools').select('id, nama, jenjang').order('jenjang')
        : Promise.resolve({ data: mySchools }),
      (() => {
        let q = supabase.from('employees').select('id, nama, schools!school_id(nama, jenjang)').eq('status', 'aktif').order('nama')
        if (schoolFilter) q = q.eq('school_id', schoolFilter)
        return q
      })(),
    ])
    setSchools(sch || [])
    const emps = empQuery.data || []
    setEmployees(emps)
    if (emps.length > 0) {
      const { data: att } = await supabase.from('attendance').select('*').eq('tanggal', date).in('employee_id', emps.map((e) => e.id))
      const map = {}
      ;(att || []).forEach((a) => { map[a.employee_id] = a })
      setAttendanceMap(map)
    } else {
      setAttendanceMap({})
    }
    setLoading(false)
  }, [date, schoolFilter, hasFullAccess, mySchools])

  useEffect(() => { load() }, [load])
  useAutoRefresh('attendance', load)

  const setStatus = async (employeeId, status) => {
    setSaving((s) => ({ ...s, [employeeId]: true }))
    const existing = attendanceMap[employeeId]
    const { data, error } = existing
      ? await supabase.from('attendance').update({ status }).eq('id', existing.id).select().single()
      : await supabase.from('attendance').insert({ employee_id: employeeId, tanggal: date, status }).select().single()
    if (error) {
      alert('Gagal menyimpan status presensi: ' + error.message)
    } else {
      setAttendanceMap((m) => ({ ...m, [employeeId]: data }))
    }
    setSaving((s) => ({ ...s, [employeeId]: false }))
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button variant="outline" onClick={() => setImportOpen(true)}>
          <UploadCloud className="h-4 w-4" /> Impor dari Fingerprint
        </Button>
      </div>

      <Card className="mb-4" padded={false}>
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <Input type="date" containerClassName="sm:w-48" value={date} onChange={(e) => setDate(e.target.value)} />
          <Select containerClassName="sm:w-56" value={schoolFilter} onChange={(e) => setSchoolFilter(e.target.value)} disabled={!hasFullAccess && schools.length <= 1}>
            {/* Admin Yayasan/HR boleh 'Semua Unit'; manajer sekolah dikunci ke unitnya. */}
            {hasFullAccess && <option value="">Semua Unit</option>}
            {!hasFullAccess && schools.length !== 1 && <option value="">— Pilih Unit —</option>}
            {schools.map((s) => <option key={s.id} value={s.id}>{s.jenjang} — {s.nama}</option>)}
          </Select>
        </div>
      </Card>

      <Card padded={false}>
        <div className="p-5">
          {loading ? (
            <FullPageSpinner />
          ) : employees.length === 0 ? (
            <EmptyState icon={CalendarCheck} title="Tidak ada pegawai" description="Tidak ada pegawai aktif pada unit yang dipilih." />
          ) : (
            <Table columns={['Nama', 'Unit', 'Jam Masuk', 'Jam Pulang', 'Status Presensi']}>
              {employees.map((e) => {
                const att = attendanceMap[e.id]
                const current = att?.status
                const isLate = att?.jam_masuk && att.jam_masuk > LATE_THRESHOLD
                return (
                  <Tr key={e.id}>
                    <Td className="font-medium text-[var(--color-ink)]">{e.nama}</Td>
                    <Td className="text-[var(--color-ink-soft)]">{e.schools ? `${e.schools.jenjang} — ${e.schools.nama}` : '—'}</Td>
                    <Td>
                      {att?.jam_masuk ? (
                        <span className="flex items-center gap-1.5">
                          {att.jam_masuk.slice(0, 5)}
                          {isLate && <Badge color="danger">Terlambat</Badge>}
                        </span>
                      ) : '—'}
                    </Td>
                    <Td>{att?.jam_pulang ? att.jam_pulang.slice(0, 5) : '—'}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-1.5">
                        {STATUS_OPTIONS.map((s) => (
                          <button
                            key={s}
                            disabled={saving[e.id]}
                            onClick={() => setStatus(e.id, s)}
                            className={`rounded px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                              current === s
                                ? badgeActiveClass(s)
                                : 'bg-gray-50 text-[var(--color-ink-soft)] hover:bg-gray-100'
                            }`}
                          >
                            {STATUS_LABELS[s]}
                          </button>
                        ))}
                      </div>
                    </Td>
                  </Tr>
                )
              })}
            </Table>
          )}
        </div>
      </Card>

      <FingerprintImportModal open={importOpen} onClose={() => setImportOpen(false)} onImported={load} />
    </div>
  )
}

function badgeActiveClass(status) {
  const color = STATUS_BADGE_COLOR[status]
  const map = {
    success: 'bg-[var(--color-success)] text-white',
    gold: 'bg-[var(--color-gold)] text-white',
    danger: 'bg-[var(--color-danger)] text-white',
    navy: 'bg-[var(--color-navy)] text-white',
  }
  return map[color] || 'bg-gray-400 text-white'
}

function SelfAttendance({ employeeId }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))

  useEffect(() => {
    if (!employeeId) { setLoading(false); return }
    const load = async () => {
      setLoading(true)
      const start = `${month}-01`
      const endDate = new Date(month + '-01')
      endDate.setMonth(endDate.getMonth() + 1)
      const { data } = await supabase
        .from('attendance').select('*').eq('employee_id', employeeId)
        .gte('tanggal', start).lt('tanggal', endDate.toISOString().slice(0, 10))
        .order('tanggal', { ascending: false })
      setRows(data || [])
      setLoading(false)
    }
    load()
  }, [employeeId, month])

  if (!employeeId) return <EmptyState icon={CalendarCheck} title="Data presensi tidak tersedia" description="Akun Anda belum ditautkan ke data kepegawaian." />

  return (
    <div>
      <Card className="mb-4" padded={false}>
        <div className="p-4">
          <Input type="month" containerClassName="sm:w-48" value={month} onChange={(e) => setMonth(e.target.value)} label="Bulan" />
        </div>
      </Card>
      <Card padded={false}>
        <div className="p-5">
          {loading ? (
            <FullPageSpinner />
          ) : rows.length === 0 ? (
            <EmptyState icon={CalendarCheck} title="Belum ada catatan presensi" description="Belum ada data presensi untuk bulan ini." />
          ) : (
            <Table columns={['Tanggal', 'Status', 'Keterangan']}>
              {rows.map((r) => (
                <Tr key={r.id}>
                  <Td>{formatDate(r.tanggal)}</Td>
                  <Td><Badge color={STATUS_BADGE_COLOR[r.status]}>{STATUS_LABELS[r.status]}</Badge></Td>
                  <Td className="text-[var(--color-ink-soft)]">{r.keterangan || '—'}</Td>
                </Tr>
              ))}
            </Table>
          )}
        </div>
      </Card>
    </div>
  )
}
