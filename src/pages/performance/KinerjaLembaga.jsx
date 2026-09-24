import { useState } from 'react'
import { Target, Gauge, LineChart, ShieldAlert } from 'lucide-react'
import { PageHeader, EmptyState, FullPageSpinner } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { OkrPanel } from './OkrList'
import { KpiLembagaPanel, LembagaDashboard } from './KpiLembaga'

// Halaman gabungan tingkat SATUAN PENDIDIKAN (institusi): menyatukan OKR
// (sasaran & key results sekolah) dan KPI Lembaga (scorecard indikator +
// realisasi + dashboard) dalam SATU menu, sesuai keputusan pengguna.
// Keduanya sama-sama milik sekolah, diajukan ke Yayasan untuk disetujui —
// hanya Kepala/Admin Sekolah & Yayasan yang mengaksesnya (menu digate
// isManager di Layout.jsx).
const TABS = [
  { key: 'okr', label: 'OKR', icon: Target },
  { key: 'kpi', label: 'KPI Lembaga', icon: Gauge },
  { key: 'dashboard', label: 'Dashboard', icon: LineChart },
]

export default function KinerjaLembaga() {
  const { isManager, can, permsReady, loading: authLoading } = useAuth()
  const [tab, setTab] = useState('okr')

  if (authLoading) return <FullPageSpinner />
  const bolehLihat = permsReady ? can('okr_kpi', 'lihat') : isManager
  if (!bolehLihat) {
    return <EmptyState icon={ShieldAlert} title="Akses terbatas" description="Peran Anda tidak memiliki izin melihat OKR & KPI Lembaga." />
  }

  return (
    <div>
      <PageHeader
        title="OKR & KPI Lembaga"
        description="Sasaran dan indikator kinerja tingkat satuan pendidikan — disusun sekolah, diverifikasi & divalidasi Yayasan."
      />

      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-[var(--color-border)]">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors ${
              tab === key ? 'border-[var(--color-navy)] text-[var(--color-navy)]' : 'border-transparent text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]'
            }`}
          >
            <Icon className="h-4 w-4" strokeWidth={1.75} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'okr' && <OkrPanel />}
      {tab === 'kpi' && <KpiLembagaPanel />}
      {tab === 'dashboard' && <LembagaDashboard />}
    </div>
  )
}
