import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Users, GraduationCap, BookOpen, Boxes, Wallet, FileBarChart,
  CalendarClock, ReceiptText, ChevronRight,
} from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { PageHeader, Card, SectionCard, StatCard, EmptyState } from '../components/ui'

// Dasbor utama lintas modul (home aplikasi). Dasbor kepegawaian dipindah ke
// menu Kepegawaian → "Dasbor Kepegawaian" (/kepegawaian). Halaman ini memberi
// ringkasan cepat seluruh modul + pintasan ke tiap modul, sesuai hak akses.
export default function MainDashboard() {
  const { isManager, hasFullAccess, profile, can, permsReady } = useAuth()
  const nama = (profile?.full_name || '').split(' ')[0] || ''
  // Hanya pengelola yang melihat angka ringkasan tingkat yayasan/unit.
  const bolehRingkasan = isManager || hasFullAccess

  return (
    <div>
      <PageHeader
        title={`Selamat datang, ${nama}`}
        description="Ringkasan seluruh modul sistem informasi sekolah."
      />
      {bolehRingkasan && <RingkasanLintasModul />}
      <ModulGrid isManager={isManager} hasFullAccess={hasFullAccess} can={can} permsReady={permsReady} />
    </div>
  )
}

// --- Angka ringkasan (defensif: query gagal tidak merusak halaman) ---
function RingkasanLintasModul() {
  const [stat, setStat] = useState(null)

  useEffect(() => {
    let batal = false
    const n = (res) => (res.status === 'fulfilled' && typeof res.value?.count === 'number' ? res.value.count : null)
    const load = async () => {
      const hasil = await Promise.allSettled([
        supabase.from('employees').select('id', { count: 'exact', head: true }).eq('status', 'aktif'),
        supabase.from('siswa').select('id', { count: 'exact', head: true }).eq('status', 'aktif'),
        supabase.from('leave_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('spp_tagihan').select('id', { count: 'exact', head: true }).eq('status', 'belum_bayar'),
        supabase.from('aset').select('id', { count: 'exact', head: true }),
      ])
      if (batal) return
      setStat({
        pegawai: n(hasil[0]), siswa: n(hasil[1]), cuti: n(hasil[2]), spp: n(hasil[3]), aset: n(hasil[4]),
      })
    }
    load()
    return () => { batal = true }
  }, [])

  const v = (x) => (x == null ? '—' : x.toLocaleString('id-ID'))
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <Link to="/pegawai" className="min-w-0"><StatCard label="Pegawai Aktif" value={v(stat?.pegawai)} icon={Users} /></Link>
      <Link to="/siswa" className="min-w-0"><StatCard label="Siswa Aktif" value={v(stat?.siswa)} icon={GraduationCap} accent="gold" /></Link>
      <Link to="/cuti" className="min-w-0"><StatCard label="Cuti Menunggu" value={v(stat?.cuti)} sub="perlu persetujuan" icon={CalendarClock} /></Link>
      <Link to="/spp" className="min-w-0"><StatCard label="SPP Belum Lunas" value={v(stat?.spp)} sub="tagihan terbuka" icon={ReceiptText} accent="gold" /></Link>
      <Link to="/aset/inventaris" className="min-w-0"><StatCard label="Aset Tercatat" value={v(stat?.aset)} icon={Boxes} /></Link>
    </div>
  )
}

// --- Kartu navigasi tiap modul ---
function ModulGrid({ isManager, hasFullAccess, can, permsReady }) {
  const kelola = isManager || hasFullAccess
  const bisa = (modul) => kelola || (permsReady && can && can(modul, 'lihat'))

  const MODULES = [
    {
      key: 'kepegawaian', title: 'Kepegawaian', icon: Users, show: true,
      desc: 'Data pegawai, presensi, cuti, penggajian, kinerja & beban kerja.',
      to: '/kepegawaian',
      links: [
        { to: '/kepegawaian', label: 'Dasbor Kepegawaian' },
        { to: '/pegawai', label: 'Data Pegawai' },
        { to: '/presensi', label: 'Presensi' },
        { to: '/penggajian', label: 'Penggajian' },
      ],
    },
    {
      key: 'kesiswaan', title: 'Kesiswaan', icon: BookOpen, show: kelola || bisa('siswa'),
      desc: 'Data siswa, kelas, presensi siswa, SPP, uang pangkal & prestasi.',
      to: '/kesiswaan',
      links: [
        { to: '/kesiswaan', label: 'Dashboard Kesiswaan' },
        { to: '/siswa', label: 'Data Siswa' },
        { to: '/spp', label: 'SPP' },
        { to: '/nilai-rapor', label: 'Nilai & Rapor' },
      ],
    },
    {
      key: 'akademik', title: 'Akademik / Pembelajaran', icon: GraduationCap, show: true,
      desc: 'Jadwal, mata pelajaran, penugasan mengajar & kurikulum.',
      to: '/pembelajaran',
      links: [
        { to: '/pembelajaran/jadwal', label: 'Jadwal Pelajaran' },
        { to: '/akademik', label: 'Kelas & Tahun Ajaran' },
      ],
    },
    {
      key: 'sarpras', title: 'Sarana & Prasarana', icon: Boxes, show: kelola || bisa('aset'),
      desc: 'Inventaris aset, ruangan, pengadaan & pemeliharaan.',
      to: '/aset/inventaris',
      links: [{ to: '/aset/inventaris', label: 'Inventaris Aset' }],
    },
    {
      key: 'keuangan', title: 'Manajemen Keuangan', icon: Wallet, show: kelola || bisa('keuangan'),
      desc: 'RKAS, buku kas & laporan keuangan yayasan.',
      to: '/keuangan/dashboard',
      links: [{ to: '/keuangan/dashboard', label: 'Dashboard Keuangan' }],
    },
    {
      key: 'analitik', title: 'Analitik & Laporan', icon: FileBarChart, show: kelola || bisa('analitik'),
      desc: 'Ringkasan dan laporan lintas modul.',
      to: '/analitik',
      links: [{ to: '/analitik', label: 'Buka Analitik' }],
    },
  ].filter((m) => m.show)

  if (!MODULES.length) {
    return <EmptyState icon={Users} title="Belum ada modul" description="Hubungi admin untuk mengatur hak akses Anda." />
  }

  return (
    <SectionCard title="Modul" description="Pilih modul untuk mulai bekerja.">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {MODULES.map((m) => {
          const Icon = m.icon
          return (
            <Card key={m.key} className="flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--color-navy-50)] text-[var(--color-navy)]">
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <Link to={m.to} className="font-[family-name:var(--font-display)] text-[16px] font-semibold text-[var(--color-ink)] hover:text-[var(--color-navy)]">{m.title}</Link>
                  <p className="mt-0.5 text-[13px] leading-snug text-[var(--color-ink-soft)]">{m.desc}</p>
                </div>
              </div>
              <div className="mt-auto flex flex-col gap-1 border-t border-[var(--color-border)] pt-2">
                {m.links.map((l) => (
                  <Link key={l.to} to={l.to} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-[13px] text-[var(--color-ink)] hover:bg-[var(--color-navy-50)]">
                    <span>{l.label}</span>
                    <ChevronRight className="h-3.5 w-3.5 text-[var(--color-ink-soft)]" />
                  </Link>
                ))}
              </div>
            </Card>
          )
        })}
      </div>
    </SectionCard>
  )
}
