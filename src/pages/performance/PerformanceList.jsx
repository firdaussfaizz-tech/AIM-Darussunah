import { useEffect, useState, useCallback } from 'react'
import { Star, Plus, Info, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, Card, Select, Button, Table, Tr, Td, Badge, EmptyState, FullPageSpinner, Modal, Input, Textarea } from '../../components/ui'
import { STATUS_BADGE_COLOR } from '../../lib/format'
import { kategoriFromSkor, defaultPeriodeKinerja } from '../../lib/remunerasi'

export default function PerformanceList() {
  const { isManager, employee, loading: authLoading } = useAuth()
  const [periods, setPeriods] = useState([])
  const [periodFilter, setPeriodFilter] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editingRow, setEditingRow] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: p } = await supabase.from('performance_periods').select('*').order('tahun', { ascending: false }).order('semester', { ascending: false })
    setPeriods(p || [])
    let q = supabase.from('performance_reviews').select('*, employees!employee_id(nama), performance_periods(nama, tahun, semester), reviewer:reviewer_id(nama)').order('created_at', { ascending: false })
    if (periodFilter) q = q.eq('period_id', periodFilter)
    const { data: r } = await q
    setRows(r || [])
    setLoading(false)
  }, [periodFilter])

  useEffect(() => { if (!authLoading) load() }, [authLoading, load])

  const handleDelete = async (row) => {
    if (!confirm(`Hapus penilaian draft "${row.employees?.nama}" — ${row.performance_periods?.nama} ${row.performance_periods?.tahun}? Tindakan ini tidak bisa dibatalkan.`)) return
    const { error } = await supabase.from('performance_reviews').delete().eq('id', row.id)
    if (error) { alert('Gagal menghapus: ' + error.message); return }
    load()
  }

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

      {isManager && (
        <Card className="mb-4 border-[var(--color-navy)]/20 bg-[var(--color-navy-50)]">
          <p className="flex items-start gap-2 text-xs text-[var(--color-ink-soft)]">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Penilaian yang disimpan dengan status <strong>Final</strong> otomatis mengisi Indeks Kinerja pegawai tsb untuk periode gaji yang dipilih pada form — inilah angka yang dipakai untuk menghitung Tunjangan Remunerasi. Status Draft tidak memengaruhi gaji.
          </p>
        </Card>
      )}

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
            <Table columns={isManager ? ['Pegawai', 'Periode', 'Nilai Akhir', 'Penilai', 'Status', ''] : ['Periode', 'Nilai Akhir', 'Status']}>
              {rows.map((r) => (
                <Tr key={r.id}>
                  {isManager && <Td className="font-medium text-[var(--color-ink)]">{r.employees?.nama}</Td>}
                  <Td>{r.performance_periods?.nama} {r.performance_periods?.tahun}</Td>
                  <Td className="font-medium">{r.nilai_akhir ?? '—'}</Td>
                  {isManager && <Td className="text-[var(--color-ink-soft)]">{r.reviewer?.nama || '—'}</Td>}
                  <Td><Badge color={STATUS_BADGE_COLOR[r.status]}>{r.status}</Badge></Td>
                  {isManager && (
                    <Td className="text-right">
                      {r.status === 'draft' && (
                        <div className="flex justify-end gap-2">
                          <button onClick={() => setEditingRow(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Ubah penilaian">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button onClick={() => handleDelete(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus penilaian">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </Td>
                  )}
                </Tr>
              ))}
            </Table>
          )}
        </div>
      </Card>

      <PerformanceFormModal
        open={formOpen || !!editingRow}
        editingRow={editingRow}
        onClose={() => { setFormOpen(false); setEditingRow(null) }}
        onSaved={() => { setFormOpen(false); setEditingRow(null); load() }}
        periods={periods}
        defaultReviewerId={employee?.id}
      />
    </div>
  )
}

function PerformanceFormModal({ open, editingRow, onClose, onSaved, periods, defaultReviewerId }) {
  const [employees, setEmployees] = useState([])
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isEdit = !!editingRow

  useEffect(() => {
    if (open) {
      const now = new Date()
      const periodeGaji = defaultPeriodeKinerja(now.getFullYear(), now.getMonth() + 1)
      setForm(editingRow ? {
        employee_id: editingRow.employee_id,
        period_id: editingRow.period_id,
        nilai_kedisiplinan: editingRow.nilai_kedisiplinan,
        nilai_kinerja: editingRow.nilai_kinerja,
        nilai_kerjasama: editingRow.nilai_kerjasama,
        catatan: editingRow.catatan || '',
        status: editingRow.status,
        reviewer_id: editingRow.reviewer_id || defaultReviewerId || '',
        periode_gaji_mulai: periodeGaji.mulai,
        periode_gaji_selesai: periodeGaji.selesai,
      } : {
        employee_id: '', period_id: '', nilai_kedisiplinan: 80, nilai_kinerja: 80, nilai_kerjasama: 80, catatan: '', status: 'draft',
        reviewer_id: defaultReviewerId || '',
        periode_gaji_mulai: periodeGaji.mulai, periode_gaji_selesai: periodeGaji.selesai,
      })
      setError('')
      supabase.from('employees').select('id, nama').eq('status', 'aktif').order('nama').then(({ data }) => setEmployees(data || []))
    }
  }, [open, editingRow, defaultReviewerId])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.employee_id || !form.period_id) { setError('Pilih pegawai dan periode.'); return }
    if (!form.reviewer_id) { setError('Pilih penilai.'); return }
    if (form.status === 'final' && (!form.periode_gaji_mulai || !form.periode_gaji_selesai)) {
      setError('Isi rentang periode gaji yang akan memakai Indeks Kinerja ini.')
      return
    }
    setSaving(true)
    setError('')
    const nilaiAkhir = Number(((Number(form.nilai_kedisiplinan) + Number(form.nilai_kinerja) + Number(form.nilai_kerjasama)) / 3).toFixed(2))
    const { periode_gaji_mulai, periode_gaji_selesai, ...reviewForm } = form
    const { error: err } = isEdit
      ? await supabase.from('performance_reviews').update({ ...reviewForm, nilai_akhir: nilaiAkhir }).eq('id', editingRow.id)
      : await supabase.from('performance_reviews').insert({ ...reviewForm, nilai_akhir: nilaiAkhir })
    if (err) { setSaving(false); setError(err.message.includes('duplicate') ? 'Pegawai ini sudah dinilai pada periode tersebut.' : err.message); return }

    // Status Final → sinkron otomatis ke Indeks Kinerja (angka yang benar-
    // benar dipakai mesin gaji), supaya HR tidak perlu mengisi dua kali di
    // dua tempat berbeda.
    if (form.status === 'final') {
      const kategoriRow = kategoriFromSkor(nilaiAkhir)
      const { error: ikErr } = await supabase.from('performance_index').upsert({
        employee_id: form.employee_id,
        periode_mulai: periode_gaji_mulai,
        periode_selesai: periode_gaji_selesai,
        skor: nilaiAkhir,
        kategori: kategoriRow.kategori,
        indeks_kinerja: kategoriRow.indeks,
      }, { onConflict: 'employee_id,periode_mulai' })
      if (ikErr) alert('Penilaian tersimpan, tetapi gagal menyinkronkan ke Indeks Kinerja (perlu diatur manual di tab Indeks Kehadiran pegawai): ' + ikErr.message)
    }

    setSaving(false)
    onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Ubah Penilaian Kinerja (Draft)' : 'Tambah Penilaian Kinerja'} width="max-w-xl">
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
        <Select label="Penilai" required value={form.reviewer_id || ''} onChange={(e) => setForm((s) => ({ ...s, reviewer_id: e.target.value }))}>
          <option value="">— Pilih —</option>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.nama}</option>)}
        </Select>
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

        {form.status === 'final' && (
          <div className="rounded-[12px] border border-[var(--color-border)] p-4">
            <p className="mb-3 text-[13px] font-medium text-[var(--color-ink)]">Berlaku untuk Periode Gaji</p>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Mulai" type="date" value={form.periode_gaji_mulai || ''} onChange={(e) => setForm((s) => ({ ...s, periode_gaji_mulai: e.target.value }))} />
              <Input label="Sampai Dengan" type="date" value={form.periode_gaji_selesai || ''} onChange={(e) => setForm((s) => ({ ...s, periode_gaji_selesai: e.target.value }))} />
            </div>
            <p className="mt-2 text-xs text-[var(--color-ink-soft)]">Otomatis mengikuti semester berjalan (Pasal 9 Draft SK) — ubah bila periode penilaian ini berbeda. Rentang ini akan mengisi Indeks Kinerja pegawai untuk perhitungan Tunjangan Remunerasi pada bulan-bulan gaji di dalamnya.</p>
          </div>
        )}

        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : isEdit ? 'Simpan Perubahan' : 'Simpan'}</Button>
        </div>
      </form>
    </Modal>
  )
}
