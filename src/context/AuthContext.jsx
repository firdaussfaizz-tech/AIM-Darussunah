import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = belum dicek, null = tidak login
  const [profile, setProfile] = useState(null)
  const [roles, setRoles] = useState([])
  const [employee, setEmployee] = useState(null)
  const [waliKelasRombel, setWaliKelasRombel] = useState([])
  const [loadingContext, setLoadingContext] = useState(true)
  // ID pengguna yang konteksnya sudah dimuat. Dipakai untuk MENGABAIKAN
  // event auth berulang (TOKEN_REFRESHED / SIGNED_IN ulang) yang dipancarkan
  // Supabase saat tab browser kembali fokus — tanpa ini, `loading` menyala
  // lagi, seluruh aplikasi remount, dan pengguna terlempar ke halaman awal.
  const loadedUserIdRef = useRef(undefined)

  const loadContext = useCallback(async (userId) => {
    if (!userId) {
      setProfile(null)
      setRoles([])
      setEmployee(null)
      setWaliKelasRombel([])
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
    setEmployee(employeeData || null)

    // AKSES WAKIL KEPALA SEKOLAH: pegawai yang mengemban tugas tambahan
    // ber-flag `beri_akses_manajer` (mis. Wakil Kepala Sekolah) diberi akses
    // setara Kepala Sekolah di unit-nya. Kita suntikkan SATU peran sintetis
    // kepala_sekolah untuk school pegawai bila belum punya peran manajer di
    // sana — sehingga isManager, mySchools, dan menu ikut terbuka. RLS di DB
    // (has_school_access/is_school_manager, migrasi 0039) menjamin sisi data.
    let effectiveRoles = roleData || []
    if (employeeData?.id && employeeData?.school_id) {
      const { data: tt } = await supabase
        .from('employee_tugas_tambahan')
        .select('tugas_tambahan(beri_akses_manajer)')
        .eq('employee_id', employeeData.id)
      const grantsManager = (tt || []).some((r) => r.tugas_tambahan?.beri_akses_manajer)
      const alreadyManager = effectiveRoles.some(
        (r) => r.school_id === employeeData.school_id && ['kepala_sekolah', 'admin_sekolah'].includes(r.role)
      )
      if (grantsManager && !alreadyManager) {
        effectiveRoles = [
          ...effectiveRoles,
          { role: 'kepala_sekolah', school_id: employeeData.school_id, schools: employeeData.schools, _via_tugas_tambahan: true },
        ]
      }
    }
    setRoles(effectiveRoles)

    // Rombel yang Wali Kelas-nya adalah pegawai ini — dipakai untuk
    // menampilkan menu Kesiswaan (Presensi Siswa, Nilai & Rapor) ke Wali
    // Kelas biasa (bukan Admin Sekolah/Kepala Sekolah), sesuai keputusan
    // "Wali Kelas login sendiri". RLS rombel_select (migrasi 0022) sudah
    // mengizinkan pegawai melihat rombel yang wali_kelas_employee_id-nya
    // dirinya sendiri, terlepas dari has_school_access.
    if (employeeData?.id) {
      const { data: wkRombel } = await supabase
        .from('rombel')
        .select('id, nama_rombel, tingkat, school_id, tahun_ajaran_id, schools!school_id(nama, jenjang), tahun_ajaran(nama, status)')
        .eq('wali_kelas_employee_id', employeeData.id)
      setWaliKelasRombel(wkRombel || [])
    } else {
      setWaliKelasRombel([])
    }

    setLoadingContext(false)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      loadedUserIdRef.current = data.session?.user?.id ?? null
      loadContext(data.session?.user?.id)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession)
      const newUserId = newSession?.user?.id ?? null
      // HANYA muat ulang konteks (yang menyalakan `loading`) bila IDENTITAS
      // pengguna benar-benar berubah — bukan pada TOKEN_REFRESHED atau
      // SIGNED_IN berulang saat tab kembali fokus. Ini mencegah aplikasi
      // remount & kembali ke halaman awal setiap kali berpindah tab.
      if (newUserId !== loadedUserIdRef.current) {
        loadedUserIdRef.current = newUserId
        loadContext(newUserId)
      }
    })
    return () => listener.subscription.unsubscribe()
  }, [loadContext])

  const roleNames = useMemo(() => roles.map((r) => r.role), [roles])
  const isAdminYayasan = roleNames.includes('admin_yayasan')
  const isHr = roleNames.includes('hr')
  const isManager = isAdminYayasan || isHr || roleNames.includes('admin_sekolah') || roleNames.includes('kepala_sekolah')
  const hasFullAccess = isAdminYayasan || isHr
  const isBendahara = roleNames.includes('bendahara')
  const managedSchoolIds = roles.filter((r) => r.school_id).map((r) => r.school_id)
  const isWaliKelas = waliKelasRombel.length > 0

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
    isBendahara,
    managedSchoolIds,
    waliKelasRombel,
    isWaliKelas,
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
