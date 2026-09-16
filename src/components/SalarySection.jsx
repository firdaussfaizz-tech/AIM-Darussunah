import { useEffect, useState } from 'react'
import { Plus, Wallet } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { SectionCard, Table, Tr, Td, Button, Modal, Input, EmptyState } from './ui'
import { formatRupiah, formatDate } from '../lib/format'

const FIELDS = [
  { name: 'gaji_pokok', label: 'Gaji Pokok' },
  { name: 'tunjangan_jabatan', label: 'Tunjangan Jabatan' },
  { name: 'tunjangan_transport', label: 'Tunjangan Transport' },
  { name: 'tunjangan_makan', label: 'Tunjangan Makan' },
  { name: 'tunjangan_lainnya', label: 'Tunjangan Lainnya' },
  { name: 'potongan_bpjs', label: 'Potongan BPJS' },
  { name: 'potongan_lainnya', label: 'Potongan Lainnya' },
]

export default function SalarySection({ employeeId, canManage }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('employee_salary').select('*').eq('employee_id', employeeId).order('berlaku_sejak', { ascending: false })
    setRows(data || [])
    setLoading(false)
  }

  useEffect(() => { if (employeeId) load() }, [employeeId])

  const openModal = () => {
    const initial = { berlaku_sejak: new Date().toISOString().slice(0, 10) }
    FIELDS.forEach((f) => { initial[f.name] = 0 })
    setForm(initial)
    setError('')
    setModalOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    const { error: err } = await supabase.from('employee_salary').insert({ ...form, employee_id: employeeId })
    setSaving(false)
    if (err) { setError(err.message); return }
    setModalOpen(false)
    load()
  }

  if (!canManage) {
    // Pegawai hanya melihat komponen gaji berlaku terkini, tanpa opsi ubah.
  }

  return (
    <SectionCard
      title="Komponen Gaji"
      description="Riwayat komponen gaji pokok, tunjangan, dan potongan"
      actions={canManage && (
        <Button size="sm" variant="outline" onClick={openModal}>
          <Plus className="h-4 w-4" /> Perbarui Gaji
        </Button>
      )}
    >
      {loading ? (
        <p className="text-sm text-[var(--color-ink-soft)]">Memuat…</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={Wallet} title="Belum ada data gaji" description="Komponen gaji belum diatur untuk pegawai ini." />
      ) : (
        <Table columns={['Berlaku Sejak', 'Gaji Pokok', 'Total Tunjangan', 'Total Potongan', 'Estimasi Bersih']}>
          {rows.map((r) => {
            const totalTunjangan = r.tunjangan_jabatan + r.tunjangan_transport + r.tunjangan_makan + r.tunjangan_lainnya
            const totalPotongan = r.potongan_bpjs + r.potongan_lainnya
            return (
              <Tr key={r.id}>
                <Td>{formatDate(r.berlaku_sejak)}</Td>
                <Td>{formatRupiah(r.gaji_pokok)}</Td>
                <Td className="text-[var(--color-success)]">+{formatRupiah(totalTunjangan)}</Td>
                <Td className="text-[var(--color-danger)]">-{formatRupiah(totalPotongan)}</Td>
                <Td className="font-medium">{formatRupiah(r.gaji_pokok + totalTunjangan - totalPotongan)}</Td>
              </Tr>
            )
          })}
        </Table>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Perbarui Komponen Gaji" width="max-w-xl">
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Berlaku Sejak" type="date" required containerClassName="sm:col-span-2" value={form.berlaku_sejak || ''} onChange={(e) => setForm((s) => ({ ...s, berlaku_sejak: e.target.value }))} />
          {FIELDS.map((f) => (
            <Input
              key={f.name}
              label={f.label}
              type="number"
              min={0}
              value={form[f.name] ?? 0}
              onChange={(e) => setForm((s) => ({ ...s, [f.name]: Number(e.target.value) }))}
            />
          ))}
          {error && <p className="sm:col-span-2 rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button>
          </div>
        </form>
      </Modal>
    </SectionCard>
  )
}
