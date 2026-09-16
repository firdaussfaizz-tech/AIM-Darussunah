import { useEffect, useState, useCallback } from 'react'
import { CalendarCheck } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, Card, Select, Input, Table, Tr, Td, Badge, EmptyState, FullPageSpinner } from '../../components/ui'
import { STATUS_BADGE_COLOR, formatDate } from '../../lib/format'

const STATUS_OPTIONS = ['hadir', 'izin', 'sakit', 'alpa', 'dinas_luar', 'cuti']
const STATUS_LABELS = { hadir: 'Hadir', izin: 'Izin', sakit: 'Sakit', alpa: 'Alpa', dinas_luar: 'Dinas Luar', cuti: 'Cuti' }

export default function AttendanceList() {
  const { isManager, employee, loading: authLoading } = useAuth()
  if (authLoading) return <FullPageSpinner />
  return (
    <div>
      <PageHeader title={isManager ? 'Presensi Pegawai' : 'Presensi Saya'} description={isManager ? 'Catat dan pantau kehadiran pegawai harian.' : 'Riwayat kehadiran Anda.'} />
      {isManager ? <ManagerAttendance /> : <SelfAttendance employeeId={employee?.id} />}
    </div>
  )
}

function ManagerAttendance() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [schools, setSchools] = useState([])
  const [schoolFilter, setSchoolFilter] = useState('')
  const [employees, setEmployees] = useState([])
  const [attendanceMap, setAttendanceMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState({})

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: sch }, empQuery] = await Promise.all([
      supabase.from('schools').select('id, nama, jenjang').order('jenjang'),
      (() => {
        let q = supabase.from('employees').select('id, nama, schools(nama, jenjang)').eq('status', 'aktif').order('nama')
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
  }, [date, schoolFilter])

  useEffect(() => { load() }, [load])

  const setStatus = async (employeeId, status) => {
    setSaving((s) => ({ ...s, [employeeId]: true }))
    const existing = attendanceMap[employeeId]
    if (existing) {
      const { data } = await supabase.from('attendance').update({ status }).eq('id', existing.id).select().single()
      setAttendanceMap((m) => ({ ...m, [employeeId]: data }))
    } else {
      const { data } = await supabase.from('attendance').insert({ employee_id: employeeId, tanggal: date, status }).select().single()
      setAttendanceMap((m) => ({ ...m, [employeeId]: data }))
    }
    setSaving((s) => ({ ...s, [employeeId]: false }))
  }

  return (
    <div>
      <Card className="mb-4" padded={false}>
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <Input type="date" containerClassName="sm:w-48" value={date} onChange={(e) => setDate(e.target.value)} />
          <Select containerClassName="sm:w-56" value={schoolFilter} onChange={(e) => setSchoolFilter(e.target.value)}>
            <option value="">Semua Unit</option>
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
            <Table columns={['Nama', 'Unit', 'Status Presensi']}>
              {employees.map((e) => {
                const current = attendanceMap[e.id]?.status
                return (
                  <Tr key={e.id}>
                    <Td className="font-medium text-[var(--color-ink)]">{e.nama}</Td>
                    <Td className="text-[var(--color-ink-soft)]">{e.schools ? `${e.schools.jenjang} — ${e.schools.nama}` : '—'}</Td>
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
