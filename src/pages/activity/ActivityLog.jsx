import { useEffect, useState, useCallback } from 'react'
import { History, Eye } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { PageHeader, Card, Table, Tr, Td, Badge, EmptyState, FullPageSpinner, Modal, Select } from '../../components/ui'
import { formatDate } from '../../lib/format'

const TABLE_LABELS = {
  payroll_details: 'Slip Gaji',
  employees: 'Data Pegawai (Golongan)',
  employee_tugas_tambahan: 'Tugas Tambahan',
  performance_index: 'Indeks Kinerja',
}

const ACTION_BADGE = { INSERT: 'success', UPDATE: 'gold', DELETE: 'danger' }
const ACTION_LABEL = { INSERT: 'Dibuat', UPDATE: 'Diubah', DELETE: 'Dihapus' }

function formatWaktu(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
}

// Bandingkan old_data vs new_data, kembalikan hanya kolom yang benar-benar
// berubah (mengabaikan kolom teknis seperti id/created_at/updated_at yang
// selalu ikut berubah tapi tidak berarti apa-apa bagi admin yang membaca log).
const IGNORED_KEYS = new Set(['id', 'created_at', 'updated_at'])
function diffFields(oldData, newData) {
  // Selalu kembalikan triple [key, oldVal, newVal] — untuk INSERT oldVal
  // kosong, untuk DELETE newVal kosong, supaya pemanggil tidak perlu tahu
  // aksi apa yang terjadi untuk membaca nilainya dengan benar.
  if (!oldData) return Object.entries(newData || {}).filter(([k]) => !IGNORED_KEYS.has(k)).map(([k, v]) => [k, undefined, v])
  if (!newData) return Object.entries(oldData).filter(([k]) => !IGNORED_KEYS.has(k)).map(([k, v]) => [k, v, undefined])
  const keys = new Set([...Object.keys(oldData), ...Object.keys(newData)])
  const out = []
  keys.forEach((k) => {
    if (IGNORED_KEYS.has(k)) return
    const ov = JSON.stringify(oldData[k])
    const nv = JSON.stringify(newData[k])
    if (ov !== nv) out.push([k, oldData[k], newData[k]])
  })
  return out
}

export default function ActivityLog() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [tableFilter, setTableFilter] = useState('')
  const [detailRow, setDetailRow] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('activity_log')
      .select('*, employees(nama)')
      .order('changed_at', { ascending: false })
      .limit(200)
    if (tableFilter) query = query.eq('table_name', tableFilter)
    const { data, error } = await query
    if (error) { alert('Gagal memuat log aktivitas: ' + error.message); setRows([]); setLoading(false); return }
    setRows(data || [])
    setLoading(false)
  }, [tableFilter])

  useEffect(() => { load() }, [load])

  return (
    <div>
      <PageHeader
        title="Log Aktivitas"
        description="Riwayat perubahan pada data yang berdampak ke gaji — Golongan, Tugas Tambahan, Indeks Kinerja, dan slip gaji. 200 perubahan terbaru."
        actions={
          <Select value={tableFilter} onChange={(e) => setTableFilter(e.target.value)} containerClassName="w-56">
            <option value="">Semua Jenis Data</option>
            {Object.entries(TABLE_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </Select>
        }
      />

      <Card padded={false}>
        <div className="p-5">
          {loading ? (
            <FullPageSpinner />
          ) : rows.length === 0 ? (
            <EmptyState icon={History} title="Belum ada aktivitas tercatat" description="Perubahan pada Golongan, Tugas Tambahan, Indeks Kinerja, dan slip gaji akan muncul di sini." />
          ) : (
            <Table columns={['Waktu', 'Jenis Data', 'Aksi', 'Pegawai Terkait', 'Diubah Oleh', '']}>
              {rows.map((r) => (
                <Tr key={r.id}>
                  <Td className="whitespace-nowrap text-[var(--color-ink-soft)]">{formatWaktu(r.changed_at)}</Td>
                  <Td className="font-medium text-[var(--color-ink)]">{TABLE_LABELS[r.table_name] || r.table_name}</Td>
                  <Td><Badge color={ACTION_BADGE[r.action] || 'neutral'}>{ACTION_LABEL[r.action] || r.action}</Badge></Td>
                  <Td>{r.employees?.nama || '—'}</Td>
                  <Td className="text-[var(--color-ink-soft)]">{r.changed_by_email || '—'}</Td>
                  <Td className="text-right">
                    <button onClick={() => setDetailRow(r)} className="text-[var(--color-navy)] hover:text-[var(--color-navy-light)]" aria-label="Lihat rincian">
                      <Eye className="h-4 w-4" />
                    </button>
                  </Td>
                </Tr>
              ))}
            </Table>
          )}
        </div>
      </Card>

      <Modal open={!!detailRow} onClose={() => setDetailRow(null)} title="Rincian Perubahan">
        {detailRow && <ActivityDetailBody row={detailRow} />}
      </Modal>
    </div>
  )
}

function ActivityDetailBody({ row }) {
  const fields = diffFields(row.old_data, row.new_data)
  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="grid grid-cols-2 gap-3 text-xs text-[var(--color-ink-soft)]">
        <div><span className="font-medium text-[var(--color-ink)]">Jenis Data:</span> {TABLE_LABELS[row.table_name] || row.table_name}</div>
        <div><span className="font-medium text-[var(--color-ink)]">Aksi:</span> {ACTION_LABEL[row.action] || row.action}</div>
        <div><span className="font-medium text-[var(--color-ink)]">Waktu:</span> {formatWaktu(row.changed_at)}</div>
        <div><span className="font-medium text-[var(--color-ink)]">Diubah Oleh:</span> {row.changed_by_email || '—'}</div>
        {row.employees?.nama && <div className="col-span-2"><span className="font-medium text-[var(--color-ink)]">Pegawai Terkait:</span> {row.employees.nama}</div>}
      </div>

      {fields.length === 0 ? (
        <p className="text-[var(--color-ink-soft)]">Tidak ada kolom yang berubah (hanya kolom teknis seperti id/waktu).</p>
      ) : (
        <div className="flex flex-col gap-2">
          {fields.map(([key, oldVal, newVal]) => (
            <div key={key} className="rounded-md border border-[var(--color-border)] p-2.5">
              <p className="text-xs font-medium text-[var(--color-ink-soft)]">{key}</p>
              {row.action === 'UPDATE' ? (
                <p className="mt-0.5">
                  <span className="text-[var(--color-danger)] line-through">{String(oldVal ?? '—')}</span>
                  {' → '}
                  <span className="font-medium text-[var(--color-success)]">{String(newVal ?? '—')}</span>
                </p>
              ) : (
                <p className="mt-0.5 text-[var(--color-ink)]">{String((row.action === 'DELETE' ? oldVal : newVal) ?? '—')}</p>
              )}

            </div>
          ))}
        </div>
      )}
    </div>
  )
}
