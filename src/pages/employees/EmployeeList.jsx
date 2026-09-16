import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Users, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, Card, Button, Input, Select, Table, Tr, Td, Badge, EmptyState, FullPageSpinner } from '../../components/ui'
import { STATUS_BADGE_COLOR } from '../../lib/format'
import EmployeeFormModal from './EmployeeFormModal'

export default function EmployeeList() {
  const { isManager, employee, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [employees, setEmployees] = useState([])
  const [schools, setSchools] = useState([])
  const [search, setSearch] = useState('')
  const [schoolFilter, setSchoolFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [loadError, setLoadError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    const [{ data: emp, error: empErr }, { data: sch, error: schErr }] = await Promise.all([
      supabase
        .from('employees')
        .select('id, nip, nama, status, status_kepegawaian, no_hp, email, schools!school_id(id, nama, jenjang), positions(nama)')
        .order('nama'),
      supabase.from('schools').select('id, nama, jenjang').order('jenjang'),
    ])
    if (empErr || schErr) {
      setLoadError((empErr || schErr).message)
    }
    setEmployees(emp || [])
    setSchools(sch || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!authLoading) load()
  }, [authLoading, load])

  // Non-manager: langsung arahkan ke profil sendiri, jangan tampilkan direktori.
  useEffect(() => {
    if (!authLoading && !isManager && employee?.id) {
      navigate(`/pegawai/${employee.id}`, { replace: true })
    }
  }, [authLoading, isManager, employee, navigate])

  if (authLoading || loading) return <FullPageSpinner />

  if (!isManager) {
    return (
      <EmptyState
        icon={Users}
        title="Data pegawai belum tersedia"
        description="Akun Anda belum ditautkan ke data kepegawaian. Hubungi Admin Yayasan / HR."
      />
    )
  }

  const handleDelete = async (e, emp) => {
    e.stopPropagation()
    if (!confirm(`Hapus data pegawai "${emp.nama}"? Seluruh riwayat presensi, cuti, gaji, kinerja, dan pelatihannya akan ikut terhapus permanen.`)) return
    const { error } = await supabase.from('employees').delete().eq('id', emp.id)
    if (error) { alert('Gagal menghapus: ' + error.message); return }
    load()
  }

  const filtered = employees.filter((e) => {
    const matchesSearch = search === '' || e.nama.toLowerCase().includes(search.toLowerCase()) || (e.nip || '').includes(search)
    const matchesSchool = schoolFilter === '' || e.schools?.id === schoolFilter
    const matchesStatus = statusFilter === '' || e.status === statusFilter
    return matchesSearch && matchesSchool && matchesStatus
  })

  return (
    <div>
      <PageHeader
        title="Data Pegawai"
        description={`${employees.length} pegawai tercatat di seluruh unit yayasan`}
        actions={
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4" /> Tambah Pegawai
          </Button>
        }
      />

      {loadError && (
        <p className="mb-4 rounded-md bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger)]">
          Gagal memuat data pegawai: {loadError}
        </p>
      )}

      <Card className="mb-4" padded={false}>
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-ink-soft)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama atau NIP…"
              className="w-full rounded-md border border-[var(--color-border)] bg-white py-2 pl-9 pr-3 text-sm focus:border-[var(--color-navy)] focus:outline-none focus:ring-1 focus:ring-[var(--color-navy)]"
            />
          </div>
          <Select containerClassName="sm:w-48" value={schoolFilter} onChange={(e) => setSchoolFilter(e.target.value)}>
            <option value="">Semua Unit</option>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>{s.jenjang} — {s.nama}</option>
            ))}
          </Select>
          <Select containerClassName="sm:w-44" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Semua Status</option>
            <option value="aktif">Aktif</option>
            <option value="cuti">Cuti</option>
            <option value="nonaktif">Nonaktif</option>
            <option value="pensiun">Pensiun</option>
          </Select>
        </div>
      </Card>

      <Card padded={false}>
        <div className="p-5">
          {filtered.length === 0 ? (
            <EmptyState icon={Users} title="Tidak ada pegawai ditemukan" description="Coba ubah kata kunci pencarian atau filter." />
          ) : (
            <Table columns={['Nama', 'NIP', 'Unit', 'Jabatan', 'Status Kepegawaian', 'Status', '']}>
              {filtered.map((e) => (
                <Tr key={e.id} onClick={() => navigate(`/pegawai/${e.id}`)}>
                  <Td className="font-medium text-[var(--color-ink)]">{e.nama}</Td>
                  <Td className="text-[var(--color-ink-soft)]">{e.nip || '—'}</Td>
                  <Td>{e.schools ? `${e.schools.jenjang} — ${e.schools.nama}` : '—'}</Td>
                  <Td>{e.positions?.nama || '—'}</Td>
                  <Td>{e.status_kepegawaian}</Td>
                  <Td><Badge color={STATUS_BADGE_COLOR[e.status]}>{e.status}</Badge></Td>
                  <Td className="text-right">
                    <button onClick={(ev) => handleDelete(ev, e)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus pegawai">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </Td>
                </Tr>
              ))}
            </Table>
          )}
        </div>
      </Card>

      <EmployeeFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false)
          load()
        }}
        schools={schools}
      />
    </div>
  )
}
