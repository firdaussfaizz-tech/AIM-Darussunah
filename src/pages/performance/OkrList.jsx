import { useEffect, useState, useCallback, useMemo } from 'react'
import { Target, Plus, Pencil, Trash2, Send, Check, Undo2, Info } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, Card, Select, Button, Badge, EmptyState, FullPageSpinner, Modal, Input, Textarea } from '../../components/ui'
import { STATUS_BADGE_COLOR } from '../../lib/format'

const TABS = ['Pengajuan Sekolah', 'Persetujuan Yayasan', 'Rekap & Histori']

function progressPercent(keyResults) {
  if (!keyResults || keyResults.length === 0) return 0
  const ratios = keyResults.map((kr) => {
    const target = Number(kr.target) || 0
    if (target === 0) return 0
    return Math.min(1, Math.max(0, Number(kr.capaian || 0) / target))
  })
  return Math.round((ratios.reduce((a, b) => a + b, 0) / ratios.length) * 100)
}

export default function OkrList() {
  const { hasFullAccess, roles, loading: authLoading } = useAuth()

  // OKR di sini MILIK SATUAN PENDIDIKAN (sekolah), bukan pegawai
  // perorangan — hanya pemegang peran Admin Sekolah/Kepala Sekolah yang
  // boleh menyusun & mengajukan atas nama sekolahnya (hasil rapat
  // internal), sesuai keputusan pengguna. `roles` (bukan roleNames yang
  // sudah diratakan) dipakai supaya sekolah spesifik tempat peran itu
  // melekat ikut terbaca.
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

  const [tab, setTab] = useState(canAuthor ? 'Pengajuan Sekolah' : 'Rekap & Histori')
  const [schools, setSchools] = useState([])
  const [periods, setPeriods] = useState([])
  const [periodFilter, setPeriodFilter] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [rekapStatusFilter, setRekapStatusFilter] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingRow, setEditingRow] = useState(null)
  const [decideState, setDecideState] = useState(null) // { row, mode: 'setujui' | 'revisi' }

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    let q = supabase
      .from('okr_objectives')
      .select(`
        *,
        schools!school_id(nama, jenjang),
        performance_periods(nama, tahun, semester),
        diajukan_nama:okr_objectives_diajukan_nama,
        diputuskan_nama:okr_objectives_diputuskan_nama,
        okr_key_results(id, deskripsi, target, capaian, satuan, urutan)
      `)
      .order('created_at', { ascending: false })
    if (periodFilter) q = q.eq('period_id', periodFilter)
    const [{ data: p }, { data: s }, { data: r, error: rErr }] = await Promise.all([
      supabase.from('performance_periods').select('*').order('tahun', { ascending: false }).order('semester', { ascending: false }),
      supabase.from('schools').select('id, nama, jenjang').order('jenjang'),
      q,
    ])
    if (rErr) setLoadError(rErr.message)
    setPeriods(p || [])
    setSchools(s || [])
    setRows(r || [])
    setLoading(false)
  }, [periodFilter])

  useEffect(() => { if (!authLoading) load() }, [authLoading, load])

  const pengajuanRows = useMemo(() => {
    if (!canAuthor) return []
    const list = rows.filter((r) => ['draft', 'diajukan', 'perlu_revisi'].includes(r.status))
    if (hasFullAccess) return list
    return list.filter((r) => mySchoolIds.includes(r.school_id))
  }, [rows, canAuthor, hasFullAccess, mySchoolIds])

  const persetujuanRows = useMemo(() => (hasFullAccess ? rows.filter((r) => r.status === 'diajukan') : []), [rows, hasFullAccess])

  const rekapRows = useMemo(() => {
    let list = rows
    if (rekapStatusFilter) list = list.filter((r) => r.status === rekapStatusFilter)
    return list
  }, [rows, rekapStatusFilter])

  const handleDelete = async (row) => {
    if (!confirm(`Hapus Objective draft "${row.judul}"? Seluruh Key Result di dalamnya ikut terhapus.`)) return
    const { error } = await supabase.from('okr_objectives').delete().eq('id', row.id)
    if (error) { alert('Gagal menghapus: ' + error.message); return }
    load()
  }

  const handleAjukan = async (row) => {
    if (!confirm(`Ajukan Objective "${row.judul}" ke Yayasan untuk disetujui?`)) return
    const { error } = await supabase.from('okr_objectives').update({ status: 'diajukan' }).eq('id', row.id)
    if (error) { alert('Gagal mengajukan: ' + error.message); return }
    load()
  }

  if (authLoading || loading) return <FullPageSpinner />

  return (
    <div>
      <PageHeader
        title="OKR — Objective & Key Results"
        description="Tujuan & ukuran keberhasilan tingkat satuan pendidikan — disusun Kepala Sekolah/Admin Sekolah berdasarkan hasil rapat internal, lalu diajukan untuk disetujui Yayasan."
        actions={canAuthor && (
          <Button onClick={() => { setEditingRow(null); setFormOpen(true) }}><Plus className="h-4 w-4" /> Tambah Objective</Button>
        )}
      />

      <Card className="mb-4 border-[var(--color-navy)]/20 bg-[var(--color-navy-50)]">
        <p className="flex items-start gap-2 text-xs text-[var(--color-ink-soft)]">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          OKR di sini mewakili satuan pendidikan (sekolah), bukan pegawai perorangan — pegawai biasa tidak bisa menginput/mengajukan OKR. Setelah disetujui, capaian tiap Key Result tetap bisa diperbarui sepanjang periode berjalan; judul, deskripsi, dan daftar Key Result terkunci setelah diajukan.
        </p>
      </Card>

      {loadError && (
        <Card className="mb-4 border-[var(--color-danger)] bg-[var(--color-danger-soft)]">
          <p className="text-sm text-[var(--color-danger)]">Gagal memuat data: {loadError}</p>
        </Card>
      )}

      {canAuthor && (
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
      )}

      <Card className="mb-4" padded={false}>
        <div className="p-4">
          <Select containerClassName="sm:w-56" value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value)}>
            <option value="">Semua Periode</option>
            {periods.map((p) => <option key={p.id} value={p.id}>{p.nama} {p.tahun}</option>)}
          </Select>
        </div>
      </Card>

      {canAuthor && tab === 'Pengajuan Sekolah' && (
        <ObjectiveList
          rows={pengajuanRows}
          showSekolah={hasFullAccess}
          emptyTitle="Belum ada draft/pengajuan"
          emptyDescription="Belum ada Objective berstatus draft, diajukan, atau perlu revisi."
          renderActions={(row) => (
            <div className="flex justify-end gap-1.5">
              <button onClick={() => { setEditingRow(row); setFormOpen(true) }} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label={['draft', 'perlu_revisi'].includes(row.status) ? 'Ubah' : 'Perbarui capaian'}>
                <Pencil className="h-4 w-4" />
              </button>
              {row.status === 'draft' && (
                <button onClick={() => handleAjukan(row)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Ajukan"><Send className="h-4 w-4" /></button>
              )}
              {row.status === 'draft' && (
                <button onClick={() => handleDelete(row)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus"><Trash2 className="h-4 w-4" /></button>
              )}
            </div>
          )}
        />
      )}

      {hasFullAccess && tab === 'Persetujuan Yayasan' && (
        <ObjectiveList
          rows={persetujuanRows}
          showSekolah
          emptyTitle="Tidak ada yang perlu disetujui"
          emptyDescription="Belum ada Objective yang diajukan sekolah untuk disetujui."
          renderActions={(row) => (
            <div className="flex justify-end gap-1.5">
              <button onClick={() => setDecideState({ row, mode: 'setujui' })} className="rounded bg-[var(--color-success-soft)] p-1.5 text-[var(--color-success)] hover:brightness-95" aria-label="Setujui"><Check className="h-4 w-4" /></button>
              <button onClick={() => setDecideState({ row, mode: 'revisi' })} className="rounded bg-[var(--color-gold-soft)] p-1.5 text-[var(--color-gold)] hover:brightness-95" aria-label="Minta revisi"><Undo2 className="h-4 w-4" /></button>
            </div>
          )}
        />
      )}

      {tab === 'Rekap & Histori' && (
        <>
          <Card className="mb-4" padded={false}>
            <div className="p-4">
              <Select containerClassName="sm:w-56" value={rekapStatusFilter} onChange={(e) => setRekapStatusFilter(e.target.value)}>
                <option value="">Semua Status</option>
                <option value="draft">Draft</option>
                <option value="diajukan">Diajukan</option>
                <option value="disetujui">Disetujui</option>
                <option value="perlu_revisi">Perlu Revisi</option>
              </Select>
            </div>
          </Card>
          <ObjectiveList
            rows={rekapRows}
            showSekolah
            emptyTitle="Belum ada data"
            emptyDescription="Belum ada riwayat OKR pada filter ini."
          />
        </>
      )}

      <ObjectiveFormModal
        open={formOpen}
        editingRow={editingRow}
        onClose={() => { setFormOpen(false); setEditingRow(null) }}
        onSaved={() => { setFormOpen(false); setEditingRow(null); load() }}
        periods={periods}
        schools={hasFullAccess ? schools : mySchools}
        hasFullAccess={hasFullAccess}
      />

      <DecideModal state={decideState} onClose={() => setDecideState(null)} onDone={() => { setDecideState(null); load() }} />
    </div>
  )
}

function ObjectiveList({ rows, showSekolah, emptyTitle, emptyDescription, renderActions }) {
  if (rows.length === 0) {
    return (
      <Card padded={false}>
        <div className="p-5">
          <EmptyState icon={Target} title={emptyTitle} description={emptyDescription} />
        </div>
      </Card>
    )
  }
  return (
    <Card padded={false}>
      <div className="flex flex-col divide-y divide-[var(--color-border)] p-5">
        {rows.map((row) => {
          const progress = progressPercent(row.okr_key_results)
          return (
            <div key={row.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  {showSekolah && <p className="text-xs font-medium text-[var(--color-ink-soft)]">{row.schools?.nama} ({row.schools?.jenjang})</p>}
                  <p className="font-medium text-[var(--color-ink)]">{row.judul}</p>
                  <p className="text-[13px] text-[var(--color-ink-soft)]">{row.performance_periods?.nama} {row.performance_periods?.tahun}</p>
                  {row.deskripsi && <p className="mt-1 text-sm text-[var(--color-ink-soft)]">{row.deskripsi}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge color={STATUS_BADGE_COLOR[row.status]}>{row.status.replace('_', ' ')}</Badge>
                  {renderActions && renderActions(row)}
                </div>
              </div>

              {row.okr_key_results?.length > 0 && (
                <div className="flex flex-col gap-1.5 rounded-[10px] bg-black/[0.02] p-3">
                  {row.okr_key_results.map((kr) => (
                    <div key={kr.id} className="flex items-center justify-between gap-2 text-[13px]">
                      <span className="text-[var(--color-ink)]">{kr.deskripsi}</span>
                      <span className="whitespace-nowrap text-[var(--color-ink-soft)]">{kr.capaian ?? 0} / {kr.target} {kr.satuan || ''}</span>
                    </div>
                  ))}
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/[0.06]">
                      <div className="h-full rounded-full bg-[var(--color-navy)]" style={{ width: `${progress}%` }} />
                    </div>
                    <span className="text-xs font-medium text-[var(--color-ink-soft)]">{progress}%</span>
                  </div>
                </div>
              )}

              {row.catatan_yayasan && (
                <p className="text-xs text-[var(--color-ink-soft)]"><span className="font-medium text-[var(--color-ink)]">Catatan Yayasan:</span> {row.catatan_yayasan}</p>
              )}
              {row.diajukan_nama && <p className="text-xs text-[var(--color-ink-soft)]">Diajukan oleh {row.diajukan_nama}</p>}
              {row.diputuskan_nama && <p className="text-xs text-[var(--color-ink-soft)]">Diputuskan oleh {row.diputuskan_nama}</p>}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function ObjectiveFormModal({ open, editingRow, onClose, onSaved, periods, schools, hasFullAccess }) {
  const [schoolId, setSchoolId] = useState('')
  const [judul, setJudul] = useState('')
  const [deskripsi, setDeskripsi] = useState('')
  const [periodId, setPeriodId] = useState('')
  const [status, setStatus] = useState('draft')
  const [keyResults, setKeyResults] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isEdit = !!editingRow
  const objectiveLocked = isEdit && !['draft', 'perlu_revisi'].includes(editingRow.status)
  // Yayasan boleh langsung mencatat Objective berstatus disetujui (mis.
  // hasil rapat yang sudah diputuskan) — sekolah hanya boleh draft/ajukan.
  const statusOptions = hasFullAccess ? ['draft', 'diajukan', 'disetujui'] : ['draft', 'diajukan']

  useEffect(() => {
    if (open) {
      setError('')
      if (editingRow) {
        setSchoolId(editingRow.school_id)
        setJudul(editingRow.judul || '')
        setDeskripsi(editingRow.deskripsi || '')
        setPeriodId(editingRow.period_id)
        setStatus(statusOptions.includes(editingRow.status) ? editingRow.status : 'draft')
        setKeyResults((editingRow.okr_key_results || []).map((kr) => ({
          id: kr.id, deskripsi: kr.deskripsi, target: String(kr.target), satuan: kr.satuan || '', capaian: String(kr.capaian ?? 0),
        })))
      } else {
        setSchoolId(schools.length === 1 ? schools[0].id : '')
        setJudul('')
        setDeskripsi('')
        setPeriodId('')
        setStatus('draft')
        setKeyResults([{ deskripsi: '', target: '', satuan: '', capaian: '0' }])
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingRow])

  const updateKr = (idx, field, value) => setKeyResults((list) => list.map((kr, i) => (i === idx ? { ...kr, [field]: value } : kr)))
  const addKr = () => setKeyResults((list) => [...list, { deskripsi: '', target: '', satuan: '', capaian: '0' }])
  const removeKr = (idx) => setKeyResults((list) => list.filter((_, i) => i !== idx))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    // Objective sudah diajukan/disetujui: hanya angka capaian yang boleh
    // diperbarui (RLS mengunci judul/deskripsi/status di level Objective
    // begitu keluar dari draft/perlu_revisi — lihat migrasi 0031).
    if (objectiveLocked) {
      setSaving(true)
      for (const kr of keyResults) {
        if (!kr.id) continue
        const { error: err } = await supabase.from('okr_key_results').update({ capaian: Number(kr.capaian) || 0 }).eq('id', kr.id)
        if (err) { setSaving(false); setError(err.message); return }
      }
      setSaving(false)
      onSaved()
      return
    }

    if (!schoolId) { setError('Pilih satuan pendidikan.'); return }
    if (!judul.trim() || !periodId) { setError('Isi judul Objective dan pilih periode.'); return }
    const validKr = keyResults.filter((kr) => kr.deskripsi.trim() && kr.target !== '')
    if (validKr.length === 0) { setError('Tambahkan minimal satu Key Result dengan target.'); return }

    setSaving(true)
    const payload = { school_id: schoolId, period_id: periodId, judul: judul.trim(), deskripsi: deskripsi || null, status }
    const query = isEdit
      ? supabase.from('okr_objectives').update(payload).eq('id', editingRow.id).select('id').single()
      : supabase.from('okr_objectives').insert(payload).select('id').single()
    const { data: saved, error: err } = await query
    if (err) { setSaving(false); setError(err.message.includes('duplicate') ? 'Sekolah ini sudah punya Objective dengan judul yang sama pada periode ini.' : err.message); return }
    const objectiveId = saved.id

    // Ganti seluruh baris Key Result dengan isi form saat ini — pola yang
    // sama dengan performance_review_kpi_scores (lebih sederhana & aman
    // daripada upsert parsial, RLS sudah membatasi siapa yang sampai sini).
    await supabase.from('okr_key_results').delete().eq('objective_id', objectiveId)
    const { error: krErr } = await supabase.from('okr_key_results').insert(
      validKr.map((kr, idx) => ({
        objective_id: objectiveId, deskripsi: kr.deskripsi.trim(), target: Number(kr.target) || 0,
        capaian: Number(kr.capaian) || 0, satuan: kr.satuan || null, urutan: idx + 1,
      }))
    )
    if (krErr) { setSaving(false); setError('Objective tersimpan, tetapi gagal menyimpan Key Results: ' + krErr.message); return }

    setSaving(false)
    onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title={objectiveLocked ? 'Perbarui Capaian OKR' : isEdit ? 'Ubah Objective' : 'Tambah Objective'} width="max-w-2xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {objectiveLocked && (
          <p className="rounded-md bg-[var(--color-navy-50)] px-3 py-2 text-xs text-[var(--color-ink-soft)]">
            Objective ini sudah {editingRow.status === 'disetujui' ? 'disetujui' : 'diajukan'} — sekolah, judul, deskripsi, dan daftar Key Result terkunci. Anda tetap bisa memperbarui angka capaian di bawah.
          </p>
        )}
        <Select label="Satuan Pendidikan" required disabled={objectiveLocked} value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
          <option value="">— Pilih —</option>
          {schools.map((s) => <option key={s.id} value={s.id}>{s.jenjang} — {s.nama}</option>)}
        </Select>
        <Input label="Judul Objective" required disabled={objectiveLocked} value={judul} onChange={(e) => setJudul(e.target.value)} placeholder="Contoh: Meningkatkan kualitas pembelajaran di kelas" />
        <Textarea label="Deskripsi (opsional)" rows={2} disabled={objectiveLocked} value={deskripsi} onChange={(e) => setDeskripsi(e.target.value)} />
        <Select label="Periode" required disabled={objectiveLocked} value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
          <option value="">— Pilih —</option>
          {periods.map((p) => <option key={p.id} value={p.id}>{p.nama} {p.tahun}</option>)}
        </Select>

        <div className="rounded-[12px] border border-[var(--color-border)] p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[13px] font-medium text-[var(--color-ink)]">Key Results</p>
            {!objectiveLocked && (
              <Button type="button" size="sm" variant="outline" onClick={addKr}><Plus className="h-3.5 w-3.5" /> Tambah</Button>
            )}
          </div>
          <div className="flex flex-col gap-3">
            {keyResults.map((kr, idx) => (
              <div key={kr.id || idx} className="grid grid-cols-12 items-start gap-2">
                <Input containerClassName="col-span-5" placeholder="Deskripsi Key Result" disabled={objectiveLocked} value={kr.deskripsi} onChange={(e) => updateKr(idx, 'deskripsi', e.target.value)} />
                <Input containerClassName="col-span-2" type="number" placeholder="Target" disabled={objectiveLocked} value={kr.target} onChange={(e) => updateKr(idx, 'target', e.target.value)} />
                <Input containerClassName="col-span-2" placeholder="Satuan" disabled={objectiveLocked} value={kr.satuan} onChange={(e) => updateKr(idx, 'satuan', e.target.value)} />
                <Input containerClassName="col-span-2" type="number" placeholder="Capaian" value={kr.capaian} onChange={(e) => updateKr(idx, 'capaian', e.target.value)} />
                {!objectiveLocked && (
                  <button type="button" onClick={() => removeKr(idx)} className="col-span-1 mt-2 text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus baris Key Result">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {!objectiveLocked && (
          <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
            {statusOptions.includes('draft') && <option value="draft">Draft</option>}
            {statusOptions.includes('diajukan') && <option value="diajukan">Ajukan ke Yayasan</option>}
            {statusOptions.includes('disetujui') && <option value="disetujui">Disetujui (langsung — hanya Yayasan)</option>}
          </Select>
        )}

        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button>
        </div>
      </form>
    </Modal>
  )
}

function DecideModal({ state, onClose, onDone }) {
  const [catatan, setCatatan] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (state) { setCatatan(''); setError('') }
  }, [state])

  if (!state) return null
  const { row, mode } = state

  const handleConfirm = async () => {
    if (mode === 'revisi' && !catatan.trim()) { setError('Isi catatan alasan perlu revisi.'); return }
    setSaving(true)
    setError('')
    const payload = mode === 'setujui'
      ? { status: 'disetujui', catatan_yayasan: catatan || null }
      : { status: 'perlu_revisi', catatan_yayasan: catatan }
    const { error: err } = await supabase.from('okr_objectives').update(payload).eq('id', row.id)
    setSaving(false)
    if (err) { setError(err.message); return }
    onDone()
  }

  return (
    <Modal open={!!state} onClose={onClose} title={mode === 'setujui' ? 'Setujui Objective' : 'Minta Revisi'}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-[var(--color-ink-soft)]">
          <span className="font-medium text-[var(--color-ink)]">{row.schools?.nama}</span> — "{row.judul}" ({row.performance_periods?.nama} {row.performance_periods?.tahun})
        </p>
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
