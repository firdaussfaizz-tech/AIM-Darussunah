import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, GraduationCap, Trash2, Upload, ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, Card, Button, Select, Table, Tr, Td, Badge, EmptyState, FullPageSpinner } from '../../components/ui'
import { STATUS_BADGE_COLOR, SISWA_STATUS_LABELS } from '../../lib/format'
import StudentFormModal from './StudentFormModal'
import StudentImportModal from './StudentImportModal'
import { useAutoRefresh } from '../../lib/useAutoRefresh'

const PAGE_SIZE = 25

export default function StudentList() {
  const { isManager, hasFullAccess, managedSchoolIds, can, permsReady, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  const bolehLihat = permsReady ? can('siswa', 'lihat') : isManager
  const bolehTambah = permsReady ? can('siswa', 'tambah') : isManager
  const bolehHapus = permsReady ? can('siswa', 'hapus') : isManager

  const lockedSchoolId = !hasFullAccess && managedSchoolIds.length > 0 ? managedSchoolIds[0] : null

  // Daftar acuan (sekali muat) — untuk dropdown unit & kelas.
  const [refReady, setRefReady] = useState(false)
  const [schools, setSchools] = useState([])
  const [rombelList, setRombelList] = useState([])
  const [taAktifId, setTaAktifId] = useState(null)

  // Data halaman (paginasi server).
  const [siswa, setSiswa] = useState([])
  const [rombelBySiswa, setRombelBySiswa] = useState({})
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [tableLoading, setTableLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  // Filter & pencarian (search di-debounce agar tidak query tiap ketukan).
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [schoolFilter, setSchoolFilter] = useState(lockedSchoolId || '')
  const [rombelFilter, setRombelFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  useEffect(() => { if (lockedSchoolId) setSchoolFilter(lockedSchoolId) }, [lockedSchoolId])

  // Debounce pencarian → reset ke halaman pertama saat berubah.
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(0) }, 350)
    return () => clearTimeout(t)
  }, [searchInput])

  // Muat daftar acuan sekali (unit, kelas TA aktif).
  useEffect(() => {
    if (authLoading) return
    let batal = false
    const load = async () => {
      const [{ data: sch }, { data: taRows }] = await Promise.all([
        supabase.from('schools').select('id, nama, jenjang').order('jenjang'),
        supabase.from('tahun_ajaran').select('id').eq('status', 'aktif').limit(1),
      ])
      const ta = (taRows || [])[0]
      let rbl = []
      if (ta) {
        const { data: r } = await supabase.from('rombel').select('id, tingkat, nama_rombel, school_id').eq('tahun_ajaran_id', ta.id).order('tingkat')
        rbl = r || []
      }
      if (batal) return
      setSchools(sch || [])
      setRombelList(rbl)
      setTaAktifId(ta?.id || null)
      setRefReady(true)
    }
    load()
    return () => { batal = true }
  }, [authLoading])

  // Muat satu halaman siswa sesuai filter (semua filter diterapkan di server).
  const loadPage = useCallback(async () => {
    if (!bolehLihat) { setTableLoading(false); return }
    setTableLoading(true); setLoadError('')

    // Filter kelas → kumpulan siswa_id pada rombel tsb (TA aktif). Kecil (~1 kelas).
    let rombelIds = null
    if (rombelFilter && taAktifId) {
      const { data: e } = await supabase.from('riwayat_siswa').select('siswa_id')
        .eq('tahun_ajaran_id', taAktifId).eq('status', 'aktif').eq('rombel_id', rombelFilter)
      rombelIds = (e || []).map((x) => x.siswa_id)
      if (rombelIds.length === 0) { setSiswa([]); setTotal(0); setRombelBySiswa({}); setTableLoading(false); return }
    }

    const effSchool = lockedSchoolId || schoolFilter
    let q = supabase.from('siswa')
      .select('id, nis, nisn, nama_lengkap, status, schools!school_id(id, nama, jenjang)', { count: 'exact' })
    if (effSchool) q = q.eq('school_id', effSchool)
    if (statusFilter) q = q.eq('status', statusFilter)
    const s = search.trim().replace(/[%,()*]/g, ' ').trim()
    if (s) q = q.or(`nama_lengkap.ilike.%${s}%,nis.ilike.%${s}%,nisn.ilike.%${s}%`)
    if (rombelIds) q = q.in('id', rombelIds)
    q = q.order('nama_lengkap').range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

    const { data: rows, count, error } = await q
    if (error) { setLoadError(error.message); setSiswa([]); setTotal(0); setTableLoading(false); return }
    setSiswa(rows || [])
    setTotal(count || 0)

    // Peta kelas hanya untuk siswa di halaman ini.
    const ids = (rows || []).map((x) => x.id)
    const map = {}
    if (taAktifId && ids.length) {
      const { data: en } = await supabase.from('riwayat_siswa').select('siswa_id, rombel_id')
        .eq('tahun_ajaran_id', taAktifId).eq('status', 'aktif').in('siswa_id', ids)
      const rblById = Object.fromEntries(rombelList.map((r) => [r.id, r]))
      for (const e of en || []) { const rb = rblById[e.rombel_id]; if (rb) map[e.siswa_id] = rb }
    }
    setRombelBySiswa(map)
    setTableLoading(false)
  }, [bolehLihat, page, search, schoolFilter, rombelFilter, statusFilter, lockedSchoolId, taAktifId, rombelList])

  useEffect(() => { if (refReady) loadPage() }, [refReady, loadPage])
  useAutoRefresh('siswa', loadPage)

  if (authLoading || !refReady) return <FullPageSpinner />

  if (!bolehLihat) {
    return (
      <EmptyState
        icon={GraduationCap}
        title="Akses terbatas"
        description="Peran Anda tidak memiliki izin melihat Data Siswa. Hubungi Admin Yayasan bila ini keliru."
      />
    )
  }

  const handleDelete = async (e, s) => {
    e.stopPropagation()
    if (!confirm(`Hapus data siswa "${s.nama_lengkap}"? Seluruh riwayat kelas, presensi, dan dokumennya akan ikut terhapus permanen.`)) return
    const { error } = await supabase.from('siswa').delete().eq('id', s.id)
    if (error) { alert('Gagal menghapus: ' + error.message); return }
    if (siswa.length === 1 && page > 0) setPage((p) => p - 1); else loadPage()
  }

  const gantiFilter = (fn) => { fn(); setPage(0) }
  const rombelOptions = rombelList.filter((r) => !(lockedSchoolId || schoolFilter) || r.school_id === (lockedSchoolId || schoolFilter))
  const totalHal = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const dari = total === 0 ? 0 : page * PAGE_SIZE + 1
  const sampai = Math.min(total, (page + 1) * PAGE_SIZE)

  return (
    <div>
      <PageHeader
        title="Data Siswa"
        description={`${total.toLocaleString('id-ID')} siswa${lockedSchoolId ? ' di unit Anda' : ' (sesuai filter)'}`}
        actions={bolehTambah && (
          <>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4" /> Impor Excel
            </Button>
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4" /> Tambah Siswa
            </Button>
          </>
        )}
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
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Cari nama, NIS, atau NISN…"
              className="w-full rounded-md border border-[var(--color-border)] bg-white py-2 pl-9 pr-3 text-sm focus:border-[var(--color-navy)] focus:outline-none focus:ring-1 focus:ring-[var(--color-navy)]"
            />
          </div>
          {!lockedSchoolId && (
            <Select containerClassName="sm:w-48" value={schoolFilter} onChange={(e) => gantiFilter(() => { setSchoolFilter(e.target.value); setRombelFilter('') })}>
              <option value="">Semua Unit</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>{s.jenjang} — {s.nama}</option>
              ))}
            </Select>
          )}
          <Select containerClassName="sm:w-44" value={rombelFilter} onChange={(e) => gantiFilter(() => setRombelFilter(e.target.value))}>
            <option value="">Semua Kelas</option>
            {rombelOptions.map((r) => (
              <option key={r.id} value={r.id}>{r.tingkat} {r.nama_rombel}</option>
            ))}
          </Select>
          <Select containerClassName="sm:w-44" value={statusFilter} onChange={(e) => gantiFilter(() => setStatusFilter(e.target.value))}>
            <option value="">Semua Status</option>
            {Object.entries(SISWA_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </div>
      </Card>

      <Card padded={false}>
        <div className="p-5">
          {tableLoading ? (
            <p className="py-8 text-center text-sm text-[var(--color-ink-soft)]">Memuat…</p>
          ) : siswa.length === 0 ? (
            <EmptyState icon={GraduationCap} title="Tidak ada siswa ditemukan" description="Coba ubah kata kunci pencarian atau filter." />
          ) : (
            <>
              <Table columns={['Nama', 'NIS', 'NISN', 'Unit', 'Kelas', 'Status', '']}>
                {siswa.map((s) => (
                  <Tr key={s.id} onClick={() => navigate(`/siswa/${s.id}`)}>
                    <Td className="font-medium text-[var(--color-ink)]">{s.nama_lengkap}</Td>
                    <Td className="text-[var(--color-ink-soft)]">{s.nis || '—'}</Td>
                    <Td className="text-[var(--color-ink-soft)]">{s.nisn || '—'}</Td>
                    <Td>{s.schools ? `${s.schools.jenjang} — ${s.schools.nama}` : '—'}</Td>
                    <Td>{rombelBySiswa[s.id] ? <Badge color="navy">{rombelBySiswa[s.id].tingkat} {rombelBySiswa[s.id].nama_rombel}</Badge> : <span className="text-[var(--color-ink-soft)]">—</span>}</Td>
                    <Td><Badge color={STATUS_BADGE_COLOR[s.status]}>{SISWA_STATUS_LABELS[s.status] || s.status}</Badge></Td>
                    <Td className="text-right">
                      {bolehHapus && (
                        <button onClick={(ev) => handleDelete(ev, s)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus siswa">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </Td>
                  </Tr>
                ))}
              </Table>

              {/* Kontrol paginasi */}
              <div className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
                <p className="text-[13px] text-[var(--color-ink-soft)]">Menampilkan {dari.toLocaleString('id-ID')}–{sampai.toLocaleString('id-ID')} dari {total.toLocaleString('id-ID')}</p>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
                    <ChevronLeft className="h-4 w-4" /> Sebelumnya
                  </Button>
                  <span className="text-[13px] text-[var(--color-ink-soft)]">Hal. {page + 1} / {totalHal}</span>
                  <Button size="sm" variant="outline" onClick={() => setPage((p) => (p + 1 < totalHal ? p + 1 : p))} disabled={page + 1 >= totalHal}>
                    Berikutnya <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </Card>

      <StudentFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => { setFormOpen(false); loadPage() }}
        schools={lockedSchoolId ? schools.filter((s) => s.id === lockedSchoolId) : schools}
      />
      {importOpen && (
        <StudentImportModal
          open={importOpen}
          onClose={() => setImportOpen(false)}
          onImported={loadPage}
          schools={lockedSchoolId ? schools.filter((s) => s.id === lockedSchoolId) : schools}
          lockedSchoolId={lockedSchoolId}
        />
      )}
    </div>
  )
}
