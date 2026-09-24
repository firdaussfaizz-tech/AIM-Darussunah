import { useEffect, useState, useCallback } from 'react'
import { Building2, Plus, Pencil, Trash2, CalendarClock, Clock, ClipboardList, Star, Check, X } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { PageHeader, Card, SectionCard, Button, Badge, Table, Tr, Td, Modal, Input, Select, Textarea, EmptyState, FullPageSpinner } from '../../components/ui'
import { formatRupiah, ROLE_LABELS } from '../../lib/format'

const TABS = ['Unit Sekolah', 'Unit Kerja', 'Jabatan', 'Tugas Tambahan', 'Jenis Cuti & Izin', 'Jam Kerja', 'KPI']

export default function OrgStructure() {
  const [tab, setTab] = useState('Unit Sekolah')
  const [schools, setSchools] = useState([])
  const [departments, setDepartments] = useState([])
  const [positions, setPositions] = useState([])
  const [tugasTambahan, setTugasTambahan] = useState([])
  const [leaveTypes, setLeaveTypes] = useState([])
  const [workSchedules, setWorkSchedules] = useState([])
  const [kpiIndicators, setKpiIndicators] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: s }, { data: d }, { data: p }, { data: tt }, { data: lt }, { data: ws }, { data: kpi }] = await Promise.all([
      supabase.from('schools').select('*').order('jenjang'),
      supabase.from('departments').select('*, schools(nama, jenjang)').order('nama'),
      supabase.from('positions').select('*, departments(nama)').order('nama'),
      supabase.from('tugas_tambahan').select('*').order('nama'),
      supabase.from('leave_types').select('*').order('kategori').order('nama'),
      supabase.from('work_schedules').select('*').order('urutan'),
      supabase.from('kpi_indicators').select(`
        *,
        schools!diajukan_oleh_school_id(nama, jenjang),
        diajukan_nama:kpi_indicators_diajukan_nama,
        diputuskan_nama:kpi_indicators_diputuskan_nama
      `).order('urutan').order('nama'),
    ])
    setSchools(s || [])
    setDepartments(d || [])
    setPositions(p || [])
    setTugasTambahan(tt || [])
    setLeaveTypes(lt || [])
    setWorkSchedules(ws || [])
    setKpiIndicators(kpi || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div>
      <PageHeader title="Struktur Organisasi" description="Kelola unit sekolah, unit kerja, jabatan, dan kebijakan kepegawaian yayasan." />
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
          {tab === 'Tugas Tambahan' && <TugasTambahanTab tugasTambahan={tugasTambahan} reload={load} />}
          {tab === 'Jenis Cuti & Izin' && <LeavePolicyTab leaveTypes={leaveTypes} reload={load} />}
          {tab === 'Jam Kerja' && <WorkScheduleTab schedules={workSchedules} reload={load} />}
          {tab === 'KPI' && <KpiIndicatorsTab kpiIndicators={kpiIndicators} reload={load} />}
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
    const { count } = await supabase.from('employees').select('id', { count: 'exact', head: true }).eq('school_id', id)
    const peringatan = count > 0
      ? `${count} pegawai masih terhubung ke unit sekolah ini — penempatan unit mereka akan menjadi kosong (tidak terhapus datanya).`
      : 'Tidak ada pegawai yang terhubung ke unit sekolah ini.'
    if (!confirm(`Hapus unit sekolah ini? ${peringatan}`)) return
    const { error } = await supabase.from('schools').delete().eq('id', id)
    if (error) { alert('Gagal menghapus: ' + error.message); return }
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
            <option value="SD">SD</option><option value="SMP">SMP</option><option value="SMA">SMA</option><option value="Boarding">Boarding</option>
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

const emptyPositionForm = { nama: '', department_id: '', jenis: 'struktural', tunjangan_jenis: '', tunjangan_nominal: '', jp_ekuivalensi: '', default_role: '' }

function PositionsTab({ positions, departments, reload }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyPositionForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const openAdd = () => { setEditingId(null); setForm(emptyPositionForm); setError(''); setModalOpen(true) }
  const openEdit = (p) => {
    setEditingId(p.id)
    setForm({
      nama: p.nama || '', department_id: p.department_id || '', jenis: p.jenis || 'struktural',
      tunjangan_jenis: p.tunjangan_jenis || '', tunjangan_nominal: p.tunjangan_nominal || '',
      jp_ekuivalensi: p.jp_ekuivalensi || '', default_role: p.default_role || '',
    })
    setError('')
    setModalOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    const payload = {
      nama: form.nama, department_id: form.department_id || null, jenis: form.jenis,
      tunjangan_jenis: form.tunjangan_jenis || null,
      tunjangan_nominal: form.tunjangan_jenis ? Number(form.tunjangan_nominal) || 0 : 0,
      jp_ekuivalensi: form.tunjangan_jenis === 'struktural' ? Number(form.jp_ekuivalensi) || 0 : 0,
      default_role: form.default_role || null,
    }
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
        <Table columns={['Nama Jabatan', 'Jenis', 'Tunjangan Jabatan', 'Ekuivalensi JP', 'Unit Kerja', '']}>
          {positions.map((p) => (
            <Tr key={p.id}>
              <Td className="font-medium">{p.nama}</Td>
              <Td className="capitalize text-[var(--color-ink-soft)]">{p.jenis.replace('_', ' ')}</Td>
              <Td className="text-[var(--color-ink-soft)]">
                {p.tunjangan_jenis === 'struktural' ? (
                  <>
                    <Badge color="navy">struktural</Badge>
                    <span className="ml-1.5">{formatRupiah(p.tunjangan_nominal)}</span>
                  </>
                ) : '—'}
              </Td>
              <Td className="text-[var(--color-ink-soft)]">{p.tunjangan_jenis === 'struktural' && p.jp_ekuivalensi > 0 ? `${p.jp_ekuivalensi} JP/mg` : '—'}</Td>
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
          <div>
            <Select label="Peran Login dari Jabatan ini (opsional)" value={form.default_role} onChange={(e) => setForm((s) => ({ ...s, default_role: e.target.value }))}>
              <option value="">— Tidak memberi peran otomatis —</option>
              {Object.entries(ROLE_LABELS).map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
            </Select>
            <p className="mt-1 text-xs text-[var(--color-ink-soft)]">Dipakai tombol <strong>Sinkronkan Peran dari Jabatan</strong> di halaman Pengguna &amp; Peran untuk membuat peran login pegawai yang memangku jabatan ini. Peran unit (Admin/Kepala Sekolah, Guru) otomatis terikat ke satuan pendidikan pegawai.</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select label="Jenis Tunjangan Jabatan" value={form.tunjangan_jenis} onChange={(e) => setForm((s) => ({ ...s, tunjangan_jenis: e.target.value }))}>
              <option value="">— Tidak ada —</option>
              <option value="struktural">Struktural (Pasal 5)</option>
            </Select>
            <Input
              label="Nominal / Bulan"
              type="number" min="0"
              value={form.tunjangan_nominal}
              onChange={(e) => setForm((s) => ({ ...s, tunjangan_nominal: e.target.value }))}
              disabled={!form.tunjangan_jenis}
              placeholder="Rp"
            />
          </div>
          <Input
            label="Ekuivalensi JP/Minggu (untuk Beban Kerja)"
            type="number" min="0" step="0.5"
            value={form.jp_ekuivalensi}
            onChange={(e) => setForm((s) => ({ ...s, jp_ekuivalensi: e.target.value }))}
            disabled={form.tunjangan_jenis !== 'struktural'}
            placeholder="mis. 24 untuk Kepala Sekolah"
          />
          <p className="text-xs text-[var(--color-ink-soft)]">
            Tunjangan Jabatan diisi otomatis ke Komponen Gaji (P1) tiap pegawai yang menjabat posisi ini. Maksimal 1 tunjangan jabatan per pegawai walau merangkap &gt;1 jabatan (Pasal 5 ayat 3).
            Ekuivalensi JP dipakai HANYA untuk halaman Beban Kerja (tidak memengaruhi gaji).
            Tunjangan Fungsional (tugas tambahan seperti Wali Kelas, Sarpras, dll — bisa lebih dari satu per pegawai) dikelola di tab "Tugas Tambahan", bukan di sini.
          </p>
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

const emptyTugasTambahanForm = { nama: '', tunjangan_nominal: '', jp_ekuivalensi: '', keterangan: '' }

function TugasTambahanTab({ tugasTambahan, reload }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyTugasTambahanForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const openAdd = () => { setEditingId(null); setForm(emptyTugasTambahanForm); setError(''); setModalOpen(true) }
  const openEdit = (t) => {
    setEditingId(t.id)
    setForm({ nama: t.nama || '', tunjangan_nominal: t.tunjangan_nominal ?? '', jp_ekuivalensi: t.jp_ekuivalensi ?? '', keterangan: t.keterangan || '' })
    setError('')
    setModalOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    const payload = {
      nama: form.nama, tunjangan_nominal: Number(form.tunjangan_nominal) || 0,
      jp_ekuivalensi: Number(form.jp_ekuivalensi) || 0, keterangan: form.keterangan || null,
    }
    const query = editingId ? supabase.from('tugas_tambahan').update(payload).eq('id', editingId) : supabase.from('tugas_tambahan').insert(payload)
    const { error: err } = await query
    setSaving(false)
    if (err) { setError(err.message.includes('duplicate') ? 'Nama tugas tambahan ini sudah ada.' : err.message); return }
    setModalOpen(false)
    reload()
  }

  const handleDelete = async (id) => {
    if (!confirm('Hapus tugas tambahan ini? Penugasan pegawai yang memakainya akan ikut terhapus.')) return
    const { error } = await supabase.from('tugas_tambahan').delete().eq('id', id)
    if (error) alert('Gagal menghapus: ' + error.message)
    reload()
  }

  return (
    <SectionCard
      title="Tugas Tambahan"
      description="Tunjangan Fungsional (Pasal 6 SK 01.012) — tidak terikat Jabatan, satu pegawai bisa mengemban lebih dari satu (mis. Wali Kelas + Sarpras)."
      actions={<Button size="sm" variant="outline" onClick={openAdd}><Plus className="h-4 w-4" /> Tambah</Button>}
    >
      {tugasTambahan.length === 0 ? <EmptyState icon={ClipboardList} title="Belum ada tugas tambahan" /> : (
        <Table columns={['Nama Tugas Tambahan', 'Tunjangan/Bulan', 'Ekuivalensi JP', 'Keterangan', '']}>
          {tugasTambahan.map((t) => (
            <Tr key={t.id}>
              <Td className="font-medium">{t.nama}</Td>
              <Td>{t.tunjangan_nominal > 0 ? <Badge color="gold">{formatRupiah(t.tunjangan_nominal)}</Badge> : <span className="text-[var(--color-ink-soft)]">—</span>}</Td>
              <Td className="text-[var(--color-ink-soft)]">{t.jp_ekuivalensi > 0 ? `${t.jp_ekuivalensi} JP/mg` : '—'}</Td>
              <Td className="text-[var(--color-ink-soft)]">{t.keterangan || '—'}</Td>
              <Td className="text-right">
                <div className="flex justify-end gap-2">
                  <button onClick={() => openEdit(t)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Ubah"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => handleDelete(t.id)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus"><Trash2 className="h-4 w-4" /></button>
                </div>
              </Td>
            </Tr>
          ))}
        </Table>
      )}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Ubah Tugas Tambahan' : 'Tambah Tugas Tambahan'}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input label="Nama Tugas Tambahan" required value={form.nama} onChange={(e) => setForm((s) => ({ ...s, nama: e.target.value }))} placeholder="Wali Kelas, Sarpras, Musyrif, dll." />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Tunjangan / Bulan" type="number" min="0" value={form.tunjangan_nominal} onChange={(e) => setForm((s) => ({ ...s, tunjangan_nominal: e.target.value }))} placeholder="Rp — kosongkan jika tidak ada" />
            <Input label="Ekuivalensi JP/Minggu (Beban Kerja)" type="number" min="0" step="0.5" value={form.jp_ekuivalensi} onChange={(e) => setForm((s) => ({ ...s, jp_ekuivalensi: e.target.value }))} placeholder="mis. 2" />
          </div>
          <Input label="Keterangan (opsional)" value={form.keterangan} onChange={(e) => setForm((s) => ({ ...s, keterangan: e.target.value }))} />
          <p className="text-xs text-[var(--color-ink-soft)]">
            Tunjangan/Bulan diisi otomatis ke Komponen Gaji (P1) tiap pegawai yang mengemban tugas ini. Pegawai boleh mengemban lebih dari satu tugas tambahan sekaligus, tapi Tunjangan Fungsional yang dibayarkan hanya SATU — nominal yang paling tinggi (yang lain tetap tercatat, tidak dibayar dobel).
            Ekuivalensi JP dipakai HANYA untuk halaman Beban Kerja (tidak memengaruhi gaji) — SEMUA tugas tambahan yang diemban ikut dihitung di sana.
          </p>
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

const emptyLeaveForm = {
  kode: '', nama: '', kategori: 'cuti', satuan: 'hari', lama_default: '', jatah_per_bulan: '',
  jatah_hari_per_tahun: '', berbayar: true, perlu_dokumen: '', pasal_rujukan: '', keterangan: '',
}

function LeavePolicyTab({ leaveTypes, reload }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyLeaveForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const openAdd = () => { setEditingId(null); setForm(emptyLeaveForm); setError(''); setModalOpen(true) }
  const openEdit = (lt) => {
    setEditingId(lt.id)
    setForm({
      kode: lt.kode || '', nama: lt.nama || '', kategori: lt.kategori || 'cuti', satuan: lt.satuan || 'hari',
      lama_default: lt.lama_default ?? '', jatah_per_bulan: lt.jatah_per_bulan ?? '', jatah_hari_per_tahun: lt.jatah_hari_per_tahun ?? '',
      berbayar: lt.berbayar ?? true, perlu_dokumen: lt.perlu_dokumen || '', pasal_rujukan: lt.pasal_rujukan || '', keterangan: lt.keterangan || '',
    })
    setError('')
    setModalOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    const payload = {
      ...form,
      lama_default: form.lama_default === '' ? null : Number(form.lama_default),
      jatah_per_bulan: form.jatah_per_bulan === '' ? null : Number(form.jatah_per_bulan),
      jatah_hari_per_tahun: form.jatah_hari_per_tahun === '' ? null : Number(form.jatah_hari_per_tahun),
      perlu_dokumen: form.perlu_dokumen || null,
      pasal_rujukan: form.pasal_rujukan || null,
      keterangan: form.keterangan || null,
      kode: form.kode || null,
    }
    const query = editingId ? supabase.from('leave_types').update(payload).eq('id', editingId) : supabase.from('leave_types').insert(payload)
    const { error: err } = await query
    setSaving(false)
    if (err) { setError(err.message); return }
    setModalOpen(false)
    reload()
  }

  const handleDelete = async (id) => {
    if (!confirm('Hapus jenis cuti/izin ini? Pengajuan yang sudah ada dan memakai jenis ini bisa gagal ditampilkan.')) return
    const { error } = await supabase.from('leave_types').delete().eq('id', id)
    if (error) alert('Gagal menghapus: ' + error.message)
    reload()
  }

  const cutiRows = leaveTypes.filter((lt) => lt.kategori === 'cuti')
  const izinRows = leaveTypes.filter((lt) => lt.kategori === 'izin')

  const renderQuota = (lt) => {
    const parts = []
    if (lt.lama_default) parts.push(`${lt.lama_default} ${lt.satuan}/kejadian`)
    if (lt.jatah_per_bulan) parts.push(`maks. ${lt.jatah_per_bulan} ${lt.satuan}/bulan`)
    if (lt.jatah_hari_per_tahun) parts.push(`maks. ${lt.jatah_hari_per_tahun} hari/tahun`)
    return parts.length ? parts.join(' · ') : '—'
  }

  const renderList = (rows, emptyLabel) =>
    rows.length === 0 ? (
      <EmptyState icon={CalendarClock} title={emptyLabel} />
    ) : (
      <div className="flex flex-col divide-y divide-[var(--color-border)]">
        {rows.map((lt) => (
          <div key={lt.id} className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium text-[var(--color-ink)]">
                  {lt.kode && <span className="mr-1.5 text-[var(--color-ink-soft)]">{lt.kode}</span>}
                  {lt.nama}
                </p>
                <p className="mt-0.5 text-[13px] text-[var(--color-ink-soft)]">{renderQuota(lt)}</p>
              </div>
              <div className="flex items-center gap-1.5">
                {!lt.berbayar && <Badge color="gold">Tidak dibayar</Badge>}
                {lt.perlu_dokumen && <Badge color="navy">Perlu dokumen</Badge>}
                {lt.pasal_rujukan && <Badge color="neutral">{lt.pasal_rujukan}</Badge>}
                <button onClick={() => openEdit(lt)} className="ml-1 text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Ubah"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => handleDelete(lt.id)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
            {lt.keterangan && <p className="text-sm text-[var(--color-ink-soft)]">{lt.keterangan}</p>}
            {lt.perlu_dokumen && <p className="text-[13px] text-[var(--color-ink-soft)]">Dokumen wajib: {lt.perlu_dokumen}</p>}
          </div>
        ))}
      </div>
    )

  return (
    <div className="flex flex-col gap-6">
      <SectionCard
        title="Jenis Cuti"
        description="Mengacu pada SK Ketua YPI Darussunah No. 01.014/SK-YDC/IX/26, Bab V"
        actions={<Button size="sm" variant="outline" onClick={openAdd}><Plus className="h-4 w-4" /> Tambah</Button>}
      >
        {renderList(cutiRows, 'Belum ada jenis cuti')}
      </SectionCard>

      <SectionCard title="Jenis Izin" description="Bab IV — kewenangan persetujuan tetap mengikuti Kepala Sekolah/Mudir">
        {renderList(izinRows, 'Belum ada jenis izin')}
      </SectionCard>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Ubah Jenis Cuti/Izin' : 'Tambah Jenis Cuti/Izin'} width="max-w-xl">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-4">
            <Input label="Kode" containerClassName="col-span-1" value={form.kode} onChange={(e) => setForm((s) => ({ ...s, kode: e.target.value }))} placeholder="CT" />
            <Input label="Nama" required containerClassName="col-span-2" value={form.nama} onChange={(e) => setForm((s) => ({ ...s, nama: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select label="Kategori" value={form.kategori} onChange={(e) => setForm((s) => ({ ...s, kategori: e.target.value }))}>
              <option value="cuti">Cuti</option>
              <option value="izin">Izin</option>
            </Select>
            <Select label="Satuan" value={form.satuan} onChange={(e) => setForm((s) => ({ ...s, satuan: e.target.value }))}>
              <option value="hari">Hari</option>
              <option value="jam">Jam</option>
              <option value="bulan">Bulan</option>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Input label="Lama per kejadian" type="number" step="0.5" value={form.lama_default} onChange={(e) => setForm((s) => ({ ...s, lama_default: e.target.value }))} />
            <Input label="Jatah / bulan" type="number" step="0.5" value={form.jatah_per_bulan} onChange={(e) => setForm((s) => ({ ...s, jatah_per_bulan: e.target.value }))} />
            <Input label="Jatah / tahun" type="number" step="0.5" value={form.jatah_hari_per_tahun} onChange={(e) => setForm((s) => ({ ...s, jatah_hari_per_tahun: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select label="Berbayar" value={form.berbayar ? 'ya' : 'tidak'} onChange={(e) => setForm((s) => ({ ...s, berbayar: e.target.value === 'ya' }))}>
              <option value="ya">Ya, penghasilan penuh/sesuai aturan</option>
              <option value="tidak">Tidak dibayar</option>
            </Select>
            <Input label="Rujukan Pasal" value={form.pasal_rujukan} onChange={(e) => setForm((s) => ({ ...s, pasal_rujukan: e.target.value }))} placeholder="Pasal 16" />
          </div>
          <Input label="Dokumen Wajib (jika ada)" value={form.perlu_dokumen} onChange={(e) => setForm((s) => ({ ...s, perlu_dokumen: e.target.value }))} placeholder="Surat Keterangan Dokter" />
          <Textarea label="Keterangan / Ketentuan" rows={4} value={form.keterangan} onChange={(e) => setForm((s) => ({ ...s, keterangan: e.target.value }))} />
          {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

const emptyScheduleForm = { hari: '', urutan: 1, jam_masuk: '', jam_pulang: '', istirahat: '', jam_efektif: '', keterangan: '' }

function WorkScheduleTab({ schedules, reload }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyScheduleForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const openAdd = () => {
    setEditingId(null)
    setForm({ ...emptyScheduleForm, urutan: schedules.length + 1 })
    setError('')
    setModalOpen(true)
  }
  const openEdit = (ws) => {
    setEditingId(ws.id)
    setForm({
      hari: ws.hari || '', urutan: ws.urutan || 1, jam_masuk: ws.jam_masuk || '', jam_pulang: ws.jam_pulang || '',
      istirahat: ws.istirahat || '', jam_efektif: ws.jam_efektif ?? '', keterangan: ws.keterangan || '',
    })
    setError('')
    setModalOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    const payload = { ...form, urutan: Number(form.urutan), jam_efektif: form.jam_efektif === '' ? null : Number(form.jam_efektif) }
    const query = editingId ? supabase.from('work_schedules').update(payload).eq('id', editingId) : supabase.from('work_schedules').insert(payload)
    const { error: err } = await query
    setSaving(false)
    if (err) { setError(err.message); return }
    setModalOpen(false)
    reload()
  }

  const handleDelete = async (id) => {
    if (!confirm('Hapus baris jam kerja ini?')) return
    await supabase.from('work_schedules').delete().eq('id', id)
    reload()
  }

  const totalJamEfektif = schedules.reduce((sum, s) => sum + Number(s.jam_efektif || 0), 0)

  return (
    <div className="flex flex-col gap-4">
      <SectionCard
        title="Jam Kerja Mingguan — Pegawai Reguler"
        description="Mengacu pada SK Ketua YPI Darussunah No. 01.014/SK-YDC/IX/26, Pasal 4"
        actions={<Button size="sm" variant="outline" onClick={openAdd}><Plus className="h-4 w-4" /> Tambah Baris</Button>}
      >
        {schedules.length === 0 ? (
          <EmptyState icon={Clock} title="Belum ada data jam kerja" />
        ) : (
          <>
            <Table columns={['Hari', 'Jam Kerja', 'Istirahat', 'Jam Efektif', 'Keterangan', '']}>
              {schedules.map((ws) => (
                <Tr key={ws.id}>
                  <Td className="font-medium">{ws.hari}</Td>
                  <Td>{ws.jam_masuk && ws.jam_pulang ? `${ws.jam_masuk.slice(0, 5)} – ${ws.jam_pulang.slice(0, 5)}` : '—'}</Td>
                  <Td className="text-[var(--color-ink-soft)]">{ws.istirahat || '—'}</Td>
                  <Td>{ws.jam_efektif ? `${ws.jam_efektif} jam` : '—'}</Td>
                  <Td className="text-[var(--color-ink-soft)]">{ws.keterangan || '—'}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => openEdit(ws)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Ubah"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => handleDelete(ws.id)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </Table>
            <p className="mt-4 text-sm font-medium text-[var(--color-ink)]">Total Jam Kerja Efektif: {totalJamEfektif} jam/minggu</p>
          </>
        )}
      </SectionCard>

      <Card>
        <p className="text-sm text-[var(--color-ink-soft)]">
          <span className="font-medium text-[var(--color-ink)]">Pegawai Pesantren</span> (pengasuhan, pembinaan asrama, penjagaan santri)
          bekerja dengan pola giliran (shift) 40 jam/minggu yang ditetapkan Mudir, tidak mengikuti jadwal di atas — sesuai Pasal 6 SK ini.
        </p>
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Ubah Jam Kerja' : 'Tambah Baris Jam Kerja'}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Hari" required value={form.hari} onChange={(e) => setForm((s) => ({ ...s, hari: e.target.value }))} />
            <Input label="Urutan" type="number" min={1} value={form.urutan} onChange={(e) => setForm((s) => ({ ...s, urutan: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Jam Masuk" type="time" value={form.jam_masuk} onChange={(e) => setForm((s) => ({ ...s, jam_masuk: e.target.value }))} />
            <Input label="Jam Pulang" type="time" value={form.jam_pulang} onChange={(e) => setForm((s) => ({ ...s, jam_pulang: e.target.value }))} />
          </div>
          <Input label="Waktu Istirahat" value={form.istirahat} onChange={(e) => setForm((s) => ({ ...s, istirahat: e.target.value }))} placeholder="09.00–09.20, 11.50–12.30" />
          <Input label="Jam Kerja Efektif" type="number" step="0.5" value={form.jam_efektif} onChange={(e) => setForm((s) => ({ ...s, jam_efektif: e.target.value }))} />
          <Input label="Keterangan" value={form.keterangan} onChange={(e) => setForm((s) => ({ ...s, keterangan: e.target.value }))} />
          {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

const emptyKpiForm = { nama: '', deskripsi: '', bobot: '', status_aktif: true, urutan: '', sumber_otomatis: 'manual' }

function KpiIndicatorsTab({ kpiIndicators, reload }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyKpiForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [decideState, setDecideState] = useState(null) // { row, mode: 'setujui' | 'tolak' }

  // Indikator buatan Yayasan langsung berstatus 'disetujui'; usulan
  // sekolah masuk sebagai 'diajukan' menunggu keputusan, atau 'ditolak'
  // kalau tidak disetujui — lihat migrasi 0031.
  const usulanRows = kpiIndicators.filter((k) => k.status === 'diajukan')
  const aktifRows = kpiIndicators.filter((k) => k.status === 'disetujui')
  const ditolakRows = kpiIndicators.filter((k) => k.status === 'ditolak')
  const totalBobotAktif = aktifRows.filter((k) => k.status_aktif).reduce((sum, k) => sum + Number(k.bobot || 0), 0)

  const openAdd = () => {
    setEditingId(null)
    setForm({ ...emptyKpiForm, urutan: aktifRows.length + 1 })
    setError('')
    setModalOpen(true)
  }
  const openEdit = (k) => {
    setEditingId(k.id)
    setForm({ nama: k.nama || '', deskripsi: k.deskripsi || '', bobot: k.bobot ?? '', status_aktif: k.status_aktif, urutan: k.urutan ?? '', sumber_otomatis: k.sumber_otomatis || 'manual' })
    setError('')
    setModalOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.bobot || Number(form.bobot) <= 0) { setError('Isi bobot lebih dari 0.'); return }
    setSaving(true)
    setError('')
    const payload = {
      nama: form.nama, deskripsi: form.deskripsi || null, bobot: Number(form.bobot),
      status_aktif: form.status_aktif, urutan: Number(form.urutan) || 0,
      sumber_otomatis: form.sumber_otomatis || 'manual',
    }
    const query = editingId ? supabase.from('kpi_indicators').update(payload).eq('id', editingId) : supabase.from('kpi_indicators').insert(payload)
    const { error: err } = await query
    setSaving(false)
    if (err) { setError(err.message); return }
    setModalOpen(false)
    reload()
  }

  const handleDelete = async (id) => {
    if (!confirm('Hapus indikator KPI ini? Skor penilaian yang sudah memakai indikator ini akan gagal ditampilkan — nonaktifkan saja jika sudah pernah dipakai menilai.')) return
    const { error } = await supabase.from('kpi_indicators').delete().eq('id', id)
    if (error) alert('Gagal menghapus (kemungkinan sudah dipakai di penilaian yang tersimpan): ' + error.message)
    reload()
  }

  return (
    <div className="flex flex-col gap-6">
      {usulanRows.length > 0 && (
        <SectionCard
          title="Usulan Indikator dari Sekolah"
          description="Diajukan Kepala Sekolah/Admin Sekolah — belum aktif dipakai menilai sampai diputuskan di sini."
        >
          <div className="flex flex-col divide-y divide-[var(--color-border)]">
            {usulanRows.map((k) => (
              <div key={k.id} className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-medium text-[var(--color-ink-soft)]">{k.schools?.nama} ({k.schools?.jenjang}) — diajukan oleh {k.diajukan_nama || '—'}</p>
                  <p className="font-medium text-[var(--color-ink)]">{k.nama} <span className="font-normal text-[var(--color-ink-soft)]">— usulan bobot {k.bobot}%</span></p>
                  {k.deskripsi && <p className="mt-0.5 text-[13px] text-[var(--color-ink-soft)]">{k.deskripsi}</p>}
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => setDecideState({ row: k, mode: 'setujui' })} className="rounded bg-[var(--color-success-soft)] p-1.5 text-[var(--color-success)] hover:brightness-95" aria-label="Setujui"><Check className="h-4 w-4" /></button>
                  <button onClick={() => setDecideState({ row: k, mode: 'tolak' })} className="rounded bg-[var(--color-danger-soft)] p-1.5 text-[var(--color-danger)] hover:brightness-95" aria-label="Tolak"><X className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard
        title="Indikator KPI (Key Performance Indicator)"
        description="Daftar indikator yang sudah disetujui — dipakai sebagai dasar Nilai Akhir pada menu Kinerja. Total bobot indikator AKTIF idealnya 100%."
        actions={<Button size="sm" variant="outline" onClick={openAdd}><Plus className="h-4 w-4" /> Tambah</Button>}
      >
        {aktifRows.length === 0 ? <EmptyState icon={Star} title="Belum ada indikator KPI" description="Tambahkan indikator penilaian kinerja terlebih dahulu sebelum menilai pegawai di menu Kinerja." /> : (
          <>
            <Table columns={['Urutan', 'Indikator', 'Bobot', 'Status', 'Asal', '']}>
              {aktifRows.map((k) => (
                <Tr key={k.id}>
                  <Td className="text-[var(--color-ink-soft)]">{k.urutan}</Td>
                  <Td>
                    <p className="font-medium text-[var(--color-ink)]">{k.nama}</p>
                    {k.deskripsi && <p className="mt-0.5 text-[13px] text-[var(--color-ink-soft)]">{k.deskripsi}</p>}
                  </Td>
                  <Td className="font-medium">{k.bobot}%</Td>
                  <Td>{k.status_aktif ? <Badge color="success">Aktif</Badge> : <Badge color="neutral">Nonaktif</Badge>}</Td>
                  <Td className="text-xs text-[var(--color-ink-soft)]">{k.schools ? `Usulan ${k.schools.nama}` : 'Yayasan'}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => openEdit(k)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Ubah"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => handleDelete(k.id)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </Table>
            <p className={`mt-4 text-sm font-medium ${totalBobotAktif === 100 ? 'text-[var(--color-success)]' : 'text-[var(--color-gold)]'}`}>
              Total Bobot Indikator Aktif: {totalBobotAktif}% {totalBobotAktif !== 100 && '— sebaiknya disesuaikan menjadi tepat 100%'}
            </p>
          </>
        )}
        <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Ubah Indikator KPI' : 'Tambah Indikator KPI'}>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input label="Nama Indikator" required value={form.nama} onChange={(e) => setForm((s) => ({ ...s, nama: e.target.value }))} placeholder="Kedisiplinan, Kualitas Mengajar, dll." />
            <Textarea label="Deskripsi (opsional)" rows={3} value={form.deskripsi} onChange={(e) => setForm((s) => ({ ...s, deskripsi: e.target.value }))} />
            <div className="grid grid-cols-2 gap-4">
              <Input label="Bobot (%)" type="number" min="0.01" max="100" step="0.01" required value={form.bobot} onChange={(e) => setForm((s) => ({ ...s, bobot: e.target.value }))} />
              <Input label="Urutan Tampil" type="number" min="1" value={form.urutan} onChange={(e) => setForm((s) => ({ ...s, urutan: e.target.value }))} />
            </div>
            <Select label="Status" value={form.status_aktif ? 'aktif' : 'nonaktif'} onChange={(e) => setForm((s) => ({ ...s, status_aktif: e.target.value === 'aktif' }))}>
              <option value="aktif">Aktif — dipakai saat menilai</option>
              <option value="nonaktif">Nonaktif — disembunyikan dari form penilaian baru</option>
            </Select>
            <Select label="Sumber Skor Otomatis" value={form.sumber_otomatis} onChange={(e) => setForm((s) => ({ ...s, sumber_otomatis: e.target.value }))}>
              <option value="manual">Manual — diisi manajer (subjektif)</option>
              <option value="kehadiran_pegawai">Otomatis — Indeks Kehadiran pegawai (Presensi)</option>
              <option value="kpi_lembaga_unit">Otomatis — capaian KPI Lembaga unit pegawai</option>
            </Select>
            <p className="-mt-1 text-xs text-[var(--color-ink-soft)]">Indikator bersumber otomatis dapat diisi dengan tombol <strong>Hitung Otomatis</strong> di form penilaian, lalu tetap ditinjau &amp; dikonfirmasi manusia sebelum disimpan.</p>
            {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Batal</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button>
            </div>
          </form>
        </Modal>
      </SectionCard>

      {ditolakRows.length > 0 && (
        <SectionCard title="Usulan Ditolak" description="Riwayat usulan indikator dari sekolah yang tidak disetujui Yayasan.">
          <div className="flex flex-col divide-y divide-[var(--color-border)]">
            {ditolakRows.map((k) => (
              <div key={k.id} className="py-3 first:pt-0 last:pb-0">
                <p className="text-sm text-[var(--color-ink)]">{k.nama} <span className="text-xs text-[var(--color-ink-soft)]">— {k.schools?.nama}</span></p>
                {k.catatan_yayasan && <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">Catatan: {k.catatan_yayasan}</p>}
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      <DecideKpiModal state={decideState} onClose={() => setDecideState(null)} onDone={() => { setDecideState(null); reload() }} />
    </div>
  )
}

function DecideKpiModal({ state, onClose, onDone }) {
  const [bobot, setBobot] = useState('')
  const [statusAktif, setStatusAktif] = useState(true)
  const [catatan, setCatatan] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (state) {
      setBobot(String(state.row.bobot))
      setStatusAktif(true)
      setCatatan('')
      setError('')
    }
  }, [state])

  if (!state) return null
  const { row, mode } = state

  const handleConfirm = async () => {
    if (mode === 'setujui' && (!bobot || Number(bobot) <= 0)) { setError('Isi bobot final lebih dari 0.'); return }
    if (mode === 'tolak' && !catatan.trim()) { setError('Isi catatan alasan penolakan.'); return }
    setSaving(true)
    setError('')
    const payload = mode === 'setujui'
      ? { status: 'disetujui', bobot: Number(bobot), status_aktif: statusAktif, catatan_yayasan: catatan || null }
      : { status: 'ditolak', catatan_yayasan: catatan }
    const { error: err } = await supabase.from('kpi_indicators').update(payload).eq('id', row.id)
    setSaving(false)
    if (err) { setError(err.message); return }
    onDone()
  }

  return (
    <Modal open={!!state} onClose={onClose} title={mode === 'setujui' ? 'Setujui Usulan Indikator KPI' : 'Tolak Usulan Indikator KPI'}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-[var(--color-ink-soft)]">
          <span className="font-medium text-[var(--color-ink)]">{row.nama}</span> — diusulkan oleh {row.schools?.nama} ({row.diajukan_nama || '—'})
        </p>
        {mode === 'setujui' && (
          <div className="grid grid-cols-2 gap-4">
            <Input label="Bobot Final (%)" type="number" min="0.01" max="100" step="0.01" value={bobot} onChange={(e) => setBobot(e.target.value)} />
            <Select label="Status" value={statusAktif ? 'aktif' : 'nonaktif'} onChange={(e) => setStatusAktif(e.target.value === 'aktif')}>
              <option value="aktif">Aktif — langsung dipakai menilai</option>
              <option value="nonaktif">Simpan dulu, belum aktif</option>
            </Select>
          </div>
        )}
        <Textarea label={mode === 'setujui' ? 'Catatan (opsional)' : 'Catatan / Alasan Penolakan'} rows={3} value={catatan} onChange={(e) => setCatatan(e.target.value)} />
        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="button" onClick={handleConfirm} disabled={saving}>{saving ? 'Menyimpan…' : mode === 'setujui' ? 'Setujui' : 'Tolak'}</Button>
        </div>
      </div>
    </Modal>
  )
}
