import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, Navigate } from 'react-router-dom'
import { CalendarRange, ClipboardList, BookOpen, Users, GraduationCap, Plus, Pencil, Trash2, Upload, FileText, CheckCircle2, ShieldAlert, Award, ExternalLink, Printer, AlertTriangle, CalendarDays, UserPlus, ClipboardCheck, RefreshCw } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, SectionCard, Button, Badge, Table, Tr, Td, Modal, Input, Select, Textarea, EmptyState, FullPageSpinner, StatCard } from '../../components/ui'
import {
  ACADEMIC_AREAS, ACADEMIC_DEFAULT_MANAGER, ACADEMIC_DEFAULT_GURU, SEMESTER_OPTIONS,
  HARI_LIST, JENIS_PERANGKAT, KEHADIRAN_GURU_OPTIONS, KEHADIRAN_GURU_LABEL,
  PERANGKAT_STATUS_LABEL, PERANGKAT_STATUS_BADGE, HARI_LABEL,
  JENIS_KALENDER, JENIS_KALENDER_LABEL, JENIS_KALENDER_BADGE,
  PPDB_STATUS, PPDB_STATUS_LABEL, PPDB_JALUR, PERANGKAT_WAJIB_DEFAULT,
  hariIso, slotBentrok, openCetakAkd, isoLocal, hitungRekapKbm, liburDariKalender,
} from '../../lib/academic'
import { DEFAULT_BEBAN_KERJA_SETTINGS } from '../../lib/workload'

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
      <PageHeader title={`Akademik — ${isManager ? active.label : (active.labelGuru || active.label)}`} description="Manajemen pembelajaran: kalender, penugasan, jadwal, jurnal KBM, kurikulum, ekstrakurikuler, perangkat ajar, dan PPDB." />
      <AcademicCtxBar ctx={ctx} />
      {active.slug === 'dashboard' && <AcademicDashboard ctx={ctx} />}
      {active.slug === 'mapel' && <MapelTab ctx={ctx} />}
      {active.slug === 'penugasan' && <PenugasanTab ctx={ctx} />}
      {active.slug === 'jadwal' && <JadwalTab ctx={ctx} />}
      {active.slug === 'jurnal' && <JurnalTab ctx={ctx} />}
      {active.slug === 'kurikulum' && <KurikulumTab ctx={ctx} />}
      {active.slug === 'ekstrakurikuler' && <EkstraTab ctx={ctx} />}
      {active.slug === 'perangkat' && <PerangkatTab ctx={ctx} />}
      {active.slug === 'kalender' && <KalenderTab ctx={ctx} />}
      {active.slug === 'rekap-kbm' && <RekapKbmTab ctx={ctx} />}
      {active.slug === 'ppdb' && <PpdbTab ctx={ctx} />}
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
    const ta = (q) => (tahunId ? q.eq('tahun_ajaran_id', tahunId) : q)
    Promise.all([
      f(ta(supabase.from('penugasan_mengajar').select('id', { count: 'exact', head: true }).eq('semester', semester))).then((r) => r.count || 0),
      f(ta(supabase.from('jadwal_pelajaran').select('id', { count: 'exact', head: true }).eq('semester', semester))).then((r) => r.count || 0),
      f(supabase.from('jurnal_kbm').select('id', { count: 'exact', head: true })).then((r) => r.count || 0),
      f(supabase.from('ekstrakurikuler').select('id', { count: 'exact', head: true })).then((r) => r.count || 0),
      f(supabase.from('perangkat_ajar').select('status')).then((r) => r.data || []),
      (() => {
        const hariIni = isoLocal(new Date())
        let q = supabase.from('kalender_akademik').select('*').or(`tanggal_mulai.gte.${hariIni},tanggal_selesai.gte.${hariIni}`).order('tanggal_mulai').limit(6)
        if (effSchoolId) q = q.or(`school_id.is.null,school_id.eq.${effSchoolId}`)
        return q.then((r) => r.data || [])
      })(),
      (() => {
        let q = f(supabase.from('ppdb_pendaftar').select('status'))
        if (tahunId) q = q.eq('tahun_ajaran_id', tahunId)
        return q.then((r) => r.data || [])
      })(),
    ]).then(([penugasan, jadwal, jurnal, ekskul, perangkat, agenda, ppdb]) => {
      const st = { draft: 0, dikumpulkan: 0, diverifikasi: 0, revisi: 0 }
      perangkat.forEach((p) => { st[p.status] = (st[p.status] || 0) + 1 })
      const pp = { total: ppdb.length, diterima: ppdb.filter((x) => x.status === 'diterima').length, proses: ppdb.filter((x) => ['daftar', 'verifikasi'].includes(x.status)).length }
      setD({ penugasan, jadwal, jurnal, ekskul, perangkat: perangkat.length, st, agenda, pp })
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
      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Agenda Akademik Terdekat" description="Dari Kalender Akademik (unit ini & seluruh yayasan).">
          {d.agenda.length === 0 ? <p className="text-sm text-[var(--color-ink-soft)]">Belum ada agenda mendatang.</p> : (
            <ul className="flex flex-col gap-2">
              {d.agenda.map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-2 text-sm">
                  <span><span className="font-medium">{a.judul}</span><span className="block text-xs text-[var(--color-ink-soft)]">{fmtTgl(a.tanggal_mulai)}{a.tanggal_selesai && a.tanggal_selesai !== a.tanggal_mulai ? ` – ${fmtTgl(a.tanggal_selesai)}` : ''}</span></span>
                  <Badge color={JENIS_KALENDER_BADGE[a.jenis]}>{JENIS_KALENDER_LABEL[a.jenis]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        <SectionCard title="PPDB Tahun Ajaran Ini" description="Rekap pendaftar penerimaan peserta didik baru.">
          <div className="grid grid-cols-3 gap-3">
            <div><div className="text-lg font-semibold text-[var(--color-navy)]">{d.pp.total}</div><div className="text-xs text-[var(--color-ink-soft)]">Pendaftar</div></div>
            <div><div className="text-lg font-semibold text-[var(--color-gold)]">{d.pp.proses}</div><div className="text-xs text-[var(--color-ink-soft)]">Dalam proses</div></div>
            <div><div className="text-lg font-semibold text-[var(--color-success)]">{d.pp.diterima}</div><div className="text-xs text-[var(--color-ink-soft)]">Diterima</div></div>
          </div>
        </SectionCard>
      </div>
    </div>
  )
}

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

  // Data pendukung validasi JTM: standar min/maks + JP ekuivalensi tugas tambahan & jabatan struktural.
  const [std, setStd] = useState(DEFAULT_BEBAN_KERJA_SETTINGS)
  const [ekuiv, setEkuiv] = useState({})
  const empIds = useMemo(() => [...new Set(rows.map((r) => r.employee_id).filter(Boolean))], [rows])
  const empKey = empIds.join(',')
  useEffect(() => {
    supabase.from('beban_kerja_settings').select('*').maybeSingle().then(({ data }) => { if (data) setStd(data) })
  }, [])
  useEffect(() => {
    const ids = empKey ? empKey.split(',') : []
    if (ids.length === 0) { setEkuiv({}); return }
    Promise.all([
      supabase.from('employees').select('id, positions(nama, tunjangan_jenis, jp_ekuivalensi)').in('id', ids),
      supabase.from('employee_tugas_tambahan').select('employee_id, tugas_tambahan(nama, jp_ekuivalensi)').in('employee_id', ids),
    ]).then(([{ data: emp }, { data: tt }]) => {
      const m = {}
      for (const e of emp || []) {
        const p = e.positions
        if (p?.tunjangan_jenis === 'struktural' && Number(p.jp_ekuivalensi) > 0) (m[e.id] ||= []).push({ nama: p.nama, jp: Number(p.jp_ekuivalensi) })
      }
      for (const t of tt || []) {
        if (Number(t.tugas_tambahan?.jp_ekuivalensi) > 0) (m[t.employee_id] ||= []).push({ nama: t.tugas_tambahan.nama, jp: Number(t.tugas_tambahan.jp_ekuivalensi) })
      }
      setEkuiv(m)
    })
  }, [empKey])

  const jpMin = Number(std.beban_mengajar_min) || DEFAULT_BEBAN_KERJA_SETTINGS.beban_mengajar_min
  const jpMaks = Number(std.beban_mengajar_maks) || DEFAULT_BEBAN_KERJA_SETTINGS.beban_mengajar_maks
  const rekapGuru = useMemo(() => {
    const m = {}
    for (const r of rows) {
      const key = r.employee_id || '__none'
      if (!m[key]) m[key] = { id: r.employee_id, nama: r.employees?.nama || 'Tanpa guru', jp: 0, n: 0 }
      m[key].jp += Number(r.jam_per_minggu || 0); m[key].n++
    }
    return Object.values(m).map((g) => {
      const tambahan = g.id ? (ekuiv[g.id] || []) : []
      const jpTambahan = tambahan.reduce((a, t) => a + t.jp, 0)
      const total = g.jp + jpTambahan
      const status = !g.id ? null : total < jpMin ? 'kurang' : total > jpMaks ? 'lebih' : 'ok'
      return { ...g, tambahan, jpTambahan, total, status }
    }).sort((a, b) => b.total - a.total)
  }, [rows, ekuiv, jpMin, jpMaks])
  const nKurang = rekapGuru.filter((g) => g.status === 'kurang').length
  const nLebih = rekapGuru.filter((g) => g.status === 'lebih').length

  if (!effSchoolId || !tahunId) return <NeedUnit />
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => openCetakAkd('sk_tugas_mengajar', effSchoolId, { ta: tahunId, sem: semester })} disabled={rows.length === 0}><Printer className="h-4 w-4" /> Cetak SK Pembagian Tugas</Button>
        <Button onClick={() => { setEditing(null); setOpen(true) }}><Plus className="h-4 w-4" /> Tambah Penugasan</Button>
      </div>
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
        <SectionCard title="Akumulasi & Validasi JTM per Guru" description={`JP mengajar semester ini + JP ekuivalensi tugas tambahan/jabatan struktural, dibandingkan standar beban mengajar ${jpMin}–${jpMaks} JP/minggu (Pengaturan Beban Kerja). JP mengajar OTOMATIS mengisi 'JP Mengajar' di modul Beban Kerja.`}>
          {(nKurang > 0 || nLebih > 0) && (
            <p className="mb-3 flex items-center gap-2 rounded-md bg-[var(--color-gold-soft)] px-3 py-2 text-xs text-[var(--color-gold)]">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {nKurang > 0 && <span>{nKurang} guru di bawah {jpMin} JP.</span>}
              {nLebih > 0 && <span>{nLebih} guru melebihi {jpMaks} JP.</span>}
            </p>
          )}
          <div className="overflow-x-auto">
            <Table columns={['Guru', 'Penugasan', 'JP Mengajar', 'JP Tugas Tambahan', 'Total JTM', 'Status']}>
              {rekapGuru.map((g, i) => (
                <Tr key={i}>
                  <Td className="font-medium">{g.nama}</Td>
                  <Td>{g.n}</Td>
                  <Td>{g.jp} JP</Td>
                  <Td className="text-xs" title={g.tambahan.map((t) => `${t.nama}: ${t.jp} JP`).join('\n')}>{g.jpTambahan > 0 ? `${g.jpTambahan} JP (${g.tambahan.map((t) => t.nama).join(', ')})` : '—'}</Td>
                  <Td className="font-semibold">{g.total} JP</Td>
                  <Td>{g.status === 'kurang' ? <Badge color="gold">Kurang</Badge> : g.status === 'lebih' ? <Badge color="danger">Berlebih</Badge> : g.status === 'ok' ? <Badge color="success">Memenuhi</Badge> : '—'}</Td>
                </Tr>
              ))}
            </Table>
          </div>
          <p className="mt-2 text-[11px] text-[var(--color-ink-soft)]">Catatan: JP mengajar dihitung dari penugasan di unit ini saja; guru yang juga mengajar di unit lain dapat tampil "Kurang".</p>
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

  const [allRows, setAllRows] = useState([])
  const [guruCetak, setGuruCetak] = useState('')

  // Manajer memuat SELURUH slot unit (untuk deteksi bentrok lintas rombel), lalu disaring per rombel di layar.
  const load = useCallback(async () => {
    if (!effSchoolId || !tahunId) { setAllRows([]); setLoading(false); return }
    setLoading(true)
    let q = supabase.from('jadwal_pelajaran')
      .select('*, mata_pelajaran(nama), rombel(nama_rombel), employees(nama), ruangan(nama)')
      .eq('school_id', effSchoolId).eq('tahun_ajaran_id', tahunId).eq('semester', semester)
    if (!isManager && employee?.id) q = q.eq('employee_id', employee.id)
    const { data } = await q.order('hari').order('jam_ke')
    setAllRows(data || []); setLoading(false)
  }, [effSchoolId, tahunId, semester, isManager, employee])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    setRows(isManager && rombelId ? allRows.filter((r) => r.rombel_id === rombelId) : allRows)
  }, [allRows, rombelId, isManager])

  // Deteksi bentrok: slot yang beririsan waktunya pada rombel / guru / ruangan yang sama.
  const bentrok = useMemo(() => {
    const m = {}
    const add = (id, why) => { (m[id] ||= new Set()).add(why) }
    for (let i = 0; i < allRows.length; i++) {
      for (let j = i + 1; j < allRows.length; j++) {
        const a = allRows[i]; const b = allRows[j]
        if (!slotBentrok(a, b)) continue
        if (a.rombel_id && a.rombel_id === b.rombel_id) { add(a.id, 'rombel'); add(b.id, 'rombel') }
        if (a.employee_id && a.employee_id === b.employee_id) { add(a.id, 'guru'); add(b.id, 'guru') }
        if (a.ruangan_id && a.ruangan_id === b.ruangan_id) { add(a.id, 'ruangan'); add(b.id, 'ruangan') }
      }
    }
    return m
  }, [allRows])
  const nBentrok = Object.keys(bentrok).length

  const del = async (r) => { if (!confirm('Hapus slot jadwal ini?')) return; await supabase.from('jadwal_pelajaran').delete().eq('id', r.id); load() }
  const byHari = useMemo(() => {
    const m = {}; rows.forEach((r) => { (m[r.hari] = m[r.hari] || []).push(r) }); return m
  }, [rows])
  const guruDiJadwal = useMemo(() => {
    const m = new Map(); allRows.forEach((r) => { if (r.employee_id) m.set(r.employee_id, r.employees?.nama || '—') })
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [allRows])
  const qsCetak = { ta: tahunId, sem: semester }

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
        <div className="flex flex-wrap items-center gap-2">
          {isManager ? (
            <>
              <Button variant="outline" onClick={() => openCetakAkd('jadwal_rombel', rombelId, qsCetak)} disabled={!rombelId}><Printer className="h-4 w-4" /> Cetak Jadwal Kelas</Button>
              <Select containerClassName="w-48" value={guruCetak} onChange={(e) => setGuruCetak(e.target.value)}>
                <option value="">— Guru (cetak) —</option>
                {guruDiJadwal.map(([id, nm]) => <option key={id} value={id}>{nm}</option>)}
              </Select>
              <Button variant="outline" onClick={() => openCetakAkd('jadwal_guru', guruCetak, qsCetak)} disabled={!guruCetak}><Printer className="h-4 w-4" /> Cetak Jadwal Guru</Button>
              <Button onClick={() => { setEditing(null); setOpen(true) }} disabled={!rombelId}><Plus className="h-4 w-4" /> Tambah Slot</Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => openCetakAkd('jadwal_guru', employee?.id, qsCetak)} disabled={!employee?.id || rows.length === 0}><Printer className="h-4 w-4" /> Cetak Jadwal Saya</Button>
          )}
        </div>
      </div>
      {isManager && nBentrok > 0 && (
        <p className="flex items-center gap-2 rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">
          <AlertTriangle className="h-4 w-4 shrink-0" /> Terdeteksi {nBentrok} slot jadwal bentrok (guru / rombel / ruangan dipakai di waktu yang sama). Slot bertanda merah perlu diperbaiki.
        </p>
      )}
      {loading ? <FullPageSpinner /> : rows.length === 0 ? (
        <EmptyState icon={CalendarRange} title="Belum ada jadwal" description={isManager ? 'Pilih rombel lalu tambahkan slot jadwal.' : 'Belum ada jadwal mengajar untuk Anda.'} />
      ) : (
        <div className="flex flex-col gap-4">
          {HARI_LIST.filter((h) => byHari[h.v]?.length).map((h) => (
            <SectionCard key={h.v} title={h.l}>
              <Table columns={['Jam', 'Waktu', 'Mapel', isManager ? 'Rombel / Guru' : 'Kelas', 'Ruangan', isManager ? '' : null].filter((c) => c !== null)}>
                {byHari[h.v].map((r) => (
                  <Tr key={r.id}>
                    <Td>Ke-{r.jam_ke}</Td>
                    <Td className="text-xs">{r.jam_mulai ? r.jam_mulai.slice(0, 5) : '—'}{r.jam_selesai ? `–${r.jam_selesai.slice(0, 5)}` : ''}</Td>
                    <Td className="font-medium">{r.mata_pelajaran?.nama || '—'}{bentrok[r.id] && <span className="ml-1.5 inline-block"><Badge color="danger">Bentrok: {[...bentrok[r.id]].join(', ')}</Badge></span>}</Td>
                    <Td>{isManager ? <>{r.rombel?.nama_rombel || '—'}<span className="block text-[11px] text-[var(--color-ink-soft)]">{r.employees?.nama || 'guru belum diisi'}</span></> : (r.rombel?.nama_rombel || '—')}</Td>
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
      const { data } = await supabase.from('penugasan_mengajar').select('employee_id').eq('mata_pelajaran_id', mid).eq('rombel_id', f.rombel_id).eq('tahun_ajaran_id', tahunId).eq('semester', semester).limit(1).maybeSingle()
      if (data?.employee_id) setF((s) => ({ ...s, mata_pelajaran_id: mid, employee_id: data.employee_id }))
    }
  }
  const submit = async (e) => {
    e.preventDefault()
    if (!f.rombel_id) { setError('Pilih rombel.'); return }
    if (f.jam_mulai && f.jam_selesai && f.jam_selesai <= f.jam_mulai) { setError('Jam selesai harus setelah jam mulai.'); return }
    setError(''); setSaving(true)
    const payload = { school_id: effSchoolId, tahun_ajaran_id: tahunId, semester, rombel_id: f.rombel_id, hari: Number(f.hari), jam_ke: f.jam_ke === '' || f.jam_ke == null ? 1 : Number(f.jam_ke), jam_mulai: f.jam_mulai || null, jam_selesai: f.jam_selesai || null, mata_pelajaran_id: f.mata_pelajaran_id || null, employee_id: f.employee_id || null, ruangan_id: f.ruangan_id || null }
    // Cek bentrok dengan slot lain di hari yang sama (rombel / guru / ruangan).
    const { data: sameDay } = await supabase.from('jadwal_pelajaran')
      .select('id, rombel_id, employee_id, ruangan_id, hari, jam_ke, jam_mulai, jam_selesai, rombel(nama_rombel), employees(nama), ruangan(nama), mata_pelajaran(nama)')
      .eq('school_id', effSchoolId).eq('tahun_ajaran_id', tahunId).eq('semester', semester).eq('hari', payload.hari)
    const konflik = []
    for (const o of sameDay || []) {
      if (editing && o.id === editing.id) continue
      if (!slotBentrok(payload, o)) continue
      if (o.rombel_id === payload.rombel_id) konflik.push(`Rombel ${o.rombel?.nama_rombel || ''} sudah ada ${o.mata_pelajaran?.nama || 'pelajaran'} (jam ke-${o.jam_ke})`)
      if (payload.employee_id && o.employee_id === payload.employee_id) konflik.push(`Guru ${o.employees?.nama || ''} sudah mengajar di ${o.rombel?.nama_rombel || 'kelas lain'} (jam ke-${o.jam_ke})`)
      if (payload.ruangan_id && o.ruangan_id === payload.ruangan_id) konflik.push(`Ruangan ${o.ruangan?.nama || ''} dipakai ${o.rombel?.nama_rombel || 'kelas lain'} (jam ke-${o.jam_ke})`)
    }
    if (konflik.length > 0 && !confirm(`Jadwal BENTROK pada ${HARI_LABEL[payload.hari]}:\n\n• ${konflik.join('\n• ')}\n\nTetap simpan?`)) { setSaving(false); setError('Dibatalkan karena bentrok: ' + konflik.join('; ')); return }
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
  const { effSchoolId, tahunId, semester, isManager, employee } = ctx
  const { rombel, mapel } = useAcademicLists(effSchoolId, tahunId)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [prefill, setPrefill] = useState(null)
  const [tglSesi, setTglSesi] = useState(isoLocal(new Date()))
  const [sesi, setSesi] = useState([])
  const [terisi, setTerisi] = useState({})

  // Sesi KBM menurut Jadwal pada tanggal terpilih + penanda jurnal sudah/belum diisi.
  const loadSesi = useCallback(async () => {
    if (!effSchoolId || !tahunId || !tglSesi) { setSesi([]); return }
    const hari = hariIso(new Date(`${tglSesi}T00:00:00`))
    let q = supabase.from('jadwal_pelajaran').select('*, mata_pelajaran(nama), rombel(nama_rombel), employees(nama)')
      .eq('school_id', effSchoolId).eq('tahun_ajaran_id', tahunId).eq('semester', semester).eq('hari', hari)
    if (!isManager && employee?.id) q = q.eq('employee_id', employee.id)
    const { data } = await q.order('jam_ke')
    const list = data || []
    setSesi(list)
    if (list.length === 0) { setTerisi({}); return }
    const { data: j } = await supabase.from('jurnal_kbm').select('id, jadwal_id').eq('tanggal', tglSesi).in('jadwal_id', list.map((x) => x.id))
    setTerisi(Object.fromEntries((j || []).map((x) => [x.jadwal_id, x.id])))
  }, [effSchoolId, tahunId, semester, tglSesi, isManager, employee])
  useEffect(() => { loadSesi() }, [loadSesi])
  const isiDariJadwal = (s) => {
    setEditing(null)
    setPrefill({ rombel_id: s.rombel_id || '', mata_pelajaran_id: s.mata_pelajaran_id || '', jam_ke: s.jam_ke != null ? String(s.jam_ke) : '', jadwal_id: s.id, tanggal: tglSesi, employee_id: s.employee_id || null, label: `${s.mata_pelajaran?.nama || 'Mapel'} — ${s.rombel?.nama_rombel || ''}${isManager ? ` (${s.employees?.nama || 'guru?'})` : ''}` })
    setOpen(true)
  }

  const load = useCallback(async () => {
    if (!effSchoolId) { setRows([]); setLoading(false); return }
    setLoading(true)
    let q = supabase.from('jurnal_kbm').select('*, mata_pelajaran(nama), rombel(nama_rombel), employees(nama)').eq('school_id', effSchoolId)
    if (!isManager && employee?.id) q = q.eq('employee_id', employee.id)
    const { data } = await q.order('tanggal', { ascending: false }).limit(200)
    setRows(data || []); setLoading(false)
  }, [effSchoolId, isManager, employee])
  useEffect(() => { load() }, [load])

  const del = async (r) => { if (!confirm('Hapus jurnal ini?')) return; await supabase.from('jurnal_kbm').delete().eq('id', r.id); load(); loadSesi() }
  const canWrite = isManager || !!employee?.id

  if (!effSchoolId) return <NeedUnit />
  return (
    <div className="flex flex-col gap-4">
      {tahunId && (
        <SectionCard title="Sesi Mengajar Menurut Jadwal" description="Isi jurnal langsung dari jadwal — kelas, mapel, jam, dan kehadiran siswa (dari Presensi Siswa) terisi otomatis.">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Input type="date" containerClassName="w-44" value={tglSesi} onChange={(e) => setTglSesi(e.target.value)} />
            <span className="text-sm text-[var(--color-ink-soft)]">{tglSesi ? HARI_LABEL[hariIso(new Date(`${tglSesi}T00:00:00`))] : ''}</span>
            <button type="button" onClick={loadSesi} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Muat ulang"><RefreshCw className="h-4 w-4" /></button>
          </div>
          {sesi.length === 0 ? <p className="text-sm text-[var(--color-ink-soft)]">Tidak ada sesi terjadwal pada hari ini.</p> : (
            <div className="overflow-x-auto">
              <Table columns={['Jam', 'Kelas', 'Mapel', isManager ? 'Guru' : null, 'Jurnal', ''].filter((c) => c !== null)}>
                {sesi.map((s) => (
                  <Tr key={s.id}>
                    <Td className="text-xs">Ke-{s.jam_ke}{s.jam_mulai ? ` · ${s.jam_mulai.slice(0, 5)}` : ''}</Td>
                    <Td>{s.rombel?.nama_rombel || '—'}</Td>
                    <Td>{s.mata_pelajaran?.nama || '—'}</Td>
                    {isManager && <Td className="text-xs">{s.employees?.nama || '—'}</Td>}
                    <Td>{terisi[s.id] ? <Badge color="success">Sudah diisi</Badge> : <Badge color="gold">Belum</Badge>}</Td>
                    <Td><div className="flex justify-end">{!terisi[s.id] && canWrite && <Button size="sm" onClick={() => isiDariJadwal(s)}><ClipboardList className="h-3.5 w-3.5" /> Isi Jurnal</Button>}</div></Td>
                  </Tr>
                ))}
              </Table>
            </div>
          )}
        </SectionCard>
      )}
      <div className="flex justify-end">{canWrite && <Button variant="outline" onClick={() => { setEditing(null); setPrefill(null); setOpen(true) }}><Plus className="h-4 w-4" /> Isi Jurnal Manual</Button>}</div>
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
                    <button onClick={() => { setPrefill(null); setEditing(r); setOpen(true) }} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => del(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]"><Trash2 className="h-4 w-4" /></button>
                  </div></Td>
                </Tr>
              ))}
            </Table>
          </div>
        )}
      </SectionCard>
      <JurnalModal open={open} ctx={ctx} lists={{ rombel, mapel }} editing={editing} prefill={prefill} onClose={() => { setOpen(false); setEditing(null); setPrefill(null) }} onSaved={() => { setOpen(false); setEditing(null); setPrefill(null); load(); loadSesi() }} />
    </div>
  )
}

function JurnalModal({ open, ctx, lists, editing, prefill, onClose, onSaved }) {
  const { effSchoolId, tahunId, semester, isManager, employee } = ctx
  const [f, setF] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [infoPresensi, setInfoPresensi] = useState('')
  useEffect(() => {
    if (!open) return; setError(''); setInfoPresensi('')
    setF(editing
      ? { rombel_id: editing.rombel_id || '', mata_pelajaran_id: editing.mata_pelajaran_id || '', tanggal: editing.tanggal || '', jam_ke: String(editing.jam_ke ?? ''), materi: editing.materi || '', kegiatan: editing.kegiatan || '', kehadiran_guru: editing.kehadiran_guru || 'hadir', jml_siswa: String(editing.jml_siswa ?? ''), jml_hadir: String(editing.jml_hadir ?? ''), kendala: editing.kendala || '', catatan: editing.catatan || '' }
      : { rombel_id: prefill?.rombel_id || '', mata_pelajaran_id: prefill?.mata_pelajaran_id || '', tanggal: prefill?.tanggal || isoLocal(new Date()), jam_ke: prefill?.jam_ke || '', materi: '', kegiatan: '', kehadiran_guru: 'hadir', jml_siswa: '', jml_hadir: '', kendala: '', catatan: '' })
  }, [open, editing, prefill])
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  // Tarik jumlah siswa & kehadiran dari Presensi Siswa (harian) rombel pada tanggal tsb.
  const tarikPresensi = useCallback(async (rombelId, tanggal, silent) => {
    if (!rombelId || !tanggal) { if (!silent) setInfoPresensi('Pilih rombel & tanggal dulu.'); return }
    const { data, error: err } = await supabase.rpc('rombel_kehadiran_hari', { p_rombel_id: rombelId, p_tanggal: tanggal })
    if (err) { if (!silent) setInfoPresensi('Gagal menarik presensi: ' + err.message); return }
    const r = Array.isArray(data) ? data[0] : data
    if (!r) return
    setF((s) => ({ ...s, jml_siswa: String(r.jml_siswa ?? ''), jml_hadir: r.tercatat > 0 ? String(r.jml_hadir ?? '') : s.jml_hadir }))
    setInfoPresensi(r.tercatat > 0 ? `Dari Presensi Siswa: ${r.jml_hadir} hadir dari ${r.jml_siswa} siswa.` : `Presensi siswa tanggal ini belum diisi wali kelas — jumlah siswa (${r.jml_siswa}) diambil dari data rombel; isi "Hadir" manual.`)
  }, [])
  useEffect(() => {
    if (open && !editing && prefill?.rombel_id) tarikPresensi(prefill.rombel_id, prefill.tanggal, true)
  }, [open, editing, prefill, tarikPresensi])
  const submit = async (e) => {
    e.preventDefault()
    if (!f.materi?.trim()) { setError('Isi materi/kegiatan.'); return }
    setError(''); setSaving(true)
    const payload = {
      school_id: editing ? editing.school_id : effSchoolId,
      tahun_ajaran_id: editing ? editing.tahun_ajaran_id : (tahunId || null),
      semester: editing ? editing.semester : semester,
      rombel_id: f.rombel_id || null, mata_pelajaran_id: f.mata_pelajaran_id || null,
      employee_id: editing ? editing.employee_id : (prefill?.employee_id || (isManager ? null : employee?.id)),
      jadwal_id: editing ? (editing.jadwal_id || null) : (prefill?.jadwal_id || null),
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
        {!editing && prefill?.label && <p className="rounded-md bg-[var(--color-navy-soft,#eef2f7)] px-3 py-2 text-xs text-[var(--color-navy)]">Dari jadwal: <b>{prefill.label}</b></p>}
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
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => tarikPresensi(f.rombel_id, f.tanggal, false)} className="text-xs font-medium text-[var(--color-navy)] hover:underline">↻ Tarik dari Presensi Siswa</button>
          {infoPresensi && <span className="text-xs text-[var(--color-ink-soft)]">{infoPresensi}</span>}
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
  const { effSchoolId, tahunId, tahunList } = ctx
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
          <Table columns={['Mapel', 'Tingkat', 'Berlaku', 'KKM', 'CP / KD', '']}>
            {rows.map((r) => (
              <Tr key={r.id}>
                <Td className="font-medium">{r.mata_pelajaran?.nama || '—'}</Td>
                <Td>{r.tingkat || 'Semua'}</Td>
                <Td className="text-xs">{r.semester || 'Semua semester'} · {tahunList.find((t) => t.id === r.tahun_ajaran_id)?.nama || 'semua tahun'}</Td>
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
  const { effSchoolId, tahunId, tahunList } = ctx
  const [f, setF] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!open) return; setError('')
    setF(editing ? { mata_pelajaran_id: editing.mata_pelajaran_id || '', tingkat: editing.tingkat || '', kkm: String(editing.kkm ?? ''), cp_kd: editing.cp_kd || '', keterangan: editing.keterangan || '', semester: editing.semester || '', tahun_ajaran_id: editing.tahun_ajaran_id || '' }
      : { mata_pelajaran_id: '', tingkat: '', kkm: '70', cp_kd: '', keterangan: '', semester: '', tahun_ajaran_id: tahunId || '' })
  }, [open, editing, tahunId])
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const submit = async (e) => {
    e.preventDefault()
    if (!f.mata_pelajaran_id) { setError('Pilih mata pelajaran.'); return }
    setError(''); setSaving(true)
    const payload = { school_id: editing ? editing.school_id : effSchoolId, mata_pelajaran_id: f.mata_pelajaran_id, tingkat: f.tingkat?.trim() || null, tahun_ajaran_id: f.tahun_ajaran_id || null, semester: f.semester || null, kkm: f.kkm === '' ? null : Number(f.kkm), cp_kd: f.cp_kd?.trim() || null, keterangan: f.keterangan?.trim() || null }
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
          <Input label="Tingkat" value={f.tingkat || ''} onChange={(e) => set('tingkat', e.target.value)} placeholder="kosong = semua" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Input label="KKM" type="number" value={f.kkm ?? ''} onChange={(e) => set('kkm', e.target.value)} />
          <Select label="Berlaku Semester" value={f.semester || ''} onChange={(e) => set('semester', e.target.value)}>
            <option value="">Semua semester</option>
            {SEMESTER_OPTIONS.map((x) => <option key={x} value={x}>{x}</option>)}
          </Select>
          <Select label="Tahun Ajaran" value={f.tahun_ajaran_id || ''} onChange={(e) => set('tahun_ajaran_id', e.target.value)}>
            <option value="">Semua tahun</option>
            {(tahunList || []).map((t) => <option key={t.id} value={t.id}>{t.nama}</option>)}
          </Select>
        </div>
        <p className="-mt-1 text-[11px] text-[var(--color-ink-soft)]">KKM dipakai otomatis di Nilai &amp; Rapor (status Tuntas/Belum Tuntas). Isi Tingkat persis seperti tingkat rombel (mis. 7), atau kosongkan agar berlaku untuk semua tingkat.</p>
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
    const payload = { school_id: editing ? editing.school_id : effSchoolId, tahun_ajaran_id: editing ? editing.tahun_ajaran_id : (tahunId || null), nama: f.nama.trim(), pembina_employee_id: f.pembina_employee_id || null, jadwal: f.jadwal?.trim() || null, keterangan: f.keterangan?.trim() || null }
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
      {isManager && !loading && <PerangkatRekap ctx={ctx} rows={rows} />}
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
    const base = { school_id: editing ? editing.school_id : effSchoolId, tahun_ajaran_id: editing ? editing.tahun_ajaran_id : (tahunId || null), semester: editing ? editing.semester : semester, jenis: f.jenis, judul: f.judul?.trim() || null, mata_pelajaran_id: f.mata_pelajaran_id || null, rombel_id: f.rombel_id || null, is_link, status: 'dikumpulkan' }
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

// Rekap kelengkapan perangkat ajar per guru (MONEV) terhadap daftar perangkat wajib.
function PerangkatRekap({ ctx, rows }) {
  const { effSchoolId, tahunId, semester } = ctx
  const [wajib, setWajib] = useState(PERANGKAT_WAJIB_DEFAULT)
  const [pengampu, setPengampu] = useState([])
  useEffect(() => {
    if (!effSchoolId || !tahunId) { setPengampu([]); return }
    supabase.from('penugasan_mengajar').select('employee_id, employees(nama)').eq('school_id', effSchoolId).eq('tahun_ajaran_id', tahunId).eq('semester', semester)
      .then(({ data }) => setPengampu(data || []))
  }, [effSchoolId, tahunId, semester])
  const RANK = { diverifikasi: 4, dikumpulkan: 3, revisi: 2, draft: 1 }
  const rekap = useMemo(() => {
    const m = new Map()
    for (const p of pengampu) if (p.employee_id) m.set(p.employee_id, { nama: p.employees?.nama || '—', st: {} })
    for (const r of rows) {
      if (!r.employee_id) continue
      if (!m.has(r.employee_id)) m.set(r.employee_id, { nama: r.employees?.nama || '—', st: {} })
      const g = m.get(r.employee_id)
      if ((RANK[r.status] || 0) > (RANK[g.st[r.jenis]] || 0)) g.st[r.jenis] = r.status
    }
    return [...m.values()].map((g) => {
      const lengkap = wajib.filter((j) => ['dikumpulkan', 'diverifikasi'].includes(g.st[j])).length
      const verif = wajib.filter((j) => g.st[j] === 'diverifikasi').length
      return { ...g, lengkap, verif, pct: wajib.length ? Math.round((lengkap / wajib.length) * 100) : 0 }
    }).sort((a, b) => a.pct - b.pct || a.nama.localeCompare(b.nama))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pengampu, rows, wajib])
  const toggle = (j) => setWajib((w) => (w.includes(j) ? w.filter((x) => x !== j) : [...w, j]))
  const rata = rekap.length ? Math.round(rekap.reduce((a, g) => a + g.pct, 0) / rekap.length) : 0
  return (
    <SectionCard title="Rekap Kelengkapan Perangkat Ajar per Guru" description={`Seluruh guru pengampu (dari Penugasan) dibandingkan perangkat wajib. Rata-rata kelengkapan: ${rata}%.`}>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-[var(--color-ink-soft)]">Perangkat wajib:</span>
        {JENIS_PERANGKAT.map((j) => (
          <button key={j} type="button" onClick={() => toggle(j)} className={`rounded-full border px-2.5 py-0.5 ${wajib.includes(j) ? 'border-[var(--color-navy)] bg-[var(--color-navy)] text-white' : 'border-[var(--color-line,#cbd5e1)] text-[var(--color-ink-soft)]'}`}>{j}</button>
        ))}
      </div>
      {rekap.length === 0 ? <p className="text-sm text-[var(--color-ink-soft)]">Belum ada guru pengampu pada semester ini.</p> : (
        <div className="overflow-x-auto">
          <Table columns={['Guru', ...wajib, 'Kelengkapan']}>
            {rekap.map((g, i) => (
              <Tr key={i}>
                <Td className="font-medium">{g.nama}</Td>
                {wajib.map((j) => (
                  <Td key={j} className="text-center">{g.st[j] ? <Badge color={PERANGKAT_STATUS_BADGE[g.st[j]]}>{g.st[j] === 'diverifikasi' ? '✓' : PERANGKAT_STATUS_LABEL[g.st[j]]}</Badge> : <span className="text-[var(--color-danger)]">✗</span>}</Td>
                ))}
                <Td><span className={`font-semibold ${g.pct >= 100 ? 'text-[var(--color-success)]' : g.pct >= 50 ? 'text-[var(--color-gold)]' : 'text-[var(--color-danger)]'}`}>{g.pct}%</span><span className="block text-[11px] text-[var(--color-ink-soft)]">{g.verif}/{wajib.length} terverifikasi</span></Td>
              </Tr>
            ))}
          </Table>
        </div>
      )}
    </SectionCard>
  )
}

// =========================================================================
// KALENDER AKADEMIK
// =========================================================================
function KalenderTab({ ctx }) {
  const { effSchoolId, tahunId, tahunList, isManager, hasFullAccess } = ctx
  const [rows, setRows] = useState([])
  const [libur, setLibur] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [fJenis, setFJenis] = useState('')
  const [ta, setTa] = useState(undefined) // undefined = sedang dimuat
  const canWrite = isManager && (hasFullAccess || !!effSchoolId)

  useEffect(() => {
    if (!tahunId) { setTa(null); return }
    setTa(undefined)
    supabase.from('tahun_ajaran').select('id, nama, tanggal_mulai, tanggal_selesai').eq('id', tahunId).maybeSingle().then(({ data }) => setTa(data || null))
  }, [tahunId])

  const load = useCallback(async () => {
    if (ta === undefined) return
    setLoading(true)
    let q = supabase.from('kalender_akademik').select('*, schools(nama, jenjang)').order('tanggal_mulai')
    let hq = supabase.from('school_holidays').select('tanggal, keterangan, school_id').order('tanggal')
    if (effSchoolId) { q = q.or(`school_id.is.null,school_id.eq.${effSchoolId}`); hq = hq.or(`school_id.is.null,school_id.eq.${effSchoolId}`) }
    if (ta?.tanggal_mulai) { q = q.gte('tanggal_mulai', ta.tanggal_mulai); hq = hq.gte('tanggal', ta.tanggal_mulai) }
    if (ta?.tanggal_selesai) { q = q.lte('tanggal_mulai', ta.tanggal_selesai); hq = hq.lte('tanggal', ta.tanggal_selesai) }
    if (tahunId && !ta?.tanggal_mulai && !ta?.tanggal_selesai) { q = q.or(`tahun_ajaran_id.eq.${tahunId},tahun_ajaran_id.is.null`) }
    const [{ data }, { data: h }] = await Promise.all([q, hq])
    setRows(data || []); setLibur(h || []); setLoading(false)
  }, [effSchoolId, ta, tahunId])
  useEffect(() => { load() }, [load])

  const del = async (r) => { if (!confirm(`Hapus agenda "${r.judul}"?`)) return; const { error } = await supabase.from('kalender_akademik').delete().eq('id', r.id); if (error) { alert('Gagal: ' + error.message); return } load() }

  // Gabungkan agenda + hari libur (dari Pengaturan Hari Libur) dalam satu daftar per bulan.
  const items = useMemo(() => {
    const a = rows.map((r) => ({ ...r, src: 'agenda' }))
    const h = libur.map((l, i) => ({ id: `h${i}`, judul: l.keterangan, jenis: 'libur', tanggal_mulai: l.tanggal, tanggal_selesai: null, src: 'libur', school_id: l.school_id }))
    return [...a, ...h].filter((x) => !fJenis || x.jenis === fJenis).sort((x, y) => x.tanggal_mulai.localeCompare(y.tanggal_mulai))
  }, [rows, libur, fJenis])
  const perBulan = useMemo(() => {
    const m = new Map()
    for (const it of items) {
      const k = it.tanggal_mulai.slice(0, 7)
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(it)
    }
    return [...m.entries()]
  }, [items])
  const today = isoLocal(new Date())
  const bulanLabel = (k) => new Date(`${k}-01T00:00:00`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
  const canEditRow = (r) => r.src === 'agenda' && (hasFullAccess || (r.school_id && isManager))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Select containerClassName="w-52" value={fJenis} onChange={(e) => setFJenis(e.target.value)}>
          <option value="">Semua Jenis</option>
          {JENIS_KALENDER.map((j) => <option key={j} value={j}>{JENIS_KALENDER_LABEL[j]}</option>)}
        </Select>
        <div className="flex flex-wrap gap-2">
          {effSchoolId && <Button variant="outline" onClick={() => openCetakAkd('kalender_akademik', effSchoolId, { ta: tahunId })}><Printer className="h-4 w-4" /> Cetak Kalender</Button>}
          {canWrite && <Button onClick={() => { setEditing(null); setOpen(true) }}><Plus className="h-4 w-4" /> Tambah Agenda</Button>}
        </div>
      </div>
      <p className="text-xs text-[var(--color-ink-soft)]">Agenda berjenis <b>Libur</b> otomatis dikecualikan dari hitungan sesi mengajar (Rekap Kehadiran Mengajar). Hari libur dari Pengaturan Hari Libur juga ditampilkan di sini.</p>
      {loading ? <FullPageSpinner /> : perBulan.length === 0 ? (
        <EmptyState icon={CalendarDays} title="Kalender masih kosong" description={canWrite ? 'Tambahkan agenda: ujian, rapat, pembagian rapor, libur, dll.' : 'Belum ada agenda akademik.'} />
      ) : perBulan.map(([k, list]) => (
        <SectionCard key={k} title={bulanLabel(k)}>
          <ul className="flex flex-col divide-y divide-[var(--color-line,#e5e7eb)]">
            {list.map((r) => (
              <li key={r.id} className={`flex flex-wrap items-center justify-between gap-2 py-2 ${(r.tanggal_selesai || r.tanggal_mulai) < today ? 'opacity-60' : ''}`}>
                <div className="min-w-0">
                  <div className="text-sm font-medium">{r.judul}</div>
                  <div className="text-xs text-[var(--color-ink-soft)]">
                    {fmtTgl(r.tanggal_mulai)}{r.tanggal_selesai && r.tanggal_selesai !== r.tanggal_mulai ? ` – ${fmtTgl(r.tanggal_selesai)}` : ''}
                    {' · '}{r.school_id ? (r.schools ? `${r.schools.jenjang}` : 'Unit') : 'Seluruh yayasan'}
                    {r.src === 'libur' ? ' · (Pengaturan Hari Libur)' : ''}
                    {r.keterangan ? ` · ${r.keterangan}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge color={JENIS_KALENDER_BADGE[r.jenis]}>{JENIS_KALENDER_LABEL[r.jenis]}</Badge>
                  {canEditRow(r) && <>
                    <button onClick={() => { setEditing(r); setOpen(true) }} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => del(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]"><Trash2 className="h-4 w-4" /></button>
                  </>}
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      ))}
      <KalenderModal open={open} ctx={ctx} tahunList={tahunList} editing={editing} onClose={() => { setOpen(false); setEditing(null) }} onSaved={() => { setOpen(false); setEditing(null); load() }} />
    </div>
  )
}

function KalenderModal({ open, ctx, tahunList, editing, onClose, onSaved }) {
  const { effSchoolId, tahunId, hasFullAccess } = ctx
  const [f, setF] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!open) return; setError('')
    setF(editing
      ? { judul: editing.judul, jenis: editing.jenis, tanggal_mulai: editing.tanggal_mulai, tanggal_selesai: editing.tanggal_selesai || '', keterangan: editing.keterangan || '', scope: editing.school_id ? 'unit' : 'yayasan', tahun_ajaran_id: editing.tahun_ajaran_id || '' }
      : { judul: '', jenis: 'kegiatan', tanggal_mulai: isoLocal(new Date()), tanggal_selesai: '', keterangan: '', scope: effSchoolId ? 'unit' : 'yayasan', tahun_ajaran_id: tahunId || '' })
  }, [open, editing, effSchoolId, tahunId])
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const submit = async (e) => {
    e.preventDefault()
    if (!f.judul?.trim() || !f.tanggal_mulai) { setError('Isi judul & tanggal mulai.'); return }
    if (f.tanggal_selesai && f.tanggal_selesai < f.tanggal_mulai) { setError('Tanggal selesai tidak boleh sebelum tanggal mulai.'); return }
    const schoolId = f.scope === 'yayasan' ? null : (editing?.school_id || effSchoolId)
    if (f.scope === 'unit' && !schoolId) { setError('Pilih unit lebih dulu (atau pilih cakupan Seluruh Yayasan).'); return }
    setError(''); setSaving(true)
    const payload = { school_id: schoolId, tahun_ajaran_id: f.tahun_ajaran_id || null, judul: f.judul.trim(), jenis: f.jenis, tanggal_mulai: f.tanggal_mulai, tanggal_selesai: f.tanggal_selesai || null, keterangan: f.keterangan?.trim() || null }
    const q = editing ? supabase.from('kalender_akademik').update(payload).eq('id', editing.id) : supabase.from('kalender_akademik').insert(payload)
    const { error: err } = await q
    setSaving(false); if (err) { setError(err.message); return }; onSaved()
  }
  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Ubah Agenda' : 'Tambah Agenda Akademik'} width="max-w-lg">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Input label="Judul Agenda" required value={f.judul || ''} onChange={(e) => set('judul', e.target.value)} placeholder="mis. Penilaian Tengah Semester" />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Jenis" value={f.jenis || 'kegiatan'} onChange={(e) => set('jenis', e.target.value)}>
            {JENIS_KALENDER.map((j) => <option key={j} value={j}>{JENIS_KALENDER_LABEL[j]}</option>)}
          </Select>
          <Select label="Cakupan" value={f.scope || 'unit'} onChange={(e) => set('scope', e.target.value)}>
            <option value="unit" disabled={!effSchoolId && !editing?.school_id}>Unit terpilih</option>
            {hasFullAccess && <option value="yayasan">Seluruh Yayasan</option>}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Tanggal Mulai" type="date" value={f.tanggal_mulai || ''} onChange={(e) => set('tanggal_mulai', e.target.value)} />
          <Input label="Tanggal Selesai (opsional)" type="date" value={f.tanggal_selesai || ''} onChange={(e) => set('tanggal_selesai', e.target.value)} />
        </div>
        <Select label="Tahun Ajaran" value={f.tahun_ajaran_id || ''} onChange={(e) => set('tahun_ajaran_id', e.target.value)}>
          <option value="">—</option>
          {tahunList.map((t) => <option key={t.id} value={t.id}>{t.nama}</option>)}
        </Select>
        <Textarea label="Keterangan" rows={2} value={f.keterangan || ''} onChange={(e) => set('keterangan', e.target.value)} />
        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Batal</Button><Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button></div>
      </form>
    </Modal>
  )
}

// =========================================================================
// REKAP KEHADIRAN MENGAJAR (Jurnal KBM vs Jadwal) → dasar KPI & kedisiplinan
// =========================================================================
function RekapKbmTab({ ctx }) {
  const { effSchoolId, tahunId, semester, isManager, employee } = ctx
  const now = new Date()
  const [d1, setD1] = useState(isoLocal(new Date(now.getFullYear(), now.getMonth(), 1)))
  const [d2, setD2] = useState(isoLocal(now))
  const [rekap, setRekap] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!effSchoolId || !d1 || !d2 || d2 < d1) { setRekap([]); setLoading(false); return }
    setLoading(true)
    let jq = supabase.from('jurnal_kbm').select('employee_id, tanggal, kehadiran_guru, employees(nama)').eq('school_id', effSchoolId).gte('tanggal', d1).lte('tanggal', d2)
    let sq = supabase.from('jadwal_pelajaran').select('employee_id, hari, employees(nama)').eq('school_id', effSchoolId).eq('semester', semester)
    if (tahunId) sq = sq.eq('tahun_ajaran_id', tahunId)
    if (!isManager && employee?.id) { jq = jq.eq('employee_id', employee.id); sq = sq.eq('employee_id', employee.id) }
    const hq = supabase.from('school_holidays').select('tanggal').or(`school_id.is.null,school_id.eq.${effSchoolId}`).gte('tanggal', d1).lte('tanggal', d2)
    const kq = supabase.from('kalender_akademik').select('jenis, tanggal_mulai, tanggal_selesai').eq('jenis', 'libur').or(`school_id.is.null,school_id.eq.${effSchoolId}`).lte('tanggal_mulai', d2)
    const taq = tahunId ? supabase.from('tahun_ajaran').select('tanggal_mulai, tanggal_selesai').eq('id', tahunId).maybeSingle() : Promise.resolve({ data: null })
    const [{ data: jurnal }, { data: jadwal }, { data: libur }, { data: kal }, { data: ta }] = await Promise.all([jq, sq, hq, kq, taq])
    const liburAll = [...(libur || []).map((l) => l.tanggal), ...liburDariKalender(kal || [])]
    // Sesi terjadwal dihitung hanya di dalam periode tahun ajaran.
    const c1 = ta?.tanggal_mulai && ta.tanggal_mulai > d1 ? ta.tanggal_mulai : d1
    const c2 = ta?.tanggal_selesai && ta.tanggal_selesai < d2 ? ta.tanggal_selesai : d2
    setRekap(hitungRekapKbm({ jurnal: jurnal || [], jadwal: jadwal || [], libur: liburAll, d1: c1, d2: c2 }))
    setLoading(false)
  }, [effSchoolId, tahunId, semester, d1, d2, isManager, employee])
  useEffect(() => { load() }, [load])

  const tot = rekap.reduce((a, r) => ({ jurnal: a.jurnal + r.jurnal, hadir: a.hadir + r.hadir + r.tugas, terjadwal: a.terjadwal + r.terjadwal }), { jurnal: 0, hadir: 0, terjadwal: 0 })
  const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : null)
  const warna = (v) => (v == null ? '' : v >= 90 ? 'text-[var(--color-success)]' : v >= 75 ? 'text-[var(--color-gold)]' : 'text-[var(--color-danger)]')

  if (!effSchoolId) return <NeedUnit />
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-wrap items-end gap-2">
          <Input label="Dari" type="date" containerClassName="w-44" value={d1} onChange={(e) => setD1(e.target.value)} />
          <Input label="Sampai" type="date" containerClassName="w-44" value={d2} onChange={(e) => setD2(e.target.value)} />
        </div>
        <Button variant="outline" onClick={() => openCetakAkd('rekap_kbm', effSchoolId, { ta: tahunId, sem: semester, d1, d2, emp: isManager ? '' : employee?.id })} disabled={rekap.length === 0}><Printer className="h-4 w-4" /> Cetak Rekap</Button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Sesi Terjadwal" value={tot.terjadwal} />
        <StatCard label="Jurnal Terisi" value={tot.jurnal} />
        <StatCard label="Keterisian Jurnal" value={pct(tot.jurnal, tot.terjadwal) != null ? `${Math.min(100, pct(tot.jurnal, tot.terjadwal))}%` : '—'} accent="gold" />
        <StatCard label="Keterlaksanaan (Hadir+Tugas)" value={pct(tot.hadir, tot.jurnal) != null ? `${pct(tot.hadir, tot.jurnal)}%` : '—'} />
      </div>
      <SectionCard title={isManager ? 'Rekap per Guru' : 'Rekap Kehadiran Mengajar Saya'} description="Sesi terjadwal = slot Jadwal × hari efektif (tanpa hari libur). Keterisian = jurnal terisi ÷ sesi terjadwal. Keterlaksanaan = (hadir + tugas dinas) ÷ jurnal terisi.">
        {loading ? <FullPageSpinner /> : rekap.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title="Belum ada data" description="Belum ada jadwal / jurnal pada rentang ini." />
        ) : (
          <div className="overflow-x-auto">
            <Table columns={['Guru', 'Terjadwal', 'Jurnal', 'Hadir', 'Tugas', 'Izin', 'Sakit', 'Digantikan', 'Keterisian', 'Keterlaksanaan']}>
              {rekap.map((r) => (
                <Tr key={r.employee_id}>
                  <Td className="font-medium">{r.nama}</Td>
                  <Td>{r.terjadwal}</Td>
                  <Td>{r.jurnal}</Td>
                  <Td>{r.hadir}</Td>
                  <Td>{r.tugas}</Td>
                  <Td>{r.izin}</Td>
                  <Td>{r.sakit}</Td>
                  <Td>{r.digantikan}</Td>
                  <Td className={`font-semibold ${warna(r.keterisianPct)}`}>{r.keterisianPct != null ? `${r.keterisianPct}%` : '—'}</Td>
                  <Td className={`font-semibold ${warna(r.terlaksanaPct)}`}>{r.terlaksanaPct != null ? `${r.terlaksanaPct}%` : '—'}</Td>
                </Tr>
              ))}
            </Table>
          </div>
        )}
      </SectionCard>
      {isManager && (
        <p className="text-xs text-[var(--color-ink-soft)]">Integrasi KPI: di modul <b>KPI Lembaga</b>, buat indikator dengan sumber otomatis <b>"Kehadiran mengajar guru (Jurnal KBM)"</b> — realisasinya dihitung otomatis dari jurnal ini untuk rentang tanggal yang dipilih.</p>
      )}
    </div>
  )
}

// =========================================================================
// PPDB — Penerimaan Peserta Didik Baru
// =========================================================================
function PpdbTab({ ctx }) {
  const { effSchoolId, tahunId } = ctx
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [jadikan, setJadikan] = useState(null)
  const [fStatus, setFStatus] = useState('')
  const [cari, setCari] = useState('')

  const load = useCallback(async () => {
    if (!effSchoolId) { setRows([]); setLoading(false); return }
    setLoading(true)
    let q = supabase.from('ppdb_pendaftar').select('*').eq('school_id', effSchoolId)
    if (tahunId) q = q.eq('tahun_ajaran_id', tahunId)
    const { data } = await q.order('created_at', { ascending: false })
    setRows(data || []); setLoading(false)
  }, [effSchoolId, tahunId])
  useEffect(() => { load() }, [load])

  const ubahStatus = async (r, status) => {
    const { error } = await supabase.from('ppdb_pendaftar').update({ status, updated_at: new Date().toISOString() }).eq('id', r.id)
    if (error) { alert('Gagal: ' + error.message); return }
    load()
  }
  const del = async (r) => { if (!confirm(`Hapus pendaftar "${r.nama_lengkap}"?`)) return; const { error } = await supabase.from('ppdb_pendaftar').delete().eq('id', r.id); if (error) { alert('Gagal: ' + error.message); return } load() }

  const hitung = useMemo(() => {
    const m = Object.fromEntries(PPDB_STATUS.map((s) => [s, 0]))
    rows.forEach((r) => { m[r.status] = (m[r.status] || 0) + 1 })
    return m
  }, [rows])
  const filtered = rows.filter((r) => (!fStatus || r.status === fStatus) && (!cari || `${r.nama_lengkap} ${r.no_pendaftaran || ''} ${r.asal_sekolah || ''}`.toLowerCase().includes(cari.toLowerCase())))

  if (!effSchoolId) return <NeedUnit />
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Pendaftar" value={rows.length} />
        <StatCard label="Dalam Proses" value={hitung.daftar + hitung.verifikasi} accent="gold" />
        <StatCard label="Diterima" value={hitung.diterima} />
        <StatCard label="Sudah Jadi Siswa" value={rows.filter((r) => r.siswa_id).length} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <Input containerClassName="w-56" placeholder="Cari nama / no. daftar / asal sekolah" value={cari} onChange={(e) => setCari(e.target.value)} />
          <Select containerClassName="w-48" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
            <option value="">Semua Status</option>
            {PPDB_STATUS.map((s) => <option key={s} value={s}>{PPDB_STATUS_LABEL[s]} ({hitung[s] || 0})</option>)}
          </Select>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => openCetakAkd('hasil_ppdb', effSchoolId, { ta: tahunId })} disabled={rows.length === 0}><Printer className="h-4 w-4" /> Cetak Pengumuman</Button>
          <Button onClick={() => { setEditing(null); setOpen(true) }}><UserPlus className="h-4 w-4" /> Tambah Pendaftar</Button>
        </div>
      </div>
      <SectionCard title="Data Pendaftar" description="Alur: Mendaftar → Terverifikasi → Diterima / Cadangan / Tidak Diterima → Jadikan Siswa (otomatis masuk Data Siswa & rombel).">
        {loading ? <FullPageSpinner /> : filtered.length === 0 ? (
          <EmptyState icon={UserPlus} title="Belum ada pendaftar" description="Tambahkan data calon peserta didik." />
        ) : (
          <div className="overflow-x-auto">
            <Table columns={['No. Daftar', 'Nama', 'Asal Sekolah', 'Jalur', 'Nilai', 'Status', '']}>
              {filtered.map((r) => (
                <Tr key={r.id}>
                  <Td className="text-xs">{r.no_pendaftaran || '—'}</Td>
                  <Td className="font-medium">{r.nama_lengkap}<span className="block text-[11px] text-[var(--color-ink-soft)]">{r.jenis_kelamin || ''}{r.tingkat_tujuan ? ` · Kelas ${r.tingkat_tujuan}` : ''}</span></Td>
                  <Td className="text-xs">{r.asal_sekolah || '—'}</Td>
                  <Td className="text-xs">{r.jalur}</Td>
                  <Td>{r.nilai_seleksi ?? '—'}</Td>
                  <Td>
                    {r.siswa_id ? <Badge color="success">Sudah jadi siswa</Badge> : (
                      <Select containerClassName="w-40" value={r.status} onChange={(e) => ubahStatus(r, e.target.value)}>
                        {PPDB_STATUS.map((s) => <option key={s} value={s}>{PPDB_STATUS_LABEL[s]}</option>)}
                      </Select>
                    )}
                  </Td>
                  <Td><div className="flex items-center justify-end gap-1.5">
                    {!r.siswa_id && r.status === 'diterima' && <Button size="sm" onClick={() => setJadikan(r)}><GraduationCap className="h-3.5 w-3.5" /> Jadikan Siswa</Button>}
                    <button onClick={() => openCetakAkd('bukti_ppdb', r.id)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Cetak bukti" title="Cetak bukti pendaftaran"><Printer className="h-4 w-4" /></button>
                    <button onClick={() => { setEditing(r); setOpen(true) }} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]"><Pencil className="h-4 w-4" /></button>
                    {!r.siswa_id && <button onClick={() => del(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]"><Trash2 className="h-4 w-4" /></button>}
                  </div></Td>
                </Tr>
              ))}
            </Table>
          </div>
        )}
      </SectionCard>
      <PpdbModal open={open} ctx={ctx} editing={editing} onClose={() => { setOpen(false); setEditing(null) }} onSaved={() => { setOpen(false); setEditing(null); load() }} />
      <JadikanSiswaModal item={jadikan} ctx={ctx} onClose={() => setJadikan(null)} onDone={() => { setJadikan(null); load() }} />
    </div>
  )
}

const PPDB_EMPTY = { nama_lengkap: '', jenis_kelamin: '', tempat_lahir: '', tanggal_lahir: '', nik: '', nisn: '', agama: 'Islam', alamat: '', asal_sekolah: '', nama_ayah: '', nama_ibu: '', no_hp: '', email_ortu: '', jalur: 'Reguler', tingkat_tujuan: '', nilai_seleksi: '', status: 'daftar', catatan: '' }

function PpdbModal({ open, ctx, editing, onClose, onSaved }) {
  const { effSchoolId, tahunId } = ctx
  const [f, setF] = useState(PPDB_EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!open) return; setError('')
    setF(editing ? Object.fromEntries(Object.keys(PPDB_EMPTY).map((k) => [k, editing[k] ?? ''])) : PPDB_EMPTY)
  }, [open, editing])
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const submit = async (e) => {
    e.preventDefault()
    if (!f.nama_lengkap.trim()) { setError('Isi nama lengkap.'); return }
    setError(''); setSaving(true)
    const payload = {}
    for (const k of Object.keys(PPDB_EMPTY)) {
      const v = typeof f[k] === 'string' ? f[k].trim() : f[k]
      payload[k] = v === '' ? null : v
    }
    payload.nilai_seleksi = payload.nilai_seleksi == null ? null : Number(payload.nilai_seleksi)
    payload.jalur = payload.jalur || 'Reguler'
    payload.status = payload.status || 'daftar'
    const q = editing
      ? supabase.from('ppdb_pendaftar').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editing.id)
      : supabase.from('ppdb_pendaftar').insert({ ...payload, school_id: effSchoolId, tahun_ajaran_id: tahunId || null })
    const { error: err } = await q
    setSaving(false); if (err) { setError(err.message); return }; onSaved()
  }
  return (
    <Modal open={open} onClose={onClose} title={editing ? `Ubah Pendaftar${editing.no_pendaftaran ? ` — ${editing.no_pendaftaran}` : ''}` : 'Tambah Pendaftar PPDB'} width="max-w-2xl">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Nama Lengkap" required value={f.nama_lengkap} onChange={(e) => set('nama_lengkap', e.target.value)} containerClassName="col-span-2" />
          <Select label="Jenis Kelamin" value={f.jenis_kelamin} onChange={(e) => set('jenis_kelamin', e.target.value)}>
            <option value="">—</option><option value="L">Laki-laki</option><option value="P">Perempuan</option>
          </Select>
          <Input label="Agama" value={f.agama} onChange={(e) => set('agama', e.target.value)} />
          <Input label="Tempat Lahir" value={f.tempat_lahir} onChange={(e) => set('tempat_lahir', e.target.value)} />
          <Input label="Tanggal Lahir" type="date" value={f.tanggal_lahir} onChange={(e) => set('tanggal_lahir', e.target.value)} />
          <Input label="NIK" value={f.nik} onChange={(e) => set('nik', e.target.value)} />
          <Input label="NISN" value={f.nisn} onChange={(e) => set('nisn', e.target.value)} />
          <Input label="Asal Sekolah" value={f.asal_sekolah} onChange={(e) => set('asal_sekolah', e.target.value)} />
          <Input label="Tingkat/Kelas Tujuan" value={f.tingkat_tujuan} onChange={(e) => set('tingkat_tujuan', e.target.value)} placeholder="mis. 1 / 7 / 10" />
          <Input label="Nama Ayah" value={f.nama_ayah} onChange={(e) => set('nama_ayah', e.target.value)} />
          <Input label="Nama Ibu" value={f.nama_ibu} onChange={(e) => set('nama_ibu', e.target.value)} />
          <Input label="No. HP Orang Tua" value={f.no_hp} onChange={(e) => set('no_hp', e.target.value)} />
          <Input label="Email Orang Tua" type="email" value={f.email_ortu} onChange={(e) => set('email_ortu', e.target.value)} />
        </div>
        <Textarea label="Alamat" rows={2} value={f.alamat} onChange={(e) => set('alamat', e.target.value)} />
        <div className="grid grid-cols-3 gap-3">
          <Select label="Jalur" value={f.jalur} onChange={(e) => set('jalur', e.target.value)}>
            {PPDB_JALUR.map((j) => <option key={j} value={j}>{j}</option>)}
          </Select>
          <Input label="Nilai Seleksi" type="number" step="0.01" value={f.nilai_seleksi} onChange={(e) => set('nilai_seleksi', e.target.value)} />
          <Select label="Status" value={f.status} onChange={(e) => set('status', e.target.value)} disabled={!!editing?.siswa_id}>
            {PPDB_STATUS.map((s) => <option key={s} value={s}>{PPDB_STATUS_LABEL[s]}</option>)}
          </Select>
        </div>
        <Input label="Catatan" value={f.catatan} onChange={(e) => set('catatan', e.target.value)} />
        {!editing && <p className="text-xs text-[var(--color-ink-soft)]">Nomor pendaftaran dibuat otomatis (PPDB-{new Date().getFullYear()}-0001, dst.).</p>}
        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Batal</Button><Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button></div>
      </form>
    </Modal>
  )
}

// Pendaftar diterima → dibuatkan data Siswa (+ opsional langsung masuk rombel).
function JadikanSiswaModal({ item, ctx, onClose, onDone }) {
  const { effSchoolId } = ctx
  const [rombel, setRombel] = useState([])
  const [rombelId, setRombelId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!item) return
    setRombelId(''); setError('')
    let q = supabase.from('rombel').select('id, nama_rombel, tingkat').eq('school_id', effSchoolId).order('nama_rombel')
    if (item.tahun_ajaran_id) q = q.eq('tahun_ajaran_id', item.tahun_ajaran_id)
    q.then(({ data }) => setRombel(data || []))
  }, [item, effSchoolId])
  const submit = async () => {
    setSaving(true); setError('')
    const { error: err } = await supabase.rpc('ppdb_jadikan_siswa', { p_pendaftar_id: item.id, p_rombel_id: rombelId || null })
    setSaving(false)
    if (err) { setError(err.message); return }
    onDone()
  }
  const cocok = rombel.filter((r) => !item?.tingkat_tujuan || String(r.tingkat) === String(item.tingkat_tujuan))
  return (
    <Modal open={!!item} onClose={onClose} title="Jadikan Siswa" width="max-w-md">
      {item && (
        <div className="flex flex-col gap-3">
          <p className="text-sm">Data <b>{item.nama_lengkap}</b> ({item.no_pendaftaran || '—'}) akan disalin ke <b>Data Siswa</b> unit ini.</p>
          <Select label="Masukkan ke Rombel (opsional)" value={rombelId} onChange={(e) => setRombelId(e.target.value)}>
            <option value="">— Nanti saja —</option>
            {(cocok.length ? cocok : rombel).map((r) => <option key={r.id} value={r.id}>{r.nama_rombel}</option>)}
          </Select>
          {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Batal</Button><Button onClick={submit} disabled={saving}>{saving ? 'Memproses…' : 'Jadikan Siswa'}</Button></div>
        </div>
      )}
    </Modal>
  )
}
