import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, GraduationCap, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, Card, Button, Select, Table, Tr, Td, Badge, EmptyState, FullPageSpinner } from '../../components/ui'
import { STATUS_BADGE_COLOR, SISWA_STATUS_LABELS } from '../../lib/format'
import StudentFormModal from './StudentFormModal'
import { useAutoRefresh } from '../../lib/useAutoRefresh'

export default function StudentList() {
  const { isManager, hasFullAccess, managedSchoolIds, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  // Admin Sekolah / Kepala Sekolah (isManager tapi bukan lintas-yayasan)
  // dikunci ke satuan pendidikannya sendiri. Admin Yayasan/HR (hasFullAccess)
  // tetap bisa melihat & memilih seluruh unit. Dihitung sebelum useState di
  // bawah supaya schoolFilter bisa langsung diinisialisasi terkunci (tidak
  // sempat "berkedip" menampilkan data seluruh unit sesaat sebelum effect).
  const lockedSchoolId = !hasFullAccess && managedSchoolIds.length > 0 ? managedSchoolIds[0] : null

  const [loading, setLoading] = useState(true)
  const [siswa, setSiswa] = useState([])
  const [schools, setSchools] = useState([])
  const [search, setSearch] = useState('')
  const [schoolFilter, setSchoolFilter] = useState(lockedSchoolId || '')
  const [statusFilter, setStatusFilter] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [loadError, setLoadError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    const [{ data: s, error: sErr }, { data: sch, error: schErr }] = await Promise.all([
      supabase
        .from('siswa')
        .select('id, nis, nisn, nama_lengkap, status, schools!school_id(id, nama, jenjang)')
        .order('nama_lengkap'),
      supabase.from('schools').select('id, nama, jenjang').order('jenjang'),
    ])
    if (sErr || schErr) setLoadError((sErr || schErr).message)
    setSiswa(s || [])
    setSchools(sch || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!authLoading) load()
  }, [authLoading, load])

  useAutoRefresh('siswa', load)

  useEffect(() => {
    if (lockedSchoolId) setSchoolFilter(lockedSchoolId)
  }, [lockedSchoolId])

  if (authLoading || loading) return <FullPageSpinner />

  if (!isManager) {
    return (
      <EmptyState
        icon={GraduationCap}
        title="Data siswa belum tersedia"
        description="Halaman ini hanya dapat diakses oleh Admin Yayasan, HR, Admin Sekolah, atau Kepala Sekolah."
      />
    )
  }

  const handleDelete = async (e, s) => {
    e.stopPropagation()
    if (!confirm(`Hapus data siswa "${s.nama_lengkap}"? Seluruh riwayat kelas, presensi, dan dokumennya akan ikut terhapus permanen.`)) return
    const { error } = await supabase.from('siswa').delete().eq('id', s.id)
    if (error) { alert('Gagal menghapus: ' + error.message); return }
    load()
  }

  const filtered = siswa.filter((s) => {
    const matchesSearch = search === '' || s.nama_lengkap.toLowerCase().includes(search.toLowerCase()) ||
      (s.nis || '').includes(search) || (s.nisn || '').includes(search)
    const matchesSchool = schoolFilter === '' || s.schools?.id === schoolFilter
    const matchesStatus = statusFilter === '' || s.status === statusFilter
    return matchesSearch && matchesSchool && matchesStatus
  })

  return (
    <div>
      <PageHeader
        title="Data Siswa"
        description={lockedSchoolId ? `${siswa.length} siswa tercatat di unit Anda` : `${siswa.length} siswa tercatat di seluruh unit yayasan`}
        actions={
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4" /> Tambah Siswa
          </Button>
        }
      />

      {loadError && (
        <p className="mb-4 rounded-md bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger)]">
          Gagal memuat data siswa: {loadError}
        </p>
      )}

      <Card className="mb-4" padded={false}>
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-ink-soft)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama, NIS, atau NISN…"
              className="w-full rounded-md border border-[var(--color-border)] bg-white py-2 pl-9 pr-3 text-sm focus:border-[var(--color-navy)] focus:outline-none focus:ring-1 focus:ring-[var(--color-navy)]"
            />
          </div>
          {!lockedSchoolId && (
            <Select containerClassName="sm:w-48" value={schoolFilter} onChange={(e) => setSchoolFilter(e.target.value)}>
              <option value="">Semua Unit</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>{s.jenjang} — {s.nama}</option>
              ))}
            </Select>
          )}
          <Select containerClassName="sm:w-44" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Semua Status</option>
            {Object.entries(SISWA_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </div>
      </Card>

      <Card padded={false}>
        <div className="p-5">
          {filtered.length === 0 ? (
            <EmptyState icon={GraduationCap} title="Tidak ada siswa ditemukan" description="Coba ubah kata kunci pencarian atau filter." />
          ) : (
            <Table columns={['Nama', 'NIS', 'NISN', 'Unit', 'Status', '']}>
              {filtered.map((s) => (
                <Tr key={s.id} onClick={() => navigate(`/siswa/${s.id}`)}>
                  <Td className="font-medium text-[var(--color-ink)]">{s.nama_lengkap}</Td>
                  <Td className="text-[var(--color-ink-soft)]">{s.nis || '—'}</Td>
                  <Td className="text-[var(--color-ink-soft)]">{s.nisn || '—'}</Td>
                  <Td>{s.schools ? `${s.schools.jenjang} — ${s.schools.nama}` : '—'}</Td>
                  <Td><Badge color={STATUS_BADGE_COLOR[s.status]}>{SISWA_STATUS_LABELS[s.status] || s.status}</Badge></Td>
                  <Td className="text-right">
                    <button onClick={(ev) => handleDelete(ev, s)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus siswa">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </Td>
                </Tr>
              ))}
            </Table>
          )}
        </div>
      </Card>

      <StudentFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => { setFormOpen(false); load() }}
        schools={lockedSchoolId ? schools.filter((s) => s.id === lockedSchoolId) : schools}
      />
    </div>
  )
}
