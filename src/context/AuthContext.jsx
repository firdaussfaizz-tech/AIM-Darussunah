import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = belum dicek, null = tidak login
  const [profile, setProfile] = useState(null)
  const [roles, setRoles] = useState([])
  const [employee, setEmployee] = useState(null)
  const [waliKelasRombel, setWaliKelasRombel] = useState([])
  const [perms, setPerms] = useState(() => new Set()) // "modul:aksi" yang diizinkan
  const [permsReady, setPermsReady] = useState(false) // true bila RPC izin berhasil (migrasi 0055 sudah ada)
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
      setPerms(new Set())
      setPermsReady(false)
      setLoadingContext(false)
      return
    }
    setLoadingContext(true)
    const [{ data: profileData }, { data: roleData }, { data: employeeData }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('user_roles').select('*, schools!school_id(nama, jenjang), roles!role_id(id, nama, kode, tingkat_akses, is_admin_yayasan)').eq('user_id', userId),
      supabase.from('employees').select('*, schools!school_id(nama, jenjang)').eq('user_id', userId).maybeSingle(),
    ])
    setProfile(profileData || null)
    setEmployee(employeeData || null)

    // AKSES WAKIL KEPALA SEKOLAH: pegawai dengan JABATAN Waka / Wakil Kepala
    // Sekolah (positions.beri_akses_manajer) diberi akses setara Kepala
    // Sekolah di unit-nya. Kita suntikkan SATU peran sintetis kepala_sekolah
    // untuk school pegawai bila belum punya peran manajer di sana — sehingga
    // isManager, mySchools, dan menu ikut terbuka. RLS di DB
    // (has_school_access/is_school_manager, migrasi 0040) menjamin sisi data.
    // Query jabatan dipisah (bukan di select employees) agar aman bila kolom
    // beri_akses_manajer belum ada saat migrasi belum dijalankan.
    let effectiveRoles = roleData || []
    if (employeeData?.school_id && employeeData?.position_id) {
      const { data: pos } = await supabase
        .from('positions')
        .select('beri_akses_manajer')
        .eq('id', employeeData.position_id)
        .maybeSingle()
      const alreadyManager = effectiveRoles.some(
        (r) => r.school_id === employeeData.school_id && ['kepala_sekolah', 'admin_sekolah'].includes(r.role)
      )
      if (pos?.beri_akses_manajer && !alreadyManager) {
        effectiveRoles = [
          ...effectiveRoles,
          { role: 'kepala_sekolah', school_id: employeeData.school_id, schools: employeeData.schools, _via_jabatan: true },
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

    // Izin per-modul × per-aksi (Fase 2, RBAC). Dihitung server-side
    // (my_permissions) agar konsisten dengan penegakan RLS. Bila RPC belum
    // ada (migrasi 0055 belum dijalankan), diamkan — kontrol menu jatuh ke
    // perilaku lama (halaman tetap dijaga guard & RLS).
    try {
      const { data: permRows, error: permErr } = await supabase.rpc('my_permissions')
      if (permErr) { setPerms(new Set()); setPermsReady(false) }
      else { setPerms(new Set((permRows || []).map((p) => `${p.modul}:${p.aksi}`))); setPermsReady(true) }
    } catch {
      setPerms(new Set()); setPermsReady(false)
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

  // Nama peran untuk tampilan (Topbar): enum lama ATAU nama peran dinamis.
  const roleNames = useMemo(() => roles.map((r) => r.role || r.roles?.nama).filter(Boolean), [roles])
  // Tingkat akses dari peran dinamis (jembatan model peran per jabatan, 0054).
  const levels = useMemo(() => roles.map((r) => r.roles?.tingkat_akses).filter(Boolean), [roles])
  // Peran enum lama (untuk pemeriksaan spesifik yang masih berbasis enum).
  const enumRoles = useMemo(() => roles.map((r) => r.role).filter(Boolean), [roles])

  const isAdminYayasan = enumRoles.includes('admin_yayasan') || roles.some((r) => r.roles?.is_admin_yayasan)
  const isHr = enumRoles.includes('hr')
  const hasFullAccess = isAdminYayasan || isHr || levels.includes('yayasan_penuh')
  const isManager = hasFullAccess || enumRoles.includes('admin_sekolah') || enumRoles.includes('kepala_sekolah') || levels.includes('manajer_unit')
  const isBendahara = enumRoles.includes('bendahara') || levels.includes('bendahara')
  const managedSchoolIds = roles.filter((r) => r.school_id).map((r) => r.school_id)
  const isWaliKelas = waliKelasRombel.length > 0

  // can(modul, aksi) — izin per-modul × per-aksi (Fase 2). Super admin &
  // jembatan enum/waka sudah diperhitungkan server-side (my_permissions).
  const can = useCallback((modul, aksi) => perms.has(`${modul}:${aksi}`), [perms])

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
    perms,
    permsReady,
    can,
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
