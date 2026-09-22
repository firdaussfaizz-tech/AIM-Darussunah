import { useEffect, useState, useCallback, useMemo } from 'react'
import { Gauge, Plus, Pencil, Trash2, Send, Check, Undo2, Info, LineChart, AlertTriangle, Target } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { Card, Select, Button, Badge, EmptyState, FullPageSpinner, Modal, Input, Textarea } from '../../components/ui'

// =====================================================================
// KPI LEMBAGA — scorecard KPI tingkat SATUAN PENDIDIKAN. Indikator
// diusulkan sekolah -> diverifikasi & divalidasi Yayasan; realisasi diisi
// berkala (pembilang÷pembagi) lalu dihitung capaian & status di sisi
// client (konvensi kode yang sudah ada), dan diringkas jadi dashboard.
// Periode memakai acuan kanonik `tahun_ajaran` (R1). OKR = tujuan besar,
// KPI = indikator turunannya (tautan objective_id opsional).
// Skema: 0032_kpi_lembaga.sql + 0033_periode_selaras.sql.
// =====================================================================

export const PERSPEKTIF_OPTIONS = [
  'Mutu Akademik',
  'Kesiswaan & Karakter',
  'SDM',
  'Keuangan',
  'Sarana & Prasarana',
  'Layanan & Pertumbuhan',
]
const SATUAN_OPTIONS = ['%', 'Nilai', 'Jumlah', 'Jam', 'hari']
const FREKUENSI_LABEL = { bulanan: 'Bulanan', triwulanan: 'Triwulanan', semesteran: 'Semesteran', tahunan: 'Tahunan' }
const AGREGASI_LABEL = { rata_rata: 'Rata-rata', akumulasi: 'Akumulasi', nilai_terakhir: 'Nilai Terakhir' }
const CAP = 1.2 // batas maksimum capaian 120%, sesuai instrumen KPI yayasan

const STATUS_META = {
  tercapai: { label: 'Tercapai', color: 'success' },
  perlu_perhatian: { label: 'Perlu Perhatian', color: 'gold' },
  tidak_tercapai: { label: 'Tidak Tercapai', color: 'danger' },
  belum_diukur: { label: 'Belum Diukur', color: 'neutral' },
}

// realisasi dari pembilang/pembagi. Pembagi boleh kosong untuk angka
// mutlak (Jumlah/Jam/hari). Untuk satuan %, hasil rasio dikali 100.
export function hitungRealisasi(pembilang, pembagi, satuan) {
  if (pembilang === '' || pembilang === null || pembilang === undefined) return null
  const num = Number(pembilang)
  if (Number.isNaN(num)) return null
  const den = pembagi === '' || pembagi === null || pembagi === undefined ? null : Number(pembagi)
  if (den !== null && !Number.isNaN(den) && den !== 0) {
    const ratio = num / den
    return satuan === '%' ? ratio * 100 : ratio
  }
  return num
}

// capaian (pecahan; 1 = 100% target), polaritas otomatis dibalik untuk
// minimasi, lalu dibatasi CAP.
export function hitungCapaian(realisasi, target, polaritas) {
  if (realisasi === null || realisasi === undefined || target === null || target === undefined) return null
  const r = Number(realisasi)
  const t = Number(target)
  if (Number.isNaN(r) || Number.isNaN(t)) return null
  let c
  if (polaritas === 'minimasi') {
    if (t === 0) c = r <= 0 ? 1 : 0
    else if (r <= 0) c = CAP
    else c = t / r
  } else {
    if (t === 0) c = r >= 0 ? 1 : 0
    else c = r / t
  }
  if (c < 0) c = 0
  if (c > CAP) c = CAP
  return c
}

export function statusDariCapaian(capaian) {
  if (capaian === null || capaian === undefined) return 'belum_diukur'
  if (capaian >= 1) return 'tercapai'
  if (capaian >= 0.85) return 'perlu_perhatian'
  return 'tidak_tercapai'
}

// realisasi teragregasi seluruh termin sesuai metode agregasi indikator.
function realisasiAgregat(indikator) {
  const vals = (indikator.kpi_lembaga_pengukuran || [])
    .map((p) => (p.realisasi === null || p.realisasi === undefined ? null : Number(p.realisasi)))
    .filter((v) => v !== null && !Number.isNaN(v))
  if (vals.length === 0) return null
  if (indikator.metode_agregasi === 'akumulasi') return vals.reduce((a, b) => a + b, 0)
  if (indikator.metode_agregasi === 'nilai_terakhir') {
    const rows = (indikator.kpi_lembaga_pengukuran || [])
      .filter((p) => p.realisasi !== null && p.realisasi !== undefined)
      .sort((a, b) => (a.termin_urut || 0) - (b.termin_urut || 0))
    return rows.length ? Number(rows[rows.length - 1].realisasi) : null
  }
  return vals.reduce((a, b) => a + b, 0) / vals.length // rata_rata
}

// { capaian, status, skor } indikator berdasarkan realisasi teragregasi.
export function skorIndikator(indikator) {
  const rAgg = realisasiAgregat(indikator)
  const capaian = rAgg === null ? null : hitungCapaian(rAgg, indikator.target, indikator.polaritas)
  const status = statusDariCapaian(capaian)
  const skor = capaian === null ? 0 : capaian * Number(indikator.bobot || 0) * 100
  return { realisasiAgg: rAgg, capaian, status, skor }
}

const pct = (frac) => (frac === null || frac === undefined ? '—' : `${Math.round(frac * 100)}%`)
const numFmt = (v) => (v === null || v === undefined || v === '' ? '—' : Number(v).toLocaleString('id-ID', { maximumFractionDigits: 2 }))

// Pilih Tahun Ajaran default: yang berstatus aktif, atau paling atas.
function defaultTaId(list) {
  if (!list || list.length === 0) return ''
  return (list.find((t) => t.status === 'aktif') || list[0]).id
}

// ---------------------------------------------------------------------
// Panel utama KPI Lembaga (dipakai sebagai TAB di KinerjaLembaga.jsx).
// ---------------------------------------------------------------------
export function KpiLembagaPanel() {
  const { hasFullAccess, roles, loading: authLoading } = useAuth()

  const mySchools = useMemo(() => {
    const seen = new Map()
    for (const r of roles) {
      if (['admin_sekolah', 'kepala_sekolah'].includes(r.role) && r.school_id && !seen.has(r.school_id)) {
        seen.set(r.school_id, { id: r.school_id, nama: r.schools?.nama, jenjang: r.schools?.jenjang })
      }
    }
    return Array.from(seen.values())
  }, [roles])
  const mySchoolIds = useMemo(() => mySchools.map((s) => s.id), [mySchools])
  const canAuthor = mySchools.length > 0 || hasFullAccess

  const TABS = ['Indikator & Realisasi', 'Persetujuan Yayasan', 'Rekap & Histori']
  const [tab, setTab] = useState('Indikator & Realisasi')
  const [schools, setSchools] = useState([])
  const [tahunAjaranList, setTahunAjaranList] = useState([])
  const [objectives, setObjectives] = useState([])
  const [taFilter, setTaFilter] = useState('') // tahun_ajaran_id
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [editingRow, setEditingRow] = useState(null)
  const [realisasiState, setRealisasiState] = useState(null) // { indikator, pengukuran|null }
  const [decideState, setDecideState] = useState(null) // { row, mode }

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    let q = supabase
      .from('kpi_lembaga_indikator')
      .select(`
        *,
        schools!school_id(nama, jenjang),
        tahun_ajaran(nama),
        okr_objectives(judul),
        diajukan_nama:kpi_lembaga_indikator_diajukan_nama,
        diputuskan_nama:kpi_lembaga_indikator_diputuskan_nama,
        kpi_lembaga_pengukuran(*)
      `)
      .order('urutan')
      .order('created_at', { ascending: false })
    if (taFilter) q = q.eq('tahun_ajaran_id', taFilter)
    const [{ data: s }, { data: taList }, { data: obj }, { data: r, error: rErr }] = await Promise.all([
      supabase.from('schools').select('id, nama, jenjang').order('jenjang'),
      supabase.from('tahun_ajaran').select('id, nama, status, tanggal_mulai').order('tanggal_mulai', { ascending: false, nullsFirst: false }),
      supabase.from('okr_objectives').select('id, judul, school_id, status').order('created_at', { ascending: false }),
      q,
    ])
    if (rErr) setLoadError(rErr.message)
    setSchools(s || [])
    setTahunAjaranList(taList || [])
    setObjectives(obj || [])
    setRows(r || [])
    setLoading(false)
    // Setel default Tahun Ajaran sekali (memicu satu reload dengan filter).
    if (!taFilter && (taList || []).length > 0) setTaFilter(defaultTaId(taList))
  }, [taFilter])

  useEffect(() => { if (!authLoading) load() }, [authLoading, load])

  const indikatorRows = useMemo(() => {
    if (hasFullAccess) return rows
    return rows.filter((r) => mySchoolIds.includes(r.school_id))
  }, [rows, hasFullAccess, mySchoolIds])

  const persetujuanRows = useMemo(() => (hasFullAccess ? rows.filter((r) => r.status === 'diajukan') : []), [rows, hasFullAccess])

  const handleDelete = async (row) => {
    if (!confirm(`Hapus indikator draft "${row.indikator}"? Seluruh data realisasi di dalamnya ikut terhapus.`)) return
    const { error } = await supabase.from('kpi_lembaga_indikator').delete().eq('id', row.id)
    if (error) { alert('Gagal menghapus: ' + error.message); return }
    load()
  }

  const handleAjukan = async (row) => {
    if (!confirm(`Ajukan indikator "${row.indikator}" ke Yayasan untuk diverifikasi?`)) return
    const { error } = await supabase.from('kpi_lembaga_indikator').update({ status: 'diajukan' }).eq('id', row.id)
    if (error) { alert('Gagal mengajukan: ' + error.message); return }
    load()
  }

  if (authLoading || loading) return <FullPageSpinner />

  const formSchools = hasFullAccess ? schools : mySchools
  const noTa = tahunAjaranList.length === 0

  return (
    <div>
      <Card className="mb-4 border-[var(--color-navy)]/20 bg-[var(--color-navy-50)]">
        <p className="flex items-start gap-2 text-xs text-[var(--color-ink-soft)]">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          KPI Lembaga adalah scorecard tingkat satuan pendidikan (bukan penilaian pegawai perorangan). Sekolah menyusun indikator + target lalu mengajukan; Yayasan memverifikasi & memvalidasi (menetapkan bobot final). Setelah disetujui, realisasi diisi berkala — capaian & status terhitung otomatis. Tiap indikator boleh ditautkan ke satu Objective OKR sebagai ukuran keberhasilannya.
        </p>
      </Card>

      {loadError && (
        <Card className="mb-4 border-[var(--color-danger)] bg-[var(--color-danger-soft)]">
          <p className="text-sm text-[var(--color-danger)]">Gagal memuat data: {loadError}</p>
        </Card>
      )}

      {noTa && (
        <Card className="mb-4 border-[var(--color-gold)] bg-[var(--color-gold-soft)]">
          <p className="text-sm text-[var(--color-ink)]">Belum ada Tahun Ajaran. Tambahkan Tahun Ajaran lebih dulu di menu Kesiswaan → Kelas & Tahun Ajaran sebelum menyusun KPI.</p>
        </Card>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Select containerClassName="w-56" value={taFilter} onChange={(e) => setTaFilter(e.target.value)}>
          {noTa && <option value="">— Belum ada Tahun Ajaran —</option>}
          {tahunAjaranList.map((t) => <option key={t.id} value={t.id}>TA {t.nama}{t.status === 'aktif' ? ' (aktif)' : ''}</option>)}
        </Select>
        {canAuthor && !noTa && (
          <Button onClick={() => { setEditingRow(null); setFormOpen(true) }}><Plus className="h-4 w-4" /> Tambah Indikator</Button>
        )}
      </div>

      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-[var(--color-border)]">
        {TABS.filter((t) => t !== 'Persetujuan Yayasan' || hasFullAccess).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              tab === t ? 'border-[var(--color-navy)] text-[var(--color-navy)]' : 'border-transparent text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]'
            }`}
          >
            {t}
            {t === 'Persetujuan Yayasan' && persetujuanRows.length > 0 && (
              <span className="ml-1.5 rounded-full bg-[var(--color-danger-soft)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--color-danger)]">
                {persetujuanRows.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'Indikator & Realisasi' && (
        <IndikatorList
          rows={indikatorRows}
          showSekolah={hasFullAccess}
          emptyTitle="Belum ada indikator"
          emptyDescription="Tambahkan indikator KPI untuk satuan pendidikan pada tahun ajaran ini."
          onEditIndikator={(row) => { setEditingRow(row); setFormOpen(true) }}
          onAjukan={handleAjukan}
          onDelete={handleDelete}
          onInputRealisasi={(indikator, pengukuran) => setRealisasiState({ indikator, pengukuran: pengukuran || null })}
        />
      )}

      {hasFullAccess && tab === 'Persetujuan Yayasan' && (
        <IndikatorList
          rows={persetujuanRows}
          showSekolah
          emptyTitle="Tidak ada yang perlu diverifikasi"
          emptyDescription="Belum ada indikator yang diajukan sekolah."
          renderDecision={(row) => (
            <div className="flex justify-end gap-1.5">
              <button onClick={() => setDecideState({ row, mode: 'setujui' })} className="rounded bg-[var(--color-success-soft)] p-1.5 text-[var(--color-success)] hover:brightness-95" aria-label="Setujui"><Check className="h-4 w-4" /></button>
              <button onClick={() => setDecideState({ row, mode: 'revisi' })} className="rounded bg-[var(--color-gold-soft)] p-1.5 text-[var(--color-gold)] hover:brightness-95" aria-label="Minta revisi"><Undo2 className="h-4 w-4" /></button>
            </div>
          )}
        />
      )}

      {tab === 'Rekap & Histori' && (
        <IndikatorList
          rows={indikatorRows}
          showSekolah
          readOnly
          emptyTitle="Belum ada data"
          emptyDescription="Belum ada indikator KPI pada tahun ajaran ini."
          onInputRealisasi={(indikator, pengukuran) => setRealisasiState({ indikator, pengukuran: pengukuran || null })}
        />
      )}

      <IndikatorFormModal
        open={formOpen}
        editingRow={editingRow}
        schools={formSchools}
        tahunAjaranList={tahunAjaranList}
        objectives={objectives}
        taDefault={taFilter}
        hasFullAccess={hasFullAccess}
        onClose={() => { setFormOpen(false); setEditingRow(null) }}
        onSaved={() => { setFormOpen(false); setEditingRow(null); load() }}
      />

      <RealisasiModal state={realisasiState} onClose={() => setRealisasiState(null)} onSaved={() => { setRealisasiState(null); load() }} />

      <DecideKpiModal state={decideState} onClose={() => setDecideState(null)} onDone={() => { setDecideState(null); load() }} />
    </div>
  )
}

// ---------------------------------------------------------------------
// Daftar indikator (kartu) + baris realisasi di dalamnya.
// ---------------------------------------------------------------------
function IndikatorList({ rows, showSekolah, readOnly, emptyTitle, emptyDescription, onEditIndikator, onAjukan, onDelete, onInputRealisasi, renderDecision }) {
  if (rows.length === 0) {
    return (
      <Card padded={false}>
        <div className="p-5"><EmptyState icon={Gauge} title={emptyTitle} description={emptyDescription} /></div>
      </Card>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => {
        const { capaian, status, skor } = skorIndikator(row)
        const meta = STATUS_META[status]
        const editable = !readOnly && ['draft', 'perlu_revisi'].includes(row.status)
        const pengukuran = (row.kpi_lembaga_pengukuran || []).slice().sort((a, b) => (a.termin_urut || 0) - (b.termin_urut || 0))
        return (
          <Card key={row.id} padded={false}>
            <div className="flex flex-col gap-3 p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {row.kode && <span className="rounded bg-black/[0.04] px-1.5 py-0.5 text-[11px] font-medium text-[var(--color-ink-soft)]">{row.kode}</span>}
                    {showSekolah && <span className="text-xs font-medium text-[var(--color-ink-soft)]">{row.schools?.nama} ({row.schools?.jenjang})</span>}
                    <span className="text-xs text-[var(--color-ink-soft)]">{row.perspektif}</span>
                  </div>
                  <p className="mt-1 font-medium text-[var(--color-ink)]">{row.indikator}</p>
                  {row.okr_objectives?.judul && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-[var(--color-navy)]"><Target className="h-3 w-3" /> Turunan OKR: {row.okr_objectives.judul}</p>
                  )}
                  {row.sasaran_mutu && <p className="text-[13px] text-[var(--color-ink-soft)]">Sasaran: {row.sasaran_mutu}</p>}
                  {row.formula && <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">Formula: {row.formula}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge color={STATUS_BADGE(row.status)}>{row.status.replace('_', ' ')}</Badge>
                  {renderDecision && renderDecision(row)}
                  {editable && onEditIndikator && (
                    <div className="flex gap-1.5">
                      <button onClick={() => onEditIndikator(row)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Ubah indikator"><Pencil className="h-4 w-4" /></button>
                      {row.status === 'draft' && onAjukan && (
                        <button onClick={() => onAjukan(row)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Ajukan"><Send className="h-4 w-4" /></button>
                      )}
                      {row.status === 'draft' && onDelete && (
                        <button onClick={() => onDelete(row)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus"><Trash2 className="h-4 w-4" /></button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-[10px] bg-black/[0.02] px-3 py-2 text-[13px]">
                <span className="text-[var(--color-ink-soft)]">Bobot: <span className="font-medium text-[var(--color-ink)]">{pct(Number(row.bobot))}</span></span>
                <span className="text-[var(--color-ink-soft)]">Target: <span className="font-medium text-[var(--color-ink)]">{numFmt(row.target)} {row.satuan}</span></span>
                <span className="text-[var(--color-ink-soft)]">Polaritas: <span className="font-medium text-[var(--color-ink)]">{row.polaritas === 'minimasi' ? 'Minimasi' : 'Maksimasi'}</span></span>
                <span className="text-[var(--color-ink-soft)]">Agregasi: <span className="font-medium text-[var(--color-ink)]">{AGREGASI_LABEL[row.metode_agregasi]}</span></span>
                <span className="text-[var(--color-ink-soft)]">Frekuensi: <span className="font-medium text-[var(--color-ink)]">{FREKUENSI_LABEL[row.frekuensi]}</span></span>
                {row.penanggung_jawab && <span className="text-[var(--color-ink-soft)]">PIC: <span className="font-medium text-[var(--color-ink)]">{row.penanggung_jawab}</span></span>}
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--color-ink-soft)]">Capaian</span>
                  <span className="text-lg font-semibold text-[var(--color-ink)]">{pct(capaian)}</span>
                  <Badge color={meta.color}>{meta.label}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--color-ink-soft)]">Skor berbobot</span>
                  <span className="text-sm font-medium text-[var(--color-ink)]">{skor.toFixed(2)}</span>
                </div>
                {!readOnly && onInputRealisasi && (
                  <Button size="sm" variant="outline" className="ml-auto" onClick={() => onInputRealisasi(row, null)}><Plus className="h-3.5 w-3.5" /> Realisasi</Button>
                )}
              </div>

              {pengukuran.length > 0 && (
                <div className="flex flex-col divide-y divide-[var(--color-border)] rounded-[10px] border border-[var(--color-border)]">
                  {pengukuran.map((p) => {
                    const pStatus = STATUS_META[p.status || statusDariCapaian(p.capaian)]
                    return (
                      <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[13px]">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                          <span className="font-medium text-[var(--color-ink)]">{p.termin_label}</span>
                          <span className="text-[var(--color-ink-soft)]">Realisasi: {numFmt(p.realisasi)} {row.satuan}</span>
                          <span className="text-[var(--color-ink-soft)]">Capaian: {pct(p.capaian)}</span>
                          {pStatus && <Badge color={pStatus.color}>{pStatus.label}</Badge>}
                        </div>
                        {!readOnly && onInputRealisasi && (
                          <button onClick={() => onInputRealisasi(row, p)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Ubah realisasi"><Pencil className="h-3.5 w-3.5" /></button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {row.catatan_yayasan && (
                <p className="text-xs text-[var(--color-ink-soft)]"><span className="font-medium text-[var(--color-ink)]">Catatan Yayasan:</span> {row.catatan_yayasan}</p>
              )}
              {row.diajukan_nama && <p className="text-xs text-[var(--color-ink-soft)]">Diajukan oleh {row.diajukan_nama}</p>}
              {row.diputuskan_nama && <p className="text-xs text-[var(--color-ink-soft)]">Diputuskan oleh {row.diputuskan_nama}</p>}
            </div>
          </Card>
        )
      })}
    </div>
  )
}

function STATUS_BADGE(status) {
  if (status === 'disetujui') return 'success'
  if (status === 'perlu_revisi') return 'gold'
  if (status === 'diajukan') return 'gold'
  return 'neutral'
}

// ---------------------------------------------------------------------
// Form buat/ubah indikator.
// ---------------------------------------------------------------------
function IndikatorFormModal({ open, editingRow, schools, tahunAjaranList, objectives, taDefault, hasFullAccess, onClose, onSaved }) {
  const [f, setF] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isEdit = !!editingRow
  const locked = isEdit && !['draft', 'perlu_revisi'].includes(editingRow.status)

  useEffect(() => {
    if (!open) return
    setError('')
    if (editingRow) {
      setF({
        school_id: editingRow.school_id,
        tahun_ajaran_id: editingRow.tahun_ajaran_id || taDefault || '',
        objective_id: editingRow.objective_id || '',
        kode: editingRow.kode || '',
        perspektif: editingRow.perspektif || PERSPEKTIF_OPTIONS[0],
        sasaran_mutu: editingRow.sasaran_mutu || '',
        indikator: editingRow.indikator || '',
        formula: editingRow.formula || '',
        satuan: editingRow.satuan || '%',
        polaritas: editingRow.polaritas || 'maksimasi',
        metode_agregasi: editingRow.metode_agregasi || 'rata_rata',
        frekuensi: editingRow.frekuensi || 'semesteran',
        sumber_data: editingRow.sumber_data || '',
        penanggung_jawab: editingRow.penanggung_jawab || '',
        acuan_sop: editingRow.acuan_sop || '',
        bobotPersen: String(Math.round(Number(editingRow.bobot || 0) * 100 * 100) / 100),
        baseline: editingRow.baseline ?? '',
        target: editingRow.target ?? '',
        status: ['draft', 'diajukan'].includes(editingRow.status) || (hasFullAccess && editingRow.status === 'disetujui') ? editingRow.status : 'draft',
      })
    } else {
      setF({
        school_id: schools.length === 1 ? schools[0].id : '',
        tahun_ajaran_id: taDefault || '',
        objective_id: '',
        kode: '', perspektif: PERSPEKTIF_OPTIONS[0], sasaran_mutu: '', indikator: '', formula: '',
        satuan: '%', polaritas: 'maksimasi', metode_agregasi: 'rata_rata', frekuensi: 'semesteran',
        sumber_data: '', penanggung_jawab: '', acuan_sop: '', bobotPersen: '', baseline: '', target: '', status: 'draft',
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingRow])

  const set = (k, v) => setF((prev) => ({ ...prev, [k]: v }))

  // Objective yang bisa ditautkan: milik sekolah yang dipilih (OKR & KPI
  // sama-sama per satuan pendidikan). Kosong bila sekolah belum dipilih.
  const linkableObjectives = useMemo(
    () => (objectives || []).filter((o) => o.school_id === f.school_id),
    [objectives, f.school_id],
  )

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (locked) { onClose(); return }
    if (!f.school_id) { setError('Pilih satuan pendidikan.'); return }
    if (!f.tahun_ajaran_id) { setError('Pilih tahun ajaran.'); return }
    if (!f.indikator?.trim()) { setError('Isi nama indikator.'); return }
    if (f.target === '' || f.target === null) { setError('Isi target indikator.'); return }
    setSaving(true)
    const payload = {
      school_id: f.school_id,
      tahun_ajaran_id: f.tahun_ajaran_id,
      objective_id: f.objective_id || null,
      kode: f.kode?.trim() || null,
      perspektif: f.perspektif,
      sasaran_mutu: f.sasaran_mutu?.trim() || null,
      indikator: f.indikator.trim(),
      formula: f.formula?.trim() || null,
      satuan: f.satuan,
      polaritas: f.polaritas,
      metode_agregasi: f.metode_agregasi,
      frekuensi: f.frekuensi,
      sumber_data: f.sumber_data?.trim() || null,
      penanggung_jawab: f.penanggung_jawab?.trim() || null,
      acuan_sop: f.acuan_sop?.trim() || null,
      bobot: f.bobotPersen === '' ? 0 : Number(f.bobotPersen) / 100,
      baseline: f.baseline === '' ? null : Number(f.baseline),
      target: Number(f.target),
      status: f.status,
    }
    const query = isEdit
      ? supabase.from('kpi_lembaga_indikator').update(payload).eq('id', editingRow.id)
      : supabase.from('kpi_lembaga_indikator').insert(payload)
    const { error: err } = await query
    setSaving(false)
    if (err) { setError(err.message.includes('duplicate') ? 'Indikator dengan nama sama sudah ada di unit & tahun ajaran ini.' : err.message); return }
    onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title={locked ? 'Detail Indikator' : isEdit ? 'Ubah Indikator KPI' : 'Tambah Indikator KPI'} width="max-w-2xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {locked && (
          <p className="rounded-md bg-[var(--color-navy-50)] px-3 py-2 text-xs text-[var(--color-ink-soft)]">
            Indikator sudah {editingRow.status} — terkunci dari sisi sekolah. Realisasi tetap bisa diisi lewat tombol Realisasi.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Select label="Satuan Pendidikan" required disabled={locked} value={f.school_id || ''} onChange={(e) => set('school_id', e.target.value)}>
            <option value="">— Pilih —</option>
            {schools.map((s) => <option key={s.id} value={s.id}>{s.jenjang} — {s.nama}</option>)}
          </Select>
          <Select label="Tahun Ajaran" required disabled={locked} value={f.tahun_ajaran_id || ''} onChange={(e) => set('tahun_ajaran_id', e.target.value)}>
            <option value="">— Pilih —</option>
            {(tahunAjaranList || []).map((t) => <option key={t.id} value={t.id}>{t.nama}{t.status === 'aktif' ? ' (aktif)' : ''}</option>)}
          </Select>
        </div>
        <Select label="Objective OKR terkait (opsional)" disabled={locked} value={f.objective_id || ''} onChange={(e) => set('objective_id', e.target.value)}>
          <option value="">— Tidak ditautkan (KPI berdiri sendiri) —</option>
          {linkableObjectives.map((o) => <option key={o.id} value={o.id}>{o.judul}</option>)}
        </Select>
        {!locked && f.school_id && linkableObjectives.length === 0 && (
          <p className="-mt-1 text-xs text-[var(--color-ink-soft)]">Belum ada Objective OKR untuk sekolah ini — tautan bisa diisi nanti setelah OKR dibuat.</p>
        )}
        <div className="grid grid-cols-3 gap-3">
          <Input label="Kode (opsional)" disabled={locked} value={f.kode || ''} onChange={(e) => set('kode', e.target.value)} placeholder="AKD-01" />
          <Select label="Perspektif" containerClassName="col-span-2" required disabled={locked} value={f.perspektif || ''} onChange={(e) => set('perspektif', e.target.value)}>
            {PERSPEKTIF_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
        </div>
        <Input label="Indikator Kinerja" required disabled={locked} value={f.indikator || ''} onChange={(e) => set('indikator', e.target.value)} placeholder="Contoh: Persentase siswa mencapai KKTP" />
        <Input label="Sasaran Mutu (opsional)" disabled={locked} value={f.sasaran_mutu || ''} onChange={(e) => set('sasaran_mutu', e.target.value)} />
        <Textarea label="Formula Perhitungan (opsional)" rows={2} disabled={locked} value={f.formula || ''} onChange={(e) => set('formula', e.target.value)} placeholder="(Jumlah siswa tuntas ÷ Total siswa) × 100%" />
        <div className="grid grid-cols-3 gap-3">
          <Select label="Satuan" disabled={locked} value={f.satuan || '%'} onChange={(e) => set('satuan', e.target.value)}>
            {SATUAN_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
          <Select label="Polaritas" disabled={locked} value={f.polaritas || 'maksimasi'} onChange={(e) => set('polaritas', e.target.value)}>
            <option value="maksimasi">Maksimasi (makin tinggi makin baik)</option>
            <option value="minimasi">Minimasi (makin rendah makin baik)</option>
          </Select>
          <Select label="Metode Agregasi" disabled={locked} value={f.metode_agregasi || 'rata_rata'} onChange={(e) => set('metode_agregasi', e.target.value)}>
            <option value="rata_rata">Rata-rata</option>
            <option value="akumulasi">Akumulasi</option>
            <option value="nilai_terakhir">Nilai Terakhir</option>
          </Select>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <Select label="Frekuensi" disabled={locked} value={f.frekuensi || 'semesteran'} onChange={(e) => set('frekuensi', e.target.value)}>
            <option value="bulanan">Bulanan</option>
            <option value="triwulanan">Triwulanan</option>
            <option value="semesteran">Semesteran</option>
            <option value="tahunan">Tahunan</option>
          </Select>
          <Input label="Bobot (%)" type="number" disabled={locked} value={f.bobotPersen ?? ''} onChange={(e) => set('bobotPersen', e.target.value)} placeholder="10" />
          <Input label="Baseline (opsional)" type="number" disabled={locked} value={f.baseline ?? ''} onChange={(e) => set('baseline', e.target.value)} />
          <Input label="Target" type="number" required disabled={locked} value={f.target ?? ''} onChange={(e) => set('target', e.target.value)} placeholder={f.satuan === '%' ? '85' : ''} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Sumber Data / Bukti (opsional)" disabled={locked} value={f.sumber_data || ''} onChange={(e) => set('sumber_data', e.target.value)} />
          <Input label="Penanggung Jawab / PIC (opsional)" disabled={locked} value={f.penanggung_jawab || ''} onChange={(e) => set('penanggung_jawab', e.target.value)} />
        </div>
        <Input label="Acuan SOP (opsional)" disabled={locked} value={f.acuan_sop || ''} onChange={(e) => set('acuan_sop', e.target.value)} />

        {!locked && (
          <Select label="Status" value={f.status || 'draft'} onChange={(e) => set('status', e.target.value)}>
            <option value="draft">Draft</option>
            <option value="diajukan">Ajukan ke Yayasan</option>
            {hasFullAccess && <option value="disetujui">Disetujui (langsung — hanya Yayasan)</option>}
          </Select>
        )}

        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>{locked ? 'Tutup' : 'Batal'}</Button>
          {!locked && <Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button>}
        </div>
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------------
// Input / ubah realisasi satu termin.
// ---------------------------------------------------------------------
function RealisasiModal({ state, onClose, onSaved }) {
  const [f, setF] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!state) return
    setError('')
    const p = state.pengukuran
    const existing = (state.indikator.kpi_lembaga_pengukuran || [])
    const nextUrut = existing.length ? Math.max(...existing.map((x) => x.termin_urut || 0)) + 1 : 1
    setF(p ? {
      termin_label: p.termin_label || '', termin_urut: String(p.termin_urut ?? nextUrut),
      pembilang: p.pembilang ?? '', pembagi: p.pembagi ?? '',
      analisis: p.analisis || '', tindak_lanjut: p.tindak_lanjut || '', pic_tindak_lanjut: p.pic_tindak_lanjut || '', batas_waktu: p.batas_waktu || '',
    } : {
      termin_label: '', termin_urut: String(nextUrut), pembilang: '', pembagi: '',
      analisis: '', tindak_lanjut: '', pic_tindak_lanjut: '', batas_waktu: '',
    })
  }, [state])

  if (!state) return null
  const { indikator, pengukuran } = state
  const set = (k, v) => setF((prev) => ({ ...prev, [k]: v }))

  const realisasi = hitungRealisasi(f.pembilang, f.pembagi, indikator.satuan)
  const capaian = realisasi === null ? null : hitungCapaian(realisasi, indikator.target, indikator.polaritas)
  const status = statusDariCapaian(capaian)
  const meta = STATUS_META[status]
  const perluTL = status === 'tidak_tercapai'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!f.termin_label?.trim()) { setError('Isi label termin (mis. "Semester I" atau "Jul 2026").'); return }
    if (f.pembilang === '' || f.pembilang === null) { setError('Isi realisasi (pembilang).'); return }
    setSaving(true)
    const payload = {
      indikator_id: indikator.id,
      termin_label: f.termin_label.trim(),
      termin_urut: Number(f.termin_urut) || 1,
      pembilang: Number(f.pembilang),
      pembagi: f.pembagi === '' ? null : Number(f.pembagi),
      realisasi,
      capaian,
      status,
      analisis: f.analisis?.trim() || null,
      tindak_lanjut: f.tindak_lanjut?.trim() || null,
      pic_tindak_lanjut: f.pic_tindak_lanjut?.trim() || null,
      batas_waktu: f.batas_waktu || null,
    }
    const query = pengukuran
      ? supabase.from('kpi_lembaga_pengukuran').update(payload).eq('id', pengukuran.id)
      : supabase.from('kpi_lembaga_pengukuran').insert(payload)
    const { error: err } = await query
    setSaving(false)
    if (err) { setError(err.message.includes('duplicate') ? 'Nomor urut termin ini sudah dipakai — ganti "Urut termin".' : err.message); return }
    onSaved()
  }

  const handleDelete = async () => {
    if (!pengukuran) return
    if (!confirm(`Hapus realisasi "${pengukuran.termin_label}"?`)) return
    setSaving(true)
    const { error: err } = await supabase.from('kpi_lembaga_pengukuran').delete().eq('id', pengukuran.id)
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  return (
    <Modal open={!!state} onClose={onClose} title={pengukuran ? 'Ubah Realisasi' : 'Input Realisasi'} width="max-w-xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <p className="text-sm text-[var(--color-ink-soft)]">
          <span className="font-medium text-[var(--color-ink)]">{indikator.indikator}</span> — target {numFmt(indikator.target)} {indikator.satuan} ({indikator.polaritas === 'minimasi' ? 'minimasi' : 'maksimasi'})
        </p>
        <div className="grid grid-cols-3 gap-3">
          <Input label="Label Termin" containerClassName="col-span-2" required value={f.termin_label || ''} onChange={(e) => set('termin_label', e.target.value)} placeholder="Semester I / Jul 2026" />
          <Input label="Urut termin" type="number" value={f.termin_urut || ''} onChange={(e) => set('termin_urut', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Realisasi (Pembilang)" type="number" required value={f.pembilang ?? ''} onChange={(e) => set('pembilang', e.target.value)} />
          <Input label="Pembagi (opsional)" type="number" value={f.pembagi ?? ''} onChange={(e) => set('pembagi', e.target.value)} placeholder="kosongkan utk angka mutlak" />
        </div>

        <div className="flex flex-wrap items-center gap-4 rounded-[10px] bg-black/[0.02] px-3 py-2 text-[13px]">
          <span className="text-[var(--color-ink-soft)]">Realisasi: <span className="font-medium text-[var(--color-ink)]">{numFmt(realisasi)} {indikator.satuan}</span></span>
          <span className="text-[var(--color-ink-soft)]">Capaian: <span className="font-medium text-[var(--color-ink)]">{pct(capaian)}</span></span>
          <Badge color={meta.color}>{meta.label}</Badge>
        </div>

        {perluTL && (
          <p className="flex items-start gap-2 rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-xs text-[var(--color-danger)]">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Capaian di bawah 85% — lengkapi analisis akar masalah & rencana tindak lanjut.
          </p>
        )}
        <Textarea label="Analisis / Akar Masalah (opsional)" rows={2} value={f.analisis || ''} onChange={(e) => set('analisis', e.target.value)} />
        <Textarea label="Rencana Tindak Lanjut (opsional)" rows={2} value={f.tindak_lanjut || ''} onChange={(e) => set('tindak_lanjut', e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="PIC Tindak Lanjut (opsional)" value={f.pic_tindak_lanjut || ''} onChange={(e) => set('pic_tindak_lanjut', e.target.value)} />
          <Input label="Batas Waktu (opsional)" type="date" value={f.batas_waktu || ''} onChange={(e) => set('batas_waktu', e.target.value)} />
        </div>

        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-between gap-2">
          {pengukuran ? (
            <Button type="button" variant="ghost" className="text-[var(--color-danger)]" onClick={handleDelete} disabled={saving}>Hapus</Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------------
// Yayasan: verifikasi & validasi indikator (setujui + bobot final / revisi).
// ---------------------------------------------------------------------
function DecideKpiModal({ state, onClose, onDone }) {
  const [bobotPersen, setBobotPersen] = useState('')
  const [statusAktif, setStatusAktif] = useState(true)
  const [catatan, setCatatan] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (state) {
      setBobotPersen(String(Math.round(Number(state.row.bobot || 0) * 100 * 100) / 100))
      setStatusAktif(true)
      setCatatan('')
      setError('')
    }
  }, [state])

  if (!state) return null
  const { row, mode } = state

  const handleConfirm = async () => {
    if (mode === 'revisi' && !catatan.trim()) { setError('Isi catatan alasan perlu revisi.'); return }
    setSaving(true)
    setError('')
    const payload = mode === 'setujui'
      ? { status: 'disetujui', bobot: bobotPersen === '' ? 0 : Number(bobotPersen) / 100, status_aktif: statusAktif, catatan_yayasan: catatan || null }
      : { status: 'perlu_revisi', catatan_yayasan: catatan }
    const { error: err } = await supabase.from('kpi_lembaga_indikator').update(payload).eq('id', row.id)
    setSaving(false)
    if (err) { setError(err.message); return }
    onDone()
  }

  return (
    <Modal open={!!state} onClose={onClose} title={mode === 'setujui' ? 'Setujui Indikator' : 'Minta Revisi'}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-[var(--color-ink-soft)]">
          <span className="font-medium text-[var(--color-ink)]">{row.schools?.nama}</span> — "{row.indikator}" (TA {row.tahun_ajaran?.nama || '—'})
        </p>
        {mode === 'setujui' && (
          <>
            <Input label="Bobot final (%)" type="number" value={bobotPersen} onChange={(e) => setBobotPersen(e.target.value)} />
            <Select label="Aktifkan indikator?" value={statusAktif ? '1' : '0'} onChange={(e) => setStatusAktif(e.target.value === '1')}>
              <option value="1">Ya — dipakai menghitung skor</option>
              <option value="0">Belum — simpan tapi nonaktif</option>
            </Select>
          </>
        )}
        <Textarea label={mode === 'setujui' ? 'Catatan Yayasan (opsional)' : 'Catatan / Alasan Perlu Revisi'} rows={3} value={catatan} onChange={(e) => setCatatan(e.target.value)} />
        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="button" onClick={handleConfirm} disabled={saving}>{saving ? 'Menyimpan…' : mode === 'setujui' ? 'Setujui' : 'Minta Revisi'}</Button>
        </div>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------
// Dashboard scorecard — ringkasan capaian per unit (tab tersendiri).
// ---------------------------------------------------------------------
export function LembagaDashboard() {
  const { hasFullAccess, roles, loading: authLoading } = useAuth()
  const mySchools = useMemo(() => {
    const seen = new Map()
    for (const r of roles) {
      if (['admin_sekolah', 'kepala_sekolah'].includes(r.role) && r.school_id && !seen.has(r.school_id)) {
        seen.set(r.school_id, { id: r.school_id, nama: r.schools?.nama, jenjang: r.schools?.jenjang })
      }
    }
    return Array.from(seen.values())
  }, [roles])

  const [tahunAjaranList, setTahunAjaranList] = useState([])
  const [taFilter, setTaFilter] = useState('')
  const [schoolFilter, setSchoolFilter] = useState('')
  const [schools, setSchools] = useState([])
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    let q = supabase
      .from('kpi_lembaga_indikator')
      .select('*, schools!school_id(nama, jenjang), kpi_lembaga_pengukuran(realisasi, termin_urut)')
      .eq('status', 'disetujui')
      .eq('status_aktif', true)
    if (taFilter) q = q.eq('tahun_ajaran_id', taFilter)
    const [{ data: s }, { data: taList }, { data: r, error: rErr }] = await Promise.all([
      supabase.from('schools').select('id, nama, jenjang').order('jenjang'),
      supabase.from('tahun_ajaran').select('id, nama, status, tanggal_mulai').order('tanggal_mulai', { ascending: false, nullsFirst: false }),
      q,
    ])
    if (rErr) setLoadError(rErr.message)
    setSchools(s || [])
    setTahunAjaranList(taList || [])
    setRows(r || [])
    setLoading(false)
    if (!taFilter && (taList || []).length > 0) setTaFilter(defaultTaId(taList))
  }, [taFilter])

  useEffect(() => { if (!authLoading) load() }, [authLoading, load])

  const scopeRows = useMemo(() => {
    let list = rows
    if (!hasFullAccess) {
      const ids = mySchools.map((s) => s.id)
      list = list.filter((r) => ids.includes(r.school_id))
    }
    if (schoolFilter) list = list.filter((r) => r.school_id === schoolFilter)
    return list
  }, [rows, hasFullAccess, mySchools, schoolFilter])

  const summary = useMemo(() => computeSummary(scopeRows), [scopeRows])
  const perUnit = useMemo(() => {
    const byUnit = new Map()
    for (const r of rows) {
      if (!hasFullAccess && !mySchools.some((s) => s.id === r.school_id)) continue
      if (!byUnit.has(r.school_id)) byUnit.set(r.school_id, { nama: r.schools?.nama, jenjang: r.schools?.jenjang, rows: [] })
      byUnit.get(r.school_id).rows.push(r)
    }
    return Array.from(byUnit.entries()).map(([id, u]) => ({ id, nama: u.nama, jenjang: u.jenjang, ...computeSummary(u.rows) }))
  }, [rows, hasFullAccess, mySchools])

  if (authLoading || loading) return <FullPageSpinner />

  const unitOptions = hasFullAccess ? schools : mySchools

  return (
    <div>
      {loadError && (
        <Card className="mb-4 border-[var(--color-danger)] bg-[var(--color-danger-soft)]">
          <p className="text-sm text-[var(--color-danger)]">Gagal memuat data: {loadError}</p>
        </Card>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select containerClassName="w-56" value={taFilter} onChange={(e) => setTaFilter(e.target.value)}>
          {tahunAjaranList.length === 0 && <option value="">— Belum ada Tahun Ajaran —</option>}
          {tahunAjaranList.map((t) => <option key={t.id} value={t.id}>TA {t.nama}{t.status === 'aktif' ? ' (aktif)' : ''}</option>)}
        </Select>
        <Select containerClassName="w-56" value={schoolFilter} onChange={(e) => setSchoolFilter(e.target.value)}>
          <option value="">{hasFullAccess ? 'Semua Unit' : 'Semua Unit Saya'}</option>
          {unitOptions.map((s) => <option key={s.id} value={s.id}>{s.jenjang} — {s.nama}</option>)}
        </Select>
      </div>

      {scopeRows.length === 0 ? (
        <Card padded={false}><div className="p-5"><EmptyState icon={LineChart} title="Belum ada indikator aktif" description="Dashboard menampilkan indikator berstatus disetujui & aktif dengan realisasi terisi." /></div></Card>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat label="Skor Total" value={summary.skorTotal.toFixed(1)} sub={`bobot terisi ${pct(summary.totalBobot)}`} />
            <MiniStat label="Tercapai" value={summary.count.tercapai} accent="success" />
            <MiniStat label="Perlu Perhatian" value={summary.count.perlu_perhatian} accent="gold" />
            <MiniStat label="Tidak Tercapai / Belum" value={summary.count.tidak_tercapai + summary.count.belum_diukur} accent="danger" />
          </div>

          <Card padded={false} className="mb-4">
            <div className="border-b border-[var(--color-border)] px-5 py-3"><h3 className="text-sm font-semibold text-[var(--color-ink)]">Skor per Perspektif</h3></div>
            <div className="flex flex-col divide-y divide-[var(--color-border)] px-5">
              {summary.perspektif.map((p) => (
                <div key={p.nama} className="flex items-center gap-3 py-3">
                  <div className="w-40 shrink-0 text-[13px] text-[var(--color-ink)]">{p.nama}</div>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/[0.06]">
                    <div className="h-full rounded-full bg-[var(--color-navy)]" style={{ width: `${Math.min(100, Math.round((p.capaian || 0) * 100))}%` }} />
                  </div>
                  <div className="w-14 shrink-0 text-right text-[13px] font-medium text-[var(--color-ink)]">{pct(p.capaian)}</div>
                  <div className="w-20 shrink-0 text-right text-xs text-[var(--color-ink-soft)]">bobot {pct(p.bobot)}</div>
                </div>
              ))}
            </div>
          </Card>

          {hasFullAccess && perUnit.length > 1 && (
            <Card padded={false} className="mb-4">
              <div className="border-b border-[var(--color-border)] px-5 py-3"><h3 className="text-sm font-semibold text-[var(--color-ink)]">Perbandingan Antar Unit</h3></div>
              <div className="flex flex-col divide-y divide-[var(--color-border)] px-5">
                {perUnit.map((u) => (
                  <div key={u.id} className="flex flex-wrap items-center gap-3 py-3 text-[13px]">
                    <div className="w-40 shrink-0 font-medium text-[var(--color-ink)]">{u.jenjang} — {u.nama}</div>
                    <div className="text-[var(--color-ink-soft)]">Skor <span className="font-semibold text-[var(--color-ink)]">{u.skorTotal.toFixed(1)}</span></div>
                    <div className="flex gap-2">
                      <Badge color="success">{u.count.tercapai} tercapai</Badge>
                      <Badge color="gold">{u.count.perlu_perhatian} perhatian</Badge>
                      <Badge color="danger">{u.count.tidak_tercapai} tidak</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card padded={false}>
            <div className="border-b border-[var(--color-border)] px-5 py-3"><h3 className="text-sm font-semibold text-[var(--color-ink)]">Lima Indikator Capaian Terendah</h3></div>
            <div className="flex flex-col divide-y divide-[var(--color-border)] px-5">
              {summary.terendah.map((t, i) => {
                const meta = STATUS_META[t.status]
                return (
                  <div key={t.id} className="flex items-center gap-3 py-3 text-[13px]">
                    <span className="w-5 shrink-0 text-[var(--color-ink-soft)]">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[var(--color-ink)]">{t.indikator}</p>
                      {hasFullAccess && <p className="text-xs text-[var(--color-ink-soft)]">{t.schools?.nama}</p>}
                    </div>
                    <span className="shrink-0 font-medium text-[var(--color-ink)]">{pct(t.capaian)}</span>
                    <Badge color={meta.color}>{meta.label}</Badge>
                  </div>
                )
              })}
            </div>
          </Card>
        </>
      )}
    </div>
  )
}

function computeSummary(rows) {
  const count = { tercapai: 0, perlu_perhatian: 0, tidak_tercapai: 0, belum_diukur: 0 }
  const perspektifMap = new Map()
  let skorTotal = 0
  let totalBobot = 0
  const scored = rows.map((r) => {
    const s = skorIndikator(r)
    count[s.status] = (count[s.status] || 0) + 1
    skorTotal += s.skor
    totalBobot += Number(r.bobot || 0)
    const key = r.perspektif || 'Lainnya'
    if (!perspektifMap.has(key)) perspektifMap.set(key, { nama: key, bobot: 0, skor: 0 })
    const pm = perspektifMap.get(key)
    pm.bobot += Number(r.bobot || 0)
    pm.skor += s.skor
    return { ...r, ...s }
  })
  const perspektif = Array.from(perspektifMap.values()).map((p) => ({
    ...p,
    capaian: p.bobot > 0 ? p.skor / (p.bobot * 100) : null,
  }))
  const terendah = scored
    .filter((r) => r.capaian !== null)
    .sort((a, b) => (a.capaian || 0) - (b.capaian || 0))
    .slice(0, 5)
  return { count, skorTotal, totalBobot, perspektif, terendah }
}

function MiniStat({ label, value, sub, accent }) {
  const color = accent === 'success' ? 'var(--color-success)' : accent === 'gold' ? 'var(--color-gold)' : accent === 'danger' ? 'var(--color-danger)' : 'var(--color-ink)'
  return (
    <Card>
      <p className="text-[12px] font-medium text-[var(--color-ink-soft)]">{label}</p>
      <p className="mt-1 font-[family-name:var(--font-display)] text-[26px] font-semibold leading-none" style={{ color }}>{value}</p>
      {sub && <p className="mt-1.5 text-[11px] text-[var(--color-ink-soft)]">{sub}</p>}
    </Card>
  )
}
