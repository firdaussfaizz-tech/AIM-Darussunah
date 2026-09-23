import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { GraduationCap, Plus } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, Card, Button, Table, Tr, Td, Badge, EmptyState, FullPageSpinner, Modal, Input, Select, Textarea } from '../../components/ui'
import { STATUS_BADGE_COLOR, formatDate } from '../../lib/format'

export default function TrainingList() {
  const { hasFullAccess, employee, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [sp] = useSearchParams()
  const asManager = hasFullAccess && sp.get('me') !== '1'
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)

  // Halaman "Kelola" (detail pelatihan) dibatasi RequireFullAccess (App.jsx),
  // jadi tabel manajer di sini juga hanya untuk hasFullAccess (admin_yayasan/
  // HR) — Kepala Sekolah/Admin Sekolah (isManager tapi bukan hasFullAccess)
  // sebelumnya melihat tombol "Kelola" yang selalu berujung "Akses terbatas".
  // Mereka sekarang melihat riwayat pelatihan mereka sendiri seperti pegawai lain.
  const load = useCallback(async () => {
    setLoading(true)
    if (asManager) {
      const { data } = await supabase.from('trainings').select('*, training_participants(id)').order('tanggal_mulai', { ascending: false })
      setRows(data || [])
    } else if (employee?.id) {
      const { data } = await supabase.from('training_participants').select('*, trainings(*)').eq('employee_id', employee.id).order('id', { ascending: false })
      setRows(data || [])
    } else {
      setRows([])
    }
    setLoading(false)
  }, [asManager, employee])

  useEffect(() => { if (!authLoading) load() }, [authLoading, load])

  if (authLoading || loading) return <FullPageSpinner />

  return (
    <div>
      <PageHeader
        title={asManager ? 'Pelatihan & Pengembangan' : 'Pelatihan Saya'}
        description={asManager ? 'Kelola program pelatihan dan pengembangan SDM.' : 'Riwayat pelatihan yang Anda ikuti.'}
        actions={asManager && (
          <Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" /> Buat Pelatihan</Button>
        )}
      />

      <Card padded={false}>
        <div className="p-5">
          {rows.length === 0 ? (
            <EmptyState icon={GraduationCap} title="Belum ada pelatihan" description={asManager ? 'Buat program pelatihan pertama Anda.' : 'Anda belum terdaftar pada pelatihan apa pun.'} />
          ) : asManager ? (
            <Table columns={['Nama Pelatihan', 'Jenis', 'Tanggal', 'Peserta', '']}>
              {rows.map((t) => (
                <Tr key={t.id} onClick={() => navigate(`/pelatihan/${t.id}`)}>
                  <Td className="font-medium text-[var(--color-ink)]">{t.nama_pelatihan}</Td>
                  <Td className="capitalize">{t.jenis}</Td>
                  <Td className="text-[var(--color-ink-soft)]">{formatDate(t.tanggal_mulai)}</Td>
                  <Td>{t.training_participants?.length || 0}</Td>
                  <Td className="text-right text-sm font-medium text-[var(--color-navy)]">Kelola →</Td>
                </Tr>
              ))}
            </Table>
          ) : (
            <Table columns={['Nama Pelatihan', 'Tanggal', 'Lokasi', 'Status']}>
              {rows.map((r) => (
                <Tr key={r.id}>
                  <Td className="font-medium text-[var(--color-ink)]">{r.trainings?.nama_pelatihan}</Td>
                  <Td className="text-[var(--color-ink-soft)]">{formatDate(r.trainings?.tanggal_mulai)}</Td>
                  <Td>{r.trainings?.lokasi || '—'}</Td>
                  <Td><Badge color={STATUS_BADGE_COLOR[r.status]}>{r.status}</Badge></Td>
                </Tr>
              ))}
            </Table>
          )}
        </div>
      </Card>

      <TrainingFormModal open={formOpen} onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); load() }} />
    </div>
  )
}

function TrainingFormModal({ open, onClose, onSaved }) {
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) setForm({ nama_pelatihan: '', penyelenggara: '', jenis: 'internal', tanggal_mulai: '', tanggal_selesai: '', lokasi: '', deskripsi: '' })
  }, [open])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('trainings').insert(form)
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title="Buat Program Pelatihan" width="max-w-xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input label="Nama Pelatihan" required value={form.nama_pelatihan || ''} onChange={(e) => setForm((s) => ({ ...s, nama_pelatihan: e.target.value }))} />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Penyelenggara" value={form.penyelenggara || ''} onChange={(e) => setForm((s) => ({ ...s, penyelenggara: e.target.value }))} />
          <Select label="Jenis" value={form.jenis || 'internal'} onChange={(e) => setForm((s) => ({ ...s, jenis: e.target.value }))}>
            <option value="internal">Internal</option>
            <option value="eksternal">Eksternal</option>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Tanggal Mulai" type="date" value={form.tanggal_mulai || ''} onChange={(e) => setForm((s) => ({ ...s, tanggal_mulai: e.target.value }))} />
          <Input label="Tanggal Selesai" type="date" value={form.tanggal_selesai || ''} onChange={(e) => setForm((s) => ({ ...s, tanggal_selesai: e.target.value }))} />
        </div>
        <Input label="Lokasi" value={form.lokasi || ''} onChange={(e) => setForm((s) => ({ ...s, lokasi: e.target.value }))} />
        <Textarea label="Deskripsi" rows={3} value={form.deskripsi || ''} onChange={(e) => setForm((s) => ({ ...s, deskripsi: e.target.value }))} />
        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button>
        </div>
      </form>
    </Modal>
  )
}
