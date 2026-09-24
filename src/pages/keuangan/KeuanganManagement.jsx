import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Wallet, Plus, Pencil, Trash2, ShieldAlert, ClipboardList, Send, CheckCircle2, RotateCcw,
  ArrowDownCircle, ArrowUpCircle, FileBarChart, Truck, Banknote,
} from 'lucide-react'
import { useParams, Navigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, SectionCard, Card, Button, Badge, Table, Tr, Td, Modal, Input, Select, Textarea, EmptyState, FullPageSpinner, StatCard } from '../../components/ui'
import { formatRupiah, formatDate } from '../../lib/format'
import {
  RKAS_STATUS_LABEL, RKAS_STATUS_BADGE, SUMBER_DANA_OPTIONS, BIDANG_BELANJA_OPTIONS,
  KATEGORI_KAS_OPTIONS, JENIS_KAS_LABEL, JENIS_KAS_BADGE, SUMBER_KAS_LABEL,
  isTransaksiOtomatis, hitungSaldoBerjalan,
  KEUANGAN_AREAS, KEUANGAN_DEFAULT,
} from '../../lib/keuangan'
import { useAutoRefresh } from '../../lib/useAutoRefresh'

// Unit yang dikelola pengguna (school manager) + pemilihan unit aktif.
// canSeeAllUnits = true untuk Yayasan (hasFullAccess) maupun Bendahara
// (peran finansial lintas unit) — keduanya boleh melihat/mengelola semua
// unit lewat RLS (is_yayasan_admin() or is_bendahara() pada setiap tabel).
function useUnitFilter(canSeeAllUnits, mySchools) {
  const [schools, setSchools] = useState([])
  const [schoolId, setSchoolId] = useState(canSeeAllUnits ? '' : (mySchools[0]?.id || ''))
  useEffect(() => {
    if (canSeeAllUnits) {
      supabase.from('schools').select('id, nama, jenjang').order('jenjang').then(({ data }) => setSchools(data || []))
    } else {
      setSchools(mySchools)
      if (!schoolId && mySchools.length) setSchoolId(mySchools[0].id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSeeAllUnits])
  return { schools, schoolId, setSchoolId }
}

export default function KeuanganManagement() {
  const { isManager, hasFullAccess, isBendahara, roles, loading: authLoading } = useAuth()
  const { area } = useParams()

  const mySchools = useMemo(() => {
    const seen = new Map()
    for (const r of roles) {
      if (['admin_sekolah', 'kepala_sekolah'].includes(r.role) && r.school_id && !seen.has(r.school_id)) {
        seen.set(r.school_id, { id: r.school_id, nama: r.schools?.nama, jenjang: r.schools?.jenjang })
      }
    }
    return Array.from(seen.values())
  }, [roles])

  if (authLoading) return <FullPageSpinner />
  if (!isManager && !isBendahara) {
    return <EmptyState icon={ShieldAlert} title="Akses terbatas" description="Halaman Manajemen Keuangan hanya untuk manajemen (Admin Yayasan/HR, Admin Sekolah, Kepala Sekolah) atau Bendahara." />
  }

  const canSeeAllUnits = hasFullAccess || isBendahara
  const canDecide = hasFullAccess || isBendahara

  const active = KEUANGAN_AREAS.find((a) => a.slug === area)
  if (!active) return <Navigate to={`/keuangan/${KEUANGAN_DEFAULT}`} replace />

  return (
    <div>
      <PageHeader title={`Manajemen Keuangan — ${active.label}`} description="RKAS (Anggaran), Buku Kas, & Laporan — terintegrasi dengan DKA Sarpras, SPP, dan Penggajian." />

      {active.kind === 'live-dashboard' && <DashboardTab canSeeAllUnits={canSeeAllUnits} mySchools={mySchools} />}
      {active.kind === 'live-rkas' && <RkasTab canSeeAllUnits={canSeeAllUnits} canDecide={canDecide} mySchools={mySchools} />}
      {active.kind === 'live-buku-kas' && <BukuKasTab canSeeAllUnits={canSeeAllUnits} canDecide={canDecide} mySchools={mySchools} />}
      {active.kind === 'live-laporan' && <LaporanTab canSeeAllUnits={canSeeAllUnits} mySchools={mySchools} />}
    </div>
  )
}

// =========================================================================
// TAB: DASHBOARD
// =========================================================================
function DashboardTab({ canSeeAllUnits, mySchools }) {
  const { schools, schoolId, setSchoolId } = useUnitFilter(canSeeAllUnits, mySchools)
  const nowY = new Date().getFullYear()
  const [tahun, setTahun] = useState(nowY)
  const years = [nowY - 1, nowY, nowY + 1]

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        {canSeeAllUnits && (
          <Select containerClassName="w-52" value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
            <option value="">Semua Unit (rekap)</option>
            {schools.map((s) => <option key={s.id} value={s.id}>{s.jenjang} — {s.nama}</option>)}
          </Select>
        )}
        <Select containerClassName="w-36" value={tahun} onChange={(e) => setTahun(Number(e.target.value))}>
          {years.map((y) => <option key={y} value={y}>Tahun {y}</option>)}
        </Select>
      </div>

      {canSeeAllUnits && !schoolId ? (
        <DashboardRekap schools={schools} tahun={tahun} onOpen={(sid) => setSchoolId(sid)} />
      ) : schoolId ? (
        <DashboardDetail schoolId={schoolId} tahun={tahun} />
      ) : (
        <p className="text-sm text-[var(--color-ink-soft)]">Pilih unit lebih dulu.</p>
      )}
    </div>
  )
}

function DashboardRekap({ schools, tahun, onOpen }) {
  const [rows, setRows] = useState(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const results = await Promise.all(
        schools.map(async (s) => {
          const { data } = await supabase.rpc('keu_dashboard_ringkasan', { p_school_id: s.id, p_tahun: tahun })
          const r = data?.[0] || {}
          return { id: s.id, cells: [`${s.jenjang} — ${s.nama}`, formatRupiah(r.total_masuk || 0), formatRupiah(r.total_keluar || 0), formatRupiah(r.saldo || 0)] }
        })
      )
      if (alive) setRows(results)
    })()
    return () => { alive = false }
  }, [schools, tahun])

  if (rows === null) return <FullPageSpinner />

  return (
    <SectionCard title={`Rekap Keuangan per Unit — Tahun ${tahun}`} description="Ringkasan pemasukan, pengeluaran & saldo kas seluruh unit. Klik untuk membuka detail.">
      {rows.length === 0 ? (
        <EmptyState icon={Wallet} title="Belum ada data" description="Belum ada transaksi kas pada unit mana pun." />
      ) : (
        <Table columns={['Unit', 'Pemasukan', 'Pengeluaran', 'Saldo Kas', '']}>
          {rows.map((r) => (
            <Tr key={r.id}>
              {r.cells.map((c, i) => <Td key={i}>{c}</Td>)}
              <Td><button onClick={() => onOpen(r.id)} className="text-sm font-medium text-[var(--color-navy)] hover:underline">Buka →</button></Td>
            </Tr>
          ))}
        </Table>
      )}
    </SectionCard>
  )
}

function DashboardDetail({ schoolId, tahun }) {
  const [ringkasan, setRingkasan] = useState(null)
  const [recent, setRecent] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    ;(async () => {
      const [{ data: r }, { data: trx }] = await Promise.all([
        supabase.rpc('keu_dashboard_ringkasan', { p_school_id: schoolId, p_tahun: tahun }),
        supabase.from('buku_kas_transaksi').select('*').eq('school_id', schoolId).order('tanggal', { ascending: false }).order('created_at', { ascending: false }).limit(8),
      ])
      if (!alive) return
      setRingkasan(r?.[0] || null)
      setRecent(trx || [])
      setLoading(false)
    })()
    return () => { alive = false }
  }, [schoolId, tahun])

  if (loading) return <FullPageSpinner />

  const r = ringkasan || {}

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Total Pemasukan" value={formatRupiah(r.total_masuk || 0)} accent="success" />
        <StatCard label="Total Pengeluaran" value={formatRupiah(r.total_keluar || 0)} accent="danger" />
        <StatCard label="Saldo Kas Saat Ini" value={formatRupiah(r.saldo || 0)} />
        <StatCard label="Rencana Belanja RKAS" value={formatRupiah(r.total_rencana_belanja || 0)} accent="gold" />
        <StatCard label="Rencana Pendapatan RKAS" value={formatRupiah(r.total_rencana_pendapatan || 0)} accent="gold" />
      </div>

      <SectionCard title="Transaksi Kas Terbaru" description="8 transaksi terakhir pada unit ini. Buka menu Buku Kas untuk daftar lengkap.">
        {recent.length === 0 ? (
          <EmptyState icon={Wallet} title="Belum ada transaksi" description="Buku Kas unit ini masih kosong." />
        ) : (
          <Table columns={['Tanggal', 'Jenis', 'Kategori', 'Uraian', 'Nominal']}>
            {recent.map((t) => (
              <Tr key={t.id}>
                <Td>{formatDate(t.tanggal)}</Td>
                <Td><Badge color={JENIS_KAS_BADGE[t.jenis]}>{JENIS_KAS_LABEL[t.jenis]}</Badge></Td>
                <Td className="text-xs">{t.kategori}</Td>
                <Td>{t.uraian}</Td>
                <Td className="font-medium">{formatRupiah(t.nominal)}</Td>
              </Tr>
            ))}
          </Table>
        )}
      </SectionCard>
    </div>
  )
}

// =========================================================================
// TAB: RKAS / ANGGARAN
// Alur: satuan pendidikan MENYUSUN & MENGAJUKAN → Yayasan/Bendahara
// MEMUTUSKAN (mengesahkan/mengembalikan). Item belanja bisa ditarik
// otomatis dari DKA Sarpras yang sudah disahkan (integrasi A17).
// =========================================================================
function RkasTab({ canSeeAllUnits, canDecide, mySchools }) {
  const { schools, schoolId, setSchoolId } = useUnitFilter(canSeeAllUnits, mySchools)
  const nowY = new Date().getFullYear()
  const [tahun, setTahun] = useState(nowY)
  const years = [nowY - 1, nowY, nowY + 1, nowY + 2]
  const managesUnit = useMemo(() => mySchools.some((s) => s.id === schoolId), [mySchools, schoolId])

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        {canSeeAllUnits && (
          <Select containerClassName="w-52" value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
            <option value="">Semua Unit (rekap)</option>
            {schools.map((s) => <option key={s.id} value={s.id}>{s.jenjang} — {s.nama}</option>)}
          </Select>
        )}
        <Select containerClassName="w-36" value={tahun} onChange={(e) => setTahun(Number(e.target.value))}>
          {years.map((y) => <option key={y} value={y}>Tahun {y}</option>)}
        </Select>
      </div>

      {canSeeAllUnits && !schoolId ? (
        <RkasRekap tahun={tahun} onOpen={(sid) => setSchoolId(sid)} />
      ) : schoolId ? (
        <RkasDetail schoolId={schoolId} tahun={tahun} canDecide={canDecide} managesUnit={managesUnit} />
      ) : (
        <p className="text-sm text-[var(--color-ink-soft)]">Pilih unit lebih dulu.</p>
      )}
    </div>
  )
}

function RkasRekap({ tahun, onOpen }) {
  const [rows, setRows] = useState([])
  const [totals, setTotals] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    ;(async () => {
      const { data: anggaran } = await supabase
        .from('rkas_anggaran')
        .select('*, schools!school_id(nama, jenjang), diajukan_nama:rkas_anggaran_diajukan_nama')
        .eq('tahun', tahun)
        .order('created_at', { ascending: false })
      const ids = (anggaran || []).map((a) => a.id)
      let t = {}
      if (ids.length) {
        const { data: items } = await supabase.from('rkas_belanja_item').select('anggaran_id, jumlah_rencana').in('anggaran_id', ids)
        for (const it of (items || [])) t[it.anggaran_id] = (t[it.anggaran_id] || 0) + Number(it.jumlah_rencana || 0)
      }
      if (!alive) return
      setRows(anggaran || [])
      setTotals(t)
      setLoading(false)
    })()
    return () => { alive = false }
  }, [tahun])

  if (loading) return <FullPageSpinner />

  const grandTotal = Object.values(totals).reduce((a, b) => a + b, 0)
  const disahkan = rows.filter((r) => r.status === 'disahkan').length

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Unit Mengajukan" value={rows.length} />
        <StatCard label="Sudah Disahkan" value={disahkan} accent="gold" />
        <StatCard label="Total Rencana Belanja" value={formatRupiah(grandTotal)} />
      </div>
      <SectionCard title={`Rekap RKAS — Tahun ${tahun}`} description="Ringkasan usulan anggaran seluruh satuan pendidikan. Klik untuk membuka & memutuskan.">
        {rows.length === 0 ? (
          <EmptyState icon={ClipboardList} title="Belum ada usulan" description="Belum ada satuan pendidikan yang menyusun RKAS untuk tahun ini." />
        ) : (
          <Table columns={['Unit', 'Judul', 'Diajukan Oleh', 'Status', 'Total Rencana Belanja', '']}>
            {rows.map((r) => (
              <Tr key={r.id}>
                <Td>{r.schools?.jenjang} — {r.schools?.nama}</Td>
                <Td>{r.judul || '—'}</Td>
                <Td className="text-xs">{r.diajukan_nama || '—'}</Td>
                <Td><Badge color={RKAS_STATUS_BADGE[r.status]}>{RKAS_STATUS_LABEL[r.status]}</Badge></Td>
                <Td>{formatRupiah(totals[r.id] || 0)}</Td>
                <Td><button onClick={() => onOpen(r.school_id)} className="text-sm font-medium text-[var(--color-navy)] hover:underline">Buka →</button></Td>
              </Tr>
            ))}
          </Table>
        )}
      </SectionCard>
    </div>
  )
}

function RkasDetail({ schoolId, tahun, canDecide, managesUnit }) {
  const [anggaran, setAnggaran] = useState(null)
  const [pendapatan, setPendapatan] = useState([])
  const [belanja, setBelanja] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [subtab, setSubtab] = useState('belanja')
  const [pendapatanOpen, setPendapatanOpen] = useState(false)
  const [editingPendapatan, setEditingPendapatan] = useState(null)
  const [belanjaOpen, setBelanjaOpen] = useState(false)
  const [editingBelanja, setEditingBelanja] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const { data: a } = await supabase.from('rkas_anggaran').select('*, diajukan_nama:rkas_anggaran_diajukan_nama').eq('school_id', schoolId).eq('tahun', tahun).maybeSingle()
    setAnggaran(a || null)
    if (a) {
      const [{ data: pi }, { data: bi }] = await Promise.all([
        supabase.from('rkas_pendapatan_item').select('*').eq('anggaran_id', a.id).order('urutan'),
        supabase.from('rkas_belanja_item').select('*').eq('anggaran_id', a.id).order('urutan'),
      ])
      setPendapatan(pi || [])
      setBelanja(bi || [])
    } else { setPendapatan([]); setBelanja([]) }
    setLoading(false)
  }, [schoolId, tahun])

  useEffect(() => { load() }, [load])

  const status = anggaran?.status
  const canEditItems = !!anggaran && (canDecide || (managesUnit && ['draft', 'dikembalikan'].includes(status)))
  const canSubmit = !!anggaran && managesUnit && ['draft', 'dikembalikan'].includes(status)
  const canPutuskan = !!anggaran && canDecide && status === 'diajukan'

  const totalPendapatan = useMemo(() => pendapatan.reduce((a, r) => a + Number(r.jumlah_rencana || 0), 0), [pendapatan])
  const totalBelanja = useMemo(() => belanja.reduce((a, r) => a + Number(r.jumlah_rencana || 0), 0), [belanja])

  const createAnggaran = async () => {
    setBusy(true); setError('')
    const { error: err } = await supabase.from('rkas_anggaran').insert({ school_id: schoolId, tahun, status: 'draft' })
    setBusy(false)
    if (err) { setError(err.message.includes('duplicate') ? 'RKAS tahun ini sudah ada.' : err.message); return }
    load()
  }

  const setStatus = async (newStatus, catatan) => {
    if (newStatus === 'diajukan' && pendapatan.length === 0 && belanja.length === 0) { setError('Tambahkan minimal satu rencana pendapatan/belanja sebelum mengajukan.'); return }
    setBusy(true); setError('')
    const patch = { status: newStatus }
    if (catatan !== undefined) patch.catatan_yayasan = catatan
    const { error: err } = await supabase.from('rkas_anggaran').update(patch).eq('id', anggaran.id)
    setBusy(false)
    if (err) { setError(err.message); return }
    load()
  }

  const handleAjukan = () => setStatus('diajukan')
  const handleSahkan = () => { if (confirm('Sahkan RKAS ini? Setelah disahkan, unit tidak dapat mengubahnya.')) setStatus('disahkan') }
  const handleKembalikan = () => {
    const c = prompt('Catatan perbaikan untuk unit (alasan dikembalikan):')
    if (c === null) return
    setStatus('dikembalikan', c.trim() || 'Perlu perbaikan.')
  }

  const tarikDariDka = async () => {
    setBusy(true); setError('')
    const { data, error: err } = await supabase.rpc('rkas_tarik_dari_dka', { p_anggaran_id: anggaran.id })
    setBusy(false)
    if (err) { setError(err.message); return }
    alert(data > 0 ? `${data} item berhasil ditarik dari DKA disahkan.` : 'Tidak ada item DKA baru yang bisa ditarik (semua sudah ditarik, atau DKA belum disahkan).')
    load()
  }

  const deletePendapatan = async (item) => {
    if (!confirm(`Hapus rencana pendapatan "${item.uraian}"?`)) return
    const { error: err } = await supabase.from('rkas_pendapatan_item').delete().eq('id', item.id)
    if (err) { alert('Gagal: ' + err.message); return }
    load()
  }
  const deleteBelanja = async (item) => {
    if (!confirm(`Hapus rencana belanja "${item.uraian}"?`)) return
    const { error: err } = await supabase.from('rkas_belanja_item').delete().eq('id', item.id)
    if (err) { alert('Gagal: ' + err.message); return }
    load()
  }

  if (loading) return <FullPageSpinner />

  if (!anggaran) {
    return (
      <SectionCard title={`RKAS Tahun ${tahun}`}>
        <EmptyState
          icon={ClipboardList}
          title="Belum ada usulan RKAS"
          description={managesUnit ? 'Susun Rencana Kerja & Anggaran Sekolah untuk diajukan ke Yayasan.' : 'Unit ini belum menyusun RKAS untuk tahun tersebut.'}
        />
        {managesUnit && (
          <div className="mt-3 flex justify-center">
            <Button onClick={createAnggaran} disabled={busy}><Plus className="h-4 w-4" /> Buat Usulan RKAS {tahun}</Button>
          </div>
        )}
        {error && <p className="mt-3 rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
      </SectionCard>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-[var(--color-ink)]">RKAS — Tahun {tahun}</h3>
              <Badge color={RKAS_STATUS_BADGE[status]}>{RKAS_STATUS_LABEL[status]}</Badge>
            </div>
            <p className="mt-1 text-xs text-[var(--color-ink-soft)]">{anggaran.diajukan_nama ? `Diajukan oleh ${anggaran.diajukan_nama}${anggaran.diajukan_at ? ` · ${new Date(anggaran.diajukan_at).toLocaleDateString('id-ID')}` : ''}.` : 'Belum diajukan.'}</p>
            {status === 'disahkan' && <p className="mt-2 rounded-md bg-[var(--color-success-soft)] px-3 py-2 text-sm text-[var(--color-success)]">RKAS disahkan — menjadi acuan realisasi Buku Kas & Laporan.</p>}
            {status === 'dikembalikan' && anggaran.catatan_yayasan && (
              <p className="mt-2 rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]"><b>Catatan Yayasan:</b> {anggaran.catatan_yayasan}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {canSubmit && <Button onClick={handleAjukan} disabled={busy}><Send className="h-4 w-4" /> Ajukan ke Yayasan</Button>}
            {canPutuskan && <Button onClick={handleSahkan} disabled={busy}><CheckCircle2 className="h-4 w-4" /> Sahkan</Button>}
            {canPutuskan && <Button variant="outline" onClick={handleKembalikan} disabled={busy}><RotateCcw className="h-4 w-4" /> Kembalikan</Button>}
          </div>
        </div>
        {error && <p className="mt-3 rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Item Pendapatan" value={pendapatan.length} />
        <StatCard label="Item Belanja" value={belanja.length} />
        <StatCard label="Total Rencana Pendapatan" value={formatRupiah(totalPendapatan)} accent="gold" />
        <StatCard label="Total Rencana Belanja" value={formatRupiah(totalBelanja)} accent="gold" />
      </div>

      <div className="flex gap-1 border-b border-[var(--color-border)]">
        {[['belanja', `Rencana Belanja (${belanja.length})`], ['pendapatan', `Rencana Pendapatan (${pendapatan.length})`]].map(([k, lbl]) => (
          <button key={k} onClick={() => setSubtab(k)} className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${subtab === k ? 'border-[var(--color-navy)] text-[var(--color-navy)]' : 'border-transparent text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]'}`}>{lbl}</button>
        ))}
      </div>

      {subtab === 'belanja' && (
        <SectionCard
          title="Rencana Belanja"
          description="Item bertanda 'Dari DKA' ditarik otomatis dari DKA Sarpras yang sudah disahkan."
          actions={canEditItems ? (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={tarikDariDka} disabled={busy}><Truck className="h-4 w-4" /> Tarik dari DKA Disahkan</Button>
              <Button size="sm" onClick={() => { setEditingBelanja(null); setBelanjaOpen(true) }}><Plus className="h-4 w-4" /> Tambah Item</Button>
            </div>
          ) : null}
        >
          {belanja.length === 0 ? (
            <EmptyState icon={ClipboardList} title="Belum ada rencana belanja" description="Tambahkan manual, atau tarik dari DKA Sarpras yang sudah disahkan." />
          ) : (
            <div className="overflow-x-auto">
              <Table columns={['Bidang', 'Uraian', 'Sumber Dana', 'Jumlah Rencana', canEditItems ? '' : null].filter((c) => c !== null)}>
                {belanja.map((r) => (
                  <Tr key={r.id}>
                    <Td className="text-xs">{r.bidang}</Td>
                    <Td>
                      <span className="font-medium">{r.uraian}</span>
                      {r.dka_usulan_item_id && <span className="ml-2"><Badge color="navy">Dari DKA</Badge></span>}
                      {r.keterangan && <span className="block text-[11px] text-[var(--color-ink-soft)]">{r.keterangan}</span>}
                    </Td>
                    <Td className="text-xs">{r.sumber_dana}</Td>
                    <Td className="font-medium">{formatRupiah(r.jumlah_rencana)}</Td>
                    {canEditItems && (
                      <Td>
                        <div className="flex justify-end gap-1.5">
                          <button onClick={() => { setEditingBelanja(r); setBelanjaOpen(true) }} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Ubah"><Pencil className="h-4 w-4" /></button>
                          <button onClick={() => deleteBelanja(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </Td>
                    )}
                  </Tr>
                ))}
              </Table>
            </div>
          )}
        </SectionCard>
      )}

      {subtab === 'pendapatan' && (
        <SectionCard
          title="Rencana Pendapatan"
          description="Perkiraan penerimaan per sumber dana untuk tahun anggaran ini."
          actions={canEditItems ? <Button size="sm" onClick={() => { setEditingPendapatan(null); setPendapatanOpen(true) }}><Plus className="h-4 w-4" /> Tambah Item</Button> : null}
        >
          {pendapatan.length === 0 ? (
            <EmptyState icon={ClipboardList} title="Belum ada rencana pendapatan" description="Tambahkan perkiraan penerimaan per sumber dana." />
          ) : (
            <div className="overflow-x-auto">
              <Table columns={['Sumber Dana', 'Uraian', 'Jumlah Rencana', canEditItems ? '' : null].filter((c) => c !== null)}>
                {pendapatan.map((r) => (
                  <Tr key={r.id}>
                    <Td className="text-xs">{r.sumber_dana}</Td>
                    <Td>
                      <span className="font-medium">{r.uraian}</span>
                      {r.keterangan && <span className="block text-[11px] text-[var(--color-ink-soft)]">{r.keterangan}</span>}
                    </Td>
                    <Td className="font-medium">{formatRupiah(r.jumlah_rencana)}</Td>
                    {canEditItems && (
                      <Td>
                        <div className="flex justify-end gap-1.5">
                          <button onClick={() => { setEditingPendapatan(r); setPendapatanOpen(true) }} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Ubah"><Pencil className="h-4 w-4" /></button>
                          <button onClick={() => deletePendapatan(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </Td>
                    )}
                  </Tr>
                ))}
              </Table>
            </div>
          )}
        </SectionCard>
      )}

      <RkasPendapatanModal open={pendapatanOpen} anggaranId={anggaran.id} editingItem={editingPendapatan} onClose={() => { setPendapatanOpen(false); setEditingPendapatan(null) }} onSaved={() => { setPendapatanOpen(false); setEditingPendapatan(null); load() }} />
      <RkasBelanjaModal open={belanjaOpen} anggaranId={anggaran.id} editingItem={editingBelanja} onClose={() => { setBelanjaOpen(false); setEditingBelanja(null) }} onSaved={() => { setBelanjaOpen(false); setEditingBelanja(null); load() }} />
    </div>
  )
}

function RkasPendapatanModal({ open, anggaranId, editingItem, onClose, onSaved }) {
  const [f, setF] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isEdit = !!editingItem

  useEffect(() => {
    if (open) { setF(editingItem || { sumber_dana: SUMBER_DANA_OPTIONS[0] }); setError('') }
  }, [open, editingItem])

  const set = (k, v) => setF((prev) => ({ ...prev, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true); setError('')
    const payload = { anggaran_id: anggaranId, sumber_dana: f.sumber_dana, uraian: f.uraian, jumlah_rencana: Number(f.jumlah_rencana || 0), keterangan: f.keterangan || null }
    const { error: err } = isEdit
      ? await supabase.from('rkas_pendapatan_item').update(payload).eq('id', editingItem.id)
      : await supabase.from('rkas_pendapatan_item').insert(payload)
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Ubah Rencana Pendapatan' : 'Tambah Rencana Pendapatan'} width="max-w-lg">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Select label="Sumber Dana" required value={f.sumber_dana || ''} onChange={(e) => set('sumber_dana', e.target.value)}>
          {SUMBER_DANA_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
        </Select>
        <Input label="Uraian" required value={f.uraian || ''} onChange={(e) => set('uraian', e.target.value)} placeholder="Contoh: SPP Siswa Semester Ganjil" />
        <Input label="Jumlah Rencana (Rp)" type="number" min="0" required value={f.jumlah_rencana ?? ''} onChange={(e) => set('jumlah_rencana', e.target.value)} />
        <Textarea label="Keterangan (opsional)" rows={2} value={f.keterangan || ''} onChange={(e) => set('keterangan', e.target.value)} />
        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button>
        </div>
      </form>
    </Modal>
  )
}

function RkasBelanjaModal({ open, anggaranId, editingItem, onClose, onSaved }) {
  const [f, setF] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isEdit = !!editingItem
  const dariDka = !!editingItem?.dka_usulan_item_id

  useEffect(() => {
    if (open) { setF(editingItem || { bidang: BIDANG_BELANJA_OPTIONS[0], sumber_dana: SUMBER_DANA_OPTIONS[0] }); setError('') }
  }, [open, editingItem])

  const set = (k, v) => setF((prev) => ({ ...prev, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true); setError('')
    const payload = { anggaran_id: anggaranId, bidang: f.bidang, uraian: f.uraian, sumber_dana: f.sumber_dana, jumlah_rencana: Number(f.jumlah_rencana || 0), keterangan: f.keterangan || null }
    const { error: err } = isEdit
      ? await supabase.from('rkas_belanja_item').update(payload).eq('id', editingItem.id)
      : await supabase.from('rkas_belanja_item').insert(payload)
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Ubah Rencana Belanja' : 'Tambah Rencana Belanja'} width="max-w-lg">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {dariDka && <p className="rounded-md bg-[var(--color-navy-50)] px-3 py-2 text-xs text-[var(--color-ink)]">Item ini ditarik otomatis dari DKA Sarpras yang sudah disahkan. Anda tetap bisa menyesuaikan bidang/sumber dana bila perlu.</p>}
        <Select label="Bidang" required value={f.bidang || ''} onChange={(e) => set('bidang', e.target.value)}>
          {BIDANG_BELANJA_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
        </Select>
        <Input label="Uraian" required value={f.uraian || ''} onChange={(e) => set('uraian', e.target.value)} placeholder="Contoh: Pengadaan Meja Kursi Kelas" />
        <Select label="Sumber Dana" required value={f.sumber_dana || ''} onChange={(e) => set('sumber_dana', e.target.value)}>
          {SUMBER_DANA_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
        </Select>
        <Input label="Jumlah Rencana (Rp)" type="number" min="0" required value={f.jumlah_rencana ?? ''} onChange={(e) => set('jumlah_rencana', e.target.value)} />
        <Textarea label="Keterangan (opsional)" rows={2} value={f.keterangan || ''} onChange={(e) => set('keterangan', e.target.value)} />
        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button>
        </div>
      </form>
    </Modal>
  )
}

// =========================================================================
// TAB: BUKU KAS
// Pemasukan SPP tercatat OTOMATIS (lihat migrasi 0049 — trigger
// spp_pembayaran_ke_kas). Realisasi Pengadaan & Penggajian diposting
// semi-otomatis lewat tombol di bawah (RPC keu_posting_pengadaan /
// keu_posting_payroll) — sekali ditekan, langsung tercatat sebagai
// transaksi kas yang tervalidasi oleh sistem.
// =========================================================================
function BukuKasTab({ canSeeAllUnits, canDecide, mySchools }) {
  const { schools, schoolId, setSchoolId } = useUnitFilter(canSeeAllUnits, mySchools)
  const managesUnit = useMemo(() => mySchools.some((s) => s.id === schoolId), [mySchools, schoolId])
  const canInput = canDecide || managesUnit

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Select containerClassName="w-52" value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
          <option value="">— Pilih unit —</option>
          {schools.map((s) => <option key={s.id} value={s.id}>{s.jenjang} — {s.nama}</option>)}
        </Select>
      </div>

      {!schoolId ? (
        <p className="text-sm text-[var(--color-ink-soft)]">Pilih unit lebih dulu untuk melihat Buku Kas.</p>
      ) : (
        <>
          <PostingPengadaanPanel schoolId={schoolId} canInput={canInput} />
          {canDecide && <PostingPayrollPanel schoolId={schoolId} />}
          <BukuKasLedger schoolId={schoolId} canInput={canInput} />
        </>
      )}
    </div>
  )
}

function PostingPengadaanPanel({ schoolId, canInput }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const [{ data: proses }, { data: posted }] = await Promise.all([
      supabase.from('dka_pengadaan_proses')
        .select('id, jumlah_realisasi, harga_realisasi, ba_serah_terima_tanggal, dka_usulan_item!usulan_item_id(nama_aset, harga_satuan, jumlah_pengajuan, sumber_anggaran, dka_usulan!usulan_id(school_id))')
        .eq('status', 'diterima'),
      supabase.from('buku_kas_transaksi').select('referensi_id').eq('school_id', schoolId).eq('referensi_tabel', 'dka_pengadaan_proses'),
    ])
    const postedIds = new Set((posted || []).map((p) => p.referensi_id))
    const filtered = (proses || []).filter((p) => p.dka_usulan_item?.dka_usulan?.school_id === schoolId && !postedIds.has(p.id))
    setRows(filtered)
    setLoading(false)
  }, [schoolId])

  useEffect(() => { load() }, [load])

  const posting = async (id) => {
    setBusyId(id); setError('')
    const { error: err } = await supabase.rpc('keu_posting_pengadaan', { p_proses_id: id })
    setBusyId(null)
    if (err) { setError(err.message); return }
    load()
  }

  if (loading || rows.length === 0) return null

  return (
    <SectionCard title="Realisasi Pengadaan Belum Diposting" description="Item pengadaan DKA yang sudah diterima (BAST) tapi belum tercatat di Buku Kas.">
      <Table columns={['Nama Aset', 'Sumber Dana', 'Qty × Harga Satuan', 'Total', canInput ? '' : null].filter((c) => c !== null)}>
        {rows.map((r) => {
          const qty = Number(r.jumlah_realisasi ?? r.dka_usulan_item?.jumlah_pengajuan ?? 1)
          const harga = Number(r.harga_realisasi ?? r.dka_usulan_item?.harga_satuan ?? 0)
          return (
            <Tr key={r.id}>
              <Td>{r.dka_usulan_item?.nama_aset || '—'}</Td>
              <Td className="text-xs">{r.dka_usulan_item?.sumber_anggaran || '—'}</Td>
              <Td className="text-xs">{qty} × {formatRupiah(harga)}</Td>
              <Td className="font-medium">{formatRupiah(qty * harga)}</Td>
              {canInput && (
                <Td><Button size="sm" variant="outline" onClick={() => posting(r.id)} disabled={busyId === r.id}><Banknote className="h-4 w-4" /> Posting</Button></Td>
              )}
            </Tr>
          )
        })}
      </Table>
      {error && <p className="mt-3 rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
    </SectionCard>
  )
}

function PostingPayrollPanel({ schoolId }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const [{ data: runs }, { data: posted }] = await Promise.all([
      supabase.from('payroll_runs').select('id, periode_bulan, periode_tahun').eq('status', 'final').order('periode_tahun', { ascending: false }).order('periode_bulan', { ascending: false }).limit(12),
      supabase.from('buku_kas_transaksi').select('referensi_id').eq('school_id', schoolId).eq('referensi_tabel', 'payroll_runs'),
    ])
    const postedIds = new Set((posted || []).map((p) => p.referensi_id))
    setRows((runs || []).filter((r) => !postedIds.has(r.id)))
    setLoading(false)
  }, [schoolId])

  useEffect(() => { load() }, [load])

  const posting = async (id) => {
    setBusyId(id); setError('')
    const { error: err } = await supabase.rpc('keu_posting_payroll', { p_run_id: id })
    setBusyId(null)
    if (err) { setError(err.message); return }
    load()
  }

  if (loading || rows.length === 0) return null

  const BULAN = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

  return (
    <SectionCard title="Penggajian Final Belum Diposting" description="Periode gaji yang sudah final tapi biaya gajinya belum tercatat sebagai pengeluaran unit ini. Posting akan otomatis mengelompokkan biaya per unit.">
      <Table columns={['Periode', '']}>
        {rows.map((r) => (
          <Tr key={r.id}>
            <Td>{BULAN[r.periode_bulan]} {r.periode_tahun}</Td>
            <Td><Button size="sm" variant="outline" onClick={() => posting(r.id)} disabled={busyId === r.id}><Banknote className="h-4 w-4" /> Posting ke Semua Unit</Button></Td>
          </Tr>
        ))}
      </Table>
      {error && <p className="mt-3 rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
    </SectionCard>
  )
}

function BukuKasLedger({ schoolId, canInput }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const { data } = await supabase.from('buku_kas_transaksi').select('*').eq('school_id', schoolId).order('tanggal').order('created_at')
    setRows(hitungSaldoBerjalan(data || []))
    setLoading(false)
  }, [schoolId])

  useEffect(() => { load() }, [load])
  useAutoRefresh('buku_kas_transaksi', load)

  const deleteTrx = async (t) => {
    if (!confirm(`Hapus transaksi "${t.uraian}"?`)) return
    const { error: err } = await supabase.from('buku_kas_transaksi').delete().eq('id', t.id)
    if (err) { alert('Gagal: ' + err.message); return }
    load()
  }

  const displayRows = useMemo(() => [...rows].reverse(), [rows])

  if (loading) return <FullPageSpinner />

  return (
    <SectionCard
      title="Buku Kas"
      description="Saldo berjalan dihitung otomatis. Transaksi otomatis (SPP/Pengadaan/Penggajian) hanya bisa dibatalkan dari data sumbernya."
      actions={canInput ? <Button size="sm" onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" /> Tambah Transaksi Manual</Button> : null}
    >
      {rows.length === 0 ? (
        <EmptyState icon={Wallet} title="Belum ada transaksi" description="Buku Kas unit ini masih kosong." />
      ) : (
        <div className="overflow-x-auto">
          <Table columns={['Tanggal', 'Jenis', 'Kategori', 'Uraian', 'Nominal', 'Saldo', '']}>
            {displayRows.map((t) => (
              <Tr key={t.id}>
                <Td>{formatDate(t.tanggal)}</Td>
                <Td>{t.jenis === 'masuk' ? <ArrowDownCircle className="inline h-4 w-4 text-[var(--color-success)]" /> : <ArrowUpCircle className="inline h-4 w-4 text-[var(--color-danger)]" />} <Badge color={JENIS_KAS_BADGE[t.jenis]}>{JENIS_KAS_LABEL[t.jenis]}</Badge></Td>
                <Td className="text-xs">
                  {t.kategori}
                  {isTransaksiOtomatis(t) && <span className="block text-[11px] text-[var(--color-ink-soft)]">{SUMBER_KAS_LABEL[t.sumber] || t.sumber}</span>}
                </Td>
                <Td>{t.uraian}</Td>
                <Td className="font-medium">{formatRupiah(t.nominal)}</Td>
                <Td>{formatRupiah(t.saldo_berjalan)}</Td>
                <Td>
                  {canInput && !isTransaksiOtomatis(t) && (
                    <button onClick={() => deleteTrx(t)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus"><Trash2 className="h-4 w-4" /></button>
                  )}
                </Td>
              </Tr>
            ))}
          </Table>
        </div>
      )}
      {error && <p className="mt-3 rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
      <BukuKasModal open={formOpen} schoolId={schoolId} onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); load() }} />
    </SectionCard>
  )
}

function BukuKasModal({ open, schoolId, onClose, onSaved }) {
  const [f, setF] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) { setF({ jenis: 'masuk', kategori: KATEGORI_KAS_OPTIONS[0], tanggal: new Date().toISOString().slice(0, 10) }); setError('') }
  }, [open])

  const set = (k, v) => setF((prev) => ({ ...prev, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true); setError('')
    const payload = {
      school_id: schoolId,
      tanggal: f.tanggal,
      jenis: f.jenis,
      kategori: f.kategori,
      sumber_dana: f.sumber_dana || null,
      uraian: f.uraian,
      nominal: Number(f.nominal || 0),
      sumber: 'Manual',
    }
    const { error: err } = await supabase.from('buku_kas_transaksi').insert(payload)
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title="Tambah Transaksi Manual" width="max-w-lg">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Select label="Jenis" required value={f.jenis || 'masuk'} onChange={(e) => set('jenis', e.target.value)}>
            <option value="masuk">Pemasukan</option>
            <option value="keluar">Pengeluaran</option>
          </Select>
          <Input label="Tanggal" type="date" required value={f.tanggal || ''} onChange={(e) => set('tanggal', e.target.value)} />
        </div>
        <Select label="Kategori" required value={f.kategori || ''} onChange={(e) => set('kategori', e.target.value)}>
          {KATEGORI_KAS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
        </Select>
        <Select label="Sumber Dana (opsional)" value={f.sumber_dana || ''} onChange={(e) => set('sumber_dana', e.target.value)}>
          <option value="">—</option>
          {SUMBER_DANA_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
        </Select>
        <Input label="Uraian" required value={f.uraian || ''} onChange={(e) => set('uraian', e.target.value)} placeholder="Contoh: Pembelian ATK operasional kantor" />
        <Input label="Nominal (Rp)" type="number" min="1" required value={f.nominal ?? ''} onChange={(e) => set('nominal', e.target.value)} />
        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button>
        </div>
      </form>
    </Modal>
  )
}

// =========================================================================
// TAB: LAPORAN — realisasi vs rencana RKAS, per unit per tahun.
// =========================================================================
function LaporanTab({ canSeeAllUnits, mySchools }) {
  const { schools, schoolId, setSchoolId } = useUnitFilter(canSeeAllUnits, mySchools)
  const nowY = new Date().getFullYear()
  const [tahun, setTahun] = useState(nowY)
  const years = [nowY - 1, nowY, nowY + 1]

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Select containerClassName="w-52" value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
          <option value="">— Pilih unit —</option>
          {schools.map((s) => <option key={s.id} value={s.id}>{s.jenjang} — {s.nama}</option>)}
        </Select>
        <Select containerClassName="w-36" value={tahun} onChange={(e) => setTahun(Number(e.target.value))}>
          {years.map((y) => <option key={y} value={y}>Tahun {y}</option>)}
        </Select>
      </div>

      {!schoolId ? (
        <p className="text-sm text-[var(--color-ink-soft)]">Pilih unit lebih dulu untuk melihat laporan realisasi.</p>
      ) : (
        <LaporanDetail schoolId={schoolId} tahun={tahun} />
      )}
    </div>
  )
}

function LaporanDetail({ schoolId, tahun }) {
  const [anggaran, setAnggaran] = useState(null)
  const [rekap, setRekap] = useState([])
  const [ringkasan, setRingkasan] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    ;(async () => {
      const { data: a } = await supabase.from('rkas_anggaran').select('id').eq('school_id', schoolId).eq('tahun', tahun).maybeSingle()
      const { data: r } = await supabase.rpc('keu_dashboard_ringkasan', { p_school_id: schoolId, p_tahun: tahun })
      let rk = []
      if (a) {
        const { data } = await supabase.rpc('rkas_realisasi_rekap', { p_anggaran_id: a.id })
        rk = data || []
      }
      if (!alive) return
      setAnggaran(a || null)
      setRingkasan(r?.[0] || null)
      setRekap(rk)
      setLoading(false)
    })()
    return () => { alive = false }
  }, [schoolId, tahun])

  if (loading) return <FullPageSpinner />

  const ring = ringkasan || {}
  const totalRealisasi = rekap.reduce((a, r) => a + Number(r.jumlah_realisasi || 0), 0)
  const totalRencana = rekap.reduce((a, r) => a + Number(r.jumlah_rencana || 0), 0)

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Pemasukan Kas" value={formatRupiah(ring.total_masuk || 0)} accent="success" />
        <StatCard label="Total Pengeluaran Kas" value={formatRupiah(ring.total_keluar || 0)} accent="danger" />
        <StatCard label="Rencana Belanja RKAS" value={formatRupiah(totalRencana)} accent="gold" />
        <StatCard label="Realisasi Belanja RKAS" value={formatRupiah(totalRealisasi)} accent="gold" />
      </div>

      <SectionCard title={`Realisasi vs Rencana Belanja — Tahun ${tahun}`} description="Dihitung dari transaksi Buku Kas yang tertaut ke masing-masing item RKAS.">
        {!anggaran ? (
          <EmptyState icon={FileBarChart} title="Belum ada RKAS" description="Unit ini belum menyusun RKAS untuk tahun tersebut." />
        ) : rekap.length === 0 ? (
          <EmptyState icon={FileBarChart} title="Belum ada item belanja" description="RKAS tahun ini belum memiliki rencana belanja." />
        ) : (
          <div className="overflow-x-auto">
            <Table columns={['Bidang', 'Uraian', 'Sumber Dana', 'Rencana', 'Realisasi', 'Selisih']}>
              {rekap.map((r) => {
                const over = Number(r.selisih) < 0
                return (
                  <Tr key={r.item_id}>
                    <Td className="text-xs">{r.bidang}</Td>
                    <Td>{r.uraian}</Td>
                    <Td className="text-xs">{r.sumber_dana}</Td>
                    <Td>{formatRupiah(r.jumlah_rencana)}</Td>
                    <Td>{formatRupiah(r.jumlah_realisasi)}</Td>
                    <Td><Badge color={over ? 'danger' : 'success'}>{over ? `Lebih ${formatRupiah(Math.abs(r.selisih))}` : formatRupiah(r.selisih)}</Badge></Td>
                  </Tr>
                )
              })}
            </Table>
          </div>
        )}
      </SectionCard>
    </div>
  )
}
