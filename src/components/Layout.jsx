import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, CalendarCheck, CalendarClock, Wallet, Star,
  GraduationCap, Building2, UserCog, LogOut, Menu, X,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { ROLE_LABELS } from '../lib/format'

function navItemsFor({ isManager, hasFullAccess }) {
  const items = [{ to: '/', label: 'Dasbor', icon: LayoutDashboard, end: true }]
  items.push({ to: '/pegawai', label: isManager ? 'Data Pegawai' : 'Profil Saya', icon: Users })
  items.push({ to: '/presensi', label: isManager ? 'Presensi' : 'Presensi Saya', icon: CalendarCheck })
  items.push({ to: '/cuti', label: isManager ? 'Cuti' : 'Cuti Saya', icon: CalendarClock })
  items.push({ to: '/penggajian', label: isManager ? 'Penggajian' : 'Slip Gaji', icon: Wallet })
  items.push({ to: '/kinerja', label: isManager ? 'Kinerja' : 'Kinerja Saya', icon: Star })
  items.push({ to: '/pelatihan', label: isManager ? 'Pelatihan' : 'Pelatihan Saya', icon: GraduationCap })
  if (hasFullAccess) items.push({ to: '/struktur', label: 'Struktur Organisasi', icon: Building2 })
  if (hasFullAccess) items.push({ to: '/pengguna', label: 'Pengguna & Peran', icon: UserCog })
  return items
}

function Sidebar({ open, onClose }) {
  const { isManager, hasFullAccess } = useAuth()
  const items = navItemsFor({ isManager, hasFullAccess })

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 w-64 shrink-0 transform border-r border-[var(--color-border)] bg-[var(--color-navy)] transition-transform lg:translate-x-0 ${
        open ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className="flex h-16 items-center justify-between px-5">
        <div className="flex items-center gap-2.5">
          <GraduationCap className="h-6 w-6 text-[var(--color-gold)]" strokeWidth={2} />
          <div className="leading-tight">
            <p className="font-[family-name:var(--font-display)] text-[15px] font-semibold text-white">SIMPEG Yayasan</p>
            <p className="text-[11px] text-white/50">SD · SMP · SMA</p>
          </div>
        </div>
        <button onClick={onClose} className="text-white/70 lg:hidden" aria-label="Tutup menu">
          <X className="h-5 w-5" />
        </button>
      </div>
      <nav className="scroll-thin mt-2 flex flex-col gap-0.5 overflow-y-auto px-3 pb-6" style={{ maxHeight: 'calc(100vh - 4rem)' }}>
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
            {label}
          </NavLink>
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
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-paper)]/90 px-4 backdrop-blur sm:px-6">
      <button onClick={onMenuClick} className="text-[var(--color-ink)] lg:hidden" aria-label="Buka menu">
        <Menu className="h-6 w-6" />
      </button>
      <div className="hidden lg:block" />
      <div className="flex items-center gap-3">
        <div className="text-right leading-tight">
          <p className="text-sm font-medium text-[var(--color-ink)]">{profile?.full_name || profile?.email}</p>
          {primaryRole && <p className="text-xs text-[var(--color-ink-soft)]">{ROLE_LABELS[primaryRole] || primaryRole}</p>}
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-navy)] text-sm font-semibold text-white">
          {(profile?.full_name || profile?.email || '?').slice(0, 1).toUpperCase()}
        </div>
        <button
          onClick={handleSignOut}
          className="ml-1 flex h-9 w-9 items-center justify-center rounded-md text-[var(--color-ink-soft)] hover:bg-[var(--color-navy-50)] hover:text-[var(--color-danger)]"
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

  return (
    <div className="min-h-screen bg-[var(--color-paper)]">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      <div className="lg:pl-64">
        <Topbar onMenuClick={() => setSidebarOpen(true)} />
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
