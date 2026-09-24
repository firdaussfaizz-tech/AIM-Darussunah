import { useEffect, useState, useCallback } from 'react'
import { UserCog, Plus, Trash2, Link2, RefreshCw } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { PageHeader, SectionCard, Button, Table, Tr, Td, Badge, Modal, Select, EmptyState, FullPageSpinner } from '../../components/ui'
import { ROLE_LABELS } from '../../lib/format'

// Label tingkat akses peran dinamis (0054).
const TINGKAT_AKSES_LABEL = {
  yayasan_penuh: 'Yayasan penuh (semua unit)',
  manajer_unit: 'Manajer unit (unit sendiri)',
  bendahara: 'Bendahara (finansial)',
  pegawai: 'Pegawai (akses pribadi)',
}
const TINGKAT_AKSES_OPTIONS = ['yayasan_penuh', 'manajer_unit', 'bendahara', 'pegawai']

export default function UserRoles() {
  const [profiles, setProfiles] = useState([])
  const [roles, setRoles] = useState([])
  const [rolesList, setRolesList] = useState([])
  const [modules, setModules] = useState([])
  const [schools, setSchools] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [roleModalProfile, setRoleModalProfile] = useState(null)
  const [linkModalProfile, setLinkModalProfile] = useState(null)
  const [permModalRole, setPermModalRole] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: p }, { data: r }, { data: s }, { data: e }, { data: rl }, { data: m }] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('user_roles').select('*, schools(nama, jenjang), roles!role_id(id, nama, tingkat_akses, is_admin_yayasan)'),
      supabase.from('schools').select('id, nama, jenjang').order('jenjang'),
      supabase.from('employees').select('id, nama, user_id').order('nama'),
      supabase.from('roles').select('*').eq('aktif', true).order('nama'),
      supabase.from('modules').select('*').order('urutan'),
    ])
    setProfiles(p || [])
    setRoles(r || [])
    setSchools(s || [])
    setEmployees(e || [])
    setRolesList(rl || [])
    setModules(m || [])
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
                          {r.roles?.nama || ROLE_LABELS[r.role] || r.role}{r.schools ? ` · ${r.schools.jenjang}` : ''}
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

      <SectionCard
        title="Peran & Tingkat Akses"
        description="Satu peran per jabatan (dibuat otomatis). Atur tingkat akses tiap peran di sini — ini menentukan kewenangannya di seluruh aplikasi."
      >
        {rolesList.length === 0 ? (
          <EmptyState icon={UserCog} title="Belum ada peran" description="Peran dibuat otomatis dari Jabatan (Struktur Organisasi)." />
        ) : (
          <Table columns={['Peran', 'Tingkat Akses (preset)', 'Izin Rinci', 'Pengguna']}>
            {rolesList.map((r) => (
              <Tr key={r.id}>
                <Td>
                  <span className="font-medium text-[var(--color-ink)]">{r.nama}</span>
                  {r.is_admin_yayasan && <span className="ml-2"><Badge color="gold">Super Admin</Badge></span>}
                </Td>
                <Td>
                  <Select
                    value={r.tingkat_akses}
                    disabled={r.is_admin_yayasan}
                    onChange={async (e) => {
                      const { error } = await supabase.from('roles').update({ tingkat_akses: e.target.value }).eq('id', r.id)
                      if (error) { alert('Gagal: ' + error.message); return }
                      load()
                    }}
                  >
                    {TINGKAT_AKSES_OPTIONS.map((t) => <option key={t} value={t}>{TINGKAT_AKSES_LABEL[t]}</option>)}
                  </Select>
                </Td>
                <Td>
                  {r.is_admin_yayasan
                    ? <span className="text-xs text-[var(--color-ink-soft)]">Semua izin</span>
                    : <Button size="sm" variant="outline" onClick={() => setPermModalRole(r)}>Atur Izin per Modul</Button>}
                </Td>
                <Td className="text-xs text-[var(--color-ink-soft)]">
                  {roles.filter((ur) => ur.role_id === r.id).length} pengguna
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </SectionCard>

      <PermMatrixModal role={permModalRole} modules={modules} onClose={() => setPermModalRole(null)} onSaved={() => { setPermModalRole(null); load() }} />

      <RoleModal profile={roleModalProfile} schools={schools} rolesList={rolesList} onClose={() => setRoleModalProfile(null)} onSaved={() => { setRoleModalProfile(null); load() }} />
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

function RoleModal({ profile, schools, rolesList, onClose, onSaved }) {
  const [roleId, setRoleId] = useState('')
  const [schoolId, setSchoolId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { if (profile) { setRoleId(''); setSchoolId(''); setError('') } }, [profile])

  if (!profile) return null

  const selectedRole = rolesList.find((r) => r.id === roleId)
  // Peran berlingkup unit (manajer_unit) perlu memilih unit sekolah.
  const needsSchool = selectedRole?.tingkat_akses === 'manajer_unit'

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!roleId) { setError('Pilih peran lebih dulu.'); return }
    if (needsSchool && !schoolId) { setError('Peran manajer unit memerlukan unit sekolah.'); return }
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('user_roles').insert({
      user_id: profile.id,
      role_id: roleId,
      school_id: needsSchool ? schoolId || null : null,
    })
    setSaving(false)
    if (err) { setError(err.message.includes('duplicate') || err.message.includes('unique') ? 'Peran ini sudah dimiliki pengguna.' : err.message); return }
    onSaved()
  }

  return (
    <Modal open={!!profile} onClose={onClose} title={`Tambah Peran — ${profile.full_name || profile.email}`}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Select label="Peran (dari jabatan)" required value={roleId} onChange={(e) => { setRoleId(e.target.value); setSchoolId('') }}>
          <option value="">— Pilih peran —</option>
          {rolesList.map((r) => <option key={r.id} value={r.id}>{r.nama} — {TINGKAT_AKSES_LABEL[r.tingkat_akses]}</option>)}
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

const AKSI_LIST = [
  { kode: 'lihat', label: 'Lihat' },
  { kode: 'tambah', label: 'Tambah' },
  { kode: 'ubah', label: 'Ubah' },
  { kode: 'hapus', label: 'Hapus' },
]

function PermMatrixModal({ role, modules, onClose, onSaved }) {
  const [grant, setGrant] = useState({}) // "modul:aksi" -> boolean
  const [initial, setInitial] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!role) return
    setLoading(true); setError('')
    supabase.from('role_permissions').select('modul, aksi').eq('role_id', role.id).then(({ data }) => {
      const g = {}
      for (const row of (data || [])) g[`${row.modul}:${row.aksi}`] = true
      setGrant(g); setInitial(g); setLoading(false)
    })
  }, [role])

  if (!role) return null

  const toggle = (key) => setGrant((s) => ({ ...s, [key]: !s[key] }))
  const setModulRow = (modul, val) => setGrant((s) => {
    const next = { ...s }
    for (const a of AKSI_LIST) next[`${modul}:${a.kode}`] = val
    return next
  })

  const handleSave = async () => {
    setSaving(true); setError('')
    const toAdd = []
    const toDel = []
    for (const m of modules) {
      for (const a of AKSI_LIST) {
        const key = `${m.kode}:${a.kode}`
        const now = !!grant[key]
        const was = !!initial[key]
        if (now && !was) toAdd.push({ role_id: role.id, modul: m.kode, aksi: a.kode })
        if (!now && was) toDel.push({ modul: m.kode, aksi: a.kode })
      }
    }
    if (toAdd.length) {
      const { error: err } = await supabase.from('role_permissions').insert(toAdd)
      if (err) { setSaving(false); setError(err.message); return }
    }
    for (const d of toDel) {
      const { error: err } = await supabase.from('role_permissions').delete().eq('role_id', role.id).eq('modul', d.modul).eq('aksi', d.aksi)
      if (err) { setSaving(false); setError(err.message); return }
    }
    setSaving(false)
    onSaved()
  }

  // Kelompokkan modul per area untuk keterbacaan.
  const byArea = {}
  for (const m of modules) (byArea[m.area] ||= []).push(m)

  return (
    <Modal open={!!role} onClose={onClose} title={`Izin per Modul — ${role.nama}`} width="max-w-3xl">
      {loading ? <FullPageSpinner /> : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-[var(--color-ink-soft)]">
            Centang aksi yang diizinkan untuk peran ini per modul. Izin ini ditegakkan di aplikasi dan (bertahap) di database.
            Lingkup data (unit sendiri vs seluruh yayasan) tetap mengikuti Tingkat Akses peran.
          </p>
          <div className="max-h-[55vh] overflow-y-auto">
            {Object.entries(byArea).map(([area, mods]) => (
              <div key={area} className="mb-4">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">{area}</p>
                <Table columns={['Modul', ...AKSI_LIST.map((a) => a.label), 'Semua']}>
                  {mods.map((m) => {
                    const allOn = AKSI_LIST.every((a) => grant[`${m.kode}:${a.kode}`])
                    return (
                      <Tr key={m.kode}>
                        <Td className="font-medium">{m.nama}</Td>
                        {AKSI_LIST.map((a) => (
                          <Td key={a.kode}>
                            <input
                              type="checkbox"
                              checked={!!grant[`${m.kode}:${a.kode}`]}
                              onChange={() => toggle(`${m.kode}:${a.kode}`)}
                              className="h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-navy)] focus:ring-[var(--color-navy)]"
                            />
                          </Td>
                        ))}
                        <Td>
                          <input
                            type="checkbox"
                            checked={allOn}
                            onChange={() => setModulRow(m.kode, !allOn)}
                            className="h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-navy)] focus:ring-[var(--color-navy)]"
                          />
                        </Td>
                      </Tr>
                    )
                  })}
                </Table>
              </div>
            ))}
          </div>
          {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
            <Button type="button" onClick={handleSave} disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan Izin'}</Button>
          </div>
        </div>
      )}
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
