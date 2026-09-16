import { useEffect, useState, useCallback } from 'react'
import { Building2, Plus, Trash2 } from 'lucide-react'
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

function SchoolsTab({ schools, reload }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ jenjang: 'SD', nama: '', npsn: '', alamat: '', telepon: '', email: '' })
  const [saving, setSaving] = useState(false)

  const openModal = () => { setForm({ jenjang: 'SD', nama: '', npsn: '', alamat: '', telepon: '', email: '' }); setModalOpen(true) }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    await supabase.from('schools').insert(form)
    setSaving(false)
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
    <SectionCard title="Unit Sekolah" actions={<Button size="sm" variant="outline" onClick={openModal}><Plus className="h-4 w-4" /> Tambah</Button>}>
      {schools.length === 0 ? <EmptyState icon={Building2} title="Belum ada unit sekolah" /> : (
        <Table columns={['Jenjang', 'Nama Sekolah', 'NPSN', 'Alamat', '']}>
          {schools.map((s) => (
            <Tr key={s.id}>
              <Td className="font-medium">{s.jenjang}</Td>
              <Td>{s.nama}</Td>
              <Td className="text-[var(--color-ink-soft)]">{s.npsn || '—'}</Td>
              <Td className="text-[var(--color-ink-soft)]">{s.alamat || '—'}</Td>
              <Td className="text-right">
                <button onClick={() => handleDelete(s.id)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]"><Trash2 className="h-4 w-4" /></button>
              </Td>
            </Tr>
          ))}
        </Table>
      )}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Tambah Unit Sekolah">
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
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button>
          </div>
        </form>
      </Modal>
    </SectionCard>
  )
}

function DepartmentsTab({ departments, schools, reload }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ nama: '', school_id: '' })
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    await supabase.from('departments').insert({ nama: form.nama, school_id: form.school_id || null })
    setSaving(false)
    setModalOpen(false)
    reload()
  }

  const handleDelete = async (id) => {
    if (!confirm('Hapus unit kerja ini?')) return
    await supabase.from('departments').delete().eq('id', id)
    reload()
  }

  return (
    <SectionCard title="Unit Kerja" description="Departemen/unit di tingkat yayasan pusat atau per sekolah" actions={<Button size="sm" variant="outline" onClick={() => { setForm({ nama: '', school_id: '' }); setModalOpen(true) }}><Plus className="h-4 w-4" /> Tambah</Button>}>
      {departments.length === 0 ? <EmptyState icon={Building2} title="Belum ada unit kerja" /> : (
        <Table columns={['Nama Unit', 'Ditempatkan Di', '']}>
          {departments.map((d) => (
            <Tr key={d.id}>
              <Td className="font-medium">{d.nama}</Td>
              <Td className="text-[var(--color-ink-soft)]">{d.schools ? `${d.schools.jenjang} — ${d.schools.nama}` : 'Kantor Yayasan Pusat'}</Td>
              <Td className="text-right">
                <button onClick={() => handleDelete(d.id)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]"><Trash2 className="h-4 w-4" /></button>
              </Td>
            </Tr>
          ))}
        </Table>
      )}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Tambah Unit Kerja">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input label="Nama Unit Kerja" required value={form.nama} onChange={(e) => setForm((s) => ({ ...s, nama: e.target.value }))} placeholder="Tata Usaha, Kurikulum, dll." />
          <Select label="Ditempatkan Di" value={form.school_id} onChange={(e) => setForm((s) => ({ ...s, school_id: e.target.value }))}>
            <option value="">— Kantor Yayasan Pusat —</option>
            {schools.map((s) => <option key={s.id} value={s.id}>{s.jenjang} — {s.nama}</option>)}
          </Select>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button>
          </div>
        </form>
      </Modal>
    </SectionCard>
  )
}

function PositionsTab({ positions, departments, reload }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ nama: '', department_id: '', jenis: 'struktural' })
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    await supabase.from('positions').insert({ nama: form.nama, department_id: form.department_id || null, jenis: form.jenis })
    setSaving(false)
    setModalOpen(false)
    reload()
  }

  const handleDelete = async (id) => {
    if (!confirm('Hapus jabatan ini?')) return
    await supabase.from('positions').delete().eq('id', id)
    reload()
  }

  return (
    <SectionCard title="Jabatan" actions={<Button size="sm" variant="outline" onClick={() => { setForm({ nama: '', department_id: '', jenis: 'struktural' }); setModalOpen(true) }}><Plus className="h-4 w-4" /> Tambah</Button>}>
      {positions.length === 0 ? <EmptyState icon={Building2} title="Belum ada jabatan" /> : (
        <Table columns={['Nama Jabatan', 'Jenis', 'Unit Kerja', '']}>
          {positions.map((p) => (
            <Tr key={p.id}>
              <Td className="font-medium">{p.nama}</Td>
              <Td className="capitalize text-[var(--color-ink-soft)]">{p.jenis.replace('_', ' ')}</Td>
              <Td className="text-[var(--color-ink-soft)]">{p.departments?.nama || '—'}</Td>
              <Td className="text-right">
                <button onClick={() => handleDelete(p.id)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]"><Trash2 className="h-4 w-4" /></button>
              </Td>
            </Tr>
          ))}
        </Table>
      )}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Tambah Jabatan">
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
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button>
          </div>
        </form>
      </Modal>
    </SectionCard>
  )
}
