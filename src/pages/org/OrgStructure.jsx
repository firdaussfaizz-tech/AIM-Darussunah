import { useEffect, useState, useCallback } from 'react'
import { Building2, Plus, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { PageHeader, Card, SectionCard, Button, Table, Tr, Td, Modal, Input, Select, EmptyState, FullPageSpinner } from '../../components/ui'

const TABS = ['Unit Sekolah', 'Unit Kerja', 'Jabatan']

export default function OrgStructure() {
  const [tab, setTab] = useState('Unit Sekolah')
  const [schools, setSchools] = useState([])
  const [departments, setDepartments] = useState([])
  const [positions, setPositions] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: s }, { data: d }, { data: p }] = await Promise.all([
      supabase.from('schools').select('*').order('jenjang'),
      supabase.from('departments').select('*, schools(nama, jenjang)').order('nama'),
      supabase.from('positions').select('*, departments(nama)').order('nama'),
    ])
    setSchools(s || [])
    setDepartments(d || [])
    setPositions(p || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div>
      <PageHeader title="Struktur Organisasi" description="Kelola unit sekolah, unit kerja, dan jabatan di seluruh yayasan." />
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

      {loading ? <FullPageSpinner /> : (
        <>
          {tab === 'Unit Sekolah' && <SchoolsTab schools={schools} reload={load} />}
          {tab === 'Unit Kerja' && <DepartmentsTab departments={departments} schools={schools} reload={load} />}
          {tab === 'Jabatan' && <PositionsTab positions={positions} departments={departments} reload={load} />}
        </>
      )}
    </div>
  )
}

const emptySchoolForm = { jenjang: 'SD', nama: '', npsn: '', alamat: '', telepon: '', email: '' }

function SchoolsTab({ schools, reload }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptySchoolForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const openAdd = () => { setEditingId(null); setForm(emptySchoolForm); setError(''); setModalOpen(true) }
  const openEdit = (s) => {
    setEditingId(s.id)
    setForm({ jenjang: s.jenjang, nama: s.nama || '', npsn: s.npsn || '', alamat: s.alamat || '', telepon: s.telepon || '', email: s.email || '' })
    setError('')
    setModalOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    const query = editingId ? supabase.from('schools').update(form).eq('id', editingId) : supabase.from('schools').insert(form)
    const { error: err } = await query
    setSaving(false)
    if (err) { setError(err.message); return }
    setModalOpen(false)
    reload()
  }

  const handleDelete = async (id) => {
    if (!confirm('Hapus unit sekolah ini? Pastikan tidak ada pegawai yang masih terhubung.')) return
    const { error } = await supabase.from('schools').delete().eq('id', id)
    if (error) alert('Gagal menghapus: ' + error.message)
    reload()
  }

  return (
    <SectionCard title="Unit Sekolah" actions={<Button size="sm" variant="outline" onClick={openAdd}><Plus className="h-4 w-4" /> Tambah</Button>}>
      {schools.length === 0 ? <EmptyState icon={Building2} title="Belum ada unit sekolah" /> : (
        <Table columns={['Jenjang', 'Nama Sekolah', 'NPSN', 'Alamat', '']}>
          {schools.map((s) => (
            <Tr key={s.id}>
              <Td className="font-medium">{s.jenjang}</Td>
              <Td>{s.nama}</Td>
              <Td className="text-[var(--color-ink-soft)]">{s.npsn || '—'}</Td>
              <Td className="text-[var(--color-ink-soft)]">{s.alamat || '—'}</Td>
              <Td className="text-right">
                <div className="flex justify-end gap-2">
                  <button onClick={() => openEdit(s)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Ubah"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => handleDelete(s.id)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus"><Trash2 className="h-4 w-4" /></button>
                </div>
              </Td>
            </Tr>
          ))}
        </Table>
      )}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Ubah Unit Sekolah' : 'Tambah Unit Sekolah'}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Select label="Jenjang" value={form.jenjang} onChange={(e) => setForm((s) => ({ ...s, jenjang: e.target.value }))}>
            <option value="SD">SD</option><option value="SMP">SMP</option><option value="SMA">SMA</option>
          </Select>
          <Input label="Nama Sekolah" required value={form.nama} onChange={(e) => setForm((s) => ({ ...s, nama: e.target.value }))} />
          <Input label="NPSN" value={form.npsn} onChange={(e) => setForm((s) => ({ ...s, npsn: e.target.value }))} />
          <Input label="Alamat" value={form.alamat} onChange={(e) => setForm((s) => ({ ...s, alamat: e.target.value }))} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Telepon" value={form.telepon} onChange={(e) => setForm((s) => ({ ...s, telepon: e.target.value }))} />
            <Input label="Email" type="email" value={form.email} onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))} />
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

const emptyDeptForm = { nama: '', school_id: '' }

function DepartmentsTab({ departments, schools, reload }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyDeptForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const openAdd = () => { setEditingId(null); setForm(emptyDeptForm); setError(''); setModalOpen(true) }
  const openEdit = (d) => { setEditingId(d.id); setForm({ nama: d.nama || '', school_id: d.school_id || '' }); setError(''); setModalOpen(true) }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    const payload = { nama: form.nama, school_id: form.school_id || null }
    const query = editingId ? supabase.from('departments').update(payload).eq('id', editingId) : supabase.from('departments').insert(payload)
    const { error: err } = await query
    setSaving(false)
    if (err) { setError(err.message); return }
    setModalOpen(false)
    reload()
  }

  const handleDelete = async (id) => {
    if (!confirm('Hapus unit kerja ini?')) return
    await supabase.from('departments').delete().eq('id', id)
    reload()
  }

  return (
    <SectionCard title="Unit Kerja" description="Departemen/unit di tingkat yayasan pusat atau per sekolah" actions={<Button size="sm" variant="outline" onClick={openAdd}><Plus className="h-4 w-4" /> Tambah</Button>}>
      {departments.length === 0 ? <EmptyState icon={Building2} title="Belum ada unit kerja" /> : (
        <Table columns={['Nama Unit', 'Ditempatkan Di', '']}>
          {departments.map((d) => (
            <Tr key={d.id}>
              <Td className="font-medium">{d.nama}</Td>
              <Td className="text-[var(--color-ink-soft)]">{d.schools ? `${d.schools.jenjang} — ${d.schools.nama}` : 'Kantor Yayasan Pusat'}</Td>
              <Td className="text-right">
                <div className="flex justify-end gap-2">
                  <button onClick={() => openEdit(d)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Ubah"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => handleDelete(d.id)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus"><Trash2 className="h-4 w-4" /></button>
                </div>
              </Td>
            </Tr>
          ))}
        </Table>
      )}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Ubah Unit Kerja' : 'Tambah Unit Kerja'}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input label="Nama Unit Kerja" required value={form.nama} onChange={(e) => setForm((s) => ({ ...s, nama: e.target.value }))} placeholder="Tata Usaha, Kurikulum, dll." />
          <Select label="Ditempatkan Di" value={form.school_id} onChange={(e) => setForm((s) => ({ ...s, school_id: e.target.value }))}>
            <option value="">— Kantor Yayasan Pusat —</option>
            {schools.map((s) => <option key={s.id} value={s.id}>{s.jenjang} — {s.nama}</option>)}
          </Select>
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

const emptyPositionForm = { nama: '', department_id: '', jenis: 'struktural' }

function PositionsTab({ positions, departments, reload }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyPositionForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const openAdd = () => { setEditingId(null); setForm(emptyPositionForm); setError(''); setModalOpen(true) }
  const openEdit = (p) => { setEditingId(p.id); setForm({ nama: p.nama || '', department_id: p.department_id || '', jenis: p.jenis || 'struktural' }); setError(''); setModalOpen(true) }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    const payload = { nama: form.nama, department_id: form.department_id || null, jenis: form.jenis }
    const query = editingId ? supabase.from('positions').update(payload).eq('id', editingId) : supabase.from('positions').insert(payload)
    const { error: err } = await query
    setSaving(false)
    if (err) { setError(err.message); return }
    setModalOpen(false)
    reload()
  }

  const handleDelete = async (id) => {
    if (!confirm('Hapus jabatan ini?')) return
    await supabase.from('positions').delete().eq('id', id)
    reload()
  }

  return (
    <SectionCard title="Jabatan" actions={<Button size="sm" variant="outline" onClick={openAdd}><Plus className="h-4 w-4" /> Tambah</Button>}>
      {positions.length === 0 ? <EmptyState icon={Building2} title="Belum ada jabatan" /> : (
        <Table columns={['Nama Jabatan', 'Jenis', 'Unit Kerja', '']}>
          {positions.map((p) => (
            <Tr key={p.id}>
              <Td className="font-medium">{p.nama}</Td>
              <Td className="capitalize text-[var(--color-ink-soft)]">{p.jenis.replace('_', ' ')}</Td>
              <Td className="text-[var(--color-ink-soft)]">{p.departments?.nama || '—'}</Td>
              <Td className="text-right">
                <div className="flex justify-end gap-2">
                  <button onClick={() => openEdit(p)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Ubah"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => handleDelete(p.id)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus"><Trash2 className="h-4 w-4" /></button>
                </div>
              </Td>
            </Tr>
          ))}
        </Table>
      )}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Ubah Jabatan' : 'Tambah Jabatan'}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input label="Nama Jabatan" required value={form.nama} onChange={(e) => setForm((s) => ({ ...s, nama: e.target.value }))} />
          <Select label="Jenis" value={form.jenis} onChange={(e) => setForm((s) => ({ ...s, jenis: e.target.value }))}>
            <option value="struktural">Struktural</option>
            <option value="guru">Guru</option>
            <option value="tenaga_kependidikan">Tenaga Kependidikan</option>
          </Select>
          <Select label="Unit Kerja (opsional)" value={form.department_id} onChange={(e) => setForm((s) => ({ ...s, department_id: e.target.value }))}>
            <option value="">— Tidak terikat unit —</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.nama}</option>)}
          </Select>
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
