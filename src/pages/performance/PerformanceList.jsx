import { useEffect, useState, useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Star, Plus, Info, Pencil, Trash2, Send, Check, Undo2, Lightbulb } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, Card, Select, Button, Table, Tr, Td, Badge, EmptyState, FullPageSpinner, Modal, Input, Textarea } from '../../components/ui'
import { STATUS_BADGE_COLOR } from '../../lib/format'
import { kategoriFromSkor, defaultPeriodeKinerja } from '../../lib/remunerasi'

const TABS = ['Pengajuan', 'Verifikasi Yayasan', 'Rekap & Histori']

/** Nilai Akhir = rata-rata skor KPI berbobot (hanya indikator yang diisi). */
function computeNilaiAkhir(kpiIndicators, scores) {
  let sumBobot = 0
  let sumBerbobot = 0
  for (const k of kpiIndicators) {
    const raw = scores[k.id]
    if (raw === '' || raw == null) continue
    const skor = Number(raw)
    if (Number.isNaN(skor)) continue
    sumBobot += Number(k.bobot)
    sumBerbobot += skor * Number(k.bobot)
  }
  if (sumBobot === 0) return null
  return Number((sumBerbobot / sumBobot).toFixed(2))
}

/** Sinkronkan Nilai Akhir yang sudah final ke Indeks Kinerja pegawai — inilah angka yang benar-benar dipakai mesin gaji (Tunjangan Remunerasi). */
async function syncPerformanceIndex({ employeeId, nilaiAkhir, periodeMulai, periodeSelesai }) {
  const kategoriRow = kategoriFromSkor(nilaiAkhir)
  return supabase.from('performance_index').upsert({
    employee_id: employeeId,
    periode_mulai: periodeMulai,
    periode_selesai: periodeSelesai,
    skor: nilaiAkhir,
    kategori: kategoriRow?.kategori,
    indeks_kinerja: kategoriRow?.indeks,
  }, { onConflict: 'employee_id,periode_mulai' })
}

export default function PerformanceList() {
  const { isManager, hasFullAccess, employee, loading: authLoading } = useAuth()
  const [sp] = useSearchParams()
  const personal = sp.get('me') === '1' // mode "diri sendiri" (Menu Pribadi)
  // Di mode pribadi, manajer diperlakukan sebagai pegawai biasa: hanya melihat
  // penilaian kinerjanya sendiri (tanpa UI manajemen/verifikasi).
  const effIsManager = isManager && !personal
  const effHasFullAccess = hasFullAccess && !personal
  const [tab, setTab] = useState(effIsManager ? 'Pengajuan' : 'Rekap & Histori')
  const [periods, setPeriods] = useState([])
  const [periodFilter, setPeriodFilter] = useState('')
  const [kpiIndicators, setKpiIndicators] = useState([])
  const [myKpiProposals, setMyKpiProposals] = useState([])
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [rekapStatusFilter, setRekapStatusFilter] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingRow, setEditingRow] = useState(null)
  const [verifyState, setVerifyState] = useState(null) // { row, mode: 'setujui' | 'kembalikan' }
  const [kpiProposalOpen, setKpiProposalOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    let reviewQuery = supabase
      .from('performance_reviews')
      .select(`
        *,
        employees!employee_id(nama, school_id, schools!school_id(nama, jenjang)),
        performance_periods(nama, tahun, semester),
        target_is_manager:performance_reviews_target_is_manager,
        diajukan_nama:performance_reviews_diajukan_nama,
        verifikasi_nama:performance_reviews_verifikasi_nama,
        performance_review_kpi_scores(id, kpi_indicator_id, skor, bobot_snapshot, kpi_indicators(nama))
      `)
      .order('created_at', { ascending: false })
    if (periodFilter) reviewQuery = reviewQuery.eq('period_id', periodFilter)

    const [{ data: p }, { data: kpi }, { data: r, error: rErr }, { data: myKpi }] = await Promise.all([
      supabase.from('performance_periods').select('*').order('tahun', { ascending: false }).order('semester', { ascending: false }),
      supabase.from('kpi_indicators').select('*').eq('status', 'disetujui').eq('status_aktif', true).order('urutan').order('nama'),
      reviewQuery,
      // Sekolah (bukan Yayasan) melihat riwayat usulan indikator KPI-nya
      // sendiri di sini — Yayasan mengelola & memutuskan usulan lewat
      // menu Struktur Organisasi > KPI (RequireFullAccess), yang tidak
      // bisa dijangkau Kepala Sekolah/Admin Sekolah.
      hasFullAccess || !employee?.school_id
        ? Promise.resolve({ data: [] })
        : supabase.from('kpi_indicators').select('*').eq('diajukan_oleh_school_id', employee.school_id).order('created_at', { ascending: false }),
    ])
    if (rErr) setLoadError(rErr.message)
    setPeriods(p || [])
    setKpiIndicators(kpi || [])
    setRows(r || [])
    setMyKpiProposals(myKpi || [])
    setLoading(false)
  }, [periodFilter, hasFullAccess, employee?.school_id])

  useEffect(() => { if (!authLoading) load() }, [authLoading, load])

  // Mode pribadi (?me=1) tidak me-remount halaman; pastikan tab pindah ke
  // rekap pribadi, bukan tersangkut di tab manajemen.
  useEffect(() => { if (personal) setTab('Rekap & Histori') }, [personal])

  const canWriteRow = (row) => hasFullAccess || !row.target_is_manager

  const pengajuanRows = useMemo(() => {
    if (!isManager) return []
    return rows.filter((r) => ['draft', 'diajukan', 'dikembalikan'].includes(r.status))
  }, [rows, isManager])

  const verifikasiRows = useMemo(() => {
    if (!hasFullAccess) return []
    return rows.filter((r) => r.status === 'diajukan')
  }, [rows, hasFullAccess])

  const rekapRows = useMemo(() => {
    let list = personal ? rows.filter((r) => r.employee_id === employee?.id) : rows
    if (rekapStatusFilter) list = list.filter((r) => r.status === rekapStatusFilter)
    return list
  }, [rows, rekapStatusFilter, personal, employee?.id])

  const handleDelete = async (row) => {
    if (!confirm(`Hapus draft penilaian "${row.employees?.nama}" — ${row.performance_periods?.nama} ${row.performance_periods?.tahun}? Tindakan ini tidak bisa dibatalkan.`)) return
    const { error } = await supabase.from('performance_reviews').delete().eq('id', row.id)
    if (error) { alert('Gagal menghapus: ' + error.message); return }
    load()
  }

  const handleAjukan = async (row) => {
    if (!confirm(`Ajukan penilaian "${row.employees?.nama}" ke Yayasan untuk diverifikasi? Setelah diajukan, isi penilaian tidak bisa diubah sampai Yayasan memberi keputusan.`)) return
    const { error } = await supabase.from('performance_reviews').update({ status: 'diajukan' }).eq('id', row.id)
    if (error) { alert('Gagal mengajukan: ' + error.message); return }
    load()
  }

  if (authLoading || loading) return <FullPageSpinner />

  return (
    <div>
      <PageHeader
        title={effIsManager ? 'Penilaian Kinerja' : 'Kinerja Saya'}
        description={effIsManager ? 'Nilai kinerja pegawai berdasarkan indikator KPI yayasan, lalu ajukan untuk diverifikasi Yayasan.' : 'Riwayat hasil penilaian kinerja & OKR Anda.'}
        actions={effIsManager && (
          <Button onClick={() => { setEditingRow(null); setFormOpen(true) }}><Plus className="h-4 w-4" /> Tambah Penilaian</Button>
        )}
      />

      {effIsManager && (
        <Card className="mb-4 border-[var(--color-navy)]/20 bg-[var(--color-navy-50)]">
          <p className="flex items-start gap-2 text-xs text-[var(--color-ink-soft)]">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Nilai Akhir dihitung otomatis dari skor KPI berbobot. Penilaian pegawai biasa oleh Kepala Sekolah/Admin Sekolah WAJIB diajukan dan diverifikasi Yayasan dulu sebelum berstatus <strong>Final</strong> dan mengisi Indeks Kinerja (dasar Tunjangan Remunerasi). Admin Sekolah/Kepala Sekolah sendiri dinilai langsung oleh Yayasan.
          </p>
        </Card>
      )}

      {loadError && (
        <Card className="mb-4 border-[var(--color-danger)] bg-[var(--color-danger-soft)]">
          <p className="text-sm text-[var(--color-danger)]">Gagal memuat data: {loadError}</p>
        </Card>
      )}

      {effIsManager && !effHasFullAccess && (
        <Card className="mb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-[var(--color-ink)]">Usulan Indikator KPI</p>
              <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">Selain indikator yang ditentukan Yayasan, sekolah Anda juga bisa mengusulkan indikator baru untuk ditinjau Yayasan.</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setKpiProposalOpen(true)}><Lightbulb className="h-4 w-4" /> Ajukan Indikator</Button>
          </div>
          {myKpiProposals.length > 0 && (
            <div className="mt-3 flex flex-col gap-1.5 border-t border-[var(--color-border)] pt-3">
              {myKpiProposals.map((k) => (
                <div key={k.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-[var(--color-ink)]">{k.nama} <span className="text-[var(--color-ink-soft)]">(usulan {k.bobot}%)</span></span>
                  <div className="flex items-center gap-2">
                    {k.status === 'ditolak' && k.catatan_yayasan && <span className="text-[var(--color-ink-soft)]">{k.catatan_yayasan}</span>}
                    <Badge color={k.status === 'diajukan' ? 'gold' : k.status === 'disetujui' ? 'success' : 'danger'}>{k.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {effIsManager && (
        <div className="mb-6 flex gap-1 overflow-x-auto border-b border-[var(--color-border)]">
          {TABS.filter((t) => t !== 'Verifikasi Yayasan' || effHasFullAccess).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                tab === t ? 'border-[var(--color-navy)] text-[var(--color-navy)]' : 'border-transparent text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]'
              }`}
            >
              {t}
              {t === 'Verifikasi Yayasan' && verifikasiRows.length > 0 && (
                <span className="ml-1.5 rounded-full bg-[var(--color-danger-soft)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--color-danger)]">
                  {verifikasiRows.length}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {(!effIsManager || tab === 'Pengajuan' || tab === 'Verifikasi Yayasan' || tab === 'Rekap & Histori') && (
        <Card className="mb-4" padded={false}>
          <div className="p-4">
            <Select containerClassName="sm:w-56" value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value)}>
              <option value="">Semua Periode</option>
              {periods.map((p) => <option key={p.id} value={p.id}>{p.nama} {p.tahun}</option>)}
            </Select>
          </div>
        </Card>
      )}

      {effIsManager && tab === 'Pengajuan' && (
        <Card padded={false}>
          <div className="p-5">
            {pengajuanRows.length === 0 ? (
              <EmptyState icon={Star} title="Tidak ada draft/pengajuan" description="Belum ada penilaian berstatus draft, diajukan, atau dikembalikan pada periode ini." />
            ) : (
              <Table columns={['Pegawai', 'Periode', 'Nilai Akhir', 'Status', 'Wewenang', 'Aksi']}>
                {pengajuanRows.map((r) => (
                  <Tr key={r.id}>
                    <Td className="font-medium text-[var(--color-ink)]">{r.employees?.nama}</Td>
                    <Td>{r.performance_periods?.nama} {r.performance_periods?.tahun}</Td>
                    <Td className="font-medium">{r.nilai_akhir ?? '—'}</Td>
                    <Td><Badge color={STATUS_BADGE_COLOR[r.status]}>{r.status}</Badge></Td>
                    <Td className="text-xs text-[var(--color-ink-soft)]">{r.target_is_manager ? 'Yayasan langsung' : '—'}</Td>
                    <Td className="text-right">
                      {canWriteRow(r) ? (
                        <div className="flex justify-end gap-1.5">
                          {r.status !== 'diajukan' && (
                            <button onClick={() => { setEditingRow(r); setFormOpen(true) }} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Ubah penilaian">
                              <Pencil className="h-4 w-4" />
                            </button>
                          )}
                          {r.status === 'draft' && !r.target_is_manager && (
                            <button onClick={() => handleAjukan(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Ajukan ke Yayasan">
                              <Send className="h-4 w-4" />
                            </button>
                          )}
                          {r.status === 'draft' && (
                            <button onClick={() => handleDelete(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus penilaian">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                          {r.status === 'diajukan' && <span className="text-xs text-[var(--color-ink-soft)]">Menunggu Yayasan</span>}
                        </div>
                      ) : (
                        <span className="text-xs text-[var(--color-ink-soft)]">Ditangani langsung oleh Yayasan</span>
                      )}
                    </Td>
                  </Tr>
                ))}
              </Table>
            )}
          </div>
        </Card>
      )}

      {effHasFullAccess && tab === 'Verifikasi Yayasan' && (
        <Card padded={false}>
          <div className="p-5">
            {verifikasiRows.length === 0 ? (
              <EmptyState icon={Star} title="Tidak ada yang perlu diverifikasi" description="Belum ada pengajuan penilaian kinerja dari sekolah yang menunggu keputusan Yayasan." />
            ) : (
              <Table columns={['Pegawai', 'Periode', 'Nilai Akhir', 'Rincian KPI', 'Diajukan Oleh', 'Aksi']}>
                {verifikasiRows.map((r) => (
                  <Tr key={r.id}>
                    <Td className="font-medium text-[var(--color-ink)]">{r.employees?.nama}</Td>
                    <Td>{r.performance_periods?.nama} {r.performance_periods?.tahun}</Td>
                    <Td className="font-medium">{r.nilai_akhir ?? '—'}</Td>
                    <Td className="max-w-xs text-xs text-[var(--color-ink-soft)]">
                      {(r.performance_review_kpi_scores || []).map((s) => `${s.kpi_indicators?.nama}: ${s.skor}`).join(' · ') || '—'}
                    </Td>
                    <Td className="text-[var(--color-ink-soft)]">{r.diajukan_nama || '—'}</Td>
                    <Td>
                      <div className="flex justify-end gap-1.5">
                        <button onClick={() => setVerifyState({ row: r, mode: 'setujui' })} className="rounded bg-[var(--color-success-soft)] p-1.5 text-[var(--color-success)] hover:brightness-95" aria-label="Setujui">
                          <Check className="h-4 w-4" />
                        </button>
                        <button onClick={() => setVerifyState({ row: r, mode: 'kembalikan' })} className="rounded bg-[var(--color-gold-soft)] p-1.5 text-[var(--color-gold)] hover:brightness-95" aria-label="Kembalikan untuk revisi">
                          <Undo2 className="h-4 w-4" />
                        </button>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </Table>
            )}
          </div>
        </Card>
      )}

      {tab === 'Rekap & Histori' && (
        <>
          <Card className="mb-4" padded={false}>
            <div className="p-4">
              <Select containerClassName="sm:w-56" value={rekapStatusFilter} onChange={(e) => setRekapStatusFilter(e.target.value)}>
                <option value="">Semua Status</option>
                <option value="draft">Draft</option>
                <option value="diajukan">Diajukan</option>
                <option value="final">Final</option>
                <option value="dikembalikan">Dikembalikan</option>
              </Select>
            </div>
          </Card>
          <Card padded={false}>
            <div className="p-5">
              {rekapRows.length === 0 ? (
                <EmptyState icon={Star} title="Belum ada data" description="Belum ada riwayat penilaian kinerja pada filter ini." />
              ) : (
                <Table columns={effIsManager ? ['Pegawai', 'Periode', 'Nilai Akhir', 'Status', 'Diajukan/Diverifikasi', 'Catatan Yayasan'] : ['Periode', 'Nilai Akhir', 'Status', 'Catatan Yayasan']}>
                  {rekapRows.map((r) => (
                    <Tr key={r.id}>
                      {effIsManager && <Td className="font-medium text-[var(--color-ink)]">{r.employees?.nama}</Td>}
                      <Td>{r.performance_periods?.nama} {r.performance_periods?.tahun}</Td>
                      <Td className="font-medium">{r.nilai_akhir ?? '—'}</Td>
                      <Td><Badge color={STATUS_BADGE_COLOR[r.status]}>{r.status}</Badge></Td>
                      {effIsManager && (
                        <Td className="text-xs text-[var(--color-ink-soft)]">
                          {r.diajukan_nama && <div>Diajukan: {r.diajukan_nama}</div>}
                          {r.verifikasi_nama && <div>Diverifikasi: {r.verifikasi_nama}</div>}
                          {!r.diajukan_nama && !r.verifikasi_nama && '—'}
                        </Td>
                      )}
                      <Td className="text-xs text-[var(--color-ink-soft)]">{r.catatan_yayasan || '—'}</Td>
                    </Tr>
                  ))}
                </Table>
              )}
            </div>
          </Card>
        </>
      )}

      <KpiScoreModal
        open={formOpen}
        editingRow={editingRow}
        onClose={() => { setFormOpen(false); setEditingRow(null) }}
        onSaved={() => { setFormOpen(false); setEditingRow(null); load() }}
        periods={periods}
        kpiIndicators={kpiIndicators}
        hasFullAccess={hasFullAccess}
        currentEmployeeId={employee?.id}
      />

      <VerifyModal
        state={verifyState}
        onClose={() => setVerifyState(null)}
        onDone={() => { setVerifyState(null); load() }}
      />

      <KpiProposalModal
        open={kpiProposalOpen}
        schoolId={employee?.school_id}
        onClose={() => setKpiProposalOpen(false)}
        onSaved={() => { setKpiProposalOpen(false); load() }}
      />
    </div>
  )
}

function KpiScoreModal({ open, editingRow, onClose, onSaved, periods, kpiIndicators, hasFullAccess, currentEmployeeId }) {
  const [employees, setEmployees] = useState([])
  const [employeeId, setEmployeeId] = useState('')
  const [periodId, setPeriodId] = useState('')
  const [scores, setScores] = useState({})
  const [catatan, setCatatan] = useState('')
  const [status, setStatus] = useState('draft')
  const [periodeGajiMulai, setPeriodeGajiMulai] = useState('')
  const [periodeGajiSelesai, setPeriodeGajiSelesai] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isEdit = !!editingRow

  useEffect(() => {
    if (open) {
      const now = new Date()
      const pg = defaultPeriodeKinerja(now.getFullYear(), now.getMonth() + 1)
      setPeriodeGajiMulai(pg.mulai)
      setPeriodeGajiSelesai(pg.selesai)
      setError('')
      if (editingRow) {
        setEmployeeId(editingRow.employee_id)
        setPeriodId(editingRow.period_id)
        setCatatan(editingRow.catatan || '')
        setStatus(editingRow.status === 'final' ? 'final' : 'draft')
        const initScores = {}
        for (const s of editingRow.performance_review_kpi_scores || []) initScores[s.kpi_indicator_id] = String(s.skor)
        setScores(initScores)
      } else {
        setEmployeeId('')
        setPeriodId('')
        setCatatan('')
        setStatus('draft')
        setScores({})
      }
      supabase.from('employees').select('id, nama, is_manager_role:employees_is_manager_role').eq('status', 'aktif').order('nama')
        .then(({ data }) => setEmployees(data || []))
    }
  }, [open, editingRow])

  const selectedEmployee = employees.find((e) => e.id === employeeId)
  const targetIsManager = isEdit ? editingRow.target_is_manager : !!selectedEmployee?.is_manager_role
  // Yayasan boleh langsung memfinalisasi penilaian siapa pun (termasuk
  // pegawai biasa, bukan cuma Kepala Sekolah/Admin Sekolah) — sesuai
  // kewenangan penuh perf_reviews_write_yayasan di RLS. Sekolah hanya
  // boleh draft/mengajukan, tidak pernah memvalidasi sendiri.
  const statusOptions = hasFullAccess ? ['draft', 'diajukan', 'final'] : ['draft', 'diajukan']
  const visibleEmployees = employees.filter((e) => hasFullAccess || !e.is_manager_role || e.id === editingRow?.employee_id)
  const nilaiAkhir = computeNilaiAkhir(kpiIndicators, scores)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!employeeId || !periodId) { setError('Pilih pegawai dan periode.'); return }
    if (kpiIndicators.length === 0) { setError('Belum ada indikator KPI aktif — tambahkan dulu di menu Struktur Organisasi > KPI.'); return }
    if (nilaiAkhir == null) { setError('Isi minimal satu skor KPI.'); return }
    if (status === 'final' && (!periodeGajiMulai || !periodeGajiSelesai)) { setError('Isi rentang periode gaji yang akan memakai Indeks Kinerja ini.'); return }
    setSaving(true)
    setError('')

    const payload = {
      employee_id: employeeId, period_id: periodId, catatan: catatan || null,
      status, nilai_akhir: nilaiAkhir, reviewer_id: currentEmployeeId || null,
    }
    const query = isEdit
      ? supabase.from('performance_reviews').update(payload).eq('id', editingRow.id).select('id').single()
      : supabase.from('performance_reviews').insert(payload).select('id').single()
    const { data: savedRow, error: err } = await query
    if (err) { setSaving(false); setError(err.message.includes('duplicate') ? 'Pegawai ini sudah dinilai pada periode tersebut.' : err.message); return }

    // Ganti seluruh baris skor KPI dengan isi form saat ini — lebih
    // sederhana & aman daripada upsert parsial. RLS pada tabel skor
    // menurunkan ulang wewenang tulis induknya, jadi baris ini hanya
    // tersimpan kalau pengguna memang berwenang menulis penilaian ybs.
    const reviewId = savedRow.id
    await supabase.from('performance_review_kpi_scores').delete().eq('review_id', reviewId)
    const scoreRows = kpiIndicators
      .filter((k) => scores[k.id] !== '' && scores[k.id] != null)
      .map((k) => ({ review_id: reviewId, kpi_indicator_id: k.id, skor: Number(scores[k.id]), bobot_snapshot: Number(k.bobot) }))
    if (scoreRows.length > 0) {
      const { error: scoreErr } = await supabase.from('performance_review_kpi_scores').insert(scoreRows)
      if (scoreErr) { setSaving(false); setError('Penilaian tersimpan, tetapi gagal menyimpan rincian skor KPI: ' + scoreErr.message); return }
    }

    if (status === 'final') {
      const { error: ikErr } = await syncPerformanceIndex({
        employeeId, nilaiAkhir, periodeMulai: periodeGajiMulai, periodeSelesai: periodeGajiSelesai,
      })
      if (ikErr) alert('Penilaian tersimpan, tetapi gagal menyinkronkan ke Indeks Kinerja (perlu diatur manual di tab Indeks Kehadiran pegawai): ' + ikErr.message)
    }

    setSaving(false)
    onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Ubah Penilaian Kinerja' : 'Tambah Penilaian Kinerja'} width="max-w-2xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <Select label="Pegawai" required value={employeeId} onChange={(e) => { setEmployeeId(e.target.value); setStatus('draft') }}>
            <option value="">— Pilih —</option>
            {visibleEmployees.map((e) => <option key={e.id} value={e.id}>{e.nama}{e.is_manager_role ? ' (Admin/Kepala Sekolah)' : ''}</option>)}
          </Select>
          <Select label="Periode" required value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
            <option value="">— Pilih —</option>
            {periods.map((p) => <option key={p.id} value={p.id}>{p.nama} {p.tahun}</option>)}
          </Select>
        </div>

        {targetIsManager && (
          <p className="rounded-md bg-[var(--color-navy-50)] px-3 py-2 text-xs text-[var(--color-ink-soft)]">
            Pegawai ini berperan Admin Sekolah/Kepala Sekolah — sesuai kebijakan, penilaiannya ditangani/diputuskan langsung oleh Yayasan, tanpa tahap pengajuan.
          </p>
        )}

        {kpiIndicators.length === 0 ? (
          <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">
            Belum ada indikator KPI aktif. Tambahkan dulu di menu Struktur Organisasi &gt; KPI.
          </p>
        ) : (
          <div className="rounded-[12px] border border-[var(--color-border)] p-4">
            <p className="mb-3 text-[13px] font-medium text-[var(--color-ink)]">Skor per Indikator KPI</p>
            <div className="flex flex-col gap-3">
              {kpiIndicators.map((k) => (
                <div key={k.id} className="grid grid-cols-3 items-center gap-3">
                  <div className="col-span-2">
                    <p className="text-sm text-[var(--color-ink)]">{k.nama}</p>
                    <p className="text-xs text-[var(--color-ink-soft)]">Bobot {k.bobot}%</p>
                  </div>
                  <Input
                    type="number" min="0" max="100" step="0.01"
                    value={scores[k.id] ?? ''}
                    onChange={(e) => setScores((s) => ({ ...s, [k.id]: e.target.value }))}
                    placeholder="0-100"
                  />
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm font-medium text-[var(--color-ink)]">Nilai Akhir (pratinjau): {nilaiAkhir ?? '—'}</p>
          </div>
        )}

        <Textarea label="Catatan" rows={3} value={catatan} onChange={(e) => setCatatan(e.target.value)} />

        <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          {statusOptions.includes('draft') && <option value="draft">Draft</option>}
          {statusOptions.includes('diajukan') && <option value="diajukan">Ajukan ke Yayasan</option>}
          {statusOptions.includes('final') && <option value="final">Final (langsung — hanya Yayasan)</option>}
        </Select>

        {status === 'final' && (
          <div className="rounded-[12px] border border-[var(--color-border)] p-4">
            <p className="mb-3 text-[13px] font-medium text-[var(--color-ink)]">Berlaku untuk Periode Gaji</p>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Mulai" type="date" value={periodeGajiMulai} onChange={(e) => setPeriodeGajiMulai(e.target.value)} />
              <Input label="Sampai Dengan" type="date" value={periodeGajiSelesai} onChange={(e) => setPeriodeGajiSelesai(e.target.value)} />
            </div>
            <p className="mt-2 text-xs text-[var(--color-ink-soft)]">Rentang ini akan mengisi Indeks Kinerja pegawai untuk perhitungan Tunjangan Remunerasi pada bulan-bulan gaji di dalamnya.</p>
          </div>
        )}

        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : isEdit ? 'Simpan Perubahan' : 'Simpan'}</Button>
        </div>
      </form>
    </Modal>
  )
}

function VerifyModal({ state, onClose, onDone }) {
  const [periodeGajiMulai, setPeriodeGajiMulai] = useState('')
  const [periodeGajiSelesai, setPeriodeGajiSelesai] = useState('')
  const [catatan, setCatatan] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (state) {
      const now = new Date()
      const pg = defaultPeriodeKinerja(now.getFullYear(), now.getMonth() + 1)
      setPeriodeGajiMulai(pg.mulai)
      setPeriodeGajiSelesai(pg.selesai)
      setCatatan('')
      setError('')
    }
  }, [state])

  if (!state) return null
  const { row, mode } = state

  const handleConfirm = async () => {
    if (mode === 'setujui' && (!periodeGajiMulai || !periodeGajiSelesai)) { setError('Isi rentang periode gaji yang akan memakai Indeks Kinerja ini.'); return }
    if (mode === 'kembalikan' && !catatan.trim()) { setError('Isi catatan/alasan pengembalian untuk sekolah.'); return }
    setSaving(true)
    setError('')
    const payload = mode === 'setujui'
      ? { status: 'final', catatan_yayasan: catatan || null }
      : { status: 'dikembalikan', catatan_yayasan: catatan }
    const { error: err } = await supabase.from('performance_reviews').update(payload).eq('id', row.id)
    if (err) { setSaving(false); setError(err.message); return }

    if (mode === 'setujui') {
      const { error: ikErr } = await syncPerformanceIndex({
        employeeId: row.employee_id, nilaiAkhir: row.nilai_akhir, periodeMulai: periodeGajiMulai, periodeSelesai: periodeGajiSelesai,
      })
      if (ikErr) { setSaving(false); alert('Status tersimpan, tetapi gagal menyinkronkan ke Indeks Kinerja (perlu diatur manual di tab Indeks Kehadiran pegawai): ' + ikErr.message); onDone(); return }
    }

    setSaving(false)
    onDone()
  }

  return (
    <Modal open={!!state} onClose={onClose} title={mode === 'setujui' ? 'Setujui Penilaian Kinerja' : 'Kembalikan untuk Revisi'}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-[var(--color-ink-soft)]">
          Penilaian <span className="font-medium text-[var(--color-ink)]">{row.employees?.nama}</span> — {row.performance_periods?.nama} {row.performance_periods?.tahun}, Nilai Akhir <span className="font-medium text-[var(--color-ink)]">{row.nilai_akhir ?? '—'}</span>.
        </p>
        {mode === 'setujui' && (
          <div className="rounded-[12px] border border-[var(--color-border)] p-4">
            <p className="mb-3 text-[13px] font-medium text-[var(--color-ink)]">Berlaku untuk Periode Gaji</p>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Mulai" type="date" value={periodeGajiMulai} onChange={(e) => setPeriodeGajiMulai(e.target.value)} />
              <Input label="Sampai Dengan" type="date" value={periodeGajiSelesai} onChange={(e) => setPeriodeGajiSelesai(e.target.value)} />
            </div>
          </div>
        )}
        <Textarea
          label={mode === 'setujui' ? 'Catatan Yayasan (opsional)' : 'Catatan / Alasan Pengembalian'}
          rows={3} value={catatan} onChange={(e) => setCatatan(e.target.value)}
        />
        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="button" onClick={handleConfirm} disabled={saving}>{saving ? 'Menyimpan…' : mode === 'setujui' ? 'Setujui' : 'Kembalikan'}</Button>
        </div>
      </div>
    </Modal>
  )
}

function KpiProposalModal({ open, schoolId, onClose, onSaved }) {
  const [nama, setNama] = useState('')
  const [deskripsi, setDeskripsi] = useState('')
  const [bobot, setBobot] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) { setNama(''); setDeskripsi(''); setBobot(''); setError('') }
  }, [open])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!nama.trim()) { setError('Isi nama indikator.'); return }
    if (!bobot || Number(bobot) <= 0) { setError('Isi usulan bobot lebih dari 0.'); return }
    if (!schoolId) { setError('Akun Anda belum tertaut ke unit sekolah, jadi belum bisa mengajukan indikator.'); return }
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('kpi_indicators').insert({
      nama: nama.trim(), deskripsi: deskripsi || null, bobot: Number(bobot),
      status: 'diajukan', status_aktif: false, diajukan_oleh_school_id: schoolId,
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title="Ajukan Indikator KPI Baru">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="text-xs text-[var(--color-ink-soft)]">Usulan ini akan ditinjau Yayasan (bobot final bisa disesuaikan) sebelum aktif dipakai menilai.</p>
        <Input label="Nama Indikator" required value={nama} onChange={(e) => setNama(e.target.value)} placeholder="Contoh: Keterlibatan dalam Ekstrakurikuler" />
        <Textarea label="Deskripsi (opsional)" rows={3} value={deskripsi} onChange={(e) => setDeskripsi(e.target.value)} />
        <Input label="Usulan Bobot (%)" type="number" min="0.01" max="100" step="0.01" required value={bobot} onChange={(e) => setBobot(e.target.value)} />
        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Mengirim…' : 'Ajukan'}</Button>
        </div>
      </form>
    </Modal>
  )
}
