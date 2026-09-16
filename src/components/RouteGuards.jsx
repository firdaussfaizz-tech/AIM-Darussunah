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

export function RequireFullAccess({ children }) {
  const { hasFullAccess, loading } = useAuth()
  if (loading) return <FullPageSpinner />
  if (!hasFullAccess) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Akses terbatas"
        description="Halaman ini hanya dapat diakses oleh Admin Yayasan atau HR."
      />
    )
  }
  return children
}
