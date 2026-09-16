import { useEffect, useState, useCallback } from 'react'
import { CalendarClock, Plus, Check, X } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, Card, Select, Button, Table, Tr, Td, Badge, EmptyState, FullPageSpinner, Modal, Input, Textarea } from '../../components/ui'
import { STATUS_BADGE_COLOR, formatDate } from '../../lib/format'

export default function LeaveList() {
  const { isManager, employee, loading: authLoading } = useAuth()
  const [leaveTypes, setLeaveTypes] = useState([])
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState(isManager ? 'pending' : '')
  const [formOpen, setFormOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('leave_requests')
      .select('*, employees(nama, schools!school_id(nama, jenjang)), leave_types(nama), approver:approved_by(nama)')
      .order('created_at', { ascending: false })
    if (statusFilter) q = q.eq('status', statusFilter)
    const [{ data: lt }, { data: leave }] = await Promise.all([
      supabase.from('leave_types').select('*').order('nama'),
      q,
    ])
    setLeaveTypes(lt || [])
    setRows(leave || [])
    setLoading(false)
  }, [statusFilter])

  useEffect(() => { if (!authLoading) load() }, [authLoading, load])

  const decide = async (row, status) => {
    await supabase.from('leave_requests').update({ status, approved_at: new Date().toISOString() }).eq('id', row.id)
    load()
  }

  if (authLoading || loading) return <FullPageSpinner />

  return (
    <div>
      <PageHeader
        title={isManager ? 'Pengajuan Cuti & Izin' : 'Cuti & Izin Saya'}
        description={isManager ? 'Tinjau dan proses pengajuan cuti seluruh pegawai.' : 'Ajukan cuti/izin dan pantau statusnya.'}
        actions={
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4" /> Ajukan Cuti
          </Button>
        }
      />

      <Card className="mb-4" padded={false}>
        <div className="p-4">
          <Select containerClassName="sm:w-56" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Semua Status</option>
            <option value="pending">Menunggu</option>
            <option value="disetujui">Disetujui</option>
            <option value="ditolak">Ditolak</option>
          </Select>
        </div>
      </Card>

      <Card padded={false}>
        <div className="p-5">
          {rows.length === 0 ? (
            <EmptyState icon={CalendarClock} title="Tidak ada pengajuan" description="Belum ada pengajuan cuti pada filter ini." />
          ) : (
            <Table columns={isManager ? ['Pegawai', 'Jenis', 'Periode', 'Hari', 'Status', 'Aksi'] : ['Jenis', 'Periode', 'Hari', 'Status']}>
              {rows.map((r) => (
                <Tr key={r.id}>
                  {isManager && <Td className="font-medium text-[var(--color-ink)]">{r.employees?.nama}</Td>}
                  <Td>{r.leave_types?.nama}</Td>
                  <Td className="text-[var(--color-ink-soft)]">{formatDate(r.tanggal_mulai)} – {formatDate(r.tanggal_selesai)}</Td>
                  <Td>{r.jumlah_hari}</Td>
                  <Td><Badge color={STATUS_BADGE_COLOR[r.status]}>{r.status}</Badge></Td>
                  {isManager && (
                    <Td>
                      {r.status === 'pending' ? (
                        <div className="flex gap-1.5">
                          <button onClick={() => decide(r, 'disetujui')} className="rounded bg-[var(--color-success-soft)] p-1.5 text-[var(--color-success)] hover:brightness-95" aria-label="Setujui">
                            <Check className="h-4 w-4" />
                          </button>
                          <button onClick={() => decide(r, 'ditolak')} className="rounded bg-[var(--color-danger-soft)] p-1.5 text-[var(--color-danger)] hover:brightness-95" aria-label="Tolak">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-[var(--color-ink-soft)]">oleh {r.approver?.nama || '—'}</span>
                      )}
                    </Td>
                  )}
                </Tr>
              ))}
            </Table>
          )}
        </div>
      </Card>

      <LeaveRequestModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => { setFormOpen(false); load() }}
        leaveTypes={leaveTypes}
        employeeId={employee?.id}
        isManager={isManager}
      />
    </div>
  )
}

function LeaveRequestModal({ open, onClose, onSaved, leaveTypes, employeeId, isManager }) {
  const [form, setForm] = useState({ leave_type_id: '', tanggal_mulai: '', tanggal_selesai: '', alasan: '' })
  const [employees, setEmployees] = useState([])
  const [targetEmployeeId, setTargetEmployeeId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setForm({ leave_type_id: '', tanggal_mulai: '', tanggal_selesai: '', alasan: '' })
      setError('')
      setTargetEmployeeId(employeeId || '')
      if (isManager) supabase.from('employees').select('id, nama').eq('status', 'aktif').order('nama').then(({ data }) => setEmployees(data || []))
    }
  }, [open, isManager, employeeId])

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
          {leaveTypes.map((lt) => <option key={lt.id} value={lt.id}>{lt.nama}</option>)}
        </Select>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Tanggal Mulai" type="date" required value={form.tanggal_mulai} onChange={(e) => setForm((s) => ({ ...s, tanggal_mulai: e.target.value }))} />
          <Input label="Tanggal Selesai" type="date" required value={form.tanggal_selesai} onChange={(e) => setForm((s) => ({ ...s, tanggal_selesai: e.target.value }))} />
        </div>
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
