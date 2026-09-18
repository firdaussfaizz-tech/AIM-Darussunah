import { useEffect, useState, useCallback } from 'react'
import { Pencil, ClipboardList } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { Card, Button, Badge, Modal } from './ui'
import { formatRupiah } from '../lib/format'

export default function TugasTambahanSection({ employeeId, canManage }) {
  const [master, setMaster] = useState([])
  const [assignedIds, setAssignedIds] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: m }, { data: a }] = await Promise.all([
      supabase.from('tugas_tambahan').select('*').order('nama'),
      supabase.from('employee_tugas_tambahan').select('tugas_tambahan_id').eq('employee_id', employeeId),
    ])
    setMaster(m || [])
    setAssignedIds((a || []).map((r) => r.tugas_tambahan_id))
    setLoading(false)
  }, [employeeId])

  useEffect(() => { load() }, [load])

  const openEdit = () => { setSelectedIds(assignedIds); setError(''); setModalOpen(true) }
  const toggle = (id) => setSelectedIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  const handleSave = async () => {
    setSaving(true)
    setError('')
    const toAdd = selectedIds.filter((id) => !assignedIds.includes(id))
    const toRemove = assignedIds.filter((id) => !selectedIds.includes(id))

    if (toRemove.length) {
      const { error: err } = await supabase.from('employee_tugas_tambahan').delete().eq('employee_id', employeeId).in('tugas_tambahan_id', toRemove)
      if (err) { setSaving(false); setError(err.message); return }
    }
    if (toAdd.length) {
      const { error: err } = await supabase.from('employee_tugas_tambahan').insert(toAdd.map((tugas_tambahan_id) => ({ employee_id: employeeId, tugas_tambahan_id })))
      if (err) { setSaving(false); setError(err.message); return }
    }
    setSaving(false)
    setModalOpen(false)
    load()
  }

  const assigned = master.filter((m) => assignedIds.includes(m.id))
  const totalNominal = assigned.reduce((sum, m) => sum + Number(m.tunjangan_nominal || 0), 0)

  if (loading) return null

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-medium text-[var(--color-ink-soft)]">Tugas Tambahan (Tunjangan Fungsional)</p>
          {assigned.length === 0 ? (
            <p className="mt-1 text-sm text-[var(--color-ink)]">Tidak mengemban tugas tambahan</p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {assigned.map((m) => (
                <Badge key={m.id} color="gold">{m.nama} · {formatRupiah(m.tunjangan_nominal)}</Badge>
              ))}
            </div>
          )}
          {assigned.length > 0 && <p className="mt-2 text-sm font-medium text-[var(--color-ink)]">Total: {formatRupiah(totalNominal)} / bulan</p>}
        </div>
        {canManage && (
          <Button size="sm" variant="outline" onClick={openEdit}>
            <Pencil className="h-4 w-4" /> Ubah
          </Button>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Ubah Tugas Tambahan">
        <div className="flex flex-col gap-4">
          {master.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-[var(--color-ink-soft)]">
              <ClipboardList className="h-4 w-4" /> Belum ada master Tugas Tambahan. Tambahkan dulu di Struktur Organisasi &gt; Tugas Tambahan.
            </p>
          ) : (
            <div className="flex flex-col gap-2.5 max-h-80 overflow-y-auto">
              {master.map((m) => (
                <label key={m.id} className="flex items-center justify-between gap-3 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm">
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(m.id)}
                      onChange={() => toggle(m.id)}
                      className="h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-navy)] focus:ring-[var(--color-navy)]"
                    />
                    {m.nama}
                  </span>
                  <span className="text-[var(--color-ink-soft)]">{formatRupiah(m.tunjangan_nominal)}</span>
                </label>
              ))}
            </div>
          )}
          <p className="text-xs text-[var(--color-ink-soft)]">Boleh memilih lebih dari satu — nominalnya dijumlahkan sebagai Tunjangan Fungsional.</p>
          {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Batal</Button>
            <Button type="button" onClick={handleSave} disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button>
          </div>
        </div>
      </Modal>
    </Card>
  )
}
