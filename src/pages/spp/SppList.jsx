import { useEffect, useState, useCallback } from 'react'
import { Wallet, Plus, Pencil, Trash2, PlayCircle, ShieldAlert, ReceiptText } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, SectionCard, Card, Button, Badge, Table, Tr, Td, Modal, Input, Select, EmptyState, FullPageSpinner, StatCard } from '../../components/ui'
import { BULAN, formatRupiah, formatDate, STATUS_BADGE_COLOR, SPP_TAGIHAN_STATUS_LABELS } from '../../lib/format'

const TABS = ['Tagihan & Pembayaran', 'Tarif SPP']

export default function SppList() {
  const { isManager, isBendahara, hasFullAccess, managedSchoolIds, employee, loading: authLoading } = useAuth()
  const [tab, setTab] = useState('Tagihan & Pembayaran')

  if (authLoading) return <FullPageSpinner />
  if (!isManager && !isBendahara) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Akses terbatas"
        description="Halaman SPP hanya dapat diakses oleh Bendahara, Admin Yayasan, HR, Admin Sekolah, atau Kepala Sekolah."
      />
    )
  }

  const tabs = isManager ? TABS : [TABS[0]]
  // Admin Sekolah/Kepala Sekolah (isManager tapi bukan Admin Yayasan/HR)
  // dikunci ke unit-nya sendiri. Bendahara SENGAJA tidak dikunci — aksesnya
  // memang lintas unit by design (lihat migrasi 0024/0026).
  const lockedSchoolId = isManager && !hasFullAccess && !isBendahara && managedSchoolIds.length > 0 ? managedSchoolIds[0] : null

  return (
    <div>
      <PageHeader title="SPP" description="Kelola tarif, tagihan bulanan, dan pembayaran SPP siswa." />
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

      {tab === 'Tagihan & Pembayaran' && <TagihanTab employeeId={employee?.id} lockedSchoolId={lockedSchoolId} />}
      {tab === 'Tarif SPP' && isManager && <TarifTab lockedSchoolId={lockedSchoolId} />}
    </div>
  )
}

// =========================================================================
// TAB: TAGIHAN & PEMBAYARAN
// =========================================================================
function TagihanTab({ employeeId, lockedSchoolId }) {
  const now = new Date()
  const [tahunAjaranList, setTahunAjaranList] = useState([])
  const [schools, setSchools] = useState([])
  const [tahunAjaranId, setTahunAjaranId] = useState('')
  const [bulan, setBulan] = useState(now.getMonth() + 1)
  const [tahun, setTahun] = useState(now.getFullYear())
  const [schoolFilter, setSchoolFilter] = useState(lockedSchoolId || '')
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => {
    if (lockedSchoolId) setSchoolFilter(lockedSchoolId)
  }, [lockedSchoolId])

  const [tagihanList, setTagihanList] = useState([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [genResult, setGenResult] = useState(null)
  const [detailTagihan, setDetailTagihan] = useState(null)

  useEffect(() => {
    const loadMeta = async () => {
      const [{ data: ta }, { data: sch }] = await Promise.all([
        supabase.from('tahun_ajaran').select('*').order('nama', { ascending: false }),
        supabase.from('schools').select('id, nama, jenjang').order('jenjang'),
      ])
      setTahunAjaranList(ta || [])
      setSchools(sch || [])
      const aktif = (ta || []).find((t) => t.status === 'aktif')
      if (aktif) setTahunAjaranId(aktif.id)
    }
    loadMeta()
  }, [])

  const loadTagihan = useCallback(async () => {
    if (!tahunAjaranId) { setTagihanList([]); setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('spp_tagihan')
      .select('*, siswa!siswa_id(id, nama_lengkap, nis, school_id, schools!school_id(nama, jenjang))')
      .eq('tahun_ajaran_id', tahunAjaranId).eq('bulan', bulan).eq('tahun', tahun)
    setTagihanList(data || [])
    setLoading(false)
  }, [tahunAjaranId, bulan, tahun])

  useEffect(() => { loadTagihan() }, [loadTagihan])

  const handleGenerate = async () => {
    if (!tahunAjaranId) return
    if (!confirm(`Buat tagihan SPP periode ${BULAN[bulan - 1]} ${tahun}? Tagihan hanya dibuat untuk siswa aktif yang belum memiliki tagihan pada periode ini dan unit sekolahnya sudah memiliki tarif SPP.`)) return
    setGenerating(true)
    setGenResult(null)

    const [{ data: enroll }, { data: tarifRows }, { data: existing }] = await Promise.all([
      supabase.from('riwayat_siswa').select('siswa_id, siswa!siswa_id(id, nama_lengkap, school_id, status), rombel(tingkat)').eq('tahun_ajaran_id', tahunAjaranId).eq('status', 'aktif'),
      supabase.from('spp_tarif').select('*').eq('tahun_ajaran_id', tahunAjaranId),
      supabase.from('spp_tagihan').select('siswa_id').eq('bulan', bulan).eq('tahun', tahun).eq('tahun_ajaran_id', tahunAjaranId),
    ])
    const existingIds = new Set((existing || []).map((e) => e.siswa_id))
    const dilewati = []
    const rows = []

    for (const e of enroll || []) {
      if (!e.siswa || e.siswa.status !== 'aktif' || existingIds.has(e.siswa_id)) continue
      const tarifSpesifik = (tarifRows || []).find((t) => t.school_id === e.siswa.school_id && t.tingkat === e.rombel?.tingkat)
      const tarifUmum = (tarifRows || []).find((t) => t.school_id === e.siswa.school_id && t.tingkat === null)
      const tarif = tarifSpesifik || tarifUmum
      if (!tarif) { dilewati.push(e.siswa.nama_lengkap); continue }
      rows.push({
        siswa_id: e.siswa_id, tahun_ajaran_id: tahunAjaranId, bulan, tahun,
        nominal_tagihan: tarif.nominal, jatuh_tempo: `${tahun}-${String(bulan).padStart(2, '0')}-10`,
      })
    }

    if (rows.length > 0) {
      const { error } = await supabase.from('spp_tagihan').insert(rows)
      if (error) { setGenerating(false); alert('Gagal membuat tagihan: ' + error.message); return }
    }
    setGenerating(false)
    setGenResult({ dibuat: rows.length, dilewati })
    loadTagihan()
  }

  const filtered = tagihanList.filter((t) => {
    const matchesSchool = !schoolFilter || t.siswa?.school_id === schoolFilter
    const matchesStatus = !statusFilter || t.status === statusFilter
    return matchesSchool && matchesStatus
  })

  const totalTagihan = filtered.reduce((sum, t) => sum + Number(t.nominal_tagihan || 0), 0)
  const jumlahLunas = filtered.filter((t) => t.status === 'lunas').length
  const jumlahBelum = filtered.filter((t) => t.status !== 'lunas').length

  return (
    <div>
      <Card className="mb-4" padded={false}>
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-center">
          <Select containerClassName="sm:w-56" label="Tahun Ajaran" value={tahunAjaranId} onChange={(e) => setTahunAjaranId(e.target.value)}>
            <option value="">— Pilih —</option>
            {tahunAjaranList.map((t) => <option key={t.id} value={t.id}>{t.nama}{t.status === 'aktif' ? ' (Aktif)' : ''}</option>)}
          </Select>
          <Select containerClassName="sm:w-40" label="Bulan" value={bulan} onChange={(e) => setBulan(Number(e.target.value))}>
            {BULAN.map((b, i) => <option key={b} value={i + 1}>{b}</option>)}
          </Select>
          <Input containerClassName="sm:w-28" label="Tahun" type="number" value={tahun} onChange={(e) => setTahun(Number(e.target.value))} />
          {!lockedSchoolId && (
            <Select containerClassName="sm:w-56" label="Unit Sekolah" value={schoolFilter} onChange={(e) => setSchoolFilter(e.target.value)}>
              <option value="">Semua Unit</option>
              {schools.map((s) => <option key={s.id} value={s.id}>{s.jenjang} — {s.nama}</option>)}
            </Select>
          )}
          <Select containerClassName="sm:w-44" label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Semua Status</option>
            {Object.entries(SPP_TAGIHAN_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </div>
      </Card>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard label="Total Tagihan" value={formatRupiah(totalTagihan)} />
          <StatCard label="Sudah Lunas" value={`${jumlahLunas} siswa`} />
          <StatCard label="Belum Lunas" value={`${jumlahBelum} siswa`} />
        </div>
        <Button onClick={handleGenerate} disabled={generating || !tahunAjaranId} className="shrink-0">
          <PlayCircle className="h-4 w-4" /> {generating ? 'Memproses…' : 'Generate Tagihan Bulanan'}
        </Button>
      </div>

      {genResult && (
        <Card className="mb-4 bg-[var(--color-navy-50)]">
          <p className="text-sm text-[var(--color-ink)]">
            {genResult.dibuat} tagihan baru dibuat.
            {genResult.dilewati.length > 0 && ` ${genResult.dilewati.length} siswa dilewati karena unit sekolahnya belum memiliki tarif SPP untuk tahun ajaran ini (${genResult.dilewati.slice(0, 5).join(', ')}${genResult.dilewati.length > 5 ? ', …' : ''}).`}
          </p>
        </Card>
      )}

      <Card padded={false}>
        <div className="p-5">
          {loading ? (
            <FullPageSpinner />
          ) : filtered.length === 0 ? (
            <EmptyState icon={ReceiptText} title="Belum ada tagihan" description="Klik 'Generate Tagihan Bulanan' untuk membuat tagihan periode ini, atau ubah filter di atas." />
          ) : (
            <Table columns={['Nama Siswa', 'Unit', 'Nominal Tagihan', 'Status', '']}>
              {filtered.map((t) => (
                <Tr key={t.id}>
                  <Td className="font-medium text-[var(--color-ink)]">{t.siswa?.nama_lengkap}</Td>
                  <Td className="text-[var(--color-ink-soft)]">{t.siswa?.schools ? `${t.siswa.schools.jenjang} — ${t.siswa.schools.nama}` : '—'}</Td>
                  <Td>{formatRupiah(t.nominal_tagihan)}</Td>
                  <Td><Badge color={STATUS_BADGE_COLOR[t.status]}>{SPP_TAGIHAN_STATUS_LABELS[t.status]}</Badge></Td>
                  <Td className="text-right">
                    <button onClick={() => setDetailTagihan(t)} className="text-sm font-medium text-[var(--color-navy)] hover:underline">Kelola Pembayaran</button>
                  </Td>
                </Tr>
              ))}
            </Table>
          )}
        </div>
      </Card>

      {detailTagihan && (
        <PembayaranModal
          tagihan={detailTagihan}
          employeeId={employeeId}
          onClose={() => setDetailTagihan(null)}
          onChanged={() => loadTagihan()}
        />
      )}
    </div>
  )
}

const METODE_OPTIONS = ['Tunai', 'Transfer Bank', 'Lainnya']

function PembayaranModal({ tagihan, employeeId, onClose, onChanged }) {
  const [row, setRow] = useState(tagihan)
  const [pembayaran, setPembayaran] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ nominal_dibayar: '', tanggal_bayar: new Date().toISOString().slice(0, 10), metode: 'Tunai', catatan: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: p }, { data: t }] = await Promise.all([
      supabase.from('spp_pembayaran').select('*').eq('tagihan_id', tagihan.id).order('tanggal_bayar', { ascending: false }),
      supabase.from('spp_tagihan').select('*, siswa!siswa_id(nama_lengkap)').eq('id', tagihan.id).single(),
    ])
    setPembayaran(p || [])
    if (t) setRow(t)
    setLoading(false)
  }, [tagihan.id])

  useEffect(() => { load() }, [load])

  const totalDibayar = pembayaran.reduce((sum, p) => sum + Number(p.nominal_dibayar || 0), 0)
  const sisa = Number(row.nominal_tagihan || 0) - totalDibayar

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!form.nominal_dibayar || Number(form.nominal_dibayar) <= 0) { setError('Nominal pembayaran harus lebih dari 0.'); return }
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('spp_pembayaran').insert({
      tagihan_id: tagihan.id,
      nominal_dibayar: Number(form.nominal_dibayar),
      tanggal_bayar: form.tanggal_bayar,
      metode: form.metode,
      catatan: form.catatan || null,
      dicatat_oleh: employeeId || null,
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    setForm({ nominal_dibayar: '', tanggal_bayar: new Date().toISOString().slice(0, 10), metode: 'Tunai', catatan: '' })
    load()
    onChanged()
  }

  const handleDelete = async (p) => {
    if (!confirm(`Hapus catatan pembayaran ${formatRupiah(p.nominal_dibayar)} tanggal ${formatDate(p.tanggal_bayar)}?`)) return
    const { error: err } = await supabase.from('spp_pembayaran').delete().eq('id', p.id)
    if (err) { alert('Gagal menghapus: ' + err.message); return }
    load()
    onChanged()
  }

  return (
    <Modal open onClose={onClose} title={`Pembayaran SPP — ${row.siswa?.nama_lengkap || ''}`} width="max-w-xl">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-3 rounded-md border border-[var(--color-border)] p-3 text-sm">
          <div><p className="text-[var(--color-ink-soft)]">Tagihan</p><p className="font-semibold">{formatRupiah(row.nominal_tagihan)}</p></div>
          <div><p className="text-[var(--color-ink-soft)]">Dibayar</p><p className="font-semibold text-[var(--color-success)]">{formatRupiah(totalDibayar)}</p></div>
          <div><p className="text-[var(--color-ink-soft)]">Sisa</p><p className={`font-semibold ${sisa > 0 ? 'text-[var(--color-danger)]' : ''}`}>{formatRupiah(Math.max(sisa, 0))}</p></div>
        </div>

        {loading ? <FullPageSpinner /> : (
          <div className="flex flex-col gap-2">
            {pembayaran.length === 0 ? (
              <p className="text-sm text-[var(--color-ink-soft)]">Belum ada pembayaran tercatat.</p>
            ) : (
              pembayaran.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-md border border-[var(--color-border)] px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium">{formatRupiah(p.nominal_dibayar)} <span className="font-normal text-[var(--color-ink-soft)]">— {p.metode || '—'}</span></p>
                    <p className="text-xs text-[var(--color-ink-soft)]">{formatDate(p.tanggal_bayar)}{p.catatan ? ` — ${p.catatan}` : ''}</p>
                  </div>
                  <button onClick={() => handleDelete(p)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus pembayaran">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        <form onSubmit={handleAdd} className="flex flex-col gap-3 border-t border-[var(--color-border)] pt-4">
          <p className="text-[13px] font-semibold text-[var(--color-ink)]">Tambah Pembayaran</p>
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
// TAB: TARIF SPP
// =========================================================================
const emptyTarifForm = { school_id: '', tahun_ajaran_id: '', tingkat: '', nominal: '' }

function TarifTab({ lockedSchoolId }) {
  const [tarifList, setTarifList] = useState([])
  const [schools, setSchools] = useState([])
  const [tahunAjaranList, setTahunAjaranList] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyTarifForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const visibleSchools = lockedSchoolId ? schools.filter((s) => s.id === lockedSchoolId) : schools

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: t }, { data: s }, { data: ta }] = await Promise.all([
      supabase.from('spp_tarif').select('*, schools!school_id(nama, jenjang), tahun_ajaran(nama)').order('tahun_ajaran_id', { ascending: false }),
      supabase.from('schools').select('id, nama, jenjang').order('jenjang'),
      supabase.from('tahun_ajaran').select('id, nama, status').order('nama', { ascending: false }),
    ])
    setTarifList(t || [])
    setSchools(s || [])
    setTahunAjaranList(ta || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const openAdd = () => { setEditingId(null); setForm({ ...emptyTarifForm, school_id: lockedSchoolId || '' }); setError(''); setModalOpen(true) }
  const openEdit = (t) => {
    setEditingId(t.id)
    setForm({ school_id: t.school_id, tahun_ajaran_id: t.tahun_ajaran_id, tingkat: t.tingkat || '', nominal: t.nominal })
    setError('')
    setModalOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    const payload = {
      school_id: form.school_id, tahun_ajaran_id: form.tahun_ajaran_id,
      tingkat: form.tingkat.trim() === '' ? null : form.tingkat.trim(),
      nominal: Number(form.nominal) || 0,
    }
    const query = editingId ? supabase.from('spp_tarif').update(payload).eq('id', editingId) : supabase.from('spp_tarif').insert(payload)
    const { error: err } = await query
    setSaving(false)
    if (err) { setError(err.message.includes('duplicate') ? 'Tarif untuk unit, tahun ajaran, dan tingkat ini sudah ada.' : err.message); return }
    setModalOpen(false)
    load()
  }

  const handleDelete = async (t) => {
    if (!confirm(`Hapus tarif SPP ini? Tagihan yang sudah dibuat sebelumnya TIDAK akan berubah.`)) return
    const { error: err } = await supabase.from('spp_tarif').delete().eq('id', t.id)
    if (err) { alert('Gagal menghapus: ' + err.message); return }
    load()
  }

  if (loading) return <FullPageSpinner />

  return (
    <SectionCard
      title="Tarif SPP"
      description="Tarif dipakai otomatis saat 'Generate Tagihan Bulanan'. Kosongkan Tingkat untuk tarif umum satu unit sekolah (berlaku semua tingkat)."
      actions={<Button size="sm" variant="outline" onClick={openAdd}><Plus className="h-4 w-4" /> Tambah Tarif</Button>}
    >
      {tarifList.length === 0 ? <EmptyState icon={Wallet} title="Belum ada tarif SPP" /> : (
        <Table columns={['Unit', 'Tahun Ajaran', 'Tingkat', 'Nominal', '']}>
          {tarifList.map((t) => (
            <Tr key={t.id}>
              <Td className="font-medium">{t.schools ? `${t.schools.jenjang} — ${t.schools.nama}` : '—'}</Td>
              <Td className="text-[var(--color-ink-soft)]">{t.tahun_ajaran?.nama || '—'}</Td>
              <Td>{t.tingkat || <span className="text-[var(--color-ink-soft)]">Semua Tingkat</span>}</Td>
              <Td>{formatRupiah(t.nominal)}</Td>
              <Td className="text-right">
                <div className="flex justify-end gap-2">
                  <button onClick={() => openEdit(t)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Ubah"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => handleDelete(t)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus"><Trash2 className="h-4 w-4" /></button>
                </div>
              </Td>
            </Tr>
          ))}
        </Table>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Ubah Tarif SPP' : 'Tambah Tarif SPP'}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Select label="Unit Sekolah" required disabled={!!lockedSchoolId} value={form.school_id} onChange={(e) => setForm((s) => ({ ...s, school_id: e.target.value }))}>
            <option value="">— Pilih —</option>
            {visibleSchools.map((s) => <option key={s.id} value={s.id}>{s.jenjang} — {s.nama}</option>)}
          </Select>
          <Select label="Tahun Ajaran" required value={form.tahun_ajaran_id} onChange={(e) => setForm((s) => ({ ...s, tahun_ajaran_id: e.target.value }))}>
            <option value="">— Pilih —</option>
            {tahunAjaranList.map((t) => <option key={t.id} value={t.id}>{t.nama}{t.status === 'aktif' ? ' (Aktif)' : ''}</option>)}
          </Select>
          <Input label="Tingkat (opsional — kosongkan untuk semua tingkat)" placeholder="Contoh: 1, 7, 10" value={form.tingkat} onChange={(e) => setForm((s) => ({ ...s, tingkat: e.target.value }))} />
          <Input label="Nominal per Bulan (Rp)" type="number" min="0" required value={form.nominal} onChange={(e) => setForm((s) => ({ ...s, nominal: e.target.value }))} />
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
