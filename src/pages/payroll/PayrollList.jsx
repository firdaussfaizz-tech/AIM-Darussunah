import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wallet, Plus } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, Card, Button, Table, Tr, Td, Badge, EmptyState, FullPageSpinner, Modal, Select, Input } from '../../components/ui'
import { STATUS_BADGE_COLOR, formatRupiah, BULAN } from '../../lib/format'

export default function PayrollList() {
  const { hasFullAccess, employee, loading: authLoading } = useAuth()
  if (authLoading) return <FullPageSpinner />
  return (
    <div>
      <PageHeader title={hasFullAccess ? 'Penggajian' : 'Slip Gaji Saya'} description={hasFullAccess ? 'Kelola periode penggajian bulanan seluruh pegawai.' : 'Riwayat slip gaji Anda.'} />
      {hasFullAccess ? <ManagerPayroll /> : <SelfPayroll employeeId={employee?.id} />}
    </div>
  )
}

function ManagerPayroll() {
  const navigate = useNavigate()
  const [runs, setRuns] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ periode_bulan: new Date().getMonth() + 1, periode_tahun: new Date().getFullYear() })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('payroll_runs').select('*, payroll_details(id)').order('periode_tahun', { ascending: false }).order('periode_bulan', { ascending: false })
    setRuns(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreate = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('payroll_runs').insert({ periode_bulan: Number(form.periode_bulan), periode_tahun: Number(form.periode_tahun) })
    setSaving(false)
    if (err) { setError(err.message.includes('duplicate') ? 'Periode ini sudah dibuat sebelumnya.' : err.message); return }
    setModalOpen(false)
    load()
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setModalOpen(true)}><Plus className="h-4 w-4" /> Buat Periode Baru</Button>
      </div>
      <Card padded={false}>
        <div className="p-5">
          {loading ? (
            <FullPageSpinner />
          ) : runs.length === 0 ? (
            <EmptyState icon={Wallet} title="Belum ada periode penggajian" description="Buat periode penggajian bulanan pertama Anda." />
          ) : (
            <Table columns={['Periode', 'Jumlah Pegawai Diproses', 'Status', '']}>
              {runs.map((r) => (
                <Tr key={r.id} onClick={() => navigate(`/penggajian/${r.id}`)}>
                  <Td className="font-medium text-[var(--color-ink)]">{BULAN[r.periode_bulan - 1]} {r.periode_tahun}</Td>
                  <Td>{r.payroll_details?.length || 0} pegawai</Td>
                  <Td><Badge color={STATUS_BADGE_COLOR[r.status]}>{r.status}</Badge></Td>
                  <Td className="text-right text-sm font-medium text-[var(--color-navy)]">Kelola →</Td>
                </Tr>
              ))}
            </Table>
          )}
        </div>
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Buat Periode Penggajian">
        <form onSubmit={handleCreate} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <Select label="Bulan" value={form.periode_bulan} onChange={(e) => setForm((s) => ({ ...s, periode_bulan: e.target.value }))}>
              {BULAN.map((b, i) => <option key={b} value={i + 1}>{b}</option>)}
            </Select>
            <Input label="Tahun" type="number" value={form.periode_tahun} onChange={(e) => setForm((s) => ({ ...s, periode_tahun: e.target.value }))} />
          </div>
          {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Membuat…' : 'Buat'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

function SelfPayroll({ employeeId }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [detailModal, setDetailModal] = useState(null)

  useEffect(() => {
    if (!employeeId) { setLoading(false); return }
    supabase
      .from('payroll_details')
      .select('*, payroll_runs(periode_bulan, periode_tahun, status)')
      .eq('employee_id', employeeId)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setRows(data || []); setLoading(false) })
  }, [employeeId])

  if (!employeeId) return <EmptyState icon={Wallet} title="Data gaji tidak tersedia" description="Akun Anda belum ditautkan ke data kepegawaian." />
  if (loading) return <FullPageSpinner />

  return (
    <div>
      <Card padded={false}>
        <div className="p-5">
          {rows.length === 0 ? (
            <EmptyState icon={Wallet} title="Belum ada slip gaji" description="Slip gaji akan muncul setelah periode penggajian diproses HR." />
          ) : (
            <Table columns={['Periode', 'Gaji Bersih', 'Status', '']}>
              {rows.map((r) => (
                <Tr key={r.id}>
                  <Td className="font-medium">{BULAN[r.payroll_runs.periode_bulan - 1]} {r.payroll_runs.periode_tahun}</Td>
                  <Td>{formatRupiah(r.gaji_bersih)}</Td>
                  <Td><Badge color={STATUS_BADGE_COLOR[r.payroll_runs.status]}>{r.payroll_runs.status}</Badge></Td>
                  <Td className="text-right">
                    <button onClick={() => setDetailModal(r)} className="text-sm font-medium text-[var(--color-navy)] hover:underline">Lihat Rincian</button>
                  </Td>
                </Tr>
              ))}
            </Table>
          )}
        </div>
      </Card>

      <Modal open={!!detailModal} onClose={() => setDetailModal(null)} title="Rincian Slip Gaji">
        {detailModal && (
          <div className="flex flex-col gap-2 text-sm">
            <Row label="Gaji Pokok" value={formatRupiah(detailModal.gaji_pokok)} />
            <Row label="Total Tunjangan" value={`+${formatRupiah(detailModal.total_tunjangan)}`} />
            <Row label="Total Potongan" value={`-${formatRupiah(detailModal.total_potongan)}`} />
            <div className="my-1 border-t border-[var(--color-border)]" />
            <Row label="Gaji Bersih" value={formatRupiah(detailModal.gaji_bersih)} bold />
          </div>
        )}
      </Modal>
    </div>
  )
}

function Row({ label, value, bold }) {
  return (
    <div className="flex justify-between">
      <span className="text-[var(--color-ink-soft)]">{label}</span>
      <span className={bold ? 'font-semibold text-[var(--color-ink)]' : ''}>{value}</span>
    </div>
  )
}
