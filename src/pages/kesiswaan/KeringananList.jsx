import { useEffect, useState, useCallback } from 'react'
import { Plus, Pencil, Trash2, ShieldAlert, Percent, Tag } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, SectionCard, Button, Badge, Table, Tr, Td, Modal, Input, Select, Textarea, EmptyState, FullPageSpinner } from '../../components/ui'
import { useAutoRefresh } from '../../lib/useAutoRefresh'
import { SASARAN_OPTIONS, SASARAN_LABEL, TIPE_OPTIONS, KRITERIA_OPTIONS, KRITERIA_LABEL, potonganLabel } from '../../lib/keringanan'
import { PROGRAM_OPTIONS, PROGRAM_LABEL, UP_KOMPONEN_PRESET } from '../../lib/uangPangkal'

const KOMPONEN_SUGGEST = UP_KOMPONEN_PRESET.boarding
const TABS = ['Kebijakan Keringanan', 'Keringanan per Siswa']

export default function KeringananList() {
  const { isManager, isBendahara, hasFullAccess, employee, loading } = useAuth()
  const [tab, setTab] = useState('Kebijakan Keringanan')
  if (loading) return <FullPageSpinner />
  if (!(isManager || hasFullAccess || isBendahara)) {
    return <EmptyState icon={ShieldAlert} title="Akses terbatas" description="Peran Anda tidak memiliki izin melihat keringanan biaya siswa." />
  }
  return (
    <div>
      <PageHeader title="Keringanan Biaya Siswa" description="Potongan/beasiswa untuk SPP & Uang Pangkal. Kebijakan berlaku otomatis saat generate tagihan; keringanan per siswa untuk kasus khusus." />
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-[var(--color-border)]">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${tab === t ? 'border-[var(--color-navy)] text-[var(--color-navy)]' : 'border-transparent text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]'}`}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'Kebijakan Keringanan' ? <KebijakanTab canManage={isManager} /> : <SiswaTab canManage={isManager} employeeId={employee?.id} />}
    </div>
  )
}

// ---------------------------------------------------------------- Kebijakan
function KebijakanTab({ canManage }) {
  const [rows, setRows] = useState([])
  const [schools, setSchools] = useState([])
  const [taList, setTaList] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: r }, { data: s }, { data: t }] = await Promise.all([
      supabase.from('keringanan_kebijakan').select('*, schools!school_id(nama, jenjang), tahun_ajaran(nama)').order('created_at', { ascending: false }),
      supabase.from('schools').select('id, nama, jenjang').order('jenjang'),
      supabase.from('tahun_ajaran').select('id, nama, status').order('nama', { ascending: false }),
    ])
    setRows(r || []); setSchools(s || []); setTaList(t || [])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])
  useAutoRefresh('keringanan_kebijakan', load)

  const del = async (r) => {
    if (!confirm(`Hapus kebijakan "${r.nama}"? Tagihan yang sudah dibuat tidak berubah.`)) return
    const { error } = await supabase.from('keringanan_kebijakan').delete().eq('id', r.id)
    if (error) { alert('Gagal: ' + error.message); return }
    load()
  }

  if (loading) return <FullPageSpinner />
  return (
    <SectionCard title="Kebijakan Keringanan (per Tahun Ajaran)"
      description="Berlaku otomatis saat generate tagihan. Mis. gratis SPP anak pegawai, potongan Gedung musiman."
      actions={canManage && <Button size="sm" onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> Tambah Kebijakan</Button>}>
      {rows.length === 0 ? <EmptyState icon={Percent} title="Belum ada kebijakan" /> : (
        <div className="overflow-x-auto">
          <Table columns={['Nama', 'Sasaran', 'Potongan', 'Kriteria', 'Cakupan', 'Berlaku', 'Status', '']}>
            {rows.map((r) => (
              <Tr key={r.id}>
                <Td className="font-medium">{r.nama}</Td>
                <Td className="text-xs">{SASARAN_LABEL[r.sasaran]}{r.komponen ? ` · ${r.komponen}` : ''}</Td>
                <Td>{potonganLabel(r.tipe, r.nilai)}</Td>
                <Td className="text-xs">{KRITERIA_LABEL[r.kriteria]}{r.kriteria === 'anak_ke_min' ? ` ${r.anak_ke_min}` : ''}</Td>
                <Td className="text-xs text-[var(--color-ink-soft)]">{r.schools ? r.schools.jenjang : 'Semua unit'}{r.program ? ` · ${PROGRAM_LABEL[r.program]}` : ''}</Td>
                <Td className="text-xs text-[var(--color-ink-soft)]">{r.tahun_ajaran?.nama || '—'}{(r.berlaku_mulai || r.berlaku_sampai) ? <span className="block">{r.berlaku_mulai || '…'} s/d {r.berlaku_sampai || '…'}</span> : null}</Td>
                <Td>{r.aktif ? <Badge color="success">Aktif</Badge> : <Badge color="neutral">Nonaktif</Badge>}</Td>
                <Td>
                  <div className="flex justify-end gap-1.5">
                    {canManage && <button onClick={() => setEditing(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Ubah"><Pencil className="h-4 w-4" /></button>}
                    {canManage && <button onClick={() => del(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus"><Trash2 className="h-4 w-4" /></button>}
                  </div>
                </Td>
              </Tr>
            ))}
          </Table>
        </div>
      )}
      {editing && <KebijakanModal entry={editing} schools={schools} taList={taList} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
    </SectionCard>
  )
}

function KebijakanModal({ entry, schools, taList, onClose, onSaved }) {
  const isNew = entry === 'new'
  const [f, setF] = useState(() => isNew ? {
    tahun_ajaran_id: taList.find((t) => t.status === 'aktif')?.id || '', school_id: '', program: '', nama: '',
    sasaran: 'spp', komponen: '', tipe: 'persen', nilai: '', kriteria: 'semua', anak_ke_min: '',
    berlaku_mulai: '', berlaku_sampai: '', syarat: '', aktif: true,
  } : {
    tahun_ajaran_id: entry.tahun_ajaran_id || '', school_id: entry.school_id || '', program: entry.program || '', nama: entry.nama || '',
    sasaran: entry.sasaran, komponen: entry.komponen || '', tipe: entry.tipe, nilai: String(entry.nilai ?? ''),
    kriteria: entry.kriteria, anak_ke_min: String(entry.anak_ke_min ?? ''), berlaku_mulai: entry.berlaku_mulai || '',
    berlaku_sampai: entry.berlaku_sampai || '', syarat: entry.syarat || '', aktif: entry.aktif,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!f.tahun_ajaran_id) { setError('Pilih tahun ajaran.'); return }
    if (!f.nama.trim()) { setError('Isi nama kebijakan.'); return }
    if (f.tipe === 'persen' && Number(f.nilai) > 100) { setError('Persen tidak boleh lebih dari 100.'); return }
    setSaving(true)
    const payload = {
      tahun_ajaran_id: f.tahun_ajaran_id, school_id: f.school_id || null, program: f.program || null,
      nama: f.nama.trim(), sasaran: f.sasaran, komponen: f.sasaran === 'uang_pangkal' && f.komponen.trim() ? f.komponen.trim() : null,
      tipe: f.tipe, nilai: Number(f.nilai) || 0, kriteria: f.kriteria,
      anak_ke_min: f.kriteria === 'anak_ke_min' ? (Number(f.anak_ke_min) || null) : null,
      berlaku_mulai: f.berlaku_mulai || null, berlaku_sampai: f.berlaku_sampai || null,
      syarat: f.syarat.trim() || null, aktif: !!f.aktif,
    }
    const q = isNew ? supabase.from('keringanan_kebijakan').insert(payload) : supabase.from('keringanan_kebijakan').update(payload).eq('id', entry.id)
    const { error: err } = await q
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  return (
    <Modal open onClose={onClose} title={isNew ? 'Tambah Kebijakan Keringanan' : 'Ubah Kebijakan'} width="max-w-2xl">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Input label="Nama Kebijakan" required value={f.nama} onChange={set('nama')} placeholder="mis. Gratis SPP Anak Pegawai" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Select label="Tahun Ajaran" required value={f.tahun_ajaran_id} onChange={set('tahun_ajaran_id')}>
            <option value="">— Pilih —</option>
            {taList.map((t) => <option key={t.id} value={t.id}>{t.nama}{t.status === 'aktif' ? ' (Aktif)' : ''}</option>)}
          </Select>
          <Select label="Unit (kosong = semua)" value={f.school_id} onChange={set('school_id')}>
            <option value="">Semua Unit</option>
            {schools.map((s) => <option key={s.id} value={s.id}>{s.jenjang} — {s.nama}</option>)}
          </Select>
          <Select label="Program (kosong = semua)" value={f.program} onChange={set('program')}>
            <option value="">Semua Program</option>
            {PROGRAM_OPTIONS.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
          </Select>
          <Select label="Sasaran" value={f.sasaran} onChange={set('sasaran')}>
            {SASARAN_OPTIONS.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
          </Select>
          {f.sasaran === 'uang_pangkal' ? (
            <>
              <Input label="Komponen (kosong = seluruh)" value={f.komponen} onChange={set('komponen')} list="komp-suggest" placeholder="mis. Gedung" />
              <datalist id="komp-suggest">{KOMPONEN_SUGGEST.map((k) => <option key={k} value={k} />)}</datalist>
            </>
          ) : <div className="hidden sm:block" />}
          <Select label="Tipe Potongan" value={f.tipe} onChange={set('tipe')}>
            {TIPE_OPTIONS.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
          </Select>
          <Input label={f.tipe === 'persen' ? 'Nilai (%)' : 'Nilai (Rp)'} type="number" min="0" required value={f.nilai} onChange={set('nilai')} />
          <Select label="Kriteria" value={f.kriteria} onChange={set('kriteria')}>
            {KRITERIA_OPTIONS.map((k) => <option key={k.v} value={k.v}>{k.l}</option>)}
          </Select>
          {f.kriteria === 'anak_ke_min' && <Input label="Anak ke- (minimal)" type="number" min="1" value={f.anak_ke_min} onChange={set('anak_ke_min')} />}
          <Input label="Berlaku Mulai (opsional)" type="date" value={f.berlaku_mulai} onChange={set('berlaku_mulai')} />
          <Input label="Berlaku Sampai (opsional)" type="date" value={f.berlaku_sampai} onChange={set('berlaku_sampai')} />
        </div>
        <Textarea label="Syarat & Ketentuan (opsional)" value={f.syarat} onChange={set('syarat')} rows={2} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.aktif} onChange={(e) => setF((s) => ({ ...s, aktif: e.target.checked }))} /> Aktif</label>
        <p className="text-xs text-[var(--color-ink-soft)]">Potongan diterapkan otomatis saat <b>generate tagihan</b> pada tahun ajaran & cakupan di atas. Kriteria "anak pegawai" memakai tautan orang tua pegawai pada data siswa.</p>
        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button>
        </div>
      </form>
    </Modal>
  )
}

// ------------------------------------------------------------ Keringanan Siswa
function SiswaTab({ canManage, employeeId }) {
  const [rows, setRows] = useState([])
  const [taList, setTaList] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: r }, { data: t }] = await Promise.all([
      supabase.from('keringanan_siswa').select('*, siswa!siswa_id(nama_lengkap, schools!school_id(jenjang)), tahun_ajaran(nama)').order('created_at', { ascending: false }),
      supabase.from('tahun_ajaran').select('id, nama, status').order('nama', { ascending: false }),
    ])
    setRows(r || []); setTaList(t || [])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])
  useAutoRefresh('keringanan_siswa', load)

  const del = async (r) => {
    if (!confirm('Hapus keringanan ini? Tagihan yang sudah dibuat tidak berubah.')) return
    const { error } = await supabase.from('keringanan_siswa').delete().eq('id', r.id)
    if (error) { alert('Gagal: ' + error.message); return }
    load()
  }

  if (loading) return <FullPageSpinner />
  return (
    <SectionCard title="Keringanan per Siswa"
      description="Pemberian khusus (beasiswa/kasus) untuk seorang siswa. Diterapkan otomatis saat generate tagihan siswa tsb."
      actions={canManage && <Button size="sm" onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> Tambah</Button>}>
      {rows.length === 0 ? <EmptyState icon={Tag} title="Belum ada keringanan per siswa" /> : (
        <div className="overflow-x-auto">
          <Table columns={['Siswa', 'Sasaran', 'Potongan', 'Alasan', 'Tahun Ajaran', 'Status', '']}>
            {rows.map((r) => (
              <Tr key={r.id}>
                <Td className="font-medium">{r.siswa?.nama_lengkap || '—'}<span className="block text-xs text-[var(--color-ink-soft)]">{r.siswa?.schools?.jenjang || ''}</span></Td>
                <Td className="text-xs">{SASARAN_LABEL[r.sasaran]}{r.komponen ? ` · ${r.komponen}` : ''}</Td>
                <Td>{potonganLabel(r.tipe, r.nilai)}</Td>
                <Td className="text-xs text-[var(--color-ink-soft)]">{r.alasan || '—'}</Td>
                <Td className="text-xs text-[var(--color-ink-soft)]">{r.tahun_ajaran?.nama || 'Semua'}</Td>
                <Td>{r.aktif ? <Badge color="success">Aktif</Badge> : <Badge color="neutral">Nonaktif</Badge>}</Td>
                <Td>
                  <div className="flex justify-end gap-1.5">
                    {canManage && <button onClick={() => setEditing(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Ubah"><Pencil className="h-4 w-4" /></button>}
                    {canManage && <button onClick={() => del(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus"><Trash2 className="h-4 w-4" /></button>}
                  </div>
                </Td>
              </Tr>
            ))}
          </Table>
        </div>
      )}
      {editing && <SiswaModal entry={editing} taList={taList} employeeId={employeeId} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
    </SectionCard>
  )
}

function SiswaModal({ entry, taList, employeeId, onClose, onSaved }) {
  const isNew = entry === 'new'
  const [siswaId, setSiswaId] = useState(isNew ? '' : entry.siswa_id)
  const [siswaNama, setSiswaNama] = useState(isNew ? '' : (entry.siswa?.nama_lengkap || ''))
  const [cari, setCari] = useState('')
  const [hasil, setHasil] = useState([])
  const [f, setF] = useState(() => isNew
    ? { sasaran: 'spp', komponen: '', tipe: 'persen', nilai: '', alasan: '', tahun_ajaran_id: '', aktif: true }
    : { sasaran: entry.sasaran, komponen: entry.komponen || '', tipe: entry.tipe, nilai: String(entry.nilai ?? ''), alasan: entry.alasan || '', tahun_ajaran_id: entry.tahun_ajaran_id || '', aktif: entry.aktif })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  const doCari = async (q) => {
    if (!q || q.trim().length < 2) { setHasil([]); return }
    const { data } = await supabase.from('siswa').select('id, nama_lengkap, schools!school_id(jenjang, nama)').ilike('nama_lengkap', `%${q.trim()}%`).eq('status', 'aktif').limit(15)
    setHasil(data || [])
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!siswaId) { setError('Pilih siswa.'); return }
    if (f.tipe === 'persen' && Number(f.nilai) > 100) { setError('Persen tidak boleh lebih dari 100.'); return }
    setSaving(true)
    const payload = {
      siswa_id: siswaId, sasaran: f.sasaran, komponen: f.sasaran === 'uang_pangkal' && f.komponen.trim() ? f.komponen.trim() : null,
      tipe: f.tipe, nilai: Number(f.nilai) || 0, alasan: f.alasan.trim() || null, tahun_ajaran_id: f.tahun_ajaran_id || null, aktif: !!f.aktif,
    }
    const q = isNew ? supabase.from('keringanan_siswa').insert({ ...payload, dicatat_oleh: employeeId || null }) : supabase.from('keringanan_siswa').update(payload).eq('id', entry.id)
    const { error: err } = await q
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  return (
    <Modal open onClose={onClose} title={isNew ? 'Tambah Keringanan Siswa' : 'Ubah Keringanan'} width="max-w-lg">
      <form onSubmit={submit} className="flex flex-col gap-3">
        {isNew && (
          <div className="rounded-md border border-[var(--color-border)] p-3">
            {siswaId ? (
              <div className="flex items-center justify-between"><span className="text-sm">Siswa: <b>{siswaNama}</b></span><button type="button" onClick={() => { setSiswaId(''); setSiswaNama('') }} className="text-xs font-medium text-[var(--color-navy)] hover:underline">Ganti</button></div>
            ) : (
              <div>
                <Input label="Cari Siswa" value={cari} onChange={(e) => { setCari(e.target.value); doCari(e.target.value) }} placeholder="Ketik nama siswa…" />
                {hasil.length > 0 && (
                  <div className="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto">
                    {hasil.map((s) => <button type="button" key={s.id} onClick={() => { setSiswaId(s.id); setSiswaNama(s.nama_lengkap); setHasil([]); setCari('') }} className="flex items-center justify-between rounded border border-[var(--color-border)] px-2 py-1.5 text-left text-sm hover:border-[var(--color-navy)]"><span>{s.nama_lengkap}</span><span className="text-xs text-[var(--color-ink-soft)]">{s.schools ? s.schools.jenjang : ''}</span></button>)}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select label="Sasaran" value={f.sasaran} onChange={set('sasaran')}>
            {SASARAN_OPTIONS.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
          </Select>
          {f.sasaran === 'uang_pangkal' ? (
            <>
              <Input label="Komponen (kosong = seluruh)" value={f.komponen} onChange={set('komponen')} list="komp-suggest2" placeholder="mis. Gedung" />
              <datalist id="komp-suggest2">{KOMPONEN_SUGGEST.map((k) => <option key={k} value={k} />)}</datalist>
            </>
          ) : <div className="hidden sm:block" />}
          <Select label="Tipe" value={f.tipe} onChange={set('tipe')}>
            {TIPE_OPTIONS.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
          </Select>
          <Input label={f.tipe === 'persen' ? 'Nilai (%)' : 'Nilai (Rp)'} type="number" min="0" required value={f.nilai} onChange={set('nilai')} />
          <Select label="Tahun Ajaran (kosong = semua)" value={f.tahun_ajaran_id} onChange={set('tahun_ajaran_id')}>
            <option value="">Semua</option>
            {taList.map((t) => <option key={t.id} value={t.id}>{t.nama}</option>)}
          </Select>
        </div>
        <Input label="Alasan" value={f.alasan} onChange={set('alasan')} placeholder="mis. Yatim, kurang mampu, prestasi" />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.aktif} onChange={(e) => setF((s) => ({ ...s, aktif: e.target.checked }))} /> Aktif</label>
        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button>
        </div>
      </form>
    </Modal>
  )
}
