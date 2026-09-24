import { useEffect, useState, useCallback } from 'react'
import { UserCog, Plus, Trash2, Link2, RefreshCw } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { PageHeader, SectionCard, Button, Table, Tr, Td, Badge, Modal, Select, EmptyState, FullPageSpinner } from '../../components/ui'
import { ROLE_OPTIONS, ROLE_LABELS } from '../../lib/format'

export default function UserRoles() {
  const [profiles, setProfiles] = useState([])
  const [roles, setRoles] = useState([])
  const [schools, setSchools] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [roleModalProfile, setRoleModalProfile] = useState(null)
  const [linkModalProfile, setLinkModalProfile] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: p }, { data: r }, { data: s }, { data: e }] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('user_roles').select('*, schools(nama, jenjang)'),
      supabase.from('schools').select('id, nama, jenjang').order('jenjang'),
      supabase.from('employees').select('id, nama, user_id').order('nama'),
    ])
    setProfiles(p || [])
    setRoles(r || [])
    setSchools(s || [])
    setEmployees(e || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const [syncing, setSyncing] = useState(false)

  const removeRole = async (roleId) => {
    if (!confirm('Hapus peran ini dari pengguna?')) return
    await supabase.from('user_roles').delete().eq('id', roleId)
    load()
  }

  // #7: buat peran login pegawai dari jabatannya (positions.default_role).
  // Hanya MENAMBAH peran yang belum ada — tidak menghapus peran manual.
  const syncPeranDariJabatan = async () => {
    if (!confirm(
      'Sinkronkan peran login dari jabatan pegawai?\n\n' +
      'Untuk setiap pegawai aktif yang sudah punya akun login, sistem akan MEMBUAT peran sesuai "Peran Login dari Jabatan" pada jabatannya ' +
      '(diatur di Struktur Organisasi > Jabatan). Peran yang sudah ada tidak diubah/dihapus. Lanjutkan?'
    )) return
    setSyncing(true)
    const { data, error } = await supabase.rpc('sinkron_peran_dari_jabatan')
    setSyncing(false)
    if (error) { alert('Gagal menyinkronkan: ' + error.message); return }
    alert(data > 0 ? `${data} peran baru dibuat dari jabatan pegawai.` : 'Tidak ada peran baru — semua pegawai yang punya akun & jabatan sudah memiliki perannya (atau jabatannya belum diberi "Peran Login").')
    load()
  }

  const linkEmployee = async (profileId, employeeId, previousEmployeeId) => {
    // Lepas tautan lama dulu jika berbeda dari pilihan baru, supaya satu
    // pegawai tidak pernah tertaut ke lebih dari satu akun sekaligus.
    if (previousEmployeeId && previousEmployeeId !== employeeId) {
      await supabase.from('employees').update({ user_id: null }).eq('id', previousEmployeeId)
    }
    if (employeeId) {
      await supabase.from('employees').update({ user_id: profileId }).eq('id', employeeId)
    }
    setLinkModalProfile(null)
    load()
  }

  const deleteUser = async (p) => {
    const ok = confirm(
      `Hapus pengguna "${p.full_name || p.email}" dari aplikasi?\n\n` +
      `Ini akan mencabut semua peran dan tautan datanya, sehingga akses ke aplikasi langsung hilang. ` +
      `Namun akun login (email/kata sandi)-nya TIDAK terhapus dan masih bisa dipakai untuk masuk (tanpa akses apa pun) ` +
      `kecuali Anda juga menghapusnya lewat Supabase Dashboard > Authentication > Users.`
    )
    if (!ok) return
    await supabase.from('user_roles').delete().eq('user_id', p.id)
    await supabase.from('employees').update({ user_id: null }).eq('user_id', p.id)
    await supabase.from('profiles').delete().eq('id', p.id)
    load()
  }

  if (loading) return <FullPageSpinner />

  return (
    <div>
      <PageHeader
        title="Pengguna & Peran"
        description="Kelola akses masuk dan peran setiap pengguna aplikasi."
        actions={<Button variant="outline" onClick={syncPeranDariJabatan} disabled={syncing}><RefreshCw className="h-4 w-4" /> {syncing ? 'Menyinkronkan…' : 'Sinkronkan Peran dari Jabatan'}</Button>}
      />

      <SectionCard title="Daftar Pengguna Terdaftar" description={`${profiles.length} akun terdaftar`}>
        {profiles.length === 0 ? (
          <EmptyState icon={UserCog} title="Belum ada pengguna" />
        ) : (
          <Table columns={['Nama / Email', 'Peran', 'Ditautkan ke Pegawai', '']}>
            {profiles.map((p) => {
              const userRoles = roles.filter((r) => r.user_id === p.id)
              const linkedEmployee = employees.find((e) => e.user_id === p.id)
              return (
                <Tr key={p.id}>
                  <Td>
                    <p className="font-medium text-[var(--color-ink)]">{p.full_name || '—'}</p>
                    <p className="text-xs text-[var(--color-ink-soft)]">{p.email}</p>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {userRoles.length === 0 && <span className="text-xs text-[var(--color-ink-soft)]">Belum ada peran</span>}
                      {userRoles.map((r) => (
                        <Badge key={r.id} color="navy">
                          {ROLE_LABELS[r.role]}{r.schools ? ` · ${r.schools.jenjang}` : ''}
                          <button onClick={() => removeRole(r.id)} className="ml-1.5 hover:text-[var(--color-danger)]">✕</button>
                        </Badge>
                      ))}
                    </div>
                  </Td>
                  <Td className="text-[var(--color-ink-soft)]">{linkedEmployee?.nama || '—'}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-2">
                      <button title="Tautkan ke data pegawai" onClick={() => setLinkModalProfile(p)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]">
                        <Link2 className="h-4 w-4" />
                      </button>
                      <button title="Tambah peran" onClick={() => setRoleModalProfile(p)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]">
                        <Plus className="h-4 w-4" />
                      </button>
                      <button title="Hapus pengguna" onClick={() => deleteUser(p)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </Td>
                </Tr>
              )
            })}
          </Table>
        )}
      </SectionCard>

      <RoleModal profile={roleModalProfile} schools={schools} employees={employees} onClose={() => setRoleModalProfile(null)} onSaved={() => { setRoleModalProfile(null); load() }} />
      <LinkModal
        profile={linkModalProfile}
        employees={employees}
        currentEmployeeId={linkModalProfile ? employees.find((e) => e.user_id === linkModalProfile.id)?.id || '' : ''}
        onClose={() => setLinkModalProfile(null)}
        onLink={linkEmployee}
      />
    </div>
  )
}

function RoleModal({ profile, schools, onClose, onSaved }) {
  const [role, setRole] = useState('staff')
  const [schoolId, setSchoolId] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { if (profile) { setRole('staff'); setSchoolId(''); setEmployeeId(''); setError('') } }, [profile])

  if (!profile) return null

  const needsSchool = ['admin_sekolah', 'kepala_sekolah'].includes(role)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('user_roles').insert({
      user_id: profile.id,
      role,
      school_id: needsSchool ? schoolId || null : null,
      employee_id: employeeId || null,
    })
    setSaving(false)
    if (err) { setError(err.message.includes('duplicate') ? 'Peran ini sudah dimiliki pengguna.' : err.message); return }
    onSaved()
  }

  return (
    <Modal open={!!profile} onClose={onClose} title={`Tambah Peran — ${profile.full_name || profile.email}`}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Select label="Peran" value={role} onChange={(e) => setRole(e.target.value)}>
          {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </Select>
        {needsSchool && (
          <Select label="Unit Sekolah" required value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
            <option value="">— Pilih Unit —</option>
            {schools.map((s) => <option key={s.id} value={s.id}>{s.jenjang} — {s.nama}</option>)}
          </Select>
        )}
        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button>
        </div>
      </form>
    </Modal>
  )
}

function LinkModal({ profile, employees, currentEmployeeId, onClose, onLink }) {
  const [employeeId, setEmployeeId] = useState('')

  useEffect(() => { setEmployeeId(currentEmployeeId || '') }, [profile, currentEmployeeId])

  if (!profile) return null

  return (
    <Modal open={!!profile} onClose={onClose} title={`Tautkan Akun — ${profile.full_name || profile.email}`}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-[var(--color-ink-soft)]">
          Pilih data pegawai yang sesuai dengan akun ini, agar pengguna dapat melihat presensi, cuti, dan slip gajinya sendiri.
          Memilih pegawai yang sudah tertaut ke akun lain akan memindahkan tautannya ke akun ini.
        </p>
        <Select label="Data Pegawai" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
          <option value="">— Tidak ditautkan —</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nama}{e.user_id && e.user_id !== profile.id ? ' (tertaut ke akun lain)' : ''}
            </option>
          ))}
        </Select>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="button" onClick={() => onLink(profile.id, employeeId || null, currentEmployeeId || null)}>
            {employeeId ? 'Tautkan' : 'Simpan'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
