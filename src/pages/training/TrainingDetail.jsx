import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { PageHeader, Card, SectionCard, Button, Table, Tr, Td, Select, Badge, EmptyState, FullPageSpinner, Modal } from '../../components/ui'
import { STATUS_BADGE_COLOR, formatDate } from '../../lib/format'

const PARTICIPANT_STATUS = ['terdaftar', 'hadir', 'selesai', 'tidak_hadir']

export default function TrainingDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [training, setTraining] = useState(null)
  const [participants, setParticipants] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [employees, setEmployees] = useState([])
  const [selectedEmployee, setSelectedEmployee] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: t }, { data: p }] = await Promise.all([
      supabase.from('trainings').select('*').eq('id', id).maybeSingle(),
      supabase.from('training_participants').select('*, employees(nama, schools(nama, jenjang))').eq('training_id', id),
    ])
    setTraining(t)
    setParticipants(p || [])
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  const openAddModal = () => {
    setSelectedEmployee('')
    supabase.from('employees').select('id, nama').eq('status', 'aktif').order('nama').then(({ data }) => setEmployees(data || []))
    setModalOpen(true)
  }

  const handleAddParticipant = async (e) => {
    e.preventDefault()
    if (!selectedEmployee) return
    await supabase.from('training_participants').insert({ training_id: id, employee_id: selectedEmployee })
    setModalOpen(false)
    load()
  }

  const updateStatus = async (participantId, status) => {
    await supabase.from('training_participants').update({ status }).eq('id', participantId)
    load()
  }

  const removeParticipant = async (participantId) => {
    if (!confirm('Hapus peserta ini dari pelatihan?')) return
    await supabase.from('training_participants').delete().eq('id', participantId)
    load()
  }

  if (loading) return <FullPageSpinner />
  if (!training) return <EmptyState title="Pelatihan tidak ditemukan" />

  const registeredIds = new Set(participants.map((p) => p.employee_id))

  return (
    <div>
      <button onClick={() => navigate('/pelatihan')} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]">
        <ArrowLeft className="h-4 w-4" /> Kembali ke Daftar Pelatihan
      </button>
      <PageHeader
        title={training.nama_pelatihan}
        description={`${training.penyelenggara || 'Penyelenggara belum diisi'} · ${formatDate(training.tanggal_mulai)}${training.lokasi ? ` · ${training.lokasi}` : ''}`}
      />

      {training.deskripsi && <Card className="mb-6"><p className="text-sm text-[var(--color-ink)]">{training.deskripsi}</p></Card>}

      <SectionCard
        title="Peserta"
        description={`${participants.length} pegawai terdaftar`}
        actions={<Button size="sm" variant="outline" onClick={openAddModal}><Plus className="h-4 w-4" /> Tambah Peserta</Button>}
      >
        {participants.length === 0 ? (
          <EmptyState title="Belum ada peserta" description="Tambahkan pegawai yang akan mengikuti pelatihan ini." />
        ) : (
          <Table columns={['Nama', 'Unit', 'Status', '']}>
            {participants.map((p) => (
              <Tr key={p.id}>
                <Td className="font-medium text-[var(--color-ink)]">{p.employees?.nama}</Td>
                <Td className="text-[var(--color-ink-soft)]">{p.employees?.schools ? `${p.employees.schools.jenjang} — ${p.employees.schools.nama}` : '—'}</Td>
                <Td>
                  <Select value={p.status} onChange={(e) => updateStatus(p.id, e.target.value)} className="w-40 py-1.5 text-xs">
                    {PARTICIPANT_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </Select>
                </Td>
                <Td className="text-right">
                  <button onClick={() => removeParticipant(p.id)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </SectionCard>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Tambah Peserta Pelatihan">
        <form onSubmit={handleAddParticipant} className="flex flex-col gap-4">
          <Select label="Pegawai" required value={selectedEmployee} onChange={(e) => setSelectedEmployee(e.target.value)}>
            <option value="">— Pilih Pegawai —</option>
            {employees.filter((e) => !registeredIds.has(e.id)).map((e) => <option key={e.id} value={e.id}>{e.nama}</option>)}
          </Select>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Batal</Button>
            <Button type="submit">Tambahkan</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
