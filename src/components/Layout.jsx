import { useState } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Users, CalendarCheck, CalendarClock, Wallet, Star,
  GraduationCap, Building2, UserCog, LogOut, Menu, X, Activity, CalendarOff,
  History, Mail, ChevronRight, BookOpen, Contact, CalendarRange, ClipboardCheck,
  ReceiptText, NotebookText, Target, Boxes,
  ClipboardList, ShoppingCart, Truck, UserCheck, DoorOpen, Wrench, Trash2, Tag, ShieldCheck, FileText, Package,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { ROLE_LABELS } from '../lib/format'
import { SARPRAS_AREAS } from '../lib/sarpras'
import { ACADEMIC_AREAS } from '../lib/academic'

// Ikon per area Academic (dipetakan dari slug).
const ACAD_ICONS = {
  dashboard: LayoutDashboard, penugasan: GraduationCap, jadwal: CalendarRange,
  jurnal: NotebookText, kurikulum: BookOpen, ekstrakurikuler: Star, perangkat: FileText,
}

// Ikon per area Sarpras (dipetakan dari slug agar lib/sarpras bebas ikon).
const SARPRAS_ICONS = {
  dashboard: LayoutDashboard, perencanaan: ClipboardList, pengadaan: ShoppingCart, penerimaan: Truck,
  penggunaan: UserCheck, inventaris: Boxes, ruangan: DoorOpen, 'habis-pakai': Package,
  inventarisasi: ClipboardCheck, pemeliharaan: Wrench, penghapusan: Trash2,
  kodefikasi: Tag, dokumen: FileText, kebijakan: ShieldCheck,
}

// Fitur modul Kepegawaian (Dasbor s/d Struktur Organisasi) dikelompokkan
// jadi satu dropdown yang bisa dilipat di Sidebar — menyiapkan tempat
// untuk modul-modul lain (Akademik, Keuangan, dst.) sebagai grup terpisah
// di masa depan tanpa membuat Sidebar penuh sesak. Item "lintas modul"
// (Pengguna & Peran, Log Aktivitas, Notifikasi Email) sengaja TIDAK ikut
// masuk grup ini karena berlaku untuk seluruh aplikasi, bukan cuma SDM.
function navGroupsFor({ isManager, hasFullAccess, isWaliKelas, isBendahara, employeeId }) {
  const kepegawaian = [{ to: '/', label: 'Dasbor', icon: LayoutDashboard, end: true }]
  kepegawaian.push({ to: '/pegawai', label: isManager ? 'Data Pegawai' : 'Profil Saya', icon: Users })
  kepegawaian.push({ to: '/presensi', label: isManager ? 'Presensi' : 'Presensi Saya', icon: CalendarCheck })
  kepegawaian.push({ to: '/cuti', label: isManager ? 'Cuti' : 'Cuti Saya', icon: CalendarClock })
  kepegawaian.push({ to: '/penggajian', label: isManager ? 'Penggajian' : 'Slip Gaji', icon: Wallet })
  kepegawaian.push({ to: '/kinerja', label: isManager ? 'Kinerja' : 'Kinerja Saya', icon: Star })
  // OKR & KPI kini digabung dalam satu menu tingkat satuan pendidikan
  // (KinerjaLembaga.jsx). Keduanya milik sekolah, bukan pegawai
  // perorangan — hanya manajemen (Kepala/Admin Sekolah & Yayasan) yang
  // mengakses, jadi menu ini disembunyikan dari pegawai biasa.
  if (isManager) kepegawaian.push({ to: '/kinerja-lembaga', label: 'OKR & KPI', icon: Target })
  kepegawaian.push({ to: '/beban-kerja', label: isManager ? 'Beban Kerja' : 'Beban Kerja Saya', icon: Activity })
  kepegawaian.push({ to: '/pelatihan', label: isManager ? 'Pelatihan' : 'Pelatihan Saya', icon: GraduationCap })
  if (isManager) kepegawaian.push({ to: '/kalender-libur', label: 'Kalender Libur', icon: CalendarOff })
  if (hasFullAccess) kepegawaian.push({ to: '/struktur', label: 'Struktur Organisasi', icon: Building2 })

  // Modul Kesiswaan (Student Information Management) — dikelompokkan
  // terpisah dari Kepegawaian. Data Siswa & Kelas/Tahun Ajaran hanya untuk
  // manajemen (Admin Yayasan/HR/Admin Sekolah/Kepala Sekolah); Presensi
  // Siswa JUGA dibuka untuk Wali Kelas biasa (guru) — akses ke rombel
  // yang diampunya sendiri, sesuai keputusan "Wali Kelas login sendiri".
  // Siswa sendiri tidak login ke sistem ini (notifikasi lewat email saja).
  const kesiswaan = []
  if (isManager) {
    kesiswaan.push({ to: '/kesiswaan', label: 'Dashboard Kesiswaan', icon: LayoutDashboard })
    kesiswaan.push({ to: '/siswa', label: 'Data Siswa', icon: Contact })
    kesiswaan.push({ to: '/akademik', label: 'Kelas & Tahun Ajaran', icon: CalendarRange })
  }
  if (isManager || isWaliKelas) {
    kesiswaan.push({ to: '/presensi-siswa', label: 'Presensi Siswa', icon: ClipboardCheck })
  }
  // SPP dibuka untuk manajemen ATAU Bendahara (role finansial terpisah,
  // TIDAK termasuk isManager — lihat keputusan scoping "Perlu role
  // Bendahara terpisah" & RLS di migrasi 0024_kesiswaan_tahap4_spp.sql).
  if (isManager || isBendahara) {
    kesiswaan.push({ to: '/spp', label: 'SPP', icon: ReceiptText })
  }
  if (isManager || isWaliKelas) {
    kesiswaan.push({ to: '/nilai-rapor', label: 'Nilai & Rapor', icon: NotebookText })
  }

  // Modul Academic Management (Pembelajaran) — manajemen untuk semua area,
  // guru pengampu untuk jadwal/jurnal/perangkat miliknya sendiri.
  const akademik = []
  if (isManager) {
    for (const a of ACADEMIC_AREAS) akademik.push({ to: `/pembelajaran/${a.slug}`, label: a.label, icon: ACAD_ICONS[a.slug] || CalendarRange })
  } else if (employeeId) {
    for (const a of ACADEMIC_AREAS.filter((a) => a.scope === 'all')) akademik.push({ to: `/pembelajaran/${a.slug}`, label: a.labelGuru || a.label, icon: ACAD_ICONS[a.slug] || CalendarRange })
  }

  // Modul Sarana & Prasarana (Manajemen Aset) — untuk manajemen sekolah &
  // Yayasan (per-unit lewat RLS). Tiap area siklus (juknis) jadi sub-menu
  // tersendiri di dropdown, seperti Kepegawaian & Kesiswaan.
  const sarpras = []
  if (isManager) {
    for (const a of SARPRAS_AREAS) {
      if (a.fullAccessOnly && !hasFullAccess) continue
      sarpras.push({ to: `/aset/${a.slug}`, label: a.label, icon: SARPRAS_ICONS[a.slug] || Boxes })
    }
  }

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

  const lainnya = []
  if (hasFullAccess) {
    lainnya.push({ to: '/pengguna', label: 'Pengguna & Peran', icon: UserCog })
    lainnya.push({ to: '/log-aktivitas', label: 'Log Aktivitas', icon: History })
    lainnya.push({ to: '/notifikasi-email', label: 'Notifikasi Email', icon: Mail })
  }

  return { kepegawaian, kesiswaan, akademik, sarpras, pribadi, lainnya }
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

// Grup navigasi yang bisa dilipat, dengan animasi tinggi halus (trik CSS
// grid-template-rows, lihat .nav-group-panel di index.css) — tidak perlu
// mengukur tinggi konten lewat JavaScript untuk tetap mulus. Status
// terbuka/tertutup disimpan di localStorage supaya pilihan pengguna tidak
// hilang setiap kali me-reload halaman.
function NavGroup({ storageKey, label, icon: Icon, defaultOpen = true, children }) {
  const [open, setOpen] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      return saved === null ? defaultOpen : saved === '1'
    } catch {
      return defaultOpen
    }
  })

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev
      try { localStorage.setItem(storageKey, next ? '1' : '0') } catch { /* localStorage tidak tersedia — abaikan */ }
      return next
    })
  }

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="nav-link flex w-full items-center gap-3 rounded-full px-3.5 py-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--color-ink-soft)] hover:bg-black/[0.04]"
      >
        <Icon className="h-[16px] w-[16px]" strokeWidth={2} />
        <span className="flex-1 text-left">{label}</span>
        <ChevronRight className={`nav-group-chevron h-3.5 w-3.5 ${open ? 'rotate-90' : ''}`} />
      </button>
      <div className={`nav-group-panel ${open ? 'is-open' : ''}`}>
        <div className="flex flex-col gap-0.5 pt-1">{children}</div>
      </div>
    </div>
  )
}

function Sidebar({ open, onClose }) {
  const { isManager, hasFullAccess, isWaliKelas, isBendahara, employee } = useAuth()
  const { kepegawaian, kesiswaan, akademik, sarpras, pribadi, lainnya } = navGroupsFor({ isManager, hasFullAccess, isWaliKelas, isBendahara, employeeId: employee?.id })

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
      <nav className="scroll-thin mt-2 flex flex-col gap-2 overflow-y-auto px-3 pb-6" style={{ maxHeight: 'calc(100vh - 4rem)' }}>
        <NavGroup storageKey="simpeg_nav_kepegawaian_open" label="Kepegawaian" icon={Users} defaultOpen>
          {kepegawaian.map(({ to, label, icon, end }) => (
            <NavItem key={to} to={to} label={label} icon={icon} end={end} onClick={onClose} />
          ))}
        </NavGroup>

        {kesiswaan.length > 0 && (
          <NavGroup storageKey="simpeg_nav_kesiswaan_open" label="Kesiswaan" icon={BookOpen} defaultOpen>
            {kesiswaan.map(({ to, label, icon, end }) => (
              <NavItem key={to} to={to} label={label} icon={icon} end={end} onClick={onClose} />
            ))}
          </NavGroup>
        )}

        {akademik.length > 0 && (
          <NavGroup storageKey="simpeg_nav_akademik_open" label="Akademik / Pembelajaran" icon={BookOpen} defaultOpen={false}>
            {akademik.map(({ to, label, icon, end }) => (
              <NavItem key={to} to={to} label={label} icon={icon} end={end} onClick={onClose} />
            ))}
          </NavGroup>
        )}

        {sarpras.length > 0 && (
          <NavGroup storageKey="simpeg_nav_sarpras_open" label="Sarana & Prasarana" icon={Boxes} defaultOpen>
            {sarpras.map(({ to, label, icon, end }) => (
              <NavItem key={to} to={to} label={label} icon={icon} end={end} onClick={onClose} />
            ))}
          </NavGroup>
        )}

        {pribadi.length > 0 && (
          <NavGroup storageKey="simpeg_nav_pribadi_open" label="Menu Pribadi" icon={Contact} defaultOpen={false}>
            {pribadi.map(({ to, label, icon }) => (
              <NavItem key={label} to={to} label={label} icon={icon} onClick={onClose} />
            ))}
          </NavGroup>
        )}

        {lainnya.length > 0 && (
          <div>
            <p className="px-3.5 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">Lainnya</p>
            <div className="flex flex-col gap-0.5">
              {lainnya.map(({ to, label, icon, end }) => (
                <NavItem key={to} to={to} label={label} icon={icon} end={end} onClick={onClose} />
              ))}
            </div>
          </div>
        )}
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
