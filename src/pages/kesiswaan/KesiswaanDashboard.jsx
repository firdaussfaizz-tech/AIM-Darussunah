import { useEffect, useState, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { LayoutDashboard, GraduationCap, ClipboardCheck, Wallet, NotebookText } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, Card, SectionCard, StatCard, Badge, EmptyState, FullPageSpinner } from '../../components/ui'
import { formatRupiah, SISWA_STATUS_LABELS, STATUS_BADGE_COLOR, BULAN, SEMESTER_OPTIONS } from '../../lib/format'

// Semester berjalan ditebak dari bulan saat ini — sama persis dengan logika
// di NilaiRapor.jsx (Juli–Desember = ganjil, Januari–Juni = genap).
function tebakSemester() {
  const bulan = new Date().getMonth() + 1
  return bulan >= 7 ? 'ganjil' : 'genap'
}

export default function KesiswaanDashboard() {
  const { isManager, hasFullAccess, managedSchoolIds, loading: authLoading } = useAuth()

  if (authLoading) return <FullPageSpinner />
  if (!isManager) {
    return (
      <EmptyState
        icon={LayoutDashboard}
        title="Halaman ini belum tersedia"
        description="Dashboard Kesiswaan hanya dapat diakses oleh Admin Yayasan, HR, Admin Sekolah, atau Kepala Sekolah."
      />
    )
  }

  // Semua query di bawah sudah otomatis dibatasi lewat RLS (has_school_access)
  // untuk Admin Sekolah/Kepala Sekolah — tidak perlu filter tambahan di sisi
  // klien. lockedSchoolId di sini hanya dipakai untuk menyesuaikan teks &
  // menyembunyikan rincian "per unit" yang tidak relevan kalau cuma satu unit.
  const lockedSchoolId = !hasFullAccess && managedSchoolIds.length > 0 ? managedSchoolIds[0] : null

  return (
    <div>
      <PageHeader
        title="Dashboard Kesiswaan"
        description={lockedSchoolId ? 'Ringkasan data siswa di unit Anda.' : 'Ringkasan data siswa di seluruh unit yayasan.'}
      />
      <DashboardBody lockedSchoolId={lockedSchoolId} />
    </div>
  )
}

function DashboardBody({ lockedSchoolId }) {
  const [loading, setLoading] = useState(true)
  const [siswaRows, setSiswaRows] = useState([])
  const [presensiRows, setPresensiRows] = useState([])
  const [tahunAktif, setTahunAktif] = useState(null)
  const [sppRows, setSppRows] = useState([])
  const [nilaiSiswaIds, setNilaiSiswaIds] = useState([])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const today = new Date().toISOString().slice(0, 10)
      const now = new Date()

      const [{ data: siswa }, { data: presensi }, { data: ta }] = await Promise.all([
        supabase.from('siswa').select('id, status, school_id, schools!school_id(nama, jenjang)'),
        supabase.from('presensi_siswa').select('status').eq('tanggal', today),
        supabase.from('tahun_ajaran').select('id, nama').eq('status', 'aktif').maybeSingle(),
      ])
      setSiswaRows(siswa || [])
      setPresensiRows(presensi || [])
      setTahunAktif(ta || null)

      if (ta) {
        const semester = tebakSemester()
        const [{ data: spp }, { data: nilai }] = await Promise.all([
          supabase.from('spp_tagihan').select('status, nominal_tagihan').eq('tahun_ajaran_id', ta.id).eq('bulan', now.getMonth() + 1).eq('tahun', now.getFullYear()),
          supabase.from('nilai_siswa').select('siswa_id').eq('tahun_ajaran_id', ta.id).eq('semester', semester),
        ])
        setSppRows(spp || [])
        setNilaiSiswaIds([...new Set((nilai || []).map((n) => n.siswa_id))])
      } else {
        setSppRows([])
        setNilaiSiswaIds([])
      }
      setLoading(false)
    }
    load()
  }, [])

  const siswaStats = useMemo(() => {
    const byStatus = {}
    const bySchool = {}
    for (const s of siswaRows) {
      byStatus[s.status] = (byStatus[s.status] || 0) + 1
      if (s.status === 'aktif' && s.schools) {
        const key = s.school_id
        if (!bySchool[key]) bySchool[key] = { nama: s.schools.nama, jenjang: s.schools.jenjang, jumlah: 0 }
        bySchool[key].jumlah += 1
      }
    }
    const totalAktif = byStatus.aktif || 0
    return { totalAktif, byStatus, bySchool: Object.values(bySchool).sort((a, b) => b.jumlah - a.jumlah) }
  }, [siswaRows])

  const presensiStats = useMemo(() => {
    const recap = { hadir: 0, izin: 0, sakit: 0, alpa: 0 }
    for (const p of presensiRows) recap[p.status] = (recap[p.status] || 0) + 1
    return { ...recap, total: presensiRows.length }
  }, [presensiRows])

  const sppStats = useMemo(() => {
    const lunas = sppRows.filter((t) => t.status === 'lunas').length
    const belum = sppRows.length - lunas
    const totalNominal = sppRows.reduce((sum, t) => sum + Number(t.nominal_tagihan || 0), 0)
    return { total: sppRows.length, lunas, belum, totalNominal }
  }, [sppRows])

  const semester = tebakSemester()
  const semesterLabel = SEMESTER_OPTIONS.find((s) => s.value === semester)?.label || semester
  // Dibatasi maksimal 100% — penyebut hanya siswa yang status-nya aktif
  // SEKARANG, sedangkan pembilang bisa mencakup siswa yang saat nilai
  // dicatat masih aktif tapi kemudian berubah status (lulus/pindah/keluar)
  // di tengah semester, jadi rasio mentahnya bisa sedikit di atas 100%.
  const nilaiProgress = siswaStats.totalAktif > 0 ? Math.min(100, Math.round((nilaiSiswaIds.length / siswaStats.totalAktif) * 100)) : 0

  if (loading) return <FullPageSpinner />

  const bulanIni = BULAN[new Date().getMonth()]
  const tahunIni = new Date().getFullYear()

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Siswa Aktif" value={siswaStats.totalAktif} sub={`${siswaRows.length} total tercatat (termasuk lulus/pindah/keluar)`} />
        <StatCard
          label="Presensi Hari Ini"
          value={presensiStats.total > 0 ? `${presensiStats.hadir} Hadir` : '—'}
          sub={presensiStats.total > 0 ? `dari ${presensiStats.total} siswa tercatat · Izin ${presensiStats.izin} · Sakit ${presensiStats.sakit} · Alpa ${presensiStats.alpa}` : 'Belum ada presensi tercatat hari ini'}
        />
        <StatCard
          label={`SPP ${bulanIni} ${tahunIni}`}
          value={sppStats.total > 0 ? `${sppStats.lunas} / ${sppStats.total} Lunas` : '—'}
          sub={sppStats.total > 0 ? `Tunggakan ${sppStats.belum} tagihan · Total tagihan ${formatRupiah(sppStats.totalNominal)}` : tahunAktif ? 'Belum ada tagihan SPP periode ini' : 'Belum ada tahun ajaran aktif'}
        />
        <StatCard
          label={`Progres Nilai — ${semesterLabel}`}
          value={tahunAktif ? `${nilaiProgress}%` : '—'}
          sub={tahunAktif ? `${nilaiSiswaIds.length} dari ${siswaStats.totalAktif} siswa aktif sudah punya nilai tercatat` : 'Belum ada tahun ajaran aktif'}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <SectionCard title="Status Siswa" className="lg:col-span-2">
          <ul className="flex flex-col divide-y divide-[var(--color-border)]">
            {Object.entries(SISWA_STATUS_LABELS).map(([value, label]) => (
              <li key={value} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                <span className="text-sm text-[var(--color-ink)]">{label}</span>
                <Badge color={STATUS_BADGE_COLOR[value]}>{siswaStats.byStatus[value] || 0} siswa</Badge>
              </li>
            ))}
          </ul>
        </SectionCard>

        {!lockedSchoolId && (
          <SectionCard title="Siswa Aktif per Unit Sekolah" className="lg:col-span-3">
            {siswaStats.bySchool.length === 0 ? (
              <EmptyState icon={GraduationCap} title="Belum ada data siswa" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={siswaStats.bySchool.map((s) => ({ ...s, label: `${s.jenjang} — ${s.nama}` }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="jenjang" tick={{ fontSize: 12, fill: 'var(--color-ink-soft)' }} axisLine={{ stroke: 'var(--color-border)' }} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: 'var(--color-ink-soft)' }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: 'var(--color-navy-50)' }} contentStyle={{ borderRadius: 8, borderColor: 'var(--color-border)', fontSize: 13 }} labelFormatter={(_, p) => p?.[0]?.payload?.label} />
                  <Bar dataKey="jumlah" fill="var(--color-navy)" radius={[4, 4, 0, 0]} maxBarSize={64} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </SectionCard>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="flex items-center gap-3">
          <ClipboardCheck className="h-5 w-5 shrink-0 text-[var(--color-navy)]" />
          <p className="text-[13px] text-[var(--color-ink-soft)]">Rekap presensi di atas hanya mencakup rombel yang sudah dicatat hari ini — belum tentu seluruh siswa aktif sudah diabsen.</p>
        </Card>
        <Card className="flex items-center gap-3">
          <Wallet className="h-5 w-5 shrink-0 text-[var(--color-navy)]" />
          <p className="text-[13px] text-[var(--color-ink-soft)]">Tagihan SPP dihitung dari tagihan yang sudah di-generate periode {bulanIni} {tahunIni} — klik "Generate Tagihan Bulanan" di menu SPP kalau belum dibuat.</p>
        </Card>
        <Card className="flex items-center gap-3">
          <NotebookText className="h-5 w-5 shrink-0 text-[var(--color-navy)]" />
          <p className="text-[13px] text-[var(--color-ink-soft)]">Progres nilai dihitung dari siswa yang sudah punya minimal satu nilai mata pelajaran tercatat pada semester berjalan.</p>
        </Card>
      </div>
    </div>
  )
}
