import { useEffect, useState, useMemo, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, BookOpen, LineChart, GraduationCap, ExternalLink, Users2 } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { PageHeader, SectionCard, Button, Badge, Table, Tr, Td, Select, EmptyState, FullPageSpinner, StatCard } from '../../components/ui'
import { SEMESTER_NILAI, tebakSemesterNilai, nilaiAkhir, statusTuntas, pilihKkm } from '../../lib/capaian'

// Halaman Detail Rombel — daftar siswa + integrasi Kurikulum (KKTP/CP tingkat)
// dan Capaian Pembelajaran (ketuntasan nilai per siswa). Dibuka dari
// Kelas & Tahun Ajaran → Rombel/Kelas (klik baris rombel).
export default function RombelDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [rombel, setRombel] = useState(null)
  const [enroll, setEnroll] = useState([])
  const [kkm, setKkm] = useState([])
  const [nilai, setNilai] = useState([])
  const [semester, setSemester] = useState(tebakSemesterNilai())

  const load = useCallback(async () => {
    setLoading(true)
    const { data: r } = await supabase.from('rombel')
      .select('*, schools!school_id(nama, jenjang), tahun_ajaran(nama, status), employees!wali_kelas_employee_id(nama)')
      .eq('id', id).maybeSingle()
    if (!r) { setRombel(null); setLoading(false); return }
    const [{ data: en }, { data: k }, { data: n }] = await Promise.all([
      supabase.from('riwayat_siswa').select('status, siswa!siswa_id(id, nama_lengkap, nis, nisn, jenis_kelamin, status)').eq('rombel_id', id).eq('tahun_ajaran_id', r.tahun_ajaran_id),
      supabase.from('kurikulum_kkm').select('id, mata_pelajaran_id, tingkat, semester, kkm, cp_kd, mata_pelajaran(nama)').eq('school_id', r.school_id).eq('tingkat', r.tingkat),
      supabase.from('nilai_siswa').select('siswa_id, mata_pelajaran_id, semester, nilai_pengetahuan, nilai_keterampilan').eq('rombel_id', id).eq('tahun_ajaran_id', r.tahun_ajaran_id),
    ])
    setRombel(r); setEnroll(en || []); setKkm(k || []); setNilai(n || [])
    setLoading(false)
  }, [id])
  useEffect(() => { load() }, [load])

  const siswaList = useMemo(() => (enroll || [])
    .map((e) => e.siswa).filter(Boolean)
    .sort((a, b) => (a.nama_lengkap || '').localeCompare(b.nama_lengkap || '')), [enroll])

  const jumlahL = siswaList.filter((s) => s.jenis_kelamin === 'L').length
  const jumlahP = siswaList.filter((s) => s.jenis_kelamin === 'P').length

  const kkmTampil = useMemo(() => [...(kkm || [])]
    .sort((a, b) => (a.mata_pelajaran?.nama || '').localeCompare(b.mata_pelajaran?.nama || '')), [kkm])

  // Ringkasan capaian per siswa pada semester terpilih.
  const capaian = useMemo(() => siswaList.map((s) => {
    const rows = nilai.filter((n) => n.siswa_id === s.id && n.semester === semester)
    let sum = 0, cnt = 0, tuntas = 0, berstatus = 0
    for (const n of rows) {
      const na = nilaiAkhir(n.nilai_pengetahuan, n.nilai_keterampilan)
      const kkmVal = pilihKkm(kkm, { mataPelajaranId: n.mata_pelajaran_id, tingkat: rombel?.tingkat, semester, tahunAjaranId: rombel?.tahun_ajaran_id })
      const st = statusTuntas(n.nilai_pengetahuan, n.nilai_keterampilan, kkmVal)
      if (na != null) { sum += na; cnt++ }
      if (st) { berstatus++; if (st === 'Tuntas') tuntas++ }
    }
    return { siswa: s, jumlah: rows.length, avg: cnt ? Math.round((sum / cnt) * 100) / 100 : null, persen: berstatus ? Math.round((tuntas / berstatus) * 100) : null, belum: berstatus - tuntas }
  }), [siswaList, nilai, kkm, semester, rombel])

  const kelasAvg = useMemo(() => {
    const vals = capaian.map((c) => c.avg).filter((v) => v != null)
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null
  }, [capaian])

  if (loading) return <FullPageSpinner />
  if (!rombel) return <EmptyState icon={GraduationCap} title="Rombel tidak ditemukan" description="Data rombel tidak tersedia atau Anda tidak memiliki akses." />

  return (
    <div>
      <button onClick={() => navigate(-1)} className="mb-3 inline-flex items-center gap-1.5 text-sm text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]">
        <ArrowLeft className="h-4 w-4" /> Kembali
      </button>
      <PageHeader
        title={`Kelas ${rombel.tingkat} ${rombel.nama_rombel}`}
        description={`${rombel.schools ? `${rombel.schools.jenjang} — ${rombel.schools.nama}` : ''} · TA ${rombel.tahun_ajaran?.nama || '—'} · Wali Kelas: ${rombel.employees?.nama || 'belum ditentukan'}`}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Jumlah Siswa" value={siswaList.length} sub={`${jumlahL} L · ${jumlahP} P`} accent="navy" icon={Users2} />
        <StatCard label="Mapel ber-KKTP" value={kkmTampil.length} accent="gold" icon={BookOpen} />
        <StatCard label="Rata-rata Kelas" value={kelasAvg ?? '—'} accent="success" icon={LineChart} />
        <StatCard label="Kapasitas" value={rombel.kapasitas ? `${siswaList.length}/${rombel.kapasitas}` : siswaList.length} accent="navy" />
      </div>

      {/* Daftar Siswa */}
      <SectionCard title="Daftar Siswa" description="Klik siswa untuk membuka detail (biodata, tagihan, prestasi, capaian belajar).">
        {siswaList.length === 0 ? (
          <EmptyState icon={GraduationCap} title="Belum ada siswa" description="Tempatkan siswa ke rombel ini lewat Kelas & Tahun Ajaran → Rombel → Kelola Siswa." />
        ) : (
          <div className="overflow-x-auto">
            <Table columns={['No', 'Nama', 'NIS', 'L/P', 'Status', '']}>
              {siswaList.map((s, i) => (
                <Tr key={s.id} onClick={() => navigate(`/siswa/${s.id}`)}>
                  <Td className="text-[var(--color-ink-soft)]">{i + 1}</Td>
                  <Td className="font-medium text-[var(--color-ink)]">{s.nama_lengkap}</Td>
                  <Td className="text-[var(--color-ink-soft)]">{s.nis || '—'}</Td>
                  <Td>{s.jenis_kelamin || '—'}</Td>
                  <Td>{s.status === 'aktif' ? <Badge color="success">Aktif</Badge> : <Badge color="neutral">{s.status}</Badge>}</Td>
                  <Td className="text-right"><ExternalLink className="ml-auto h-4 w-4 text-[var(--color-ink-soft)]" /></Td>
                </Tr>
              ))}
            </Table>
          </div>
        )}
      </SectionCard>

      {/* Kurikulum & KKTP tingkat ini */}
      <div className="mt-6">
        <SectionCard
          title={`Kurikulum & KKTP — Tingkat ${rombel.tingkat}`}
          description="Capaian Pembelajaran (CP) & KKTP yang berlaku untuk tingkat kelas ini."
          actions={<Link to="/pembelajaran/kurikulum"><Button size="sm" variant="outline"><BookOpen className="h-4 w-4" /> Kelola Kurikulum & KKTP</Button></Link>}
        >
          {kkmTampil.length === 0 ? (
            <EmptyState icon={BookOpen} title="Belum ada KKTP" description="Belum ada CP/KKTP untuk tingkat ini. Atur di Akademik → Kurikulum & KKTP." />
          ) : (
            <div className="overflow-x-auto">
              <Table columns={['Mata Pelajaran', 'KKTP', 'CP / TP', 'Semester', '']}>
                {kkmTampil.map((k) => (
                  <Tr key={k.id}>
                    <Td className="font-medium">{k.mata_pelajaran?.nama || '—'}</Td>
                    <Td>{k.kkm ?? '—'}</Td>
                    <Td className="max-w-md text-[13px] text-[var(--color-ink-soft)]">{k.cp_kd || '—'}</Td>
                    <Td className="text-[var(--color-ink-soft)]">{k.semester || 'semua'}</Td>
                    <Td className="text-right">
                      <Button size="sm" variant="outline" onClick={() => navigate(`/pembelajaran/progres/${k.id}`)}>
                        <LineChart className="h-4 w-4" /> Pantau Progres
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </Table>
            </div>
          )}
        </SectionCard>
      </div>

      {/* Capaian Pembelajaran kelas */}
      <div className="mt-6">
        <SectionCard
          title="Capaian Pembelajaran Kelas"
          description="Ketuntasan nilai tiap siswa dibandingkan KKTP (dari Nilai & Rapor)."
          actions={
            <Select containerClassName="w-40" value={semester} onChange={(e) => setSemester(e.target.value)}>
              {SEMESTER_NILAI.map((s) => <option key={s.v} value={s.v}>Semester {s.l}</option>)}
            </Select>
          }
        >
          {capaian.every((c) => c.jumlah === 0) ? (
            <EmptyState icon={LineChart} title="Belum ada nilai" description="Belum ada nilai tercatat untuk semester ini. Nilai diinput di menu Nilai & Rapor." />
          ) : (
            <div className="overflow-x-auto">
              <Table columns={['Siswa', 'Mapel Dinilai', 'Rata-rata', 'Ketuntasan', 'Belum Tuntas', '']}>
                {capaian.map((c) => (
                  <Tr key={c.siswa.id} onClick={() => navigate(`/siswa/${c.siswa.id}`)}>
                    <Td className="font-medium text-[var(--color-ink)]">{c.siswa.nama_lengkap}</Td>
                    <Td>{c.jumlah}</Td>
                    <Td className="font-medium">{c.avg ?? '—'}</Td>
                    <Td>{c.persen != null ? <Badge color={c.persen >= 75 ? 'success' : c.persen >= 50 ? 'gold' : 'danger'}>{c.persen}%</Badge> : '—'}</Td>
                    <Td className={c.belum > 0 ? 'text-[var(--color-danger)]' : ''}>{c.belum || 0}</Td>
                    <Td className="text-right"><ExternalLink className="ml-auto h-4 w-4 text-[var(--color-ink-soft)]" /></Td>
                  </Tr>
                ))}
              </Table>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  )
}
