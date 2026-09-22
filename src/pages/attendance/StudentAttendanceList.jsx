import { useEffect, useState, useCallback } from 'react'
import { ClipboardCheck } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, Card, Select, Input, Table, Tr, Td, EmptyState, FullPageSpinner } from '../../components/ui'
import { PRESENSI_SISWA_STATUS_OPTIONS, PRESENSI_SISWA_STATUS_LABELS, STATUS_BADGE_COLOR } from '../../lib/format'

// Presensi Siswa (Tahap 3) — bisa diakses oleh manajemen (lihat/catat semua
// rombel di unitnya) ATAU Wali Kelas biasa (guru, hanya rombel yang
// diampunya sendiri — lihat AuthContext.waliKelasRombel). Ini halaman
// PERTAMA di modul Kesiswaan yang dibuka untuk pegawai non-manajemen,
// sesuai keputusan scoping "Wali Kelas login sendiri".
export default function StudentAttendanceList() {
  const { isManager, isWaliKelas, waliKelasRombel, employee, loading: authLoading } = useAuth()
  if (authLoading) return <FullPageSpinner />
  if (!isManager && !isWaliKelas) {
    return (
      <EmptyState
        icon={ClipboardCheck}
        title="Halaman ini belum tersedia"
        description="Halaman ini hanya dapat diakses oleh manajemen (Admin Yayasan/HR/Admin Sekolah/Kepala Sekolah) atau Wali Kelas."
      />
    )
  }
  return (
    <div>
      <PageHeader title="Presensi Siswa" description="Catat kehadiran siswa harian per rombel." />
      {isManager ? <ManagerView employeeId={employee?.id} /> : <WaliKelasView rombelList={waliKelasRombel} employeeId={employee?.id} />}
    </div>
  )
}

function ManagerView({ employeeId }) {
  const [schools, setSchools] = useState([])
  const [schoolFilter, setSchoolFilter] = useState('')
  const [tahunAktif, setTahunAktif] = useState(null)
  const [rombelList, setRombelList] = useState([])
  const [rombelId, setRombelId] = useState('')
  const [loadingMeta, setLoadingMeta] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoadingMeta(true)
      const [{ data: sch }, { data: ta }] = await Promise.all([
        supabase.from('schools').select('id, nama, jenjang').order('jenjang'),
        supabase.from('tahun_ajaran').select('id, nama').eq('status', 'aktif').maybeSingle(),
      ])
      setSchools(sch || [])
      setTahunAktif(ta || null)
      if (ta) {
        const { data: r } = await supabase
          .from('rombel').select('id, nama_rombel, tingkat, school_id, schools!school_id(nama, jenjang)')
          .eq('tahun_ajaran_id', ta.id).order('tingkat')
        setRombelList(r || [])
      }
      setLoadingMeta(false)
    }
    load()
  }, [])

  if (loadingMeta) return <FullPageSpinner />
  if (!tahunAktif) {
    return <EmptyState icon={ClipboardCheck} title="Belum ada tahun ajaran aktif" description="Atur tahun ajaran aktif terlebih dahulu di menu Kelas & Tahun Ajaran." />
  }

  const filteredRombel = rombelList.filter((r) => !schoolFilter || r.school_id === schoolFilter)

  return (
    <div>
      <Card className="mb-4" padded={false}>
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <Select containerClassName="sm:w-56" value={schoolFilter} onChange={(e) => { setSchoolFilter(e.target.value); setRombelId('') }}>
            <option value="">Semua Unit</option>
            {schools.map((s) => <option key={s.id} value={s.id}>{s.jenjang} — {s.nama}</option>)}
          </Select>
          <Select containerClassName="sm:w-56" value={rombelId} onChange={(e) => setRombelId(e.target.value)}>
            <option value="">— Pilih Rombel —</option>
            {filteredRombel.map((r) => <option key={r.id} value={r.id}>{r.tingkat} {r.nama_rombel}</option>)}
          </Select>
        </div>
      </Card>
      {rombelId ? (
        <RombelAttendanceBoard rombelId={rombelId} tahunAjaranId={tahunAktif.id} employeeId={employeeId} />
      ) : (
        <EmptyState icon={ClipboardCheck} title="Pilih rombel" description="Pilih unit dan rombel untuk mulai mencatat presensi." />
      )}
    </div>
  )
}

function WaliKelasView({ rombelList, employeeId }) {
  const aktifList = rombelList.filter((r) => r.tahun_ajaran?.status === 'aktif')
  const [rombelId, setRombelId] = useState(aktifList[0]?.id || '')
  const selected = aktifList.find((r) => r.id === (rombelId || aktifList[0]?.id)) || aktifList[0]

  if (aktifList.length === 0) {
    return <EmptyState icon={ClipboardCheck} title="Tidak ada kelas aktif" description="Anda tidak tercatat sebagai Wali Kelas pada tahun ajaran yang sedang aktif." />
  }

  return (
    <div>
      {aktifList.length > 1 && (
        <Card className="mb-4" padded={false}>
          <div className="p-4">
            <Select label="Rombel" value={rombelId || aktifList[0].id} onChange={(e) => setRombelId(e.target.value)}>
              {aktifList.map((r) => <option key={r.id} value={r.id}>{r.tingkat} {r.nama_rombel} — {r.schools?.nama}</option>)}
            </Select>
          </div>
        </Card>
      )}
      <RombelAttendanceBoard rombelId={selected.id} tahunAjaranId={selected.tahun_ajaran_id} employeeId={employeeId} />
    </div>
  )
}

function RombelAttendanceBoard({ rombelId, tahunAjaranId, employeeId }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [siswaList, setSiswaList] = useState([])
  const [attendanceMap, setAttendanceMap] = useState({})
  const [keteranganDraft, setKeteranganDraft] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState({})

  const load = useCallback(async () => {
    if (!rombelId || !tahunAjaranId) return
    setLoading(true)
    const { data: enroll } = await supabase
      .from('riwayat_siswa')
      .select('siswa_id, siswa!siswa_id(id, nama_lengkap, nis)')
      .eq('rombel_id', rombelId).eq('tahun_ajaran_id', tahunAjaranId).eq('status', 'aktif')
    const siswa = (enroll || []).map((e) => e.siswa).filter(Boolean).sort((a, b) => a.nama_lengkap.localeCompare(b.nama_lengkap))
    setSiswaList(siswa)
    if (siswa.length > 0) {
      const { data: att } = await supabase.from('presensi_siswa').select('*').eq('tanggal', date).in('siswa_id', siswa.map((s) => s.id))
      const map = {}
      const draft = {}
      ;(att || []).forEach((a) => { map[a.siswa_id] = a; draft[a.siswa_id] = a.keterangan || '' })
      setAttendanceMap(map)
      setKeteranganDraft(draft)
    } else {
      setAttendanceMap({})
      setKeteranganDraft({})
    }
    setLoading(false)
  }, [rombelId, tahunAjaranId, date])

  useEffect(() => { load() }, [load])

  const setStatus = async (siswaId, status) => {
    setSaving((s) => ({ ...s, [siswaId]: true }))
    const { data, error } = await supabase
      .from('presensi_siswa')
      .upsert(
        { siswa_id: siswaId, rombel_id: rombelId, tanggal: date, status, keterangan: keteranganDraft[siswaId] || null, dicatat_oleh: employeeId || null },
        { onConflict: 'siswa_id,tanggal' }
      )
      .select().single()
    if (error) alert('Gagal menyimpan presensi: ' + error.message)
    else setAttendanceMap((m) => ({ ...m, [siswaId]: data }))
    setSaving((s) => ({ ...s, [siswaId]: false }))
  }

  const saveKeterangan = async (siswaId) => {
    const existing = attendanceMap[siswaId]
    if (!existing) return
    const { data, error } = await supabase.from('presensi_siswa').update({ keterangan: keteranganDraft[siswaId] || null }).eq('id', existing.id).select().single()
    if (!error) setAttendanceMap((m) => ({ ...m, [siswaId]: data }))
  }

  return (
    <div>
      <Card className="mb-4" padded={false}>
        <div className="p-4">
          <Input type="date" containerClassName="sm:w-48" label="Tanggal" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </Card>
      <Card padded={false}>
        <div className="p-5">
          {loading ? (
            <FullPageSpinner />
          ) : siswaList.length === 0 ? (
            <EmptyState icon={ClipboardCheck} title="Tidak ada siswa aktif" description="Rombel ini belum memiliki siswa aktif pada tahun ajaran ini." />
          ) : (
            <Table columns={['Nama', 'NIS', 'Status', 'Keterangan']}>
              {siswaList.map((s) => {
                const att = attendanceMap[s.id]
                const current = att?.status
                return (
                  <Tr key={s.id}>
                    <Td className="font-medium text-[var(--color-ink)]">{s.nama_lengkap}</Td>
                    <Td className="text-[var(--color-ink-soft)]">{s.nis || '—'}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-1.5">
                        {PRESENSI_SISWA_STATUS_OPTIONS.map((st) => (
                          <button
                            key={st}
                            disabled={saving[s.id]}
                            onClick={() => setStatus(s.id, st)}
                            className={`rounded px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                              current === st ? badgeActiveClass(st) : 'bg-gray-50 text-[var(--color-ink-soft)] hover:bg-gray-100'
                            }`}
                          >
                            {PRESENSI_SISWA_STATUS_LABELS[st]}
                          </button>
                        ))}
                      </div>
                    </Td>
                    <Td>
                      {current && current !== 'hadir' ? (
                        <input
                          value={keteranganDraft[s.id] || ''}
                          onChange={(e) => setKeteranganDraft((d) => ({ ...d, [s.id]: e.target.value }))}
                          onBlur={() => saveKeterangan(s.id)}
                          placeholder="Keterangan (opsional)…"
                          className="w-full rounded-md border border-[var(--color-border)] px-2 py-1 text-xs focus:border-[var(--color-navy)] focus:outline-none"
                        />
                      ) : '—'}
                    </Td>
                  </Tr>
                )
              })}
            </Table>
          )}
        </div>
      </Card>
      <p className="mt-2 text-xs text-[var(--color-ink-soft)]">Siswa berstatus Izin/Sakit/Alpa otomatis mengirim email pemberitahuan ke orang tua (jika email orang tua sudah diisi dan notifikasi email sudah diaktifkan).</p>
    </div>
  )
}

function badgeActiveClass(status) {
  const color = STATUS_BADGE_COLOR[status]
  const map = {
    success: 'bg-[var(--color-success)] text-white',
    gold: 'bg-[var(--color-gold)] text-white',
    danger: 'bg-[var(--color-danger)] text-white',
    navy: 'bg-[var(--color-navy)] text-white',
  }
  return map[color] || 'bg-gray-400 text-white'
}
