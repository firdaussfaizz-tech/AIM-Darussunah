import { useEffect, useState, useCallback } from 'react'
import { Plus, Pencil, Trash2, Printer, FileText, Award } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { SectionCard, Button, Badge, Table, Tr, Td, FullPageSpinner, EmptyState, StatCard } from '../../components/ui'
import { formatDate } from '../../lib/format'
import { TINGKAT_LABEL, TINGKAT_BADGE, KATEGORI_LABEL } from '../../lib/prestasi'
import PrestasiFormModal from '../kesiswaan/PrestasiFormModal'

export default function StudentPrestasiTab({ siswa }) {
  const { isManager, employee } = useAuth()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // 'new' | row | null

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('prestasi_siswa').select('*').eq('siswa_id', siswa.id).order('tanggal', { ascending: false, nullsFirst: false })
    setRows(data || [])
    setLoading(false)
  }, [siswa.id])
  useEffect(() => { load() }, [load])

  const handleDelete = async (r) => {
    if (!confirm(`Hapus prestasi "${r.judul}"?`)) return
    const { error } = await supabase.from('prestasi_siswa').delete().eq('id', r.id)
    if (error) { alert('Gagal: ' + error.message); return }
    load()
  }

  if (loading) return <FullPageSpinner />

  const totalPoin = rows.reduce((s, r) => s + Number(r.poin || 0), 0)

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Jumlah Prestasi" value={rows.length} accent="navy" />
        <StatCard label="Total Poin" value={totalPoin} accent="gold" />
        <StatCard label="Tingkat Tertinggi" value={rows.length ? (TINGKAT_LABEL[rows.slice().sort((a, b) => (b.poin - a.poin))[0].tingkat] || '—') : '—'} />
      </div>

      <SectionCard
        title="Prestasi Siswa"
        description="Terotomasi: poin dihitung dari tingkat & capaian, dan ikut rekap KPI/analitik lembaga."
        actions={(
          <div className="flex gap-2">
            {rows.length > 0 && <Button size="sm" variant="outline" onClick={() => window.open(`/kesiswaan/prestasi/lampiran/${siswa.id}`, '_blank')}><FileText className="h-4 w-4" /> Cetak Lampiran</Button>}
            {isManager && <Button size="sm" onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> Tambah</Button>}
          </div>
        )}
      >
        {rows.length === 0 ? <EmptyState icon={Award} title="Belum ada prestasi" description="Catat prestasi siswa ini." /> : (
          <Table columns={['Judul', 'Kategori', 'Bidang', 'Tingkat', 'Capaian', 'Poin', 'Tanggal', '']}>
            {rows.map((r) => (
              <Tr key={r.id}>
                <Td className="font-medium">{r.judul}</Td>
                <Td className="text-xs">{KATEGORI_LABEL[r.kategori]}</Td>
                <Td className="text-xs text-[var(--color-ink-soft)]">{r.bidang || '—'}</Td>
                <Td><Badge color={TINGKAT_BADGE[r.tingkat]}>{TINGKAT_LABEL[r.tingkat]}</Badge></Td>
                <Td className="text-xs">{r.peringkat || '—'}</Td>
                <Td>{r.poin}</Td>
                <Td className="text-xs text-[var(--color-ink-soft)]">{r.tanggal ? formatDate(r.tanggal) : '—'}</Td>
                <Td>
                  <div className="flex justify-end gap-1.5">
                    <button onClick={() => window.open(`/kesiswaan/prestasi/piagam/${r.id}`, '_blank')} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Piagam"><Printer className="h-4 w-4" /></button>
                    {isManager && <button onClick={() => setEditing(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Ubah"><Pencil className="h-4 w-4" /></button>}
                    {isManager && <button onClick={() => handleDelete(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus"><Trash2 className="h-4 w-4" /></button>}
                  </div>
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </SectionCard>

      {editing && (
        <PrestasiFormModal
          open={!!editing}
          entry={editing}
          siswaFixed={editing === 'new' ? { id: siswa.id, nama_lengkap: siswa.nama_lengkap } : undefined}
          employeeId={employee?.id}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
    </div>
  )
}
