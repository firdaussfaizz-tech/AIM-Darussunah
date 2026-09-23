import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, Navigate } from 'react-router-dom'
import { CalendarRange, ClipboardList, BookOpen, Users, GraduationCap, Plus, Pencil, Trash2, Upload, FileText, CheckCircle2, ShieldAlert, Award, ExternalLink } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, SectionCard, Button, Badge, Table, Tr, Td, Modal, Input, Select, Textarea, EmptyState, FullPageSpinner, StatCard } from '../../components/ui'
import {
  ACADEMIC_AREAS, ACADEMIC_DEFAULT_MANAGER, ACADEMIC_DEFAULT_GURU, SEMESTER_OPTIONS,
  HARI_LIST, JENIS_PERANGKAT, KEHADIRAN_GURU_OPTIONS, KEHADIRAN_GURU_LABEL,
  PERANGKAT_STATUS_LABEL, PERANGKAT_STATUS_BADGE,
} from '../../lib/academic'

const BUCKET = 'employee-files'
const fmtTgl = (d) => (d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')

export default function AcademicManagement() {
  const { isManager, hasFullAccess, roles, employee, loading } = useAuth()
  const { area } = useParams()

  const mySchools = useMemo(() => {
    const seen = new Map()
    for (const r of roles) {
      if (['admin_sekolah', 'kepala_sekolah'].includes(r.role) && r.school_id && !seen.has(r.school_id)) {
        seen.set(r.school_id, { id: r.school_id, nama: r.schools?.nama, jenjang: r.schools?.jenjang })
      }
    }
    return Array.from(seen.values())
  }, [roles])

  const [schools, setSchools] = useState([])
  const [schoolId, setSchoolId] = useState('')
  const [tahunList, setTahunList] = useState([])
  const [tahunId, setTahunId] = useState('')
  const [semester, setSemester] = useState('Ganjil')

  useEffect(() => {
    if (isManager && hasFullAccess) {
      supabase.from('schools').select('id, nama, jenjang').order('jenjang').then(({ data }) => setSchools(data || []))
    } else if (isManager) {
      setSchools(mySchools); setSchoolId((s) => s || mySchools[0]?.id || '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManager, hasFullAccess])

  useEffect(() => {
    supabase.from('tahun_ajaran').select('id, nama, status').order('nama', { ascending: false }).then(({ data }) => {
      setTahunList(data || [])
      setTahunId((t) => t || (data || []).find((x) => x.status === 'aktif')?.id || data?.[0]?.id || '')
    })
  }, [])

  if (loading) return <FullPageSpinner />
  if (!isManager && !employee?.id) {
    return <EmptyState icon={ShieldAlert} title="Akses terbatas" description="Modul Akademik untuk manajemen sekolah & guru pengampu. Akun Anda belum tertaut ke data pegawai." />
  }

  const active = ACADEMIC_AREAS.find((a) => a.slug === area)
  if (!active || (active.scope === 'manager' && !isManager)) {
    return <Navigate to={`/pembelajaran/${isManager ? ACADEMIC_DEFAULT_MANAGER : ACADEMIC_DEFAULT_GURU}`} replace />
  }

  const effSchoolId = isManager ? schoolId : (employee?.school_id || '')
  const ctx = { isManager, hasFullAccess, guru: !isManager, employee, mySchools, schools, schoolId, setSchoolId, tahunList, tahunId, setTahunId, semester, setSemester, effSchoolId }

  return (
    <div>
      <PageHeader title={`Akademik — ${isManager ? active.label : (active.labelGuru || active.label)}`} description="Manajemen pembelajaran: penugasan, jadwal, jurnal KBM, kurikulum, ekstrakurikuler, dan perangkat ajar." />
      <AcademicCtxBar ctx={ctx} />
      {active.slug === 'dashboard' && <AcademicDashboard ctx={ctx} />}
      {active.slug === 'mapel' && <MapelTab ctx={ctx} />}
      {active.slug === 'penugasan' && <PenugasanTab ctx={ctx} />}
      {active.slug === 'jadwal' && <JadwalTab ctx={ctx} />}
      {active.slug === 'jurnal' && <JurnalTab ctx={ctx} />}
      {active.slug === 'kurikulum' && <KurikulumTab ctx={ctx} />}
      {active.slug === 'ekstrakurikuler' && <EkstraTab ctx={ctx} />}
      {active.slug === 'perangkat' && <PerangkatTab ctx={ctx} />}
    </div>
  )
}

function AcademicCtxBar({ ctx }) {
  const { isManager, hasFullAccess, schools, schoolId, setSchoolId, tahunList, tahunId, setTahunId, semester, setSemester } = ctx
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      {isManager && hasFullAccess && (
        <Select containerClassName="w-52" value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
          <option value="">— Pilih Unit —</option>
          {schools.map((s) => <option key={s.id} value={s.id}>{s.jenjang} — {s.nama}</option>)}
        </Select>
      )}
      <Select containerClassName="w-44" value={tahunId} onChange={(e) => setTahunId(e.target.value)}>
        <option value="">— Tahun Ajaran —</option>
        {tahunList.map((t) => <option key={t.id} value={t.id}>{t.nama}{t.status === 'aktif' ? ' (aktif)' : ''}</option>)}
      </Select>
      <Select containerClassName="w-36" value={semester} onChange={(e) => setSemester(e.target.value)}>
        {SEMESTER_OPTIONS.map((s) => <option key={s} value={s}>Sem. {s}</option>)}
      </Select>
    </div>
  )
}

// Daftar rombel / mapel / guru untuk unit terpilih.
function useAcademicLists(effSchoolId, tahunId) {
  const [rombel, setRombel] = useState([])
  const [mapel, setMapel] = useState([])
  const [guru, setGuru] = useState([])
  useEffect(() => {
    if (!effSchoolId) { setRombel([]); setMapel([]); setGuru([]); return }
    let q = supabase.from('rombel').select('id, nama_rombel, tingkat, tahun_ajaran_id').eq('school_id', effSchoolId).order('nama_rombel')
    if (tahunId) q = q.eq('tahun_ajaran_id', tahunId)
    q.then(({ data }) => setRombel(data || []))
    supabase.from('mata_pelajaran').select('id, nama').eq('school_id', effSchoolId).order('nama').then(({ data }) => setMapel(data || []))
    supabase.from('employees').select('id, nama').eq('school_id', effSchoolId).eq('status', 'aktif').order('nama').then(({ data }) => setGuru(data || []))
  }, [effSchoolId, tahunId])
  return { rombel, mapel, guru }
}

function NeedUnit() {
  return <p className="text-sm text-[var(--color-ink-soft)]">Pilih unit &amp; tahun ajaran lebih dulu.</p>
}

// =========================================================================
// DASHBOARD
// =========================================================================
function AcademicDashboard({ ctx }) {
  const { effSchoolId, tahunId, semester } = ctx
  const [d, setD] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    setLoading(true)
    const f = (q) => { if (effSchoolId) q = q.eq('school_id', effSchoolId); return q }
    Promise.all([
      f(supabase.from('penugasan_mengajar').select('id', { count: 'exact', head: true }).eq('semester', semester)).then((r) => r.count || 0),
      f(supabase.from('jadwal_pelajaran').select('id', { count: 'exact', head: true }).eq('semester', semester)).then((r) => r.count || 0),
      f(supabase.from('jurnal_kbm').select('id', { count: 'exact', head: true })).then((r) => r.count || 0),
      f(supabase.from('ekstrakurikuler').select('id', { count: 'exact', head: true })).then((r) => r.count || 0),
      f(supabase.from('perangkat_ajar').select('status')).then((r) => r.data || []),
    ]).then(([penugasan, jadwal, jurnal, ekskul, perangkat]) => {
      const st = { draft: 0, dikumpulkan: 0, diverifikasi: 0, revisi: 0 }
      perangkat.forEach((p) => { st[p.status] = (st[p.status] || 0) + 1 })
      setD({ penugasan, jadwal, jurnal, ekskul, perangkat: perangkat.length, st })
      setLoading(false)
    })
  }, [effSchoolId, tahunId, semester])
  if (loading || !d) return <FullPageSpinner />
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Penugasan Mengajar" value={d.penugasan} />
        <StatCard label="Slot Jadwal" value={d.jadwal} />
        <StatCard label="Jurnal KBM" value={d.jurnal} accent="gold" />
        <StatCard label="Ekstrakurikuler" value={d.ekskul} />
      </div>
      <SectionCard title="Monev Perangkat Ajar" description="Rekap status pengumpulan perangkat ajar (RPP/Modul/Prota/Prosem).">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div><div className="text-lg font-semibold text-[var(--color-ink-soft)]">{d.st.dikumpulkan}</div><div className="text-xs text-[var(--color-ink-soft)]">Dikumpulkan</div></div>
          <div><div className="text-lg font-semibold text-[var(--color-success)]">{d.st.diverifikasi}</div><div className="text-xs text-[var(--color-ink-soft)]">Terverifikasi</div></div>
          <div><div className="text-lg font-semibold text-[var(--color-danger)]">{d.st.revisi}</div><div className="text-xs text-[var(--color-ink-soft)]">Perlu Revisi</div></div>
          <div><div className="text-lg font-semibold text-[var(--color-ink-soft)]">{d.st.draft}</div><div className="text-xs text-[var(--color-ink-soft)]">Draft</div></div>
        </div>
      </SectionCard>
    </div>
  )
}

// =========================================================================
// PENUGASAN MENGAJAR
// =========================================================================
// =========================================================================
// MATA PELAJARAN
// =========================================================================
function MapelTab({ ctx }) {
  const { effSchoolId } = ctx
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const load = useCallback(async () => {
    if (!effSchoolId) { setRows([]); setLoading(false); return }
    setLoading(true)
    const { data } = await supabase.from('mata_pelajaran').select('*').eq('school_id', effSchoolId).order('nama')
    setRows(data || []); setLoading(false)
  }, [effSchoolId])
  useEffect(() => { load() }, [load])
  const del = async (r) => { if (!confirm(`Hapus mapel "${r.nama}"?`)) return; const { error } = await supabase.from('mata_pelajaran').delete().eq('id', r.id); if (error) { alert('Gagal: ' + error.message); return } load() }
  if (!effSchoolId) return <NeedUnit />
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end"><Button onClick={() => { setEditing(null); setOpen(true) }}><Plus className="h-4 w-4" /> Tambah Mapel</Button></div>
      <SectionCard title="Mata Pelajaran" description="Daftar mata pelajaran unit ini — dipakai di Penugasan, Jadwal, Jurnal, Kurikulum, dan Nilai & Rapor.">
        {loading ? <FullPageSpinner /> : rows.length === 0 ? (
          <EmptyState icon={BookOpen} title="Belum ada mata pelajaran" description="Tambahkan mata pelajaran untuk unit ini." />
        ) : (
          <Table columns={['Nama Mata Pelajaran', '']}>
            {rows.map((r) => (
              <Tr key={r.id}>
                <Td className="font-medium">{r.nama}</Td>
                <Td><div className="flex justify-end gap-1.5">
                  <button onClick={() => { setEditing(r); setOpen(true) }} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => del(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]"><Trash2 className="h-4 w-4" /></button>
                </div></Td>
              </Tr>
            ))}
          </Table>
        )}
      </SectionCard>
      <MapelModal open={open} effSchoolId={effSchoolId} editing={editing} onClose={() => { setOpen(false); setEditing(null) }} onSaved={() => { setOpen(false); setEditing(null); load() }} />
    </div>
  )
}

function MapelModal({ open, effSchoolId, editing, onClose, onSaved }) {
  const [nama, setNama] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { if (open) { setNama(editing?.nama || ''); setError('') } }, [open, editing])
  const submit = async (e) => {
    e.preventDefault()
    if (!nama.trim()) { setError('Isi nama mata pelajaran.'); return }
    setError(''); setSaving(true)
    const q = editing ? supabase.from('mata_pelajaran').update({ nama: nama.trim() }).eq('id', editing.id) : supabase.from('mata_pelajaran').insert({ school_id: effSchoolId, nama: nama.trim() })
    const { error: err } = await q
    setSaving(false); if (err) { setError(err.message); return }; onSaved()
  }
  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Ubah Mata Pelajaran' : 'Tambah Mata Pelajaran'} width="max-w-md">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Input label="Nama Mata Pelajaran" required value={nama} onChange={(e) => setNama(e.target.value)} placeholder="mis. Matematika, PAI, Bahasa Indonesia" />
        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Batal</Button><Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button></div>
      </form>
    </Modal>
  )
}

// =========================================================================
// PENUGASAN MENGAJAR
// =========================================================================
function PenugasanTab({ ctx }) {
  const { effSchoolId, tahunId, semester } = ctx
  const { rombel, mapel, guru } = useAcademicLists(effSchoolId, tahunId)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  const load = useCallback(async () => {
    if (!effSchoolId || !tahunId) { setRows([]); setLoading(false); return }
    setLoading(true)
    const { data } = await supabase.from('penugasan_mengajar')
      .select('*, mata_pelajaran(nama), rombel(nama_rombel), employees(nama)')
      .eq('school_id', effSchoolId).eq('tahun_ajaran_id', tahunId).eq('semester', semester)
      .order('created_at', { ascending: false })
    setRows(data || []); setLoading(false)
  }, [effSchoolId, tahunId, semester])
  useEffect(() => { load() }, [load])

  const del = async (r) => { if (!confirm('Hapus penugasan ini?')) return; await supabase.from('penugasan_mengajar').delete().eq('id', r.id); load() }

  const rekapGuru = useMemo(() => {
    const m = {}
    for (const r of rows) {
      const key = r.employee_id || '__none'
      if (!m[key]) m[key] = { nama: r.employees?.nama || 'Tanpa guru', jp: 0, n: 0 }
      m[key].jp += Number(r.jam_per_minggu || 0); m[key].n++
    }
    return Object.values(m).sort((a, b) => b.jp - a.jp)
  }, [rows])

  if (!effSchoolId || !tahunId) return <NeedUnit />
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end"><Button onClick={() => { setEditing(null); setOpen(true) }}><Plus className="h-4 w-4" /> Tambah Penugasan</Button></div>
      <SectionCard title="Penugasan Mengajar" description="Guru pengampu per mata pelajaran & rombel (dengan jam/minggu).">
        {loading ? <FullPageSpinner /> : rows.length === 0 ? (
          <EmptyState icon={GraduationCap} title="Belum ada penugasan" description="Tetapkan guru pengampu tiap mapel & rombel." />
        ) : (
          <Table columns={['Guru', 'Mata Pelajaran', 'Rombel', 'JTM', '']}>
            {rows.map((r) => (
              <Tr key={r.id}>
                <Td className="font-medium">{r.employees?.nama || '—'}</Td>
                <Td>{r.mata_pelajaran?.nama || '—'}</Td>
                <Td>{r.rombel?.nama_rombel || '—'}</Td>
                <Td>{r.jam_per_minggu} JP</Td>
                <Td><div className="flex justify-end gap-1.5">
                  <button onClick={() => { setEditing(r); setOpen(true) }} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => del(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]"><Trash2 className="h-4 w-4" /></button>
                </div></Td>
              </Tr>
            ))}
          </Table>
        )}
      </SectionCard>

      {rekapGuru.length > 0 && (
        <SectionCard title="Akumulasi JP per Guru" description="Total jam mengajar/minggu semester ini. Angka ini OTOMATIS mengisi 'JP Mengajar' pada modul Beban Kerja (Kepegawaian).">
          <Table columns={['Guru', 'Jml Penugasan', 'Total JP/Minggu']}>
            {rekapGuru.map((g, i) => (
              <Tr key={i}>
                <Td className="font-medium">{g.nama}</Td>
                <Td>{g.n}</Td>
                <Td className="font-medium">{g.jp} JP</Td>
              </Tr>
            ))}
          </Table>
        </SectionCard>
      )}

      <PenugasanModal open={open} ctx={ctx} lists={{ rombel, mapel, guru }} editing={editing} onClose={() => { setOpen(false); setEditing(null) }} onSaved={() => { setOpen(false); setEditing(null); load() }} />
    </div>
  )
}

// Form penugasan: satu guru bisa mengampu BANYAK (mapel × rombel) sekaligus.
function PenugasanModal({ open, ctx, lists, editing, onClose, onSaved }) {
  const { effSchoolId, tahunId, semester } = ctx
  const isEdit = !!editing
  const [employeeId, setEmployeeId] = useState('')
  const [items, setItems] = useState([{ mata_pelajaran_id: '', rombel_id: '', jam_per_minggu: '2' }])
  const [keterangan, setKeterangan] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return; setError('')
    if (editing) {
      setEmployeeId(editing.employee_id || '')
      setItems([{ mata_pelajaran_id: editing.mata_pelajaran_id || '', rombel_id: editing.rombel_id || '', jam_per_minggu: String(editing.jam_per_minggu ?? '0') }])
      setKeterangan(editing.keterangan || '')
    } else {
      setEmployeeId(''); setItems([{ mata_pelajaran_id: '', rombel_id: '', jam_per_minggu: '2' }]); setKeterangan('')
    }
  }, [open, editing])

  const setItem = (idx, k, v) => setItems((arr) => arr.map((it, i) => (i === idx ? { ...it, [k]: v } : it)))
  const addItem = () => setItems((arr) => [...arr, { mata_pelajaran_id: '', rombel_id: '', jam_per_minggu: '2' }])
  const removeItem = (idx) => setItems((arr) => (arr.length > 1 ? arr.filter((_, i) => i !== idx) : arr))
  const totalJp = items.reduce((a, it) => a + (Number(it.jam_per_minggu) || 0), 0)

  const submit = async (e) => {
    e.preventDefault()
    const valid = items.filter((it) => it.mata_pelajaran_id && it.rombel_id)
    if (valid.length === 0) { setError('Isi minimal satu baris mata pelajaran + rombel.'); return }
    setError(''); setSaving(true)
    if (isEdit) {
      const it = valid[0]
      const { error: err } = await supabase.from('penugasan_mengajar').update({ employee_id: employeeId || null, mata_pelajaran_id: it.mata_pelajaran_id, rombel_id: it.rombel_id, jam_per_minggu: Number(it.jam_per_minggu) || 0, keterangan: keterangan.trim() || null }).eq('id', editing.id)
      setSaving(false)
      if (err) { setError(err.message.includes('duplicate') ? 'Kombinasi mapel + rombel + semester sudah ada.' : err.message); return }
      onSaved(); return
    }
    const payload = valid.map((it) => ({ school_id: effSchoolId, tahun_ajaran_id: tahunId, semester, employee_id: employeeId || null, mata_pelajaran_id: it.mata_pelajaran_id, rombel_id: it.rombel_id, jam_per_minggu: Number(it.jam_per_minggu) || 0, keterangan: keterangan.trim() || null }))
    const { error: err } = await supabase.from('penugasan_mengajar').insert(payload)
    setSaving(false)
    if (err) { setError(err.message.includes('duplicate') ? 'Ada kombinasi mapel + rombel + semester yang sudah ada.' : err.message); return }
    onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Ubah Penugasan' : 'Tambah Penugasan Mengajar'} width="max-w-2xl">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Select label="Guru Pengampu" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
          <option value="">— Pilih guru —</option>
          {lists.guru.map((g) => <option key={g.id} value={g.id}>{g.nama}</option>)}
        </Select>
        <div className="flex flex-col gap-2">
          <label className="text-[13px] font-medium text-[var(--color-ink)]">Mata Pelajaran &amp; Rombel {isEdit ? '' : '(boleh lebih dari satu)'}</label>
          {items.map((it, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_1fr_84px_auto] items-center gap-2">
              <Select value={it.mata_pelajaran_id} onChange={(e) => setItem(idx, 'mata_pelajaran_id', e.target.value)}>
                <option value="">— Mapel —</option>
                {lists.mapel.map((m) => <option key={m.id} value={m.id}>{m.nama}</option>)}
              </Select>
              <Select value={it.rombel_id} onChange={(e) => setItem(idx, 'rombel_id', e.target.value)}>
                <option value="">— Rombel —</option>
                {lists.rombel.map((r) => <option key={r.id} value={r.id}>{r.nama_rombel}</option>)}
              </Select>
              <Input type="number" value={it.jam_per_minggu} onChange={(e) => setItem(idx, 'jam_per_minggu', e.target.value)} placeholder="JP" />
              {!isEdit && <button type="button" onClick={() => removeItem(idx)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus baris"><Trash2 className="h-4 w-4" /></button>}
            </div>
          ))}
          {!isEdit && (
            <div className="flex items-center justify-between">
              <button type="button" onClick={addItem} className="text-xs font-medium text-[var(--color-navy)] hover:underline">+ Tambah mapel/rombel</button>
              <span className="text-xs text-[var(--color-ink-soft)]">Total: <b>{totalJp} JP/minggu</b></span>
            </div>
          )}
        </div>
        {lists.mapel.length === 0 && <p className="rounded-md bg-[var(--color-gold-soft)] px-3 py-2 text-xs text-[var(--color-gold)]">Belum ada mata pelajaran di unit ini. Tambahkan dulu lewat menu "Mata Pelajaran".</p>}
        <Input label="Keterangan" value={keterangan} onChange={(e) => setKeterangan(e.target.value)} />
        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Batal</Button><Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button></div>
      </form>
    </Modal>
  )
}

// =========================================================================
// JADWAL PELAJARAN
// =========================================================================
function JadwalTab({ ctx }) {
  const { effSchoolId, tahunId, semester, isManager, employee } = ctx
  const { rombel, mapel, guru } = useAcademicLists(effSchoolId, tahunId)
  const [rombelId, setRombelId] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  const load = useCallback(async () => {
    if (!effSchoolId || !tahunId) { setRows([]); setLoading(false); return }
    setLoading(true)
    let q = supabase.from('jadwal_pelajaran')
      .select('*, mata_pelajaran(nama), rombel(nama_rombel), employees(nama), ruangan(nama)')
      .eq('school_id', effSchoolId).eq('tahun_ajaran_id', tahunId).eq('semester', semester)
    if (isManager && rombelId) q = q.eq('rombel_id', rombelId)
    if (!isManager && employee?.id) q = q.eq('employee_id', employee.id)
    const { data } = await q.order('hari').order('jam_ke')
    setRows(data || []); setLoading(false)
  }, [effSchoolId, tahunId, semester, rombelId, isManager, employee])
  useEffect(() => { load() }, [load])

  const del = async (r) => { if (!confirm('Hapus slot jadwal ini?')) return; await supabase.from('jadwal_pelajaran').delete().eq('id', r.id); load() }
  const byHari = useMemo(() => {
    const m = {}; rows.forEach((r) => { (m[r.hari] = m[r.hari] || []).push(r) }); return m
  }, [rows])

  if (!effSchoolId || !tahunId) return <NeedUnit />
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {isManager ? (
          <Select containerClassName="w-56" value={rombelId} onChange={(e) => setRombelId(e.target.value)}>
            <option value="">Semua Rombel</option>
            {rombel.map((r) => <option key={r.id} value={r.id}>{r.nama_rombel}</option>)}
          </Select>
        ) : <p className="text-sm text-[var(--color-ink-soft)]">Jadwal mengajar Anda semester ini.</p>}
        {isManager && <Button onClick={() => { setEditing(null); setOpen(true) }} disabled={!rombelId}><Plus className="h-4 w-4" /> Tambah Slot</Button>}
      </div>
      {loading ? <FullPageSpinner /> : rows.length === 0 ? (
        <EmptyState icon={CalendarRange} title="Belum ada jadwal" description={isManager ? 'Pilih rombel lalu tambahkan slot jadwal.' : 'Belum ada jadwal mengajar untuk Anda.'} />
      ) : (
        <div className="flex flex-col gap-4">
          {HARI_LIST.filter((h) => byHari[h.v]?.length).map((h) => (
            <SectionCard key={h.v} title={h.l}>
              <Table columns={['Jam', 'Waktu', 'Mapel', isManager ? 'Rombel' : 'Guru', 'Ruangan', isManager ? '' : null].filter((c) => c !== null)}>
                {byHari[h.v].map((r) => (
                  <Tr key={r.id}>
                    <Td>Ke-{r.jam_ke}</Td>
                    <Td className="text-xs">{r.jam_mulai ? r.jam_mulai.slice(0, 5) : '—'}{r.jam_selesai ? `–${r.jam_selesai.slice(0, 5)}` : ''}</Td>
                    <Td className="font-medium">{r.mata_pelajaran?.nama || '—'}</Td>
                    <Td>{isManager ? (r.rombel?.nama_rombel || '—') : (r.employees?.nama || '—')}</Td>
                    <Td className="text-xs">{r.ruangan?.nama || '—'}</Td>
                    {isManager && <Td><div className="flex justify-end gap-1.5">
                      <button onClick={() => { setEditing(r); setOpen(true) }} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => del(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]"><Trash2 className="h-4 w-4" /></button>
                    </div></Td>}
                  </Tr>
                ))}
              </Table>
            </SectionCard>
          ))}
        </div>
      )}
      <JadwalModal open={open} ctx={ctx} lists={{ rombel, mapel, guru }} rombelId={rombelId} editing={editing} onClose={() => { setOpen(false); setEditing(null) }} onSaved={() => { setOpen(false); setEditing(null); load() }} />
    </div>
  )
}

function JadwalModal({ open, ctx, lists, rombelId, editing, onClose, onSaved }) {
  const { effSchoolId, tahunId, semester } = ctx
  const [ruangan, setRuangan] = useState([])
  const [f, setF] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!open) return; setError('')
    setF(editing
      ? { rombel_id: editing.rombel_id || '', hari: String(editing.hari || 1), jam_ke: String(editing.jam_ke ?? '1'), jam_mulai: editing.jam_mulai || '', jam_selesai: editing.jam_selesai || '', mata_pelajaran_id: editing.mata_pelajaran_id || '', employee_id: editing.employee_id || '', ruangan_id: editing.ruangan_id || '' }
      : { rombel_id: rombelId || '', hari: '1', jam_ke: '1', jam_mulai: '', jam_selesai: '', mata_pelajaran_id: '', employee_id: '', ruangan_id: '' })
  }, [open, editing, rombelId])
  useEffect(() => { if (open && effSchoolId) supabase.from('ruangan').select('id, nama').eq('school_id', effSchoolId).order('nama').then(({ data }) => setRuangan(data || [])) }, [open, effSchoolId])
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  // Prefill guru dari penugasan saat mapel+rombel dipilih.
  const onPickMapel = async (mid) => {
    setF((s) => ({ ...s, mata_pelajaran_id: mid }))
    if (mid && f.rombel_id) {
      const { data } = await supabase.from('penugasan_mengajar').select('employee_id').eq('mata_pelajaran_id', mid).eq('rombel_id', f.rombel_id).eq('semester', semester).maybeSingle()
      if (data?.employee_id) setF((s) => ({ ...s, mata_pelajaran_id: mid, employee_id: data.employee_id }))
    }
  }
  const submit = async (e) => {
    e.preventDefault()
    if (!f.rombel_id) { setError('Pilih rombel.'); return }
    setError(''); setSaving(true)
    const payload = { school_id: effSchoolId, tahun_ajaran_id: tahunId, semester, rombel_id: f.rombel_id, hari: Number(f.hari), jam_ke: Number(f.jam_ke) || 1, jam_mulai: f.jam_mulai || null, jam_selesai: f.jam_selesai || null, mata_pelajaran_id: f.mata_pelajaran_id || null, employee_id: f.employee_id || null, ruangan_id: f.ruangan_id || null }
    const q = editing ? supabase.from('jadwal_pelajaran').update(payload).eq('id', editing.id) : supabase.from('jadwal_pelajaran').insert(payload)
    const { error: err } = await q
    setSaving(false); if (err) { setError(err.message); return }; onSaved()
  }
  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Ubah Slot Jadwal' : 'Tambah Slot Jadwal'} width="max-w-lg">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Select label="Rombel" value={f.rombel_id || ''} onChange={(e) => set('rombel_id', e.target.value)}>
            <option value="">— Pilih —</option>
            {lists.rombel.map((r) => <option key={r.id} value={r.id}>{r.nama_rombel}</option>)}
          </Select>
          <Select label="Hari" value={f.hari || '1'} onChange={(e) => set('hari', e.target.value)}>
            {HARI_LIST.map((h) => <option key={h.v} value={h.v}>{h.l}</option>)}
          </Select>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Input label="Jam ke-" type="number" value={f.jam_ke ?? ''} onChange={(e) => set('jam_ke', e.target.value)} />
          <Input label="Mulai" type="time" value={f.jam_mulai || ''} onChange={(e) => set('jam_mulai', e.target.value)} />
          <Input label="Selesai" type="time" value={f.jam_selesai || ''} onChange={(e) => set('jam_selesai', e.target.value)} />
        </div>
        <Select label="Mata Pelajaran" value={f.mata_pelajaran_id || ''} onChange={(e) => onPickMapel(e.target.value)}>
          <option value="">— Pilih —</option>
          {lists.mapel.map((m) => <option key={m.id} value={m.id}>{m.nama}</option>)}
        </Select>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Guru" value={f.employee_id || ''} onChange={(e) => set('employee_id', e.target.value)}>
            <option value="">— Pilih —</option>
            {lists.guru.map((g) => <option key={g.id} value={g.id}>{g.nama}</option>)}
          </Select>
          <Select label="Ruangan" value={f.ruangan_id || ''} onChange={(e) => set('ruangan_id', e.target.value)}>
            <option value="">— (opsional) —</option>
            {ruangan.map((r) => <option key={r.id} value={r.id}>{r.nama}</option>)}
          </Select>
        </div>
        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Batal</Button><Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button></div>
      </form>
    </Modal>
  )
}

// =========================================================================
// JURNAL KBM
// =========================================================================
function JurnalTab({ ctx }) {
  const { effSchoolId, tahunId, isManager, employee } = ctx
  const { rombel, mapel } = useAcademicLists(effSchoolId, tahunId)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  const load = useCallback(async () => {
    if (!effSchoolId) { setRows([]); setLoading(false); return }
    setLoading(true)
    let q = supabase.from('jurnal_kbm').select('*, mata_pelajaran(nama), rombel(nama_rombel), employees(nama)').eq('school_id', effSchoolId)
    if (!isManager && employee?.id) q = q.eq('employee_id', employee.id)
    const { data } = await q.order('tanggal', { ascending: false }).limit(200)
    setRows(data || []); setLoading(false)
  }, [effSchoolId, isManager, employee])
  useEffect(() => { load() }, [load])

  const del = async (r) => { if (!confirm('Hapus jurnal ini?')) return; await supabase.from('jurnal_kbm').delete().eq('id', r.id); load() }
  const canWrite = isManager || !!employee?.id

  if (!effSchoolId) return <NeedUnit />
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">{canWrite && <Button onClick={() => { setEditing(null); setOpen(true) }}><Plus className="h-4 w-4" /> Isi Jurnal</Button>}</div>
      <SectionCard title="Jurnal KBM" description={isManager ? 'Jurnal mengajar seluruh guru di unit ini.' : 'Jurnal mengajar Anda.'}>
        {loading ? <FullPageSpinner /> : rows.length === 0 ? (
          <EmptyState icon={ClipboardList} title="Belum ada jurnal" description="Catat kegiatan mengajar harian." />
        ) : (
          <div className="overflow-x-auto">
            <Table columns={['Tanggal', 'Kelas', 'Mapel', isManager ? 'Guru' : 'Jam', 'Materi', 'Kehadiran', 'Siswa', '']}>
              {rows.map((r) => (
                <Tr key={r.id}>
                  <Td className="text-xs">{fmtTgl(r.tanggal)}</Td>
                  <Td>{r.rombel?.nama_rombel || '—'}</Td>
                  <Td>{r.mata_pelajaran?.nama || '—'}</Td>
                  <Td className="text-xs">{isManager ? (r.employees?.nama || '—') : (r.jam_ke ? `Ke-${r.jam_ke}` : '—')}</Td>
                  <Td className="max-w-[220px] truncate" title={r.materi || ''}>{r.materi || '—'}</Td>
                  <Td className="text-xs">{KEHADIRAN_GURU_LABEL[r.kehadiran_guru] || r.kehadiran_guru}</Td>
                  <Td className="text-xs">{r.jml_hadir != null && r.jml_siswa != null ? `${r.jml_hadir}/${r.jml_siswa}` : '—'}</Td>
                  <Td><div className="flex justify-end gap-1.5">
                    <button onClick={() => { setEditing(r); setOpen(true) }} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => del(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]"><Trash2 className="h-4 w-4" /></button>
                  </div></Td>
                </Tr>
              ))}
            </Table>
          </div>
        )}
      </SectionCard>
      <JurnalModal open={open} ctx={ctx} lists={{ rombel, mapel }} editing={editing} onClose={() => { setOpen(false); setEditing(null) }} onSaved={() => { setOpen(false); setEditing(null); load() }} />
    </div>
  )
}

function JurnalModal({ open, ctx, lists, editing, onClose, onSaved }) {
  const { effSchoolId, tahunId, isManager, employee } = ctx
  const [f, setF] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!open) return; setError('')
    setF(editing
      ? { rombel_id: editing.rombel_id || '', mata_pelajaran_id: editing.mata_pelajaran_id || '', tanggal: editing.tanggal || '', jam_ke: String(editing.jam_ke ?? ''), materi: editing.materi || '', kegiatan: editing.kegiatan || '', kehadiran_guru: editing.kehadiran_guru || 'hadir', jml_siswa: String(editing.jml_siswa ?? ''), jml_hadir: String(editing.jml_hadir ?? ''), kendala: editing.kendala || '', catatan: editing.catatan || '' }
      : { rombel_id: '', mata_pelajaran_id: '', tanggal: new Date().toISOString().slice(0, 10), jam_ke: '', materi: '', kegiatan: '', kehadiran_guru: 'hadir', jml_siswa: '', jml_hadir: '', kendala: '', catatan: '' })
  }, [open, editing])
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const submit = async (e) => {
    e.preventDefault()
    if (!f.materi?.trim()) { setError('Isi materi/kegiatan.'); return }
    setError(''); setSaving(true)
    const payload = {
      school_id: effSchoolId, tahun_ajaran_id: tahunId || null, semester,
      rombel_id: f.rombel_id || null, mata_pelajaran_id: f.mata_pelajaran_id || null,
      employee_id: editing ? editing.employee_id : (isManager ? null : employee?.id),
      tanggal: f.tanggal || null, jam_ke: f.jam_ke === '' ? null : Number(f.jam_ke),
      materi: f.materi.trim(), kegiatan: f.kegiatan?.trim() || null, kehadiran_guru: f.kehadiran_guru,
      jml_siswa: f.jml_siswa === '' ? null : Number(f.jml_siswa), jml_hadir: f.jml_hadir === '' ? null : Number(f.jml_hadir),
      kendala: f.kendala?.trim() || null, catatan: f.catatan?.trim() || null,
    }
    const q = editing ? supabase.from('jurnal_kbm').update(payload).eq('id', editing.id) : supabase.from('jurnal_kbm').insert(payload)
    const { error: err } = await q
    setSaving(false); if (err) { setError(err.message); return }; onSaved()
  }
  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Ubah Jurnal KBM' : 'Isi Jurnal KBM'} width="max-w-lg">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Select label="Rombel" value={f.rombel_id || ''} onChange={(e) => set('rombel_id', e.target.value)}>
            <option value="">— Pilih —</option>
            {lists.rombel.map((r) => <option key={r.id} value={r.id}>{r.nama_rombel}</option>)}
          </Select>
          <Select label="Mata Pelajaran" value={f.mata_pelajaran_id || ''} onChange={(e) => set('mata_pelajaran_id', e.target.value)}>
            <option value="">— Pilih —</option>
            {lists.mapel.map((m) => <option key={m.id} value={m.id}>{m.nama}</option>)}
          </Select>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Input label="Tanggal" type="date" value={f.tanggal || ''} onChange={(e) => set('tanggal', e.target.value)} />
          <Input label="Jam ke-" type="number" value={f.jam_ke ?? ''} onChange={(e) => set('jam_ke', e.target.value)} />
          <Select label="Kehadiran Guru" value={f.kehadiran_guru || 'hadir'} onChange={(e) => set('kehadiran_guru', e.target.value)}>
            {KEHADIRAN_GURU_OPTIONS.map((k) => <option key={k} value={k}>{KEHADIRAN_GURU_LABEL[k]}</option>)}
          </Select>
        </div>
        <Input label="Materi / Kompetensi" value={f.materi || ''} onChange={(e) => set('materi', e.target.value)} />
        <Textarea label="Kegiatan Pembelajaran" rows={2} value={f.kegiatan || ''} onChange={(e) => set('kegiatan', e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Jumlah Siswa" type="number" value={f.jml_siswa ?? ''} onChange={(e) => set('jml_siswa', e.target.value)} />
          <Input label="Hadir" type="number" value={f.jml_hadir ?? ''} onChange={(e) => set('jml_hadir', e.target.value)} />
        </div>
        <Input label="Kendala" value={f.kendala || ''} onChange={(e) => set('kendala', e.target.value)} />
        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Batal</Button><Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button></div>
      </form>
    </Modal>
  )
}

// =========================================================================
// KURIKULUM & KKM
// =========================================================================
function KurikulumTab({ ctx }) {
  const { effSchoolId, tahunId } = ctx
  const { mapel } = useAcademicLists(effSchoolId, tahunId)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const load = useCallback(async () => {
    if (!effSchoolId) { setRows([]); setLoading(false); return }
    setLoading(true)
    const { data } = await supabase.from('kurikulum_kkm').select('*, mata_pelajaran(nama)').eq('school_id', effSchoolId).order('created_at', { ascending: false })
    setRows(data || []); setLoading(false)
  }, [effSchoolId])
  useEffect(() => { load() }, [load])
  const del = async (r) => { if (!confirm('Hapus data ini?')) return; await supabase.from('kurikulum_kkm').delete().eq('id', r.id); load() }
  if (!effSchoolId) return <NeedUnit />
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end"><Button onClick={() => { setEditing(null); setOpen(true) }}><Plus className="h-4 w-4" /> Tambah CP/KKM</Button></div>
      <SectionCard title="Kurikulum & KKM" description="Capaian Pembelajaran / KD & Kriteria Ketuntasan Minimal per mata pelajaran.">
        {loading ? <FullPageSpinner /> : rows.length === 0 ? (
          <EmptyState icon={BookOpen} title="Belum ada data" description="Tetapkan CP/KD & KKM per mapel." />
        ) : (
          <Table columns={['Mapel', 'Tingkat', 'KKM', 'CP / KD', '']}>
            {rows.map((r) => (
              <Tr key={r.id}>
                <Td className="font-medium">{r.mata_pelajaran?.nama || '—'}</Td>
                <Td>{r.tingkat || '—'}</Td>
                <Td>{r.kkm ?? '—'}</Td>
                <Td className="max-w-[280px] truncate" title={r.cp_kd || ''}>{r.cp_kd || '—'}</Td>
                <Td><div className="flex justify-end gap-1.5">
                  <button onClick={() => { setEditing(r); setOpen(true) }} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => del(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]"><Trash2 className="h-4 w-4" /></button>
                </div></Td>
              </Tr>
            ))}
          </Table>
        )}
      </SectionCard>
      <KurikulumModal open={open} ctx={ctx} mapel={mapel} editing={editing} onClose={() => { setOpen(false); setEditing(null) }} onSaved={() => { setOpen(false); setEditing(null); load() }} />
    </div>
  )
}

function KurikulumModal({ open, ctx, mapel, editing, onClose, onSaved }) {
  const { effSchoolId, tahunId, semester } = ctx
  const [f, setF] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!open) return; setError('')
    setF(editing ? { mata_pelajaran_id: editing.mata_pelajaran_id || '', tingkat: editing.tingkat || '', kkm: String(editing.kkm ?? ''), cp_kd: editing.cp_kd || '', keterangan: editing.keterangan || '' }
      : { mata_pelajaran_id: '', tingkat: '', kkm: '70', cp_kd: '', keterangan: '' })
  }, [open, editing])
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const submit = async (e) => {
    e.preventDefault()
    if (!f.mata_pelajaran_id) { setError('Pilih mata pelajaran.'); return }
    setError(''); setSaving(true)
    const payload = { school_id: effSchoolId, mata_pelajaran_id: f.mata_pelajaran_id, tingkat: f.tingkat?.trim() || null, tahun_ajaran_id: tahunId || null, semester, kkm: f.kkm === '' ? null : Number(f.kkm), cp_kd: f.cp_kd?.trim() || null, keterangan: f.keterangan?.trim() || null }
    const q = editing ? supabase.from('kurikulum_kkm').update(payload).eq('id', editing.id) : supabase.from('kurikulum_kkm').insert(payload)
    const { error: err } = await q
    setSaving(false); if (err) { setError(err.message); return }; onSaved()
  }
  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Ubah CP/KKM' : 'Tambah CP/KKM'} width="max-w-lg">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-3">
          <Select label="Mata Pelajaran" containerClassName="col-span-2" value={f.mata_pelajaran_id || ''} onChange={(e) => set('mata_pelajaran_id', e.target.value)}>
            <option value="">— Pilih —</option>
            {mapel.map((m) => <option key={m.id} value={m.id}>{m.nama}</option>)}
          </Select>
          <Input label="Tingkat" value={f.tingkat || ''} onChange={(e) => set('tingkat', e.target.value)} placeholder="7 / X" />
        </div>
        <Input label="KKM" type="number" value={f.kkm ?? ''} onChange={(e) => set('kkm', e.target.value)} />
        <Textarea label="Capaian Pembelajaran / KD" rows={3} value={f.cp_kd || ''} onChange={(e) => set('cp_kd', e.target.value)} />
        <Input label="Keterangan" value={f.keterangan || ''} onChange={(e) => set('keterangan', e.target.value)} />
        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Batal</Button><Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button></div>
      </form>
    </Modal>
  )
}

// =========================================================================
// EKSTRAKURIKULER
// =========================================================================
function EkstraTab({ ctx }) {
  const { effSchoolId, tahunId } = ctx
  const { guru } = useAcademicLists(effSchoolId, tahunId)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [pesertaOf, setPesertaOf] = useState(null)
  const load = useCallback(async () => {
    if (!effSchoolId) { setRows([]); setLoading(false); return }
    setLoading(true)
    const { data } = await supabase.from('ekstrakurikuler').select('*, employees(nama), ekskul_peserta(id)').eq('school_id', effSchoolId).order('nama')
    setRows(data || []); setLoading(false)
  }, [effSchoolId])
  useEffect(() => { load() }, [load])
  const del = async (r) => { if (!confirm(`Hapus ekskul "${r.nama}"?`)) return; await supabase.from('ekstrakurikuler').delete().eq('id', r.id); load() }
  if (!effSchoolId) return <NeedUnit />
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end"><Button onClick={() => { setEditing(null); setOpen(true) }}><Plus className="h-4 w-4" /> Tambah Ekstrakurikuler</Button></div>
      <SectionCard title="Ekstrakurikuler">
        {loading ? <FullPageSpinner /> : rows.length === 0 ? (
          <EmptyState icon={Award} title="Belum ada ekstrakurikuler" description="Tambahkan kegiatan ekstrakurikuler & pembinanya." />
        ) : (
          <Table columns={['Nama', 'Pembina', 'Jadwal', 'Peserta', '']}>
            {rows.map((r) => (
              <Tr key={r.id}>
                <Td className="font-medium">{r.nama}</Td>
                <Td>{r.employees?.nama || '—'}</Td>
                <Td className="text-xs">{r.jadwal || '—'}</Td>
                <Td>{r.ekskul_peserta?.length || 0}</Td>
                <Td><div className="flex justify-end gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => setPesertaOf(r)}><Users className="h-3.5 w-3.5" /> Peserta</Button>
                  <button onClick={() => { setEditing(r); setOpen(true) }} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => del(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]"><Trash2 className="h-4 w-4" /></button>
                </div></Td>
              </Tr>
            ))}
          </Table>
        )}
      </SectionCard>
      <EkstraModal open={open} ctx={ctx} guru={guru} editing={editing} onClose={() => { setOpen(false); setEditing(null) }} onSaved={() => { setOpen(false); setEditing(null); load() }} />
      <EkstraPesertaModal ekskul={pesertaOf} effSchoolId={effSchoolId} onClose={() => setPesertaOf(null)} onChanged={load} />
    </div>
  )
}

function EkstraModal({ open, ctx, guru, editing, onClose, onSaved }) {
  const { effSchoolId, tahunId } = ctx
  const [f, setF] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!open) return; setError('')
    setF(editing ? { nama: editing.nama || '', pembina_employee_id: editing.pembina_employee_id || '', jadwal: editing.jadwal || '', keterangan: editing.keterangan || '' } : { nama: '', pembina_employee_id: '', jadwal: '', keterangan: '' })
  }, [open, editing])
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const submit = async (e) => {
    e.preventDefault()
    if (!f.nama?.trim()) { setError('Isi nama ekskul.'); return }
    setError(''); setSaving(true)
    const payload = { school_id: effSchoolId, tahun_ajaran_id: tahunId || null, nama: f.nama.trim(), pembina_employee_id: f.pembina_employee_id || null, jadwal: f.jadwal?.trim() || null, keterangan: f.keterangan?.trim() || null }
    const q = editing ? supabase.from('ekstrakurikuler').update(payload).eq('id', editing.id) : supabase.from('ekstrakurikuler').insert(payload)
    const { error: err } = await q
    setSaving(false); if (err) { setError(err.message); return }; onSaved()
  }
  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Ubah Ekstrakurikuler' : 'Tambah Ekstrakurikuler'} width="max-w-lg">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Input label="Nama" required value={f.nama || ''} onChange={(e) => set('nama', e.target.value)} placeholder="Pramuka, Futsal, Tahfizh…" />
        <Select label="Pembina" value={f.pembina_employee_id || ''} onChange={(e) => set('pembina_employee_id', e.target.value)}>
          <option value="">— Pilih —</option>
          {guru.map((g) => <option key={g.id} value={g.id}>{g.nama}</option>)}
        </Select>
        <Input label="Jadwal" value={f.jadwal || ''} onChange={(e) => set('jadwal', e.target.value)} placeholder="Jumat, 14.00–16.00" />
        <Input label="Keterangan" value={f.keterangan || ''} onChange={(e) => set('keterangan', e.target.value)} />
        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Batal</Button><Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button></div>
      </form>
    </Modal>
  )
}

function EkstraPesertaModal({ ekskul, effSchoolId, onClose, onChanged }) {
  const open = !!ekskul
  const [peserta, setPeserta] = useState([])
  const [siswa, setSiswa] = useState([])
  const [sel, setSel] = useState('')
  const [saving, setSaving] = useState(false)
  const load = useCallback(async () => {
    if (!ekskul) return
    const { data } = await supabase.from('ekskul_peserta').select('*, siswa(nama_lengkap)').eq('ekskul_id', ekskul.id).order('created_at')
    setPeserta(data || [])
  }, [ekskul])
  useEffect(() => {
    if (!open) return; setSel(''); load()
    supabase.from('siswa').select('id, nama_lengkap').eq('school_id', effSchoolId).eq('status', 'aktif').order('nama_lengkap').then(({ data }) => setSiswa(data || []))
  }, [open, load, effSchoolId])
  const add = async () => {
    if (!sel) return; setSaving(true)
    const { error } = await supabase.from('ekskul_peserta').insert({ ekskul_id: ekskul.id, siswa_id: sel })
    setSaving(false); if (error) { alert(error.message.includes('duplicate') ? 'Siswa sudah terdaftar.' : error.message); return }
    setSel(''); load(); if (onChanged) onChanged()
  }
  const del = async (p) => { await supabase.from('ekskul_peserta').delete().eq('id', p.id); load(); if (onChanged) onChanged() }
  const setNilai = async (p, nilai) => { await supabase.from('ekskul_peserta').update({ nilai }).eq('id', p.id); load() }
  if (!ekskul) return null
  return (
    <Modal open={open} onClose={onClose} title={`Peserta — ${ekskul.nama}`} width="max-w-xl">
      <div className="flex flex-col gap-3">
        <div className="flex items-end gap-2">
          <Select containerClassName="flex-1" label="Tambah Siswa" value={sel} onChange={(e) => setSel(e.target.value)}>
            <option value="">— Pilih siswa —</option>
            {siswa.map((s) => <option key={s.id} value={s.id}>{s.nama_lengkap}</option>)}
          </Select>
          <Button type="button" onClick={add} disabled={!sel || saving}><Plus className="h-4 w-4" /> Tambah</Button>
        </div>
        <div className="overflow-x-auto">
          <Table columns={['Siswa', 'Nilai/Predikat', '']}>
            {peserta.length === 0 ? <Tr><Td>—</Td><Td></Td><Td></Td></Tr> : peserta.map((p) => (
              <Tr key={p.id}>
                <Td className="font-medium">{p.siswa?.nama_lengkap || '—'}</Td>
                <Td><Input value={p.nilai || ''} onChange={(e) => setNilai(p, e.target.value)} placeholder="A / B / 85" /></Td>
                <Td className="text-right"><button onClick={() => del(p)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]"><Trash2 className="h-4 w-4" /></button></Td>
              </Tr>
            ))}
          </Table>
        </div>
      </div>
    </Modal>
  )
}

// =========================================================================
// PERANGKAT AJAR & MONEV
// =========================================================================
function PerangkatTab({ ctx }) {
  const { effSchoolId, tahunId, isManager, employee } = ctx
  const { rombel, mapel } = useAcademicLists(effSchoolId, tahunId)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [monevOf, setMonevOf] = useState(null)
  const [fJenis, setFJenis] = useState('')

  const load = useCallback(async () => {
    if (!effSchoolId) { setRows([]); setLoading(false); return }
    setLoading(true)
    let q = supabase.from('perangkat_ajar').select('*, mata_pelajaran(nama), rombel(nama_rombel), employees:employee_id(nama), reviewer:reviewer_employee_id(nama)').eq('school_id', effSchoolId)
    if (tahunId) q = q.eq('tahun_ajaran_id', tahunId)
    if (!isManager && employee?.id) q = q.eq('employee_id', employee.id)
    const { data } = await q.order('created_at', { ascending: false })
    setRows(data || []); setLoading(false)
  }, [effSchoolId, tahunId, isManager, employee])
  useEffect(() => { load() }, [load])

  const del = async (r) => { if (!confirm('Hapus perangkat ini?')) return; await supabase.from('perangkat_ajar').delete().eq('id', r.id); load() }
  const buka = async (r) => {
    if (!r.file_url) return
    if (r.is_link) { window.open(r.file_url, '_blank', 'noopener'); return }
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(r.file_url, 120)
    if (error) { alert('Gagal membuka berkas: ' + error.message); return }
    window.open(data.signedUrl, '_blank', 'noopener')
  }
  const filtered = fJenis ? rows.filter((r) => r.jenis === fJenis) : rows

  if (!effSchoolId) return <NeedUnit />
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Select containerClassName="w-48" value={fJenis} onChange={(e) => setFJenis(e.target.value)}>
          <option value="">Semua Jenis</option>
          {JENIS_PERANGKAT.map((j) => <option key={j} value={j}>{j}</option>)}
        </Select>
        {!isManager && <Button onClick={() => { setEditing(null); setOpen(true) }}><Plus className="h-4 w-4" /> Kumpulkan Perangkat</Button>}
      </div>
      <SectionCard title={isManager ? 'Monev Perangkat Ajar' : 'Perangkat Ajar Saya'} description={isManager ? 'Pantau & verifikasi pengumpulan perangkat ajar guru.' : 'Kumpulkan RPP/Modul Ajar/Prota/Prosem; pantau status verifikasinya.'}>
        {loading ? <FullPageSpinner /> : filtered.length === 0 ? (
          <EmptyState icon={FileText} title="Belum ada perangkat" description={isManager ? 'Belum ada guru yang mengumpulkan.' : 'Kumpulkan perangkat ajar Anda.'} />
        ) : (
          <div className="overflow-x-auto">
            <Table columns={[isManager ? 'Guru' : 'Judul', 'Jenis', 'Mapel', 'Kelas', 'Status', 'Nilai', '']}>
              {filtered.map((r) => (
                <Tr key={r.id}>
                  <Td className="font-medium">{isManager ? (r.employees?.nama || '—') : (r.judul || r.jenis)}</Td>
                  <Td>{r.jenis}</Td>
                  <Td className="text-xs">{r.mata_pelajaran?.nama || '—'}</Td>
                  <Td className="text-xs">{r.rombel?.nama_rombel || '—'}</Td>
                  <Td><Badge color={PERANGKAT_STATUS_BADGE[r.status]}>{PERANGKAT_STATUS_LABEL[r.status]}</Badge>{r.status === 'revisi' && r.review_catatan && <span className="block text-[11px] text-[var(--color-danger)]" title={r.review_catatan}>catatan revisi</span>}</Td>
                  <Td>{r.nilai_monev ?? '—'}</Td>
                  <Td><div className="flex justify-end gap-1.5">
                    {r.file_url && <button onClick={() => buka(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Buka berkas"><ExternalLink className="h-4 w-4" /></button>}
                    {isManager && <Button size="sm" variant="outline" onClick={() => setMonevOf(r)}><CheckCircle2 className="h-3.5 w-3.5" /> Monev</Button>}
                    {!isManager && ['draft', 'dikumpulkan', 'revisi'].includes(r.status) && <button onClick={() => { setEditing(r); setOpen(true) }} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]"><Pencil className="h-4 w-4" /></button>}
                    {!isManager && <button onClick={() => del(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]"><Trash2 className="h-4 w-4" /></button>}
                  </div></Td>
                </Tr>
              ))}
            </Table>
          </div>
        )}
      </SectionCard>
      <PerangkatModal open={open} ctx={ctx} lists={{ rombel, mapel }} editing={editing} onClose={() => { setOpen(false); setEditing(null) }} onSaved={() => { setOpen(false); setEditing(null); load() }} />
      <MonevModal item={monevOf} onClose={() => setMonevOf(null)} onSaved={() => { setMonevOf(null); load() }} />
    </div>
  )
}

function PerangkatModal({ open, ctx, lists, editing, onClose, onSaved }) {
  const { effSchoolId, tahunId, semester, employee } = ctx
  const [f, setF] = useState({})
  const [file, setFile] = useState(null)
  const [mode, setMode] = useState('file')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!open) return; setError(''); setFile(null)
    setMode(editing?.is_link ? 'link' : 'file')
    setF(editing ? { jenis: editing.jenis || 'RPP', judul: editing.judul || '', mata_pelajaran_id: editing.mata_pelajaran_id || '', rombel_id: editing.rombel_id || '', file_url: editing.file_url || '' }
      : { jenis: 'RPP', judul: '', mata_pelajaran_id: '', rombel_id: '', file_url: '' })
  }, [open, editing])
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const submit = async (e) => {
    e.preventDefault()
    setError(''); setSaving(true)
    let file_url = f.file_url, is_link = mode === 'link'
    if (mode === 'file' && file) {
      const path = `perangkat-ajar/${effSchoolId}/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file)
      if (upErr) { setSaving(false); setError('Gagal unggah: ' + upErr.message); return }
      file_url = path; is_link = false
    }
    if (mode === 'link') file_url = f.file_url?.trim() || null
    const base = { school_id: effSchoolId, tahun_ajaran_id: tahunId || null, semester, jenis: f.jenis, judul: f.judul?.trim() || null, mata_pelajaran_id: f.mata_pelajaran_id || null, rombel_id: f.rombel_id || null, is_link, status: 'dikumpulkan' }
    let err
    if (editing) {
      const patch = { ...base }
      if (file_url) patch.file_url = file_url
      ;({ error: err } = await supabase.from('perangkat_ajar').update(patch).eq('id', editing.id))
    } else {
      ;({ error: err } = await supabase.from('perangkat_ajar').insert({ ...base, employee_id: employee?.id, file_url }))
    }
    setSaving(false); if (err) { setError(err.message); return }; onSaved()
  }
  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Ubah Perangkat Ajar' : 'Kumpulkan Perangkat Ajar'} width="max-w-lg">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Select label="Jenis" value={f.jenis || 'RPP'} onChange={(e) => set('jenis', e.target.value)}>
            {JENIS_PERANGKAT.map((j) => <option key={j} value={j}>{j}</option>)}
          </Select>
          <Input label="Judul" value={f.judul || ''} onChange={(e) => set('judul', e.target.value)} placeholder="mis. RPP Bab 1" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Mata Pelajaran" value={f.mata_pelajaran_id || ''} onChange={(e) => set('mata_pelajaran_id', e.target.value)}>
            <option value="">— (opsional) —</option>
            {lists.mapel.map((m) => <option key={m.id} value={m.id}>{m.nama}</option>)}
          </Select>
          <Select label="Rombel" value={f.rombel_id || ''} onChange={(e) => set('rombel_id', e.target.value)}>
            <option value="">— (opsional) —</option>
            {lists.rombel.map((r) => <option key={r.id} value={r.id}>{r.nama_rombel}</option>)}
          </Select>
        </div>
        <div className="flex gap-2 text-sm">
          <button type="button" onClick={() => setMode('file')} className={`rounded-full px-3 py-1 ${mode === 'file' ? 'bg-[var(--color-navy)] text-white' : 'bg-black/[0.05]'}`}>Unggah Berkas</button>
          <button type="button" onClick={() => setMode('link')} className={`rounded-full px-3 py-1 ${mode === 'link' ? 'bg-[var(--color-navy)] text-white' : 'bg-black/[0.05]'}`}>Tautan (Drive dll)</button>
        </div>
        {mode === 'file' ? (
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-[var(--color-border)] px-3 py-3 text-sm text-[var(--color-ink-soft)]">
            <Upload className="h-4 w-4" /> {file ? file.name : (editing?.file_url && !editing?.is_link ? 'Berkas sudah ada — pilih untuk mengganti' : 'Pilih berkas (PDF/DOCX)')}
            <input type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </label>
        ) : (
          <Input label="Tautan Berkas" value={f.file_url || ''} onChange={(e) => set('file_url', e.target.value)} placeholder="https://drive.google.com/…" />
        )}
        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Batal</Button><Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Kumpulkan'}</Button></div>
      </form>
    </Modal>
  )
}

function MonevModal({ item, onClose, onSaved }) {
  const open = !!item
  const [f, setF] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!open) return; setError('')
    setF({ status: item.status === 'draft' || item.status === 'dikumpulkan' ? 'diverifikasi' : item.status, review_catatan: item.review_catatan || '', nilai_monev: String(item.nilai_monev ?? '') })
  }, [open, item])
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const submit = async (e) => {
    e.preventDefault()
    if (f.status === 'revisi' && !f.review_catatan?.trim()) { setError('Isi catatan revisi.'); return }
    setError(''); setSaving(true)
    const { error: err } = await supabase.from('perangkat_ajar').update({ status: f.status, review_catatan: f.review_catatan?.trim() || null, nilai_monev: f.nilai_monev === '' ? null : Number(f.nilai_monev) }).eq('id', item.id)
    setSaving(false); if (err) { setError(err.message); return }; onSaved()
  }
  if (!item) return null
  return (
    <Modal open={open} onClose={onClose} title="Monev / Verifikasi Perangkat" width="max-w-md">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <p className="text-sm text-[var(--color-ink-soft)]">{item.jenis}{item.judul ? ` — ${item.judul}` : ''} · {item.employees?.nama || ''}</p>
        <Select label="Hasil Verifikasi" value={f.status || 'diverifikasi'} onChange={(e) => set('status', e.target.value)}>
          <option value="diverifikasi">Terverifikasi (sesuai)</option>
          <option value="revisi">Perlu Revisi</option>
        </Select>
        <Input label="Nilai Monev (0–100, opsional)" type="number" value={f.nilai_monev ?? ''} onChange={(e) => set('nilai_monev', e.target.value)} />
        <Textarea label="Catatan" rows={3} value={f.review_catatan || ''} onChange={(e) => set('review_catatan', e.target.value)} />
        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Batal</Button><Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan Monev'}</Button></div>
      </form>
    </Modal>
  )
}
