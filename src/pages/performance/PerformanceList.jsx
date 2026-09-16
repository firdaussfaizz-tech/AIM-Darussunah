import { useEffect, useState, useCallback } from 'react'
import { Star, Plus } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, Card, Select, Button, Table, Tr, Td, Badge, EmptyState, FullPageSpinner, Modal, Input, Textarea } from '../../components/ui'
import { STATUS_BADGE_COLOR } from '../../lib/format'

export default function PerformanceList() {
  const { isManager, employee, loading: authLoading } = useAuth()
  const [periods, setPeriods] = useState([])
  const [periodFilter, setPeriodFilter] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: p } = await supabase.from('performance_periods').select('*').order('tahun', { ascending: false }).order('semester', { ascending: false })
    setPeriods(p || [])
    let q = supabase.from('performance_reviews').select('*, employees(nama), performance_periods(nama, tahun, semester), reviewer:reviewer_id(nama)').order('created_at', { ascending: false })
    if (periodFilter) q = q.eq('period_id', periodFilter)
    const { data: r } = await q
    setRows(r || [])
    setLoading(false)
  }, [periodFilter])

  useEffect(() => { if (!authLoading) load() }, [authLoading, load])

  if (authLoading || loading) return <FullPageSpinner />

  return (
    <div>
      <PageHeader
        title={isManager ? 'Penilaian Kinerja' : 'Kinerja Saya'}
        description={isManager ? 'Catat hasil penilaian kinerja pegawai per periode.' : 'Riwayat hasil penilaian kinerja Anda.'}
        actions={isManager && (
          <Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" /> Tambah Penilaian</Button>
        )}
      />

      <Card className="mb-4" padded={false}>
        <div className="p-4">
          <Select containerClassName="sm:w-56" value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value)}>
            <option value="">Semua Periode</option>
            {periods.map((p) => <option key={p.id} value={p.id}>{p.nama} {p.tahun}</option>)}
          </Select>
        </div>
      </Card>

      <Card padded={false}>
        <div className="p-5">
          {rows.length === 0 ? (
            <EmptyState icon={Star} title="Belum ada penilaian" description="Belum ada data penilaian kinerja pada periode ini." />
          ) : (
            <Table columns={isManager ? ['Pegawai', 'Periode', 'Nilai Akhir', 'Penilai', 'Status'] : ['Periode', 'Nilai Akhir', 'Status']}>
              {rows.map((r) => (
                <Tr key={r.id}>
                  {isManager && <Td className="font-medium text-[var(--color-ink)]">{r.employees?.nama}</Td>}
                  <Td>{r.performance_periods?.nama} {r.performance_periods?.tahun}</Td>
                  <Td className="font-medium">{r.nilai_akhir ?? '—'}</Td>
                  {isManager && <Td className="text-[var(--color-ink-soft)]">{r.reviewer?.nama || '—'}</Td>}
                  <Td><Badge color={STATUS_BADGE_COLOR[r.status]}>{r.status}</Badge></Td>
                </Tr>
              ))}
            </Table>
          )}
        </div>
      </Card>

      <PerformanceFormModal open={formOpen} onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); load() }} periods={periods} reviewerId={employee?.id} />
    </div>
  )
}

function PerformanceFormModal({ open, onClose, onSaved, periods, reviewerId }) {
  const [employees, setEmployees] = useState([])
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setForm({ employee_id: '', period_id: '', nilai_kedisiplinan: 80, nilai_kinerja: 80, nilai_kerjasama: 80, catatan: '', status: 'draft' })
      setError('')
      supabase.from('employees').select('id, nama').eq('status', 'aktif').order('nama').then(({ data }) => setEmployees(data || []))
    }
  }, [open])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.employee_id || !form.period_id) { setError('Pilih pegawai dan periode.'); return }
    setSaving(true)
    const nilaiAkhir = (Number(form.nilai_kedisiplinan) + Number(form.nilai_kinerja) + Number(form.nilai_kerjasama)) / 3
    const { error: err } = await supabase.from('performance_reviews').insert({ ...form, reviewer_id: reviewerId, nilai_akhir: nilaiAkhir.toFixed(2) })
    setSaving(false)
    if (err) { setError(err.message.includes('duplicate') ? 'Pegawai ini sudah dinilai pada periode tersebut.' : err.message); return }
    onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title="Tambah Penilaian Kinerja" width="max-w-xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <Select label="Pegawai" required value={form.employee_id || ''} onChange={(e) => setForm((s) => ({ ...s, employee_id: e.target.value }))}>
            <option value="">— Pilih —</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.nama}</option>)}
          </Select>
          <Select label="Periode" required value={form.period_id || ''} onChange={(e) => setForm((s) => ({ ...s, period_id: e.target.value }))}>
            <option value="">— Pilih —</option>
            {periods.map((p) => <option key={p.id} value={p.id}>{p.nama} {p.tahun}</option>)}
          </Select>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Input label="Kedisiplinan" type="number" min={1} max={100} value={form.nilai_kedisiplinan ?? ''} onChange={(e) => setForm((s) => ({ ...s, nilai_kedisiplinan: e.target.value }))} />
          <Input label="Kinerja" type="number" min={1} max={100} value={form.nilai_kinerja ?? ''} onChange={(e) => setForm((s) => ({ ...s, nilai_kinerja: e.target.value }))} />
          <Input label="Kerja Sama" type="number" min={1} max={100} value={form.nilai_kerjasama ?? ''} onChange={(e) => setForm((s) => ({ ...s, nilai_kerjasama: e.target.value }))} />
        </div>
        <Textarea label="Catatan" rows={3} value={form.catatan || ''} onChange={(e) => setForm((s) => ({ ...s, catatan: e.target.value }))} />
        <Select label="Status" value={form.status || 'draft'} onChange={(e) => setForm((s) => ({ ...s, status: e.target.value }))}>
          <option value="draft">Draft</option>
          <option value="final">Final</option>
        </Select>
        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button>
        </div>
      </form>
    </Modal>
  )
}
