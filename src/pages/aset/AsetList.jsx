import { useEffect, useState, useCallback, useMemo } from 'react'
import { Boxes, Plus, Pencil, Trash2, DoorOpen, Tags, ShieldAlert } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, SectionCard, Card, Button, Badge, Table, Tr, Td, Modal, Input, Select, Textarea, EmptyState, FullPageSpinner, StatCard } from '../../components/ui'
import { formatRupiah } from '../../lib/format'
import { KONDISI_OPTIONS, KONDISI_LABEL, KONDISI_BADGE, hitungPenyusutan, umurLabel } from '../../lib/aset'

const TABS = ['Inventaris', 'Ruangan', 'Kategori & Kodefikasi']

export default function AsetList() {
  const { isManager, hasFullAccess, roles, loading: authLoading } = useAuth()
  const [tab, setTab] = useState('Inventaris')

  const mySchools = useMemo(() => {
    const seen = new Map()
    for (const r of roles) {
      if (['admin_sekolah', 'kepala_sekolah'].includes(r.role) && r.school_id && !seen.has(r.school_id)) {
        seen.set(r.school_id, { id: r.school_id, nama: r.schools?.nama, jenjang: r.schools?.jenjang })
      }
    }
    return Array.from(seen.values())
  }, [roles])

  if (authLoading) return <FullPageSpinner />
  if (!isManager) {
    return <EmptyState icon={ShieldAlert} title="Akses terbatas" description="Halaman Sarana & Prasarana hanya untuk manajemen (Admin Yayasan/HR, Admin Sekolah, Kepala Sekolah)." />
  }

  const tabs = hasFullAccess ? TABS : ['Inventaris', 'Ruangan']

  return (
    <div>
      <PageHeader title="Sarana & Prasarana" description="Inventaris aset (Buku Inventaris/KIA), ruangan (KIR), dan penyusutan." />
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-[var(--color-border)]">
        {tabs.map((t) => (
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

      {tab === 'Inventaris' && <InventarisTab hasFullAccess={hasFullAccess} mySchools={mySchools} />}
      {tab === 'Ruangan' && <RuanganTab hasFullAccess={hasFullAccess} mySchools={mySchools} />}
      {tab === 'Kategori & Kodefikasi' && hasFullAccess && <KategoriTab />}
    </div>
  )
}

// Pemilih unit: Yayasan bisa pilih semua; manajer sekolah terkunci ke
// unitnya (auto-pilih bila satu).
function useUnitFilter(hasFullAccess, mySchools) {
  const [schools, setSchools] = useState([])
  const [schoolId, setSchoolId] = useState(hasFullAccess ? '' : (mySchools[0]?.id || ''))
  useEffect(() => {
    if (hasFullAccess) {
      supabase.from('schools').select('id, nama, jenjang').order('jenjang').then(({ data }) => setSchools(data || []))
    } else {
      setSchools(mySchools)
      if (!schoolId && mySchools.length) setSchoolId(mySchools[0].id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasFullAccess])
  return { schools, schoolId, setSchoolId }
}

// =========================================================================
// TAB: INVENTARIS
// =========================================================================
function InventarisTab({ hasFullAccess, mySchools }) {
  const { schools, schoolId, setSchoolId } = useUnitFilter(hasFullAccess, mySchools)
  const [kategoriList, setKategoriList] = useState([])
  const [ruanganList, setRuanganList] = useState([])
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [kategoriFilter, setKategoriFilter] = useState('')
  const [kondisiFilter, setKondisiFilter] = useState('')
  const [ruanganFilter, setRuanganFilter] = useState('')
  const [showDihapus, setShowDihapus] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editingRow, setEditingRow] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    const [{ data: kat }, { data: aset, error }] = await Promise.all([
      supabase.from('aset_kategori').select('*').order('nama'),
      (() => {
        let q = supabase.from('aset').select('*, aset_kategori(nama, umur_ekonomis_bulan, nilai_residu_persen), ruangan(nama), schools!school_id(nama, jenjang)').order('created_at', { ascending: false })
        if (schoolId) q = q.eq('school_id', schoolId)
        return q
      })(),
    ])
    setKategoriList(kat || [])
    if (error) setLoadError(error.message)
    setRows(aset || [])
    setLoading(false)
  }, [schoolId])

  useEffect(() => { load() }, [load])

  // Ruangan untuk filter & form (unit terpilih).
  useEffect(() => {
    if (!schoolId) { setRuanganList([]); return }
    supabase.from('ruangan').select('id, nama').eq('school_id', schoolId).order('nama').then(({ data }) => setRuanganList(data || []))
  }, [schoolId])

  const filtered = useMemo(() => rows.filter((r) => {
    if (!showDihapus && r.status === 'dihapus') return false
    if (kategoriFilter && r.kategori_id !== kategoriFilter) return false
    if (kondisiFilter && r.kondisi !== kondisiFilter) return false
    if (ruanganFilter && r.ruangan_id !== ruanganFilter) return false
    return true
  }), [rows, showDihapus, kategoriFilter, kondisiFilter, ruanganFilter])

  const withPenyusutan = useMemo(() => filtered.map((r) => ({ r, p: hitungPenyusutan(r, r.aset_kategori) })), [filtered])
  const totals = useMemo(() => withPenyusutan.reduce((a, { r, p }) => ({
    jumlah: a.jumlah + 1,
    perolehan: a.perolehan + Number(r.nilai_perolehan || 0),
    buku: a.buku + p.nilaiBuku,
  }), { jumlah: 0, perolehan: 0, buku: 0 }), [withPenyusutan])

  const handleDelete = async (row) => {
    // Penghapusan aset = soft delete (status 'dihapus') agar riwayat terjaga.
    if (!confirm(`Tandai aset "${row.nama}" sebagai DIHAPUS? Data tetap tersimpan untuk riwayat, tapi tidak dihitung sebagai aset aktif.`)) return
    const { error } = await supabase.from('aset').update({ status: 'dihapus' }).eq('id', row.id)
    if (error) { alert('Gagal: ' + error.message); return }
    load()
  }

  if (loading) return <FullPageSpinner />

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {hasFullAccess && (
            <Select containerClassName="w-52" value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
              <option value="">Semua Unit</option>
              {schools.map((s) => <option key={s.id} value={s.id}>{s.jenjang} — {s.nama}</option>)}
            </Select>
          )}
          <Select containerClassName="w-44" value={kategoriFilter} onChange={(e) => setKategoriFilter(e.target.value)}>
            <option value="">Semua Kategori</option>
            {kategoriList.map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}
          </Select>
          <Select containerClassName="w-40" value={kondisiFilter} onChange={(e) => setKondisiFilter(e.target.value)}>
            <option value="">Semua Kondisi</option>
            {KONDISI_OPTIONS.map((k) => <option key={k} value={k}>{KONDISI_LABEL[k]}</option>)}
          </Select>
          {schoolId && (
            <Select containerClassName="w-40" value={ruanganFilter} onChange={(e) => setRuanganFilter(e.target.value)}>
              <option value="">Semua Ruangan</option>
              {ruanganList.map((r) => <option key={r.id} value={r.id}>{r.nama}</option>)}
            </Select>
          )}
          <label className="flex items-center gap-1.5 text-xs text-[var(--color-ink-soft)]">
            <input type="checkbox" checked={showDihapus} onChange={(e) => setShowDihapus(e.target.checked)} /> Tampilkan yang dihapus
          </label>
        </div>
        <Button onClick={() => { setEditingRow(null); setFormOpen(true) }} disabled={!schoolId && !hasFullAccess}><Plus className="h-4 w-4" /> Tambah Aset</Button>
      </div>

      {loadError && <Card className="border-[var(--color-danger)] bg-[var(--color-danger-soft)]"><p className="text-sm text-[var(--color-danger)]">Gagal memuat: {loadError}</p></Card>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Jumlah Aset (baris)" value={totals.jumlah} />
        <StatCard label="Nilai Perolehan" value={formatRupiah(totals.perolehan)} />
        <StatCard label="Nilai Buku (setelah susut)" value={formatRupiah(totals.buku)} accent="gold" />
      </div>

      <SectionCard title="Buku Inventaris">
        {withPenyusutan.length === 0 ? (
          <EmptyState icon={Boxes} title="Belum ada aset" description={schoolId ? 'Tambahkan aset untuk unit ini.' : 'Pilih unit atau tambahkan aset.'} />
        ) : (
          <Table columns={['Kode', 'Nama', 'Kategori', 'Ruangan', 'Kondisi', 'Jml', 'Perolehan', 'Nilai Buku', '']}>
            {withPenyusutan.map(({ r, p }) => (
              <Tr key={r.id}>
                <Td>{r.kode_aset || '—'}</Td>
                <Td>
                  <span className={r.status === 'dihapus' ? 'text-[var(--color-ink-soft)] line-through' : ''}>{r.nama}</span>
                  {hasFullAccess && <span className="block text-xs text-[var(--color-ink-soft)]">{r.schools?.jenjang} — {r.schools?.nama}</span>}
                </Td>
                <Td>{r.aset_kategori?.nama || '—'}</Td>
                <Td>{r.ruangan?.nama || '—'}</Td>
                <Td><Badge color={KONDISI_BADGE[r.kondisi]}>{KONDISI_LABEL[r.kondisi]}</Badge></Td>
                <Td>{r.jumlah}</Td>
                <Td>{formatRupiah(r.nilai_perolehan)}</Td>
                <Td className="font-medium">{formatRupiah(p.nilaiBuku)}{p.disusutkan && <span className="block text-[11px] font-normal text-[var(--color-ink-soft)]">susut {p.bulanBerjalan} bln</span>}</Td>
                <Td>
                  {r.status !== 'dihapus' && (
                    <div className="flex justify-end gap-1.5">
                      <button onClick={() => { setEditingRow(r); setFormOpen(true) }} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Ubah"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => handleDelete(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  )}
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </SectionCard>

      <AsetFormModal
        open={formOpen}
        editingRow={editingRow}
        schools={hasFullAccess ? schools : mySchools}
        defaultSchoolId={schoolId}
        kategoriList={kategoriList}
        onClose={() => { setFormOpen(false); setEditingRow(null) }}
        onSaved={() => { setFormOpen(false); setEditingRow(null); load() }}
      />
    </div>
  )
}

function AsetFormModal({ open, editingRow, schools, defaultSchoolId, kategoriList, onClose, onSaved }) {
  const [f, setF] = useState({})
  const [ruanganList, setRuanganList] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isEdit = !!editingRow

  useEffect(() => {
    if (!open) return
    setError('')
    if (editingRow) {
      setF({
        school_id: editingRow.school_id, kategori_id: editingRow.kategori_id || '', ruangan_id: editingRow.ruangan_id || '',
        kode_aset: editingRow.kode_aset || '', nama: editingRow.nama || '', merk_tipe: editingRow.merk_tipe || '',
        tanggal_perolehan: editingRow.tanggal_perolehan || '', jumlah: String(editingRow.jumlah ?? 1), satuan: editingRow.satuan || 'unit',
        nilai_perolehan: editingRow.nilai_perolehan ?? '', sumber_dana: editingRow.sumber_dana || '',
        kondisi: editingRow.kondisi || 'baik', keterangan: editingRow.keterangan || '',
      })
    } else {
      setF({
        school_id: defaultSchoolId || (schools.length === 1 ? schools[0].id : ''), kategori_id: '', ruangan_id: '',
        kode_aset: '', nama: '', merk_tipe: '', tanggal_perolehan: '', jumlah: '1', satuan: 'unit',
        nilai_perolehan: '', sumber_dana: '', kondisi: 'baik', keterangan: '',
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingRow])

  useEffect(() => {
    if (!f.school_id) { setRuanganList([]); return }
    supabase.from('ruangan').select('id, nama').eq('school_id', f.school_id).order('nama').then(({ data }) => setRuanganList(data || []))
  }, [f.school_id])

  const set = (k, v) => setF((prev) => ({ ...prev, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!f.school_id) { setError('Pilih unit.'); return }
    if (!f.nama?.trim()) { setError('Isi nama aset.'); return }
    setSaving(true)
    const payload = {
      school_id: f.school_id,
      kategori_id: f.kategori_id || null,
      ruangan_id: f.ruangan_id || null,
      kode_aset: f.kode_aset?.trim() || null,
      nama: f.nama.trim(),
      merk_tipe: f.merk_tipe?.trim() || null,
      tahun_perolehan: f.tanggal_perolehan ? new Date(f.tanggal_perolehan).getFullYear() : null,
      tanggal_perolehan: f.tanggal_perolehan || null,
      jumlah: Number(f.jumlah) || 1,
      satuan: f.satuan?.trim() || 'unit',
      nilai_perolehan: f.nilai_perolehan === '' ? 0 : Number(f.nilai_perolehan),
      sumber_dana: f.sumber_dana?.trim() || null,
      kondisi: f.kondisi,
      keterangan: f.keterangan?.trim() || null,
    }
    const query = isEdit
      ? supabase.from('aset').update(payload).eq('id', editingRow.id)
      : supabase.from('aset').insert(payload)
    const { error: err } = await query
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Ubah Aset' : 'Tambah Aset'} width="max-w-2xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Select label="Unit" required disabled={isEdit} value={f.school_id || ''} onChange={(e) => set('school_id', e.target.value)}>
            <option value="">— Pilih —</option>
            {schools.map((s) => <option key={s.id} value={s.id}>{s.jenjang} — {s.nama}</option>)}
          </Select>
          <Select label="Kategori" value={f.kategori_id || ''} onChange={(e) => set('kategori_id', e.target.value)}>
            <option value="">— Pilih —</option>
            {kategoriList.map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}
          </Select>
        </div>
        <Input label="Nama Aset" required value={f.nama || ''} onChange={(e) => set('nama', e.target.value)} placeholder="Contoh: Laptop Asus Vivobook" />
        <div className="grid grid-cols-3 gap-3">
          <Input label="Kode / No. Inventaris" value={f.kode_aset || ''} onChange={(e) => set('kode_aset', e.target.value)} />
          <Input label="Merk / Tipe" value={f.merk_tipe || ''} onChange={(e) => set('merk_tipe', e.target.value)} />
          <Select label="Ruangan" value={f.ruangan_id || ''} onChange={(e) => set('ruangan_id', e.target.value)}>
            <option value="">— Tidak diletakkan —</option>
            {ruanganList.map((r) => <option key={r.id} value={r.id}>{r.nama}</option>)}
          </Select>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <Input label="Jumlah" type="number" value={f.jumlah ?? ''} onChange={(e) => set('jumlah', e.target.value)} />
          <Input label="Satuan" value={f.satuan || ''} onChange={(e) => set('satuan', e.target.value)} placeholder="unit/buah/set" />
          <Input label="Tanggal Perolehan" type="date" value={f.tanggal_perolehan || ''} onChange={(e) => set('tanggal_perolehan', e.target.value)} />
          <Select label="Kondisi" value={f.kondisi || 'baik'} onChange={(e) => set('kondisi', e.target.value)}>
            {KONDISI_OPTIONS.map((k) => <option key={k} value={k}>{KONDISI_LABEL[k]}</option>)}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Nilai Perolehan (Rp)" type="number" value={f.nilai_perolehan ?? ''} onChange={(e) => set('nilai_perolehan', e.target.value)} placeholder="total untuk seluruh jumlah" />
          <Input label="Sumber Dana" value={f.sumber_dana || ''} onChange={(e) => set('sumber_dana', e.target.value)} placeholder="BOS / Yayasan / Hibah" />
        </div>
        <Textarea label="Keterangan (opsional)" rows={2} value={f.keterangan || ''} onChange={(e) => set('keterangan', e.target.value)} />
        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button>
        </div>
      </form>
    </Modal>
  )
}

// =========================================================================
// TAB: RUANGAN (dasar KIR)
// =========================================================================
function RuanganTab({ hasFullAccess, mySchools }) {
  const { schools, schoolId, setSchoolId } = useUnitFilter(hasFullAccess, mySchools)
  const [rows, setRows] = useState([])
  const [counts, setCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editingRow, setEditingRow] = useState(null)

  const load = useCallback(async () => {
    if (!schoolId) { setRows([]); setCounts({}); setLoading(false); return }
    setLoading(true)
    const [{ data: r }, { data: aset }] = await Promise.all([
      supabase.from('ruangan').select('*').eq('school_id', schoolId).order('nama'),
      supabase.from('aset').select('ruangan_id').eq('school_id', schoolId).eq('status', 'aktif'),
    ])
    const c = {}
    for (const a of (aset || [])) if (a.ruangan_id) c[a.ruangan_id] = (c[a.ruangan_id] || 0) + 1
    setRows(r || [])
    setCounts(c)
    setLoading(false)
  }, [schoolId])

  useEffect(() => { load() }, [load])

  const handleDelete = async (row) => {
    if (!confirm(`Hapus ruangan "${row.nama}"? Aset di dalamnya tidak ikut terhapus (lokasinya dikosongkan).`)) return
    const { error } = await supabase.from('ruangan').delete().eq('id', row.id)
    if (error) { alert('Gagal: ' + error.message); return }
    load()
  }

  if (loading) return <FullPageSpinner />

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {hasFullAccess ? (
          <Select containerClassName="w-52" value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
            <option value="">— Pilih Unit —</option>
            {schools.map((s) => <option key={s.id} value={s.id}>{s.jenjang} — {s.nama}</option>)}
          </Select>
        ) : <span />}
        <Button onClick={() => { setEditingRow(null); setFormOpen(true) }} disabled={!schoolId}><Plus className="h-4 w-4" /> Tambah Ruangan</Button>
      </div>

      <SectionCard title="Daftar Ruangan">
        {!schoolId ? (
          <p className="text-sm text-[var(--color-ink-soft)]">Pilih unit lebih dulu.</p>
        ) : rows.length === 0 ? (
          <EmptyState icon={DoorOpen} title="Belum ada ruangan" description="Tambahkan ruangan untuk mengelompokkan aset (dasar KIR)." />
        ) : (
          <Table columns={['Kode', 'Nama Ruangan', 'Lantai', 'Jumlah Aset', '']}>
            {rows.map((r) => (
              <Tr key={r.id}>
                <Td>{r.kode || '—'}</Td>
                <Td>{r.nama}</Td>
                <Td>{r.lantai || '—'}</Td>
                <Td>{counts[r.id] || 0}</Td>
                <Td>
                  <div className="flex justify-end gap-1.5">
                    <button onClick={() => { setEditingRow(r); setFormOpen(true) }} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Ubah"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => handleDelete(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </SectionCard>

      <RuanganFormModal open={formOpen} editingRow={editingRow} schoolId={schoolId} onClose={() => { setFormOpen(false); setEditingRow(null) }} onSaved={() => { setFormOpen(false); setEditingRow(null); load() }} />
    </div>
  )
}

function RuanganFormModal({ open, editingRow, schoolId, onClose, onSaved }) {
  const [f, setF] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isEdit = !!editingRow

  useEffect(() => {
    if (!open) return
    setError('')
    setF(editingRow ? { kode: editingRow.kode || '', nama: editingRow.nama || '', lantai: editingRow.lantai || '', keterangan: editingRow.keterangan || '' }
      : { kode: '', nama: '', lantai: '', keterangan: '' })
  }, [open, editingRow])

  const set = (k, v) => setF((prev) => ({ ...prev, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!f.nama?.trim()) { setError('Isi nama ruangan.'); return }
    setSaving(true)
    const payload = { school_id: schoolId, kode: f.kode?.trim() || null, nama: f.nama.trim(), lantai: f.lantai?.trim() || null, keterangan: f.keterangan?.trim() || null }
    const query = isEdit ? supabase.from('ruangan').update(payload).eq('id', editingRow.id) : supabase.from('ruangan').insert(payload)
    const { error: err } = await query
    setSaving(false)
    if (err) { setError(err.message.includes('duplicate') ? 'Nama ruangan sudah ada di unit ini.' : err.message); return }
    onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Ubah Ruangan' : 'Tambah Ruangan'}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Input label="Nama Ruangan" required value={f.nama || ''} onChange={(e) => set('nama', e.target.value)} placeholder="Contoh: Lab Komputer 1" />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Kode (opsional)" value={f.kode || ''} onChange={(e) => set('kode', e.target.value)} />
          <Input label="Lantai (opsional)" value={f.lantai || ''} onChange={(e) => set('lantai', e.target.value)} />
        </div>
        <Textarea label="Keterangan (opsional)" rows={2} value={f.keterangan || ''} onChange={(e) => set('keterangan', e.target.value)} />
        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button>
        </div>
      </form>
    </Modal>
  )
}

// =========================================================================
// TAB: KATEGORI & KODEFIKASI (Yayasan)
// =========================================================================
function KategoriTab() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editingRow, setEditingRow] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('aset_kategori').select('*').order('nama')
    setRows(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <FullPageSpinner />

  return (
    <SectionCard
      title="Kategori & Kodefikasi Aset"
      description="Kode & kebijakan penyusutan (umur ekonomis) berlaku seragam se-yayasan."
      actions={<Button size="sm" onClick={() => { setEditingRow(null); setFormOpen(true) }}><Plus className="h-4 w-4" /> Tambah</Button>}
    >
      {rows.length === 0 ? (
        <EmptyState icon={Tags} title="Belum ada kategori" description="Tambahkan kategori/kodefikasi aset." />
      ) : (
        <Table columns={['Kode', 'Nama', 'Umur Ekonomis', 'Nilai Residu', '']}>
          {rows.map((k) => (
            <Tr key={k.id}>
              <Td>{k.kode}</Td>
              <Td>{k.nama}</Td>
              <Td>{umurLabel(k.umur_ekonomis_bulan)}</Td>
              <Td>{Number(k.nilai_residu_persen || 0)}%</Td>
              <Td>
                <button onClick={() => { setEditingRow(k); setFormOpen(true) }} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Ubah"><Pencil className="h-4 w-4" /></button>
              </Td>
            </Tr>
          ))}
        </Table>
      )}
      <KategoriFormModal open={formOpen} editingRow={editingRow} onClose={() => { setFormOpen(false); setEditingRow(null) }} onSaved={() => { setFormOpen(false); setEditingRow(null); load() }} />
    </SectionCard>
  )
}

function KategoriFormModal({ open, editingRow, onClose, onSaved }) {
  const [f, setF] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isEdit = !!editingRow

  useEffect(() => {
    if (!open) return
    setError('')
    setF(editingRow
      ? { kode: editingRow.kode || '', nama: editingRow.nama || '', umur_tahun: editingRow.umur_ekonomis_bulan ? String(editingRow.umur_ekonomis_bulan / 12) : '', nilai_residu_persen: String(editingRow.nilai_residu_persen ?? 0) }
      : { kode: '', nama: '', umur_tahun: '', nilai_residu_persen: '0' })
  }, [open, editingRow])

  const set = (k, v) => setF((prev) => ({ ...prev, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!f.kode?.trim() || !f.nama?.trim()) { setError('Isi kode dan nama.'); return }
    setSaving(true)
    const payload = {
      kode: f.kode.trim().toUpperCase(),
      nama: f.nama.trim(),
      umur_ekonomis_bulan: f.umur_tahun === '' ? null : Math.round(Number(f.umur_tahun) * 12),
      nilai_residu_persen: f.nilai_residu_persen === '' ? 0 : Number(f.nilai_residu_persen),
    }
    const query = isEdit ? supabase.from('aset_kategori').update(payload).eq('id', editingRow.id) : supabase.from('aset_kategori').insert(payload)
    const { error: err } = await query
    setSaving(false)
    if (err) { setError(err.message.includes('duplicate') ? 'Kode kategori sudah dipakai.' : err.message); return }
    onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Ubah Kategori' : 'Tambah Kategori'}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-3">
          <Input label="Kode" required value={f.kode || ''} onChange={(e) => set('kode', e.target.value)} placeholder="MEB" />
          <Input containerClassName="col-span-2" label="Nama" required value={f.nama || ''} onChange={(e) => set('nama', e.target.value)} placeholder="Mebel & Perabot" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Umur Ekonomis (tahun)" type="number" value={f.umur_tahun ?? ''} onChange={(e) => set('umur_tahun', e.target.value)} placeholder="kosongkan = tak disusutkan" />
          <Input label="Nilai Residu (%)" type="number" value={f.nilai_residu_persen ?? ''} onChange={(e) => set('nilai_residu_persen', e.target.value)} />
        </div>
        <p className="text-xs text-[var(--color-ink-soft)]">Penyusutan garis lurus: (Nilai Perolehan − Residu) ÷ umur ekonomis. Kosongkan umur untuk aset yang tidak disusutkan (mis. Tanah).</p>
        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button>
        </div>
      </form>
    </Modal>
  )
}
