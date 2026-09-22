import { useEffect, useMemo, useState, useCallback } from 'react'
import { CalendarClock, Plus, Check, X, History } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, Card, Select, Button, Table, Tr, Td, Badge, EmptyState, FullPageSpinner, Modal, Input, Textarea } from '../../components/ui'
import { STATUS_BADGE_COLOR, formatDate } from '../../lib/format'

const TABS = ['Pengajuan', 'Approval / Persetujuan', 'Rekap & Histori']

// Kode jenis cuti/izin -> status presensi (enum attendance_status_enum),
// dipakai saat menautkan presensi ke pengajuan yang disetujui.
function statusPresensiFromKode(kode) {
  if (!kode) return 'izin'
  if (kode === 'IS') return 'sakit'
  if (kode === 'DL') return 'dinas_luar'
  if (kode.startsWith('C')) return 'cuti' // CT, CSB, CM, CK, CH, CIH, CLTY
  return 'izin' // ITMK, IMTS, IAP*
}

function eachDateInRange(start, end) {
  const dates = []
  const d = new Date(start)
  const last = new Date(end)
  while (d <= last) {
    dates.push(d.toISOString().slice(0, 10))
    d.setDate(d.getDate() + 1)
  }
  return dates
}

/** Buat/perbarui baris presensi untuk setiap tanggal pada pengajuan yang disetujui, ditautkan via leave_request_id. */
async function syncAttendanceForApproval(row) {
  const kode = row.leave_types?.kode
  const status = statusPresensiFromKode(kode)
  const dates = eachDateInRange(row.tanggal_mulai, row.tanggal_selesai)
  const payload = dates.map((tanggal) => ({
    employee_id: row.employee_id,
    tanggal,
    status,
    leave_request_id: row.id,
  }))
  if (payload.length === 0) return
  const { error } = await supabase.from('attendance').upsert(payload, { onConflict: 'employee_id,tanggal' })
  if (error) alert('Pengajuan berhasil diproses, tetapi gagal menautkan ke data presensi: ' + error.message + '. Silakan periksa/tautkan manual di halaman Presensi.')
}

// Apakah pengajuan ini masih butuh tahap "pertimbangan" sekolah sebelum
// bisa disetujui final (khusus Cuti di Luar Tanggungan Yayasan untuk
// pegawai biasa — Pasal 16-21 & Formulir F-K2, lihat migrasi 0029)?
function needsPertimbangan(row) {
  return row.status === 'pending' && row.is_clty && !row.target_is_manager
}

function approveTargetStatus(row) {
  return needsPertimbangan(row) ? 'menunggu_yayasan' : 'disetujui'
}

// Label singkat yang menjelaskan kewenangan/tahap pengajuan ini, dipakai
// di tab Approval supaya jelas kenapa suatu baris muncul/tidak muncul.
function authorityLabel(row) {
  if (row.target_is_manager) return 'Wewenang: Ketua Yayasan / Admin Yayasan-HR (Pasal 10)'
  if (row.is_clty) {
    if (row.status === 'pending') return 'Tahap 1: Pertimbangan Kepala Sekolah/Mudir'
    if (row.status === 'menunggu_yayasan') return 'Tahap 2: Persetujuan Admin Yayasan/HR'
  }
  return null
}

export default function LeaveList() {
  const { isManager, hasFullAccess, employee, loading: authLoading } = useAuth()
  const [tab, setTab] = useState(isManager ? 'Approval / Persetujuan' : 'Pengajuan')
  const [leaveTypes, setLeaveTypes] = useState([])
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [rekapStatusFilter, setRekapStatusFilter] = useState('')
  const [approvalJenisFilter, setApprovalJenisFilter] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [decideRow, setDecideRow] = useState(null)
  const [loadError, setLoadError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    const [{ data: lt }, { data: leave, error: leaveErr }] = await Promise.all([
      supabase.from('leave_types').select('*').order('kategori').order('nama'),
      supabase
        .from('leave_requests')
        .select(`
          *,
          employees!employee_id(nama, school_id, schools!school_id(nama, jenjang)),
          leave_types(nama, kode, kategori),
          approver:approved_by(nama),
          pertimbang:pertimbangan_by(nama),
          target_is_manager:leave_requests_target_is_manager,
          is_clty:leave_requests_is_clty
        `)
        .order('created_at', { ascending: false }),
    ])
    if (leaveErr) setLoadError(leaveErr.message)
    setLeaveTypes(lt || [])
    setRows(leave || [])
    setLoading(false)
  }, [])

  useEffect(() => { if (!authLoading) load() }, [authLoading, load])

  const decide = async (row, status, extra = {}) => {
    const { data: updated, error } = await supabase
      .from('leave_requests')
      .update({ status, ...extra })
      .eq('id', row.id)
      .select('*, leave_types(nama, kode)')
      .single()
    if (error) { alert('Gagal memproses pengajuan: ' + error.message); return }
    if (status === 'disetujui' && updated) {
      await syncAttendanceForApproval(updated)
    }
    load()
  }

  const handleApproveClick = (row) => {
    const target = approveTargetStatus(row)
    // Untuk kode "IS" (Izin Sakit) yang langsung disetujui final, tanyakan
    // dulu apakah Surat Keterangan Dokter sudah dilampirkan — ini menentukan
    // apakah dihitung hadir penuh atau "sakit tanpa SKD" (Pasal 24) saat
    // perhitungan IH. (Izin Sakit tidak pernah berupa Cuti Luar Tanggungan,
    // jadi target selalu 'disetujui' kecuali baris ini milik Kepala
    // Sekolah/Admin Sekolah sendiri — tetap 'disetujui' juga.)
    if (target === 'disetujui' && row.leave_types?.kode === 'IS') {
      setDecideRow(row)
      return
    }
    decide(row, target)
  }

  const myRows = useMemo(() => rows.filter((r) => r.employee_id === employee?.id), [rows, employee])

  const approvalRows = useMemo(() => {
    if (!isManager) return []
    let list = rows.filter((r) => {
      if (r.status === 'pending') return true
      if (r.status === 'menunggu_yayasan') return hasFullAccess // hanya Admin Yayasan/HR yang bisa bertindak di tahap ini
      return false
    })
    if (!hasFullAccess) list = list.filter((r) => !r.target_is_manager)
    if (approvalJenisFilter) list = list.filter((r) => r.leave_types?.kategori === approvalJenisFilter)
    return list
  }, [rows, isManager, hasFullAccess, approvalJenisFilter])

  const rekapRows = useMemo(() => {
    let list = rows
    if (rekapStatusFilter) list = list.filter((r) => r.status === rekapStatusFilter)
    return list
  }, [rows, rekapStatusFilter])

  if (authLoading || loading) return <FullPageSpinner />

  return (
    <div>
      <PageHeader
        title="Cuti & Izin"
        description={isManager ? 'Ajukan, tinjau, dan proses pengajuan cuti/izin sesuai kewenangan.' : 'Ajukan cuti/izin dan pantau statusnya.'}
        actions={
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4" /> Ajukan Cuti
          </Button>
        }
      />

      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-[var(--color-border)]">
        {TABS.filter((t) => t !== 'Approval / Persetujuan' || isManager).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              tab === t ? 'border-[var(--color-navy)] text-[var(--color-navy)]' : 'border-transparent text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]'
            }`}
          >
            {t}
            {t === 'Approval / Persetujuan' && approvalRows.length > 0 && (
              <span className="ml-1.5 rounded-full bg-[var(--color-danger-soft)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--color-danger)]">
                {approvalRows.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {loadError && (
        <Card className="mb-4 border-[var(--color-danger)] bg-[var(--color-danger-soft)]">
          <p className="text-sm text-[var(--color-danger)]">Gagal memuat data: {loadError}</p>
        </Card>
      )}

      {tab === 'Pengajuan' && (
        <Card padded={false}>
          <div className="p-5">
            {myRows.length === 0 ? (
              <EmptyState icon={CalendarClock} title="Belum ada pengajuan" description="Anda belum pernah mengajukan cuti/izin." />
            ) : (
              <Table columns={['Jenis', 'Periode', 'Hari', 'Status', 'Keterangan']}>
                {myRows.map((r) => (
                  <Tr key={r.id}>
                    <Td className="font-medium text-[var(--color-ink)]">{r.leave_types?.nama}</Td>
                    <Td className="text-[var(--color-ink-soft)]">{formatDate(r.tanggal_mulai)} – {formatDate(r.tanggal_selesai)}</Td>
                    <Td>{r.jumlah_hari}</Td>
                    <Td><Badge color={STATUS_BADGE_COLOR[r.status]}>{r.status === 'menunggu_yayasan' ? 'menunggu yayasan' : r.status}</Badge></Td>
                    <Td className="text-xs text-[var(--color-ink-soft)]">{authorityLabel(r) || '—'}</Td>
                  </Tr>
                ))}
              </Table>
            )}
          </div>
        </Card>
      )}

      {tab === 'Approval / Persetujuan' && isManager && (
        <>
          <Card className="mb-4" padded={false}>
            <div className="p-4">
              <Select containerClassName="sm:w-56" value={approvalJenisFilter} onChange={(e) => setApprovalJenisFilter(e.target.value)}>
                <option value="">Semua Jenis</option>
                <option value="cuti">Cuti</option>
                <option value="izin">Izin</option>
              </Select>
            </div>
          </Card>
          <Card padded={false}>
            <div className="p-5">
              {approvalRows.length === 0 ? (
                <EmptyState icon={CalendarClock} title="Tidak ada pengajuan menunggu" description="Tidak ada pengajuan yang perlu diproses sesuai kewenangan Anda saat ini." />
              ) : (
                <Table columns={['Pegawai', 'Jenis', 'Periode', 'Hari', 'Wewenang', 'Aksi']}>
                  {approvalRows.map((r) => (
                    <Tr key={r.id}>
                      <Td className="font-medium text-[var(--color-ink)]">{r.employees?.nama}</Td>
                      <Td>{r.leave_types?.nama}</Td>
                      <Td className="text-[var(--color-ink-soft)]">{formatDate(r.tanggal_mulai)} – {formatDate(r.tanggal_selesai)}</Td>
                      <Td>{r.jumlah_hari}</Td>
                      <Td className="text-xs text-[var(--color-ink-soft)]">{authorityLabel(r) || 'Kepala Sekolah/Mudir'}</Td>
                      <Td>
                        <div className="flex gap-1.5">
                          <button onClick={() => handleApproveClick(r)} className="rounded bg-[var(--color-success-soft)] p-1.5 text-[var(--color-success)] hover:brightness-95" aria-label="Setujui">
                            <Check className="h-4 w-4" />
                          </button>
                          <button onClick={() => decide(r, 'ditolak')} className="rounded bg-[var(--color-danger-soft)] p-1.5 text-[var(--color-danger)] hover:brightness-95" aria-label="Tolak">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </Table>
              )}
            </div>
          </Card>
        </>
      )}

      {tab === 'Rekap & Histori' && (
        <>
          <Card className="mb-4" padded={false}>
            <div className="p-4">
              <Select containerClassName="sm:w-56" value={rekapStatusFilter} onChange={(e) => setRekapStatusFilter(e.target.value)}>
                <option value="">Semua Status</option>
                <option value="pending">Menunggu</option>
                <option value="menunggu_yayasan">Menunggu Yayasan</option>
                <option value="disetujui">Disetujui</option>
                <option value="ditolak">Ditolak</option>
              </Select>
            </div>
          </Card>
          <Card padded={false}>
            <div className="p-5">
              {rekapRows.length === 0 ? (
                <EmptyState icon={History} title="Tidak ada data" description="Belum ada riwayat cuti/izin pada filter ini." />
              ) : (
                <Table columns={isManager ? ['Pegawai', 'Jenis', 'Periode', 'Hari', 'Status', 'Pemberi Izin'] : ['Jenis', 'Periode', 'Hari', 'Status', 'Pemberi Izin']}>
                  {rekapRows.map((r) => (
                    <Tr key={r.id}>
                      {isManager && <Td className="font-medium text-[var(--color-ink)]">{r.employees?.nama}</Td>}
                      <Td>{r.leave_types?.nama}</Td>
                      <Td className="text-[var(--color-ink-soft)]">{formatDate(r.tanggal_mulai)} – {formatDate(r.tanggal_selesai)}</Td>
                      <Td>{r.jumlah_hari}</Td>
                      <Td><Badge color={STATUS_BADGE_COLOR[r.status]}>{r.status === 'menunggu_yayasan' ? 'menunggu yayasan' : r.status}</Badge></Td>
                      <Td className="text-xs text-[var(--color-ink-soft)]">
                        {r.status === 'pending' ? (
                          '—'
                        ) : r.pertimbang?.nama ? (
                          <div className="flex flex-col gap-0.5">
                            <span>Pertimbangan: {r.pertimbang.nama} ({formatDate(r.pertimbangan_at)})</span>
                            {r.status !== 'menunggu_yayasan' && <span>Final: {r.approver?.nama || '—'} ({formatDate(r.approved_at)})</span>}
                          </div>
                        ) : (
                          <span>{r.approver?.nama || '—'} {r.approved_at ? `(${formatDate(r.approved_at)})` : ''}</span>
                        )}
                      </Td>
                    </Tr>
                  ))}
                </Table>
              )}
            </div>
          </Card>
        </>
      )}

      <LeaveRequestModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => { setFormOpen(false); load() }}
        leaveTypes={leaveTypes}
        employeeId={employee?.id}
        isManager={isManager}
      />

      <ApproveSakitModal
        row={decideRow}
        onClose={() => setDecideRow(null)}
        onConfirm={async (dokumenTerlampir) => {
          const row = decideRow
          setDecideRow(null)
          await decide(row, 'disetujui', { dokumen_terlampir: dokumenTerlampir })
        }}
      />
    </div>
  )
}

function ApproveSakitModal({ row, onClose, onConfirm }) {
  const [dokumen, setDokumen] = useState(true)
  useEffect(() => { setDokumen(true) }, [row])
  if (!row) return null
  return (
    <Modal open={!!row} onClose={onClose} title="Setujui Izin Sakit">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-[var(--color-ink-soft)]">
          Pengajuan sakit atas nama <span className="font-medium text-[var(--color-ink)]">{row.employees?.nama}</span> ({formatDate(row.tanggal_mulai)} – {formatDate(row.tanggal_selesai)}).
          Status Surat Keterangan Dokter (SKD) menentukan apakah periode ini dihitung hadir penuh atau tidak untuk Indeks Kehadiran (Pasal 13 & Pasal 24).
        </p>
        <label className="flex items-center gap-2 rounded-[12px] border border-[var(--color-border)] bg-white px-3.5 py-2.5">
          <input type="checkbox" checked={dokumen} onChange={(e) => setDokumen(e.target.checked)} className="h-4 w-4" />
          <span className="text-sm text-[var(--color-ink)]">Surat Keterangan Dokter sudah/akan dilampirkan</span>
        </label>
        {!dokumen && (
          <p className="rounded-md bg-[var(--color-gold-soft)] px-3 py-2 text-xs text-[var(--color-gold)]">
            Tanpa SKD, periode ini akan dihitung sebagai "sakit tanpa SKD" — tidak dihitung hari hadir dan dapat memengaruhi Indeks Kehadiran jika melebihi kuota bulanan.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="button" onClick={() => onConfirm(dokumen)}>Setujui</Button>
        </div>
      </div>
    </Modal>
  )
}

function LeaveRequestModal({ open, onClose, onSaved, leaveTypes, employeeId, isManager }) {
  const [form, setForm] = useState({ leave_type_id: '', tanggal_mulai: '', tanggal_selesai: '', alasan: '', durasi_jam: '' })
  const [employees, setEmployees] = useState([])
  const [targetEmployeeId, setTargetEmployeeId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setForm({ leave_type_id: '', tanggal_mulai: '', tanggal_selesai: '', alasan: '', durasi_jam: '' })
      setError('')
      setTargetEmployeeId(employeeId || '')
      if (isManager) supabase.from('employees').select('id, nama').eq('status', 'aktif').order('nama').then(({ data }) => setEmployees(data || []))
    }
  }, [open, isManager, employeeId])

  const selectedType = leaveTypes.find((lt) => lt.id === form.leave_type_id)
  const isImts = selectedType?.kode === 'IMTS'

  const handleSubmit = async (e) => {
    e.preventDefault()
    const empId = isManager ? targetEmployeeId : employeeId
    if (!empId) { setError('Pilih pegawai terlebih dahulu.'); return }
    if (!form.tanggal_mulai || !form.tanggal_selesai) { setError('Lengkapi tanggal mulai dan selesai.'); return }
    const days = Math.max(1, Math.round((new Date(form.tanggal_selesai) - new Date(form.tanggal_mulai)) / 86400000) + 1)
    setSaving(true)
    const { error: err } = await supabase.from('leave_requests').insert({
      employee_id: empId,
      leave_type_id: form.leave_type_id || null,
      tanggal_mulai: form.tanggal_mulai,
      tanggal_selesai: form.tanggal_selesai,
      jumlah_hari: days,
      alasan: form.alasan,
      durasi_jam: isImts && form.durasi_jam !== '' ? Number(form.durasi_jam) : null,
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title="Ajukan Cuti / Izin">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {isManager && (
          <Select label="Pegawai" required value={targetEmployeeId} onChange={(e) => setTargetEmployeeId(e.target.value)}>
            <option value="">— Pilih Pegawai —</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.nama}</option>)}
          </Select>
        )}
        <Select label="Jenis Cuti/Izin" required value={form.leave_type_id} onChange={(e) => setForm((s) => ({ ...s, leave_type_id: e.target.value }))}>
          <option value="">— Pilih —</option>
          {leaveTypes.filter((lt) => lt.kategori === 'cuti').length > 0 && (
            <optgroup label="Cuti">
              {leaveTypes.filter((lt) => lt.kategori === 'cuti').map((lt) => (
                <option key={lt.id} value={lt.id}>{lt.nama}{lt.jatah_hari_per_tahun ? ` (maks. ${lt.jatah_hari_per_tahun} hari/tahun)` : ''}</option>
              ))}
            </optgroup>
          )}
          {leaveTypes.filter((lt) => lt.kategori === 'izin').length > 0 && (
            <optgroup label="Izin">
              {leaveTypes.filter((lt) => lt.kategori === 'izin').map((lt) => (
                <option key={lt.id} value={lt.id}>{lt.nama}{lt.jatah_per_bulan ? ` (maks. ${lt.jatah_per_bulan}/bulan)` : ''}</option>
              ))}
            </optgroup>
          )}
        </Select>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Tanggal Mulai" type="date" required value={form.tanggal_mulai} onChange={(e) => setForm((s) => ({ ...s, tanggal_mulai: e.target.value }))} />
          <Input label="Tanggal Selesai" type="date" required value={form.tanggal_selesai} onChange={(e) => setForm((s) => ({ ...s, tanggal_selesai: e.target.value }))} />
        </div>
        {isImts && (
          <Input
            label="Durasi Meninggalkan Tugas (jam)"
            type="number" step="0.5" min="0"
            value={form.durasi_jam}
            onChange={(e) => setForm((s) => ({ ...s, durasi_jam: e.target.value }))}
            placeholder="Contoh: 1.5"
          />
        )}
        <Textarea label="Alasan" rows={3} value={form.alasan} onChange={(e) => setForm((s) => ({ ...s, alasan: e.target.value }))} />
        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Mengirim…' : 'Ajukan'}</Button>
        </div>
      </form>
    </Modal>
  )
}
