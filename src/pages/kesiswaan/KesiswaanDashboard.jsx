import { useEffect, useState, useMemo } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { LayoutDashboard, GraduationCap, ClipboardCheck, Wallet, NotebookText, ChevronDown } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, Card, SectionCard, StatCard, Badge, EmptyState, FullPageSpinner, Input, Button, Modal } from '../../components/ui'
import { formatRupiah, SISWA_STATUS_LABELS, STATUS_BADGE_COLOR, BULAN, SEMESTER_OPTIONS } from '../../lib/format'

// Semester berjalan ditebak dari bulan saat ini — sama persis dengan logika
// di NilaiRapor.jsx (Juli–Desember = ganjil, Januari–Juni = genap).
function tebakSemester() {
  const bulan = new Date().getMonth() + 1
  return bulan >= 7 ? 'ganjil' : 'genap'
}

export default function KesiswaanDashboard() {
  const { isManager, hasFullAccess, managedSchoolIds, can, permsReady, loading: authLoading } = useAuth()
  // Hormati matriks izin per-modul lebih dulu (aditif): peran mana pun yang
  // dicentang 'siswa:lihat' lewat Pengguna & Peran kini bisa membuka Dashboard
  // Kesiswaan. Fallback ke gerbang peran lama bila RPC izin belum siap (DB
  // lama). Data tetap dibatasi RLS has_school_access.
  const bolehLihat = permsReady ? can('siswa', 'lihat') : isManager

  if (authLoading) return <FullPageSpinner />
  if (!bolehLihat) {
    return (
      <EmptyState
        icon={LayoutDashboard}
        title="Halaman ini belum tersedia"
        description="Dashboard Kesiswaan hanya dapat diakses oleh Admin Yayasan, HR, Admin Sekolah, atau Kepala Sekolah."
      />
    )
  }

  // Semua query di bawah sudah otomatis dibatasi lewat RLS (has_school_access)
  // untuk Admin Sekolah/Kepala Sekolah — tidak perlu filter tambahan di sisi
  // klien. lockedSchoolId di sini hanya dipakai untuk menyesuaikan teks &
  // menyembunyikan rincian "per unit" yang tidak relevan kalau cuma satu unit.
  const lockedSchoolId = !hasFullAccess && managedSchoolIds.length > 0 ? managedSchoolIds[0] : null

  return (
    <div>
      <PageHeader
        title="Dashboard Kesiswaan"
        description={lockedSchoolId ? 'Ringkasan data siswa di unit Anda.' : 'Ringkasan data siswa di seluruh unit yayasan.'}
      />
      <DashboardBody lockedSchoolId={lockedSchoolId} />
    </div>
  )
}

function DashboardBody({ lockedSchoolId }) {
  const [loading, setLoading] = useState(true)
  const [siswaRows, setSiswaRows] = useState([])
  const [presensiRows, setPresensiRows] = useState([]) // presensi HARI INI (dengan nama siswa)
  const [tahunAktif, setTahunAktif] = useState(null)
  const [sppRows, setSppRows] = useState([])
  const [nilaiSiswaIds, setNilaiSiswaIds] = useState([])
  const [rombelRows, setRombelRows] = useState([])

  // Rekap Presensi sebagai sub-panel yang MUNCUL saat kartu "Presensi Hari
  // Ini" diklik. Linimasa kehadiran dapat diatur rentang tanggalnya.
  const [showPresensi, setShowPresensi] = useState(false)
  const todayStr = new Date().toISOString().slice(0, 10)
  const weekAgoStr = (() => { const d = new Date(); d.setDate(d.getDate() - 6); return d.toISOString().slice(0, 10) })()
  const [dari, setDari] = useState(weekAgoStr)
  const [sampai, setSampai] = useState(todayStr)
  const [linimasaRows, setLinimasaRows] = useState([])
  const [linimasaLoading, setLinimasaLoading] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const today = new Date().toISOString().slice(0, 10)
      const now = new Date()

      const [{ data: siswa }, { data: presensi }, { data: ta }] = await Promise.all([
        supabase.from('siswa').select('id, status, school_id, schools!school_id(nama, jenjang)'),
        supabase.from('presensi_siswa').select('status, keterangan, siswa:siswa_id(nama_lengkap, nis), rombel:rombel_id(nama_rombel)').eq('tanggal', today),
        supabase.from('tahun_ajaran').select('id, nama').eq('status', 'aktif').maybeSingle(),
      ])
      setSiswaRows(siswa || [])
      setPresensiRows(presensi || [])
      setTahunAktif(ta || null)

      if (ta) {
        const semester = tebakSemester()
        const [{ data: spp }, { data: nilai }, { data: rombel }] = await Promise.all([
          supabase.from('spp_tagihan').select('status, nominal_tagihan').eq('tahun_ajaran_id', ta.id).eq('bulan', now.getMonth() + 1).eq('tahun', now.getFullYear()),
          supabase.from('nilai_siswa').select('siswa_id').eq('tahun_ajaran_id', ta.id).eq('semester', semester),
          supabase.from('rombel').select('id, tingkat, school_id, schools!school_id(nama, jenjang)').eq('tahun_ajaran_id', ta.id),
        ])
        setSppRows(spp || [])
        setNilaiSiswaIds([...new Set((nilai || []).map((n) => n.siswa_id))])
        setRombelRows(rombel || [])
      } else {
        setSppRows([])
        setNilaiSiswaIds([])
        setRombelRows([])
      }
      setLoading(false)
    }
    load()
  }, [])

  const siswaStats = useMemo(() => {
    const byStatus = {}
    const bySchool = {}
    for (const s of siswaRows) {
      byStatus[s.status] = (byStatus[s.status] || 0) + 1
      if (s.status === 'aktif' && s.schools) {
        const key = s.school_id
        if (!bySchool[key]) bySchool[key] = { nama: s.schools.nama, jenjang: s.schools.jenjang, jumlah: 0 }
        bySchool[key].jumlah += 1
      }
    }
    const totalAktif = byStatus.aktif || 0
    return { totalAktif, byStatus, bySchool: Object.values(bySchool).sort((a, b) => b.jumlah - a.jumlah) }
  }, [siswaRows])

  const presensiStats = useMemo(() => {
    const recap = { hadir: 0, izin: 0, sakit: 0, alpa: 0 }
    for (const p of presensiRows) recap[p.status] = (recap[p.status] || 0) + 1
    return { ...recap, total: presensiRows.length }
  }, [presensiRows])

  // Daftar siswa izin/sakit/alpa HARI INI (dengan nama & rombel).
  const presensiDetail = useMemo(() => {
    const by = { izin: [], sakit: [], alpa: [] }
    for (const p of presensiRows) {
      if (by[p.status]) by[p.status].push({ nama: p.siswa?.nama_lengkap || '—', nis: p.siswa?.nis, rombel: p.rombel?.nama_rombel, ket: p.keterangan })
    }
    return by
  }, [presensiRows])

  // Linimasa kehadiran: ambil presensi pada rentang [dari, sampai] yang
  // dipilih — hanya saat panel presensi dibuka, dan hanya bila rentang valid.
  useEffect(() => {
    if (!showPresensi || !dari || !sampai || dari > sampai) return
    let batal = false
    setLinimasaLoading(true)
    supabase.from('presensi_siswa').select('tanggal, status').gte('tanggal', dari).lte('tanggal', sampai)
      .then(({ data }) => { if (!batal) { setLinimasaRows(data || []); setLinimasaLoading(false) } })
    return () => { batal = true }
  }, [showPresensi, dari, sampai])

  // Ringkasan + seri harian untuk rentang terpilih.
  const linimasa = useMemo(() => {
    const recap = { hadir: 0, izin: 0, sakit: 0, alpa: 0 }
    const perHari = {}
    for (const r of linimasaRows) {
      recap[r.status] = (recap[r.status] || 0) + 1
      const d = (perHari[r.tanggal] ||= { total: 0, hadir: 0 })
      d.total += 1
      if (r.status === 'hadir') d.hadir += 1
    }
    const total = linimasaRows.length
    const persen = total > 0 ? Math.round((recap.hadir / total) * 100) : null
    const series = Object.entries(perHari).sort((a, b) => a[0].localeCompare(b[0])).map(([tanggal, d]) => ({
      tanggal,
      label: new Date(`${tanggal}T00:00:00`).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
      persen: d.total > 0 ? Math.round((d.hadir / d.total) * 100) : 0,
    }))
    return { ...recap, total, persen, series }
  }, [linimasaRows])

  const sppStats = useMemo(() => {
    const lunas = sppRows.filter((t) => t.status === 'lunas').length
    const belum = sppRows.length - lunas
    const totalNominal = sppRows.reduce((sum, t) => sum + Number(t.nominal_tagihan || 0), 0)
    return { total: sppRows.length, lunas, belum, totalNominal }
  }, [sppRows])

  const rombelStats = useMemo(() => {
    const byJenjang = {}
    const unitSet = new Set()
    for (const r of rombelRows) {
      const jenjang = r.schools?.jenjang || '—'
      byJenjang[jenjang] = (byJenjang[jenjang] || 0) + 1
      if (r.school_id) unitSet.add(r.school_id)
    }
    const byJenjangLabel = Object.entries(byJenjang)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([jenjang, jumlah]) => `${jenjang} ${jumlah}`)
      .join(' · ')
    return { total: rombelRows.length, unit: unitSet.size, byJenjangLabel }
  }, [rombelRows])

  const semester = tebakSemester()
  const semesterLabel = SEMESTER_OPTIONS.find((s) => s.value === semester)?.label || semester
  // Dibatasi maksimal 100% — penyebut hanya siswa yang status-nya aktif
  // SEKARANG, sedangkan pembilang bisa mencakup siswa yang saat nilai
  // dicatat masih aktif tapi kemudian berubah status (lulus/pindah/keluar)
  // di tengah semester, jadi rasio mentahnya bisa sedikit di atas 100%.
  const nilaiProgress = siswaStats.totalAktif > 0 ? Math.min(100, Math.round((nilaiSiswaIds.length / siswaStats.totalAktif) * 100)) : 0

  if (loading) return <FullPageSpinner />

  const bulanIni = BULAN[new Date().getMonth()]
  const tahunIni = new Date().getFullYear()

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Siswa Aktif" value={siswaStats.totalAktif} sub={`${siswaRows.length} total tercatat (termasuk lulus/pindah/keluar)`} />
        <StatCard
          label={`Rombel${tahunAktif ? ` — ${tahunAktif.nama}` : ''}`}
          value={tahunAktif ? rombelStats.total : '—'}
          sub={tahunAktif
            ? (rombelStats.total > 0
                ? (lockedSchoolId ? 'rombel di unit Anda' : (rombelStats.byJenjangLabel || `di ${rombelStats.unit} unit`))
                : 'Belum ada rombel pada TA aktif')
            : 'Belum ada tahun ajaran aktif'}
        />
        <button
          type="button"
          onClick={() => setShowPresensi((v) => !v)}
          aria-expanded={showPresensi}
          className="w-full rounded-[var(--radius-card,16px)] text-left transition hover:brightness-[0.99] focus:outline-none focus:ring-2 focus:ring-[var(--color-navy-50)]"
        >
          <StatCard
            label={<span className="inline-flex items-center gap-1">Presensi Hari Ini <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showPresensi ? 'rotate-180' : ''}`} /></span>}
            value={presensiStats.total > 0 ? `${presensiStats.hadir} Hadir` : '—'}
            sub={presensiStats.total > 0 ? `dari ${presensiStats.total} tercatat · Izin ${presensiStats.izin} · Sakit ${presensiStats.sakit} · Alpa ${presensiStats.alpa} · klik untuk rincian` : 'Klik untuk rincian & linimasa kehadiran'}
          />
        </button>
        <StatCard
          label={`SPP ${bulanIni} ${tahunIni}`}
          value={sppStats.total > 0 ? `${sppStats.lunas} / ${sppStats.total} Lunas` : '—'}
          sub={sppStats.total > 0 ? `Tunggakan ${sppStats.belum} tagihan · Total tagihan ${formatRupiah(sppStats.totalNominal)}` : tahunAktif ? 'Belum ada tagihan SPP periode ini' : 'Belum ada tahun ajaran aktif'}
        />
        <StatCard
          label={`Progres Nilai — ${semesterLabel}`}
          value={tahunAktif ? `${nilaiProgress}%` : '—'}
          sub={tahunAktif ? `${nilaiSiswaIds.length} dari ${siswaStats.totalAktif} siswa aktif sudah punya nilai tercatat` : 'Belum ada tahun ajaran aktif'}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <SectionCard title="Status Siswa" className="lg:col-span-2">
          <ul className="flex flex-col divide-y divide-[var(--color-border)]">
            {Object.entries(SISWA_STATUS_LABELS).map(([value, label]) => (
              <li key={value} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                <span className="text-sm text-[var(--color-ink)]">{label}</span>
                <Badge color={STATUS_BADGE_COLOR[value]}>{siswaStats.byStatus[value] || 0} siswa</Badge>
              </li>
            ))}
          </ul>
        </SectionCard>

        {!lockedSchoolId && (
          <SectionCard title="Siswa Aktif per Unit Sekolah" className="lg:col-span-3">
            {siswaStats.bySchool.length === 0 ? (
              <EmptyState icon={GraduationCap} title="Belum ada data siswa" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={siswaStats.bySchool.map((s) => ({ ...s, label: `${s.jenjang} — ${s.nama}` }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="jenjang" tick={{ fontSize: 12, fill: 'var(--color-ink-soft)' }} axisLine={{ stroke: 'var(--color-border)' }} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: 'var(--color-ink-soft)' }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: 'var(--color-navy-50)' }} contentStyle={{ borderRadius: 8, borderColor: 'var(--color-border)', fontSize: 13 }} labelFormatter={(_, p) => p?.[0]?.payload?.label} />
                  <Bar dataKey="jumlah" fill="var(--color-navy)" radius={[4, 4, 0, 0]} maxBarSize={64} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </SectionCard>
        )}
      </div>

      <Modal open={showPresensi} onClose={() => setShowPresensi(false)} title="Rekap Presensi Siswa" width="max-w-4xl">
        <div>
          <p className="mb-4 text-sm text-[var(--color-ink-soft)]">Rincian kehadiran siswa hari ini dan linimasa kehadiran pada rentang tanggal yang dipilih. Hanya mencakup rombel yang sudah dicatat presensinya.</p>
          {/* ---------- HARI INI ---------- */}
          <p className="mb-2 text-sm font-semibold text-[var(--color-ink)]">Hari Ini</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[['Tercatat', presensiStats.total], ['Hadir', presensiStats.hadir], ['Izin', presensiStats.izin], ['Sakit', presensiStats.sakit], ['Alpa', presensiStats.alpa]].map(([lbl, val]) => (
              <div key={lbl} className="rounded-lg border border-[var(--color-border)] p-3 text-center">
                <p className="text-xs text-[var(--color-ink-soft)]">{lbl}</p>
                <p className="mt-0.5 text-xl font-semibold text-[var(--color-ink)]">{val}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[['Izin', 'izin', 'gold'], ['Sakit', 'sakit', 'navy'], ['Alpa', 'alpa', 'danger']].map(([lbl, key, color]) => (
              <div key={key}>
                <div className="mb-1.5 flex items-center gap-2"><Badge color={color}>{lbl}</Badge><span className="text-xs text-[var(--color-ink-soft)]">{presensiDetail[key].length} siswa</span></div>
                {presensiDetail[key].length === 0 ? (
                  <p className="text-sm text-[var(--color-ink-soft)]">—</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-[var(--color-border)] rounded-md border border-[var(--color-border)]">
                    {presensiDetail[key].map((s, i) => (
                      <li key={i} className="px-3 py-1.5">
                        <p className="text-sm font-medium text-[var(--color-ink)]">{s.nama}</p>
                        <p className="text-xs text-[var(--color-ink-soft)]">{[s.rombel, s.nis, s.ket].filter(Boolean).join(' · ') || '—'}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
          {presensiStats.total === 0 && <p className="mt-3 text-sm text-[var(--color-ink-soft)]">Belum ada presensi siswa tercatat hari ini.</p>}

          {/* ---------- LINIMASA (rentang tanggal bebas) ---------- */}
          <div className="mt-6 border-t border-[var(--color-border)] pt-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[var(--color-ink)]">Linimasa Kehadiran</p>
                <p className="text-xs text-[var(--color-ink-soft)]">Pilih satu tanggal (Dari = Sampai) atau rentang tanggal untuk melihat persentase kehadiran.</p>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <Input label="Dari" type="date" containerClassName="w-40" value={dari} max={todayStr} onChange={(e) => setDari(e.target.value)} />
                <Input label="Sampai" type="date" containerClassName="w-40" value={sampai} max={todayStr} onChange={(e) => setSampai(e.target.value)} />
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => { setDari(todayStr); setSampai(todayStr) }}>Hari ini</Button>
              <Button size="sm" variant="outline" onClick={() => { const d = new Date(); d.setDate(d.getDate() - 6); setDari(d.toISOString().slice(0, 10)); setSampai(todayStr) }}>7 hari terakhir</Button>
              <Button size="sm" variant="outline" onClick={() => { const d = new Date(); d.setDate(d.getDate() - 29); setDari(d.toISOString().slice(0, 10)); setSampai(todayStr) }}>30 hari terakhir</Button>
            </div>

            {dari > sampai ? (
              <p className="mt-3 text-sm text-[var(--color-danger)]">Tanggal “Dari” tidak boleh setelah “Sampai”.</p>
            ) : linimasaLoading ? (
              <p className="mt-3 text-sm text-[var(--color-ink-soft)]">Memuat…</p>
            ) : (
              <>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <Card className="bg-[var(--color-navy-50)]">
                    <p className="text-[13px] font-medium text-[var(--color-ink-soft)]">% Kehadiran {dari === sampai ? '(1 hari)' : `(${linimasa.series.length} hari)`}</p>
                    <p className="mt-1 font-[family-name:var(--font-display)] text-[26px] font-semibold text-[var(--color-navy)]">{linimasa.persen != null ? `${linimasa.persen}%` : '—'}</p>
                    <p className="text-xs text-[var(--color-ink-soft)]">{linimasa.total > 0 ? `${linimasa.hadir} hadir / ${linimasa.total} tercatat` : 'Belum ada data'}</p>
                  </Card>
                  {[['Hadir', linimasa.hadir], ['Izin', linimasa.izin], ['Sakit', linimasa.sakit], ['Alpa', linimasa.alpa]].map(([lbl, val]) => (
                    <div key={lbl} className="rounded-lg border border-[var(--color-border)] p-3 text-center">
                      <p className="text-xs text-[var(--color-ink-soft)]">{lbl}</p>
                      <p className="mt-0.5 text-xl font-semibold text-[var(--color-ink)]">{val}</p>
                    </div>
                  ))}
                </div>
                {linimasa.series.length > 1 && (
                  <div className="mt-4 rounded-xl border border-[var(--color-border)] p-3">
                    <p className="mb-1 text-xs text-[var(--color-ink-soft)]">Tren % kehadiran per hari</p>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={linimasa.series} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--color-ink-soft)' }} axisLine={{ stroke: 'var(--color-border)' }} tickLine={false} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--color-ink-soft)' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                        <Tooltip contentStyle={{ borderRadius: 8, borderColor: 'var(--color-border)', fontSize: 13 }} formatter={(v) => `${v}%`} />
                        <Line type="monotone" dataKey="persen" name="% Hadir" stroke="var(--color-navy)" strokeWidth={2} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
                {linimasa.total === 0 && <p className="mt-3 text-sm text-[var(--color-ink-soft)]">Belum ada presensi tercatat pada rentang ini.</p>}
              </>
            )}
          </div>
        </div>
      </Modal>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="flex items-center gap-3">
          <ClipboardCheck className="h-5 w-5 shrink-0 text-[var(--color-navy)]" />
          <p className="text-[13px] text-[var(--color-ink-soft)]">Rekap presensi di atas hanya mencakup rombel yang sudah dicatat hari ini — belum tentu seluruh siswa aktif sudah diabsen.</p>
        </Card>
        <Card className="flex items-center gap-3">
          <Wallet className="h-5 w-5 shrink-0 text-[var(--color-navy)]" />
          <p className="text-[13px] text-[var(--color-ink-soft)]">Tagihan SPP dihitung dari tagihan yang sudah di-generate periode {bulanIni} {tahunIni} — klik "Generate Tagihan Bulanan" di menu SPP kalau belum dibuat.</p>
        </Card>
        <Card className="flex items-center gap-3">
          <NotebookText className="h-5 w-5 shrink-0 text-[var(--color-navy)]" />
          <p className="text-[13px] text-[var(--color-ink-soft)]">Progres nilai dihitung dari siswa yang sudah punya minimal satu nilai mata pelajaran tercatat pada semester berjalan.</p>
        </Card>
      </div>
    </div>
  )
}
