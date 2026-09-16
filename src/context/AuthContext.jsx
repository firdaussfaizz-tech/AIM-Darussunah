import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = belum dicek, null = tidak login
  const [profile, setProfile] = useState(null)
  const [roles, setRoles] = useState([])
  const [employee, setEmployee] = useState(null)
  const [loadingContext, setLoadingContext] = useState(true)

  const loadContext = useCallback(async (userId) => {
    if (!userId) {
      setProfile(null)
      setRoles([])
      setEmployee(null)
      setLoadingContext(false)
      return
    }
    setLoadingContext(true)
    const [{ data: profileData }, { data: roleData }, { data: employeeData }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('user_roles').select('*, schools!school_id(nama, jenjang)').eq('user_id', userId),
      supabase.from('employees').select('*, schools!school_id(nama, jenjang)').eq('user_id', userId).maybeSingle(),
    ])
    setProfile(profileData || null)
    setRoles(roleData || [])
    setEmployee(employeeData || null)
    setLoadingContext(false)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      loadContext(data.session?.user?.id)
    })
  const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession)
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        loadContext(newSession?.user?.id)
      }
    })
    return () => listener.subscription.unsubscribe()
  }, [loadContext])

  const roleNames = useMemo(() => roles.map((r) => r.role), [roles])
  const isAdminYayasan = roleNames.includes('admin_yayasan')
  const isHr = roleNames.includes('hr')
  const isManager = isAdminYayasan || isHr || roleNames.includes('admin_sekolah') || roleNames.includes('kepala_sekolah')
  const hasFullAccess = isAdminYayasan || isHr
  const managedSchoolIds = roles.filter((r) => r.school_id).map((r) => r.school_id)

  const value = {
    session,
    user: session?.user || null,
    profile,
    roles,
    roleNames,
    employee,
    isAdminYayasan,
    isHr,
    isManager,
    hasFullAccess,
    managedSchoolIds,
    loading: session === undefined || loadingContext,
    refreshContext: () => loadContext(session?.user?.id),
    signOut: () => supabase.auth.signOut(),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
