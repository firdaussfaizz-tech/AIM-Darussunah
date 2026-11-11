import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Users, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, Card, Button, Select, Table, Tr, Td, Badge, EmptyState, FullPageSpinner } from '../../components/ui'
import { STATUS_BADGE_COLOR } from '../../lib/format'
import EmployeeFormModal from './EmployeeFormModal'
import { useAutoRefresh } from '../../lib/useAutoRefresh'

export default function EmployeeList() {
  const { isManager, hasFullAccess, can, permsReady, employee, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  // Direktori pegawai butuh izin 'pegawai:lihat' (fallback: isManager).
  const bolehLihat = permsReady ? can('pegawai', 'lihat') : isManager
  const [loading, setLoading] = useState(true)
  const [employees, setEmployees] = useState([])
  const [schools, setSchools] = useState([])
  const [search, setSearch] = useState('')
  const [schoolFilter, setSchoolFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 25

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

  useAutoRefresh('employees', load)

  // Non-manager: langsung arahkan ke profil sendiri, jangan tampilkan direktori.
  useEffect(() => {
    if (!authLoading && !bolehLihat && employee?.id) {
      navigate(`/pegawai/${employee.id}`, { replace: true })
    }
  }, [authLoading, bolehLihat, employee, navigate])

  if (authLoading || loading) return <FullPageSpinner />

  if (!bolehLihat) {
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

  // Paginasi sisi-klien (data pegawai relatif kecil; cukup slice per halaman).
  const totalHal = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const halAman = Math.min(page, totalHal - 1)
  const paged = filtered.slice(halAman * PAGE_SIZE, halAman * PAGE_SIZE + PAGE_SIZE)
  const dari = filtered.length === 0 ? 0 : halAman * PAGE_SIZE + 1
  const sampai = Math.min(filtered.length, (halAman + 1) * PAGE_SIZE)

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
              onChange={(e) => { setSearch(e.target.value); setPage(0) }}
              placeholder="Cari nama atau NIP…"
              className="w-full rounded-md border border-[var(--color-border)] bg-white py-2 pl-9 pr-3 text-sm focus:border-[var(--color-navy)] focus:outline-none focus:ring-1 focus:ring-[var(--color-navy)]"
            />
          </div>
          <Select containerClassName="sm:w-48" value={schoolFilter} onChange={(e) => { setSchoolFilter(e.target.value); setPage(0) }}>
            <option value="">Semua Unit</option>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>{s.jenjang} — {s.nama}</option>
            ))}
          </Select>
          <Select containerClassName="sm:w-44" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0) }}>
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
            <><Table columns={['Nama', 'NIP', 'Unit', 'Jabatan', 'Status Kepegawaian', 'Status', '']}>
              {paged.map((e) => (
                <Tr key={e.id} onClick={() => navigate(`/pegawai/${e.id}`)}>
                  <Td className="font-medium text-[var(--color-ink)]">{e.nama}</Td>
                  <Td className="text-[var(--color-ink-soft)]">{e.nip || '—'}</Td>
                  <Td>{e.schools ? `${e.schools.jenjang} — ${e.schools.nama}` : '—'}</Td>
                  <Td>{e.positions?.nama || '—'}</Td>
                  <Td>{e.status_kepegawaian}</Td>
                  <Td><Badge color={STATUS_BADGE_COLOR[e.status]}>{e.status}</Badge></Td>
                  <Td className="text-right">
                    {hasFullAccess && e.id !== employee?.id && (
                      <button onClick={(ev) => handleDelete(ev, e)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus pegawai">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </Td>
                </Tr>
              ))}
            </Table>
            {filtered.length > PAGE_SIZE && (
              <div className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
                <p className="text-[13px] text-[var(--color-ink-soft)]">Menampilkan {dari}–{sampai} dari {filtered.length}</p>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={halAman === 0}>
                    <ChevronLeft className="h-4 w-4" /> Sebelumnya
                  </Button>
                  <span className="text-[13px] text-[var(--color-ink-soft)]">Hal. {halAman + 1} / {totalHal}</span>
                  <Button size="sm" variant="outline" onClick={() => setPage((p) => (p + 1 < totalHal ? p + 1 : p))} disabled={halAman + 1 >= totalHal}>
                    Berikutnya <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
            </>
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
