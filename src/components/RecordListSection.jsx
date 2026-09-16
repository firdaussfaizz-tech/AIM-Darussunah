import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { SectionCard, Table, Tr, Td, Button, Modal, Input, Select, EmptyState } from './ui'

export default function RecordListSection({ title, description, table, employeeId, canManage, columns, formFields, emptyIcon }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from(table).select('*').eq('employee_id', employeeId).order('created_at', { ascending: false })
    setRows(data || [])
    setLoading(false)
  }

  useEffect(() => {
    if (employeeId) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId, table])

  const openModal = () => {
    const initial = {}
    formFields.forEach((f) => { initial[f.name] = '' })
    setForm(initial)
    setError('')
    setModalOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    const { error: err } = await supabase.from(table).insert({ ...form, employee_id: employeeId })
    setSaving(false)
    if (err) { setError(err.message); return }
    setModalOpen(false)
    load()
  }

  const handleDelete = async (id) => {
    if (!confirm('Hapus data ini?')) return
    await supabase.from(table).delete().eq('id', id)
    load()
  }

  return (
    <SectionCard
      title={title}
      description={description}
      actions={canManage && (
        <Button size="sm" variant="outline" onClick={openModal}>
          <Plus className="h-4 w-4" /> Tambah
        </Button>
      )}
    >
      {loading ? (
        <p className="text-sm text-[var(--color-ink-soft)]">Memuat…</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={emptyIcon} title="Belum ada data" description="Data akan muncul di sini setelah ditambahkan." />
      ) : (
        <Table columns={[...columns.map((c) => c.label), canManage ? '' : null].filter(Boolean)}>
          {rows.map((r) => (
            <Tr key={r.id}>
              {columns.map((c) => (
                <Td key={c.key}>{r[c.key] ?? '—'}</Td>
              ))}
              {canManage && (
                <Td className="text-right">
                  <button onClick={() => handleDelete(r.id)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </Td>
              )}
            </Tr>
          ))}
        </Table>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={`Tambah ${title}`}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {formFields.map((f) =>
            f.type === 'select' ? (
              <Select key={f.name} label={f.label} required={f.required} value={form[f.name] || ''} onChange={(e) => setForm((s) => ({ ...s, [f.name]: e.target.value }))}>
                <option value="">— Pilih —</option>
                {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </Select>
            ) : (
              <Input
                key={f.name}
                label={f.label}
                type={f.type || 'text'}
                required={f.required}
                placeholder={f.placeholder}
                value={form[f.name] || ''}
                onChange={(e) => setForm((s) => ({ ...s, [f.name]: e.target.value }))}
              />
            )
          )}
          {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button>
          </div>
        </form>
      </Modal>
    </SectionCard>
  )
}
