import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { SectionCard, Badge, Table, Tr, Td, Select, FullPageSpinner, EmptyState, StatCard } from '../../components/ui'
import { SEMESTER_NILAI, tebakSemesterNilai, nilaiAkhir, statusTuntas, pilihKkm } from '../../lib/capaian'

// Tab "Capaian / Progres Pembelajaran" di detail siswa. Membandingkan nilai
// siswa terhadap KKM (Kurikulum & KKM, modul Akademik) → status Tuntas /
// Belum Tuntas per mapel, plus progres antar semester.
export default function StudentCapaianTab({ siswa }) {
  const [taList, setTaList] = useState([])
  const [taId, setTaId] = useState('')
  const [semester, setSemester] = useState(tebakSemesterNilai())
  const [nilai, setNilai] = useState([])
  const [kkmRows, setKkmRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const [{ data: ta }, { data: n }, { data: kkm }] = await Promise.all([
        supabase.from('tahun_ajaran').select('id, nama, status').order('nama', { ascending: false }),
        supabase.from('nilai_siswa').select('*, mata_pelajaran(nama), rombel(tingkat, school_id)').eq('siswa_id', siswa.id),
        siswa.school_id
          ? supabase.from('kurikulum_kkm').select('mata_pelajaran_id, tingkat, tahun_ajaran_id, semester, kkm').eq('school_id', siswa.school_id).not('kkm', 'is', null)
          : Promise.resolve({ data: [] }),
      ])
      setTaList(ta || [])
      setNilai(n || [])
      setKkmRows(kkm || [])
      const aktif = (ta || []).find((t) => t.status === 'aktif')
      if (aktif) setTaId(aktif.id)
      else if ((n || []).length) setTaId(n[0].tahun_ajaran_id)
      setLoading(false)
    })()
  }, [siswa.id, siswa.school_id])

  // Baris mapel pada TA+semester terpilih, lengkap dengan KKM & status.
  const rows = useMemo(() => {
    return nilai
      .filter((n) => (!taId || n.tahun_ajaran_id === taId) && n.semester === semester)
      .map((n) => {
        const tingkat = n.rombel?.tingkat
        const kkm = pilihKkm(kkmRows, { mataPelajaranId: n.mata_pelajaran_id, tingkat, semester, tahunAjaranId: n.tahun_ajaran_id })
        const na = nilaiAkhir(n.nilai_pengetahuan, n.nilai_keterampilan)
        const status = statusTuntas(n.nilai_pengetahuan, n.nilai_keterampilan, kkm)
        return { id: n.id, nama: n.mata_pelajaran?.nama || '—', p: n.nilai_pengetahuan, k: n.nilai_keterampilan, sikap: n.nilai_sikap, catatan: n.catatan_guru, kkm, na, status }
      })
      .sort((a, b) => a.nama.localeCompare(b.nama))
  }, [nilai, kkmRows, taId, semester])

  const ringkas = useMemo(() => {
    const dinilai = rows.filter((r) => r.na != null)
    const avg = dinilai.length ? Math.round(dinilai.reduce((a, r) => a + r.na, 0) / dinilai.length * 100) / 100 : null
    const tuntas = rows.filter((r) => r.status === 'Tuntas').length
    const belum = rows.filter((r) => r.status === 'Belum Tuntas').length
    const berstatus = tuntas + belum
    return { jumlah: rows.length, avg, tuntas, belum, persen: berstatus > 0 ? Math.round(tuntas / berstatus * 100) : null }
  }, [rows])

  // Progres antar (TA, semester) yang punya nilai.
  const progres = useMemo(() => {
    const map = new Map()
    for (const n of nilai) {
      const key = `${n.tahun_ajaran_id}|${n.semester}`
      const kkm = pilihKkm(kkmRows, { mataPelajaranId: n.mata_pelajaran_id, tingkat: n.rombel?.tingkat, semester: n.semester, tahunAjaranId: n.tahun_ajaran_id })
      const na = nilaiAkhir(n.nilai_pengetahuan, n.nilai_keterampilan)
      const st = statusTuntas(n.nilai_pengetahuan, n.nilai_keterampilan, kkm)
      const cur = map.get(key) || { taId: n.tahun_ajaran_id, semester: n.semester, sumNa: 0, cntNa: 0, tuntas: 0, berstatus: 0 }
      if (na != null) { cur.sumNa += na; cur.cntNa += 1 }
      if (st) { cur.berstatus += 1; if (st === 'Tuntas') cur.tuntas += 1 }
      map.set(key, cur)
    }
    const taNama = Object.fromEntries(taList.map((t) => [t.id, t.nama]))
    return Array.from(map.values()).map((v) => ({
      ...v, taNama: taNama[v.taId] || '—',
      avg: v.cntNa ? Math.round(v.sumNa / v.cntNa * 100) / 100 : null,
      persen: v.berstatus ? Math.round(v.tuntas / v.berstatus * 100) : null,
    })).sort((a, b) => (a.taNama).localeCompare(b.taNama) || a.semester.localeCompare(b.semester))
  }, [nilai, kkmRows, taList])

  if (loading) return <FullPageSpinner />

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-3">
        <Select containerClassName="w-52" label="Tahun Ajaran" value={taId} onChange={(e) => setTaId(e.target.value)}>
          <option value="">— Pilih —</option>
          {taList.map((t) => <option key={t.id} value={t.id}>{t.nama}{t.status === 'aktif' ? ' (Aktif)' : ''}</option>)}
        </Select>
        <Select containerClassName="w-40" label="Semester" value={semester} onChange={(e) => setSemester(e.target.value)}>
          {SEMESTER_NILAI.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Mapel Dinilai" value={ringkas.jumlah} accent="navy" />
        <StatCard label="Rata-rata Nilai" value={ringkas.avg ?? '—'} accent="gold" />
        <StatCard label="Ketuntasan" value={ringkas.persen != null ? `${ringkas.persen}%` : '—'} accent="success" />
        <StatCard label="Belum Tuntas" value={ringkas.belum} accent="danger" />
      </div>

      <SectionCard title="Capaian per Mata Pelajaran" description="Nilai dibandingkan KKTP (Kurikulum & KKTP, modul Akademik). Nilai akhir = rata-rata pengetahuan & keterampilan.">
        {rows.length === 0 ? (
          <EmptyState title="Belum ada nilai" description="Belum ada nilai tercatat untuk tahun ajaran & semester ini. Nilai diinput dari menu Nilai & Rapor." />
        ) : (
          <div className="overflow-x-auto">
            <Table columns={['Mata Pelajaran', 'KKTP', 'Pengetahuan', 'Keterampilan', 'Sikap', 'Nilai Akhir', 'Status']}>
              {rows.map((r) => (
                <Tr key={r.id}>
                  <Td className="font-medium">{r.nama}</Td>
                  <Td>{r.kkm ?? <span className="text-[var(--color-ink-soft)]">—</span>}</Td>
                  <Td className={r.kkm != null && r.p != null && Number(r.p) < r.kkm ? 'text-[var(--color-danger)]' : ''}>{r.p ?? '—'}</Td>
                  <Td className={r.kkm != null && r.k != null && Number(r.k) < r.kkm ? 'text-[var(--color-danger)]' : ''}>{r.k ?? '—'}</Td>
                  <Td>{r.sikap || '—'}</Td>
                  <Td className="font-medium">{r.na ?? '—'}</Td>
                  <Td>{r.status ? <Badge color={r.status === 'Tuntas' ? 'success' : 'danger'}>{r.status}</Badge> : <Badge color="neutral">KKTP belum diatur</Badge>}</Td>
                </Tr>
              ))}
            </Table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Progres Antar Semester" description="Rata-rata nilai & persentase ketuntasan tiap semester yang sudah dinilai.">
        {progres.length === 0 ? (
          <EmptyState title="Belum ada data progres" />
        ) : (
          <Table columns={['Tahun Ajaran', 'Semester', 'Rata-rata Nilai', '% Tuntas']}>
            {progres.map((p) => (
              <Tr key={`${p.taId}-${p.semester}`}>
                <Td>{p.taNama}</Td>
                <Td className="capitalize">{p.semester}</Td>
                <Td>{p.avg ?? '—'}</Td>
                <Td>{p.persen != null ? <Badge color={p.persen >= 75 ? 'success' : p.persen >= 50 ? 'gold' : 'danger'}>{p.persen}%</Badge> : '—'}</Td>
              </Tr>
            ))}
          </Table>
        )}
      </SectionCard>
    </div>
  )
}
