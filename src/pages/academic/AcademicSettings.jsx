import { useEffect, useState, useCallback } from 'react'
import { CalendarRange, Plus, Pencil, Trash2, Users2, CheckCircle2, School } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, SectionCard, Button, Badge, Table, Tr, Td, Modal, Input, Select, EmptyState, FullPageSpinner } from '../../components/ui'

const TABS = ['Tahun Ajaran', 'Rombel / Kelas']

export default function AcademicSettings() {
  const { isManager, hasFullAccess, loading: authLoading } = useAuth()
  const [tab, setTab] = useState('Tahun Ajaran')
  const [tahunAjaran, setTahunAjaran] = useState([])
  const [schools, setSchools] = useState([])
  const [employees, setEmployees] = useState([])
  const [rombel, setRombel] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: ta }, { data: s }, { data: emp }, { data: r }, { data: enrollments }] = await Promise.all([
      supabase.from('tahun_ajaran').select('*').order('nama', { ascending: false }),
      supabase.from('schools').select('id, nama, jenjang').order('jenjang'),
      supabase.from('employees').select('id, nama').eq('status', 'aktif').order('nama'),
      supabase
        .from('rombel')
        .select('*, schools!school_id(nama, jenjang), tahun_ajaran(nama), employees!wali_kelas_employee_id(nama)')
        .order('tingkat'),
      // Jumlah siswa per rombel dihitung di sisi klien (bukan lewat embed
      // `relation(count)` PostgREST) supaya tidak bergantung pada fitur
      // agregat PostgREST yang belum tentu aktif di semua proyek Supabase.
      supabase.from('riwayat_siswa').select('rombel_id'),
    ])
    const jumlahPerRombel = {}
    for (const e of enrollments || []) {
      jumlahPerRombel[e.rombel_id] = (jumlahPerRombel[e.rombel_id] || 0) + 1
    }
    setTahunAjaran(ta || [])
    setSchools(s || [])
    setEmployees(emp || [])
    setRombel((r || []).map((row) => ({ ...row, jumlah_siswa: jumlahPerRombel[row.id] || 0 })))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  if (authLoading || loading) return <FullPageSpinner />

  if (!isManager) {
    return (
      <EmptyState
        icon={CalendarRange}
        title="Halaman ini belum tersedia"
        description="Halaman ini hanya dapat diakses oleh Admin Yayasan, HR, Admin Sekolah, atau Kepala Sekolah."
      />
    )
  }

  return (
    <div>
      <PageHeader title="Kelas & Tahun Ajaran" description="Kelola tahun ajaran dan rombongan belajar (rombel) di seluruh unit yayasan." />
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-[var(--color-border)]">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              tab === t ? 'border-[var(--color-navy)] text-[var(--color-navy)]' : 'border-transparent text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Tahun Ajaran' && <TahunAjaranTab tahunAjaran={tahunAjaran} reload={load} hasFullAccess={hasFullAccess} />}
      {tab === 'Rombel / Kelas' && (
        <RombelTab rombel={rombel} schools={schools} employees={employees} tahunAjaran={tahunAjaran} reload={load} />
      )}
    </div>
  )
}

// =========================================================================
// TAB: TAHUN AJARAN
// =========================================================================
const emptyTAForm = { nama: '', tanggal_mulai: '', tanggal_selesai: '' }

function TahunAjaranTab({ tahunAjaran, reload, hasFullAccess }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyTAForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const openAdd = () => { setEditingId(null); setForm(emptyTAForm); setError(''); setModalOpen(true) }
  const openEdit = (t) => {
    setEditingId(t.id)
    setForm({ nama: t.nama, tanggal_mulai: t.tanggal_mulai || '', tanggal_selesai: t.tanggal_selesai || '' })
    setError('')
    setModalOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    const payload = {
      nama: form.nama,
      tanggal_mulai: form.tanggal_mulai || null,
      tanggal_selesai: form.tanggal_selesai || null,
    }
    const query = editingId ? supabase.from('tahun_ajaran').update(payload).eq('id', editingId) : supabase.from('tahun_ajaran').insert(payload)
    const { error: err } = await query
    setSaving(false)
    if (err) { setError(err.message.includes('duplicate') ? 'Tahun ajaran ini sudah ada.' : err.message); return }
    setModalOpen(false)
    reload()
  }

  // Hanya boleh satu tahun ajaran aktif: nonaktifkan semua dulu, baru
  // aktifkan yang dipilih (dua langkah, bukan satu transaksi database —
  // cukup aman untuk aksi admin yang jarang dan tidak konkuren).
  const handleActivate = async (id) => {
    if (!confirm('Jadikan tahun ajaran ini yang aktif? Tahun ajaran lain akan otomatis menjadi tidak aktif.')) return
    const { error: err1 } = await supabase.from('tahun_ajaran').update({ status: 'tidak_aktif' }).eq('status', 'aktif')
    if (err1) { alert('Gagal menonaktifkan tahun ajaran sebelumnya: ' + err1.message); return }
    const { error: err2 } = await supabase.from('tahun_ajaran').update({ status: 'aktif' }).eq('id', id)
    if (err2) { alert('Gagal mengaktifkan: ' + err2.message); return }
    reload()
  }

  const handleDelete = async (t) => {
    const { count } = await supabase.from('rombel').select('id', { count: 'exact', head: true }).eq('tahun_ajaran_id', t.id)
    if (count > 0) { alert(`Tidak bisa dihapus — masih ada ${count} rombel yang memakai tahun ajaran ini.`); return }
    if (!confirm(`Hapus tahun ajaran "${t.nama}"?`)) return
    const { error } = await supabase.from('tahun_ajaran').delete().eq('id', t.id)
    if (error) { alert('Gagal menghapus: ' + error.message); return }
    reload()
  }

  return (
    <SectionCard
      title="Tahun Ajaran"
      description={
        hasFullAccess
          ? 'Hanya satu tahun ajaran yang bisa berstatus aktif pada satu waktu.'
          : 'Hanya satu tahun ajaran yang bisa berstatus aktif pada satu waktu. Perubahan hanya dapat dilakukan oleh Admin Yayasan/HR.'
      }
      actions={hasFullAccess && <Button size="sm" variant="outline" onClick={openAdd}><Plus className="h-4 w-4" /> Tambah</Button>}
    >
      {tahunAjaran.length === 0 ? <EmptyState icon={CalendarRange} title="Belum ada tahun ajaran" /> : (
        <Table columns={hasFullAccess ? ['Nama', 'Mulai', 'Selesai', 'Status', ''] : ['Nama', 'Mulai', 'Selesai', 'Status']}>
          {tahunAjaran.map((t) => (
            <Tr key={t.id}>
              <Td className="font-medium">{t.nama}</Td>
              <Td className="text-[var(--color-ink-soft)]">{t.tanggal_mulai || '—'}</Td>
              <Td className="text-[var(--color-ink-soft)]">{t.tanggal_selesai || '—'}</Td>
              <Td>
                {t.status === 'aktif' ? <Badge color="success">Aktif</Badge> : <Badge color="neutral">Tidak Aktif</Badge>}
              </Td>
              {hasFullAccess && (
                <Td className="text-right">
                  <div className="flex justify-end gap-2">
                    {t.status !== 'aktif' && (
                      <button onClick={() => handleActivate(t.id)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-success)]" aria-label="Jadikan Aktif" title="Jadikan Aktif">
                        <CheckCircle2 className="h-4 w-4" />
                      </button>
                    )}
                    <button onClick={() => openEdit(t)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Ubah"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => handleDelete(t)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </Td>
              )}
            </Tr>
          ))}
        </Table>
      )}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Ubah Tahun Ajaran' : 'Tambah Tahun Ajaran'}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input label="Nama" required placeholder="2026/2027" value={form.nama} onChange={(e) => setForm((s) => ({ ...s, nama: e.target.value }))} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Tanggal Mulai" type="date" value={form.tanggal_mulai} onChange={(e) => setForm((s) => ({ ...s, tanggal_mulai: e.target.value }))} />
            <Input label="Tanggal Selesai" type="date" value={form.tanggal_selesai} onChange={(e) => setForm((s) => ({ ...s, tanggal_selesai: e.target.value }))} />
          </div>
          {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button>
          </div>
        </form>
      </Modal>
    </SectionCard>
  )
}

// =========================================================================
// TAB: ROMBEL / KELAS
// =========================================================================
const emptyRombelForm = { school_id: '', tahun_ajaran_id: '', tingkat: '', nama_rombel: '', wali_kelas_employee_id: '', kapasitas: '' }

function RombelTab({ rombel, schools, employees, tahunAjaran, reload }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyRombelForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [rosterRombel, setRosterRombel] = useState(null)

  const tahunAktif = tahunAjaran.find((t) => t.status === 'aktif')

  const openAdd = () => {
    setEditingId(null)
    setForm({ ...emptyRombelForm, tahun_ajaran_id: tahunAktif?.id || '' })
    setError('')
    setModalOpen(true)
  }
  const openEdit = (r) => {
    setEditingId(r.id)
    setForm({
      school_id: r.school_id, tahun_ajaran_id: r.tahun_ajaran_id, tingkat: r.tingkat || '',
      nama_rombel: r.nama_rombel || '', wali_kelas_employee_id: r.wali_kelas_employee_id || '', kapasitas: r.kapasitas ?? '',
    })
    setError('')
    setModalOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    const payload = {
      school_id: form.school_id, tahun_ajaran_id: form.tahun_ajaran_id, tingkat: form.tingkat, nama_rombel: form.nama_rombel,
      wali_kelas_employee_id: form.wali_kelas_employee_id || null,
      kapasitas: form.kapasitas === '' ? null : Number(form.kapasitas),
    }
    const query = editingId ? supabase.from('rombel').update(payload).eq('id', editingId) : supabase.from('rombel').insert(payload)
    const { error: err } = await query
    setSaving(false)
    if (err) { setError(err.message.includes('duplicate') ? 'Nama rombel ini sudah ada di unit sekolah & tahun ajaran yang sama.' : err.message); return }
    setModalOpen(false)
    reload()
  }

  const handleDelete = async (r) => {
    if (!confirm(`Hapus rombel "${r.nama_rombel}"? Riwayat penempatan siswa di rombel ini akan ikut terhapus.`)) return
    const { error } = await supabase.from('rombel').delete().eq('id', r.id)
    if (error) { alert('Gagal menghapus: ' + error.message); return }
    reload()
  }

  return (
    <SectionCard
      title="Rombongan Belajar (Rombel)"
      description={tahunAktif ? `Menampilkan seluruh rombel — tahun ajaran aktif saat ini: ${tahunAktif.nama}` : 'Belum ada tahun ajaran aktif — atur di tab Tahun Ajaran.'}
      actions={<Button size="sm" variant="outline" onClick={openAdd} disabled={!tahunAktif}><Plus className="h-4 w-4" /> Tambah Rombel</Button>}
    >
      {rombel.length === 0 ? <EmptyState icon={School} title="Belum ada rombel" /> : (
        <Table columns={['Tahun Ajaran', 'Unit', 'Tingkat', 'Nama Rombel', 'Wali Kelas', 'Jumlah Siswa', '']}>
          {rombel.map((r) => (
            <Tr key={r.id}>
              <Td className="text-[var(--color-ink-soft)]">{r.tahun_ajaran?.nama || '—'}</Td>
              <Td>{r.schools ? `${r.schools.jenjang} — ${r.schools.nama}` : '—'}</Td>
              <Td>{r.tingkat}</Td>
              <Td className="font-medium">{r.nama_rombel}</Td>
              <Td className="text-[var(--color-ink-soft)]">{r.employees?.nama || '—'}</Td>
              <Td>{r.jumlah_siswa}{r.kapasitas ? ` / ${r.kapasitas}` : ''}</Td>
              <Td className="text-right">
                <div className="flex justify-end gap-2">
                  <button onClick={() => setRosterRombel(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Kelola Siswa" title="Kelola Siswa">
                    <Users2 className="h-4 w-4" />
                  </button>
                  <button onClick={() => openEdit(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Ubah"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => handleDelete(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus"><Trash2 className="h-4 w-4" /></button>
                </div>
              </Td>
            </Tr>
          ))}
        </Table>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Ubah Rombel' : 'Tambah Rombel'}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Select label="Tahun Ajaran" required value={form.tahun_ajaran_id} onChange={(e) => setForm((s) => ({ ...s, tahun_ajaran_id: e.target.value }))}>
            <option value="">— Pilih —</option>
            {tahunAjaran.map((t) => <option key={t.id} value={t.id}>{t.nama}{t.status === 'aktif' ? ' (Aktif)' : ''}</option>)}
          </Select>
          <Select label="Unit Sekolah" required value={form.school_id} onChange={(e) => setForm((s) => ({ ...s, school_id: e.target.value }))}>
            <option value="">— Pilih —</option>
            {schools.map((s) => <option key={s.id} value={s.id}>{s.jenjang} — {s.nama}</option>)}
          </Select>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Tingkat" required placeholder="1, 7, 10, dst." value={form.tingkat} onChange={(e) => setForm((s) => ({ ...s, tingkat: e.target.value }))} />
            <Input label="Nama Rombel" required placeholder="1A, VII-B, X IPA 1" value={form.nama_rombel} onChange={(e) => setForm((s) => ({ ...s, nama_rombel: e.target.value }))} />
          </div>
          <Select label="Wali Kelas" value={form.wali_kelas_employee_id} onChange={(e) => setForm((s) => ({ ...s, wali_kelas_employee_id: e.target.value }))}>
            <option value="">— Belum ditentukan —</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.nama}</option>)}
          </Select>
          <Input label="Kapasitas (opsional)" type="number" min="1" value={form.kapasitas} onChange={(e) => setForm((s) => ({ ...s, kapasitas: e.target.value }))} />
          {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button>
          </div>
        </form>
      </Modal>

      {rosterRombel && (
        <RosterModal
          rombel={rosterRombel}
          onClose={() => setRosterRombel(null)}
          onSaved={() => { setRosterRombel(null); reload() }}
        />
      )}
    </SectionCard>
  )
}

// Modal "Kelola Siswa" — centang siswa dari unit sekolah yang sama untuk
// ditempatkan ke rombel ini pada tahun ajaran rombel tsb. Siswa yang sudah
// tercatat di rombel LAIN pada tahun ajaran yang sama akan otomatis
// dipindahkan (bukan digandakan) kalau ikut dicentang.
function RosterModal({ rombel, onClose, onSaved }) {
  const [siswaSekolah, setSiswaSekolah] = useState([])
  const [enrollmentMap, setEnrollmentMap] = useState({}) // siswa_id -> { rombel_id, sama_rombel }
  const [selectedIds, setSelectedIds] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [{ data: siswa }, { data: enrollments }] = await Promise.all([
        supabase.from('siswa').select('id, nama_lengkap, nis').eq('school_id', rombel.school_id).eq('status', 'aktif').order('nama_lengkap'),
        supabase.from('riwayat_siswa').select('siswa_id, rombel_id').eq('tahun_ajaran_id', rombel.tahun_ajaran_id),
      ])
      setSiswaSekolah(siswa || [])
      const map = {}
      for (const e of enrollments || []) map[e.siswa_id] = e.rombel_id
      setEnrollmentMap(map)
      setSelectedIds((siswa || []).filter((s) => map[s.id] === rombel.id).map((s) => s.id))
      setLoading(false)
    }
    load()
  }, [rombel])

  const toggle = (id) => setSelectedIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  const handleSave = async () => {
    setSaving(true)
    setError('')
    const originalIds = siswaSekolah.filter((s) => enrollmentMap[s.id] === rombel.id).map((s) => s.id)
    const toRemove = originalIds.filter((id) => !selectedIds.includes(id))
    const toAdd = selectedIds.filter((id) => !originalIds.includes(id))

    if (toRemove.length) {
      const { error: err } = await supabase.from('riwayat_siswa').delete()
        .eq('tahun_ajaran_id', rombel.tahun_ajaran_id).eq('rombel_id', rombel.id).in('siswa_id', toRemove)
      if (err) { setSaving(false); setError(err.message); return }
    }
    if (toAdd.length) {
      // Lepas dulu dari rombel lain (kalau ada) di tahun ajaran yang sama,
      // supaya tidak melanggar unique(siswa_id, tahun_ajaran_id).
      const { error: delErr } = await supabase.from('riwayat_siswa').delete()
        .eq('tahun_ajaran_id', rombel.tahun_ajaran_id).in('siswa_id', toAdd)
      if (delErr) { setSaving(false); setError(delErr.message); return }
      const { error: insErr } = await supabase.from('riwayat_siswa').insert(
        toAdd.map((siswa_id) => ({
          siswa_id, rombel_id: rombel.id, tahun_ajaran_id: rombel.tahun_ajaran_id,
          status: 'aktif', tanggal_masuk: new Date().toISOString().slice(0, 10),
        }))
      )
      if (insErr) { setSaving(false); setError(insErr.message); return }
    }
    setSaving(false)
    onSaved()
  }

  return (
    <Modal open onClose={onClose} title={`Kelola Siswa — ${rombel.tingkat} ${rombel.nama_rombel}`}>
      <div className="flex flex-col gap-4">
        {loading ? (
          <p className="text-sm text-[var(--color-ink-soft)]">Memuat…</p>
        ) : siswaSekolah.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-soft)]">Belum ada siswa aktif di unit sekolah ini. Tambahkan dulu di menu Data Siswa.</p>
        ) : (
          <div className="flex max-h-96 flex-col gap-2 overflow-y-auto">
            {siswaSekolah.map((s) => {
              const currentRombelId = enrollmentMap[s.id]
              const diKelasLain = currentRombelId && currentRombelId !== rombel.id
              return (
                <label key={s.id} className="flex items-center justify-between gap-3 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm">
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(s.id)}
                      onChange={() => toggle(s.id)}
                      className="h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-navy)] focus:ring-[var(--color-navy)]"
                    />
                    {s.nama_lengkap}{s.nis ? ` (${s.nis})` : ''}
                  </span>
                  {diKelasLain && <Badge color="gold">Pindah dari kelas lain</Badge>}
                </label>
              )
            })}
          </div>
        )}
        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="button" onClick={handleSave} disabled={saving || loading}>{saving ? 'Menyimpan…' : 'Simpan'}</Button>
        </div>
      </div>
    </Modal>
  )
}
