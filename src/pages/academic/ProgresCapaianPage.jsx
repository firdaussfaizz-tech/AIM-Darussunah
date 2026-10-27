import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Users, GraduationCap, Save } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, SectionCard, Card, Button, Table, Tr, Td, Select, Input, EmptyState, FullPageSpinner } from '../../components/ui'

const JENIS = [
  { v: 'mingguan', l: 'Mingguan', ph: 'mis. Minggu ke-1' },
  { v: 'bulanan', l: 'Bulanan', ph: 'mis. September 2026' },
  { v: 'semester', l: 'Semester', ph: 'mis. Ganjil 2026/2027' },
]
const STATUS = [
  { v: 'belum', l: 'Belum Tercapai', c: 'danger' },
  { v: 'berproses', l: 'Berproses', c: 'gold' },
  { v: 'tercapai', l: 'Tercapai', c: 'success' },
]
export default function ProgresCapaianPage() {
  const { kkmId } = useParams()
  const navigate = useNavigate()
  const { isManager, employee } = useAuth()
  const [cp, setCp] = useState(null)
  const [rombelList, setRombelList] = useState([])
  const [rombel, setRombel] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notfound, setNotfound] = useState(false)

  useEffect(() => {
    (async () => {
      setLoading(true); setNotfound(false)
      const { data: c } = await supabase.from('kurikulum_kkm').select('*, mata_pelajaran(nama), schools!school_id(nama, jenjang)').eq('id', kkmId).maybeSingle()
      if (!c) { setNotfound(true); setLoading(false); return }
      setCp(c)
      let taId = c.tahun_ajaran_id
      if (!taId) { const { data: ta } = await supabase.from('tahun_ajaran').select('id').eq('status', 'aktif').maybeSingle(); taId = ta?.id || null }
      let q = supabase.from('rombel').select('id, nama_rombel, tingkat, wali_kelas_employee_id, employees:wali_kelas_employee_id(nama)').eq('school_id', c.school_id)
      if (taId) q = q.eq('tahun_ajaran_id', taId)
      if (c.tingkat) q = q.eq('tingkat', c.tingkat)
      if (!isManager && employee?.id) q = q.eq('wali_kelas_employee_id', employee.id)
      const { data: rb } = await q.order('nama_rombel')
      setRombelList(rb || [])
      setLoading(false)
    })()
  }, [kkmId, isManager, employee?.id])

  if (loading) return <FullPageSpinner />
  if (notfound) return <EmptyState title="CP/KKTP tidak ditemukan" description="Data mungkin telah dihapus atau Anda tidak memiliki akses." />

  return (
    <div>
      <button onClick={() => (rombel ? setRombel(null) : navigate('/pembelajaran/kurikulum'))} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]">
        <ArrowLeft className="h-4 w-4" /> {rombel ? 'Kembali ke daftar kelas' : 'Kembali ke Kurikulum & KKTP'}
      </button>

      <PageHeader title="Pantau Progres Capaian" description={`${cp.mata_pelajaran?.nama || '—'} · ${cp.schools ? `${cp.schools.jenjang} — ${cp.schools.nama}` : ''}`} />

      <Card className="mb-5 bg-[var(--color-navy-50)]">
        <div className="flex flex-wrap items-start gap-x-6 gap-y-2 text-sm">
          <div><p className="text-xs text-[var(--color-ink-soft)]">Mata Pelajaran</p><p className="font-medium">{cp.mata_pelajaran?.nama || '—'}</p></div>
          <div><p className="text-xs text-[var(--color-ink-soft)]">Tingkat</p><p className="font-medium">{cp.tingkat || 'Semua'}</p></div>
          <div><p className="text-xs text-[var(--color-ink-soft)]">KKTP</p><p className="font-medium">{cp.kkm ?? '—'}</p></div>
          <div className="flex-1 min-w-[200px]"><p className="text-xs text-[var(--color-ink-soft)]">Capaian Pembelajaran / TP</p><p className="font-medium">{cp.cp_kd || '—'}</p></div>
        </div>
      </Card>

      {!rombel ? (
        <SectionCard title="Pilih Kelas" description={`Daftar kelas ${cp.tingkat ? `tingkat ${cp.tingkat}` : ''} untuk mencatat progres. Klik kelas untuk melihat daftar siswa.`}>
          {rombelList.length === 0 ? (
            <EmptyState icon={GraduationCap} title={isManager ? 'Belum ada kelas' : 'Anda bukan wali kelas pada tingkat ini'}
              description={isManager ? 'Belum ada rombel pada tingkat & tahun ajaran ini.' : 'Hanya wali kelas pada tingkat ini yang dapat mencatat progres kelasnya.'} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {rombelList.map((r) => (
                <button key={r.id} onClick={() => setRombel(r)} className="flex items-center justify-between rounded-lg border border-[var(--color-border)] p-4 text-left transition hover:border-[var(--color-navy)] hover:shadow-sm">
                  <div>
                    <p className="font-semibold text-[var(--color-ink)]">{r.nama_rombel}</p>
                    <p className="text-xs text-[var(--color-ink-soft)]">Tingkat {r.tingkat || '—'}{r.employees?.nama ? ` · Wali: ${r.employees.nama}` : ''}</p>
                  </div>
                  <Users className="h-5 w-5 text-[var(--color-navy)]" />
                </button>
              ))}
            </div>
          )}
        </SectionCard>
      ) : (
        <ProgresInput cp={cp} rombel={rombel} employeeId={employee?.id} />
      )}
    </div>
  )
}

function ProgresInput({ cp, rombel, employeeId }) {
  const [jenis, setJenis] = useState('mingguan')
  const [periode, setPeriode] = useState('')
  const [tanggal, setTanggal] = useState('')
  const [students, setStudents] = useState([])
  const [vals, setVals] = useState({})
  const [periodeList, setPeriodeList] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    (async () => {
      setLoading(true)
      const { data } = await supabase.from('riwayat_siswa').select('siswa_id, siswa!siswa_id(id, nama_lengkap, nis)').eq('rombel_id', rombel.id).eq('status', 'aktif')
      setStudents((data || []).map((e) => e.siswa).filter(Boolean).sort((a, b) => a.nama_lengkap.localeCompare(b.nama_lengkap)))
      setLoading(false)
    })()
  }, [rombel.id])

  const loadPeriode = useCallback(async () => {
    const { data } = await supabase.from('capaian_progres').select('jenis, periode').eq('kurikulum_kkm_id', cp.id).eq('rombel_id', rombel.id)
    const seen = new Set(); const uniq = []
    for (const r of data || []) { const k = `${r.jenis}|${r.periode}`; if (!seen.has(k)) { seen.add(k); uniq.push(r) } }
    setPeriodeList(uniq)
  }, [cp.id, rombel.id])
  useEffect(() => { loadPeriode() }, [loadPeriode])

  const loadVals = useCallback(async () => {
    if (!periode.trim()) { setVals({}); return }
    const { data } = await supabase.from('capaian_progres').select('siswa_id, status, skor, catatan').eq('kurikulum_kkm_id', cp.id).eq('rombel_id', rombel.id).eq('jenis', jenis).eq('periode', periode.trim())
    const m = {}
    for (const r of data || []) m[r.siswa_id] = { status: r.status, skor: r.skor ?? '', catatan: r.catatan || '' }
    setVals(m)
  }, [cp.id, rombel.id, jenis, periode])
  useEffect(() => { loadVals() }, [loadVals])

  const setVal = (sid, patch) => setVals((v) => ({ ...v, [sid]: { status: 'berproses', skor: '', catatan: '', ...v[sid], ...patch } }))

  const simpan = async () => {
    if (!periode.trim()) { setMsg('Isi periode dulu (mis. "Minggu ke-1").'); return }
    setSaving(true); setMsg('')
    const rowsUp = students.filter((s) => vals[s.id]).map((s) => ({
      kurikulum_kkm_id: cp.id, siswa_id: s.id, rombel_id: rombel.id, jenis, periode: periode.trim(),
      tanggal: tanggal || null, status: vals[s.id].status || 'berproses',
      skor: vals[s.id].skor === '' ? null : Number(vals[s.id].skor), catatan: vals[s.id].catatan?.trim() || null, dicatat_oleh: employeeId || null,
    }))
    if (rowsUp.length === 0) { setSaving(false); setMsg('Belum ada progres yang diisi.'); return }
    const { error } = await supabase.from('capaian_progres').upsert(rowsUp, { onConflict: 'kurikulum_kkm_id,siswa_id,jenis,periode' })
    setSaving(false)
    if (error) { setMsg('Gagal menyimpan: ' + error.message); return }
    setMsg(`${rowsUp.length} progres siswa tersimpan untuk ${JENIS.find((j) => j.v === jenis)?.l} "${periode.trim()}".`)
    loadPeriode()
  }

  const ph = JENIS.find((j) => j.v === jenis)?.ph || ''
  const terisi = students.filter((s) => vals[s.id] && (vals[s.id].status || vals[s.id].skor !== '' || vals[s.id].catatan)).length

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title={`Input Progres — ${rombel.nama_rombel}`} description="Pilih jenis & periode, lalu isi status ketercapaian (dan skor/catatan bila perlu) tiap siswa. Menyimpan ulang periode yang sama akan memperbarui datanya.">
        <div className="flex flex-wrap items-end gap-3">
          <Select containerClassName="w-40" label="Jenis Progres" value={jenis} onChange={(e) => { setJenis(e.target.value); setPeriode('') }}>
            {JENIS.map((j) => <option key={j.v} value={j.v}>{j.l}</option>)}
          </Select>
          <Input containerClassName="w-56" label="Periode" value={periode} onChange={(e) => setPeriode(e.target.value)} placeholder={ph} />
          <Input containerClassName="w-44" label="Tanggal (opsional)" type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
        </div>
        {periodeList.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-[var(--color-ink-soft)]">Periode tercatat:</span>
            {periodeList.map((p, i) => (
              <button key={i} onClick={() => { setJenis(p.jenis); setPeriode(p.periode) }}
                className={`rounded-full border px-2.5 py-0.5 text-xs ${jenis === p.jenis && periode === p.periode ? 'border-[var(--color-navy)] bg-[var(--color-navy)] text-white' : 'border-[var(--color-border)] text-[var(--color-ink-soft)] hover:border-[var(--color-navy)]'}`}>
                {JENIS.find((j) => j.v === p.jenis)?.l}: {p.periode}
              </button>
            ))}
          </div>
        )}
      </SectionCard>

      {loading ? <FullPageSpinner /> : students.length === 0 ? (
        <EmptyState title="Belum ada siswa di kelas ini" />
      ) : (
        <SectionCard title={`Daftar Siswa (${students.length})`} description="Status: Belum Tercapai / Berproses / Tercapai. Skor (0–100) opsional."
          actions={<Button onClick={simpan} disabled={saving || !periode.trim()}><Save className="h-4 w-4" /> {saving ? 'Menyimpan…' : `Simpan Progres${terisi ? ` (${terisi})` : ''}`}</Button>}>
          {msg && <p className={`mb-3 rounded-md px-3 py-2 text-sm ${msg.startsWith('Gagal') ? 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]' : 'bg-[var(--color-success-soft)] text-[var(--color-success)]'}`}>{msg}</p>}
          {!periode.trim() && <p className="mb-3 rounded-md bg-[var(--color-gold-soft)] px-3 py-2 text-xs text-[var(--color-ink)]">Isi <b>Periode</b> di atas (mis. "{ph}") sebelum mengisi & menyimpan.</p>}
          <div className="overflow-x-auto">
            <Table columns={['Siswa', 'Status', 'Skor', 'Catatan']}>
              {students.map((s) => {
                const v = vals[s.id] || {}
                return (
                  <Tr key={s.id}>
                    <Td className="font-medium whitespace-nowrap">{s.nama_lengkap}{s.nis ? <span className="block text-[11px] font-normal text-[var(--color-ink-soft)]">{s.nis}</span> : null}</Td>
                    <Td>
                      <select value={v.status || ''} onChange={(e) => setVal(s.id, { status: e.target.value })}
                        className="rounded-md border border-[var(--color-border)] bg-white px-2 py-1 text-sm outline-none focus:border-[var(--color-navy)]">
                        <option value="">—</option>
                        {STATUS.map((st) => <option key={st.v} value={st.v}>{st.l}</option>)}
                      </select>
                    </Td>
                    <Td><input type="number" min="0" max="100" value={v.skor ?? ''} onChange={(e) => setVal(s.id, { skor: e.target.value })} className="w-20 rounded-md border border-[var(--color-border)] px-2 py-1 text-sm outline-none focus:border-[var(--color-navy)]" /></Td>
                    <Td><input value={v.catatan ?? ''} onChange={(e) => setVal(s.id, { catatan: e.target.value })} placeholder="opsional" className="w-full min-w-[160px] rounded-md border border-[var(--color-border)] px-2 py-1 text-sm outline-none focus:border-[var(--color-navy)]" /></Td>
                  </Tr>
                )
              })}
            </Table>
          </div>
        </SectionCard>
      )}
    </div>
  )
}
