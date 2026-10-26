import { useEffect, useState, useCallback, useMemo } from 'react'
import { Plus, Pencil, Trash2, Printer, Award, Search } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, SectionCard, Card, Button, Badge, Table, Tr, Td, Select, FullPageSpinner, EmptyState, StatCard } from '../../components/ui'
import { formatDate } from '../../lib/format'
import { useAutoRefresh } from '../../lib/useAutoRefresh'
import { KATEGORI_OPTIONS, KATEGORI_LABEL, TINGKAT_OPTIONS, TINGKAT_LABEL, TINGKAT_BADGE } from '../../lib/prestasi'
import PrestasiFormModal from './PrestasiFormModal'

export default function PrestasiList() {
  const { isManager, employee } = useAuth()
  const [rows, setRows] = useState([])
  const [schools, setSchools] = useState([])
  const [taList, setTaList] = useState([])
  const [loading, setLoading] = useState(true)
  const [fSchool, setFSchool] = useState('')
  const [fTa, setFTa] = useState('')
  const [fTingkat, setFTingkat] = useState('')
  const [fKategori, setFKategori] = useState('')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState(null)

  useEffect(() => {
    Promise.all([
      supabase.from('schools').select('id, nama, jenjang').order('jenjang'),
      supabase.from('tahun_ajaran').select('id, nama, status').order('nama', { ascending: false }),
    ]).then(([{ data: s }, { data: t }]) => { setSchools(s || []); setTaList(t || []) })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('prestasi_siswa')
      .select('*, siswa!siswa_id(id, nama_lengkap, school_id, schools!school_id(nama, jenjang)), tahun_ajaran(nama)')
      .order('tanggal', { ascending: false, nullsFirst: false })
    setRows(data || [])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])
  useAutoRefresh('prestasi_siswa', load)

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (fSchool && r.siswa?.school_id !== fSchool) return false
      if (fTa && r.tahun_ajaran_id !== fTa) return false
      if (fTingkat && r.tingkat !== fTingkat) return false
      if (fKategori && r.kategori !== fKategori) return false
      if (s && !(`${r.judul} ${r.siswa?.nama_lengkap || ''} ${r.bidang || ''}`.toLowerCase().includes(s))) return false
      return true
    })
  }, [rows, fSchool, fTa, fTingkat, fKategori, q])

  const totalPoin = filtered.reduce((a, r) => a + Number(r.poin || 0), 0)
  const akademik = filtered.filter((r) => r.kategori === 'akademik').length
  const nasPlus = filtered.filter((r) => ['nasional', 'internasional'].includes(r.tingkat)).length

  const handleDelete = async (r) => {
    if (!confirm(`Hapus prestasi "${r.judul}"?`)) return
    const { error } = await supabase.from('prestasi_siswa').delete().eq('id', r.id)
    if (error) { alert('Gagal: ' + error.message); return }
    load()
  }

  return (
    <div>
      <PageHeader title="Prestasi Siswa" description="Catat & pantau prestasi seluruh siswa. Poin otomatis dari tingkat & capaian; ikut rekap analitik/KPI lembaga."
        actions={isManager && <Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> Tambah Prestasi</Button>} />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Jumlah Prestasi" value={filtered.length} accent="navy" />
        <StatCard label="Total Poin" value={totalPoin} accent="gold" />
        <StatCard label="Akademik" value={`${akademik} / ${filtered.length}`} />
        <StatCard label="Nasional+" value={nasPlus} accent="success" />
      </div>

      <Card className="mb-4" padded={false}>
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-end">
          <Select containerClassName="sm:w-52" label="Unit Sekolah" value={fSchool} onChange={(e) => setFSchool(e.target.value)}>
            <option value="">Semua Unit</option>
            {schools.map((s) => <option key={s.id} value={s.id}>{s.jenjang} — {s.nama}</option>)}
          </Select>
          <Select containerClassName="sm:w-44" label="Tahun Ajaran" value={fTa} onChange={(e) => setFTa(e.target.value)}>
            <option value="">Semua TA</option>
            {taList.map((t) => <option key={t.id} value={t.id}>{t.nama}</option>)}
          </Select>
          <Select containerClassName="sm:w-40" label="Tingkat" value={fTingkat} onChange={(e) => setFTingkat(e.target.value)}>
            <option value="">Semua Tingkat</option>
            {TINGKAT_OPTIONS.map((t) => <option key={t} value={t}>{TINGKAT_LABEL[t]}</option>)}
          </Select>
          <Select containerClassName="sm:w-40" label="Kategori" value={fKategori} onChange={(e) => setFKategori(e.target.value)}>
            <option value="">Semua Kategori</option>
            {KATEGORI_OPTIONS.map((k) => <option key={k.v} value={k.v}>{k.l}</option>)}
          </Select>
          <div className="flex min-w-[200px] flex-1 items-center gap-2 self-end rounded-lg border border-[var(--color-border)] px-3">
            <Search className="h-4 w-4 text-[var(--color-ink-soft)]" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama siswa / prestasi / bidang…" className="w-full bg-transparent py-2 text-sm outline-none" />
          </div>
        </div>
      </Card>

      <SectionCard title={`Daftar Prestasi (${filtered.length})`}>
        {loading ? <FullPageSpinner /> : filtered.length === 0 ? (
          <EmptyState icon={Award} title="Belum ada prestasi" description="Klik 'Tambah Prestasi' untuk mencatat, atau ubah filter." />
        ) : (
          <div className="overflow-x-auto">
            <Table columns={['Siswa', 'Unit', 'Prestasi', 'Tingkat', 'Capaian', 'Poin', 'Tanggal', '']}>
              {filtered.map((r) => (
                <Tr key={r.id}>
                  <Td className="font-medium">{r.siswa?.nama_lengkap || '—'}</Td>
                  <Td className="text-xs text-[var(--color-ink-soft)]">{r.siswa?.schools ? `${r.siswa.schools.jenjang}` : '—'}</Td>
                  <Td><span className="font-medium">{r.judul}</span><span className="block text-xs text-[var(--color-ink-soft)]">{KATEGORI_LABEL[r.kategori]}{r.bidang ? ` · ${r.bidang}` : ''}</span></Td>
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
          </div>
        )}
      </SectionCard>

      {editing && (
        <PrestasiFormModal open={!!editing} entry={editing} employeeId={employee?.id} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />
      )}
    </div>
  )
}
