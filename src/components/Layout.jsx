import { useState, useEffect, useRef } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Users, CalendarCheck, CalendarClock, Wallet, Star,
  GraduationCap, Building2, UserCog, LogOut, Menu, X, Activity, CalendarOff,
  History, Mail, ChevronRight, BookOpen, Contact, CalendarRange, ClipboardCheck,
  ReceiptText, NotebookText, Target, Boxes,
  ClipboardList, ShoppingCart, Truck, UserCheck, DoorOpen, Wrench, Trash2, Tag, ShieldCheck, FileText, Package, CalendarDays, UserPlus, Library,
  FileBarChart,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { ROLE_LABELS } from '../lib/format'
import { SARPRAS_AREAS } from '../lib/sarpras'
import { ACADEMIC_AREAS } from '../lib/academic'
import { KEUANGAN_AREAS } from '../lib/keuangan'

// Ikon per area Academic (dipetakan dari slug).
const ACAD_ICONS = {
  dashboard: LayoutDashboard, kalender: CalendarDays, mapel: Library, penugasan: GraduationCap, jadwal: CalendarRange,
  jurnal: NotebookText, 'rekap-kbm': ClipboardCheck, kurikulum: BookOpen, ekstrakurikuler: Star, perangkat: FileText,
  ppdb: UserPlus,
}

// Ikon per area Sarpras (dipetakan dari slug agar lib/sarpras bebas ikon).
const SARPRAS_ICONS = {
  dashboard: LayoutDashboard, perencanaan: ClipboardList, pengadaan: ShoppingCart, penerimaan: Truck,
  penggunaan: UserCheck, inventaris: Boxes, ruangan: DoorOpen, 'habis-pakai': Package,
  inventarisasi: ClipboardCheck, pemeliharaan: Wrench, penghapusan: Trash2,
  kodefikasi: Tag, dokumen: FileText, kebijakan: ShieldCheck,
}

// Ikon per area Keuangan (dipetakan dari slug agar lib/keuangan bebas ikon).
const KEUANGAN_ICONS = {
  dashboard: LayoutDashboard, rkas: ClipboardList, 'buku-kas': Wallet, laporan: FileBarChart,
}

// Fitur modul Kepegawaian (Dasbor s/d Struktur Organisasi) dikelompokkan
// jadi satu dropdown yang bisa dilipat di Sidebar — menyiapkan tempat
// untuk modul-modul lain (Akademik, Keuangan, dst.) sebagai grup terpisah
// di masa depan tanpa membuat Sidebar penuh sesak. Item "lintas modul"
// (Pengguna & Peran, Log Aktivitas, Notifikasi Email) sengaja TIDAK ikut
// masuk grup ini karena berlaku untuk seluruh aplikasi, bukan cuma SDM.
function navGroupsFor({ isManager, hasFullAccess, employeeId, can, permsReady }) {
  // Mode "kelola" per modul: hormati MATRIKS IZIN per-modul (Pengguna & Peran,
  // Fase 2) lebih dulu. Bila RPC izin (my_permissions) belum siap — mis. DB
  // lama tanpa migrasi 0055 — jatuh ke gerbang peran lama agar tidak ada
  // yang kehilangan akses. Bersifat ADITIF: peran manajerial/akses-penuh
  // tetap melihat menunya; mencentang modul untuk peran lain (mis. Guru) kini
  // benar-benar memunculkan menunya. Penegakan sebenarnya tetap di RLS + guard
  // tiap halaman.
  const mgrOf = (modul) => isManager || (permsReady && can(modul, 'lihat'))
  const fullOf = (modul) => hasFullAccess || (permsReady && can(modul, 'lihat'))

  const kepegawaian = [{ to: '/', label: 'Dasbor', icon: LayoutDashboard, end: true }]
  kepegawaian.push({ to: '/pegawai', label: mgrOf('pegawai') ? 'Data Pegawai' : 'Profil Saya', icon: Users })
  kepegawaian.push({ to: '/presensi', label: mgrOf('presensi') ? 'Presensi' : 'Presensi Saya', icon: CalendarCheck })
  kepegawaian.push({ to: '/cuti', label: mgrOf('cuti') ? 'Cuti' : 'Cuti Saya', icon: CalendarClock })
  kepegawaian.push({ to: '/penggajian', label: mgrOf('penggajian') ? 'Penggajian' : 'Slip Gaji', icon: Wallet })
  kepegawaian.push({ to: '/kinerja', label: mgrOf('kinerja') ? 'Kinerja' : 'Kinerja Saya', icon: Star })
  // OKR & KPI tingkat satuan pendidikan (KinerjaLembaga.jsx) — milik sekolah,
  // bukan pegawai perorangan; tak ada versi "saya". Tampil bila manajemen
  // ATAU peran diberi izin modul 'okr_kpi' lewat matriks.
  if (mgrOf('okr_kpi')) kepegawaian.push({ to: '/kinerja-lembaga', label: 'OKR & KPI', icon: Target })
  kepegawaian.push({ to: '/beban-kerja', label: mgrOf('beban_kerja') ? 'Beban Kerja' : 'Beban Kerja Saya', icon: Activity })
  kepegawaian.push({ to: '/pelatihan', label: mgrOf('pelatihan') ? 'Pelatihan' : 'Pelatihan Saya', icon: GraduationCap })
  if (mgrOf('kalender_libur')) kepegawaian.push({ to: '/kalender-libur', label: 'Kalender Libur', icon: CalendarOff })
  if (fullOf('struktur')) kepegawaian.push({ to: '/struktur', label: 'Struktur Organisasi', icon: Building2 })

  // Modul Kesiswaan (Student Information Management) — dikelompokkan
  // terpisah dari Kepegawaian. Data Siswa & Kelas/Tahun Ajaran hanya untuk
  // manajemen (Admin Yayasan/HR/Admin Sekolah/Kepala Sekolah); Presensi
  // Siswa JUGA dibuka untuk Wali Kelas biasa (guru) — akses ke rombel
  // yang diampunya sendiri, sesuai keputusan "Wali Kelas login sendiri".
  // Siswa sendiri tidak login ke sistem ini (notifikasi lewat email saja).
  // Keputusan 2026-09-24: SEMUA pegawai melihat seluruh grup modul di
  // Sidebar (transparansi fitur yang tersedia), namun AKSES tetap dibatasi
  // di tiap halaman — setiap halaman modul ini sudah menampilkan pesan
  // "Akses terbatas" bila pengguna tak berwenang, dan data tetap dijaga
  // RLS. Karena itu penyusunan menu di bawah tidak lagi digate isManager.
  // Label yang adaptif (mode "saya") tetap ditangani di grup Kepegawaian.
  const kesiswaan = [
    { to: '/kesiswaan', label: 'Dashboard Kesiswaan', icon: LayoutDashboard },
    { to: '/siswa', label: 'Data Siswa', icon: Contact },
    { to: '/akademik', label: 'Kelas & Tahun Ajaran', icon: CalendarRange },
    { to: '/presensi-siswa', label: 'Presensi Siswa', icon: ClipboardCheck },
    { to: '/spp', label: 'SPP', icon: ReceiptText },
    { to: '/nilai-rapor', label: 'Nilai & Rapor', icon: NotebookText },
  ]

  // Modul Academic Management (Pembelajaran) — semua area ditampilkan;
  // halaman AcademicManagement membatasi akses (manajemen = semua area,
  // guru pengampu = area miliknya, selain itu "Akses terbatas").
  const akademik = ACADEMIC_AREAS.map((a) => ({
    to: `/pembelajaran/${a.slug}`,
    label: (!isManager && employeeId && a.labelGuru) ? a.labelGuru : a.label,
    icon: ACAD_ICONS[a.slug] || CalendarRange,
  }))

  // Modul Sarana & Prasarana (Manajemen Aset) — semua area ditampilkan;
  // AsetList membatasi akses (isManager). Area khusus Yayasan (kodefikasi)
  // tetap hanya untuk hasFullAccess supaya tidak memancing klik yang
  // pasti tertolak untuk area yang bahkan tak relevan bagi manajer sekolah.
  const sarpras = SARPRAS_AREAS
    .filter((a) => !a.fullAccessOnly || hasFullAccess)
    .map((a) => ({ to: `/aset/${a.slug}`, label: a.label, icon: SARPRAS_ICONS[a.slug] || Boxes }))

  // Modul Manajemen Keuangan (RKAS, Buku Kas, Laporan) — semua area
  // ditampilkan; KeuanganManagement membatasi akses (isManager || Bendahara).
  const keuangan = KEUANGAN_AREAS.map((a) => ({ to: `/keuangan/${a.slug}`, label: a.label, icon: KEUANGAN_ICONS[a.slug] || Wallet }))

  // MENU PRIBADI: manajer tingkat SEKOLAH (Admin/Kepala Sekolah & Waka) juga
  // seorang PEGAWAI — mereka butuh akses data pribadinya sendiri (profil,
  // presensi, cuti, slip, kinerja, beban kerja, pelatihan). Menu manajemen
  // di grup Kepegawaian menampilkan versi kelola; menu pribadi ini memakai
  // rute yang sama dengan penanda ?me=1 (mode "diri sendiri"). Admin Yayasan/
  // HR (hasFullAccess) tidak ditampilkan menu ini sesuai permintaan.
  const pribadi = []
  if (isManager && !hasFullAccess) {
    pribadi.push({ to: '/?me=1', label: 'Dasbor Saya', icon: LayoutDashboard })
    if (employeeId) pribadi.push({ to: `/pegawai/${employeeId}`, label: 'Profil Saya', icon: Contact })
    pribadi.push({ to: '/presensi?me=1', label: 'Presensi Saya', icon: CalendarCheck })
    pribadi.push({ to: '/cuti?me=1', label: 'Cuti Saya', icon: CalendarClock })
    pribadi.push({ to: '/penggajian?me=1', label: 'Slip Gaji Saya', icon: Wallet })
    pribadi.push({ to: '/kinerja?me=1', label: 'Kinerja Saya', icon: Star })
    pribadi.push({ to: '/beban-kerja?me=1', label: 'Beban Kerja Saya', icon: Activity })
    pribadi.push({ to: '/pelatihan?me=1', label: 'Pelatihan Saya', icon: GraduationCap })
  }

  // Modul sistem (lintas aplikasi). Default hanya akses-penuh (Admin Yayasan/
  // HR), tapi kini juga tampil bila peran diberi izin modulnya lewat matriks.
  const lainnya = []
  // Analitik & Laporan — pelaporan lintas-modul untuk manajemen (Yayasan/HR/
  // Kepala Sekolah). Data per-unit tetap dibatasi RLS sesuai hak akses.
  if (isManager || (permsReady && can('analitik', 'lihat'))) lainnya.push({ to: '/analitik', label: 'Analitik & Laporan', icon: FileBarChart })
  if (fullOf('pengguna')) lainnya.push({ to: '/pengguna', label: 'Pengguna & Peran', icon: UserCog })
  if (fullOf('log')) lainnya.push({ to: '/log-aktivitas', label: 'Log Aktivitas', icon: History })
  if (fullOf('notifikasi')) lainnya.push({ to: '/notifikasi-email', label: 'Notifikasi Email', icon: Mail })

  return { kepegawaian, kesiswaan, akademik, sarpras, keuangan, pribadi, lainnya }
}

function NavItem({ to, label, icon: Icon, end, onClick }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        `nav-link flex items-center gap-3 rounded-full px-3.5 py-2 text-[14px] font-medium ${
          isActive ? 'bg-[var(--color-navy)] text-white' : 'text-[var(--color-ink)] hover:bg-black/[0.04]'
        }`
      }
    >
      <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
      {label}
    </NavLink>
  )
}

// Deteksi mode desktop (≥1024px) untuk memilih perilaku menu: desktop =
// flyout mengambang; mobile (drawer) = accordion.
function useIsDesktop() {
  const [desktop, setDesktop] = useState(() => {
    try { return window.matchMedia('(min-width: 1024px)').matches } catch { return true }
  })
  useEffect(() => {
    let mq
    try { mq = window.matchMedia('(min-width: 1024px)') } catch { return undefined }
    const on = (e) => setDesktop(e.matches)
    if (mq.addEventListener) mq.addEventListener('change', on); else mq.addListener(on)
    return () => { if (mq.removeEventListener) mq.removeEventListener('change', on); else mq.removeListener(on) }
  }, [])
  return desktop
}

function pathActive(to, pathname) {
  const base = to.split('?')[0]
  if (base === '/') return pathname === '/'
  return pathname === base || pathname.startsWith(base + '/')
}

// Grup modul. Desktop: TRIGGER ringkas yang membuka panel flyout ke kanan
// (mega-menu) saat hover/klik, sehingga Sidebar tetap pendek & tak bergulir
// penuh. Mobile (drawer): accordion melipat ke bawah.
function ModuleGroup({ groupKey, label, icon: Icon, items, isDesktop, openKey, setOpenKey, pathname, onNavigate }) {
  const wrapRef = useRef(null)
  const open = openKey === groupKey
  const active = items.some((it) => pathActive(it.to, pathname))
  const twoCol = isDesktop && items.length > 6
  const triggerCls = `nav-link flex w-full items-center gap-3 rounded-full px-3.5 py-2 text-[13px] font-semibold ${active ? 'bg-[var(--color-navy)] text-white' : 'text-[var(--color-ink)] hover:bg-black/[0.04]'}`

  // Tutup flyout saat klik di luar (desktop).
  useEffect(() => {
    if (!open || !isDesktop) return undefined
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpenKey(null) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open, isDesktop, setOpenKey])

  const itemLinks = items.map(({ to, label: l, icon, end }) => (
    <NavItem key={to + l} to={to} label={l} icon={icon} end={end} onClick={() => { setOpenKey(null); onNavigate?.() }} />
  ))

  if (isDesktop) {
    return (
      <div ref={wrapRef} className="relative" onMouseEnter={() => setOpenKey(groupKey)}>
        <button type="button" className={triggerCls} aria-expanded={open} onClick={() => setOpenKey(open ? null : groupKey)}>
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
          <span className="flex-1 text-left">{label}</span>
          <ChevronRight className="h-3.5 w-3.5 opacity-60" />
        </button>
        {open && (
          <div className={`nav-flyout glass absolute left-full top-0 z-50 ml-1 rounded-2xl p-2 ${twoCol ? 'w-[26rem]' : 'w-60'}`}>
            <p className="px-2.5 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">{label}</p>
            <div className={`grid gap-0.5 ${twoCol ? 'grid-cols-2' : 'grid-cols-1'}`}>{itemLinks}</div>
          </div>
        )}
      </div>
    )
  }

  // Mobile: accordion
  return (
    <div>
      <button type="button" className={triggerCls} aria-expanded={open} onClick={() => setOpenKey(open ? null : groupKey)}>
        <Icon className="h-[16px] w-[16px]" strokeWidth={2} />
        <span className="flex-1 text-left">{label}</span>
        <ChevronRight className={`nav-group-chevron h-3.5 w-3.5 ${open ? 'rotate-90' : ''}`} />
      </button>
      <div className={`nav-group-panel ${open ? 'is-open' : ''}`}>
        <div className="flex flex-col gap-0.5 pt-1">{itemLinks}</div>
      </div>
    </div>
  )
}

function Sidebar({ open, onClose }) {
  const { isManager, hasFullAccess, employee, can, permsReady } = useAuth()
  const { kepegawaian, kesiswaan, akademik, sarpras, keuangan, pribadi, lainnya } = navGroupsFor({ isManager, hasFullAccess, employeeId: employee?.id, can, permsReady })
  const isDesktop = useIsDesktop()
  const [openKey, setOpenKey] = useState(null)
  const { pathname } = useLocation()

  // Tutup menu yang terbuka setiap kali pindah halaman.
  useEffect(() => { setOpenKey(null) }, [pathname])

  // Dasbor tampil sebagai item langsung di atas grup (bukan di dalam flyout).
  const dashboard = kepegawaian.find((i) => i.to === '/')
  const kepItems = kepegawaian.filter((i) => i.to !== '/')

  const groups = [
    { key: 'kepegawaian', label: 'Kepegawaian', icon: Users, items: kepItems },
    { key: 'kesiswaan', label: 'Kesiswaan', icon: BookOpen, items: kesiswaan },
    { key: 'akademik', label: 'Akademik / Pembelajaran', icon: GraduationCap, items: akademik },
    { key: 'sarpras', label: 'Sarana & Prasarana', icon: Boxes, items: sarpras },
    { key: 'keuangan', label: 'Manajemen Keuangan', icon: Wallet, items: keuangan },
    { key: 'pribadi', label: 'Menu Pribadi', icon: Contact, items: pribadi },
    { key: 'lainnya', label: 'Lainnya', icon: UserCog, items: lainnya },
  ].filter((g) => g.items.length > 0)

  return (
    <aside
      className={`glass glass-edge-right sidebar-slide fixed inset-y-0 left-0 z-40 w-64 shrink-0 transform lg:translate-x-0 ${
        open ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className="flex h-16 items-center justify-between px-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-[var(--color-navy)] shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_2px_6px_-1px_rgba(0,113,227,0.5)]">
            <GraduationCap className="h-[18px] w-[18px] text-white" strokeWidth={2} />
          </div>
          <div className="leading-tight">
            <p className="font-[family-name:var(--font-display)] text-[15px] font-semibold text-[var(--color-ink)]">SIMPEG Yayasan</p>
            <p className="text-[11px] text-[var(--color-ink-soft)]">SD · SMP · SMA</p>
          </div>
        </div>
        <button onClick={onClose} className="nav-link text-[var(--color-ink-soft)] lg:hidden" aria-label="Tutup menu">
          <X className="h-5 w-5" />
        </button>
      </div>
      <nav className="scroll-thin mt-2 flex flex-col gap-1 overflow-y-auto px-3 pb-6 lg:overflow-visible" style={{ maxHeight: 'calc(100vh - 4rem)' }}>
        {dashboard && <NavItem to={dashboard.to} label={dashboard.label} icon={dashboard.icon} end={dashboard.end} onClick={onClose} />}
        {groups.map((g) => (
          <ModuleGroup
            key={g.key}
            groupKey={g.key}
            label={g.label}
            icon={g.icon}
            items={g.items}
            isDesktop={isDesktop}
            openKey={openKey}
            setOpenKey={setOpenKey}
            pathname={pathname}
            onNavigate={onClose}
          />
        ))}
      </nav>
    </aside>
  )
}

function Topbar({ onMenuClick }) {
  const { profile, roleNames, signOut } = useAuth()
  const navigate = useNavigate()
  const primaryRole = roleNames[0]

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <header className="glass glass-edge-bottom sticky top-0 z-30 flex h-16 items-center justify-between px-4 sm:px-6">
      <button onClick={onMenuClick} className="nav-link text-[var(--color-ink)] lg:hidden" aria-label="Buka menu">
        <Menu className="h-6 w-6" />
      </button>
      <div className="hidden lg:block" />
      <div className="flex items-center gap-3">
        <div className="text-right leading-tight">
          <p className="text-[14px] font-medium text-[var(--color-ink)]">{profile?.full_name || profile?.email}</p>
          {primaryRole && <p className="text-[12px] text-[var(--color-ink-soft)]">{ROLE_LABELS[primaryRole] || primaryRole}</p>}
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-navy)] text-sm font-semibold text-white">
          {(profile?.full_name || profile?.email || '?').slice(0, 1).toUpperCase()}
        </div>
        <button
          onClick={handleSignOut}
          className="nav-link ml-1 flex h-9 w-9 items-center justify-center rounded-full text-[var(--color-ink-soft)] hover:bg-black/[0.05] hover:text-[var(--color-danger)]"
          title="Keluar"
        >
          <LogOut className="h-[18px] w-[18px]" />
        </button>
      </div>
    </header>
  )
}

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()

  return (
    <div className="min-h-screen bg-[var(--color-paper)]">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      {sidebarOpen && (
        <div className="modal-backdrop fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      <div className="lg:pl-64">
        <Topbar onMenuClick={() => setSidebarOpen(true)} />
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
          {/* key={location.pathname} memaksa animasi fade-in diputar ulang
              setiap kali berpindah halaman, supaya transisi antar menu
              terasa halus, bukan "loncat" instan. */}
          <div key={location.pathname} className="page-fade-in">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
