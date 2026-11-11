import { useEffect, useMemo, useState, useCallback, Fragment } from 'react'
import { Gauge, ClipboardList, Users, Settings2, ListChecks, ShieldAlert, Plus, Trash2, Calculator } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, Card, Button, Select, Input, Textarea, Table, Tr, Td, Badge, EmptyState, FullPageSpinner, SectionCard, Modal } from '../../components/ui'
import {
  capaian, skor, predikat, predikatHex, fmt, skorBidang, skorSekolah, skorIndividu,
  kelompokBidang, SEMESTER, SUMBER_LABEL, tahunPelajaranSekarang, rumusText,
} from '../../lib/kpi2'

// ============ Sistem KPI (mutu ISO 9001) — menggantikan OKR & KPI ============
// Dua lapis: Institusional (bidang→indikator per jenjang) & Individu
// (profil GURU/TENDIK→aspek). Realisasi per unit + Tahun Pelajaran + Semester.

const TABS = [
  { key: 'dash', label: 'Dashboard', icon: Gauge },
  { key: 'inst', label: 'Input Institusi', icon: ClipboardList },
  { key: 'indiv', label: 'Input Individu', icon: Users },
  { key: 'eval', label: 'Evaluasi & Tindak Lanjut', icon: ListChecks },
  { key: 'master', label: 'Master KPI', icon: Settings2 },
]

export default function KinerjaLembaga() {
  const { isManager, hasFullAccess, managedSchoolIds, can, permsReady } = useAuth()
  const bolehLihat = permsReady ? can('okr_kpi', 'lihat') : isManager

  const [tab, setTab] = useState('dash')
  const [schools, setSchools] = useState([])
  const [schoolId, setSchoolId] = useState('')
  const [tp, setTp] = useState(tahunPelajaranSekarang())
  const [semester, setSemester] = useState('Ganjil')
  const [ready, setReady] = useState(false)

  // Master (sekali muat)
  const [bidang, setBidang] = useState([])
  const [indikatorAll, setIndikatorAll] = useState([])

  useEffect(() => {
    if (!bolehLihat) { setReady(true); return }
    let batal = false
    const load = async () => {
      const [{ data: sch }, { data: bd }, { data: ind }] = await Promise.all([
        supabase.from('schools').select('id, nama, jenjang').order('jenjang'),
        supabase.from('kpi2_bidang').select('*'),
        supabase.from('kpi2_indikator').select('*').eq('status_aktif', true),
      ])
      if (batal) return
      const daftar = hasFullAccess ? (sch || []) : (sch || []).filter((s) => managedSchoolIds.includes(s.id))
      setSchools(daftar)
      setSchoolId((prev) => prev || daftar[0]?.id || '')
      setBidang(bd || [])
      setIndikatorAll(ind || [])
      setReady(true)
    }
    load()
    return () => { batal = true }
  }, [bolehLihat, hasFullAccess, managedSchoolIds])

  const sekolah = schools.find((s) => s.id === schoolId)
  const jenjang = sekolah?.jenjang
  const indikator = useMemo(
    () => indikatorAll.filter((i) => i.jenjang === jenjang).sort((a, b) => a.urutan - b.urutan),
    [indikatorAll, jenjang],
  )
  const reloadMaster = useCallback(async () => {
    const { data } = await supabase.from('kpi2_indikator').select('*').eq('status_aktif', true)
    setIndikatorAll(data || [])
  }, [])

  if (!ready) return <FullPageSpinner />
  if (!bolehLihat) return <EmptyState icon={ShieldAlert} title="Akses terbatas" description="Peran Anda tidak memiliki izin melihat KPI." />

  const ctx = { schoolId, jenjang, tp, semester, bidang, indikator, hasFullAccess }

  return (
    <div>
      <PageHeader title="Sistem KPI — Sasaran Mutu" description="Kinerja lembaga (per bidang) & individu, siklus semesteran. Capaian, skor, dan predikat terhitung otomatis." />

      {/* Kontrol unit & periode */}
      <Card className="mb-4" padded={false}>
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <Select containerClassName="sm:w-64" value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
            {schools.length === 0 && <option value="">(tidak ada unit)</option>}
            {schools.map((s) => <option key={s.id} value={s.id}>{s.jenjang} — {s.nama}</option>)}
          </Select>
          <Select containerClassName="sm:w-40" value={tp} onChange={(e) => setTp(e.target.value)}>
            {tahunOptions().map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
          <Select containerClassName="sm:w-36" value={semester} onChange={(e) => setSemester(e.target.value)}>
            {SEMESTER.map((s) => <option key={s} value={s}>Semester {s}</option>)}
          </Select>
        </div>
      </Card>

      {/* Tab */}
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-[var(--color-border)]">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-[13px] font-semibold transition-colors ${tab === key ? 'border-[var(--color-navy)] text-[var(--color-navy)]' : 'border-transparent text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]'}`}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {!schoolId ? (
        <EmptyState icon={Gauge} title="Pilih unit" description="Pilih satuan pendidikan untuk mulai." />
      ) : (
        <>
          {tab === 'dash' && <Dashboard ctx={ctx} />}
          {tab === 'inst' && <InputInstitusi ctx={ctx} />}
          {tab === 'indiv' && <InputIndividu ctx={ctx} />}
          {tab === 'eval' && <Evaluasi ctx={ctx} />}
          {tab === 'master' && <MasterKpi ctx={ctx} reloadMaster={reloadMaster} />}
        </>
      )}
    </div>
  )
}

function tahunOptions() {
  const y = new Date().getFullYear()
  const arr = []
  for (let i = y + 1; i >= y - 3; i--) arr.push(`${i - 1}/${i}`)
  return Array.from(new Set([tahunPelajaranSekarang(), ...arr]))
}

// Hook: muat realisasi institusi per periode.
function useRealisasi(ctx) {
  const [real, setReal] = useState({})
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('kpi2_realisasi').select('indikator_id, nilai')
      .eq('school_id', ctx.schoolId).eq('tahun_pelajaran', ctx.tp).eq('semester', ctx.semester)
    const m = {}; for (const r of data || []) m[r.indikator_id] = r.nilai
    setReal(m); setLoading(false)
  }, [ctx.schoolId, ctx.tp, ctx.semester])
  useEffect(() => { load() }, [load])
  const simpan = async (indikatorId, val) => {
    const nilai = val === '' ? null : Number(val)
    setReal((m) => ({ ...m, [indikatorId]: nilai }))
    await supabase.from('kpi2_realisasi').upsert(
      { school_id: ctx.schoolId, tahun_pelajaran: ctx.tp, semester: ctx.semester, indikator_id: indikatorId, nilai, updated_at: new Date().toISOString() },
      { onConflict: 'school_id,tahun_pelajaran,semester,indikator_id' },
    )
  }
  return { real, loading, simpan }
}

// ----------------------------- DASHBOARD -----------------------------
function Donut({ val }) {
  const p = predikat(val); const hex = predikatHex(val)
  const pct = val === null ? 0 : Math.max(0, Math.min(100, val))
  const R = 52; const C = 2 * Math.PI * R; const off = C * (1 - pct / 100)
  return (
    <div className="text-center">
      <svg width="150" height="150" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={R} fill="none" stroke="#eef2f7" strokeWidth="14" />
        <circle cx="70" cy="70" r={R} fill="none" stroke={hex} strokeWidth="14" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={off} transform="rotate(-90 70 70)" />
        <text x="70" y="64" textAnchor="middle" fontSize="30" fontWeight="800" fill={hex}>{fmt(val)}</text>
        <text x="70" y="86" textAnchor="middle" fontSize="12" fill="#64748b">dari 100</text>
      </svg>
      <div><Badge color={p.color}>{p.k} · {p.t}</Badge></div>
    </div>
  )
}

function Dashboard({ ctx }) {
  const { real, loading } = useRealisasi(ctx)
  const groups = useMemo(() => kelompokBidang(ctx.bidang, ctx.indikator), [ctx.bidang, ctx.indikator])
  const ss = skorSekolah(ctx.indikator, real)
  let diisi = 0; let krit = 0; let baikA = 0
  for (const i of ctx.indikator) { const c = capaian(i.target, real[i.id], i.arah); if (c !== null) { diisi++; if (c < 100) krit++; if (c >= 95) baikA++ } }

  if (loading) return <p className="text-sm text-[var(--color-ink-soft)]">Memuat…</p>
  if (ctx.indikator.length === 0) return <EmptyState icon={Gauge} title="Belum ada indikator" description="Kerangka KPI untuk jenjang ini belum terisi. Buka tab Master KPI." />

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card><p className="text-[12px] font-semibold uppercase text-[var(--color-ink-soft)]">Indikator Terisi</p><p className="mt-1 text-2xl font-bold text-[var(--color-navy)]">{diisi}<span className="text-sm text-[var(--color-ink-soft)]">/{ctx.indikator.length}</span></p></Card>
        <Card><p className="text-[12px] font-semibold uppercase text-[var(--color-ink-soft)]">Predikat A (≥95)</p><p className="mt-1 text-2xl font-bold text-[var(--color-success)]">{baikA}</p></Card>
        <Card><p className="text-[12px] font-semibold uppercase text-[var(--color-ink-soft)]">Di Bawah Target</p><p className="mt-1 text-2xl font-bold text-[var(--color-danger)]">{krit}</p></Card>
        <Card><p className="text-[12px] font-semibold uppercase text-[var(--color-ink-soft)]">Bidang</p><p className="mt-1 text-2xl font-bold text-[var(--color-navy)]">{groups.length}</p></Card>
      </div>

      <SectionCard title="Skor Kinerja Sekolah" className="mb-4">
        <div className="flex flex-wrap items-center gap-6">
          <Donut val={ss} />
          <div className="min-w-[280px] flex-1">
            {groups.map((b) => {
              const s = skorBidang(b.indikator, real); const w = s === null ? 0 : Math.min(100, s); const hex = predikatHex(s)
              const bobot = b.indikator.reduce((a, i) => a + Number(i.bobot), 0)
              return (
                <div key={b.kode} className="mb-2.5 grid grid-cols-[150px_1fr_72px] items-center gap-2.5 max-sm:grid-cols-[110px_1fr_56px]">
                  <div className="text-[12.5px] font-semibold">{b.nama}<div className="text-[11px] text-[var(--color-ink-soft)]">bobot {bobot}%</div></div>
                  <div className="h-4 overflow-hidden rounded-lg bg-[#eef2f7]"><div className="h-full rounded-lg transition-all" style={{ width: `${w}%`, background: hex }} /></div>
                  <div className="text-right text-[12px] font-bold" style={{ color: hex }}>{fmt(s)} · {predikat(s).k}</div>
                </div>
              )
            })}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Ringkasan Kinerja Individu"><IndividuMini ctx={ctx} /></SectionCard>
    </div>
  )
}

function IndividuMini({ ctx }) {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    let batal = false
    const load = async () => {
      const [{ data: emps }, { data: pers }, { data: aspek }, { data: nilai }] = await Promise.all([
        supabase.from('employees').select('id, nama, positions(nama)').eq('school_id', ctx.schoolId).eq('status', 'aktif').order('nama'),
        supabase.from('kpi2_personel').select('employee_id, profil_kode'),
        supabase.from('kpi2_aspek').select('*'),
        supabase.from('kpi2_individu').select('employee_id, aspek_id, nilai').eq('tahun_pelajaran', ctx.tp).eq('semester', ctx.semester),
      ])
      if (batal) return
      const profOf = {}; for (const p of pers || []) profOf[p.employee_id] = p.profil_kode
      const nilaiOf = {}; for (const n of nilai || []) { (nilaiOf[n.employee_id] ||= {})[n.aspek_id] = n.nilai }
      const out = (emps || []).map((e) => {
        const pk = profOf[e.id]; const asp = (aspek || []).filter((a) => a.profil_kode === pk)
        const s = pk ? skorIndividu(asp, nilaiOf[e.id] || {}) : null
        return { id: e.id, nama: e.nama, jabatan: e.positions?.nama || '—', profil: pk || '—', skor: s }
      })
      setRows(out)
    }
    load()
    return () => { batal = true }
  }, [ctx.schoolId, ctx.tp, ctx.semester])
  if (rows === null) return <p className="text-sm text-[var(--color-ink-soft)]">Memuat…</p>
  if (rows.length === 0) return <p className="text-sm text-[var(--color-ink-soft)]">Belum ada pegawai aktif di unit ini.</p>
  return (
    <Table columns={['Nama', 'Jabatan', 'Profil', 'Nilai Akhir', 'Predikat']}>
      {rows.map((r) => { const p = predikat(r.skor); return (
        <Tr key={r.id}>
          <Td className="font-medium text-[var(--color-ink)]">{r.nama}</Td>
          <Td className="text-[var(--color-ink-soft)]">{r.jabatan}</Td>
          <Td>{r.profil}</Td>
          <Td className="font-bold" style={{ color: predikatHex(r.skor) }}>{fmt(r.skor)}</Td>
          <Td><Badge color={p.color}>{p.k} · {p.t}</Badge></Td>
        </Tr>
      ) })}
    </Table>
  )
}

// -------------------------- INPUT INSTITUSI --------------------------
function InputInstitusi({ ctx }) {
  const { real, loading, simpan } = useRealisasi(ctx)
  const groups = useMemo(() => kelompokBidang(ctx.bidang, ctx.indikator), [ctx.bidang, ctx.indikator])
  if (loading) return <p className="text-sm text-[var(--color-ink-soft)]">Memuat…</p>
  if (ctx.indikator.length === 0) return <EmptyState icon={ClipboardList} title="Belum ada indikator" description="Isi kerangka di tab Master KPI." />
  return (
    <SectionCard title="Input & Capaian Institusional" description="Isi kolom Realisasi. Capaian, skor, dan predikat terhitung otomatis. (Indikator bersumber otomatis akan diisi sistem pada tahap berikutnya — sementara dapat diisi manual.)">
      <div className="overflow-x-auto">
        <Table columns={['Kode', 'Indikator', 'Satuan', 'Target', 'Arah', 'Bobot', 'Realisasi', 'Capaian %', 'Skor', 'Pred.']}>
          {groups.map((b) => {
            const sb = skorBidang(b.indikator, real); const pb = predikat(sb)
            const bobot = b.indikator.reduce((a, i) => a + Number(i.bobot), 0)
            return (
              <Fragment key={b.kode}>
                <Tr>
                  <Td className="bg-[var(--color-paper)] font-bold text-[var(--color-navy)]" colSpan={6}>{b.nama} · bobot {bobot}%</Td>
                  <Td className="bg-[var(--color-paper)]" colSpan={2}>Skor bidang</Td>
                  <Td className="bg-[var(--color-paper)] font-bold" style={{ color: predikatHex(sb) }}>{fmt(sb)}</Td>
                  <Td className="bg-[var(--color-paper)]"><Badge color={pb.color}>{pb.k}</Badge></Td>
                </Tr>
                {b.indikator.map((i) => {
                  const c = capaian(i.target, real[i.id], i.arah); const p = predikat(c)
                  return (
                    <Tr key={i.id}>
                      <Td className="text-[var(--color-ink-soft)]">{i.kode}</Td>
                      <Td className="text-[var(--color-ink)]">{i.nama}
                        <div className="text-[11px] text-[var(--color-ink-soft)]">{SUMBER_LABEL[i.sumber]} · PIC: {i.pic || '—'}</div>
                        <div className="mt-0.5 flex items-start gap-1 text-[11px] text-[var(--color-ink-soft)]"><Calculator className="mt-0.5 h-3 w-3 shrink-0" /> <span>{rumusText(i)}</span></div>
                        {i.deskripsi && <div className="mt-0.5 text-[11px] italic text-[var(--color-ink-soft)]">{i.deskripsi}</div>}
                      </Td>
                      <Td>{i.satuan}</Td><Td>{i.target}</Td><Td>{i.arah}</Td><Td>{i.bobot}%</Td>
                      <Td><Input type="number" step="any" defaultValue={real[i.id] ?? ''} onBlur={(e) => simpan(i.id, e.target.value)} className="max-w-[90px] text-center" /></Td>
                      <Td className="font-bold" style={{ color: predikatHex(c) }}>{fmt(c)}</Td>
                      <Td>{fmt(skor(c))}</Td>
                      <Td><Badge color={p.color}>{p.k}</Badge></Td>
                    </Tr>
                  )
                })}
              </Fragment>
            )
          })}
        </Table>
      </div>
    </SectionCard>
  )
}

// --------------------------- INPUT INDIVIDU --------------------------
function InputIndividu({ ctx }) {
  const [emps, setEmps] = useState([])
  const [pid, setPid] = useState('')
  const [profOf, setProfOf] = useState({})
  const [profiles, setProfiles] = useState([])
  const [aspek, setAspek] = useState([])
  const [nilai, setNilai] = useState({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: e }, { data: pers }, { data: asp }, { data: prof }] = await Promise.all([
      supabase.from('employees').select('id, nama, positions(nama)').eq('school_id', ctx.schoolId).eq('status', 'aktif').order('nama'),
      supabase.from('kpi2_personel').select('employee_id, profil_kode'),
      supabase.from('kpi2_aspek').select('*').order('urutan'),
      supabase.from('kpi2_profil').select('*').order('kode'),
    ])
    const pof = {}; for (const p of pers || []) pof[p.employee_id] = p.profil_kode
    setEmps(e || []); setProfOf(pof); setAspek(asp || []); setProfiles(prof || [])
    setPid((prev) => prev || (e || [])[0]?.id || '')
    setLoading(false)
  }, [ctx.schoolId])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!pid) return
    let batal = false
    supabase.from('kpi2_individu').select('aspek_id, nilai').eq('employee_id', pid).eq('tahun_pelajaran', ctx.tp).eq('semester', ctx.semester)
      .then(({ data }) => { if (batal) return; const m = {}; for (const r of data || []) m[r.aspek_id] = r.nilai; setNilai(m) })
    return () => { batal = true }
  }, [pid, ctx.tp, ctx.semester])

  const setProfil = async (kode) => {
    setProfOf((m) => ({ ...m, [pid]: kode }))
    await supabase.from('kpi2_personel').upsert({ employee_id: pid, profil_kode: kode }, { onConflict: 'employee_id' })
  }
  const simpanNilai = async (aspekId, val) => {
    const n = val === '' ? null : Number(val)
    setNilai((m) => ({ ...m, [aspekId]: n }))
    await supabase.from('kpi2_individu').upsert(
      { school_id: ctx.schoolId, employee_id: pid, tahun_pelajaran: ctx.tp, semester: ctx.semester, aspek_id: aspekId, nilai: n, updated_at: new Date().toISOString() },
      { onConflict: 'employee_id,tahun_pelajaran,semester,aspek_id' },
    )
  }

  if (loading) return <p className="text-sm text-[var(--color-ink-soft)]">Memuat…</p>
  if (emps.length === 0) return <EmptyState icon={Users} title="Belum ada pegawai" description="Belum ada pegawai aktif di unit ini." />

  const pk = profOf[pid]
  const asp = aspek.filter((a) => a.profil_kode === pk)
  const s = pk ? skorIndividu(asp, nilai) : null
  const p = predikat(s)

  return (
    <SectionCard title="Input Penilaian Individu" description="Pilih personel & profil penilaian, lalu isi realisasi tiap aspek. Nilai akhir otomatis.">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select containerClassName="min-w-[280px]" value={pid} onChange={(e) => setPid(e.target.value)}>
          {emps.map((e) => <option key={e.id} value={e.id}>{e.nama} — {e.positions?.nama || '—'}</option>)}
        </Select>
        <Select containerClassName="w-56" value={pk || ''} onChange={(e) => setProfil(e.target.value)}>
          <option value="">— pilih profil/peran —</option>
          {profiles.map((pr) => <option key={pr.kode} value={pr.kode}>{pr.nama}</option>)}
        </Select>
        <div className="ml-auto text-right">
          <div className="text-[12px] text-[var(--color-ink-soft)]">Nilai Akhir</div>
          <div className="text-xl font-bold" style={{ color: predikatHex(s) }}>{fmt(s)} <Badge color={p.color}>{p.k}</Badge></div>
        </div>
      </div>
      {!pk ? (
        <p className="rounded-md bg-[var(--color-paper)] px-3 py-2 text-[13px] text-[var(--color-ink-soft)]">Pilih profil/peran penilaian untuk menampilkan aspek. Profil & aspek diatur di tab <b>Master KPI</b>.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table columns={['Kode', 'Aspek Penilaian', 'Satuan', 'Target', 'Bobot', 'Realisasi', 'Capaian %', 'Skor', 'Pred.']}>
            {asp.map((a) => {
              const c = capaian(a.target, nilai[a.id], a.arah); const pp = predikat(c)
              return (
                <Tr key={a.id}>
                  <Td className="text-[var(--color-ink-soft)]">{a.kode}</Td>
                  <Td className="text-[var(--color-ink)]">{a.nama}
                    <div className="mt-0.5 flex items-start gap-1 text-[11px] text-[var(--color-ink-soft)]"><Calculator className="mt-0.5 h-3 w-3 shrink-0" /> <span>{rumusText(a)}</span></div>
                    {a.deskripsi && <div className="mt-0.5 text-[11px] italic text-[var(--color-ink-soft)]">{a.deskripsi}</div>}
                  </Td>
                  <Td>{a.satuan}</Td><Td>{a.target}</Td><Td>{a.bobot}%</Td>
                  <Td><Input type="number" step="any" defaultValue={nilai[a.id] ?? ''} onBlur={(e) => simpanNilai(a.id, e.target.value)} className="max-w-[90px] text-center" /></Td>
                  <Td className="font-bold" style={{ color: predikatHex(c) }}>{fmt(c)}</Td>
                  <Td>{fmt(skor(c))}</Td>
                  <Td><Badge color={pp.color}>{pp.k}</Badge></Td>
                </Tr>
              )
            })}
          </Table>
        </div>
      )}
    </SectionCard>
  )
}

// ------------------------------ EVALUASI -----------------------------
function Evaluasi({ ctx }) {
  const { real, loading } = useRealisasi(ctx)
  const [evalr, setEvalr] = useState({})
  useEffect(() => {
    let batal = false
    supabase.from('kpi2_evaluasi').select('*').eq('school_id', ctx.schoolId).eq('tahun_pelajaran', ctx.tp).eq('semester', ctx.semester)
      .then(({ data }) => { if (batal) return; const m = {}; for (const r of data || []) m[r.indikator_id] = r; setEvalr(m) })
    return () => { batal = true }
  }, [ctx.schoolId, ctx.tp, ctx.semester])

  const simpan = async (indikatorId, field, val) => {
    const row = { ...(evalr[indikatorId] || {}), [field]: val }
    setEvalr((m) => ({ ...m, [indikatorId]: row }))
    await supabase.from('kpi2_evaluasi').upsert(
      { school_id: ctx.schoolId, tahun_pelajaran: ctx.tp, semester: ctx.semester, indikator_id: indikatorId, [field]: val || null, updated_at: new Date().toISOString() },
      { onConflict: 'school_id,tahun_pelajaran,semester,indikator_id' },
    )
  }

  const list = useMemo(() => ctx.indikator
    .map((i) => ({ ...i, cap: capaian(i.target, real[i.id], i.arah) }))
    .sort((a, b) => (a.cap ?? 999) - (b.cap ?? 999)), [ctx.indikator, real])

  if (loading) return <p className="text-sm text-[var(--color-ink-soft)]">Memuat…</p>
  return (
    <SectionCard title="Evaluasi & Rencana Tindak Lanjut" description="Register tindakan perbaikan (ISO 9001). Indikator di bawah target disorot & diurutkan prioritas.">
      <div className="overflow-x-auto">
        <Table columns={['Kode', 'Indikator', 'Capaian', 'Gap', 'Akar Masalah', 'Tindakan Perbaikan', 'PIC', 'Tenggat', 'Status']}>
          {list.map((i) => {
            const e = evalr[i.id] || {}; const below = i.cap !== null && i.cap < 100
            const gap = i.cap === null ? '–' : (i.cap >= 100 ? 'Tercapai' : fmt(100 - i.cap))
            return (
              <Tr key={i.id} className={below ? 'bg-[var(--color-danger-soft)]' : undefined}>
                <Td className="text-[var(--color-ink-soft)]">{i.kode}</Td>
                <Td className="text-[var(--color-ink)]">{i.nama}</Td>
                <Td className="font-bold" style={{ color: predikatHex(i.cap) }}>{fmt(i.cap)}</Td>
                <Td className="font-bold" style={{ color: below ? '#e53935' : '#2e7d32' }}>{gap}</Td>
                <Td><Input defaultValue={e.akar || ''} onBlur={(ev) => simpan(i.id, 'akar', ev.target.value)} className="min-w-[140px]" /></Td>
                <Td><Input defaultValue={e.tindakan || ''} onBlur={(ev) => simpan(i.id, 'tindakan', ev.target.value)} className="min-w-[140px]" /></Td>
                <Td><Input defaultValue={e.pic || ''} onBlur={(ev) => simpan(i.id, 'pic', ev.target.value)} className="max-w-[90px]" /></Td>
                <Td><Input type="date" defaultValue={e.tenggat || ''} onBlur={(ev) => simpan(i.id, 'tenggat', ev.target.value)} className="max-w-[140px]" /></Td>
                <Td>
                  <Select value={e.status || ''} onChange={(ev) => simpan(i.id, 'status', ev.target.value)}>
                    {['', 'Belum mulai', 'Dalam proses', 'Selesai', 'Dibatalkan'].map((s) => <option key={s} value={s}>{s || '—'}</option>)}
                  </Select>
                </Td>
              </Tr>
            )
          })}
        </Table>
      </div>
    </SectionCard>
  )
}

// ------------------------------ MASTER -------------------------------
function MasterKpi({ ctx, reloadMaster }) {
  const [sub, setSub] = useState('inst')
  if (!ctx.hasFullAccess) return <EmptyState icon={Settings2} title="Hanya Yayasan" description="Pengaturan Master KPI hanya untuk Admin Yayasan." />
  return (
    <div>
      <div className="mb-4 flex gap-2">
        <Button size="sm" variant={sub === 'inst' ? 'primary' : 'outline'} onClick={() => setSub('inst')}>Indikator Institusi</Button>
        <Button size="sm" variant={sub === 'indiv' ? 'primary' : 'outline'} onClick={() => setSub('indiv')}>Profil & Aspek Individu</Button>
      </div>
      {sub === 'inst' ? <MasterInstitusi ctx={ctx} reloadMaster={reloadMaster} /> : <MasterIndividu />}
    </div>
  )
}

// ---- Master: indikator institusi (tambah/edit/hapus, per jenjang) ----
function MasterInstitusi({ ctx, reloadMaster }) {
  const [tambah, setTambah] = useState(false)
  const groups = useMemo(() => kelompokBidang(ctx.bidang, ctx.indikator), [ctx.bidang, ctx.indikator])
  const totalBobot = ctx.indikator.reduce((a, i) => a + Number(i.bobot), 0)

  const simpan = async (id, field, val) => {
    const numeric = field === 'target' || field === 'bobot'
    const value = numeric ? (val === '' ? 0 : Number(val)) : (val || null)
    await supabase.from('kpi2_indikator').update({ [field]: value }).eq('id', id)
    reloadMaster()
  }
  const hapus = async (i) => {
    if (!confirm(`Hapus indikator "${i.nama}" (${i.kode})? Realisasi & evaluasi indikator ini pada semua periode ikut terhapus.`)) return
    await supabase.from('kpi2_indikator').delete().eq('id', i.id)
    reloadMaster()
  }
  const tambahIndikator = async (f) => {
    const maxUrut = Math.max(0, ...ctx.indikator.map((i) => i.urutan || 0))
    const { error } = await supabase.from('kpi2_indikator').insert({
      jenjang: ctx.jenjang, bidang_kode: f.bidang_kode, kode: f.kode, nama: f.nama, satuan: f.satuan || '%',
      target: Number(f.target) || 0, arah: f.arah, bobot: Number(f.bobot) || 0, sumber: f.sumber, pic: f.pic || null,
      deskripsi: f.deskripsi || null, urutan: maxUrut + 1,
    })
    if (error) { alert('Gagal: ' + error.message); return }
    setTambah(false); reloadMaster()
  }

  if (!ctx.jenjang) return <EmptyState icon={Settings2} title="Pilih unit" description="Pilih unit untuk menentukan jenjang kerangka." />

  return (
    <SectionCard title={`Indikator Institusi — Jenjang ${ctx.jenjang}`}
      description="Tambah, ubah, atau hapus indikator. Σ bobot indikator sebaiknya 100%."
      actions={<Button size="sm" onClick={() => setTambah(true)}><Plus className="h-4 w-4" /> Tambah Indikator</Button>}>
      <p className="mb-3 text-[13px]">Total bobot: <b style={{ color: totalBobot === 100 ? '#2e7d32' : '#e53935' }}>{totalBobot}%</b> {totalBobot === 100 ? '✓' : '(idealnya 100%)'}</p>
      {ctx.indikator.length === 0 ? (
        <p className="text-[13px] text-[var(--color-ink-soft)]">Belum ada indikator untuk jenjang ini. Klik Tambah Indikator.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table columns={['Kode', 'Indikator & Deskripsi', 'Satuan', 'Target', 'Arah', 'Bobot', 'Sumber', 'PIC', '']}>
            {groups.map((b) => (
              <Fragment key={b.kode}>
                <Tr><Td className="bg-[var(--color-paper)] font-bold text-[var(--color-navy)]" colSpan={9}>{b.nama}</Td></Tr>
                {b.indikator.map((i) => (
                  <Tr key={i.id}>
                    <Td><Input defaultValue={i.kode} onBlur={(e) => simpan(i.id, 'kode', e.target.value)} className="max-w-[72px]" /></Td>
                    <Td>
                      <Input defaultValue={i.nama} onBlur={(e) => simpan(i.id, 'nama', e.target.value)} className="min-w-[200px]" />
                      <Textarea defaultValue={i.deskripsi || ''} onBlur={(e) => simpan(i.id, 'deskripsi', e.target.value)} rows={1} placeholder="Deskripsi / cara hitung (opsional)…" className="mt-1 min-w-[200px] text-[12px]" />
                    </Td>
                    <Td><Input defaultValue={i.satuan} onBlur={(e) => simpan(i.id, 'satuan', e.target.value)} className="max-w-[64px] text-center" /></Td>
                    <Td><Input type="number" step="any" defaultValue={i.target} onBlur={(e) => simpan(i.id, 'target', e.target.value)} className="max-w-[72px] text-center" /></Td>
                    <Td><Select value={i.arah} onChange={(e) => simpan(i.id, 'arah', e.target.value)}><option value="naik">naik</option><option value="turun">turun</option></Select></Td>
                    <Td><Input type="number" step="any" defaultValue={i.bobot} onBlur={(e) => simpan(i.id, 'bobot', e.target.value)} className="max-w-[64px] text-center" /></Td>
                    <Td><Select value={i.sumber} onChange={(e) => simpan(i.id, 'sumber', e.target.value)}>{Object.entries(SUMBER_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Td>
                    <Td><Input defaultValue={i.pic || ''} onBlur={(e) => simpan(i.id, 'pic', e.target.value)} className="max-w-[90px]" /></Td>
                    <Td><button onClick={() => hapus(i)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus"><Trash2 className="h-4 w-4" /></button></Td>
                  </Tr>
                ))}
              </Fragment>
            ))}
          </Table>
        </div>
      )}
      {tambah && <IndikatorModal bidang={ctx.bidang} onClose={() => setTambah(false)} onSave={tambahIndikator} />}
    </SectionCard>
  )
}

function IndikatorModal({ bidang, onClose, onSave }) {
  const [f, setF] = useState({ bidang_kode: bidang[0]?.kode || '', kode: '', nama: '', satuan: '%', target: 100, arah: 'naik', bobot: 0, sumber: 'manual', pic: '', deskripsi: '' })
  const up = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  return (
    <Modal open onClose={onClose} title="Tambah Indikator">
      <div className="flex flex-col gap-2.5">
        <L label="Bidang"><Select value={f.bidang_kode} onChange={up('bidang_kode')}>{bidang.map((b) => <option key={b.kode} value={b.kode}>{b.nama}</option>)}</Select></L>
        <div className="grid grid-cols-2 gap-2.5">
          <L label="Kode"><Input value={f.kode} onChange={up('kode')} placeholder="mis. KBM" /></L>
          <L label="Satuan"><Input value={f.satuan} onChange={up('satuan')} /></L>
        </div>
        <L label="Nama indikator"><Input value={f.nama} onChange={up('nama')} /></L>
        <L label="Deskripsi / cara hitung (opsional)"><Textarea value={f.deskripsi} onChange={up('deskripsi')} rows={2} /></L>
        <div className="grid grid-cols-3 gap-2.5">
          <L label="Target"><Input type="number" step="any" value={f.target} onChange={up('target')} /></L>
          <L label="Arah"><Select value={f.arah} onChange={up('arah')}><option value="naik">naik</option><option value="turun">turun</option></Select></L>
          <L label="Bobot %"><Input type="number" step="any" value={f.bobot} onChange={up('bobot')} /></L>
        </div>
        <L label="Sumber"><Select value={f.sumber} onChange={up('sumber')}>{Object.entries(SUMBER_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></L>
        <L label="PIC (opsional)"><Input value={f.pic} onChange={up('pic')} /></L>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button onClick={() => { if (!f.kode.trim() || !f.nama.trim()) { alert('Kode & nama wajib diisi.'); return } onSave(f) }}>Simpan</Button>
        </div>
      </div>
    </Modal>
  )
}

// ---- Master: profil/peran & aspek individu (tambah/edit/hapus) ----
function MasterIndividu() {
  const [profiles, setProfiles] = useState([])
  const [aspek, setAspek] = useState([])
  const [sel, setSel] = useState('')
  const [tambahProfil, setTambahProfil] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: pr }, { data: asp }] = await Promise.all([
      supabase.from('kpi2_profil').select('*').order('kode'),
      supabase.from('kpi2_aspek').select('*').order('urutan'),
    ])
    setProfiles(pr || []); setAspek(asp || [])
    setSel((prev) => prev || (pr || [])[0]?.kode || '')
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const simpanAspek = async (id, field, val) => {
    const numeric = field === 'target' || field === 'bobot'
    const value = numeric ? (val === '' ? 0 : Number(val)) : (val || null)
    await supabase.from('kpi2_aspek').update({ [field]: value }).eq('id', id); load()
  }
  const hapusAspek = async (a) => { if (!confirm(`Hapus aspek "${a.nama}"?`)) return; await supabase.from('kpi2_aspek').delete().eq('id', a.id); load() }
  const tambahAspek = async () => {
    const list = aspek.filter((a) => a.profil_kode === sel)
    const maxUrut = Math.max(0, ...list.map((a) => a.urutan || 0))
    await supabase.from('kpi2_aspek').insert({ profil_kode: sel, kode: `A-${maxUrut + 1}`, nama: 'Aspek baru', satuan: '%', target: 100, arah: 'naik', bobot: 0, urutan: maxUrut + 1 })
    load()
  }
  const tambahProfilOK = async (f) => {
    const { error } = await supabase.from('kpi2_profil').insert({ kode: f.kode.trim().toUpperCase(), nama: f.nama.trim() })
    if (error) { alert('Gagal (kode mungkin sudah ada): ' + error.message); return }
    setTambahProfil(false); setSel(f.kode.trim().toUpperCase()); load()
  }
  const hapusProfil = async (kode) => {
    if (!confirm(`Hapus profil/peran "${kode}" beserta aspeknya? Gagal bila masih dipakai pegawai.`)) return
    const { error } = await supabase.from('kpi2_profil').delete().eq('kode', kode)
    if (error) { alert('Tidak bisa dihapus (masih dipakai pegawai). Ganti profil pegawai tsb dulu.'); return }
    setSel(''); load()
  }

  if (loading) return <p className="text-sm text-[var(--color-ink-soft)]">Memuat…</p>
  const list = aspek.filter((a) => a.profil_kode === sel)
  const totalBobot = list.reduce((a, x) => a + Number(x.bobot), 0)

  return (
    <SectionCard title="Profil / Peran & Aspek Individu"
      description="Tiap pegawai dinilai memakai satu profil/peran. Buat profil sebanyak peran yang ada, lalu atur aspek penilaiannya."
      actions={<Button size="sm" onClick={() => setTambahProfil(true)}><Plus className="h-4 w-4" /> Tambah Profil/Peran</Button>}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select containerClassName="w-72" value={sel} onChange={(e) => setSel(e.target.value)}>
          {profiles.length === 0 && <option value="">(belum ada profil)</option>}
          {profiles.map((p) => <option key={p.kode} value={p.kode}>{p.kode} — {p.nama}</option>)}
        </Select>
        {sel && <Button size="sm" variant="outline" onClick={() => hapusProfil(sel)}><Trash2 className="h-4 w-4" /> Hapus Profil</Button>}
        <span className="ml-auto text-[13px]">Σ bobot aspek: <b style={{ color: totalBobot === 100 ? '#2e7d32' : '#e53935' }}>{totalBobot}%</b></span>
      </div>
      {!sel ? (
        <p className="text-[13px] text-[var(--color-ink-soft)]">Belum ada profil. Tambahkan profil/peran dulu.</p>
      ) : (
        <>
          <div className="mb-2"><Button size="sm" variant="outline" onClick={tambahAspek}><Plus className="h-4 w-4" /> Tambah Aspek</Button></div>
          <div className="overflow-x-auto">
            <Table columns={['Kode', 'Aspek & Deskripsi', 'Satuan', 'Target', 'Arah', 'Bobot', '']}>
              {list.map((a) => (
                <Tr key={a.id}>
                  <Td><Input defaultValue={a.kode} onBlur={(e) => simpanAspek(a.id, 'kode', e.target.value)} className="max-w-[72px]" /></Td>
                  <Td>
                    <Input defaultValue={a.nama} onBlur={(e) => simpanAspek(a.id, 'nama', e.target.value)} className="min-w-[220px]" />
                    <Textarea defaultValue={a.deskripsi || ''} onBlur={(e) => simpanAspek(a.id, 'deskripsi', e.target.value)} rows={1} placeholder="Deskripsi / cara hitung (opsional)…" className="mt-1 min-w-[220px] text-[12px]" />
                  </Td>
                  <Td><Input defaultValue={a.satuan} onBlur={(e) => simpanAspek(a.id, 'satuan', e.target.value)} className="max-w-[64px] text-center" /></Td>
                  <Td><Input type="number" step="any" defaultValue={a.target} onBlur={(e) => simpanAspek(a.id, 'target', e.target.value)} className="max-w-[72px] text-center" /></Td>
                  <Td><Select value={a.arah} onChange={(e) => simpanAspek(a.id, 'arah', e.target.value)}><option value="naik">naik</option><option value="turun">turun</option></Select></Td>
                  <Td><Input type="number" step="any" defaultValue={a.bobot} onBlur={(e) => simpanAspek(a.id, 'bobot', e.target.value)} className="max-w-[64px] text-center" /></Td>
                  <Td><button onClick={() => hapusAspek(a)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus"><Trash2 className="h-4 w-4" /></button></Td>
                </Tr>
              ))}
            </Table>
          </div>
        </>
      )}
      {tambahProfil && <ProfilModal onClose={() => setTambahProfil(false)} onSave={tambahProfilOK} />}
    </SectionCard>
  )
}

function ProfilModal({ onClose, onSave }) {
  const [f, setF] = useState({ kode: '', nama: '' })
  return (
    <Modal open onClose={onClose} title="Tambah Profil / Peran">
      <div className="flex flex-col gap-2.5">
        <L label="Kode (singkat, mis. KEPSEK, WALAS)"><Input value={f.kode} onChange={(e) => setF((s) => ({ ...s, kode: e.target.value }))} /></L>
        <L label="Nama profil/peran"><Input value={f.nama} onChange={(e) => setF((s) => ({ ...s, nama: e.target.value }))} placeholder="mis. Kepala Sekolah" /></L>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button onClick={() => { if (!f.kode.trim() || !f.nama.trim()) { alert('Kode & nama wajib.'); return } onSave(f) }}>Simpan</Button>
        </div>
      </div>
    </Modal>
  )
}

function L({ label, children }) {
  return <label className="block"><span className="mb-1 block text-[12px] font-medium text-[var(--color-ink-soft)]">{label}</span>{children}</label>
}
