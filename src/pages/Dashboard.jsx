import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { Users, CalendarCheck, CalendarClock, GraduationCap } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { PageHeader, Card, SectionCard, StatCard, FullPageSpinner, Badge, EmptyState } from '../components/ui'
import { formatDate, STATUS_BADGE_COLOR } from '../lib/format'

export default function Dashboard() {
  const { isManager, employee, profile } = useAuth()
  return (
    <div>
      <PageHeader
        title={`Selamat datang, ${(profile?.full_name || '').split(' ')[0] || ''}`}
        description={isManager ? 'Ringkasan kepegawaian yayasan hari ini.' : 'Ringkasan data kepegawaian Anda.'}
      />
      {isManager ? <ManagerDashboard /> : <SelfDashboard employeeId={employee?.id} />}
    </div>
  )
}

function ManagerDashboard() {
  const [loading, setLoading] = useState(true)
  const [employees, setEmployees] = useState([])
  const [pendingLeave, setPendingLeave] = useState([])
  const [todayAttendance, setTodayAttendance] = useState([])
  const [trainings, setTrainings] = useState([])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const today = new Date().toISOString().slice(0, 10)
      const [emp, leave, att, tr] = await Promise.all([
        supabase.from('employees').select('id, status, status_kepegawaian, schools(nama, jenjang)'),
        supabase
          .from('leave_requests')
          .select('id, tanggal_mulai, tanggal_selesai, employees(nama), leave_types(nama)')
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(5),
        supabase.from('attendance').select('status').eq('tanggal', today),
        supabase
          .from('trainings')
          .select('id, nama_pelatihan, tanggal_mulai, lokasi')
          .gte('tanggal_mulai', today)
          .order('tanggal_mulai', { ascending: true })
          .limit(4),
      ])
      setEmployees(emp.data || [])
      setPendingLeave(leave.data || [])
      setTodayAttendance(att.data || [])
      setTrainings(tr.data || [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <FullPageSpinner />

  const totalAktif = employees.filter((e) => e.status === 'aktif').length
  const byJenjang = ['SD', 'SMP', 'SMA'].map((j) => ({
    jenjang: j,
    jumlah: employees.filter((e) => e.schools?.jenjang === j).length,
  }))
  const hadirHariIni = todayAttendance.filter((a) => a.status === 'hadir').length

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Pegawai Aktif" value={totalAktif} sub={`${employees.length} total tercatat`} />
        <StatCard label="Hadir Hari Ini" value={hadirHariIni} sub={`dari ${todayAttendance.length} presensi tercatat`} accent="gold" />
        <StatCard label="Pengajuan Cuti Menunggu" value={pendingLeave.length} sub="perlu persetujuan" />
        <StatCard label="Pelatihan Mendatang" value={trainings.length} sub="terjadwal" accent="gold" />
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
