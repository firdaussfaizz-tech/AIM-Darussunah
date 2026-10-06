import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { FullPageSpinner, EmptyState } from './ui'
import { ShieldAlert } from 'lucide-react'

export function RequireAuth({ children }) {
  const { session, loading } = useAuth()
  const location = useLocation()
  if (loading) return <FullPageSpinner />
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return children
}

// Gerbang rute "akses penuh". Secara default hanya Admin Yayasan/HR
// (hasFullAccess). Namun bila diberi prop `modul`, gerbang ini menjadi
// SADAR-MATRIKS (aditif): peran mana pun yang dicentang `<modul>:lihat` di
// Pengguna & Peran juga boleh masuk — konsisten dengan tampilnya menu di
// Sidebar (lihat Layout.navGroupsFor: fullOf). Fallback ke peran lama bila
// RPC izin (my_permissions) belum siap pada DB lama. Penegakan data tetap
// di RLS tiap tabel.
export function RequireFullAccess({ children, modul }) {
  const { hasFullAccess, can, permsReady, loading } = useAuth()
  if (loading) return <FullPageSpinner />
  const boleh = hasFullAccess || (modul ? permsReady && can(modul, 'lihat') : false)
  if (!boleh) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Akses terbatas"
        description="Halaman ini hanya dapat diakses oleh Admin Yayasan atau HR, atau peran yang diberi izin modul ini lewat Pengguna & Peran."
      />
    )
  }
  return children
}
