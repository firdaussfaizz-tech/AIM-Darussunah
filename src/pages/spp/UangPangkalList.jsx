import { useEffect, useState, useCallback, useMemo } from 'react'
import { Landmark, Plus, Pencil, Trash2, PlayCircle, ShieldAlert, ReceiptText } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, SectionCard, Card, Button, Badge, Table, Tr, Td, Modal, Input, Select, EmptyState, FullPageSpinner, StatCard } from '../../components/ui'
import { formatRupiah, formatDate, STATUS_BADGE_COLOR, SPP_TAGIHAN_STATUS_LABELS } from '../../lib/format'
import { useAutoRefresh } from '../../lib/useAutoRefresh'
import { PROGRAM_OPTIONS, PROGRAM_LABEL, PROGRAM_BADGE, UP_KOMPONEN_PRESET, KOMPONEN_SPP } from '../../lib/uangPangkal'
import { hitungPotongan } from '../../lib/keringanan'

const TABS = ['Tagihan & Pembayaran', 'Rekap & Tunggakan', 'Tarif Uang Pangkal']
const METODE_OPTIONS = ['Tunai', 'Transfer Bank', 'Lainnya']

export default function UangPangkalList() {
  const { isManager, isBendahara, hasFullAccess, managedSchoolIds, employee, can, permsReady, loading: authLoading } = useAuth()
  const [tab, setTab] = useState('Tagihan & Pembayaran')

  if (authLoading) return <FullPageSpinner />
  const bolehLihat = permsReady ? can('spp', 'lihat') : (isManager || isBendahara)
  if (!bolehLihat) {
    return <EmptyState icon={ShieldAlert} title="Akses terbatas" description="Peran Anda tidak memiliki izin melihat modul keuangan siswa." />
  }

  const tabs = isManager ? TABS : ['Tagihan & Pembayaran', 'Rekap & Tunggakan']
  const lockedSchoolId = isManager && !hasFullAccess && !isBendahara && managedSchoolIds.length > 0 ? managedSchoolIds[0] : null

  return (
    <div>
      <PageHeader title="Uang Pangkal" description="Kelola tarif, tagihan, dan pembayaran uang pangkal (sekali saat masuk). Fullday: SPP bulan pertama, Gedung, Pendidikan, Buku, Seragam. Boarding: + Sarana." />
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-[var(--color-border)]">
        {tabs.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${tab === t ? 'border-[var(--color-navy)] text-[var(--color-navy)]' : 'border-transparent text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Tagihan & Pembayaran' && <TagihanTab employeeId={employee?.id} lockedSchoolId={lockedSchoolId} />}
      {tab === 'Rekap & Tunggakan' && <RekapTab lockedSchoolId={lockedSchoolId} />}
      {tab === 'Tarif Uang Pangkal' && isManager && <TarifTab lockedSchoolId={lockedSchoolId} />}
    </div>
  )
}

// =========================================================================
// TAB: TAGIHAN & PEMBAYARAN
// =========================================================================
function TagihanTab({ employeeId, lockedSchoolId }) {
  const [tahunAjaranList, setTahunAjaranList] = useState([])
  const [schools, setSchools] = useState([])
  const [tahunAjaranId, setTahunAjaranId] = useState('')
  const [schoolFilter, setSchoolFilter] = useState(lockedSchoolId || '')
  const [programFilter, setProgramFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [rows, setRows] = useState([])
  const [bayarMap, setBayarMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [genResult, setGenResult] = useState(null)
  const [detail, setDetail] = useState(null)

  useEffect(() => { if (lockedSchoolId) setSchoolFilter(lockedSchoolId) }, [lockedSchoolId])

  useEffect(() => {
    (async () => {
      const [{ data: ta }, { data: sch }] = await Promise.all([
        supabase.from('tahun_ajaran').select('*').order('nama', { ascending: false }),
        supabase.from('schools').select('id, nama, jenjang').order('jenjang'),
      ])
      setTahunAjaranList(ta || [])
      setSchools(sch || [])
      const aktif = (ta || []).find((t) => t.status === 'aktif')
      if (aktif) setTahunAjaranId(aktif.id)
    })()
  }, [])

  const load = useCallback(async () => {
    if (!tahunAjaranId) { setRows([]); setLoading(false); return }
    setLoading(true)
    const { data: tg } = await supabase
      .from('up_tagihan')
      .select('*, siswa!siswa_id(id, nama_lengkap, nis, program, school_id, schools!school_id(nama, jenjang))')
      .eq('tahun_ajaran_id', tahunAjaranId)
    const ids = (tg || []).map((t) => t.id)
    let bm = {}
    if (ids.length) {
      const { data: pays } = await supabase.from('up_pembayaran').select('tagihan_id, nominal_dibayar').in('tagihan_id', ids)
      for (const p of pays || []) bm[p.tagihan_id] = (bm[p.tagihan_id] || 0) + Number(p.nominal_dibayar || 0)
    }
    setRows(tg || [])
    setBayarMap(bm)
    setLoading(false)
  }, [tahunAjaranId])
  useEffect(() => { load() }, [load])
  useAutoRefresh(['up_tagihan', 'up_pembayaran'], load)

  const handleGenerate = async () => {
    if (!tahunAjaranId || !schoolFilter || !programFilter) {
      alert('Pilih Tahun Ajaran, Unit Sekolah, dan Program dulu untuk generate uang pangkal.')
      return
    }
    const ta = tahunAjaranList.find((t) => t.id === tahunAjaranId)
    if (!confirm(`Buat tagihan Uang Pangkal untuk siswa ${PROGRAM_LABEL[programFilter]} di unit terpilih (TA ${ta?.nama})? Hanya dibuat untuk siswa aktif yang belum punya tagihan uang pangkal pada TA ini.`)) return
    setGenerating(true); setGenResult(null)

    // Tarif + rincian komponen untuk unit+TA+program.
    const { data: tarif } = await supabase.from('up_tarif').select('*, up_tarif_item(*)')
      .eq('tahun_ajaran_id', tahunAjaranId).eq('school_id', schoolFilter).eq('program', programFilter).maybeSingle()
    if (!tarif) { setGenerating(false); alert('Tarif uang pangkal untuk unit & program ini belum dibuat. Buka tab "Tarif Uang Pangkal" dulu.'); return }
    const items = (tarif.up_tarif_item || []).slice().sort((a, b) => (a.urutan - b.urutan))
    const total = items.reduce((s, it) => s + Number(it.nominal || 0), 0)
    const adaSpp = items.some((it) => it.komponen === KOMPONEN_SPP && Number(it.nominal || 0) > 0)
    const mulai = ta?.tanggal_mulai ? new Date(ta.tanggal_mulai) : new Date()
    const sppBulan = mulai.getMonth() + 1
    const sppTahun = mulai.getFullYear()

    // Siswa aktif (enrollment) di unit + program yang belum punya tagihan.
    const [{ data: enroll }, { data: existing }, { data: kebijakan }, { data: kerSiswa }] = await Promise.all([
      supabase.from('riwayat_siswa').select('siswa_id, siswa!siswa_id(id, nama_lengkap, school_id, status, program, anak_ke, employee_ortu_id)').eq('tahun_ajaran_id', tahunAjaranId).eq('status', 'aktif'),
      supabase.from('up_tagihan').select('siswa_id').eq('tahun_ajaran_id', tahunAjaranId),
      supabase.from('keringanan_kebijakan').select('*').eq('tahun_ajaran_id', tahunAjaranId).eq('sasaran', 'uang_pangkal').eq('aktif', true),
      supabase.from('keringanan_siswa').select('*').eq('sasaran', 'uang_pangkal').eq('aktif', true),
    ])
    const kerBySiswa = {}
    for (const g of kerSiswa || []) (kerBySiswa[g.siswa_id] = kerBySiswa[g.siswa_id] || []).push(g)
    const komponenMap = {}
    for (const it of items) komponenMap[it.komponen] = Number(it.nominal || 0)
    const today = new Date().toISOString().slice(0, 10)
    const sudah = new Set((existing || []).map((e) => e.siswa_id))
    const target = []
    const seen = new Set()
    for (const e of enroll || []) {
      const s = e.siswa
      if (!s || s.status !== 'aktif') continue
      if (s.school_id !== schoolFilter || (s.program || 'fullday') !== programFilter) continue
      if (sudah.has(e.siswa_id) || seen.has(e.siswa_id)) continue
      seen.add(e.siswa_id)
      target.push(s)
    }

    let dibuat = 0
    let adaPotongan = 0
    for (const s of target) {
      const { potongan, net, lines, catatan } = hitungPotongan({
        sasaran: 'uang_pangkal', totalBruto: total, komponenMap, siswa: s,
        kebijakanList: kebijakan || [], keringananSiswaList: kerBySiswa[s.id] || [],
        ctx: { tahunAjaranId, schoolId: s.school_id, program: programFilter, tanggal: today },
      })
      const { data: tag, error } = await supabase.from('up_tagihan').insert({
        siswa_id: s.id, tahun_ajaran_id: tahunAjaranId, program: programFilter,
        nominal_bruto: total, potongan, potongan_catatan: catatan, nominal_tagihan: net,
        status: net <= 0 ? 'lunas' : 'belum_bayar',
        spp_termasuk: adaSpp, spp_bulan: adaSpp ? sppBulan : null, spp_tahun: adaSpp ? sppTahun : null,
      }).select('id').single()
      if (error) continue
      const barisItem = items.map((it) => ({ tagihan_id: tag.id, komponen: it.komponen, nominal: it.nominal, urutan: it.urutan }))
      lines.forEach((l, i) => barisItem.push({ tagihan_id: tag.id, komponen: `Potongan: ${l.label}`, nominal: -Math.abs(l.nominal), urutan: 100 + i }))
      if (barisItem.length) await supabase.from('up_tagihan_item').insert(barisItem)
      if (potongan > 0) adaPotongan++
      dibuat++
    }
    setGenerating(false)
    setGenResult({ dibuat, target: target.length, adaSpp, sppBulan, sppTahun, adaPotongan })
    load()
  }

  const filtered = rows.filter((t) => {
    const okSchool = !schoolFilter || t.siswa?.school_id === schoolFilter
    const okProgram = !programFilter || t.program === programFilter
    const okStatus = !statusFilter || t.status === statusFilter
    return okSchool && okProgram && okStatus
  })
  const totalTagihan = filtered.reduce((s, t) => s + Number(t.nominal_tagihan || 0), 0)
  const totalDibayar = filtered.reduce((s, t) => s + (bayarMap[t.id] || 0), 0)
  const lunas = filtered.filter((t) => t.status === 'lunas').length

  return (
    <div>
      <Card className="mb-4" padded={false}>
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-end">
          <Select containerClassName="sm:w-56" label="Tahun Ajaran" value={tahunAjaranId} onChange={(e) => setTahunAjaranId(e.target.value)}>
            <option value="">— Pilih —</option>
            {tahunAjaranList.map((t) => <option key={t.id} value={t.id}>{t.nama}{t.status === 'aktif' ? ' (Aktif)' : ''}</option>)}
          </Select>
          {!lockedSchoolId && (
            <Select containerClassName="sm:w-56" label="Unit Sekolah" value={schoolFilter} onChange={(e) => setSchoolFilter(e.target.value)}>
              <option value="">Semua Unit</option>
              {schools.map((s) => <option key={s.id} value={s.id}>{s.jenjang} — {s.nama}</option>)}
            </Select>
          )}
          <Select containerClassName="sm:w-44" label="Program" value={programFilter} onChange={(e) => setProgramFilter(e.target.value)}>
            <option value="">Semua Program</option>
            {PROGRAM_OPTIONS.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
          </Select>
          <Select containerClassName="sm:w-44" label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Semua Status</option>
            {Object.entries(SPP_TAGIHAN_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </div>
      </Card>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid w-full min-w-0 flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Total Tagihan" value={formatRupiah(totalTagihan)} accent="navy" />
          <StatCard label="Dibayar" value={formatRupiah(totalDibayar)} accent="success" />
          <StatCard label="Tunggakan" value={formatRupiah(Math.max(0, totalTagihan - totalDibayar))} accent="danger" />
          <StatCard label="Lunas" value={`${lunas}/${filtered.length}`} />
        </div>
        <Button onClick={handleGenerate} disabled={generating || !tahunAjaranId} className="shrink-0">
          <PlayCircle className="h-4 w-4" /> {generating ? 'Memproses…' : 'Generate Uang Pangkal'}
        </Button>
      </div>

      {genResult && (
        <Card className="mb-4 bg-[var(--color-navy-50)]">
          <p className="text-sm text-[var(--color-ink)]">
            {genResult.dibuat} tagihan uang pangkal dibuat dari {genResult.target} siswa target.
            {genResult.adaPotongan > 0 && ` ${genResult.adaPotongan} mendapat keringanan/potongan.`}
            {genResult.adaSpp && ` Termasuk SPP bulan pertama (periode ${genResult.sppBulan}/${genResult.sppTahun}) — bulan tsb tidak akan ditagih lagi di SPP bulanan.`}
          </p>
        </Card>
      )}

      <Card padded={false}>
        <div className="p-5">
          {loading ? <FullPageSpinner /> : filtered.length === 0 ? (
            <EmptyState icon={ReceiptText} title="Belum ada tagihan uang pangkal" description="Pilih Unit + Program lalu klik 'Generate Uang Pangkal', atau ubah filter." />
          ) : (
            <Table columns={['Nama Siswa', 'Unit', 'Program', 'Tagihan', 'Dibayar', 'Status', '']}>
              {filtered.map((t) => {
                const d = bayarMap[t.id] || 0
                return (
                  <Tr key={t.id}>
                    <Td className="font-medium text-[var(--color-ink)]">{t.siswa?.nama_lengkap}</Td>
                    <Td className="text-[var(--color-ink-soft)]">{t.siswa?.schools ? `${t.siswa.schools.jenjang} — ${t.siswa.schools.nama}` : '—'}</Td>
                    <Td><Badge color={PROGRAM_BADGE[t.program]}>{PROGRAM_LABEL[t.program]}</Badge></Td>
                    <Td>{formatRupiah(t.nominal_tagihan)}</Td>
                    <Td className="text-[var(--color-success)]">{formatRupiah(d)}</Td>
                    <Td><Badge color={STATUS_BADGE_COLOR[t.status]}>{SPP_TAGIHAN_STATUS_LABELS[t.status]}</Badge></Td>
                    <Td className="text-right"><button onClick={() => setDetail(t)} className="text-sm font-medium text-[var(--color-navy)] hover:underline">Kelola</button></Td>
                  </Tr>
                )
              })}
            </Table>
          )}
        </div>
      </Card>

      {detail && <PembayaranModal tagihan={detail} employeeId={employeeId} onClose={() => setDetail(null)} onChanged={load} />}
    </div>
  )
}

function PembayaranModal({ tagihan, employeeId, onClose, onChanged }) {
  const [row, setRow] = useState(tagihan)
  const [items, setItems] = useState([])
  const [pembayaran, setPembayaran] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ nominal_dibayar: '', tanggal_bayar: new Date().toISOString().slice(0, 10), metode: 'Tunai', catatan: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: p }, { data: it }, { data: t }] = await Promise.all([
      supabase.from('up_pembayaran').select('*').eq('tagihan_id', tagihan.id).order('tanggal_bayar', { ascending: false }),
      supabase.from('up_tagihan_item').select('*').eq('tagihan_id', tagihan.id).order('urutan'),
      supabase.from('up_tagihan').select('*, siswa!siswa_id(nama_lengkap)').eq('id', tagihan.id).single(),
    ])
    setPembayaran(p || []); setItems(it || [])
    if (t) setRow(t)
    setLoading(false)
  }, [tagihan.id])
  useEffect(() => { load() }, [load])

  const totalDibayar = pembayaran.reduce((s, p) => s + Number(p.nominal_dibayar || 0), 0)
  const sisa = Number(row.nominal_tagihan || 0) - totalDibayar

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!form.nominal_dibayar || Number(form.nominal_dibayar) <= 0) { setError('Nominal pembayaran harus lebih dari 0.'); return }
    setSaving(true); setError('')
    const { error: err } = await supabase.from('up_pembayaran').insert({
      tagihan_id: tagihan.id, nominal_dibayar: Number(form.nominal_dibayar),
      tanggal_bayar: form.tanggal_bayar, metode: form.metode, catatan: form.catatan || null, dicatat_oleh: employeeId || null,
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    setForm({ nominal_dibayar: '', tanggal_bayar: new Date().toISOString().slice(0, 10), metode: 'Tunai', catatan: '' })
    load(); onChanged()
  }

  const handleDelete = async (p) => {
    if (!confirm(`Hapus pembayaran ${formatRupiah(p.nominal_dibayar)} tanggal ${formatDate(p.tanggal_bayar)}?`)) return
    const { error: err } = await supabase.from('up_pembayaran').delete().eq('id', p.id)
    if (err) { alert('Gagal menghapus: ' + err.message); return }
    load(); onChanged()
  }

  return (
    <Modal open onClose={onClose} title={`Uang Pangkal — ${row.siswa?.nama_lengkap || ''}`} width="max-w-xl">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-3 rounded-md border border-[var(--color-border)] p-3 text-sm">
          <div><p className="text-[var(--color-ink-soft)]">Tagihan</p><p className="font-semibold">{formatRupiah(row.nominal_tagihan)}</p></div>
          <div><p className="text-[var(--color-ink-soft)]">Dibayar</p><p className="font-semibold text-[var(--color-success)]">{formatRupiah(totalDibayar)}</p></div>
          <div><p className="text-[var(--color-ink-soft)]">Sisa</p><p className={`font-semibold ${sisa > 0 ? 'text-[var(--color-danger)]' : ''}`}>{formatRupiah(Math.max(sisa, 0))}</p></div>
        </div>

        {items.length > 0 && (
          <div className="rounded-md border border-[var(--color-border)] p-3">
            <p className="mb-1.5 text-[13px] font-semibold text-[var(--color-ink)]">Rincian Komponen</p>
            <div className="flex flex-col gap-1 text-sm">
              {items.map((it) => (
                <div key={it.id} className="flex justify-between">
                  <span className="text-[var(--color-ink-soft)]">{it.komponen}{it.komponen === KOMPONEN_SPP && row.spp_bulan ? ` (periode ${row.spp_bulan}/${row.spp_tahun})` : ''}</span>
                  <span>{formatRupiah(it.nominal)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {loading ? <FullPageSpinner /> : (
          <div className="flex flex-col gap-2">
            <p className="text-[13px] font-semibold text-[var(--color-ink)]">Riwayat Pembayaran</p>
            {pembayaran.length === 0 ? <p className="text-sm text-[var(--color-ink-soft)]">Belum ada pembayaran tercatat.</p> : pembayaran.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-md border border-[var(--color-border)] px-3 py-2 text-sm">
                <div>
                  <p className="font-medium">{formatRupiah(p.nominal_dibayar)} <span className="font-normal text-[var(--color-ink-soft)]">— {p.metode || '—'}</span></p>
                  <p className="text-xs text-[var(--color-ink-soft)]">{formatDate(p.tanggal_bayar)}{p.catatan ? ` — ${p.catatan}` : ''}</p>
                </div>
                <button onClick={() => handleDelete(p)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleAdd} className="flex flex-col gap-3 border-t border-[var(--color-border)] pt-4">
          <p className="text-[13px] font-semibold text-[var(--color-ink)]">Tambah Pembayaran (boleh dicicil)</p>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Nominal" type="number" min="1" value={form.nominal_dibayar} onChange={(e) => setForm((s) => ({ ...s, nominal_dibayar: e.target.value }))} />
            <Input label="Tanggal" type="date" value={form.tanggal_bayar} onChange={(e) => setForm((s) => ({ ...s, tanggal_bayar: e.target.value }))} />
          </div>
          <Select label="Metode" value={form.metode} onChange={(e) => setForm((s) => ({ ...s, metode: e.target.value }))}>
            {METODE_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
          <Input label="Catatan (opsional)" value={form.catatan} onChange={(e) => setForm((s) => ({ ...s, catatan: e.target.value }))} />
          {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Tutup</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Tambah Pembayaran'}</Button>
          </div>
        </form>
      </div>
    </Modal>
  )
}

// =========================================================================
// TAB: REKAP & TUNGGAKAN
// =========================================================================
function RekapTab({ lockedSchoolId }) {
  const [tahunAjaranList, setTahunAjaranList] = useState([])
  const [taId, setTaId] = useState('')
  const [rows, setRows] = useState([])
  const [bayarMap, setBayarMap] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('tahun_ajaran').select('id, nama, status').order('nama', { ascending: false }).then(({ data }) => {
      const list = data || []
      setTahunAjaranList(list)
      const def = (list.find((t) => t.status === 'aktif') || list[0])?.id || ''
      setTaId(def)
      if (!def) setLoading(false)
    })
  }, [])

  const load = useCallback(async () => {
    if (!taId) { setRows([]); setLoading(false); return }
    setLoading(true)
    const { data: tg } = await supabase
      .from('up_tagihan')
      .select('id, nominal_tagihan, status, siswa!siswa_id(nama_lengkap, school_id, schools!school_id(nama, jenjang))')
      .eq('tahun_ajaran_id', taId)
    const ids = (tg || []).map((t) => t.id)
    let bm = {}
    if (ids.length) {
      const { data: pays } = await supabase.from('up_pembayaran').select('tagihan_id, nominal_dibayar').in('tagihan_id', ids)
      for (const p of pays || []) bm[p.tagihan_id] = (bm[p.tagihan_id] || 0) + Number(p.nominal_dibayar || 0)
    }
    setRows(tg || []); setBayarMap(bm)
    setLoading(false)
  }, [taId])
  useEffect(() => { if (taId) load() }, [taId, load])
  useAutoRefresh(['up_tagihan', 'up_pembayaran'], load)

  const perUnit = useMemo(() => {
    const map = new Map()
    for (const t of rows) {
      if (lockedSchoolId && t.siswa?.school_id !== lockedSchoolId) continue
      const key = t.siswa?.school_id || 'tanpa-unit'
      const unit = t.siswa?.schools ? `${t.siswa.schools.jenjang} — ${t.siswa.schools.nama}` : 'Tanpa unit'
      const cur = map.get(key) || { unit, jumlah: 0, lunas: 0, ditagih: 0, dibayar: 0 }
      cur.jumlah += 1
      if (t.status === 'lunas') cur.lunas += 1
      cur.ditagih += Number(t.nominal_tagihan || 0)
      cur.dibayar += bayarMap[t.id] || 0
      map.set(key, cur)
    }
    return Array.from(map.entries()).map(([key, v]) => ({ key, ...v, tunggakan: Math.max(0, v.ditagih - v.dibayar) }))
  }, [rows, bayarMap, lockedSchoolId])

  const penunggak = useMemo(() => rows
    .filter((t) => !lockedSchoolId || t.siswa?.school_id === lockedSchoolId)
    .map((t) => ({ id: t.id, nama: t.siswa?.nama_lengkap || '—', unit: t.siswa?.schools ? `${t.siswa.schools.jenjang} — ${t.siswa.schools.nama}` : '—', tunggakan: Math.max(0, Number(t.nominal_tagihan || 0) - (bayarMap[t.id] || 0)) }))
    .filter((p) => p.tunggakan > 0)
    .sort((a, b) => b.tunggakan - a.tunggakan)
    .slice(0, 20), [rows, bayarMap, lockedSchoolId])

  const total = useMemo(() => perUnit.reduce((a, u) => ({
    jumlah: a.jumlah + u.jumlah, lunas: a.lunas + u.lunas, ditagih: a.ditagih + u.ditagih, dibayar: a.dibayar + u.dibayar, tunggakan: a.tunggakan + u.tunggakan,
  }), { jumlah: 0, lunas: 0, ditagih: 0, dibayar: 0, tunggakan: 0 }), [perUnit])

  if (loading) return <FullPageSpinner />

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Select containerClassName="w-56" value={taId} onChange={(e) => setTaId(e.target.value)}>
          {tahunAjaranList.length === 0 && <option value="">— Belum ada Tahun Ajaran —</option>}
          {tahunAjaranList.map((t) => <option key={t.id} value={t.id}>TA {t.nama}{t.status === 'aktif' ? ' (aktif)' : ''}</option>)}
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Ditagih" value={formatRupiah(total.ditagih)} />
        <StatCard label="Total Dibayar" value={formatRupiah(total.dibayar)} accent="gold" />
        <StatCard label="Total Tunggakan" value={formatRupiah(total.tunggakan)} accent="danger" />
        <StatCard label="Lunas" value={`${total.lunas} / ${total.jumlah}`} sub={total.jumlah > 0 ? `${Math.round((total.lunas / total.jumlah) * 100)}% lunas` : undefined} />
      </div>

      <SectionCard title="Rekap Uang Pangkal per Unit">
        {perUnit.length === 0 ? <p className="text-sm text-[var(--color-ink-soft)]">Belum ada tagihan uang pangkal pada tahun ajaran ini.</p> : (
          <Table columns={['Unit', 'Tagihan', 'Lunas', '% Lunas', 'Ditagih', 'Dibayar', 'Tunggakan']}>
            {perUnit.map((u) => (
              <Tr key={u.key}>
                <Td>{u.unit}</Td><Td>{u.jumlah}</Td><Td>{u.lunas}</Td>
                <Td>{u.jumlah > 0 ? Math.round((u.lunas / u.jumlah) * 100) : 0}%</Td>
                <Td>{formatRupiah(u.ditagih)}</Td><Td>{formatRupiah(u.dibayar)}</Td>
                <Td className="font-medium text-[var(--color-danger)]">{formatRupiah(u.tunggakan)}</Td>
              </Tr>
            ))}
            <Tr>
              <Td className="font-semibold">Total</Td><Td className="font-semibold">{total.jumlah}</Td><Td className="font-semibold">{total.lunas}</Td>
              <Td className="font-semibold">{total.jumlah > 0 ? Math.round((total.lunas / total.jumlah) * 100) : 0}%</Td>
              <Td className="font-semibold">{formatRupiah(total.ditagih)}</Td><Td className="font-semibold">{formatRupiah(total.dibayar)}</Td>
              <Td className="font-semibold text-[var(--color-danger)]">{formatRupiah(total.tunggakan)}</Td>
            </Tr>
          </Table>
        )}
      </SectionCard>

      <SectionCard title="20 Penunggak Terbesar" description="Siswa dengan sisa tunggakan uang pangkal terbesar">
        {penunggak.length === 0 ? <p className="text-sm text-[var(--color-ink-soft)]">Tidak ada tunggakan. 🎉</p> : (
          <Table columns={['Nama Siswa', 'Unit', 'Tunggakan']}>
            {penunggak.map((p) => (
              <Tr key={p.id}><Td>{p.nama}</Td><Td>{p.unit}</Td><Td className="font-medium text-[var(--color-danger)]">{formatRupiah(p.tunggakan)}</Td></Tr>
            ))}
          </Table>
        )}
      </SectionCard>
    </div>
  )
}

// =========================================================================
// TAB: TARIF UANG PANGKAL (header + komponen)
// =========================================================================
function TarifTab({ lockedSchoolId }) {
  const [tarifList, setTarifList] = useState([])
  const [schools, setSchools] = useState([])
  const [tahunAjaranList, setTahunAjaranList] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // 'new' | tarif row | null

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: t }, { data: s }, { data: ta }] = await Promise.all([
      supabase.from('up_tarif').select('*, schools!school_id(nama, jenjang), tahun_ajaran(nama), up_tarif_item(*)').order('tahun_ajaran_id', { ascending: false }),
      supabase.from('schools').select('id, nama, jenjang').order('jenjang'),
      supabase.from('tahun_ajaran').select('id, nama, status').order('nama', { ascending: false }),
    ])
    setTarifList(t || []); setSchools(s || []); setTahunAjaranList(ta || [])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const handleDelete = async (t) => {
    if (!confirm('Hapus tarif uang pangkal ini? Tagihan yang sudah dibuat TIDAK berubah.')) return
    const { error } = await supabase.from('up_tarif').delete().eq('id', t.id)
    if (error) { alert('Gagal: ' + error.message); return }
    load()
  }

  const totalOf = (t) => (t.up_tarif_item || []).reduce((s, it) => s + Number(it.nominal || 0), 0)

  if (loading) return <FullPageSpinner />

  return (
    <SectionCard
      title="Tarif Uang Pangkal"
      description="Per unit + tahun ajaran + program, dengan rincian komponen. Komponen 'SPP (bulan pertama)' otomatis mengurangi tagihan SPP bulan pertama."
      actions={<Button size="sm" variant="outline" onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> Tambah Tarif</Button>}
    >
      {tarifList.length === 0 ? <EmptyState icon={Landmark} title="Belum ada tarif uang pangkal" /> : (
        <Table columns={['Unit', 'Tahun Ajaran', 'Program', 'Komponen', 'Total', '']}>
          {tarifList.map((t) => (
            <Tr key={t.id}>
              <Td className="font-medium">{t.schools ? `${t.schools.jenjang} — ${t.schools.nama}` : '—'}</Td>
              <Td className="text-[var(--color-ink-soft)]">{t.tahun_ajaran?.nama || '—'}</Td>
              <Td><Badge color={PROGRAM_BADGE[t.program]}>{PROGRAM_LABEL[t.program]}</Badge></Td>
              <Td className="text-xs text-[var(--color-ink-soft)]">{(t.up_tarif_item || []).length} komponen</Td>
              <Td className="font-medium">{formatRupiah(totalOf(t))}</Td>
              <Td className="text-right">
                <div className="flex justify-end gap-2">
                  <button onClick={() => setEditing(t)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Ubah"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => handleDelete(t)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus"><Trash2 className="h-4 w-4" /></button>
                </div>
              </Td>
            </Tr>
          ))}
        </Table>
      )}
      {editing && <TarifModal entry={editing} schools={lockedSchoolId ? schools.filter((s) => s.id === lockedSchoolId) : schools} lockedSchoolId={lockedSchoolId} tahunAjaranList={tahunAjaranList} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
    </SectionCard>
  )
}

function TarifModal({ entry, schools, lockedSchoolId, tahunAjaranList, onClose, onSaved }) {
  const isNew = entry === 'new'
  const [schoolId, setSchoolId] = useState(isNew ? (lockedSchoolId || '') : entry.school_id)
  const [taId, setTaId] = useState(isNew ? '' : entry.tahun_ajaran_id)
  const [program, setProgram] = useState(isNew ? 'fullday' : entry.program)
  const [items, setItems] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isNew && entry.up_tarif_item) {
      setItems(entry.up_tarif_item.slice().sort((a, b) => a.urutan - b.urutan).map((it) => ({ komponen: it.komponen, nominal: String(it.nominal ?? '') })))
    } else {
      setItems(UP_KOMPONEN_PRESET[program].map((k) => ({ komponen: k, nominal: '' })))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Saat program diganti pada tarif BARU, segarkan preset komponen.
  const onProgramChange = (p) => {
    setProgram(p)
    if (isNew) setItems(UP_KOMPONEN_PRESET[p].map((k) => ({ komponen: k, nominal: '' })))
  }

  const setItem = (i, patch) => setItems((arr) => arr.map((it, idx) => idx === i ? { ...it, ...patch } : it))
  const addItem = () => setItems((arr) => [...arr, { komponen: '', nominal: '' }])
  const removeItem = (i) => setItems((arr) => arr.filter((_, idx) => idx !== i))
  const total = items.reduce((s, it) => s + (Number(it.nominal) || 0), 0)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!schoolId || !taId) { setError('Pilih unit sekolah dan tahun ajaran.'); return }
    const cleanItems = items.filter((it) => it.komponen.trim()).map((it, i) => ({ komponen: it.komponen.trim(), nominal: Number(it.nominal) || 0, urutan: i }))
    if (cleanItems.length === 0) { setError('Tambahkan minimal satu komponen.'); return }
    setSaving(true)
    let tarifId = isNew ? null : entry.id
    if (isNew) {
      const { data, error: err } = await supabase.from('up_tarif').insert({ school_id: schoolId, tahun_ajaran_id: taId, program }).select('id').single()
      if (err) { setSaving(false); setError(/duplicate|unique/i.test(err.message) ? 'Tarif untuk unit, tahun ajaran, dan program ini sudah ada.' : err.message); return }
      tarifId = data.id
    } else {
      await supabase.from('up_tarif').update({ school_id: schoolId, tahun_ajaran_id: taId, program }).eq('id', entry.id)
      await supabase.from('up_tarif_item').delete().eq('tarif_id', entry.id)
    }
    const { error: errItems } = await supabase.from('up_tarif_item').insert(cleanItems.map((it) => ({ ...it, tarif_id: tarifId })))
    setSaving(false)
    if (errItems) { setError(errItems.message); return }
    onSaved()
  }

  return (
    <Modal open onClose={onClose} title={isNew ? 'Tambah Tarif Uang Pangkal' : 'Ubah Tarif Uang Pangkal'} width="max-w-xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Select label="Unit Sekolah" required disabled={!!lockedSchoolId} value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
            <option value="">— Pilih —</option>
            {schools.map((s) => <option key={s.id} value={s.id}>{s.jenjang} — {s.nama}</option>)}
          </Select>
          <Select label="Tahun Ajaran" required value={taId} onChange={(e) => setTaId(e.target.value)}>
            <option value="">— Pilih —</option>
            {tahunAjaranList.map((t) => <option key={t.id} value={t.id}>{t.nama}{t.status === 'aktif' ? ' (Aktif)' : ''}</option>)}
          </Select>
          <Select label="Program" value={program} onChange={(e) => onProgramChange(e.target.value)}>
            {PROGRAM_OPTIONS.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
          </Select>
        </div>

        <div className="rounded-md border border-[var(--color-border)] p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[13px] font-semibold text-[var(--color-ink)]">Komponen & Nominal</p>
            <button type="button" onClick={addItem} className="text-xs font-medium text-[var(--color-navy)] hover:underline">+ Komponen</button>
          </div>
          <div className="flex flex-col gap-2">
            {items.map((it, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input containerClassName="flex-1" value={it.komponen} onChange={(e) => setItem(i, { komponen: e.target.value })} placeholder="Nama komponen" />
                <Input containerClassName="w-40" type="number" min="0" value={it.nominal} onChange={(e) => setItem(i, { nominal: e.target.value })} placeholder="Nominal" />
                <button type="button" onClick={() => removeItem(i)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus komponen"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between border-t border-[var(--color-border)] pt-2 text-sm font-semibold">
            <span>Total</span><span>{formatRupiah(total)}</span>
          </div>
        </div>

        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button>
        </div>
      </form>
    </Modal>
  )
}
