import { useEffect, useState, useCallback, useMemo } from 'react'
import { Boxes, Plus, Pencil, Trash2, DoorOpen, ShieldAlert, Search, ClipboardList, Send, CheckCircle2, RotateCcw, Download, Tag, BookOpen, Clock3, ShieldCheck, Truck, ClipboardCheck, PackageCheck, Wrench, UserCheck, ScanLine, ArchiveX, Printer, Package, Info, MessageSquare } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, SectionCard, Card, Button, Badge, Table, Tr, Td, Modal, Input, Select, Textarea, EmptyState, FullPageSpinner, StatCard } from '../../components/ui'
import { formatRupiah } from '../../lib/format'
import { KONDISI_OPTIONS, KONDISI_LABEL, KONDISI_BADGE, hitungPenyusutan, umurLabel } from '../../lib/aset'
import {
  DKA_STATUS_LABEL, DKA_STATUS_BADGE, ALASAN_KEBUTUHAN_OPTIONS, CARA_PENGADAAN_OPTIONS,
  SUMBER_ANGGARAN_OPTIONS, JENIS_PEMELIHARAAN_OPTIONS, validasiHargaItem,
  PENGADAAN_STATUS_LABEL, PENGADAAN_STATUS_BADGE, METODE_REALISASI_OPTIONS,
  PENGGUNAAN_STATUS_LABEL, PENGGUNAAN_STATUS_BADGE, PEMELIHARAAN_JENIS_OPTIONS,
  PENYALURAN_STATUS_LABEL, PENYALURAN_STATUS_BADGE, OPNAME_STATUS_LABEL, OPNAME_STATUS_BADGE,
  PENGHAPUSAN_STATUS_LABEL, PENGHAPUSAN_STATUS_BADGE, PENGHAPUSAN_ALASAN_OPTIONS, PENGHAPUSAN_CARA_OPTIONS,
} from '../../lib/dka'
import { useParams, Navigate } from 'react-router-dom'
import { SOP_SARPRAS, PIC_SARPRAS } from '../../lib/sopSarpras'
import { SARPRAS_AREAS, SARPRAS_DEFAULT } from '../../lib/sarpras'
import { DOKUMEN_LIST, listRecords, loadDokumen, buildDokumen } from '../../lib/dokumenSarpras'

// Buka halaman cetak dokumen di tab baru (siap print/PDF).
function openCetak(jenis, id) {
  window.open(id ? `/aset/cetak/${jenis}/${id}` : `/aset/cetak/${jenis}`, '_blank', 'noopener')
}

// Nomor surat otomatis berurut per unit + kode + tahun (RPC next_doc_number).
async function autoNo(schoolId, kode) {
  if (!schoolId) return ''
  const { data, error } = await supabase.rpc('next_doc_number', { p_school_id: schoolId, p_kode: kode, p_tahun: new Date().getFullYear() })
  return error ? '' : (data || '')
}

// Rekap lintas unit untuk Yayasan (dipakai saat belum memilih unit).
function CrossUnitRecap({ title, description, columns, rows, onOpen }) {
  return (
    <SectionCard title={title} description={description}>
      {rows.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Belum ada data" description="Belum ada catatan pada unit mana pun." />
      ) : (
        <Table columns={[...columns, '']}>
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

function PemeliharaanRekap({ onOpen }) {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    supabase.from('aset_pemeliharaan_log').select('biaya, aset!inner(school_id, schools!school_id(nama, jenjang))').then(({ data }) => {
      const m = {}
      for (const r of (data || [])) { const sid = r.aset?.school_id; if (!sid) continue; const s = r.aset?.schools; if (!m[sid]) m[sid] = { label: s ? `${s.jenjang} — ${s.nama}` : '—', count: 0, biaya: 0 }; m[sid].count++; m[sid].biaya += Number(r.biaya || 0) }
      setRows(Object.entries(m).map(([id, v]) => ({ id, cells: [v.label, v.count, formatRupiah(v.biaya)] })))
    })
  }, [])
  if (rows === null) return <FullPageSpinner />
  return <CrossUnitRecap title="Rekap Pemeliharaan per Unit" description="Ringkasan seluruh unit. Klik untuk membuka detail." columns={['Unit', 'Catatan', 'Total Biaya']} rows={rows} onOpen={onOpen} />
}

function OpnameRekap({ onOpen }) {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    supabase.from('aset_opname').select('status, school_id, schools!school_id(nama, jenjang)').then(({ data }) => {
      const m = {}
      for (const r of (data || [])) { const sid = r.school_id; const s = r.schools; if (!m[sid]) m[sid] = { label: s ? `${s.jenjang} — ${s.nama}` : '—', total: 0, berjalan: 0 }; m[sid].total++; if (r.status === 'berjalan') m[sid].berjalan++ }
      setRows(Object.entries(m).map(([id, v]) => ({ id, cells: [v.label, v.total, v.berjalan] })))
    })
  }, [])
  if (rows === null) return <FullPageSpinner />
  return <CrossUnitRecap title="Rekap Inventarisasi per Unit" description="Ringkasan sesi opname seluruh unit. Klik untuk membuka." columns={['Unit', 'Sesi', 'Berjalan']} rows={rows} onOpen={onOpen} />
}

function PenghapusanRekap({ onOpen }) {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    supabase.from('aset_penghapusan').select('status, school_id, schools!school_id(nama, jenjang)').then(({ data }) => {
      const m = {}
      for (const r of (data || [])) { const sid = r.school_id; const s = r.schools; if (!m[sid]) m[sid] = { label: s ? `${s.jenjang} — ${s.nama}` : '—', total: 0, diajukan: 0 }; m[sid].total++; if (r.status === 'diajukan') m[sid].diajukan++ }
      setRows(Object.entries(m).map(([id, v]) => ({ id, cells: [v.label, v.total, v.diajukan] })))
    })
  }, [])
  if (rows === null) return <FullPageSpinner />
  return <CrossUnitRecap title="Rekap Penghapusan per Unit" description="Ringkasan usulan penghapusan seluruh unit. Klik untuk membuka & memutuskan." columns={['Unit', 'Usulan', 'Menunggu Keputusan']} rows={rows} onOpen={onOpen} />
}

// Tiap area = satu halaman /aset/:area (menu dropdown di Sidebar). Konten
// dipilih dari SARPRAS_AREAS berdasarkan slug pada URL.
export default function AsetList() {
  const { isManager, hasFullAccess, roles, can, permsReady, loading: authLoading } = useAuth()
  const { area } = useParams()
  const [sopOpen, setSopOpen] = useState(false)

  const mySchools = useMemo(() => {
    const seen = new Map()
    for (const r of roles) {
      // Kenali peran manajer unit BAIK dari enum lama (admin_sekolah/
      // kepala_sekolah) MAUPUN dari model peran dinamis (tingkat_akses
      // 'manajer_unit', mis. Kepala Sekolah yang perannya via jabatan).
      const manajerUnit = ['admin_sekolah', 'kepala_sekolah'].includes(r.role) || r.roles?.tingkat_akses === 'manajer_unit'
      if (manajerUnit && r.school_id && !seen.has(r.school_id)) {
        seen.set(r.school_id, { id: r.school_id, nama: r.schools?.nama, jenjang: r.schools?.jenjang })
      }
    }
    return Array.from(seen.values())
  }, [roles])

  if (authLoading) return <FullPageSpinner />
  const bolehLihat = permsReady ? can('sarpras', 'lihat') : isManager
  if (!bolehLihat) {
    return <EmptyState icon={ShieldAlert} title="Akses terbatas" description="Peran Anda tidak memiliki izin melihat Sarana & Prasarana." />
  }

  const active = SARPRAS_AREAS.find((a) => a.slug === area)
  // Slug tak dikenal, atau area khusus Yayasan diakses non-Yayasan → alihkan.
  if (!active || (active.fullAccessOnly && !hasFullAccess)) {
    return <Navigate to={`/aset/${SARPRAS_DEFAULT}`} replace />
  }
  const sop = active.sop ? SOP_SARPRAS[active.sop] : null

  return (
    <div>
      <PageHeader title={`Sarana & Prasarana — ${active.label}`} description="Pengelolaan aset satuan pendidikan sesuai Juknis Manajemen Aset YPI Darussunah. Setiap area memuat SOP-nya." />

      {sop && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--color-navy-50)] px-4 py-2.5">
          <p className="text-sm text-[var(--color-ink)]"><span className="font-medium">{sop.bab} — {sop.label}.</span> <span className="text-[var(--color-ink-soft)]">{sop.ringkas}</span></p>
          <Button size="sm" variant="outline" onClick={() => setSopOpen(true)}><BookOpen className="h-4 w-4" /> Baca SOP</Button>
        </div>
      )}

      {active.kind === 'live-dashboard' && <DashboardTab hasFullAccess={hasFullAccess} mySchools={mySchools} />}
      {active.kind === 'live-dokumen' && <DokumenTab hasFullAccess={hasFullAccess} mySchools={mySchools} />}
      {active.kind === 'live-dka' && <DkaTab hasFullAccess={hasFullAccess} mySchools={mySchools} />}
      {active.kind === 'live-pengadaan' && <PengadaanTab hasFullAccess={hasFullAccess} mySchools={mySchools} />}
      {active.kind === 'live-penggunaan' && <PenggunaanTab hasFullAccess={hasFullAccess} mySchools={mySchools} />}
      {active.kind === 'live-pemeliharaan' && <PemeliharaanTab hasFullAccess={hasFullAccess} mySchools={mySchools} />}
      {active.kind === 'live-penyaluran' && <PenyaluranTab hasFullAccess={hasFullAccess} mySchools={mySchools} />}
      {active.kind === 'live-inventarisasi' && <InventarisasiTab hasFullAccess={hasFullAccess} mySchools={mySchools} />}
      {active.kind === 'live-penghapusan' && <PenghapusanTab hasFullAccess={hasFullAccess} mySchools={mySchools} />}
      {active.kind === 'live-inventaris' && <InventarisTab hasFullAccess={hasFullAccess} mySchools={mySchools} />}
      {active.kind === 'live-ruangan' && <RuanganTab hasFullAccess={hasFullAccess} mySchools={mySchools} />}
      {active.kind === 'live-bhp' && <BhpTab hasFullAccess={hasFullAccess} mySchools={mySchools} />}
      {active.kind === 'live-kodefikasi' && <KodefikasiTab />}
      {active.kind === 'menyusul' && <MenyusulArea sopId={active.sop} />}
      {active.kind === 'kebijakan' && <KebijakanTab />}

      {sop && <SopPanel open={sopOpen} sop={sop} onClose={() => setSopOpen(false)} />}
    </div>
  )
}

// --- Render SOP (isi & panel) --------------------------------------------
function SopList({ title, items, icon: Icon }) {
  if (!items || items.length === 0) return null
  return (
    <div>
      <h4 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-[var(--color-ink)]">{Icon && <Icon className="h-4 w-4 text-[var(--color-navy)]" />}{title}</h4>
      <ul className="ml-1 flex flex-col gap-1.5 text-sm text-[var(--color-ink-soft)]">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--color-ink-soft)]" />{it}</li>
        ))}
      </ul>
    </div>
  )
}

function SopContent({ sop, numberedProsedur = true }) {
  return (
    <div className="flex flex-col gap-4">
      <SopList title="Prinsip Umum" items={sop.prinsip} />
      <SopList title="Tujuan" items={sop.tujuan} />
      {sop.prosedur && sop.prosedur.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-sm font-semibold text-[var(--color-ink)]">Prosedur / Alur Kerja</h4>
          <ol className="ml-1 flex flex-col gap-1.5 text-sm text-[var(--color-ink-soft)]">
            {sop.prosedur.map((it, i) => (
              <li key={i} className="flex gap-2">
                {numberedProsedur
                  ? <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-navy-50)] text-[11px] font-semibold text-[var(--color-navy)]">{i + 1}</span>
                  : <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--color-ink-soft)]" />}
                {it}
              </li>
            ))}
          </ol>
        </div>
      )}
      <SopList title="Wewenang & Tanggung Jawab" items={sop.wewenang} />
      <SopList title="Dokumen Kerja" items={sop.dokumen} />
      {sop.kondisiKhusus && (
        <p className="rounded-md bg-[var(--color-gold-soft)] px-3 py-2 text-sm text-[var(--color-ink)]"><b>Kondisi khusus:</b> {sop.kondisiKhusus}</p>
      )}
    </div>
  )
}

function SopPanel({ open, sop, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title={`SOP — ${sop.label} (${sop.bab})`} width="max-w-2xl">
      <SopContent sop={sop} />
    </Modal>
  )
}

// Area yang fitur pencatatannya menyusul: tampilkan SOP sebagai acuan kerja.
function MenyusulArea({ sopId }) {
  const sop = SOP_SARPRAS[sopId]
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-paper)] px-4 py-3">
        <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-gold)]" />
        <div>
          <p className="text-sm font-medium text-[var(--color-ink)]">Fitur pencatatan digital untuk area ini sedang disiapkan.</p>
          <p className="text-sm text-[var(--color-ink-soft)]">Untuk sementara, jalankan area ini mengikuti SOP di bawah. Form & pencatatan akan menyusul di tahap pengembangan berikutnya.</p>
        </div>
      </div>
      <SectionCard title={`SOP — ${sop.label}`} description={`${sop.bab} · ${sop.ringkas}`}>
        <SopContent sop={sop} />
      </SectionCard>
    </div>
  )
}

// Kumpulan SOP kebijakan (tanpa form): Pengamanan, Pembinaan, Ganti Rugi + PIC.
function KebijakanTab() {
  const [openId, setOpenId] = useState(null)
  const items = ['pengamanan', 'pembinaan', 'ganti_rugi'].map((id) => SOP_SARPRAS[id])
  return (
    <div className="flex flex-col gap-5">
      <SectionCard title="Susunan PIC & Wewenang Pengelolaan Aset" description="BAB II — penanggung jawab tata kelola aset se-yayasan.">
        <Table columns={['Peran (PIC)', 'Wewenang & Tanggung Jawab']}>
          {PIC_SARPRAS.map(([peran, ket]) => (
            <Tr key={peran}><Td className="align-top font-medium whitespace-nowrap">{peran}</Td><Td className="text-sm text-[var(--color-ink-soft)]">{ket}</Td></Tr>
          ))}
        </Table>
      </SectionCard>
      <div className="grid gap-3 sm:grid-cols-3">
        {items.map((s) => (
          <Card key={s.label} className="flex flex-col">
            <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-[var(--color-navy)]" /><h3 className="font-semibold text-[var(--color-ink)]">{s.label}</h3></div>
            <p className="mt-1 flex-1 text-sm text-[var(--color-ink-soft)]">{s.ringkas}</p>
            <Button size="sm" variant="outline" className="mt-3 self-start" onClick={() => setOpenId(items.indexOf(s))}><BookOpen className="h-4 w-4" /> Baca SOP</Button>
          </Card>
        ))}
      </div>
      {openId !== null && <SopPanel open={openId !== null} sop={items[openId]} onClose={() => setOpenId(null)} />}
    </div>
  )
}

function useUnitFilter(hasFullAccess, mySchools) {
  const [schools, setSchools] = useState([])
  const [schoolId, setSchoolId] = useState(hasFullAccess ? '' : (mySchools[0]?.id || ''))
  // Kunci daftar unit manajer agar efek bisa bereaksi saat data peran tiba
  // SETELAH mount (mySchools semula kosong) tanpa memicu ulang tiap render.
  const mineKey = mySchools.map((s) => s.id).join(',')
  useEffect(() => {
    if (hasFullAccess) {
      supabase.from('schools').select('id, nama, jenjang').order('jenjang').then(({ data }) => setSchools(data || []))
    } else {
      setSchools(mySchools)
      // Auto-pilih unit pertama milik manajer (Kepala/Admin Sekolah) begitu
      // daftarnya tersedia — mencegah "Pilih unit lebih dulu" padahal peran
      // sudah jelas satu unit.
      setSchoolId((prev) => prev || mySchools[0]?.id || '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasFullAccess, mineKey])
  return { schools, schoolId, setSchoolId }
}

// Pencari klasifikasi (Permendagri): ketik nama/kode → pilih. Menghindari
// pegawai mengetik kode manual.
function KlasifikasiPicker({ klasifikasiList, value, onChange, disabled }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const selected = useMemo(() => klasifikasiList.find((k) => k.id === value), [klasifikasiList, value])
  const results = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return klasifikasiList.filter((k) => k.level >= 4).slice(0, 20)
    return klasifikasiList.filter((k) => k.uraian.toLowerCase().includes(s) || k.kode.includes(s)).slice(0, 25)
  }, [q, klasifikasiList])

  return (
    <div>
      <label className="mb-1 block text-[13px] font-medium text-[var(--color-ink)]">Klasifikasi Aset (kodefikasi otomatis)</label>
      {selected ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-paper)] px-3 py-2">
          <span className="text-sm text-[var(--color-ink)]"><span className="font-mono text-[var(--color-navy)]">{selected.kode}</span> — {selected.uraian}</span>
          {!disabled && <button type="button" onClick={() => { onChange(''); setOpen(true) }} className="text-xs text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]">ganti</button>}
        </div>
      ) : (
        <div className="relative">
          <div className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-3">
            <Search className="h-4 w-4 text-[var(--color-ink-soft)]" />
            <input
              disabled={disabled}
              value={q}
              onChange={(e) => { setQ(e.target.value); setOpen(true) }}
              onFocus={() => setOpen(true)}
              placeholder="Cari jenis aset, mis. 'lemari', 'laptop', 'meja'…"
              className="w-full bg-transparent py-2 text-sm outline-none"
            />
          </div>
          {open && results.length > 0 && (
            <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-[var(--color-border)] bg-white shadow-lg">
              {results.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => { onChange(k.id); setOpen(false); setQ('') }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--color-navy-50)]"
                >
                  <span className="font-mono text-xs text-[var(--color-navy)]">{k.kode}</span>
                  <span className="text-[var(--color-ink)]">{k.uraian}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// =========================================================================
// TAB: INVENTARIS
// =========================================================================
function InventarisTab({ hasFullAccess, mySchools }) {
  const { schools, schoolId, setSchoolId } = useUnitFilter(hasFullAccess, mySchools)
  const [klasifikasiList, setKlasifikasiList] = useState([])
  const [golonganMap, setGolonganMap] = useState({})
  const [ruanganList, setRuanganList] = useState([])
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [golonganFilter, setGolonganFilter] = useState('')
  const [kondisiFilter, setKondisiFilter] = useState('')
  const [ruanganFilter, setRuanganFilter] = useState('')
  const [showDihapus, setShowDihapus] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editingRow, setEditingRow] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    const [{ data: klas }, { data: gol }, { data: aset, error }] = await Promise.all([
      supabase.from('aset_klasifikasi').select('*').order('kode'),
      supabase.from('aset_golongan').select('*'),
      (() => {
        let q = supabase.from('aset').select('*, aset_klasifikasi(kode, uraian, golongan), ruangan(nama), schools!school_id(nama, jenjang)').order('created_at', { ascending: false })
        if (schoolId) q = q.eq('school_id', schoolId)
        return q
      })(),
    ])
    setKlasifikasiList(klas || [])
    setGolonganMap(Object.fromEntries((gol || []).map((g) => [g.kode, g])))
    if (error) setLoadError(error.message)
    setRows(aset || [])
    setLoading(false)
  }, [schoolId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!schoolId) { setRuanganList([]); return }
    supabase.from('ruangan').select('id, nama').eq('school_id', schoolId).order('nama').then(({ data }) => setRuanganList(data || []))
  }, [schoolId])

  const filtered = useMemo(() => rows.filter((r) => {
    if (!showDihapus && r.status === 'dihapus') return false
    if (golonganFilter && r.aset_klasifikasi?.golongan !== golonganFilter) return false
    if (kondisiFilter && r.kondisi !== kondisiFilter) return false
    if (ruanganFilter && r.ruangan_id !== ruanganFilter) return false
    return true
  }), [rows, showDihapus, golonganFilter, kondisiFilter, ruanganFilter])

  const withPenyusutan = useMemo(() => filtered.map((r) => ({ r, p: hitungPenyusutan(r, golonganMap[r.aset_klasifikasi?.golongan]) })), [filtered, golonganMap])
  const totals = useMemo(() => withPenyusutan.reduce((a, { r, p }) => ({
    jumlah: a.jumlah + 1, perolehan: a.perolehan + Number(r.nilai_perolehan || 0), buku: a.buku + p.nilaiBuku,
  }), { jumlah: 0, perolehan: 0, buku: 0 }), [withPenyusutan])

  const handleDelete = async (row) => {
    if (!confirm(`Tandai aset "${row.nama}" sebagai DIHAPUS? Data tetap tersimpan untuk riwayat.`)) return
    const { error } = await supabase.from('aset').update({ status: 'dihapus' }).eq('id', row.id)
    if (error) { alert('Gagal: ' + error.message); return }
    load()
  }

  if (loading) return <FullPageSpinner />

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {hasFullAccess && (
            <Select containerClassName="w-48" value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
              <option value="">Semua Unit</option>
              {schools.map((s) => <option key={s.id} value={s.id}>{s.jenjang} — {s.nama}</option>)}
            </Select>
          )}
          <Select containerClassName="w-44" value={golonganFilter} onChange={(e) => setGolonganFilter(e.target.value)}>
            <option value="">Semua Golongan</option>
            {Object.values(golonganMap).sort((a, b) => a.kode.localeCompare(b.kode)).map((g) => <option key={g.kode} value={g.kode}>{g.kode} — {g.nama}</option>)}
          </Select>
          <Select containerClassName="w-36" value={kondisiFilter} onChange={(e) => setKondisiFilter(e.target.value)}>
            <option value="">Semua Kondisi</option>
            {KONDISI_OPTIONS.map((k) => <option key={k} value={k}>{KONDISI_LABEL[k]}</option>)}
          </Select>
          {schoolId && (
            <Select containerClassName="w-36" value={ruanganFilter} onChange={(e) => setRuanganFilter(e.target.value)}>
              <option value="">Semua Ruangan</option>
              {ruanganList.map((r) => <option key={r.id} value={r.id}>{r.nama}</option>)}
            </Select>
          )}
          <label className="flex items-center gap-1.5 text-xs text-[var(--color-ink-soft)]">
            <input type="checkbox" checked={showDihapus} onChange={(e) => setShowDihapus(e.target.checked)} /> Tampilkan dihapus
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasFullAccess && <Button variant="outline" onClick={() => openCetak('buku_induk_inventaris')} title="Himpunan Buku Inventaris seluruh unit (Yayasan)"><Printer className="h-4 w-4" /> Buku Induk Inventaris</Button>}
          <Button onClick={() => { setEditingRow(null); setFormOpen(true) }} disabled={!schoolId && !hasFullAccess}><Plus className="h-4 w-4" /> Tambah Aset</Button>
        </div>
      </div>

      {loadError && <Card className="border-[var(--color-danger)] bg-[var(--color-danger-soft)]"><p className="text-sm text-[var(--color-danger)]">Gagal memuat: {loadError}</p></Card>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Jumlah Aset (baris)" value={totals.jumlah} />
        <StatCard label="Nilai Perolehan" value={formatRupiah(totals.perolehan)} />
        <StatCard label="Nilai Buku (setelah susut)" value={formatRupiah(totals.buku)} accent="gold" />
      </div>

      <SectionCard title="Buku Inventaris">
        {withPenyusutan.length === 0 ? (
          <EmptyState icon={Boxes} title="Belum ada aset" description={schoolId ? 'Tambahkan aset untuk unit ini.' : 'Pilih unit atau tambahkan aset.'} />
        ) : (
          <Table columns={['Kode Aset', 'Kode Lokasi', 'Nama', 'Klasifikasi', 'Ruangan', 'Kondisi', 'Perolehan', 'Nilai Buku', '']}>
            {withPenyusutan.map(({ r, p }) => (
              <Tr key={r.id}>
                <Td><span className="font-mono text-xs">{r.kode_aset || '—'}</span></Td>
                <Td><span className="font-mono text-xs text-[var(--color-ink-soft)]">{r.kode_lokasi || '—'}</span></Td>
                <Td>
                  <span className={r.status === 'dihapus' ? 'text-[var(--color-ink-soft)] line-through' : ''}>{r.nama}</span>
                  {hasFullAccess && <span className="block text-xs text-[var(--color-ink-soft)]">{r.schools?.jenjang} — {r.schools?.nama}</span>}
                </Td>
                <Td className="text-xs">{r.aset_klasifikasi?.uraian || '—'}</Td>
                <Td>{r.ruangan?.nama || '—'}</Td>
                <Td><Badge color={KONDISI_BADGE[r.kondisi]}>{KONDISI_LABEL[r.kondisi]}</Badge></Td>
                <Td>{formatRupiah(r.nilai_perolehan)}</Td>
                <Td className="font-medium">{formatRupiah(p.nilaiBuku)}{p.disusutkan && <span className="block text-[11px] font-normal text-[var(--color-ink-soft)]">susut {p.bulanBerjalan} bln</span>}</Td>
                <Td>
                  {r.status !== 'dihapus' && (
                    <div className="flex justify-end gap-1.5">
                      <button onClick={() => { setEditingRow(r); setFormOpen(true) }} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Ubah"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => handleDelete(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  )}
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </SectionCard>

      {schoolId && <DokumenAreaCard area="Inventaris" schoolId={schoolId} />}

      <AsetFormModal
        open={formOpen}
        editingRow={editingRow}
        schools={hasFullAccess ? schools : mySchools}
        defaultSchoolId={schoolId}
        klasifikasiList={klasifikasiList}
        onClose={() => { setFormOpen(false); setEditingRow(null) }}
        onSaved={() => { setFormOpen(false); setEditingRow(null); load() }}
      />
    </div>
  )
}

function AsetFormModal({ open, editingRow, schools, defaultSchoolId, klasifikasiList, onClose, onSaved }) {
  const [f, setF] = useState({})
  const [ruanganList, setRuanganList] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isEdit = !!editingRow

  useEffect(() => {
    if (!open) return
    setError('')
    if (editingRow) {
      setF({
        school_id: editingRow.school_id, klasifikasi_id: editingRow.klasifikasi_id || '', ruangan_id: editingRow.ruangan_id || '',
        nama: editingRow.nama || '', merk_tipe: editingRow.merk_tipe || '', tanggal_perolehan: editingRow.tanggal_perolehan || '',
        jumlah: String(editingRow.jumlah ?? 1), satuan: editingRow.satuan || 'unit', nilai_perolehan: editingRow.nilai_perolehan ?? '',
        sumber_dana: editingRow.sumber_dana || '', kondisi: editingRow.kondisi || 'baik', keterangan: editingRow.keterangan || '',
      })
    } else {
      setF({
        school_id: defaultSchoolId || (schools.length === 1 ? schools[0].id : ''), klasifikasi_id: '', ruangan_id: '',
        nama: '', merk_tipe: '', tanggal_perolehan: '', jumlah: '1', satuan: 'unit', nilai_perolehan: '', sumber_dana: '', kondisi: 'baik', keterangan: '',
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingRow])

  useEffect(() => {
    if (!f.school_id) { setRuanganList([]); return }
    supabase.from('ruangan').select('id, nama').eq('school_id', f.school_id).order('nama').then(({ data }) => setRuanganList(data || []))
  }, [f.school_id])

  const set = (k, v) => setF((prev) => ({ ...prev, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!f.school_id) { setError('Pilih unit.'); return }
    if (!f.klasifikasi_id) { setError('Pilih klasifikasi aset (untuk kode otomatis).'); return }
    if (!f.nama?.trim()) { setError('Isi nama aset.'); return }
    setSaving(true)
    const payload = {
      school_id: f.school_id,
      klasifikasi_id: f.klasifikasi_id,
      ruangan_id: f.ruangan_id || null,
      nama: f.nama.trim(),
      merk_tipe: f.merk_tipe?.trim() || null,
      tahun_perolehan: f.tanggal_perolehan ? new Date(f.tanggal_perolehan).getFullYear() : null,
      tanggal_perolehan: f.tanggal_perolehan || null,
      jumlah: Number(f.jumlah) || 1,
      satuan: f.satuan?.trim() || 'unit',
      nilai_perolehan: f.nilai_perolehan === '' ? 0 : Number(f.nilai_perolehan),
      sumber_dana: f.sumber_dana?.trim() || null,
      kondisi: f.kondisi,
      keterangan: f.keterangan?.trim() || null,
    }
    const query = isEdit
      ? supabase.from('aset').update(payload).eq('id', editingRow.id)
      : supabase.from('aset').insert(payload)
    const { error: err } = await query
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Ubah Aset' : 'Tambah Aset'} width="max-w-2xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Select label="Unit" required disabled={isEdit} value={f.school_id || ''} onChange={(e) => set('school_id', e.target.value)}>
          <option value="">— Pilih —</option>
          {schools.map((s) => <option key={s.id} value={s.id}>{s.jenjang} — {s.nama}</option>)}
        </Select>
        <KlasifikasiPicker klasifikasiList={klasifikasiList} value={f.klasifikasi_id} onChange={(v) => set('klasifikasi_id', v)} />
        <p className="-mt-1 flex items-start gap-1.5 rounded-md bg-[var(--color-navy-50)] px-3 py-2 text-xs text-[var(--color-ink-soft)]">
          Kode Aset & Kode Lokasi dibuat OTOMATIS saat disimpan (dari klasifikasi + ruangan + tahun perolehan). Anda tidak perlu mengetik kode.
        </p>
        <Input label="Nama Aset" required value={f.nama || ''} onChange={(e) => set('nama', e.target.value)} placeholder="Contoh: Lemari Besi Arsip" />
        <div className="grid grid-cols-3 gap-3">
          <Input label="Merk / Tipe" value={f.merk_tipe || ''} onChange={(e) => set('merk_tipe', e.target.value)} />
          <Select label="Ruangan" containerClassName="col-span-2" value={f.ruangan_id || ''} onChange={(e) => set('ruangan_id', e.target.value)}>
            <option value="">— Tidak diletakkan —</option>
            {ruanganList.map((r) => <option key={r.id} value={r.id}>{r.nama}</option>)}
          </Select>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <Input label="Jumlah" type="number" value={f.jumlah ?? ''} onChange={(e) => set('jumlah', e.target.value)} />
          <Input label="Satuan" value={f.satuan || ''} onChange={(e) => set('satuan', e.target.value)} placeholder="unit/buah/set" />
          <Input label="Tanggal Perolehan" type="date" value={f.tanggal_perolehan || ''} onChange={(e) => set('tanggal_perolehan', e.target.value)} />
          <Select label="Kondisi" value={f.kondisi || 'baik'} onChange={(e) => set('kondisi', e.target.value)}>
            {KONDISI_OPTIONS.map((k) => <option key={k} value={k}>{KONDISI_LABEL[k]}</option>)}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Nilai Perolehan (Rp)" type="number" value={f.nilai_perolehan ?? ''} onChange={(e) => set('nilai_perolehan', e.target.value)} placeholder="total untuk seluruh jumlah" />
          <Input label="Sumber Dana" value={f.sumber_dana || ''} onChange={(e) => set('sumber_dana', e.target.value)} placeholder="BOS / Yayasan / Hibah" />
        </div>
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
// TAB: RUANGAN (dasar KIR) — dengan kode & PIC
// =========================================================================
const KODE_RUANG_KELAS = '03' // kode unit kerja baku untuk Ruang Kelas (master unit_kerja_kode)

// Nomor Kode Ruangan berikutnya (2 digit) untuk satu unit kerja di sekolah ybs.
function nextKodeRuangan(rows, unitKode, excludeId) {
  const used = (rows || [])
    .filter((r) => (r.kode_unit_kerja || '') === unitKode && r.id !== excludeId)
    .map((r) => parseInt(r.kode_ruangan, 10))
    .filter((n) => !Number.isNaN(n))
  return String((used.length ? Math.max(...used) : 0) + 1).padStart(2, '0')
}

function RuanganTab({ hasFullAccess, mySchools }) {
  const { schools, schoolId, setSchoolId } = useUnitFilter(hasFullAccess, mySchools)
  const [rows, setRows] = useState([])
  const [counts, setCounts] = useState({})
  const [unitKerjaList, setUnitKerjaList] = useState([])
  const [rombelList, setRombelList] = useState([])
  const [taNama, setTaNama] = useState('')
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editingRow, setEditingRow] = useState(null)
  const [asetRoom, setAsetRoom] = useState(null)   // ruangan yang dilihat daftar asetnya (KIR)

  // Master unit kerja dimuat sekali (lintas sekolah).
  useEffect(() => {
    supabase.from('unit_kerja_kode').select('kode, nama').eq('aktif', true).order('urutan')
      .then(({ data }) => setUnitKerjaList(data || []))
  }, [])

  const load = useCallback(async () => {
    if (!schoolId) { setRows([]); setCounts({}); setRombelList([]); setTaNama(''); setLoading(false); return }
    setLoading(true)
    const { data: ta } = await supabase.from('tahun_ajaran').select('id, nama').eq('status', 'aktif').maybeSingle()
    const [{ data: r }, { data: aset }, { data: rb }] = await Promise.all([
      supabase.from('ruangan').select('*, employees:pic_employee_id(nama), rombel:rombel_id(nama_rombel, wali_kelas_employee_id, wali:wali_kelas_employee_id(nama))').eq('school_id', schoolId).order('nama'),
      supabase.from('aset').select('ruangan_id').eq('school_id', schoolId).eq('status', 'aktif'),
      ta ? supabase.from('rombel').select('id, nama_rombel, tingkat, wali_kelas_employee_id, wali:wali_kelas_employee_id(nama)').eq('school_id', schoolId).eq('tahun_ajaran_id', ta.id).order('nama_rombel') : Promise.resolve({ data: [] }),
    ])
    const c = {}
    for (const a of (aset || [])) if (a.ruangan_id) c[a.ruangan_id] = (c[a.ruangan_id] || 0) + 1
    setRows(r || [])
    setCounts(c)
    setRombelList(rb || [])
    setTaNama(ta?.nama || '')
    setLoading(false)
  }, [schoolId])

  useEffect(() => { load() }, [load])

  const handleDelete = async (row) => {
    if (!confirm(`Hapus ruangan "${row.nama}"? Aset di dalamnya tidak ikut terhapus.`)) return
    const { error } = await supabase.from('ruangan').delete().eq('id', row.id)
    if (error) { alert('Gagal: ' + error.message); return }
    load()
  }

  // Buat ruang kelas otomatis dari daftar kelas (rombel) tahun ajaran aktif —
  // hanya untuk rombel yang belum punya ruangan tertaut; kode ruangan berurut.
  const generateFromRombel = async () => {
    if (!schoolId) return
    if (rombelList.length === 0) { alert(taNama ? `Belum ada kelas (rombel) pada ${taNama}.` : 'Belum ada tahun ajaran aktif.'); return }
    const sudahTertaut = new Set(rows.filter((r) => r.rombel_id).map((r) => r.rombel_id))
    const namaDipakai = new Set(rows.map((r) => (r.nama || '').trim().toLowerCase()))
    let nomor = parseInt(nextKodeRuangan(rows, KODE_RUANG_KELAS), 10)
    const toCreate = []
    const bentrokNama = []
    for (const rb of rombelList) {
      if (sudahTertaut.has(rb.id)) continue
      const nama = `Kelas ${rb.nama_rombel}`
      if (namaDipakai.has(nama.toLowerCase())) { bentrokNama.push(rb.nama_rombel); continue }
      toCreate.push({ school_id: schoolId, nama, jenis: 'kelas', rombel_id: rb.id, kode_unit_kerja: KODE_RUANG_KELAS, kode_ruangan: String(nomor).padStart(2, '0'), lantai: null, pic_employee_id: rb.wali_kelas_employee_id || null, pic_nama: null, keterangan: `Dibuat otomatis dari kelas ${rb.nama_rombel} (${taNama}).${rb.wali?.nama ? ` PIC: Wali Kelas ${rb.wali.nama}.` : ''}` })
      nomor += 1
    }
    if (toCreate.length === 0) {
      alert(bentrokNama.length ? `Semua kelas sudah punya ruangan. Nama bentrok (lewati): ${bentrokNama.join(', ')}.` : 'Semua kelas tahun ajaran aktif sudah punya ruangan.')
      return
    }
    const pesan = `Buat ${toCreate.length} ruang kelas dari daftar kelas ${taNama}?` + (bentrokNama.length ? `\n\n${bentrokNama.length} kelas dilewati karena nama ruangan sudah ada: ${bentrokNama.join(', ')}.` : '')
    if (!confirm(pesan)) return
    setGenerating(true)
    const { error } = await supabase.from('ruangan').insert(toCreate)
    setGenerating(false)
    if (error) { alert('Gagal: ' + error.message); return }
    load()
  }

  if (loading) return <FullPageSpinner />

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {hasFullAccess ? (
          <Select containerClassName="w-52" value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
            <option value="">— Pilih Unit —</option>
            {schools.map((s) => <option key={s.id} value={s.id}>{s.jenjang} — {s.nama}</option>)}
          </Select>
        ) : <span />}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={generateFromRombel} disabled={!schoolId || generating || rombelList.length === 0} title={rombelList.length === 0 ? 'Belum ada kelas pada tahun ajaran aktif' : `Buat ruang kelas dari ${rombelList.length} kelas ${taNama}`}>
            <BookOpen className="h-4 w-4" /> {generating ? 'Memproses…' : 'Buat ruangan dari kelas'}
          </Button>
          <Button onClick={() => { setEditingRow(null); setFormOpen(true) }} disabled={!schoolId}><Plus className="h-4 w-4" /> Tambah Ruangan</Button>
        </div>
      </div>

      <SectionCard title="Daftar Ruangan" description="Kode Unit Kerja (dari master kodefikasi) & Kode Ruangan (otomatis) menyusun Kode Lokasi aset. Ruang kelas dapat ditautkan ke kelas (rombel) di Kesiswaan.">
        {!schoolId ? (
          <p className="text-sm text-[var(--color-ink-soft)]">Pilih unit lebih dulu.</p>
        ) : rows.length === 0 ? (
          <EmptyState icon={DoorOpen} title="Belum ada ruangan" description="Tambahkan ruangan, atau klik “Buat ruangan dari kelas” untuk menarik dari daftar kelas Kesiswaan." />
        ) : (
          <Table columns={['Kode Unit', 'Kode Ruang', 'Nama Ruangan', 'Jenis / Kelas', 'Lantai', 'PIC', 'Jml Aset', '']}>
            {rows.map((r) => (
              <Tr key={r.id}>
                <Td><span className="font-mono text-xs">{r.kode_unit_kerja || '—'}</span></Td>
                <Td><span className="font-mono text-xs">{r.kode_ruangan || '—'}</span></Td>
                <Td>{r.nama}</Td>
                <Td>{r.jenis === 'kelas' ? <Badge color="navy">Kelas{r.rombel?.nama_rombel ? ` · ${r.rombel.nama_rombel}` : ''}</Badge> : <span className="text-xs text-[var(--color-ink-soft)]">Umum</span>}</Td>
                <Td>{r.lantai || '—'}</Td>
                <Td>{r.jenis === 'kelas' && r.rombel?.wali?.nama
                  ? <span>{r.rombel.wali.nama} <span className="block text-[11px] text-[var(--color-ink-soft)]">Wali Kelas{r.rombel?.nama_rombel ? ` ${r.rombel.nama_rombel}` : ''}</span></span>
                  : (r.employees?.nama || r.pic_nama || '—')}</Td>
                <Td><button onClick={() => setAsetRoom(r)} className="font-medium text-[var(--color-navy)] hover:underline" aria-label="Lihat aset di ruangan">{counts[r.id] || 0}</button></Td>
                <Td>
                  <div className="flex justify-end gap-1.5">
                    <button onClick={() => setAsetRoom(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Lihat Aset (KIR)" title="Lihat aset di ruangan (KIR)"><Info className="h-4 w-4" /></button>
                    <button onClick={() => { setEditingRow(r); setFormOpen(true) }} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Ubah"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => handleDelete(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </SectionCard>

      <RuanganFormModal open={formOpen} editingRow={editingRow} schoolId={schoolId} unitKerjaList={unitKerjaList} rombelList={rombelList} existingRows={rows} onClose={() => { setFormOpen(false); setEditingRow(null) }} onSaved={() => { setFormOpen(false); setEditingRow(null); load() }} />
      <RuanganAsetModal room={asetRoom} onClose={() => setAsetRoom(null)} />
    </div>
  )
}

// Daftar aset di satu ruangan = isi Kartu Inventaris Ruangan (KIR).
// Terintegrasi dengan dokumen KIR: bisa dipratinjau & dicetak langsung.
function RuanganAsetModal({ room, onClose }) {
  const open = !!room
  const [aset, setAset] = useState([])
  const [loading, setLoading] = useState(false)
  const [previewKir, setPreviewKir] = useState(false)

  useEffect(() => {
    if (!room) { setAset([]); return }
    let batal = false
    setLoading(true)
    supabase.from('aset')
      .select('id, kode_aset, nama, merk_tipe, jumlah, satuan, kondisi, nilai_perolehan, tahun_perolehan, aset_klasifikasi(uraian)')
      .eq('ruangan_id', room.id).eq('status', 'aktif').order('nama')
      .then(({ data }) => { if (!batal) { setAset(data || []); setLoading(false) } })
    return () => { batal = true }
  }, [room])

  if (!open) return null
  const totalNilai = aset.reduce((s, a) => s + Number(a.nilai_perolehan || 0), 0)
  const totalUnit = aset.reduce((s, a) => s + Number(a.jumlah || 0), 0)

  return (
    <Modal open={open} onClose={onClose} title={`Aset di ${room.nama} — KIR`} width="max-w-3xl">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--color-ink-soft)]">
          <span>Kode Unit <b className="font-mono text-[var(--color-ink)]">{room.kode_unit_kerja || '—'}</b></span>
          <span>Kode Ruang <b className="font-mono text-[var(--color-ink)]">{room.kode_ruangan || '—'}</b></span>
          {room.lantai && <span>Lantai <b className="text-[var(--color-ink)]">{room.lantai}</b></span>}
          <span>PIC <b className="text-[var(--color-ink)]">{room.jenis === 'kelas' && room.rombel?.wali?.nama ? `${room.rombel.wali.nama} (Wali Kelas)` : (room.employees?.nama || room.pic_nama || '—')}</b></span>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Jenis Aset" value={aset.length} />
          <StatCard label="Total Unit" value={totalUnit} />
          <StatCard label="Nilai Perolehan" value={formatRupiah(totalNilai)} accent="gold" />
        </div>

        {loading ? (
          <p className="text-sm text-[var(--color-ink-soft)]">Memuat…</p>
        ) : aset.length === 0 ? (
          <EmptyState icon={Package} title="Belum ada aset di ruangan ini" description="Aset yang disalurkan/ditempatkan ke ruangan ini akan muncul di sini." />
        ) : (
          <div className="overflow-x-auto">
            <Table columns={['Kode Aset', 'Nama & Klasifikasi', 'Merk/Tipe', 'Jumlah', 'Kondisi', 'Nilai']}>
              {aset.map((a) => (
                <Tr key={a.id}>
                  <Td><span className="font-mono text-xs">{a.kode_aset || '—'}</span></Td>
                  <Td><span className="font-medium">{a.nama}</span>{a.aset_klasifikasi?.uraian && <span className="block text-[11px] text-[var(--color-ink-soft)]">{a.aset_klasifikasi.uraian}</span>}</Td>
                  <Td className="text-xs">{a.merk_tipe || '—'}</Td>
                  <Td>{Number(a.jumlah ?? 1)} <span className="text-[11px] text-[var(--color-ink-soft)]">{a.satuan}</span></Td>
                  <Td><Badge color={KONDISI_BADGE[a.kondisi]}>{KONDISI_LABEL[a.kondisi]}</Badge></Td>
                  <Td className="text-xs">{formatRupiah(a.nilai_perolehan)}</Td>
                </Tr>
              ))}
            </Table>
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={() => setPreviewKir(true)}><Info className="h-4 w-4" /> Pratinjau KIR</Button>
          <Button variant="outline" onClick={() => openCetak('kir', room.id)}><Printer className="h-4 w-4" /> Cetak KIR</Button>
          <Button onClick={onClose}>Tutup</Button>
        </div>
      </div>
      {previewKir && <DokumenPreviewModal jenis="kir" id={room.id} onClose={() => setPreviewKir(false)} />}
    </Modal>
  )
}

function RuanganFormModal({ open, editingRow, schoolId, unitKerjaList = [], rombelList = [], existingRows = [], onClose, onSaved }) {
  const [f, setF] = useState({})
  const [pegawai, setPegawai] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isEdit = !!editingRow

  useEffect(() => {
    if (!open) return
    setError('')
    setF(editingRow
      ? { jenis: editingRow.jenis || 'umum', rombel_id: editingRow.rombel_id || '', kode_unit_kerja: editingRow.kode_unit_kerja || '', kode_ruangan: editingRow.kode_ruangan || '', nama: editingRow.nama || '', lantai: editingRow.lantai || '', pic_employee_id: editingRow.pic_employee_id || '', pic_nama: editingRow.pic_nama || '', keterangan: editingRow.keterangan || '' }
      : { jenis: 'umum', rombel_id: '', kode_unit_kerja: '', kode_ruangan: '', nama: '', lantai: '', pic_employee_id: '', pic_nama: '', keterangan: '' })
  }, [open, editingRow])

  useEffect(() => {
    if (!open || !schoolId) return
    supabase.from('employees').select('id, nama').eq('school_id', schoolId).eq('status', 'aktif').order('nama').then(({ data }) => setPegawai(data || []))
  }, [open, schoolId])

  const set = (k, v) => setF((prev) => ({ ...prev, [k]: v }))
  const pad2 = (v) => (v === '' ? '' : String(v).replace(/\D/g, '').slice(0, 2))

  // Ganti unit kerja → saran Kode Ruangan berikutnya (hanya untuk ruangan baru,
  // agar kode ruangan yang sudah tersimpan tidak tergeser).
  const pilihUnitKerja = (kode) => {
    setF((prev) => ({ ...prev, kode_unit_kerja: kode, kode_ruangan: isEdit ? prev.kode_ruangan : (kode ? nextKodeRuangan(existingRows, kode) : '') }))
  }

  // Ganti jenis → 'kelas' default ke unit kerja Ruang Kelas (03) + saran kode.
  const pilihJenis = (jenis) => {
    if (jenis === 'kelas') {
      const adaKelas = unitKerjaList.some((u) => u.kode === KODE_RUANG_KELAS)
      setF((prev) => ({ ...prev, jenis, kode_unit_kerja: adaKelas ? KODE_RUANG_KELAS : prev.kode_unit_kerja, kode_ruangan: isEdit ? prev.kode_ruangan : (adaKelas ? nextKodeRuangan(existingRows, KODE_RUANG_KELAS) : prev.kode_ruangan) }))
    } else {
      setF((prev) => ({ ...prev, jenis, rombel_id: '' }))
    }
  }

  // Pilih kelas (rombel) → isi nama ruangan otomatis bila masih kosong, dan
  // jadikan Wali Kelas sebagai PIC ruangan (integrasi data Kesiswaan).
  const pilihRombel = (id) => {
    const rb = rombelList.find((x) => x.id === id)
    setF((prev) => ({
      ...prev,
      rombel_id: id,
      nama: prev.nama?.trim() ? prev.nama : (rb ? `Kelas ${rb.nama_rombel}` : prev.nama),
      pic_employee_id: rb?.wali_kelas_employee_id || prev.pic_employee_id,
      pic_nama: rb?.wali_kelas_employee_id ? '' : prev.pic_nama,
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!f.nama?.trim()) { setError('Isi nama ruangan.'); return }
    setSaving(true)
    const payload = {
      school_id: schoolId,
      jenis: f.jenis === 'kelas' ? 'kelas' : 'umum',
      rombel_id: f.jenis === 'kelas' ? (f.rombel_id || null) : null,
      kode_unit_kerja: f.kode_unit_kerja ? String(f.kode_unit_kerja).padStart(2, '0') : null,
      kode_ruangan: f.kode_ruangan ? String(f.kode_ruangan).padStart(2, '0') : null,
      nama: f.nama.trim(),
      lantai: f.lantai?.trim() || null,
      pic_employee_id: f.pic_employee_id || null,
      pic_nama: f.pic_employee_id ? null : (f.pic_nama?.trim() || null),
      keterangan: f.keterangan?.trim() || null,
    }
    const query = isEdit ? supabase.from('ruangan').update(payload).eq('id', editingRow.id) : supabase.from('ruangan').insert(payload)
    const { error: err } = await query
    setSaving(false)
    if (err) { setError(err.message.includes('duplicate') ? 'Nama ruangan sudah ada di unit ini.' : err.message); return }
    onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Ubah Ruangan' : 'Tambah Ruangan'} width="max-w-lg">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Select label="Jenis Ruangan" value={f.jenis || 'umum'} onChange={(e) => pilihJenis(e.target.value)}>
            <option value="umum">Ruangan Umum</option>
            <option value="kelas">Ruang Kelas</option>
          </Select>
          {f.jenis === 'kelas' && (
            <Select label="Kelas (rombel) — Kesiswaan" value={f.rombel_id || ''} onChange={(e) => pilihRombel(e.target.value)}>
              <option value="">— Belum ditautkan —</option>
              {rombelList.map((rb) => <option key={rb.id} value={rb.id}>{rb.nama_rombel}</option>)}
            </Select>
          )}
        </div>
        <Input label="Nama Ruangan" required value={f.nama || ''} onChange={(e) => set('nama', e.target.value)} placeholder="Contoh: Lab Komputer 1" />
        <div className="grid grid-cols-3 gap-3">
          <Select label="Unit Kerja" containerClassName="col-span-1" value={f.kode_unit_kerja || ''} onChange={(e) => pilihUnitKerja(e.target.value)}>
            <option value="">— Pilih —</option>
            {unitKerjaList.map((u) => <option key={u.kode} value={u.kode}>{u.kode} — {u.nama}</option>)}
          </Select>
          <Input label="Kode Ruangan" value={f.kode_ruangan || ''} onChange={(e) => set('kode_ruangan', pad2(e.target.value))} placeholder="otomatis" />
          <Input label="Lantai" value={f.lantai || ''} onChange={(e) => set('lantai', e.target.value)} />
        </div>
        <Select label="PIC Ruangan (pegawai)" value={f.pic_employee_id || ''} onChange={(e) => set('pic_employee_id', e.target.value)}>
          <option value="">— Pilih pegawai / isi manual di bawah —</option>
          {pegawai.map((p) => <option key={p.id} value={p.id}>{p.nama}</option>)}
        </Select>
        {f.jenis === 'kelas' && f.rombel_id && (() => {
          const rb = rombelList.find((x) => x.id === f.rombel_id)
          return rb?.wali?.nama
            ? <p className="-mt-1 text-xs text-[var(--color-ink-soft)]">PIC terisi otomatis dari Wali Kelas <b>{rb.wali.nama}</b> ({rb.nama_rombel}). Dapat diganti bila perlu.</p>
            : <p className="-mt-1 text-xs text-[var(--color-gold)]">Kelas ini belum punya Wali Kelas di Kesiswaan — tetapkan wali kelas atau pilih PIC manual.</p>
        })()}
        {!f.pic_employee_id && (
          <Input label="PIC (tulis manual, bila bukan pegawai terdaftar)" value={f.pic_nama || ''} onChange={(e) => set('pic_nama', e.target.value)} />
        )}
        <Textarea label="Keterangan (opsional)" rows={2} value={f.keterangan || ''} onChange={(e) => set('keterangan', e.target.value)} />
        <p className="text-xs text-[var(--color-ink-soft)]">Unit Kerja diambil dari master kodefikasi; Kode Ruangan terisi otomatis (nomor urut berikutnya) namun bisa disesuaikan. Keduanya menyusun Kode Lokasi aset: kepemilikan.lembaga.<b>unit</b>.<b>ruang</b>.tahun.</p>
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
// TAB: KODEFIKASI (Yayasan) — referensi klasifikasi + kebijakan penyusutan
// =========================================================================
function KodefikasiTab() {
  const [golongan, setGolongan] = useState([])
  const [klas, setKlas] = useState([])
  const [unitKerja, setUnitKerja] = useState([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [editGol, setEditGol] = useState(null)
  const [editUnit, setEditUnit] = useState(null) // {kode,...} edit | 'new' tambah | null

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: g }, { data: k }, { data: uk }] = await Promise.all([
      supabase.from('aset_golongan').select('*').order('kode'),
      supabase.from('aset_klasifikasi').select('*').order('kode'),
      supabase.from('unit_kerja_kode').select('*').order('urutan'),
    ])
    setGolongan(g || [])
    setKlas(k || [])
    setUnitKerja(uk || [])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const results = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return klas.slice(0, 30)
    return klas.filter((k) => k.uraian.toLowerCase().includes(s) || k.kode.includes(s)).slice(0, 50)
  }, [q, klas])

  if (loading) return <FullPageSpinner />

  return (
    <div className="flex flex-col gap-6">
      <SectionCard title="Kebijakan Penyusutan per Golongan" description="Umur ekonomis & nilai residu — dipakai menghitung Nilai Buku semua aset di golongan tsb.">
        <Table columns={['Kode', 'Golongan', 'Umur Ekonomis', 'Nilai Residu', '']}>
          {golongan.map((g) => (
            <Tr key={g.kode}>
              <Td><span className="font-mono">{g.kode}</span></Td>
              <Td>{g.nama}</Td>
              <Td>{umurLabel(g.umur_ekonomis_bulan)}</Td>
              <Td>{Number(g.nilai_residu_persen || 0)}%</Td>
              <Td><button onClick={() => setEditGol(g)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Ubah"><Pencil className="h-4 w-4" /></button></Td>
            </Tr>
          ))}
        </Table>
      </SectionCard>

      <SectionCard title="Tabel Kode Aset (Klasifikasi)" description={`${klas.length} klasifikasi — referensi kode yang dipakai auto-generate. Cari untuk memeriksa.`}>
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-3">
          <Search className="h-4 w-4 text-[var(--color-ink-soft)]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari kode atau nama klasifikasi…" className="w-full bg-transparent py-2 text-sm outline-none" />
        </div>
        <Table columns={['Kode', 'Uraian', 'Golongan']}>
          {results.map((k) => (
            <Tr key={k.id}>
              <Td><span className="font-mono text-xs">{k.kode}</span></Td>
              <Td>{k.uraian}</Td>
              <Td className="text-xs text-[var(--color-ink-soft)]">{k.golongan}</Td>
            </Tr>
          ))}
        </Table>
      </SectionCard>

      <SectionCard
        title="Kode Unit Kerja (Ruangan)"
        description="Segmen 'unit' pada Kode Lokasi aset — dipakai saat menambah ruangan. Kode '03' (Ruang Kelas) dipakai otomatis saat men-generate ruang kelas dari data Kesiswaan."
        actions={<Button size="sm" onClick={() => setEditUnit('new')}><Plus className="h-4 w-4" /> Tambah</Button>}
      >
        <Table columns={['Kode', 'Nama Unit Kerja', 'Status', '']}>
          {unitKerja.map((u) => (
            <Tr key={u.kode}>
              <Td><span className="font-mono text-xs">{u.kode}</span></Td>
              <Td>{u.nama}</Td>
              <Td>{u.aktif ? <Badge color="success">Aktif</Badge> : <Badge color="neutral">Nonaktif</Badge>}</Td>
              <Td><div className="flex justify-end"><button onClick={() => setEditUnit(u)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Ubah"><Pencil className="h-4 w-4" /></button></div></Td>
            </Tr>
          ))}
        </Table>
      </SectionCard>

      <GolonganFormModal golongan={editGol} onClose={() => setEditGol(null)} onSaved={() => { setEditGol(null); load() }} />
      <UnitKerjaFormModal entry={editUnit} existing={unitKerja} onClose={() => setEditUnit(null)} onSaved={() => { setEditUnit(null); load() }} />
    </div>
  )
}

function UnitKerjaFormModal({ entry, existing = [], onClose, onSaved }) {
  const isNew = entry === 'new'
  const open = !!entry
  const [kode, setKode] = useState('')
  const [nama, setNama] = useState('')
  const [aktif, setAktif] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    setKode(isNew ? '' : (entry.kode || ''))
    setNama(isNew ? '' : (entry.nama || ''))
    setAktif(isNew ? true : !!entry.aktif)
  }, [open, isNew, entry])

  if (!open) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    const k = String(kode).replace(/\D/g, '').slice(0, 2)
    if (isNew && k.length !== 2) { setError('Kode harus 2 digit angka.'); return }
    if (!nama.trim()) { setError('Isi nama unit kerja.'); return }
    if (isNew && existing.some((u) => u.kode === k)) { setError(`Kode ${k} sudah dipakai.`); return }
    setSaving(true)
    const query = isNew
      ? supabase.from('unit_kerja_kode').insert({ kode: k, nama: nama.trim(), aktif, urutan: (existing.reduce((m, u) => Math.max(m, u.urutan || 0), 0) + 1) })
      : supabase.from('unit_kerja_kode').update({ nama: nama.trim(), aktif }).eq('kode', entry.kode)
    const { error: err } = await query
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title={isNew ? 'Tambah Kode Unit Kerja' : `Ubah Unit Kerja ${entry.kode}`} width="max-w-sm">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Input label="Kode (2 digit)" value={kode} onChange={(e) => setKode(e.target.value.replace(/\D/g, '').slice(0, 2))} disabled={!isNew} placeholder="mis. 16" />
        <Input label="Nama Unit Kerja" required value={nama} onChange={(e) => setNama(e.target.value)} placeholder="mis. Ruang Multimedia" />
        <label className="flex items-center gap-2 text-sm text-[var(--color-ink)]">
          <input type="checkbox" checked={aktif} onChange={(e) => setAktif(e.target.checked)} /> Aktif (tampil di pilihan ruangan)
        </label>
        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button>
        </div>
      </form>
    </Modal>
  )
}

function GolonganFormModal({ golongan, onClose, onSaved }) {
  const [umurTahun, setUmurTahun] = useState('')
  const [residu, setResidu] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (golongan) {
      setUmurTahun(golongan.umur_ekonomis_bulan ? String(golongan.umur_ekonomis_bulan / 12) : '')
      setResidu(String(golongan.nilai_residu_persen ?? 0))
      setError('')
    }
  }, [golongan])

  if (!golongan) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('aset_golongan').update({
      umur_ekonomis_bulan: umurTahun === '' ? null : Math.round(Number(umurTahun) * 12),
      nilai_residu_persen: residu === '' ? 0 : Number(residu),
    }).eq('kode', golongan.kode)
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  return (
    <Modal open={!!golongan} onClose={onClose} title={`Kebijakan Penyusutan — ${golongan.nama}`}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Umur Ekonomis (tahun)" type="number" value={umurTahun} onChange={(e) => setUmurTahun(e.target.value)} placeholder="kosongkan = tak disusutkan" />
          <Input label="Nilai Residu (%)" type="number" value={residu} onChange={(e) => setResidu(e.target.value)} />
        </div>
        <p className="text-xs text-[var(--color-ink-soft)]">Penyusutan garis lurus: (Nilai Perolehan − Residu) ÷ umur ekonomis. Kosongkan umur untuk golongan yang tak disusutkan (Tanah, Konstruksi dalam Pengerjaan).</p>
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
// TAB: PERENCANAAN (DKA — Daftar Kebutuhan Aset)
// Alur SOP: satuan pendidikan MENYUSUN & MENGAJUKAN → Yayasan MEMUTUSKAN
// (mengesahkan / mengembalikan). Kode aset otomatis dari klasifikasi;
// "Jumlah Tersedia" bisa ditarik dari Buku Inventaris (Tahap 1).
// =========================================================================
function DkaTab({ hasFullAccess, mySchools }) {
  const { schools, schoolId, setSchoolId } = useUnitFilter(hasFullAccess, mySchools)
  const nowY = new Date().getFullYear()
  const [tahun, setTahun] = useState(nowY)
  const years = [nowY - 1, nowY, nowY + 1, nowY + 2]
  const managesUnit = useMemo(() => mySchools.some((s) => s.id === schoolId), [mySchools, schoolId])

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        {hasFullAccess && (
          <Select containerClassName="w-52" value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
            <option value="">Semua Unit (rekap)</option>
            {schools.map((s) => <option key={s.id} value={s.id}>{s.jenjang} — {s.nama}</option>)}
          </Select>
        )}
        <Select containerClassName="w-36" value={tahun} onChange={(e) => setTahun(Number(e.target.value))}>
          {years.map((y) => <option key={y} value={y}>Tahun {y}</option>)}
        </Select>
      </div>

      {hasFullAccess && !schoolId ? (
        <DkaRekap tahun={tahun} onOpen={(sid) => setSchoolId(sid)} />
      ) : schoolId ? (
        <DkaDetail schoolId={schoolId} tahun={tahun} hasFullAccess={hasFullAccess} managesUnit={managesUnit} />
      ) : (
        <p className="text-sm text-[var(--color-ink-soft)]">Pilih unit lebih dulu.</p>
      )}

      <div className="flex flex-col gap-3">
        <h3 className="mt-2 text-sm font-semibold text-[var(--color-ink)]">3 Standar Perencanaan (acuan wajib) {hasFullAccess ? '' : '— hanya baca'}</h3>
        <StandarAsetPanel tahun={tahun} canEdit={hasFullAccess} />
        <StandarKebutuhanPanel tahun={tahun} canEdit={hasFullAccess} />
        <StandarHargaPanel tahun={tahun} canEdit={hasFullAccess} />
      </div>
    </div>
  )
}

function DkaRekap({ tahun, onOpen }) {
  const [rows, setRows] = useState([])
  const [totals, setTotals] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    ;(async () => {
      const { data: usulan } = await supabase
        .from('dka_usulan')
        .select('*, schools!school_id(nama, jenjang), diajukan_nama:dka_usulan_diajukan_nama')
        .eq('tahun', tahun)
        .order('created_at', { ascending: false })
      const ids = (usulan || []).map((u) => u.id)
      let t = {}
      if (ids.length) {
        const [{ data: items }, { data: pmel }] = await Promise.all([
          supabase.from('dka_usulan_item').select('usulan_id, jumlah_harga').in('usulan_id', ids),
          supabase.from('dka_pemeliharaan_item').select('usulan_id, jumlah_biaya').in('usulan_id', ids),
        ])
        for (const it of (items || [])) t[it.usulan_id] = (t[it.usulan_id] || 0) + Number(it.jumlah_harga || 0)
        for (const it of (pmel || [])) t[it.usulan_id] = (t[it.usulan_id] || 0) + Number(it.jumlah_biaya || 0)
      }
      if (!alive) return
      setRows(usulan || [])
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
        <StatCard label="Total Nilai Usulan" value={formatRupiah(grandTotal)} />
      </div>
      <SectionCard title={`Rekap Usulan DKA — Tahun ${tahun}`} description="Ringkasan usulan pengadaan seluruh satuan pendidikan. Klik untuk membuka & memutuskan.">
        {rows.length === 0 ? (
          <EmptyState icon={ClipboardList} title="Belum ada usulan" description="Belum ada satuan pendidikan yang menyusun DKA untuk tahun ini." />
        ) : (
          <Table columns={['Unit', 'Judul', 'Diajukan Oleh', 'Status', 'Total Nilai', '']}>
            {rows.map((r) => (
              <Tr key={r.id}>
                <Td>{r.schools?.jenjang} — {r.schools?.nama}</Td>
                <Td>{r.judul || '—'}</Td>
                <Td className="text-xs">{r.diajukan_nama || '—'}</Td>
                <Td><Badge color={DKA_STATUS_BADGE[r.status]}>{DKA_STATUS_LABEL[r.status]}</Badge></Td>
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

function DkaDetail({ schoolId, tahun, hasFullAccess, managesUnit }) {
  const [usulan, setUsulan] = useState(null)
  const [items, setItems] = useState([])
  const [pemel, setPemel] = useState([])
  const [klasifikasiList, setKlasifikasiList] = useState([])
  const [ruanganList, setRuanganList] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [subtab, setSubtab] = useState('pengadaan')
  const [formOpen, setFormOpen] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [pemelOpen, setPemelOpen] = useState(false)
  const [editingPemel, setEditingPemel] = useState(null)
  const [detail, setDetail] = useState(null)   // { item, jenis: 'pengadaan'|'pemeliharaan' }
  const [catatan, setCatatan] = useState(null)  // { item, jenis } — editor catatan revisi (Yayasan)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const [{ data: u }, { data: klas }, { data: ruang }] = await Promise.all([
      supabase.from('dka_usulan').select('*, diajukan_nama:dka_usulan_diajukan_nama').eq('school_id', schoolId).eq('tahun', tahun).maybeSingle(),
      supabase.from('aset_klasifikasi').select('*').order('kode'),
      supabase.from('ruangan').select('id, nama, jenis, pic_nama, employees:pic_employee_id(nama), rombel:rombel_id(wali:wali_kelas_employee_id(nama))').eq('school_id', schoolId).order('nama'),
    ])
    setUsulan(u || null)
    setKlasifikasiList(klas || [])
    setRuanganList(ruang || [])
    if (u) {
      const [{ data: it }, { data: pm }] = await Promise.all([
        supabase.from('dka_usulan_item').select('*, aset_klasifikasi(kode, uraian), ruangan(nama)').eq('usulan_id', u.id).order('urutan'),
        supabase.from('dka_pemeliharaan_item').select('*').eq('usulan_id', u.id).order('urutan'),
      ])
      setItems(it || [])
      setPemel(pm || [])
    } else { setItems([]); setPemel([]) }
    setLoading(false)
  }, [schoolId, tahun])

  useEffect(() => { load() }, [load])

  const status = usulan?.status
  const canEditItems = !!usulan && (hasFullAccess || (managesUnit && ['draft', 'dikembalikan'].includes(status)))
  const canSubmit = !!usulan && managesUnit && ['draft', 'dikembalikan'].includes(status)
  const canDecide = !!usulan && hasFullAccess && status === 'diajukan'
  const canCancelApproval = !!usulan && hasFullAccess && status === 'disahkan'
  // Yayasan boleh memberi catatan revisi per item saat menelaah (diajukan)
  // atau setelah dikembalikan (notanya tetap bisa disunting).
  const canReview = !!usulan && hasFullAccess && ['diajukan', 'dikembalikan'].includes(status)

  const totalPengadaan = useMemo(() => items.reduce((a, r) => a + Number(r.jumlah_harga || 0), 0), [items])
  const totalPemel = useMemo(() => pemel.reduce((a, r) => a + Number(r.jumlah_biaya || 0), 0), [pemel])

  const createUsulan = async () => {
    setBusy(true); setError('')
    const { error: err } = await supabase.from('dka_usulan').insert({ school_id: schoolId, tahun, status: 'draft' })
    setBusy(false)
    if (err) { setError(err.message.includes('duplicate') ? 'Usulan tahun ini sudah ada.' : err.message); return }
    load()
  }

  const setStatus = async (newStatus, catatan) => {
    if (newStatus === 'diajukan' && items.length === 0 && pemel.length === 0) { setError('Tambahkan minimal satu item (pengadaan atau pemeliharaan) sebelum mengajukan.'); return }
    setBusy(true); setError('')
    const patch = { status: newStatus }
    if (catatan !== undefined) patch.catatan_yayasan = catatan
    const { error: err } = await supabase.from('dka_usulan').update(patch).eq('id', usulan.id)
    setBusy(false)
    if (err) { setError(err.message); return }
    load()
  }

  const handleAjukan = () => setStatus('diajukan')
  const handleSahkan = () => { if (confirm('Sahkan DKA ini? Setelah disahkan, unit tidak dapat mengubahnya. DKA menjadi dasar RKAS & pengadaan.')) setStatus('disahkan') }
  const handleKembalikan = () => {
    const c = prompt('Catatan perbaikan untuk unit (alasan dikembalikan):')
    if (c === null) return
    setStatus('dikembalikan', c.trim() || 'Perlu perbaikan.')
  }
  const handleBatalkan = async () => {
    if (!confirm('Batalkan pengesahan DKA ini?\n\nDKA akan kembali ke status DRAFT dan seluruh progres pengadaan yang sudah berjalan akan DIHAPUS — prosedur perencanaan diulang dari awal. Lanjutkan?')) return
    setBusy(true); setError('')
    const { error: err } = await supabase.rpc('dka_batalkan_pengesahan', { p_usulan_id: usulan.id })
    setBusy(false)
    if (err) { setError(err.message); return }
    load()
  }

  const deleteItem = async (item) => {
    if (!confirm(`Hapus item "${item.nama_aset}"?`)) return
    const { error: err } = await supabase.from('dka_usulan_item').delete().eq('id', item.id)
    if (err) { alert('Gagal: ' + err.message); return }
    load()
  }
  const deletePemel = async (item) => {
    if (!confirm(`Hapus item pemeliharaan "${item.nama_aset}"?`)) return
    const { error: err } = await supabase.from('dka_pemeliharaan_item').delete().eq('id', item.id)
    if (err) { alert('Gagal: ' + err.message); return }
    load()
  }

  if (loading) return <FullPageSpinner />

  if (!usulan) {
    return (
      <SectionCard title={`DKA Tahun ${tahun}`}>
        <EmptyState
          icon={ClipboardList}
          title="Belum ada usulan DKA"
          description={managesUnit ? 'Susun Daftar Kebutuhan Aset (pengadaan & pemeliharaan) untuk diajukan ke Yayasan.' : 'Unit ini belum menyusun DKA untuk tahun tersebut.'}
        />
        {managesUnit && (
          <div className="mt-3 flex justify-center">
            <Button onClick={createUsulan} disabled={busy}><Plus className="h-4 w-4" /> Buat Usulan DKA {tahun}</Button>
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
              <h3 className="text-base font-semibold text-[var(--color-ink)]">Usulan DKA — Tahun {tahun}</h3>
              <Badge color={DKA_STATUS_BADGE[status]}>{DKA_STATUS_LABEL[status]}</Badge>
            </div>
            <p className="mt-1 text-xs text-[var(--color-ink-soft)]">Penanggung jawab: Kepala Satuan Pendidikan.{usulan.diajukan_nama ? ` Diajukan oleh ${usulan.diajukan_nama}${usulan.diajukan_at ? ` · ${new Date(usulan.diajukan_at).toLocaleDateString('id-ID')}` : ''}.` : ''}</p>
            {status === 'disahkan' && <p className="mt-2 rounded-md bg-[var(--color-success-soft)] px-3 py-2 text-sm text-[var(--color-success)]">DKA disahkan — menjadi dasar penyusunan RKAS BOS komponen Sarpras & proses pengadaan.</p>}
            {status === 'dikembalikan' && usulan.catatan_yayasan && (
              <p className="mt-2 rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]"><b>Catatan Yayasan:</b> {usulan.catatan_yayasan}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {canSubmit && <Button onClick={handleAjukan} disabled={busy}><Send className="h-4 w-4" /> Ajukan ke Yayasan</Button>}
            {canDecide && <Button onClick={handleSahkan} disabled={busy}><CheckCircle2 className="h-4 w-4" /> Sahkan</Button>}
            {canDecide && <Button variant="outline" onClick={handleKembalikan} disabled={busy}><RotateCcw className="h-4 w-4" /> Kembalikan</Button>}
            {canCancelApproval && <Button variant="outline" onClick={handleBatalkan} disabled={busy} className="text-[var(--color-danger)]"><RotateCcw className="h-4 w-4" /> Batalkan Pengesahan</Button>}
            <Button variant="outline" onClick={() => openCetak('dka', usulan.id)}><Printer className="h-4 w-4" /> Cetak DKA</Button>
          </div>
        </div>
        {error && <p className="mt-3 rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Item Pengadaan" value={items.length} />
        <StatCard label="Item Pemeliharaan" value={pemel.length} />
        <StatCard label="Total Pengadaan" value={formatRupiah(totalPengadaan)} accent="gold" />
        <StatCard label="Total Pemeliharaan" value={formatRupiah(totalPemel)} accent="gold" />
      </div>

      <div className="flex gap-1 border-b border-[var(--color-border)]">
        {[['pengadaan', `Rencana Pengadaan (${items.length})`], ['pemeliharaan', `Rencana Pemeliharaan (${pemel.length})`]].map(([k, lbl]) => (
          <button key={k} onClick={() => setSubtab(k)} className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${subtab === k ? 'border-[var(--color-navy)] text-[var(--color-navy)]' : 'border-transparent text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]'}`}>{lbl}</button>
        ))}
      </div>

      {subtab === 'pengadaan' && (
        <SectionCard
          title="Formulir Rencana Kebutuhan Pengadaan Aset"
          description="Riil = Maksimal − Tersedia (Tersedia ditarik dari Buku Inventaris). Kode Aset otomatis dari klasifikasi. Harga di atas standar butuh justifikasi."
          actions={canEditItems ? <Button size="sm" onClick={() => { setEditingItem(null); setFormOpen(true) }}><Plus className="h-4 w-4" /> Tambah Item</Button> : null}
        >
          {items.length === 0 ? (
            <EmptyState icon={ClipboardList} title="Belum ada item pengadaan" description="Tambahkan kebutuhan pengadaan aset." />
          ) : (
            <div className="overflow-x-auto">
              <Table columns={['Kode Aset', 'Nama & Spesifikasi', 'Alasan', 'Cara', 'Riil', 'Ajuan', 'Harga Satuan', 'Jumlah', 'Validasi', '']}>
                {items.map((r) => {
                  const v = validasiHargaItem(r)
                  return (
                    <Tr key={r.id}>
                      <Td><span className="font-mono text-xs">{r.aset_klasifikasi?.kode || '—'}</span></Td>
                      <Td>
                        <span className="font-medium">{r.nama_aset}</span>
                        {r.spesifikasi && <span className="block text-xs text-[var(--color-ink-soft)]">{r.spesifikasi}</span>}
                        {(r.ruangan?.nama || r.lokasi) && <span className="block text-[11px] text-[var(--color-ink-soft)]">📍 {r.ruangan?.nama || r.lokasi}</span>}
                        {r.catatan_revisi && <span className="mt-1 block rounded-md bg-[var(--color-gold-soft)] px-2 py-1 text-[11px] text-[var(--color-gold)]"><b>Catatan revisi:</b> {r.catatan_revisi}</span>}
                      </Td>
                      <Td className="text-xs">{r.alasan_kebutuhan || '—'}</Td>
                      <Td className="text-xs">{r.cara_pengadaan || '—'}</Td>
                      <Td>{Number(r.jumlah_riil)} <span className="text-[11px] text-[var(--color-ink-soft)]">{r.satuan}</span></Td>
                      <Td>{Number(r.jumlah_pengajuan)}</Td>
                      <Td>{formatRupiah(r.harga_satuan)}{r.standar_harga != null && <span className="block text-[11px] text-[var(--color-ink-soft)]">std {formatRupiah(r.standar_harga)}</span>}</Td>
                      <Td className="font-medium">{formatRupiah(r.jumlah_harga)}</Td>
                      <Td>
                        <Badge color={v.badge}>{v.label}</Badge>
                        {v.perluJustifikasi && !r.justifikasi && <span className="block text-[11px] text-[var(--color-danger)]">perlu justifikasi</span>}
                      </Td>
                      <Td>
                        <div className="flex justify-end gap-1.5">
                          <button onClick={() => setDetail({ item: r, jenis: 'pengadaan' })} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Detail"><Info className="h-4 w-4" /></button>
                          {canReview && <button onClick={() => setCatatan({ item: r, jenis: 'pengadaan' })} className={`hover:text-[var(--color-gold)] ${r.catatan_revisi ? 'text-[var(--color-gold)]' : 'text-[var(--color-ink-soft)]'}`} aria-label="Catatan revisi" title="Catatan revisi"><MessageSquare className="h-4 w-4" /></button>}
                          {canEditItems && <>
                            <button onClick={() => { setEditingItem(r); setFormOpen(true) }} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Ubah"><Pencil className="h-4 w-4" /></button>
                            <button onClick={() => deleteItem(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus"><Trash2 className="h-4 w-4" /></button>
                          </>}
                        </div>
                      </Td>
                    </Tr>
                  )
                })}
              </Table>
            </div>
          )}
        </SectionCard>
      )}

      {subtab === 'pemeliharaan' && (
        <SectionCard
          title="Formulir Rencana Kebutuhan Pemeliharaan Aset"
          description="Pilih aset dari Buku Inventaris (data & kondisi tertarik otomatis). Jumlah Biaya = Volume × Harga Satuan."
          actions={canEditItems ? <Button size="sm" onClick={() => { setEditingPemel(null); setPemelOpen(true) }}><Plus className="h-4 w-4" /> Tambah Item</Button> : null}
        >
          {pemel.length === 0 ? (
            <EmptyState icon={ClipboardList} title="Belum ada item pemeliharaan" description="Tambahkan rencana pemeliharaan aset yang sudah ada." />
          ) : (
            <div className="overflow-x-auto">
              <Table columns={['Kode Aset', 'Nama Aset', 'Kondisi', 'Jenis', 'Volume', 'Harga Satuan', 'Jumlah Biaya', '']}>
                {pemel.map((r) => (
                  <Tr key={r.id}>
                    <Td><span className="font-mono text-xs">{r.kode_aset || '—'}</span></Td>
                    <Td>
                      <span className="font-medium">{r.nama_aset}</span>
                      {(r.lokasi || r.nama_kegiatan) && <span className="block text-[11px] text-[var(--color-ink-soft)]">{r.lokasi ? `📍 ${r.lokasi}` : ''}{r.lokasi && r.nama_kegiatan ? ' · ' : ''}{r.nama_kegiatan || ''}</span>}
                      {r.catatan_revisi && <span className="mt-1 block rounded-md bg-[var(--color-gold-soft)] px-2 py-1 text-[11px] text-[var(--color-gold)]"><b>Catatan revisi:</b> {r.catatan_revisi}</span>}
                    </Td>
                    <Td><Badge color={KONDISI_BADGE[r.kondisi]}>{KONDISI_LABEL[r.kondisi]}</Badge></Td>
                    <Td className="text-xs">{r.jenis_pemeliharaan || '—'}</Td>
                    <Td>{Number(r.volume)} <span className="text-[11px] text-[var(--color-ink-soft)]">{r.satuan}</span></Td>
                    <Td>{formatRupiah(r.harga_satuan)}</Td>
                    <Td className="font-medium">{formatRupiah(r.jumlah_biaya)}</Td>
                    <Td>
                      <div className="flex justify-end gap-1.5">
                        <button onClick={() => setDetail({ item: r, jenis: 'pemeliharaan' })} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Detail"><Info className="h-4 w-4" /></button>
                        {canReview && <button onClick={() => setCatatan({ item: r, jenis: 'pemeliharaan' })} className={`hover:text-[var(--color-gold)] ${r.catatan_revisi ? 'text-[var(--color-gold)]' : 'text-[var(--color-ink-soft)]'}`} aria-label="Catatan revisi" title="Catatan revisi"><MessageSquare className="h-4 w-4" /></button>}
                        {canEditItems && <>
                          <button onClick={() => { setEditingPemel(r); setPemelOpen(true) }} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Ubah"><Pencil className="h-4 w-4" /></button>
                          <button onClick={() => deletePemel(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus"><Trash2 className="h-4 w-4" /></button>
                        </>}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </Table>
            </div>
          )}
        </SectionCard>
      )}

      <DokumenAreaCard area="Perencanaan" schoolId={schoolId} />

      <DkaItemModal
        open={formOpen}
        usulan={usulan}
        schoolId={schoolId}
        editingItem={editingItem}
        klasifikasiList={klasifikasiList}
        ruanganList={ruanganList}
        onClose={() => { setFormOpen(false); setEditingItem(null) }}
        onSaved={() => { setFormOpen(false); setEditingItem(null); load() }}
      />
      <DkaPemeliharaanModal
        open={pemelOpen}
        usulan={usulan}
        schoolId={schoolId}
        editingItem={editingPemel}
        onClose={() => { setPemelOpen(false); setEditingPemel(null) }}
        onSaved={() => { setPemelOpen(false); setEditingPemel(null); load() }}
      />
      <DkaItemDetailModal detail={detail} onClose={() => setDetail(null)} />
      <DkaCatatanRevisiModal data={catatan} onClose={() => setCatatan(null)} onSaved={() => { setCatatan(null); load() }} />
    </div>
  )
}

// Kartu detail informasi satu item DKA (pengadaan / pemeliharaan) — read-only.
function DkaItemDetailModal({ detail, onClose }) {
  const open = !!detail
  const r = detail?.item
  const jenis = detail?.jenis
  if (!open) return null

  const rp = (v) => formatRupiah(v || 0)
  const rows = jenis === 'pengadaan'
    ? [
        ['Kode Aset', r.aset_klasifikasi?.kode || '—', true],
        ['Klasifikasi', r.aset_klasifikasi?.uraian || '—'],
        ['Nama Aset', r.nama_aset || '—'],
        ['Merk & Spesifikasi', r.spesifikasi || '—'],
        ['Proker / Kegiatan', r.nama_kegiatan || '—'],
        ['Lokasi / Ruangan', r.ruangan?.nama || r.lokasi || '—'],
        ['Unit Kerja', r.unit_kerja || '—'],
        ['Penanggung Jawab', r.penanggung_jawab || '—'],
        ['Alasan Kebutuhan', r.alasan_kebutuhan || '—'],
        ['Cara Pengadaan', r.cara_pengadaan || '—'],
        ['Sumber Anggaran', r.sumber_anggaran || '—'],
        ['Jumlah Maksimal (ideal)', `${Number(r.jumlah_maksimal ?? 0)} ${r.satuan || ''}`],
        ['Tersedia (Inventaris)', `${Number(r.jumlah_tersedia ?? 0)} ${r.satuan || ''}`],
        ['Riil (kekurangan)', `${Number(r.jumlah_riil ?? 0)} ${r.satuan || ''}`],
        ['Jumlah Diajukan', `${Number(r.jumlah_pengajuan ?? 0)} ${r.satuan || ''}`],
        ['Harga Satuan', rp(r.harga_satuan)],
        ['Standar Harga', r.standar_harga == null ? '—' : rp(r.standar_harga)],
        ['Jumlah Harga', rp(r.jumlah_harga)],
        ['Justifikasi (harga di atas standar)', r.justifikasi || '—'],
      ]
    : [
        ['Kode Aset', r.kode_aset || '—', true],
        ['Nama Aset', r.nama_aset || '—'],
        ['Jumlah Aset', `${Number(r.jumlah_aset ?? 0)} ${r.satuan || ''}`],
        ['Lokasi', r.lokasi || '—'],
        ['Kondisi', KONDISI_LABEL[r.kondisi] || r.kondisi || '—'],
        ['Proker / Kegiatan', r.nama_kegiatan || '—'],
        ['Jenis Pemeliharaan', r.jenis_pemeliharaan || '—'],
        ['Volume', `${Number(r.volume ?? 0)} ${r.satuan || ''}`],
        ['Harga Satuan', rp(r.harga_satuan)],
        ['Jumlah Biaya', rp(r.jumlah_biaya)],
        ['Sumber Anggaran', r.sumber_anggaran || '—'],
        ['Keterangan', r.keterangan || '—'],
      ]

  return (
    <Modal open={open} onClose={onClose} title={`Detail Item — ${r.nama_aset || ''}`} width="max-w-xl">
      <dl className="divide-y divide-[var(--color-border)]">
        {rows.map(([label, value, mono]) => (
          <div key={label} className="grid grid-cols-3 gap-3 py-2">
            <dt className="text-[13px] text-[var(--color-ink-soft)]">{label}</dt>
            <dd className={`col-span-2 text-sm text-[var(--color-ink)] ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
          </div>
        ))}
        {r.catatan_revisi && (
          <div className="py-2">
            <p className="rounded-md bg-[var(--color-gold-soft)] px-3 py-2 text-sm text-[var(--color-gold)]"><b>Catatan revisi Yayasan:</b> {r.catatan_revisi}</p>
          </div>
        )}
      </dl>
      <div className="mt-3 flex justify-end">
        <Button variant="outline" onClick={onClose}>Tutup</Button>
      </div>
    </Modal>
  )
}

// Editor catatan revisi per item (hanya Yayasan). Menulis ke kolom catatan_revisi.
function DkaCatatanRevisiModal({ data, onClose, onSaved }) {
  const open = !!data
  const [teks, setTeks] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    setTeks(data.item.catatan_revisi || '')
  }, [open, data])

  if (!open) return null

  const table = data.jenis === 'pengadaan' ? 'dka_usulan_item' : 'dka_pemeliharaan_item'

  const simpan = async () => {
    setSaving(true); setError('')
    const { error: err } = await supabase.from(table).update({ catatan_revisi: teks.trim() || null }).eq('id', data.item.id)
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title={`Catatan Revisi — ${data.item.nama_aset || ''}`} width="max-w-md">
      <div className="flex flex-col gap-3">
        <p className="text-xs text-[var(--color-ink-soft)]">Catatan ini tampil pada item terkait agar unit tahu bagian mana yang perlu diperbaiki. Kosongkan lalu simpan untuk menghapus.</p>
        <Textarea label="Catatan perbaikan untuk item ini" rows={3} value={teks} onChange={(e) => setTeks(e.target.value)} placeholder="mis. Spesifikasi terlalu tinggi, sesuaikan dengan standar; atau harga perlu disurvei ulang." />
        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button onClick={simpan} disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan Catatan'}</Button>
        </div>
      </div>
    </Modal>
  )
}

// Form Rencana Kebutuhan Pemeliharaan — menunjuk aset dari Inventaris
// (BI/KIA/KIR sbg dokumen sumber); data & kondisi aset tertarik otomatis.
function DkaPemeliharaanModal({ open, usulan, schoolId, editingItem, onClose, onSaved }) {
  const [f, setF] = useState({})
  const [asetList, setAsetList] = useState([])
  const [q, setQ] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isEdit = !!editingItem

  useEffect(() => {
    if (!open) return
    setError(''); setQ('')
    if (editingItem) {
      setF({
        aset_id: editingItem.aset_id || '', kode_aset: editingItem.kode_aset || '', nama_aset: editingItem.nama_aset || '',
        jumlah_aset: String(editingItem.jumlah_aset ?? '1'), lokasi: editingItem.lokasi || '', kondisi: editingItem.kondisi || 'baik',
        nama_kegiatan: editingItem.nama_kegiatan || '', jenis_pemeliharaan: editingItem.jenis_pemeliharaan || '', volume: String(editingItem.volume ?? '0'),
        satuan: editingItem.satuan || 'unit', harga_satuan: String(editingItem.harga_satuan ?? '0'), sumber_anggaran: editingItem.sumber_anggaran || '', keterangan: editingItem.keterangan || '',
      })
    } else {
      setF({ aset_id: '', kode_aset: '', nama_aset: '', jumlah_aset: '1', lokasi: '', kondisi: 'baik', nama_kegiatan: '', jenis_pemeliharaan: '', volume: '1', satuan: 'unit', harga_satuan: '0', sumber_anggaran: '', keterangan: '' })
    }
  }, [open, editingItem])

  useEffect(() => {
    if (!open || !schoolId) return
    supabase.from('aset').select('id, kode_aset, nama, jumlah, satuan, kondisi, ruangan(nama)').eq('school_id', schoolId).eq('status', 'aktif').order('created_at', { ascending: false })
      .then(({ data }) => setAsetList(data || []))
  }, [open, schoolId])

  const set = (k, v) => setF((prev) => ({ ...prev, [k]: v }))

  const pilihAset = (a) => {
    setF((prev) => ({
      ...prev, aset_id: a.id, kode_aset: a.kode_aset || '', nama_aset: a.nama || '',
      jumlah_aset: String(a.jumlah ?? 1), satuan: a.satuan || prev.satuan, lokasi: a.ruangan?.nama || '', kondisi: a.kondisi || 'baik',
    }))
  }
  const lepasAset = () => setF((prev) => ({ ...prev, aset_id: '', kode_aset: '' }))

  const results = useMemo(() => {
    const s = q.trim().toLowerCase()
    const base = asetList.filter((a) => !s || (a.nama || '').toLowerCase().includes(s) || (a.kode_aset || '').includes(s))
    return base.slice(0, 20)
  }, [q, asetList])

  const jumlahBiaya = Number(f.volume || 0) * Number(f.harga_satuan || 0)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!f.nama_aset?.trim()) { setError('Pilih aset dari Inventaris atau isi nama aset.'); return }
    setSaving(true)
    const payload = {
      usulan_id: usulan.id,
      aset_id: f.aset_id || null,
      kode_aset: f.kode_aset || null,
      nama_aset: f.nama_aset.trim(),
      jumlah_aset: Number(f.jumlah_aset) || 0,
      lokasi: f.lokasi?.trim() || null,
      kondisi: f.kondisi,
      nama_kegiatan: f.nama_kegiatan?.trim() || null,
      jenis_pemeliharaan: f.jenis_pemeliharaan || null,
      volume: Number(f.volume) || 0,
      satuan: f.satuan?.trim() || 'unit',
      harga_satuan: Number(f.harga_satuan) || 0,
      sumber_anggaran: f.sumber_anggaran || null,
      keterangan: f.keterangan?.trim() || null,
    }
    const query = isEdit ? supabase.from('dka_pemeliharaan_item').update(payload).eq('id', editingItem.id) : supabase.from('dka_pemeliharaan_item').insert(payload)
    const { error: err } = await query
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Ubah Item Pemeliharaan' : 'Tambah Item Pemeliharaan'} width="max-w-2xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div>
          <label className="mb-1 block text-[13px] font-medium text-[var(--color-ink)]">Aset dari Inventaris (dokumen sumber BI/KIA/KIR)</label>
          {f.aset_id ? (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-paper)] px-3 py-2">
              <span className="text-sm text-[var(--color-ink)]"><span className="font-mono text-[var(--color-navy)]">{f.kode_aset || '—'}</span> — {f.nama_aset} {f.lokasi && <span className="text-[var(--color-ink-soft)]">· 📍 {f.lokasi}</span>}</span>
              <button type="button" onClick={lepasAset} className="text-xs text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]">ganti</button>
            </div>
          ) : (
            <div className="relative">
              <div className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-3">
                <Search className="h-4 w-4 text-[var(--color-ink-soft)]" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari aset yang akan dipelihara…" className="w-full bg-transparent py-2 text-sm outline-none" />
              </div>
              {results.length > 0 && (
                <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-[var(--color-border)] bg-white shadow-lg">
                  {results.map((a) => (
                    <button key={a.id} type="button" onClick={() => pilihAset(a)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--color-navy-50)]">
                      <span className="font-mono text-xs text-[var(--color-navy)]">{a.kode_aset || '—'}</span>
                      <span className="text-[var(--color-ink)]">{a.nama}</span>
                      {a.ruangan?.nama && <span className="text-[11px] text-[var(--color-ink-soft)]">· {a.ruangan.nama}</span>}
                    </button>
                  ))}
                </div>
              )}
              <p className="mt-1 text-[11px] text-[var(--color-ink-soft)]">Tak ada di daftar? Isi manual nama aset di bawah (mis. aset lama belum terinventaris).</p>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Nama Aset" required value={f.nama_aset || ''} onChange={(e) => set('nama_aset', e.target.value)} />
          <Input label="Nama Proker/Kegiatan" value={f.nama_kegiatan || ''} onChange={(e) => set('nama_kegiatan', e.target.value)} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Input label="Jumlah Aset" type="number" value={f.jumlah_aset ?? ''} onChange={(e) => set('jumlah_aset', e.target.value)} />
          <Input label="Lokasi" value={f.lokasi || ''} onChange={(e) => set('lokasi', e.target.value)} />
          <Select label="Kondisi" value={f.kondisi || 'baik'} onChange={(e) => set('kondisi', e.target.value)}>
            {KONDISI_OPTIONS.map((k) => <option key={k} value={k}>{KONDISI_LABEL[k]}</option>)}
          </Select>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <Select label="Jenis Pemeliharaan" value={f.jenis_pemeliharaan || ''} onChange={(e) => set('jenis_pemeliharaan', e.target.value)}>
            <option value="">—</option>
            {JENIS_PEMELIHARAAN_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </Select>
          <Input label="Volume" type="number" value={f.volume ?? ''} onChange={(e) => set('volume', e.target.value)} />
          <Input label="Satuan" value={f.satuan || ''} onChange={(e) => set('satuan', e.target.value)} />
          <Input label="Harga Satuan (Rp)" type="number" value={f.harga_satuan ?? ''} onChange={(e) => set('harga_satuan', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Sumber Anggaran" value={f.sumber_anggaran || ''} onChange={(e) => set('sumber_anggaran', e.target.value)}>
            <option value="">—</option>
            {SUMBER_ANGGARAN_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </Select>
          <div>
            <label className="mb-1 block text-[13px] font-medium text-[var(--color-ink)]">Jumlah Biaya</label>
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-paper)] px-3 py-2 text-sm font-medium">{formatRupiah(jumlahBiaya)}</div>
          </div>
        </div>
        <Textarea label="Keterangan / Uraian Pemeliharaan (opsional)" rows={2} value={f.keterangan || ''} onChange={(e) => set('keterangan', e.target.value)} />
        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button>
        </div>
      </form>
    </Modal>
  )
}

function DkaItemModal({ open, usulan, schoolId, editingItem, klasifikasiList, ruanganList, onClose, onSaved }) {
  const [f, setF] = useState({})
  const [bhpList, setBhpList] = useState([])
  const [saving, setSaving] = useState(false)
  const [ambil, setAmbil] = useState(false)
  const [error, setError] = useState('')
  const isEdit = !!editingItem

  // Daftar barang habis pakai yang sudah ada (untuk pemilih, bila item persediaan).
  useEffect(() => {
    if (!open || !schoolId) return
    supabase.from('barang_habis_pakai').select('id, nama, satuan').eq('school_id', schoolId).order('nama')
      .then(({ data }) => setBhpList(data || []))
  }, [open, schoolId])

  useEffect(() => {
    if (!open) return
    setError('')
    if (editingItem) {
      setF({
        klasifikasi_id: editingItem.klasifikasi_id || '', nama_aset: editingItem.nama_aset || '', spesifikasi: editingItem.spesifikasi || '',
        unit_kerja: editingItem.unit_kerja || '', nama_kegiatan: editingItem.nama_kegiatan || '', ruangan_id: editingItem.ruangan_id || '', lokasi: editingItem.lokasi || '',
        penanggung_jawab: editingItem.penanggung_jawab || '', alasan_kebutuhan: editingItem.alasan_kebutuhan || '', cara_pengadaan: editingItem.cara_pengadaan || '',
        sumber_anggaran: editingItem.sumber_anggaran || '', jumlah_maksimal: String(editingItem.jumlah_maksimal ?? '0'), jumlah_tersedia: String(editingItem.jumlah_tersedia ?? '0'),
        jumlah_pengajuan: String(editingItem.jumlah_pengajuan ?? '0'), satuan: editingItem.satuan || 'unit', harga_satuan: String(editingItem.harga_satuan ?? '0'),
        standar_harga: editingItem.standar_harga == null ? '' : String(editingItem.standar_harga), justifikasi: editingItem.justifikasi || '',
        is_habis_pakai: !!editingItem.is_habis_pakai, bhp_id: editingItem.bhp_id || '',
      })
    } else {
      setF({
        klasifikasi_id: '', nama_aset: '', spesifikasi: '', unit_kerja: '', nama_kegiatan: '', ruangan_id: '', lokasi: '', penanggung_jawab: '',
        alasan_kebutuhan: '', cara_pengadaan: '', sumber_anggaran: '', jumlah_maksimal: '1', jumlah_tersedia: '0', jumlah_pengajuan: '1', satuan: 'unit',
        harga_satuan: '0', standar_harga: '', justifikasi: '', is_habis_pakai: false, bhp_id: '',
      })
    }
  }, [open, editingItem])

  const set = (k, v) => setF((prev) => ({ ...prev, [k]: v }))

  // Penanggung jawab ruangan diambil dari PIC ruangan yang sudah dibuat —
  // untuk ruang kelas, PIC = Wali Kelas (integrasi data Kesiswaan).
  const picRuangan = (r) => (r?.jenis === 'kelas' && r?.rombel?.wali?.nama) ? r.rombel.wali.nama : (r?.employees?.nama || r?.pic_nama || '')

  // Pilih ruangan → kosongkan lokasi manual & isi Penanggung Jawab dari PIC
  // ruangan (bisa diganti bila perlu).
  const pilihRuangan = (id) => {
    const r = ruanganList.find((x) => x.id === id)
    setF((prev) => ({ ...prev, ruangan_id: id, lokasi: id ? '' : prev.lokasi, penanggung_jawab: id ? (picRuangan(r) || prev.penanggung_jawab) : prev.penanggung_jawab }))
  }

  // Pilih barang BHP yang sudah ada → tautkan (bhp_id) + samakan nama & satuan,
  // agar stok masuk ke barang itu tanpa bergantung kecocokan nama.
  const pilihBhp = (id) => {
    const b = bhpList.find((x) => x.id === id)
    setF((prev) => ({ ...prev, bhp_id: id, nama_aset: b ? b.nama : prev.nama_aset, satuan: b?.satuan || prev.satuan }))
  }

  // Saat klasifikasi dipilih: prefill nama & tarik Standar Harga tahun ybs.
  const onPickKlasifikasi = async (id) => {
    const k = klasifikasiList.find((x) => x.id === id)
    setF((prev) => ({ ...prev, klasifikasi_id: id, nama_aset: prev.nama_aset || (k?.uraian || '') }))
    if (!id) return
    const { data } = await supabase.from('dka_standar_harga').select('harga_maksimal, satuan').eq('klasifikasi_id', id).lte('tahun', usulan.tahun).order('tahun', { ascending: false }).limit(1)
    if (data && data[0]) setF((prev) => ({ ...prev, standar_harga: String(data[0].harga_maksimal), satuan: prev.satuan && prev.satuan !== 'unit' ? prev.satuan : (data[0].satuan || prev.satuan) }))
  }

  const ambilTersedia = async () => {
    if (!f.klasifikasi_id) { setError('Pilih klasifikasi dulu untuk menarik jumlah tersedia dari Inventaris.'); return }
    setAmbil(true); setError('')
    const { data, error: err } = await supabase.rpc('dka_hitung_tersedia', { p_school_id: schoolId, p_klasifikasi_id: f.klasifikasi_id })
    setAmbil(false)
    if (err) { setError('Gagal menarik: ' + err.message); return }
    set('jumlah_tersedia', String(data ?? 0))
  }

  const riil = Math.max(Number(f.jumlah_maksimal || 0) - Number(f.jumlah_tersedia || 0), 0)
  const jumlahHarga = Number(f.jumlah_pengajuan || 0) * Number(f.harga_satuan || 0)
  const validasi = validasiHargaItem(f)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!f.nama_aset?.trim()) { setError('Isi nama aset.'); return }
    if (validasi.perluJustifikasi && !f.justifikasi?.trim()) { setError('Harga di atas standar — isi justifikasi (butuh persetujuan Ketua Yayasan).'); return }
    setSaving(true)
    const payload = {
      usulan_id: usulan.id,
      klasifikasi_id: f.klasifikasi_id || null,
      nama_aset: f.nama_aset.trim(),
      spesifikasi: f.spesifikasi?.trim() || null,
      unit_kerja: f.unit_kerja?.trim() || null,
      nama_kegiatan: f.nama_kegiatan?.trim() || null,
      ruangan_id: f.ruangan_id || null,
      lokasi: f.ruangan_id ? null : (f.lokasi?.trim() || null),
      penanggung_jawab: f.penanggung_jawab?.trim() || null,
      alasan_kebutuhan: f.alasan_kebutuhan || null,
      cara_pengadaan: f.cara_pengadaan || null,
      sumber_anggaran: f.sumber_anggaran || null,
      jumlah_maksimal: Number(f.jumlah_maksimal) || 0,
      jumlah_tersedia: Number(f.jumlah_tersedia) || 0,
      jumlah_pengajuan: Number(f.jumlah_pengajuan) || 0,
      satuan: f.satuan?.trim() || 'unit',
      harga_satuan: Number(f.harga_satuan) || 0,
      standar_harga: f.standar_harga === '' ? null : Number(f.standar_harga),
      justifikasi: f.justifikasi?.trim() || null,
      is_habis_pakai: !!f.is_habis_pakai,
      bhp_id: f.is_habis_pakai ? (f.bhp_id || null) : null,
    }
    const query = isEdit ? supabase.from('dka_usulan_item').update(payload).eq('id', editingItem.id) : supabase.from('dka_usulan_item').insert(payload)
    const { error: err } = await query
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Ubah Item DKA' : 'Tambah Item DKA'} width="max-w-2xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="flex items-start gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-paper)] px-3 py-2">
          <input type="checkbox" className="mt-0.5" checked={!!f.is_habis_pakai} onChange={(e) => set('is_habis_pakai', e.target.checked)} />
          <span className="text-sm text-[var(--color-ink)]">Barang Habis Pakai (persediaan)<span className="block text-xs text-[var(--color-ink-soft)]">Saat diterima, otomatis menambah stok di <b>Barang Habis Pakai</b> (bukan aset tetap/Inventaris). Mis. ATK, bahan pembersih, tinta. Klasifikasi & ruangan boleh dikosongkan.</span></span>
        </label>
        {f.is_habis_pakai && (
          <Select label="Barang Persediaan (pilih yang sudah ada)" value={f.bhp_id || ''} onChange={(e) => pilihBhp(e.target.value)}>
            <option value="">— Buat baru dari Nama Aset di bawah —</option>
            {bhpList.map((b) => <option key={b.id} value={b.id}>{b.nama} ({b.satuan})</option>)}
          </Select>
        )}
        {!f.is_habis_pakai && <KlasifikasiPicker klasifikasiList={klasifikasiList} value={f.klasifikasi_id} onChange={onPickKlasifikasi} />}
        <div className="grid grid-cols-2 gap-3">
          <Input label="Nama Aset" required value={f.nama_aset || ''} onChange={(e) => set('nama_aset', e.target.value)} placeholder="mis. Laptop" />
          <Input label="Merk & Spesifikasi" value={f.spesifikasi || ''} onChange={(e) => set('spesifikasi', e.target.value)} placeholder="mis. Core i5, 8GB" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Nama Proker/Kegiatan" value={f.nama_kegiatan || ''} onChange={(e) => set('nama_kegiatan', e.target.value)} />
          <Input label="Unit Kerja" value={f.unit_kerja || ''} onChange={(e) => set('unit_kerja', e.target.value)} placeholder="Kurikulum / Tata Usaha…" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Ruangan / Lokasi" value={f.ruangan_id || ''} onChange={(e) => pilihRuangan(e.target.value)}>
            <option value="">— Isi manual di bawah —</option>
            {ruanganList.map((r) => <option key={r.id} value={r.id}>{r.nama}{picRuangan(r) ? ` — ${picRuangan(r)}` : ''}</option>)}
          </Select>
          {!f.ruangan_id
            ? <Input label="Lokasi (manual)" value={f.lokasi || ''} onChange={(e) => set('lokasi', e.target.value)} />
            : <Input label="Penanggung Jawab / Pengguna" value={f.penanggung_jawab || ''} onChange={(e) => set('penanggung_jawab', e.target.value)} />}
        </div>
        {!f.ruangan_id && <Input label="Penanggung Jawab / Pengguna" value={f.penanggung_jawab || ''} onChange={(e) => set('penanggung_jawab', e.target.value)} />}
        <div className="grid grid-cols-3 gap-3">
          <Select label="Alasan Kebutuhan" value={f.alasan_kebutuhan || ''} onChange={(e) => set('alasan_kebutuhan', e.target.value)}>
            <option value="">—</option>
            {ALASAN_KEBUTUHAN_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </Select>
          <Select label="Cara Pengadaan" value={f.cara_pengadaan || ''} onChange={(e) => set('cara_pengadaan', e.target.value)}>
            <option value="">—</option>
            {CARA_PENGADAAN_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </Select>
          <Select label="Sumber Anggaran" value={f.sumber_anggaran || ''} onChange={(e) => set('sumber_anggaran', e.target.value)}>
            <option value="">—</option>
            {SUMBER_ANGGARAN_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </Select>
        </div>
        <div className="rounded-lg border border-[var(--color-border)] p-3">
          <div className="grid grid-cols-4 gap-3">
            <Input label="Jml Maksimal" type="number" value={f.jumlah_maksimal ?? ''} onChange={(e) => set('jumlah_maksimal', e.target.value)} />
            <div>
              <Input label="Jml Tersedia" type="number" value={f.jumlah_tersedia ?? ''} onChange={(e) => set('jumlah_tersedia', e.target.value)} />
              <button type="button" onClick={ambilTersedia} disabled={ambil} className="mt-1 flex items-center gap-1 text-[11px] text-[var(--color-navy)] hover:underline"><Download className="h-3 w-3" /> {ambil ? 'menarik…' : 'dari Inventaris'}</button>
            </div>
            <div>
              <label className="mb-1 block text-[13px] font-medium text-[var(--color-ink)]">Jml Riil</label>
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-paper)] px-3 py-2 text-sm text-[var(--color-ink-soft)]">{riil}</div>
            </div>
            <Input label="Jml Pengajuan" type="number" value={f.jumlah_pengajuan ?? ''} onChange={(e) => set('jumlah_pengajuan', e.target.value)} />
          </div>
          <p className="mt-1 text-[11px] text-[var(--color-ink-soft)]">Jml Riil = Maksimal − Tersedia (min 0). Jml Tersedia bisa ditarik dari Buku Inventaris.</p>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <Input label="Satuan" value={f.satuan || ''} onChange={(e) => set('satuan', e.target.value)} />
          <Input label="Harga Satuan (Rp)" type="number" value={f.harga_satuan ?? ''} onChange={(e) => set('harga_satuan', e.target.value)} />
          <Input label="Standar Harga (Rp)" type="number" value={f.standar_harga ?? ''} onChange={(e) => set('standar_harga', e.target.value)} placeholder="opsional" />
          <div>
            <label className="mb-1 block text-[13px] font-medium text-[var(--color-ink)]">Jumlah Harga</label>
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-paper)] px-3 py-2 text-sm font-medium">{formatRupiah(jumlahHarga)}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge color={validasi.badge}>{validasi.label}</Badge>
          {validasi.perluJustifikasi && <span className="text-xs text-[var(--color-danger)]">Harga melampaui standar — wajib justifikasi + persetujuan Ketua Yayasan.</span>}
        </div>
        {validasi.perluJustifikasi && (
          <Textarea label="Justifikasi (wajib bila di atas standar)" rows={2} value={f.justifikasi || ''} onChange={(e) => set('justifikasi', e.target.value)} />
        )}
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
// TAB: PENGADAAN — konsumsi DKA disahkan, sampai Berita Acara Serah Terima
// (BAST otomatis menambah aset ke Inventaris via trigger dka_pengadaan_terima_trg).
// =========================================================================
function PengadaanTab({ hasFullAccess, mySchools }) {
  const { schools, schoolId, setSchoolId } = useUnitFilter(hasFullAccess, mySchools)
  const nowY = new Date().getFullYear()
  const [tahun, setTahun] = useState(nowY)
  const years = [nowY - 1, nowY, nowY + 1, nowY + 2]
  const managesUnit = useMemo(() => mySchools.some((s) => s.id === schoolId), [mySchools, schoolId])

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        {hasFullAccess && (
          <Select containerClassName="w-52" value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
            <option value="">Semua Unit (rekap)</option>
            {schools.map((s) => <option key={s.id} value={s.id}>{s.jenjang} — {s.nama}</option>)}
          </Select>
        )}
        <Select containerClassName="w-36" value={tahun} onChange={(e) => setTahun(Number(e.target.value))}>
          {years.map((y) => <option key={y} value={y}>Tahun {y}</option>)}
        </Select>
      </div>

      {hasFullAccess && !schoolId ? (
        <PengadaanRekap tahun={tahun} onOpen={(sid) => setSchoolId(sid)} />
      ) : schoolId ? (
        <PengadaanDetail schoolId={schoolId} tahun={tahun} hasFullAccess={hasFullAccess} managesUnit={managesUnit} />
      ) : (
        <p className="text-sm text-[var(--color-ink-soft)]">Pilih unit lebih dulu.</p>
      )}
    </div>
  )
}

function PengadaanRekap({ tahun, onOpen }) {
  const [rows, setRows] = useState([])
  const [counts, setCounts] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    ;(async () => {
      const { data: usulan } = await supabase
        .from('dka_usulan')
        .select('*, schools!school_id(nama, jenjang)')
        .eq('tahun', tahun)
        .eq('status', 'disahkan')
        .order('created_at', { ascending: false })
      const ids = (usulan || []).map((u) => u.id)
      let c = {}
      if (ids.length) {
        const { data: items } = await supabase.from('dka_usulan_item').select('id, usulan_id').in('usulan_id', ids)
        const itemIds = (items || []).map((i) => i.id)
        const itemToUsulan = Object.fromEntries((items || []).map((i) => [i.id, i.usulan_id]))
        if (itemIds.length) {
          const { data: proses } = await supabase.from('dka_pengadaan_proses').select('usulan_item_id, status').in('usulan_item_id', itemIds)
          for (const p of (proses || [])) {
            const uid = itemToUsulan[p.usulan_item_id]
            if (!c[uid]) c[uid] = { total: 0, diterima: 0 }
            c[uid].total++
            if (p.status === 'diterima') c[uid].diterima++
          }
        }
      }
      if (!alive) return
      setRows(usulan || [])
      setCounts(c)
      setLoading(false)
    })()
    return () => { alive = false }
  }, [tahun])

  if (loading) return <FullPageSpinner />

  const totalItems = Object.values(counts).reduce((a, c) => a + c.total, 0)
  const totalDiterima = Object.values(counts).reduce((a, c) => a + c.diterima, 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Unit dengan DKA Disahkan" value={rows.length} />
        <StatCard label="Total Item Pengadaan" value={totalItems} />
        <StatCard label="Sudah Diterima" value={totalDiterima} accent="gold" />
      </div>
      <SectionCard title={`Rekap Pengadaan — Tahun ${tahun}`} description="DKA yang sudah disahkan Yayasan. Klik untuk melaksanakan & memantau pengadaan per item.">
        {rows.length === 0 ? (
          <EmptyState icon={ClipboardList} title="Belum ada DKA disahkan" description="Belum ada DKA yang disahkan Yayasan untuk tahun ini." />
        ) : (
          <Table columns={['Unit', 'Judul', 'Item Pengadaan', 'Diterima', '']}>
            {rows.map((r) => (
              <Tr key={r.id}>
                <Td>{r.schools?.jenjang} — {r.schools?.nama}</Td>
                <Td>{r.judul || '—'}</Td>
                <Td>{counts[r.id]?.total || 0}</Td>
                <Td>{counts[r.id]?.diterima || 0}</Td>
                <Td><button onClick={() => onOpen(r.school_id)} className="text-sm font-medium text-[var(--color-navy)] hover:underline">Buka →</button></Td>
              </Tr>
            ))}
          </Table>
        )}
      </SectionCard>
    </div>
  )
}

function PengadaanDetail({ schoolId, tahun, hasFullAccess, managesUnit }) {
  const [usulan, setUsulan] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [pesanOpen, setPesanOpen] = useState(false)
  const [periksaOpen, setPeriksaOpen] = useState(false)
  const [bastOpen, setBastOpen] = useState(false)
  const [activeItem, setActiveItem] = useState(null)
  const [detailItem, setDetailItem] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: u } = await supabase.from('dka_usulan').select('*').eq('school_id', schoolId).eq('tahun', tahun).eq('status', 'disahkan').maybeSingle()
    setUsulan(u || null)
    if (u) {
      const { data: it } = await supabase.from('dka_usulan_item').select('*, aset_klasifikasi(kode, uraian), ruangan(nama)').eq('usulan_id', u.id).order('urutan')
      const itemIds = (it || []).map((x) => x.id)
      let prosesMap = {}
      if (itemIds.length) {
        const { data: pr } = await supabase.from('dka_pengadaan_proses').select('*, pemesan:dipesan_by(nama), pemeriksa:ba_pemeriksaan_by(nama), penyerah:ba_serah_terima_by(nama), aset:aset_id(kode_aset, nama)').in('usulan_item_id', itemIds)
        for (const p of (pr || [])) prosesMap[p.usulan_item_id] = p
      }
      setItems((it || []).map((x) => ({ ...x, proses: prosesMap[x.id] || null })))
    } else {
      setItems([])
    }
    setLoading(false)
  }, [schoolId, tahun])

  useEffect(() => { load() }, [load])

  const canAct = hasFullAccess || managesUnit

  if (loading) return <FullPageSpinner />

  if (!usulan) {
    return (
      <SectionCard title={`Pengadaan — Tahun ${tahun}`}>
        <EmptyState icon={Truck} title="Belum ada DKA disahkan" description="Pengadaan baru bisa dilaksanakan setelah DKA unit ini disahkan Yayasan (lihat tab Perencanaan)." />
      </SectionCard>
    )
  }

  const byStatus = (s) => items.filter((i) => (i.proses?.status || 'menunggu') === s).length

  // Serapan anggaran: nilai DKA (rencana) vs nilai realisasi (pesanan/diterima).
  const nilaiDKA = items.reduce((a, r) => a + Number(r.jumlah_harga || 0), 0)
  const nilaiRealisasi = items.reduce((a, r) => {
    const p = r.proses
    if (p && p.jumlah_realisasi != null && p.harga_realisasi != null) return a + Number(p.jumlah_realisasi) * Number(p.harga_realisasi)
    return a
  }, 0)
  const serapanPersen = nilaiDKA > 0 ? Math.round((nilaiRealisasi / nilaiDKA) * 100) : 0

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard label="Total Item" value={items.length} />
        <StatCard label="Menunggu" value={byStatus('menunggu')} />
        <StatCard label="Dipesan" value={byStatus('dipesan')} accent="gold" />
        <StatCard label="Lolos Periksa" value={byStatus('pemeriksaan')} />
        <StatCard label="Diterima" value={byStatus('diterima')} accent="gold" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Nilai DKA (Rencana)" value={formatRupiah(nilaiDKA)} />
        <StatCard label="Nilai Realisasi" value={formatRupiah(nilaiRealisasi)} accent="gold" />
        <StatCard label="Serapan Anggaran" value={`${serapanPersen}%`} sub={nilaiRealisasi > nilaiDKA ? 'Realisasi melebihi rencana DKA' : `Sisa ${formatRupiah(Math.max(nilaiDKA - nilaiRealisasi, 0))}`} />
      </div>

      <SectionCard title="Daftar Hasil Pengadaan" description="Berdasarkan DKA disahkan. Ikuti tahap: Catat Pemesanan (SPK) → BA Pemeriksaan → BA Serah Terima (otomatis masuk Inventaris).">
        {items.length === 0 ? (
          <EmptyState icon={ClipboardList} title="Tidak ada item pengadaan" description="DKA unit ini tidak memiliki item rencana pengadaan." />
        ) : (
          <div className="overflow-x-auto">
            <Table columns={['Nama & Spesifikasi', 'Jumlah', 'Cara Rencana', 'Status', 'Aksi']}>
              {items.map((r) => {
                const st = r.proses?.status || 'menunggu'
                return (
                  <Tr key={r.id}>
                    <Td>
                      <span className="font-medium">{r.nama_aset}</span>
                      {r.is_habis_pakai && <Badge color="gold">Habis Pakai</Badge>}
                      {r.spesifikasi && <span className="block text-xs text-[var(--color-ink-soft)]">{r.spesifikasi}</span>}
                      {r.proses?.nomor_spk && <span className="block text-[11px] text-[var(--color-ink-soft)]">SPK {r.proses.nomor_spk}</span>}
                    </Td>
                    <Td>{Number(r.jumlah_pengajuan)} <span className="text-[11px] text-[var(--color-ink-soft)]">{r.satuan}</span></Td>
                    <Td className="text-xs">{r.cara_pengadaan || '—'}</Td>
                    <Td>
                      <Badge color={PENGADAAN_STATUS_BADGE[st]}>{PENGADAAN_STATUS_LABEL[st]}</Badge>
                      {r.proses?.aset_id && <span className="block text-[11px] text-[var(--color-success)]">✓ masuk Inventaris &amp; Penyaluran</span>}
                      {r.proses?.bhp_id && <span className="block text-[11px] text-[var(--color-success)]">✓ masuk Persediaan (BHP)</span>}
                    </Td>
                    <Td className="text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button onClick={() => setDetailItem(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Detail informasi"><Info className="h-4 w-4" /></button>
                        {canAct && (st === 'menunggu' || st === 'ditolak') && (
                          <Button size="sm" variant="outline" onClick={() => { setActiveItem(r); setPesanOpen(true) }}><Truck className="h-3.5 w-3.5" /> {st === 'ditolak' ? 'Pesan Ulang' : 'Catat Pemesanan'}</Button>
                        )}
                        {canAct && st === 'dipesan' && (
                          <Button size="sm" variant="outline" onClick={() => { setActiveItem(r); setPeriksaOpen(true) }}><ClipboardCheck className="h-3.5 w-3.5" /> BA Pemeriksaan</Button>
                        )}
                        {canAct && st === 'pemeriksaan' && (
                          <Button size="sm" onClick={() => { setActiveItem(r); setBastOpen(true) }}><PackageCheck className="h-3.5 w-3.5" /> BA Serah Terima</Button>
                        )}
                        {canAct && st === 'diterima' && <span className="text-xs text-[var(--color-ink-soft)]">Selesai</span>}
                      </div>
                    </Td>
                  </Tr>
                )
              })}
            </Table>
          </div>
        )}
      </SectionCard>

      <DokumenAreaCard area="Pengadaan" schoolId={schoolId} />

      <PengadaanPesanModal open={pesanOpen} item={activeItem} schoolId={schoolId} onClose={() => { setPesanOpen(false); setActiveItem(null) }} onSaved={() => { setPesanOpen(false); setActiveItem(null); load() }} />
      <PengadaanPeriksaModal open={periksaOpen} item={activeItem} schoolId={schoolId} onClose={() => { setPeriksaOpen(false); setActiveItem(null) }} onSaved={() => { setPeriksaOpen(false); setActiveItem(null); load() }} />
      <PengadaanBastModal open={bastOpen} item={activeItem} schoolId={schoolId} onClose={() => { setBastOpen(false); setActiveItem(null) }} onSaved={() => { setBastOpen(false); setActiveItem(null); load() }} />
      <PengadaanDetailModal item={detailItem} onClose={() => setDetailItem(null)} />
    </div>
  )
}

function PengadaanPesanModal({ open, item, schoolId, onClose, onSaved }) {
  const [f, setF] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !item) return
    setError('')
    const p = item.proses
    setF({
      metode_realisasi: p?.metode_realisasi || item.cara_pengadaan || '',
      penyedia: p?.penyedia || '',
      nomor_spk: p?.nomor_spk || '',
      tanggal_spk: p?.tanggal_spk || '',
      nomor_bukti: p?.nomor_bukti || '',
      jumlah_realisasi: String(p?.jumlah_realisasi ?? item.jumlah_pengajuan ?? '1'),
      harga_realisasi: String(p?.harga_realisasi ?? item.harga_satuan ?? '0'),
    })
  }, [open, item])

  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!f.metode_realisasi) { setError('Pilih metode realisasi pengadaan.'); return }
    setSaving(true)
    // Nomor SPK di-assign saat SIMPAN bila masih kosong — satu sumber (counter)
    // agar tidak dobel/terburn saat form dibuka-tutup.
    const nomorSpk = f.nomor_spk?.trim() || (schoolId ? await autoNo(schoolId, 'SPK') : null)
    const payload = {
      status: 'dipesan',
      metode_realisasi: f.metode_realisasi,
      penyedia: f.penyedia?.trim() || null,
      nomor_spk: nomorSpk,
      tanggal_spk: f.tanggal_spk || null,
      nomor_bukti: f.nomor_bukti?.trim() || null,
      jumlah_realisasi: Number(f.jumlah_realisasi) || 0,
      harga_realisasi: Number(f.harga_realisasi) || 0,
    }
    const query = item.proses
      ? supabase.from('dka_pengadaan_proses').update(payload).eq('id', item.proses.id)
      : supabase.from('dka_pengadaan_proses').insert({ ...payload, usulan_item_id: item.id })
    const { error: err } = await query
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  if (!item) return null

  return (
    <Modal open={open} onClose={onClose} title={`Catat Pemesanan — ${item.nama_aset}`} width="max-w-lg">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Select label="Metode Realisasi" required value={f.metode_realisasi || ''} onChange={(e) => set('metode_realisasi', e.target.value)}>
          <option value="">—</option>
          {METODE_REALISASI_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
        </Select>
        <Input label="Penyedia / Toko / Rekanan" value={f.penyedia || ''} onChange={(e) => set('penyedia', e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Input label="Nomor SPK / Pesanan" value={f.nomor_spk || ''} onChange={(e) => set('nomor_spk', e.target.value)} placeholder="Wajib bila Rp50–200 juta" />
            <button type="button" onClick={async () => set('nomor_spk', await autoNo(schoolId, 'SPK'))} className="mt-1 text-[11px] text-[var(--color-navy)] hover:underline">buat nomor otomatis</button>
          </div>
          <Input label="Tanggal SPK" type="date" value={f.tanggal_spk || ''} onChange={(e) => set('tanggal_spk', e.target.value)} />
        </div>
        <Input label="Nomor Nota/Kuitansi/Invoice" value={f.nomor_bukti || ''} onChange={(e) => set('nomor_bukti', e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Jumlah Realisasi" type="number" value={f.jumlah_realisasi ?? ''} onChange={(e) => set('jumlah_realisasi', e.target.value)} />
          <Input label="Harga Satuan Realisasi (Rp)" type="number" value={f.harga_realisasi ?? ''} onChange={(e) => set('harga_realisasi', e.target.value)} />
        </div>
        {(() => {
          const beda = []
          if (Number(f.jumlah_realisasi || 0) !== Number(item.jumlah_pengajuan || 0)) beda.push(`jumlah ajuan ${Number(item.jumlah_pengajuan || 0)} ${item.satuan || ''}`)
          if (Number(f.harga_realisasi || 0) !== Number(item.harga_satuan || 0)) beda.push(`harga ajuan ${formatRupiah(item.harga_satuan)}`)
          const total = Number(f.jumlah_realisasi || 0) * Number(f.harga_realisasi || 0)
          return (
            <div className="rounded-md bg-[var(--color-navy-50)] px-3 py-2 text-xs text-[var(--color-ink)]">
              Nilai realisasi: <b>{formatRupiah(total)}</b>
              {beda.length > 0 && <span className="mt-1 block text-[var(--color-gold)]">⚠ Berbeda dari {beda.join(' & ')}. Pastikan sesuai bukti; selisih memengaruhi serapan anggaran.</span>}
            </div>
          )
        })()}
        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button>
        </div>
      </form>
    </Modal>
  )
}

function PengadaanPeriksaModal({ open, item, schoolId, onClose, onSaved }) {
  const [f, setF] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !item) return
    setError('')
    const p = item.proses
    setF({ ba_pemeriksaan_tanggal: p?.ba_pemeriksaan_tanggal || new Date().toISOString().slice(0, 10), ba_pemeriksaan_hasil: 'sesuai', ba_pemeriksaan_catatan: p?.ba_pemeriksaan_catatan || '', nomor_ba_pemeriksaan: p?.nomor_ba_pemeriksaan || '' })
  }, [open, item])

  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (f.ba_pemeriksaan_hasil === 'tidak_sesuai' && !f.ba_pemeriksaan_catatan?.trim()) { setError('Isi catatan ketidaksesuaian agar penyedia bisa menindaklanjuti.'); return }
    setSaving(true)
    // Nomor BA hanya di-assign saat hasil 'sesuai' (lanjut), bila masih kosong.
    const nomorBap = f.ba_pemeriksaan_hasil === 'sesuai'
      ? (f.nomor_ba_pemeriksaan?.trim() || (schoolId ? await autoNo(schoolId, 'BAP') : null))
      : (f.nomor_ba_pemeriksaan?.trim() || null)
    const payload = {
      status: f.ba_pemeriksaan_hasil === 'sesuai' ? 'pemeriksaan' : 'ditolak',
      ba_pemeriksaan_tanggal: f.ba_pemeriksaan_tanggal || null,
      ba_pemeriksaan_hasil: f.ba_pemeriksaan_hasil,
      ba_pemeriksaan_catatan: f.ba_pemeriksaan_catatan?.trim() || null,
      nomor_ba_pemeriksaan: nomorBap,
    }
    const { error: err } = await supabase.from('dka_pengadaan_proses').update(payload).eq('id', item.proses.id)
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  if (!item) return null

  return (
    <Modal open={open} onClose={onClose} title={`Berita Acara Pemeriksaan — ${item.nama_aset}`} width="max-w-lg">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Tanggal Pemeriksaan" type="date" value={f.ba_pemeriksaan_tanggal || ''} onChange={(e) => set('ba_pemeriksaan_tanggal', e.target.value)} />
          <div>
            <Input label="Nomor BA Pemeriksaan" value={f.nomor_ba_pemeriksaan || ''} onChange={(e) => set('nomor_ba_pemeriksaan', e.target.value)} placeholder="opsional" />
            <button type="button" onClick={async () => set('nomor_ba_pemeriksaan', await autoNo(schoolId, 'BAP'))} className="mt-1 text-[11px] text-[var(--color-navy)] hover:underline">buat nomor otomatis</button>
          </div>
        </div>
        <Select label="Hasil Pemeriksaan" value={f.ba_pemeriksaan_hasil || 'sesuai'} onChange={(e) => set('ba_pemeriksaan_hasil', e.target.value)}>
          <option value="sesuai">Sesuai — lanjut Serah Terima</option>
          <option value="tidak_sesuai">Tidak Sesuai — minta penyedia menyesuaikan</option>
        </Select>
        <Textarea label="Catatan" rows={2} value={f.ba_pemeriksaan_catatan || ''} onChange={(e) => set('ba_pemeriksaan_catatan', e.target.value)} />
        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button>
        </div>
      </form>
    </Modal>
  )
}

function PengadaanBastModal({ open, item, schoolId, onClose, onSaved }) {
  const [f, setF] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !item) return
    setError('')
    const p = item.proses
    setF({ ba_serah_terima_tanggal: new Date().toISOString().slice(0, 10), ba_serah_terima_catatan: '', nomor_ba_serah_terima: p?.nomor_ba_serah_terima || '' })
  }, [open, item])

  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    const nomorBast = f.nomor_ba_serah_terima?.trim() || (schoolId ? await autoNo(schoolId, 'BAST') : null)
    const payload = {
      status: 'diterima',
      ba_serah_terima_tanggal: f.ba_serah_terima_tanggal || null,
      ba_serah_terima_catatan: f.ba_serah_terima_catatan?.trim() || null,
      nomor_ba_serah_terima: nomorBast,
    }
    const { error: err } = await supabase.from('dka_pengadaan_proses').update(payload).eq('id', item.proses.id)
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  if (!item) return null

  return (
    <Modal open={open} onClose={onClose} title={`Berita Acara Serah Terima — ${item.nama_aset}`} width="max-w-lg">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <p className="rounded-md bg-[var(--color-navy-50)] px-3 py-2 text-xs text-[var(--color-ink)]">Menyimpan BAST akan langsung menambahkan aset ini ke <b>Inventaris</b> (jumlah &amp; nilai total, kode &amp; lokasi otomatis) dan mencatatnya di <b>Penerimaan &amp; Penyaluran</b> (tersalur ke ruangan tujuan).</p>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Tanggal Serah Terima" type="date" value={f.ba_serah_terima_tanggal || ''} onChange={(e) => set('ba_serah_terima_tanggal', e.target.value)} />
          <div>
            <Input label="Nomor BA Serah Terima" value={f.nomor_ba_serah_terima || ''} onChange={(e) => set('nomor_ba_serah_terima', e.target.value)} placeholder="opsional" />
            <button type="button" onClick={async () => set('nomor_ba_serah_terima', await autoNo(schoolId, 'BAST'))} className="mt-1 text-[11px] text-[var(--color-navy)] hover:underline">buat nomor otomatis</button>
          </div>
        </div>
        <Textarea label="Catatan" rows={2} value={f.ba_serah_terima_catatan || ''} onChange={(e) => set('ba_serah_terima_catatan', e.target.value)} />
        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan & Masuk Inventaris'}</Button>
        </div>
      </form>
    </Modal>
  )
}

// Kartu detail informasi satu item hasil pengadaan — alur lengkap BAB IV.
function PengadaanDetailModal({ item, onClose }) {
  const open = !!item
  if (!open) return null
  const p = item.proses || {}
  const tgl = (d) => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
  const st = p.status || 'menunggu'

  const Baris = ({ label, value, mono }) => (
    <div className="grid grid-cols-3 gap-3 py-1.5">
      <dt className="text-[13px] text-[var(--color-ink-soft)]">{label}</dt>
      <dd className={`col-span-2 text-sm text-[var(--color-ink)] ${mono ? 'font-mono text-xs' : ''}`}>{value || '—'}</dd>
    </div>
  )

  return (
    <Modal open={open} onClose={onClose} title={`Detail Pengadaan — ${item.nama_aset}`} width="max-w-xl">
      <div className="flex flex-col gap-3">
        <div>
          <Badge color={PENGADAAN_STATUS_BADGE[st]}>{PENGADAAN_STATUS_LABEL[st]}</Badge>
          {p.aset_id && <span className="ml-2 text-[11px] text-[var(--color-success)]">✓ masuk Inventaris &amp; Penyaluran</span>}
          {p.bhp_id && <span className="ml-2 text-[11px] text-[var(--color-success)]">✓ masuk Persediaan (BHP)</span>}
        </div>

        <div className="rounded-lg border border-[var(--color-border)] p-3">
          <p className="mb-1 text-xs font-semibold text-[var(--color-ink-soft)]">Item</p>
          <dl className="divide-y divide-[var(--color-border)]">
            <Baris label="Nama Aset" value={item.nama_aset} />
            <Baris label="Spesifikasi" value={item.spesifikasi} />
            <Baris label="Jumlah Diajukan" value={`${Number(item.jumlah_pengajuan ?? 0)} ${item.satuan || ''}`} />
            <Baris label="Ruangan / Lokasi" value={item.ruangan?.nama || item.lokasi} />
            <Baris label="Penanggung Jawab" value={item.penanggung_jawab} />
          </dl>
        </div>

        <div className="rounded-lg border border-[var(--color-border)] p-3">
          <p className="mb-1 text-xs font-semibold text-[var(--color-ink-soft)]">Pemesanan (SPK)</p>
          <dl className="divide-y divide-[var(--color-border)]">
            <Baris label="Metode Realisasi" value={p.metode_realisasi} />
            <Baris label="Penyedia / Rekanan" value={p.penyedia} />
            <Baris label="Nomor SPK" value={p.nomor_spk} mono />
            <Baris label="Tanggal SPK" value={tgl(p.tanggal_spk)} />
            <Baris label="Nomor Nota/Kuitansi" value={p.nomor_bukti} mono />
            <Baris label="Jumlah Realisasi" value={p.jumlah_realisasi != null ? `${Number(p.jumlah_realisasi)} ${item.satuan || ''}` : '—'} />
            <Baris label="Harga Satuan Realisasi" value={p.harga_realisasi != null ? formatRupiah(p.harga_realisasi) : '—'} />
            <Baris label="Nilai Total" value={p.jumlah_realisasi != null && p.harga_realisasi != null ? formatRupiah(Number(p.jumlah_realisasi) * Number(p.harga_realisasi)) : '—'} />
            <Baris label="Dipesan oleh" value={p.pemesan?.nama} />
          </dl>
        </div>

        <div className="rounded-lg border border-[var(--color-border)] p-3">
          <p className="mb-1 text-xs font-semibold text-[var(--color-ink-soft)]">Berita Acara Pemeriksaan</p>
          <dl className="divide-y divide-[var(--color-border)]">
            <Baris label="Nomor BA Pemeriksaan" value={p.nomor_ba_pemeriksaan} mono />
            <Baris label="Tanggal" value={tgl(p.ba_pemeriksaan_tanggal)} />
            <Baris label="Hasil" value={p.ba_pemeriksaan_hasil === 'sesuai' ? 'Sesuai' : p.ba_pemeriksaan_hasil === 'tidak_sesuai' ? 'Tidak Sesuai' : '—'} />
            <Baris label="Catatan" value={p.ba_pemeriksaan_catatan} />
            <Baris label="Diperiksa oleh" value={p.pemeriksa?.nama} />
          </dl>
        </div>

        <div className="rounded-lg border border-[var(--color-border)] p-3">
          <p className="mb-1 text-xs font-semibold text-[var(--color-ink-soft)]">Berita Acara Serah Terima</p>
          <dl className="divide-y divide-[var(--color-border)]">
            <Baris label="Nomor BA Serah Terima" value={p.nomor_ba_serah_terima} mono />
            <Baris label="Tanggal" value={tgl(p.ba_serah_terima_tanggal)} />
            <Baris label="Catatan" value={p.ba_serah_terima_catatan} />
            <Baris label="Diterima oleh" value={p.penyerah?.nama} />
            <Baris label="Kode Aset (Inventaris)" value={p.aset?.kode_aset} mono />
          </dl>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          {p.id && p.nomor_spk && <Button size="sm" variant="outline" onClick={() => openCetak('spk', p.id)}><Printer className="h-3.5 w-3.5" /> SPK</Button>}
          {p.id && p.ba_pemeriksaan_tanggal && <Button size="sm" variant="outline" onClick={() => openCetak('ba_pemeriksaan', p.id)}><Printer className="h-3.5 w-3.5" /> BA Pemeriksaan</Button>}
          {p.id && st === 'diterima' && <Button size="sm" variant="outline" onClick={() => openCetak('bast_pengadaan', p.id)}><Printer className="h-3.5 w-3.5" /> BAST</Button>}
          <Button size="sm" variant="outline" onClick={onClose}>Tutup</Button>
        </div>
      </div>
    </Modal>
  )
}

// =========================================================================
// Pemilih aset dari Inventaris (dipakai lintas area: Penggunaan/Pemeliharaan/
// Penyaluran/Penghapusan). Mencari aset aktif pada unit terpilih.
// =========================================================================
function AsetPicker({ schoolId, value, onChange, onlyAktif = true }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [list, setList] = useState([])
  const selected = useMemo(() => list.find((a) => a.id === value), [list, value])
  useEffect(() => {
    if (!schoolId) { setList([]); return }
    let qy = supabase.from('aset').select('id, kode_aset, nama, kondisi, ruangan(nama), status').eq('school_id', schoolId).order('nama')
    if (onlyAktif) qy = qy.eq('status', 'aktif')
    qy.then(({ data }) => setList(data || []))
  }, [schoolId, onlyAktif])
  const results = useMemo(() => {
    const s = q.trim().toLowerCase()
    const base = s ? list.filter((a) => a.nama.toLowerCase().includes(s) || (a.kode_aset || '').toLowerCase().includes(s)) : list
    return base.slice(0, 25)
  }, [q, list])
  return (
    <div>
      <label className="mb-1 block text-[13px] font-medium text-[var(--color-ink)]">Aset (dari Inventaris)</label>
      {selected ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-paper)] px-3 py-2">
          <span className="text-sm text-[var(--color-ink)]"><span className="font-mono text-xs text-[var(--color-navy)]">{selected.kode_aset || '—'}</span> · {selected.nama}{selected.ruangan?.nama ? ` · ${selected.ruangan.nama}` : ''}</span>
          <button type="button" onClick={() => onChange('', null)} className="text-xs text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]">ganti</button>
        </div>
      ) : (
        <div className="relative">
          <div className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-3">
            <Search className="h-4 w-4 text-[var(--color-ink-soft)]" />
            <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} placeholder="Cari aset (nama/kode)…" className="w-full bg-transparent py-2 text-sm outline-none" />
          </div>
          {open && results.length > 0 && (
            <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-[var(--color-border)] bg-white shadow-lg">
              {results.map((a) => (
                <button key={a.id} type="button" onClick={() => { onChange(a.id, a); setOpen(false); setQ('') }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--color-navy-50)]">
                  <span className="font-mono text-xs text-[var(--color-navy)]">{a.kode_aset || '—'}</span>
                  <span className="text-[var(--color-ink)]">{a.nama}</span>
                  {a.ruangan?.nama && <span className="text-[11px] text-[var(--color-ink-soft)]">· {a.ruangan.nama}</span>}
                </button>
              ))}
            </div>
          )}
          {open && schoolId && results.length === 0 && <p className="mt-1 text-[11px] text-[var(--color-ink-soft)]">Tidak ada aset cocok. Pastikan aset sudah tercatat di Inventaris unit ini.</p>}
        </div>
      )}
    </div>
  )
}

// Pemilih unit sederhana untuk area operasional (wajib pilih unit dulu).
function UnitBar({ hasFullAccess, schools, schoolId, setSchoolId, right }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {hasFullAccess && (
          <Select containerClassName="w-52" value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
            <option value="">— Pilih Unit —</option>
            {schools.map((s) => <option key={s.id} value={s.id}>{s.jenjang} — {s.nama}</option>)}
          </Select>
        )}
      </div>
      {right}
    </div>
  )
}

// =========================================================================
// TAB: DASHBOARD SARPRAS — ringkasan aset & proses siklus hidup.
// =========================================================================
function DashBar({ label, value, max, color }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 shrink-0 text-xs text-[var(--color-ink-soft)]">{label}</span>
      <div className="h-3 flex-1 rounded-full bg-black/[0.05]"><div className="h-3 rounded-full" style={{ width: `${pct}%`, background: color || 'var(--color-navy)' }} /></div>
      <span className="w-10 shrink-0 text-right text-xs font-medium">{value}</span>
    </div>
  )
}

function DashboardTab({ hasFullAccess, mySchools }) {
  const { schools, schoolId, setSchoolId } = useUnitFilter(hasFullAccess, mySchools)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const nowY = new Date().getFullYear()
    let aq = supabase.from('aset').select('id, nilai_perolehan, kondisi, status, schools!school_id(nama, jenjang)')
    let dq = supabase.from('dka_usulan').select('status').eq('tahun', nowY)
    let oq = supabase.from('aset_opname').select('status')
    let hq = supabase.from('aset_penghapusan').select('status')
    let mq = supabase.from('aset_pemeliharaan_log').select('biaya, aset!inner(school_id)')
    let yq = supabase.from('aset_penyaluran').select('status, aset!inner(school_id)')
    if (schoolId) {
      aq = aq.eq('school_id', schoolId); dq = dq.eq('school_id', schoolId); oq = oq.eq('school_id', schoolId)
      hq = hq.eq('school_id', schoolId); mq = mq.eq('aset.school_id', schoolId); yq = yq.eq('aset.school_id', schoolId)
    }
    const [{ data: aset }, { data: dka }, { data: opname }, { data: hapus }, { data: pmel }, { data: salur }] = await Promise.all([aq, dq, oq, hq, mq, yq])
    setData({ aset: aset || [], dka: dka || [], opname: opname || [], hapus: hapus || [], pmel: pmel || [], salur: salur || [] })
    setLoading(false)
  }, [schoolId])
  useEffect(() => { load() }, [load])

  const stat = useMemo(() => {
    if (!data) return null
    const aktif = data.aset.filter((a) => a.status === 'aktif')
    const kon = { baik: 0, rusak_ringan: 0, rusak_berat: 0 }
    aktif.forEach((a) => { kon[a.kondisi] = (kon[a.kondisi] || 0) + 1 })
    const perUnit = {}
    aktif.forEach((a) => { const k = a.schools ? `${a.schools.jenjang} — ${a.schools.nama}` : 'Kantor Yayasan'; if (!perUnit[k]) perUnit[k] = { jumlah: 0, nilai: 0 }; perUnit[k].jumlah++; perUnit[k].nilai += Number(a.nilai_perolehan || 0) })
    return {
      total: aktif.length,
      nilai: aktif.reduce((s, a) => s + Number(a.nilai_perolehan || 0), 0),
      kon, rusak: kon.rusak_ringan + kon.rusak_berat,
      dihapus: data.aset.filter((a) => a.status === 'dihapus').length,
      perUnit: Object.entries(perUnit).sort((a, b) => b[1].nilai - a[1].nilai),
      dkaDisahkan: data.dka.filter((d) => d.status === 'disahkan').length,
      dkaDiajukan: data.dka.filter((d) => d.status === 'diajukan').length,
      opnameBerjalan: data.opname.filter((o) => o.status === 'berjalan').length,
      hapusDiajukan: data.hapus.filter((h) => h.status === 'diajukan').length,
      salurDiminta: data.salur.filter((s) => s.status === 'diminta').length,
      pmelJml: data.pmel.length,
      pmelBiaya: data.pmel.reduce((s, m) => s + Number(m.biaya || 0), 0),
    }
  }, [data])

  if (loading || !stat) return <FullPageSpinner />
  const maxKon = Math.max(stat.kon.baik, stat.kon.rusak_ringan, stat.kon.rusak_berat, 1)
  const maxUnit = Math.max(...stat.perUnit.map(([, v]) => v.nilai), 1)

  return (
    <div className="flex flex-col gap-5">
      <UnitBar hasFullAccess={hasFullAccess} schools={schools} schoolId={schoolId} setSchoolId={setSchoolId} />
      {hasFullAccess && !schoolId && <p className="-mt-2 text-xs text-[var(--color-ink-soft)]">Menampilkan gabungan seluruh unit. Pilih unit untuk memfilter.</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Aset (aktif)" value={stat.total} />
        <StatCard label="Nilai Perolehan" value={formatRupiah(stat.nilai)} accent="gold" />
        <StatCard label="Aset Perlu Perhatian (rusak)" value={stat.rusak} />
        <StatCard label="Aset Dihapus" value={stat.dihapus} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Kondisi Aset">
          <div className="flex flex-col gap-2.5">
            <DashBar label="Baik" value={stat.kon.baik} max={maxKon} color="var(--color-success)" />
            <DashBar label="Rusak Ringan" value={stat.kon.rusak_ringan} max={maxKon} color="var(--color-gold)" />
            <DashBar label="Rusak Berat" value={stat.kon.rusak_berat} max={maxKon} color="var(--color-danger)" />
          </div>
        </SectionCard>
        <SectionCard title="Proses Berjalan (siklus aset)">
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div><div className="text-lg font-semibold text-[var(--color-navy)]">{stat.dkaDisahkan}</div><div className="text-xs text-[var(--color-ink-soft)]">DKA disahkan</div></div>
            <div><div className="text-lg font-semibold text-[var(--color-navy)]">{stat.dkaDiajukan}</div><div className="text-xs text-[var(--color-ink-soft)]">DKA menunggu sahkan</div></div>
            <div><div className="text-lg font-semibold text-[var(--color-navy)]">{stat.salurDiminta}</div><div className="text-xs text-[var(--color-ink-soft)]">Penyaluran diminta</div></div>
            <div><div className="text-lg font-semibold text-[var(--color-navy)]">{stat.opnameBerjalan}</div><div className="text-xs text-[var(--color-ink-soft)]">Opname berjalan</div></div>
            <div><div className="text-lg font-semibold text-[var(--color-navy)]">{stat.hapusDiajukan}</div><div className="text-xs text-[var(--color-ink-soft)]">Penghapusan diajukan</div></div>
            <div><div className="text-lg font-semibold text-[var(--color-navy)]">{stat.pmelJml}</div><div className="text-xs text-[var(--color-ink-soft)]">Catatan pemeliharaan</div></div>
          </div>
          <p className="mt-3 text-xs text-[var(--color-ink-soft)]">Total biaya pemeliharaan tercatat: <b>{formatRupiah(stat.pmelBiaya)}</b></p>
        </SectionCard>
      </div>

      {!schoolId && stat.perUnit.length > 0 && (
        <SectionCard title="Distribusi Aset per Unit">
          <div className="flex flex-col gap-2.5">
            {stat.perUnit.map(([nama, v]) => (
              <div key={nama} className="flex items-center gap-2">
                <span className="w-40 shrink-0 truncate text-xs text-[var(--color-ink-soft)]" title={nama}>{nama}</span>
                <div className="h-3 flex-1 rounded-full bg-black/[0.05]"><div className="h-3 rounded-full bg-[var(--color-navy)]" style={{ width: `${Math.round((v.nilai / maxUnit) * 100)}%` }} /></div>
                <span className="w-16 shrink-0 text-right text-xs">{v.jumlah} aset</span>
                <span className="w-28 shrink-0 text-right text-xs font-medium">{formatRupiah(v.nilai)}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  )
}

// =========================================================================
// TAB: DOKUMEN & FORMULIR — cetak semua dokumen kerja SOP (auto-isi data).
// =========================================================================
// Pratinjau ringkas sebuah dokumen SEBELUM Cetak — memakai data & builder yang
// sama dengan halaman cetak (loadDokumen + buildDokumen), ditampilkan ringkas.
function DokumenPreviewModal({ jenis, id, onClose }) {
  const open = !!jenis
  const [def, setDef] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!jenis) { setDef(null); return }
    let batal = false
    setLoading(true)
    loadDokumen(jenis, id || null)
      .then((data) => { if (!batal) { setDef(buildDokumen(jenis, data)); setLoading(false) } })
      .catch(() => { if (!batal) { setDef({ judul: 'DOKUMEN', narasi: ['Gagal memuat data.'] }); setLoading(false) } })
    return () => { batal = true }
  }, [jenis, id])

  if (!open) return null
  return (
    <Modal open={open} onClose={onClose} title="Pratinjau Dokumen" width="max-w-2xl">
      {loading || !def ? <p className="text-sm text-[var(--color-ink-soft)]">Memuat…</p> : (
        <div className="flex flex-col gap-3">
          <div className="text-center">
            <h3 className="text-base font-semibold uppercase text-[var(--color-ink)]">{def.judul}</h3>
            {def.nomor && <p className="text-xs text-[var(--color-ink-soft)]">Nomor: {def.nomor}</p>}
            {def.tanggalTempat && <p className="text-xs text-[var(--color-ink-soft)]">{def.tanggalTempat}</p>}
          </div>
          {def.intro && <p className="text-sm text-[var(--color-ink)]">{def.intro}</p>}
          {def.meta?.length > 0 && (
            <dl className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)] px-3">
              {def.meta.map(([k, v], i) => (
                <div key={i} className="grid grid-cols-3 gap-2 py-1.5">
                  <dt className="text-[13px] text-[var(--color-ink-soft)]">{k}</dt>
                  <dd className="col-span-2 text-sm text-[var(--color-ink)]">{String(v ?? '—')}</dd>
                </div>
              ))}
            </dl>
          )}
          {(def.tables || []).map((t, ti) => (
            <div key={ti} className="overflow-x-auto">
              <Table columns={t.columns}>
                {(t.rows || []).map((row, ri) => (
                  <Tr key={ri}>{row.map((cell, ci) => <Td key={ci} className="text-xs">{String(cell ?? '')}</Td>)}</Tr>
                ))}
              </Table>
              {(t.rows || []).length === 0 && <p className="py-2 text-xs text-[var(--color-ink-soft)]">(formulir kosong — akan dicetak sebagai blanko)</p>}
            </div>
          ))}
          {(def.narasi || []).map((n, ni) => <p key={ni} className="text-sm text-[var(--color-ink-soft)]">{n}</p>)}
          <p className="text-[11px] text-[var(--color-ink-soft)]">Pratinjau ringkas untuk memeriksa data. Kop surat & tata letak resmi muncul di hasil Cetak/PDF.</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Tutup</Button>
            <Button onClick={() => openCetak(jenis, id || undefined)}><Printer className="h-4 w-4" /> Cetak / Simpan PDF</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function DokumenRow({ doc, schoolId }) {
  const [recs, setRecs] = useState(null)
  const [sel, setSel] = useState('')
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState(false)

  if (!doc.pick) {
    return (
      <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] py-2 last:border-0">
        <span className="text-sm text-[var(--color-ink)]">{doc.label}</span>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => setPreview(true)}><Info className="h-3.5 w-3.5" /> Lihat detail</Button>
          <Button size="sm" variant="outline" onClick={() => openCetak(doc.jenis)}><Printer className="h-3.5 w-3.5" /> Cetak</Button>
        </div>
        {preview && <DokumenPreviewModal jenis={doc.jenis} id={null} onClose={() => setPreview(false)} />}
      </div>
    )
  }
  const loadRecs = async () => { setLoading(true); const r = await listRecords(doc.pick, schoolId); setRecs(r); setLoading(false) }
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] py-2 last:border-0">
      <span className="text-sm text-[var(--color-ink)]">{doc.label}</span>
      <div className="flex items-center gap-1.5">
        {recs === null ? (
          <Button size="sm" variant="outline" onClick={loadRecs} disabled={!schoolId || loading}>{loading ? 'Memuat…' : 'Pilih data'}</Button>
        ) : recs.length === 0 ? (
          <span className="text-[11px] text-[var(--color-ink-soft)]">tidak ada data</span>
        ) : (
          <>
            <Select containerClassName="w-56" value={sel} onChange={(e) => setSel(e.target.value)}>
              <option value="">— pilih data —</option>
              {recs.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </Select>
            <Button size="sm" variant="ghost" disabled={!sel} onClick={() => setPreview(true)}><Info className="h-3.5 w-3.5" /> Detail</Button>
            <Button size="sm" disabled={!sel} onClick={() => openCetak(doc.jenis, sel)}><Printer className="h-3.5 w-3.5" /> Cetak</Button>
          </>
        )}
      </div>
      {preview && sel && <DokumenPreviewModal jenis={doc.jenis} id={sel} onClose={() => setPreview(false)} />}
    </div>
  )
}

// Kartu Dokumen & Formulir khusus satu area/alur — ditempel di tab alurnya
// (selain menu "Dokumen & Formulir"). Dokumen kerja SOP area tsb, terisi
// otomatis dari data; pilih data lalu Cetak/Simpan PDF.
function DokumenAreaCard({ area, schoolId }) {
  const docs = DOKUMEN_LIST.filter((d) => d.area === area)
  if (docs.length === 0) return null
  return (
    <SectionCard title={`Dokumen & Formulir — ${area}`} description="Dokumen kerja sesuai SOP area ini. Dokumen berbasis data terisi otomatis (pilih data → Cetak/Simpan PDF); formulir kosong langsung bisa dicetak sebagai blanko.">
      <div>{docs.map((doc) => <DokumenRow key={doc.jenis} doc={doc} schoolId={schoolId} />)}</div>
    </SectionCard>
  )
}

function DokumenTab({ hasFullAccess, mySchools }) {
  const { schools, schoolId, setSchoolId } = useUnitFilter(hasFullAccess, mySchools)
  const areas = useMemo(() => [...new Set(DOKUMEN_LIST.map((d) => d.area))], [])
  return (
    <div className="flex flex-col gap-5">
      <UnitBar hasFullAccess={hasFullAccess} schools={schools} schoolId={schoolId} setSchoolId={setSchoolId} />
      <p className="-mt-2 text-sm text-[var(--color-ink-soft)]">Dokumen resmi terisi <b>otomatis dari data</b> — pilih unit &amp; data sumbernya lalu <b>Cetak / Simpan PDF</b>. Dokumen tanpa data (formulir) langsung bisa dicetak sebagai blanko.</p>
      {hasFullAccess && !schoolId && <p className="rounded-md bg-[var(--color-gold-soft)] px-3 py-2 text-xs text-[var(--color-gold)]">Pilih unit dulu untuk mencetak dokumen berbasis data. Formulir kosong tetap bisa dicetak tanpa memilih unit.</p>}
      {areas.map((area) => (
        <SectionCard key={area} title={area}>
          <div>{DOKUMEN_LIST.filter((d) => d.area === area).map((doc) => <DokumenRow key={doc.jenis} doc={doc} schoolId={schoolId} />)}</div>
        </SectionCard>
      ))}
    </div>
  )
}

// =========================================================================
// TAB: PENGGUNAAN (Status Penggunaan) — BAB VI
// =========================================================================
function PenggunaanTab({ hasFullAccess, mySchools }) {
  const { schools, schoolId, setSchoolId } = useUnitFilter(hasFullAccess, mySchools)
  const managesUnit = useMemo(() => mySchools.some((s) => s.id === schoolId), [mySchools, schoolId])
  const canManage = hasFullAccess || managesUnit
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  const load = useCallback(async () => {
    if (!schoolId) { setRows([]); setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('aset_penggunaan')
      .select('*, aset!inner(id, nama, kode_aset, school_id), employees(nama)')
      .eq('aset.school_id', schoolId)
      .order('tanggal_penetapan', { ascending: false })
    setRows(data || [])
    setLoading(false)
  }, [schoolId])
  useEffect(() => { load() }, [load])

  const handleReturn = async (row) => {
    if (!confirm(`Tandai aset "${row.aset?.nama}" telah dikembalikan?`)) return
    const { error } = await supabase.from('aset_penggunaan').update({ status: 'dikembalikan', tanggal_kembali: new Date().toISOString().slice(0, 10) }).eq('id', row.id)
    if (error) { alert('Gagal: ' + error.message); return }
    load()
  }
  const handleDelete = async (row) => {
    if (!confirm('Hapus catatan penggunaan ini?')) return
    const { error } = await supabase.from('aset_penggunaan').delete().eq('id', row.id)
    if (error) { alert('Gagal: ' + error.message); return }
    load()
  }

  return (
    <div className="flex flex-col gap-5">
      <UnitBar hasFullAccess={hasFullAccess} schools={schools} schoolId={schoolId} setSchoolId={setSchoolId}
        right={canManage && schoolId && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => openCetak('surat_pengajuan_penggunaan')}><Printer className="h-4 w-4" /> Surat Pengajuan (blanko)</Button>
            <Button onClick={() => { setEditing(null); setFormOpen(true) }}><Plus className="h-4 w-4" /> Tetapkan Penggunaan</Button>
          </div>
        )} />
      {!schoolId ? (
        <p className="text-sm text-[var(--color-ink-soft)]">Pilih unit lebih dulu.</p>
      ) : loading ? <FullPageSpinner /> : (
        <>
          <Card className="bg-[var(--color-navy-50)]">
            <p className="text-[13px] text-[var(--color-ink)]"><b>Alur SOP (BAB VI):</b> Pemohon mengajukan <b>Surat Pengajuan Status Penggunaan</b> → Kepala Sekolah/PKS Sarpras meneliti → disetujui → terbit <b>Berita Acara Status Penggunaan</b> → pemegang menatausahakan aset. Tidak berlaku untuk barang persediaan & konstruksi dalam pengerjaan.</p>
          </Card>

          <SectionCard title="Status Penggunaan Aset" description="Penetapan pemakaian aset ke pegawai/unit (Berita Acara Status Penggunaan). Aset hasil penyaluran (SPPA) tercatat otomatis di sini.">
            {rows.length === 0 ? (
              <EmptyState icon={UserCheck} title="Belum ada penetapan" description="Tetapkan status penggunaan aset kepada pegawai/unit." />
            ) : (
              <div className="overflow-x-auto">
                <Table columns={['Aset', 'Pengguna', 'Unit Kerja', 'Tgl Penetapan', 'No. BA', 'Status', 'Aksi']}>
                  {rows.map((r) => (
                    <Tr key={r.id}>
                      <Td><span className="font-medium">{r.aset?.nama}</span><span className="block font-mono text-[11px] text-[var(--color-ink-soft)]">{r.aset?.kode_aset || '—'}</span></Td>
                      <Td>{r.employees?.nama || r.pengguna_nama || '—'}</Td>
                      <Td className="text-xs">{r.unit_kerja || '—'}</Td>
                      <Td className="text-xs">{r.tanggal_penetapan ? new Date(r.tanggal_penetapan).toLocaleDateString('id-ID') : '—'}</Td>
                      <Td className="text-xs">{r.nomor_ba || '—'}</Td>
                      <Td><Badge color={PENGGUNAAN_STATUS_BADGE[r.status]}>{PENGGUNAAN_STATUS_LABEL[r.status]}</Badge></Td>
                      <Td>
                        <div className="flex justify-end gap-1.5">
                          <button onClick={() => openCetak('ba_penggunaan', r.id)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Cetak BA Status Penggunaan"><Printer className="h-4 w-4" /></button>
                          {canManage && r.status === 'aktif' && <button onClick={() => handleReturn(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Kembalikan"><RotateCcw className="h-4 w-4" /></button>}
                          {canManage && <button onClick={() => { setEditing(r); setFormOpen(true) }} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Ubah"><Pencil className="h-4 w-4" /></button>}
                          {canManage && <button onClick={() => handleDelete(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus"><Trash2 className="h-4 w-4" /></button>}
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </Table>
              </div>
            )}
          </SectionCard>

          <DokumenAreaCard area="Penggunaan" schoolId={schoolId} />
        </>
      )}
      <PenggunaanModal open={formOpen} schoolId={schoolId} editing={editing} onClose={() => { setFormOpen(false); setEditing(null) }} onSaved={() => { setFormOpen(false); setEditing(null); load() }} />
    </div>
  )
}

function PenggunaanModal({ open, schoolId, editing, onClose, onSaved }) {
  const [f, setF] = useState({})
  const [employees, setEmployees] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isEdit = !!editing

  useEffect(() => {
    if (!open) return
    setError('')
    if (editing) {
      setF({ aset_id: editing.aset_id || '', pengguna_employee_id: editing.pengguna_employee_id || '', pengguna_nama: editing.pengguna_nama || '', unit_kerja: editing.unit_kerja || '', tanggal_penetapan: editing.tanggal_penetapan || '', nomor_ba: editing.nomor_ba || '', keterangan: editing.keterangan || '' })
    } else {
      setF({ aset_id: '', pengguna_employee_id: '', pengguna_nama: '', unit_kerja: '', tanggal_penetapan: new Date().toISOString().slice(0, 10), nomor_ba: '', keterangan: '' })
    }
  }, [open, editing])
  useEffect(() => {
    if (!open || !schoolId) return
    supabase.from('employees').select('id, nama').eq('school_id', schoolId).order('nama').then(({ data }) => setEmployees(data || []))
  }, [open, schoolId])

  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!f.aset_id) { setError('Pilih aset dulu.'); return }
    setError(''); setSaving(true)
    const nomorBa = f.nomor_ba?.trim() || (schoolId ? await autoNo(schoolId, 'BA') : null)
    const payload = {
      aset_id: f.aset_id,
      pengguna_employee_id: f.pengguna_employee_id || null,
      pengguna_nama: f.pengguna_nama?.trim() || null,
      unit_kerja: f.unit_kerja?.trim() || null,
      tanggal_penetapan: f.tanggal_penetapan || null,
      nomor_ba: nomorBa,
      keterangan: f.keterangan?.trim() || null,
    }
    const q = isEdit ? supabase.from('aset_penggunaan').update(payload).eq('id', editing.id) : supabase.from('aset_penggunaan').insert(payload)
    const { error: err } = await q
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }
  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Ubah Status Penggunaan' : 'Tetapkan Status Penggunaan'} width="max-w-lg">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {!isEdit && <AsetPicker schoolId={schoolId} value={f.aset_id} onChange={(id) => set('aset_id', id)} />}
        <div className="grid grid-cols-2 gap-3">
          <Select label="Pengguna (pegawai)" value={f.pengguna_employee_id || ''} onChange={(e) => set('pengguna_employee_id', e.target.value)}>
            <option value="">— Pilih / manual —</option>
            {employees.map((em) => <option key={em.id} value={em.id}>{em.nama}</option>)}
          </Select>
          <Input label="Atau nama/unit manual" value={f.pengguna_nama || ''} onChange={(e) => set('pengguna_nama', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Unit Kerja" value={f.unit_kerja || ''} onChange={(e) => set('unit_kerja', e.target.value)} />
          <Input label="Tanggal Penetapan" type="date" value={f.tanggal_penetapan || ''} onChange={(e) => set('tanggal_penetapan', e.target.value)} />
        </div>
        <div>
          <Input label="Nomor Berita Acara" value={f.nomor_ba || ''} onChange={(e) => set('nomor_ba', e.target.value)} />
          <button type="button" onClick={async () => set('nomor_ba', await autoNo(schoolId, 'BA'))} className="mt-1 text-[11px] text-[var(--color-navy)] hover:underline">buat nomor otomatis</button>
        </div>
        <Textarea label="Keterangan" rows={2} value={f.keterangan || ''} onChange={(e) => set('keterangan', e.target.value)} />
        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Batal</Button><Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button></div>
      </form>
    </Modal>
  )
}

// =========================================================================
// TAB: PEMELIHARAAN & PERBAIKAN (pelaksanaan) — BAB IX
// Logbook; bisa dari Rencana Pemeliharaan DKA. Kondisi sesudah → sync aset.
// =========================================================================
function PemeliharaanTab({ hasFullAccess, mySchools }) {
  const { schools, schoolId, setSchoolId } = useUnitFilter(hasFullAccess, mySchools)
  const managesUnit = useMemo(() => mySchools.some((s) => s.id === schoolId), [mySchools, schoolId])
  const canManage = hasFullAccess || managesUnit
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  const load = useCallback(async () => {
    if (!schoolId) { setRows([]); setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('aset_pemeliharaan_log')
      .select('*, aset!inner(id, nama, kode_aset, school_id)')
      .eq('aset.school_id', schoolId)
      .order('tanggal', { ascending: false })
    setRows(data || [])
    setLoading(false)
  }, [schoolId])
  useEffect(() => { load() }, [load])

  const handleDelete = async (row) => {
    if (!confirm('Hapus catatan pemeliharaan ini?')) return
    const { error } = await supabase.from('aset_pemeliharaan_log').delete().eq('id', row.id)
    if (error) { alert('Gagal: ' + error.message); return }
    load()
  }
  const totalBiaya = useMemo(() => rows.reduce((a, r) => a + Number(r.biaya || 0), 0), [rows])

  return (
    <div className="flex flex-col gap-5">
      <UnitBar hasFullAccess={hasFullAccess} schools={schools} schoolId={schoolId} setSchoolId={setSchoolId}
        right={canManage && schoolId && <Button onClick={() => { setEditing(null); setFormOpen(true) }}><Plus className="h-4 w-4" /> Catat Pemeliharaan</Button>} />
      {!schoolId ? (
        hasFullAccess ? <PemeliharaanRekap onOpen={setSchoolId} /> : <p className="text-sm text-[var(--color-ink-soft)]">Pilih unit lebih dulu.</p>
      ) : loading ? <FullPageSpinner /> : (
        <>
          <Card className="bg-[var(--color-navy-50)]">
            <p className="text-[13px] text-[var(--color-ink)]"><b>Alur SOP (BAB IX):</b> <b>Pemeliharaan</b> terjadwal berpedoman Daftar Kebutuhan Pemeliharaan (DKA) → catat Logbook. <b>Perbaikan</b>: Laporan Kerusakan → verifikasi → bila perlu sparepart ikuti prosedur Pengadaan → laksanakan (boleh eksternal + BAST Perbaikan) → catat Logbook. <b>Otomatis:</b> kondisi &quot;sesudah&quot; memperbarui Inventaris/KIA/KIR; biaya tercatat sebagai Belanja Pemeliharaan di Buku Kas; aset rusak ringan dari Inventarisasi muncul di sini sebagai &quot;perlu perbaikan&quot;.</p>
          </Card>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCard label="Catatan Pemeliharaan" value={rows.length} />
            <StatCard label="Total Biaya" value={formatRupiah(totalBiaya)} accent="gold" />
          </div>
          <SectionCard title="Logbook Pemeliharaan & Perbaikan" description="Kondisi 'sesudah' otomatis memperbarui kondisi aset di Inventaris; biaya otomatis tercatat sebagai Belanja Pemeliharaan di Buku Kas.">
            {rows.length === 0 ? (
              <EmptyState icon={Wrench} title="Belum ada catatan" description="Catat pelaksanaan pemeliharaan/perbaikan aset." />
            ) : (
              <div className="overflow-x-auto">
                <Table columns={['Tgl', 'Aset', 'Jenis', 'Uraian', 'Biaya', 'Pelaksana', 'Kondisi', canManage ? '' : null].filter((c) => c !== null)}>
                  {rows.map((r) => (
                    <Tr key={r.id}>
                      <Td className="text-xs">{r.tanggal ? new Date(r.tanggal).toLocaleDateString('id-ID') : '—'}</Td>
                      <Td><span className="font-medium">{r.aset?.nama}</span><span className="block font-mono text-[11px] text-[var(--color-ink-soft)]">{r.aset?.kode_aset || '—'}</span></Td>
                      <Td className="text-xs">{r.jenis || '—'}</Td>
                      <Td className="text-xs">{r.uraian || '—'}</Td>
                      <Td>{formatRupiah(r.biaya)}</Td>
                      <Td className="text-xs">{r.pelaksana || '—'}</Td>
                      <Td className="text-xs">
                        {r.kondisi_sebelum && <span>{KONDISI_LABEL[r.kondisi_sebelum]}</span>}
                        {r.kondisi_sesudah && <span> → <b>{KONDISI_LABEL[r.kondisi_sesudah]}</b></span>}
                        {!r.kondisi_sebelum && !r.kondisi_sesudah && '—'}
                      </Td>
                      {canManage && (
                        <Td>
                          <div className="flex justify-end gap-1.5">
                            <button onClick={() => { setEditing(r); setFormOpen(true) }} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Ubah"><Pencil className="h-4 w-4" /></button>
                            <button onClick={() => handleDelete(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus"><Trash2 className="h-4 w-4" /></button>
                          </div>
                        </Td>
                      )}
                    </Tr>
                  ))}
                </Table>
              </div>
            )}
          </SectionCard>
        </>
      )}
      {schoolId && <DokumenAreaCard area="Pemeliharaan" schoolId={schoolId} />}
      <PemeliharaanModal open={formOpen} schoolId={schoolId} editing={editing} onClose={() => { setFormOpen(false); setEditing(null) }} onSaved={() => { setFormOpen(false); setEditing(null); load() }} />
    </div>
  )
}

function PemeliharaanModal({ open, schoolId, editing, onClose, onSaved }) {
  const [f, setF] = useState({})
  const [rencana, setRencana] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isEdit = !!editing

  useEffect(() => {
    if (!open) return
    setError('')
    if (editing) {
      setF({ aset_id: editing.aset_id || '', dka_pemeliharaan_item_id: editing.dka_pemeliharaan_item_id || '', tanggal: editing.tanggal || '', jenis: editing.jenis || '', uraian: editing.uraian || '', bahan: editing.bahan || '', biaya: String(editing.biaya ?? '0'), pelaksana: editing.pelaksana || '', kondisi_sebelum: editing.kondisi_sebelum || '', kondisi_sesudah: editing.kondisi_sesudah || '', tindak_lanjut: editing.tindak_lanjut || '' })
    } else {
      setF({ aset_id: '', dka_pemeliharaan_item_id: '', tanggal: new Date().toISOString().slice(0, 10), jenis: 'Preventif', uraian: '', bahan: '', biaya: '0', pelaksana: '', kondisi_sebelum: '', kondisi_sesudah: '', tindak_lanjut: '' })
    }
  }, [open, editing])
  useEffect(() => {
    if (!open || !schoolId) { setRencana([]); return }
    supabase.from('dka_pemeliharaan_item')
      .select('id, nama_aset, aset_id, jenis_pemeliharaan, kondisi, dka_usulan!inner(school_id, status)')
      .eq('dka_usulan.school_id', schoolId).eq('dka_usulan.status', 'disahkan')
      .then(({ data }) => setRencana((data || []).filter((r) => r.aset_id)))
  }, [open, schoolId])

  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const pickRencana = (id) => {
    const r = rencana.find((x) => x.id === id)
    if (!r) { set('dka_pemeliharaan_item_id', ''); return }
    setF((s) => ({ ...s, dka_pemeliharaan_item_id: id, aset_id: r.aset_id || s.aset_id, jenis: r.jenis_pemeliharaan || s.jenis, kondisi_sebelum: r.kondisi || s.kondisi_sebelum }))
  }
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!f.aset_id) { setError('Pilih aset dulu.'); return }
    setError(''); setSaving(true)
    const payload = {
      aset_id: f.aset_id,
      dka_pemeliharaan_item_id: f.dka_pemeliharaan_item_id || null,
      tanggal: f.tanggal || null,
      jenis: f.jenis || null,
      uraian: f.uraian?.trim() || null,
      bahan: f.bahan?.trim() || null,
      biaya: Number(f.biaya) || 0,
      pelaksana: f.pelaksana?.trim() || null,
      kondisi_sebelum: f.kondisi_sebelum || null,
      kondisi_sesudah: f.kondisi_sesudah || null,
      tindak_lanjut: f.tindak_lanjut?.trim() || null,
    }
    const q = isEdit ? supabase.from('aset_pemeliharaan_log').update(payload).eq('id', editing.id) : supabase.from('aset_pemeliharaan_log').insert(payload)
    const { error: err } = await q
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }
  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Ubah Catatan Pemeliharaan' : 'Catat Pemeliharaan / Perbaikan'} width="max-w-lg">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {!isEdit && rencana.length > 0 && (
          <Select label="Ambil dari Rencana Pemeliharaan (DKA disahkan)" value={f.dka_pemeliharaan_item_id || ''} onChange={(e) => pickRencana(e.target.value)}>
            <option value="">— Tanpa rujukan / pilih aset manual —</option>
            {rencana.map((r) => <option key={r.id} value={r.id}>{r.nama_aset}{r.jenis_pemeliharaan ? ` · ${r.jenis_pemeliharaan}` : ''}</option>)}
          </Select>
        )}
        {!isEdit && <AsetPicker schoolId={schoolId} value={f.aset_id} onChange={(id) => set('aset_id', id)} />}
        <div className="grid grid-cols-2 gap-3">
          <Select label="Jenis" value={f.jenis || ''} onChange={(e) => set('jenis', e.target.value)}>
            {PEMELIHARAAN_JENIS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </Select>
          <Input label="Tanggal" type="date" value={f.tanggal || ''} onChange={(e) => set('tanggal', e.target.value)} />
        </div>
        <Input label="Uraian Pekerjaan" value={f.uraian || ''} onChange={(e) => set('uraian', e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Bahan/Sparepart" value={f.bahan || ''} onChange={(e) => set('bahan', e.target.value)} />
          <Input label="Biaya (Rp)" type="number" value={f.biaya ?? ''} onChange={(e) => set('biaya', e.target.value)} />
        </div>
        <Input label="Pelaksana (internal/eksternal)" value={f.pelaksana || ''} onChange={(e) => set('pelaksana', e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Kondisi Sebelum" value={f.kondisi_sebelum || ''} onChange={(e) => set('kondisi_sebelum', e.target.value)}>
            <option value="">—</option>
            {KONDISI_OPTIONS.map((k) => <option key={k} value={k}>{KONDISI_LABEL[k]}</option>)}
          </Select>
          <Select label="Kondisi Sesudah (perbarui aset)" value={f.kondisi_sesudah || ''} onChange={(e) => set('kondisi_sesudah', e.target.value)}>
            <option value="">— tidak diubah —</option>
            {KONDISI_OPTIONS.map((k) => <option key={k} value={k}>{KONDISI_LABEL[k]}</option>)}
          </Select>
        </div>
        <Input label="Tindak Lanjut" value={f.tindak_lanjut || ''} onChange={(e) => set('tindak_lanjut', e.target.value)} />
        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Batal</Button><Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button></div>
      </form>
    </Modal>
  )
}

// =========================================================================
// TAB: PENERIMAAN & PENYALURAN — BAB V (SPA → SPPA; disalurkan → pindah lokasi)
// =========================================================================
function PenyaluranTab({ hasFullAccess, mySchools }) {
  const { schools, schoolId, setSchoolId } = useUnitFilter(hasFullAccess, mySchools)
  const managesUnit = useMemo(() => mySchools.some((s) => s.id === schoolId), [mySchools, schoolId])
  const canManage = hasFullAccess || managesUnit
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)

  const load = useCallback(async () => {
    if (!schoolId) { setRows([]); setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('aset_penyaluran')
      .select('*, aset!inner(id, nama, kode_aset, school_id), ruangan:ruangan_tujuan_id(nama)')
      .eq('aset.school_id', schoolId)
      .order('tanggal_permintaan', { ascending: false })
    setRows(data || [])
    setLoading(false)
  }, [schoolId])
  useEffect(() => { load() }, [load])

  const handleSalurkan = async (row) => {
    const suggested = row.nomor_sppa || await autoNo(schoolId, 'SPPA')
    const no = prompt('Nomor SPPA (Surat Perintah Penyaluran Aset):', suggested)
    if (no === null) return
    const { error } = await supabase.from('aset_penyaluran').update({ status: 'disalurkan', nomor_sppa: no.trim() || null, tanggal_penyaluran: new Date().toISOString().slice(0, 10) }).eq('id', row.id)
    if (error) { alert('Gagal: ' + error.message); return }
    load()
  }
  const handleTolak = async (row) => {
    if (!confirm('Tolak permintaan penyaluran ini?')) return
    const { error } = await supabase.from('aset_penyaluran').update({ status: 'ditolak' }).eq('id', row.id)
    if (error) { alert('Gagal: ' + error.message); return }
    load()
  }
  const handleDelete = async (row) => {
    if (!confirm('Hapus catatan penyaluran ini?')) return
    const { error } = await supabase.from('aset_penyaluran').delete().eq('id', row.id)
    if (error) { alert('Gagal: ' + error.message); return }
    load()
  }

  const menunggu = rows.filter((r) => r.status === 'diminta')     // Penyimpanan: diterima, menunggu disalurkan
  const riwayat = rows.filter((r) => r.status !== 'diminta')      // Penyaluran: sudah disalurkan / ditolak
  const tersalur = rows.filter((r) => r.status === 'disalurkan').length

  return (
    <div className="flex flex-col gap-5">
      <UnitBar hasFullAccess={hasFullAccess} schools={schools} schoolId={schoolId} setSchoolId={setSchoolId}
        right={canManage && schoolId && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => openCetak('buku_pengeluaran', schoolId)}><Printer className="h-4 w-4" /> Buku Pengeluaran</Button>
            <Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" /> Permintaan Aset (SPA)</Button>
          </div>
        )} />
      {!schoolId ? (
        <p className="text-sm text-[var(--color-ink-soft)]">Pilih unit lebih dulu.</p>
      ) : loading ? <FullPageSpinner /> : (
        <>
          <Card className="bg-[var(--color-navy-50)]">
            <p className="text-[13px] text-[var(--color-ink)]"><b>Alur SOP (BAB V):</b> Penerimaan (BA Pemeriksaan → BAST, di tab Pengadaan) → <b>Penyimpanan</b> (aset diterima & disimpan, belum ditempatkan) → <b>Penyaluran</b> (SPA → SPPA, aset ditempatkan ke ruangan tujuan). Aset hasil pengadaan masuk ke antrean penyaluran secara otomatis.</p>
          </Card>

          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Menunggu Penyaluran" value={menunggu.length} accent="gold" />
            <StatCard label="Tersalur (SPPA)" value={tersalur} />
            <StatCard label="Total Catatan" value={rows.length} />
          </div>

          <SectionCard title="Penyimpanan — Menunggu Penyaluran" description="Aset yang sudah diterima (hasil pengadaan / permintaan manual) dan disimpan, menunggu diterbitkan SPPA untuk ditempatkan ke ruangan tujuan.">
            {menunggu.length === 0 ? (
              <EmptyState icon={Package} title="Tidak ada aset menunggu penyaluran" description="Aset hasil pengadaan yang sudah di-BAST akan muncul di sini otomatis." />
            ) : (
              <div className="overflow-x-auto">
                <Table columns={['Aset', 'Tujuan', 'Penerima', 'SPA', canManage ? 'Aksi' : null].filter((c) => c !== null)}>
                  {menunggu.map((r) => (
                    <Tr key={r.id}>
                      <Td><span className="font-medium">{r.aset?.nama}</span><span className="block font-mono text-[11px] text-[var(--color-ink-soft)]">{r.aset?.kode_aset || '—'}</span></Td>
                      <Td className="text-xs">{r.ruangan?.nama || r.tujuan_lokasi || '—'}</Td>
                      <Td className="text-xs">{r.penerima || '—'}</Td>
                      <Td className="text-xs">{r.nomor_spa || '—'}<span className="block text-[11px] text-[var(--color-ink-soft)]">{r.tanggal_permintaan ? new Date(r.tanggal_permintaan).toLocaleDateString('id-ID') : ''}</span></Td>
                      {canManage && (
                        <Td className="text-right">
                          <div className="flex justify-end gap-1.5">
                            <Button size="sm" onClick={() => handleSalurkan(r)}><Truck className="h-3.5 w-3.5" /> Terbitkan SPPA</Button>
                            <button onClick={() => openCetak('spa', r.id)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Cetak SPA"><Printer className="h-4 w-4" /></button>
                            <button onClick={() => handleTolak(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Tolak"><RotateCcw className="h-4 w-4" /></button>
                            <button onClick={() => handleDelete(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus"><Trash2 className="h-4 w-4" /></button>
                          </div>
                        </Td>
                      )}
                    </Tr>
                  ))}
                </Table>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Riwayat Penyaluran" description="Aset yang sudah disalurkan (SPPA) atau permintaan yang ditolak. Saat disalurkan, lokasi aset dipindah ke ruangan tujuan dan Kartu Inventaris Ruangan (Penggunaan) dibuat otomatis.">
            {riwayat.length === 0 ? (
              <EmptyState icon={Send} title="Belum ada riwayat penyaluran" />
            ) : (
              <div className="overflow-x-auto">
                <Table columns={['Aset', 'Tujuan', 'Penerima', 'SPA', 'SPPA', 'Status', canManage ? 'Aksi' : null].filter((c) => c !== null)}>
                  {riwayat.map((r) => (
                    <Tr key={r.id}>
                      <Td><span className="font-medium">{r.aset?.nama}</span><span className="block font-mono text-[11px] text-[var(--color-ink-soft)]">{r.aset?.kode_aset || '—'}</span></Td>
                      <Td className="text-xs">{r.ruangan?.nama || r.tujuan_lokasi || '—'}</Td>
                      <Td className="text-xs">{r.penerima || '—'}</Td>
                      <Td className="text-xs">{r.nomor_spa || '—'}<span className="block text-[11px] text-[var(--color-ink-soft)]">{r.tanggal_permintaan ? new Date(r.tanggal_permintaan).toLocaleDateString('id-ID') : ''}</span></Td>
                      <Td className="text-xs">{r.nomor_sppa || '—'}<span className="block text-[11px] text-[var(--color-ink-soft)]">{r.tanggal_penyaluran ? new Date(r.tanggal_penyaluran).toLocaleDateString('id-ID') : ''}</span></Td>
                      <Td><Badge color={PENYALURAN_STATUS_BADGE[r.status]}>{PENYALURAN_STATUS_LABEL[r.status]}</Badge></Td>
                      {canManage && (
                        <Td className="text-right">
                          <div className="flex justify-end gap-1.5">
                            <button onClick={() => openCetak('spa', r.id)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Cetak SPA"><Printer className="h-4 w-4" /></button>
                            {r.status === 'disalurkan' && <button onClick={() => openCetak('sppa', r.id)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Cetak SPPA"><Printer className="h-4 w-4" /></button>}
                            <button onClick={() => handleDelete(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus"><Trash2 className="h-4 w-4" /></button>
                          </div>
                        </Td>
                      )}
                    </Tr>
                  ))}
                </Table>
              </div>
            )}
          </SectionCard>

          <DokumenAreaCard area="Penerimaan & Penyaluran" schoolId={schoolId} />
        </>
      )}
      <PenyaluranModal open={formOpen} schoolId={schoolId} onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); load() }} />
    </div>
  )
}

function PenyaluranModal({ open, schoolId, onClose, onSaved }) {
  const [f, setF] = useState({})
  const [ruanganList, setRuanganList] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    setF({ aset_id: '', ruangan_tujuan_id: '', tujuan_lokasi: '', penerima: '', jumlah: '1', tanggal_permintaan: new Date().toISOString().slice(0, 10), nomor_spa: '', keterangan: '' })
  }, [open])
  useEffect(() => {
    if (!open || !schoolId) { setRuanganList([]); return }
    supabase.from('ruangan').select('id, nama').eq('school_id', schoolId).order('nama').then(({ data }) => setRuanganList(data || []))
  }, [open, schoolId])

  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!f.aset_id) { setError('Pilih aset dulu.'); return }
    setError(''); setSaving(true)
    const nomorSpa = f.nomor_spa?.trim() || (schoolId ? await autoNo(schoolId, 'SPA') : null)
    const payload = {
      aset_id: f.aset_id,
      ruangan_tujuan_id: f.ruangan_tujuan_id || null,
      tujuan_lokasi: f.ruangan_tujuan_id ? null : (f.tujuan_lokasi?.trim() || null),
      penerima: f.penerima?.trim() || null,
      jumlah: Number(f.jumlah) || 1,
      tanggal_permintaan: f.tanggal_permintaan || null,
      nomor_spa: nomorSpa,
      keterangan: f.keterangan?.trim() || null,
    }
    const { error: err } = await supabase.from('aset_penyaluran').insert(payload)
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }
  return (
    <Modal open={open} onClose={onClose} title="Surat Permintaan Aset (SPA)" width="max-w-lg">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <AsetPicker schoolId={schoolId} value={f.aset_id} onChange={(id) => set('aset_id', id)} />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Ruangan Tujuan" value={f.ruangan_tujuan_id || ''} onChange={(e) => set('ruangan_tujuan_id', e.target.value)}>
            <option value="">— Isi manual —</option>
            {ruanganList.map((r) => <option key={r.id} value={r.id}>{r.nama}</option>)}
          </Select>
          {!f.ruangan_tujuan_id
            ? <Input label="Tujuan (manual)" value={f.tujuan_lokasi || ''} onChange={(e) => set('tujuan_lokasi', e.target.value)} />
            : <Input label="Penerima" value={f.penerima || ''} onChange={(e) => set('penerima', e.target.value)} />}
        </div>
        {!f.ruangan_tujuan_id && <Input label="Penerima" value={f.penerima || ''} onChange={(e) => set('penerima', e.target.value)} />}
        <div className="grid grid-cols-3 gap-3">
          <Input label="Jumlah" type="number" value={f.jumlah ?? ''} onChange={(e) => set('jumlah', e.target.value)} />
          <div>
            <Input label="Nomor SPA" value={f.nomor_spa || ''} onChange={(e) => set('nomor_spa', e.target.value)} />
            <button type="button" onClick={async () => set('nomor_spa', await autoNo(schoolId, 'SPA'))} className="mt-1 text-[11px] text-[var(--color-navy)] hover:underline">otomatis</button>
          </div>
          <Input label="Tanggal Permintaan" type="date" value={f.tanggal_permintaan || ''} onChange={(e) => set('tanggal_permintaan', e.target.value)} />
        </div>
        <Textarea label="Keterangan" rows={2} value={f.keterangan || ''} onChange={(e) => set('keterangan', e.target.value)} />
        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Batal</Button><Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button></div>
      </form>
    </Modal>
  )
}

// =========================================================================
// TAB: INVENTARISASI & PELAPORAN — BAB VII (opname; kondisi aktual → sync aset)
// =========================================================================
function InventarisasiTab({ hasFullAccess, mySchools }) {
  const { schools, schoolId, setSchoolId } = useUnitFilter(hasFullAccess, mySchools)
  const managesUnit = useMemo(() => mySchools.some((s) => s.id === schoolId), [mySchools, schoolId])
  const canManage = hasFullAccess || managesUnit
  const nowY = new Date().getFullYear()
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!schoolId) { setSessions([]); setLoading(false); return }
    setLoading(true)
    const { data } = await supabase.from('aset_opname').select('*').eq('school_id', schoolId).order('created_at', { ascending: false })
    setSessions(data || [])
    setLoading(false)
  }, [schoolId])
  useEffect(() => { load() }, [load])

  const createSession = async () => {
    const judul = prompt('Judul sesi inventarisasi (mis. "Opname Tahunan"):', `Opname ${nowY}`)
    if (judul === null) return
    setBusy(true)
    const { error } = await supabase.from('aset_opname').insert({ school_id: schoolId, tahun: nowY, judul: judul.trim() || `Opname ${nowY}`, tanggal_mulai: new Date().toISOString().slice(0, 10) })
    setBusy(false)
    if (error) { alert('Gagal: ' + error.message); return }
    load()
  }

  if (openId) return <OpnameDetail opnameId={openId} canManage={canManage} onBack={() => { setOpenId(null); load() }} />

  return (
    <div className="flex flex-col gap-5">
      <UnitBar hasFullAccess={hasFullAccess} schools={schools} schoolId={schoolId} setSchoolId={setSchoolId}
        right={canManage && schoolId && <Button onClick={createSession} disabled={busy}><Plus className="h-4 w-4" /> Sesi Opname Baru</Button>} />
      {!schoolId ? (
        hasFullAccess ? <OpnameRekap onOpen={setSchoolId} /> : <p className="text-sm text-[var(--color-ink-soft)]">Pilih unit lebih dulu.</p>
      ) : loading ? <FullPageSpinner /> : (
        <>
          <Card className="bg-[var(--color-navy-50)]">
            <p className="text-[13px] text-[var(--color-ink)]"><b>Alur SOP (BAB VII):</b> Persiapan (Tim Inventarisasi, KIA/KIR, format LHI) → Pelaksanaan (tarik aset dari Inventaris → cek temuan & kondisi) → Identifikasi & penilaian → <b>LHI + Berita Acara Hasil Inventarisasi</b> → <b>Tindak lanjut otomatis</b>: aset hilang/rusak berat diusulkan ke Penghapusan, kondisi aktual memperbarui Inventaris/KIA/KIR → Laporan Aset Semester/Tahunan dihimpun Yayasan.</p>
          </Card>
          <SectionCard title="Sesi Inventarisasi (Opname)" description="Sensus aset vs Buku Inventaris. Kondisi aktual otomatis memperbarui kondisi aset; aset hilang/rusak berat otomatis masuk draft Penghapusan saat sesi diselesaikan.">
            {sessions.length === 0 ? (
              <EmptyState icon={ScanLine} title="Belum ada sesi" description="Buat sesi opname untuk mencocokkan aset fisik dengan Buku Inventaris." />
            ) : (
              <Table columns={['Judul', 'Tahun', 'Mulai', 'Status', '']}>
                {sessions.map((s) => (
                  <Tr key={s.id}>
                    <Td className="font-medium">{s.judul || '—'}</Td>
                    <Td>{s.tahun}</Td>
                    <Td className="text-xs">{s.tanggal_mulai ? new Date(s.tanggal_mulai).toLocaleDateString('id-ID') : '—'}</Td>
                    <Td><Badge color={OPNAME_STATUS_BADGE[s.status]}>{OPNAME_STATUS_LABEL[s.status]}</Badge></Td>
                    <Td><button onClick={() => setOpenId(s.id)} className="text-sm font-medium text-[var(--color-navy)] hover:underline">Buka →</button></Td>
                  </Tr>
                ))}
              </Table>
            )}
          </SectionCard>
          <DokumenAreaCard area="Inventarisasi" schoolId={schoolId} />
        </>
      )}
    </div>
  )
}

function OpnameDetail({ opnameId, canManage, onBack }) {
  const [sesi, setSesi] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [periksa, setPeriksa] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: s } = await supabase.from('aset_opname').select('*').eq('id', opnameId).maybeSingle()
    const { data: it } = await supabase.from('aset_opname_item').select('*').eq('opname_id', opnameId).order('kode_aset', { nullsFirst: false })
    setSesi(s || null); setItems(it || [])
    setLoading(false)
  }, [opnameId])
  useEffect(() => { load() }, [load])

  const generate = async () => {
    if (!confirm('Tarik seluruh aset aktif unit ini ke daftar opname? Daftar lama pada sesi ini akan diganti.')) return
    setBusy(true)
    const { error } = await supabase.rpc('aset_opname_generate', { p_opname_id: opnameId })
    setBusy(false)
    if (error) { alert('Gagal: ' + error.message); return }
    load()
  }
  const simpanMeta = async (patch) => {
    const { error } = await supabase.from('aset_opname').update(patch).eq('id', opnameId)
    if (error) { alert('Gagal: ' + error.message); return }
    load()
  }
  const selesaikan = async () => {
    const rusakBerat = items.filter((i) => i.kondisi_aktual === 'rusak_berat').length
    const hilangN = items.filter((i) => i.ditemukan === false).length
    const tl = rusakBerat + hilangN
    if (!confirm(`Selesaikan sesi opname ini?${tl > 0 ? `\n\n${tl} aset (hilang/rusak berat) akan otomatis dibuatkan draft usulan Penghapusan sebagai tindak lanjut.` : ''}`)) return
    setBusy(true)
    // Auto-nomor Berita Acara Hasil Inventarisasi bila belum ada.
    const nomorBa = sesi.nomor_ba?.trim() || await autoNo(sesi.school_id, 'BAI')
    const { error } = await supabase.from('aset_opname').update({ status: 'selesai', tanggal_selesai: new Date().toISOString().slice(0, 10), nomor_ba: nomorBa }).eq('id', opnameId)
    setBusy(false)
    if (error) { alert('Gagal: ' + error.message); return }
    load()
  }

  if (loading) return <FullPageSpinner />
  if (!sesi) return <EmptyState title="Sesi tidak ditemukan" />

  const dicek = items.filter((i) => i.ditemukan !== null).length
  const hilang = items.filter((i) => i.ditemukan === false).length
  const rusakBerat = items.filter((i) => i.kondisi_aktual === 'rusak_berat').length
  const editable = canManage && sesi.status === 'berjalan'

  return (
    <div className="flex flex-col gap-4">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]"><RotateCcw className="h-4 w-4" /> Kembali ke daftar sesi</button>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2"><h3 className="text-base font-semibold text-[var(--color-ink)]">{sesi.judul || 'Opname'} — {sesi.tahun}</h3><Badge color={OPNAME_STATUS_BADGE[sesi.status]}>{OPNAME_STATUS_LABEL[sesi.status]}</Badge></div>
            <p className="mt-1 text-xs text-[var(--color-ink-soft)]">{items.length} aset · {dicek} dicek · {hilang} tidak ditemukan · {rusakBerat} rusak berat{sesi.nomor_ba ? ` · BA ${sesi.nomor_ba}` : ''}{sesi.tim ? ` · Tim: ${sesi.tim}` : ''}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => openCetak('lhi', opnameId)}><Printer className="h-4 w-4" /> Cetak LHI</Button>
            <Button variant="outline" onClick={() => openCetak('ba_inventarisasi', opnameId)}><Printer className="h-4 w-4" /> Cetak BA</Button>
            {editable && <Button variant="outline" onClick={generate} disabled={busy}><Download className="h-4 w-4" /> {items.length ? 'Tarik Ulang' : 'Tarik dari Inventaris'}</Button>}
            {editable && <Button onClick={selesaikan} disabled={busy}><CheckCircle2 className="h-4 w-4" /> Selesaikan</Button>}
          </div>
        </div>
        {editable && (
          <div className="mt-3 grid grid-cols-1 gap-3 border-t border-[var(--color-border)] pt-3 sm:grid-cols-2">
            <Input label="Tim Inventarisasi" defaultValue={sesi.tim || ''} onBlur={(e) => { if ((e.target.value || '') !== (sesi.tim || '')) simpanMeta({ tim: e.target.value.trim() || null }) }} placeholder="mis. Tata Usaha & PKS Sarpras" />
            <Input label="No. Berita Acara (opsional — otomatis saat selesai)" defaultValue={sesi.nomor_ba || ''} onBlur={(e) => { if ((e.target.value || '') !== (sesi.nomor_ba || '')) simpanMeta({ nomor_ba: e.target.value.trim() || null }) }} />
          </div>
        )}
        {sesi.penghapusan_id && (
          <p className="mt-3 rounded-md bg-[var(--color-gold-soft)] px-3 py-2 text-sm text-[var(--color-gold)]"><b>Tindak lanjut:</b> aset hilang/rusak berat telah dibuatkan <b>draft usulan Penghapusan</b> otomatis. Buka menu <b>Penghapusan</b> untuk mengajukannya ke Yayasan.</p>
        )}
      </Card>
      <SectionCard title="Daftar Hasil Inventarisasi (LHI)">
        {items.length === 0 ? (
          <EmptyState icon={ClipboardList} title="Belum ada item" description={editable ? 'Klik "Tarik dari Inventaris" untuk memuat daftar aset.' : 'Sesi ini belum memuat aset.'} />
        ) : (
          <div className="overflow-x-auto">
            <Table columns={['Kode', 'Nama', 'Kondisi Tercatat', 'Temuan', 'Kondisi Aktual', editable ? '' : null].filter((c) => c !== null)}>
              {items.map((it) => (
                <Tr key={it.id}>
                  <Td><span className="font-mono text-xs">{it.kode_aset || '—'}</span></Td>
                  <Td className="font-medium">{it.nama_aset}</Td>
                  <Td className="text-xs">{it.kondisi_tercatat ? KONDISI_LABEL[it.kondisi_tercatat] || it.kondisi_tercatat : '—'}</Td>
                  <Td>{it.ditemukan === null ? <span className="text-xs text-[var(--color-ink-soft)]">belum dicek</span> : it.ditemukan ? <Badge color="success">Ada</Badge> : <Badge color="danger">Hilang</Badge>}</Td>
                  <Td className="text-xs">{it.kondisi_aktual ? KONDISI_LABEL[it.kondisi_aktual] : '—'}</Td>
                  {editable && <Td className="text-right"><Button size="sm" variant="outline" onClick={() => setPeriksa(it)}><ClipboardCheck className="h-3.5 w-3.5" /> Periksa</Button></Td>}
                </Tr>
              ))}
            </Table>
          </div>
        )}
      </SectionCard>
      {sesi.school_id && <DokumenAreaCard area="Inventarisasi" schoolId={sesi.school_id} />}
      <OpnameItemModal open={!!periksa} item={periksa} onClose={() => setPeriksa(null)} onSaved={() => { setPeriksa(null); load() }} />
    </div>
  )
}

function OpnameItemModal({ open, item, onClose, onSaved }) {
  const [f, setF] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!open || !item) return
    setError('')
    setF({ ditemukan: item.ditemukan === null ? 'true' : String(item.ditemukan), kondisi_aktual: item.kondisi_aktual || '', catatan: item.catatan || '' })
  }, [open, item])
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(''); setSaving(true)
    const payload = {
      ditemukan: f.ditemukan === 'true',
      kondisi_aktual: f.kondisi_aktual || null,
      catatan: f.catatan?.trim() || null,
    }
    const { error: err } = await supabase.from('aset_opname_item').update(payload).eq('id', item.id)
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }
  if (!item) return null
  return (
    <Modal open={open} onClose={onClose} title={`Periksa — ${item.nama_aset}`} width="max-w-md">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Select label="Temuan Fisik" value={f.ditemukan || 'true'} onChange={(e) => set('ditemukan', e.target.value)}>
          <option value="true">Ada / ditemukan</option>
          <option value="false">Tidak ditemukan (hilang)</option>
        </Select>
        <Select label="Kondisi Aktual (perbarui aset)" value={f.kondisi_aktual || ''} onChange={(e) => set('kondisi_aktual', e.target.value)}>
          <option value="">— tidak diubah —</option>
          {KONDISI_OPTIONS.map((k) => <option key={k} value={k}>{KONDISI_LABEL[k]}</option>)}
        </Select>
        <Textarea label="Catatan" rows={2} value={f.catatan || ''} onChange={(e) => set('catatan', e.target.value)} />
        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Batal</Button><Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button></div>
      </form>
    </Modal>
  )
}

// =========================================================================
// TAB: PENGHAPUSAN & PEMINDAHTANGANAN — BAB X & XI
// Usulan (sekolah) → keputusan (Yayasan). Disetujui → aset otomatis dihapus.
// =========================================================================
function PenghapusanTab({ hasFullAccess, mySchools }) {
  const { schools, schoolId, setSchoolId } = useUnitFilter(hasFullAccess, mySchools)
  const managesUnit = useMemo(() => mySchools.some((s) => s.id === schoolId), [mySchools, schoolId])
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!schoolId) { setRows([]); setLoading(false); return }
    setLoading(true)
    const { data } = await supabase.from('aset_penghapusan').select('*, diajukan_nama:aset_penghapusan_diajukan_nama').eq('school_id', schoolId).order('created_at', { ascending: false })
    setRows(data || [])
    setLoading(false)
  }, [schoolId])
  useEffect(() => { load() }, [load])

  const createUsulan = async () => {
    setBusy(true)
    const { error } = await supabase.from('aset_penghapusan').insert({ school_id: schoolId, status: 'draft', judul: `Usulan Penghapusan ${new Date().getFullYear()}` })
    setBusy(false)
    if (error) { alert('Gagal: ' + error.message); return }
    load()
  }

  if (openId) return <PenghapusanDetail penghapusanId={openId} hasFullAccess={hasFullAccess} managesUnit={managesUnit} schoolId={schoolId} onBack={() => { setOpenId(null); load() }} />

  return (
    <div className="flex flex-col gap-5">
      <UnitBar hasFullAccess={hasFullAccess} schools={schools} schoolId={schoolId} setSchoolId={setSchoolId}
        right={managesUnit && schoolId && <Button onClick={createUsulan} disabled={busy}><Plus className="h-4 w-4" /> Usulan Penghapusan</Button>} />
      {!schoolId ? (
        hasFullAccess ? <PenghapusanRekap onOpen={setSchoolId} /> : <p className="text-sm text-[var(--color-ink-soft)]">Pilih unit lebih dulu.</p>
      ) : loading ? <FullPageSpinner /> : (
        <SectionCard title="Usulan Penghapusan & Pemindahtanganan" description="Sekolah mengusulkan; Yayasan menyetujui. Setelah disetujui, aset otomatis ditandai dihapus di Inventaris.">
          {rows.length === 0 ? (
            <EmptyState icon={ArchiveX} title="Belum ada usulan" description={managesUnit ? 'Ajukan penghapusan aset rusak berat/idle/hilang.' : 'Unit ini belum mengajukan penghapusan.'} />
          ) : (
            <Table columns={['Judul', 'Cara', 'Diajukan Oleh', 'Status', '']}>
              {rows.map((r) => (
                <Tr key={r.id}>
                  <Td className="font-medium">{r.judul || '—'}</Td>
                  <Td className="text-xs">{r.cara || '—'}</Td>
                  <Td className="text-xs">{r.diajukan_nama || '—'}</Td>
                  <Td><Badge color={PENGHAPUSAN_STATUS_BADGE[r.status]}>{PENGHAPUSAN_STATUS_LABEL[r.status]}</Badge></Td>
                  <Td><button onClick={() => setOpenId(r.id)} className="text-sm font-medium text-[var(--color-navy)] hover:underline">Buka →</button></Td>
                </Tr>
              ))}
            </Table>
          )}
        </SectionCard>
      )}
    </div>
  )
}

function PenghapusanDetail({ penghapusanId, hasFullAccess, managesUnit, schoolId, onBack }) {
  const [u, setU] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [itemOpen, setItemOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const { data: hdr } = await supabase.from('aset_penghapusan').select('*, diajukan_nama:aset_penghapusan_diajukan_nama').eq('id', penghapusanId).maybeSingle()
    const { data: it } = await supabase.from('aset_penghapusan_item').select('*').eq('penghapusan_id', penghapusanId).order('created_at')
    setU(hdr || null); setItems(it || [])
    setLoading(false)
  }, [penghapusanId])
  useEffect(() => { load() }, [load])

  if (loading) return <FullPageSpinner />
  if (!u) return <EmptyState title="Usulan tidak ditemukan" />

  const status = u.status
  const canEdit = hasFullAccess || (managesUnit && ['draft', 'dikembalikan'].includes(status))
  const canSubmit = managesUnit && ['draft', 'dikembalikan'].includes(status)
  const canDecide = hasFullAccess && status === 'diajukan'

  const saveHeader = async (patch) => {
    setBusy(true); setError('')
    const { error: err } = await supabase.from('aset_penghapusan').update(patch).eq('id', u.id)
    setBusy(false)
    if (err) { setError(err.message); return false }
    load(); return true
  }
  const handleAjukan = async () => { if (items.length === 0) { setError('Tambahkan minimal satu aset.'); return } saveHeader({ status: 'diajukan' }) }
  const handleSetujui = async () => {
    const suggested = u.nomor_sk || await autoNo(schoolId, 'SK')
    const sk = prompt('Nomor SK Penghapusan:', suggested)
    if (sk === null) return
    if (!confirm('Setujui usulan penghapusan ini? Aset yang tercantum akan otomatis ditandai DIHAPUS di Inventaris.')) return
    saveHeader({ status: 'disahkan', nomor_sk: sk.trim() || null })
  }
  const handleTolak = async () => { const c = prompt('Alasan ditolak/dikembalikan:'); if (c === null) return; saveHeader({ status: 'dikembalikan', catatan_yayasan: c.trim() || 'Perlu perbaikan.' }) }
  const deleteItem = async (it) => { if (!confirm(`Hapus "${it.nama_aset}" dari usulan?`)) return; await supabase.from('aset_penghapusan_item').delete().eq('id', it.id); load() }

  return (
    <div className="flex flex-col gap-4">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]"><RotateCcw className="h-4 w-4" /> Kembali ke daftar usulan</button>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex-1 min-w-[240px]">
            <div className="flex items-center gap-2"><h3 className="text-base font-semibold text-[var(--color-ink)]">{u.judul || 'Usulan Penghapusan'}</h3><Badge color={PENGHAPUSAN_STATUS_BADGE[status]}>{PENGHAPUSAN_STATUS_LABEL[status]}</Badge></div>
            {u.diajukan_nama && <p className="mt-1 text-xs text-[var(--color-ink-soft)]">Diajukan oleh {u.diajukan_nama}{u.diajukan_at ? ` · ${new Date(u.diajukan_at).toLocaleDateString('id-ID')}` : ''}</p>}
            {status === 'disahkan' && <p className="mt-2 rounded-md bg-[var(--color-success-soft)] px-3 py-2 text-sm text-[var(--color-success)]">Disetujui{u.nomor_sk ? ` · SK ${u.nomor_sk}` : ''} — aset telah ditandai dihapus di Inventaris.</p>}
            {status === 'dikembalikan' && u.catatan_yayasan && <p className="mt-2 rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]"><b>Catatan Yayasan:</b> {u.catatan_yayasan}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {canSubmit && <Button onClick={handleAjukan} disabled={busy}><Send className="h-4 w-4" /> Ajukan</Button>}
            {canDecide && <Button onClick={handleSetujui} disabled={busy}><CheckCircle2 className="h-4 w-4" /> Setujui</Button>}
            {canDecide && <Button variant="outline" onClick={handleTolak} disabled={busy}><RotateCcw className="h-4 w-4" /> Tolak</Button>}
            <Button variant="outline" onClick={() => openCetak('permohonan_penghapusan', u.id)}><Printer className="h-4 w-4" /> Permohonan</Button>
            {status === 'disahkan' && <Button variant="outline" onClick={() => openCetak('sk_penghapusan', u.id)}><Printer className="h-4 w-4" /> SK</Button>}
          </div>
        </div>
        {canEdit && (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Input label="Judul" value={u.judul || ''} onChange={(e) => setU((s) => ({ ...s, judul: e.target.value }))} onBlur={(e) => saveHeader({ judul: e.target.value.trim() || null })} />
            <Select label="Alasan" value={u.alasan || ''} onChange={(e) => { setU((s) => ({ ...s, alasan: e.target.value })); saveHeader({ alasan: e.target.value || null }) }}>
              <option value="">—</option>
              {PENGHAPUSAN_ALASAN_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </Select>
            <Select label="Cara Tindak Lanjut" value={u.cara || ''} onChange={(e) => { setU((s) => ({ ...s, cara: e.target.value })); saveHeader({ cara: e.target.value || null }) }}>
              <option value="">—</option>
              {PENGHAPUSAN_CARA_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </Select>
          </div>
        )}
        {error && <p className="mt-3 rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
      </Card>

      <SectionCard title={`Aset Diusulkan (${items.length})`} actions={canEdit ? <Button size="sm" onClick={() => setItemOpen(true)}><Plus className="h-4 w-4" /> Tambah Aset</Button> : null}>
        {items.length === 0 ? (
          <EmptyState icon={ArchiveX} title="Belum ada aset" description="Tambahkan aset yang diusulkan untuk dihapus." />
        ) : (
          <Table columns={['Kode', 'Nama', 'Kondisi', 'Nilai', 'Keterangan', canEdit ? '' : null].filter((c) => c !== null)}>
            {items.map((it) => (
              <Tr key={it.id}>
                <Td><span className="font-mono text-xs">{it.kode_aset || '—'}</span></Td>
                <Td className="font-medium">{it.nama_aset}</Td>
                <Td className="text-xs">{it.kondisi ? (KONDISI_LABEL[it.kondisi] || it.kondisi) : '—'}</Td>
                <Td>{it.nilai != null ? formatRupiah(it.nilai) : '—'}</Td>
                <Td className="text-xs">{it.keterangan || '—'}</Td>
                {canEdit && <Td><button onClick={() => deleteItem(it)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus"><Trash2 className="h-4 w-4" /></button></Td>}
              </Tr>
            ))}
          </Table>
        )}
      </SectionCard>

      {schoolId && <DokumenAreaCard area="Penghapusan" schoolId={schoolId} />}
      <PenghapusanItemModal open={itemOpen} penghapusanId={penghapusanId} schoolId={schoolId} onClose={() => setItemOpen(false)} onSaved={() => { setItemOpen(false); load() }} />
    </div>
  )
}

function PenghapusanItemModal({ open, penghapusanId, schoolId, onClose, onSaved }) {
  const [f, setF] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!open) return
    setError('')
    setF({ aset_id: '', kode_aset: '', nama_aset: '', kondisi: '', nilai: '', keterangan: '' })
  }, [open])
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const pickAset = (id, a) => {
    if (!a) { setF((s) => ({ ...s, aset_id: '', kode_aset: '', nama_aset: '', kondisi: '' })); return }
    setF((s) => ({ ...s, aset_id: id, kode_aset: a.kode_aset || '', nama_aset: a.nama || '', kondisi: a.kondisi || '' }))
  }
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!f.aset_id && !f.nama_aset?.trim()) { setError('Pilih aset dari Inventaris.'); return }
    setError(''); setSaving(true)
    const payload = {
      penghapusan_id: penghapusanId,
      aset_id: f.aset_id || null,
      kode_aset: f.kode_aset || null,
      nama_aset: f.nama_aset?.trim() || null,
      kondisi: f.kondisi || null,
      nilai: f.nilai === '' ? null : Number(f.nilai),
      keterangan: f.keterangan?.trim() || null,
    }
    const { error: err } = await supabase.from('aset_penghapusan_item').insert(payload)
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }
  return (
    <Modal open={open} onClose={onClose} title="Tambah Aset ke Usulan Penghapusan" width="max-w-lg">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <AsetPicker schoolId={schoolId} value={f.aset_id} onChange={pickAset} onlyAktif={true} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Nilai (Rp)" type="number" value={f.nilai ?? ''} onChange={(e) => set('nilai', e.target.value)} />
          <Select label="Kondisi" value={f.kondisi || ''} onChange={(e) => set('kondisi', e.target.value)}>
            <option value="">—</option>
            {KONDISI_OPTIONS.map((k) => <option key={k} value={k}>{KONDISI_LABEL[k]}</option>)}
          </Select>
        </div>
        <Input label="Keterangan" value={f.keterangan || ''} onChange={(e) => set('keterangan', e.target.value)} />
        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Batal</Button><Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button></div>
      </form>
    </Modal>
  )
}

// =========================================================================
// TAB: BARANG HABIS PAKAI (BHP) — persediaan + buku transaksi (stok otomatis).
// =========================================================================
// Daftar standar barang habis pakai (preset) — untuk mengisi katalog cepat
// tanpa mengetik satu per satu. Stok awal 0; diisi lewat transaksi/pengadaan.
const BHP_PRESET = [
  { nama: 'Kertas HVS A4 70gr', satuan: 'rim' }, { nama: 'Kertas HVS F4 70gr', satuan: 'rim' },
  { nama: 'Pulpen', satuan: 'pcs' }, { nama: 'Pensil', satuan: 'pcs' },
  { nama: 'Spidol Whiteboard', satuan: 'pcs' }, { nama: 'Spidol Permanen', satuan: 'pcs' },
  { nama: 'Tinta Printer', satuan: 'botol' }, { nama: 'Tinta Stempel', satuan: 'botol' },
  { nama: 'Penghapus Papan Tulis', satuan: 'pcs' }, { nama: 'Isi Staples', satuan: 'kotak' },
  { nama: 'Klip Kertas', satuan: 'kotak' }, { nama: 'Map Folder', satuan: 'pcs' },
  { nama: 'Amplop', satuan: 'pcs' }, { nama: 'Lem Kertas', satuan: 'pcs' },
  { nama: 'Buku Tulis', satuan: 'pcs' }, { nama: 'Buku Folio', satuan: 'pcs' },
  { nama: 'Baterai AA', satuan: 'pcs' },
  { nama: 'Sabun Cuci Tangan', satuan: 'botol' }, { nama: 'Pembersih Lantai', satuan: 'botol' },
  { nama: 'Pembersih Kaca', satuan: 'botol' }, { nama: 'Pengharum Ruangan', satuan: 'pcs' },
  { nama: 'Tisu', satuan: 'pack' }, { nama: 'Kantong Sampah', satuan: 'pack' },
  { nama: 'Sapu', satuan: 'pcs' }, { nama: 'Kain Pel', satuan: 'pcs' },
  { nama: 'Masker', satuan: 'box' }, { nama: 'Hand Sanitizer', satuan: 'botol' },
  { nama: 'Kapas', satuan: 'pack' }, { nama: 'Plester Luka', satuan: 'box' },
]

function BhpTab({ hasFullAccess, mySchools }) {
  const { schools, schoolId, setSchoolId } = useUnitFilter(hasFullAccess, mySchools)
  const managesUnit = useMemo(() => mySchools.some((s) => s.id === schoolId), [mySchools, schoolId])
  const canManage = hasFullAccess || managesUnit
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [trxItem, setTrxItem] = useState(null)

  const load = useCallback(async () => {
    if (!schoolId) { setRows([]); setLoading(false); return }
    setLoading(true)
    const { data } = await supabase.from('barang_habis_pakai').select('*').eq('school_id', schoolId).order('nama')
    setRows(data || []); setLoading(false)
  }, [schoolId])
  useEffect(() => { load() }, [load])

  const handleDelete = async (row) => {
    if (!confirm(`Hapus "${row.nama}" beserta riwayat transaksinya?`)) return
    const { error } = await supabase.from('barang_habis_pakai').delete().eq('id', row.id)
    if (error) { alert('Gagal: ' + error.message); return }
    load()
  }

  // Isi daftar dari preset standar (lewati nama yang sudah ada).
  const seedPreset = async () => {
    if (!schoolId) return
    const ada = new Set(rows.map((r) => (r.nama || '').trim().toLowerCase()))
    const toCreate = BHP_PRESET.filter((p) => !ada.has(p.nama.toLowerCase())).map((p) => ({ school_id: schoolId, nama: p.nama, satuan: p.satuan, stok_min: 0 }))
    if (toCreate.length === 0) { alert('Semua barang standar sudah ada di daftar.'); return }
    if (!confirm(`Tambahkan ${toCreate.length} barang habis pakai standar ke daftar? Stok awal 0 — diisi lewat transaksi/pengadaan. Barang yang sudah ada dilewati.`)) return
    setSeeding(true)
    const { error } = await supabase.from('barang_habis_pakai').insert(toCreate)
    setSeeding(false)
    if (error) { alert('Gagal: ' + error.message); return }
    load()
  }

  return (
    <div className="flex flex-col gap-5">
      <UnitBar hasFullAccess={hasFullAccess} schools={schools} schoolId={schoolId} setSchoolId={setSchoolId}
        right={schoolId && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => openCetak('buku_pengeluaran', schoolId)}><Printer className="h-4 w-4" /> Buku Pengeluaran</Button>
            {canManage && <Button variant="outline" onClick={seedPreset} disabled={seeding}><Download className="h-4 w-4" /> {seeding ? 'Mengisi…' : 'Isi dari daftar standar'}</Button>}
            {canManage && <Button onClick={() => { setEditing(null); setFormOpen(true) }}><Plus className="h-4 w-4" /> Tambah Barang</Button>}
          </div>
        )} />
      {!schoolId ? (
        <p className="text-sm text-[var(--color-ink-soft)]">Pilih unit lebih dulu.</p>
      ) : loading ? <FullPageSpinner /> : (
        <SectionCard title="Barang Habis Pakai (Persediaan)" description="Terisi otomatis: (1) klik “Isi dari daftar standar” untuk katalog umum, dan (2) item pengadaan yang ditandai “Barang Habis Pakai” otomatis menambah stok saat diterima. Stok diperbarui otomatis dari transaksi masuk/keluar; kartu stok dicetak sebagai Buku Persediaan.">
          {rows.length === 0 ? (
            <EmptyState icon={Package} title="Belum ada barang" description="Klik “Isi dari daftar standar” untuk mengisi katalog umum, atau tandai item pengadaan sebagai barang habis pakai agar stoknya terisi otomatis." />
          ) : (
            <div className="overflow-x-auto">
              <Table columns={['Nama', 'Satuan', 'Stok', 'Stok Min', 'Status', canManage ? 'Aksi' : 'Aksi']}>
                {rows.map((r) => {
                  const low = Number(r.stok) <= Number(r.stok_min)
                  return (
                    <Tr key={r.id}>
                      <Td className="font-medium">{r.nama}</Td>
                      <Td>{r.satuan}</Td>
                      <Td className="font-medium">{Number(r.stok)}</Td>
                      <Td>{Number(r.stok_min)}</Td>
                      <Td>{low ? <Badge color="danger">Perlu isi ulang</Badge> : <Badge color="success">Aman</Badge>}</Td>
                      <Td className="text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button size="sm" variant="outline" onClick={() => setTrxItem(r)}><ClipboardList className="h-3.5 w-3.5" /> Transaksi</Button>
                          <button onClick={() => openCetak('buku_persediaan', r.id)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Cetak kartu stok"><Printer className="h-4 w-4" /></button>
                          {canManage && <button onClick={() => { setEditing(r); setFormOpen(true) }} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Ubah"><Pencil className="h-4 w-4" /></button>}
                          {canManage && <button onClick={() => handleDelete(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus"><Trash2 className="h-4 w-4" /></button>}
                        </div>
                      </Td>
                    </Tr>
                  )
                })}
              </Table>
            </div>
          )}
        </SectionCard>
      )}
      <BhpFormModal open={formOpen} schoolId={schoolId} editing={editing} onClose={() => { setFormOpen(false); setEditing(null) }} onSaved={() => { setFormOpen(false); setEditing(null); load() }} />
      <BhpTrxModal item={trxItem} onClose={() => setTrxItem(null)} onChanged={load} />
    </div>
  )
}

function BhpFormModal({ open, schoolId, editing, onClose, onSaved }) {
  const [f, setF] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isEdit = !!editing
  useEffect(() => {
    if (!open) return
    setError('')
    setF(editing
      ? { nama: editing.nama || '', satuan: editing.satuan || 'pcs', stok_min: String(editing.stok_min ?? '0') }
      : { nama: '', satuan: 'pcs', stok_min: '0', stok_awal: '0' })
  }, [open, editing])
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!f.nama?.trim()) { setError('Isi nama barang.'); return }
    setError(''); setSaving(true)
    if (isEdit) {
      const { error: err } = await supabase.from('barang_habis_pakai').update({ nama: f.nama.trim(), satuan: f.satuan.trim() || 'pcs', stok_min: Number(f.stok_min) || 0 }).eq('id', editing.id)
      setSaving(false); if (err) { setError(err.message); return }; onSaved(); return
    }
    const { data, error: err } = await supabase.from('barang_habis_pakai').insert({ school_id: schoolId, nama: f.nama.trim(), satuan: f.satuan.trim() || 'pcs', stok_min: Number(f.stok_min) || 0 }).select('id').single()
    if (err) { setSaving(false); setError(err.message); return }
    const awal = Number(f.stok_awal) || 0
    if (awal > 0 && data?.id) await supabase.from('bhp_transaksi').insert({ bhp_id: data.id, jenis: 'masuk', jumlah: awal, sumber_tujuan: 'Stok awal' })
    setSaving(false); onSaved()
  }
  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Ubah Barang' : 'Tambah Barang Habis Pakai'} width="max-w-md">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Input label="Nama Barang" required value={f.nama || ''} onChange={(e) => set('nama', e.target.value)} placeholder="mis. Kertas A4, Spidol" />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Satuan" value={f.satuan || ''} onChange={(e) => set('satuan', e.target.value)} />
          <Input label="Stok Minimum" type="number" value={f.stok_min ?? ''} onChange={(e) => set('stok_min', e.target.value)} />
        </div>
        {!isEdit && <Input label="Stok Awal" type="number" value={f.stok_awal ?? ''} onChange={(e) => set('stok_awal', e.target.value)} placeholder="dicatat sebagai transaksi masuk" />}
        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Batal</Button><Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button></div>
      </form>
    </Modal>
  )
}

function BhpTrxModal({ item, onClose, onChanged }) {
  const open = !!item
  const [trx, setTrx] = useState([])
  const [f, setF] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    if (!item) return
    const { data } = await supabase.from('bhp_transaksi').select('*').eq('bhp_id', item.id).order('tanggal', { ascending: false })
    setTrx(data || [])
  }, [item])
  useEffect(() => {
    if (!open) return
    setF({ jenis: 'masuk', jumlah: '', tanggal: new Date().toISOString().slice(0, 10), sumber_tujuan: '', keterangan: '' })
    setError(''); load()
  }, [open, load])
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const add = async (e) => {
    e.preventDefault()
    const j = Number(f.jumlah)
    if (!(j > 0)) { setError('Jumlah harus lebih dari 0.'); return }
    setError(''); setSaving(true)
    const { error: err } = await supabase.from('bhp_transaksi').insert({ bhp_id: item.id, jenis: f.jenis, jumlah: j, tanggal: f.tanggal || null, sumber_tujuan: f.sumber_tujuan?.trim() || null, keterangan: f.keterangan?.trim() || null })
    setSaving(false)
    if (err) { setError(err.message); return }
    setF((s) => ({ ...s, jumlah: '', sumber_tujuan: '', keterangan: '' }))
    load(); if (onChanged) onChanged()
  }
  const del = async (t) => { if (!confirm('Hapus transaksi ini? Stok akan dikembalikan.')) return; await supabase.from('bhp_transaksi').delete().eq('id', t.id); load(); if (onChanged) onChanged() }
  if (!item) return null
  return (
    <Modal open={open} onClose={onClose} title={`Transaksi — ${item.nama}`} width="max-w-xl">
      <form onSubmit={add} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Select label="Jenis" value={f.jenis || 'masuk'} onChange={(e) => set('jenis', e.target.value)}>
            <option value="masuk">Masuk</option>
            <option value="keluar">Keluar</option>
          </Select>
          <Input label="Jumlah" type="number" value={f.jumlah ?? ''} onChange={(e) => set('jumlah', e.target.value)} />
          <Input label="Tanggal" type="date" value={f.tanggal || ''} onChange={(e) => set('tanggal', e.target.value)} />
          <Input label={f.jenis === 'masuk' ? 'Pemasok' : 'Penerima'} value={f.sumber_tujuan || ''} onChange={(e) => set('sumber_tujuan', e.target.value)} />
        </div>
        <Input label="Keterangan" value={f.keterangan || ''} onChange={(e) => set('keterangan', e.target.value)} />
        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end"><Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Tambah Transaksi'}</Button></div>
      </form>
      <div className="mt-4 overflow-x-auto">
        <Table columns={['Tanggal', 'Jenis', 'Jumlah', 'Sumber/Tujuan', '']}>
          {trx.length === 0 ? (
            <Tr><Td>—</Td><Td></Td><Td></Td><Td></Td><Td></Td></Tr>
          ) : trx.map((t) => (
            <Tr key={t.id}>
              <Td className="text-xs">{t.tanggal ? new Date(t.tanggal).toLocaleDateString('id-ID') : '—'}</Td>
              <Td><Badge color={t.jenis === 'masuk' ? 'success' : 'gold'}>{t.jenis === 'masuk' ? 'Masuk' : 'Keluar'}</Badge></Td>
              <Td>{Number(t.jumlah)}</Td>
              <Td className="text-xs">{t.sumber_tujuan || '—'}</Td>
              <Td className="text-right"><button onClick={() => del(t)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus"><Trash2 className="h-4 w-4" /></button></Td>
            </Tr>
          ))}
        </Table>
      </div>
    </Modal>
  )
}

// Standar Harga (referensi Yayasan) — dipakai memvalidasi harga usulan.
function StandarHargaPanel({ tahun, canEdit = true }) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState([])
  const [klasifikasiList, setKlasifikasiList] = useState([])
  const [loading, setLoading] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: sh }, { data: klas }] = await Promise.all([
      supabase.from('dka_standar_harga').select('*, aset_klasifikasi(kode, uraian)').eq('tahun', tahun).order('nama_aset'),
      supabase.from('aset_klasifikasi').select('*').order('kode'),
    ])
    setRows(sh || [])
    setKlasifikasiList(klas || [])
    setLoading(false)
  }, [tahun])

  useEffect(() => { if (open) load() }, [open, load])

  const handleDelete = async (row) => {
    if (!confirm(`Hapus standar harga "${row.nama_aset}"?`)) return
    const { error } = await supabase.from('dka_standar_harga').delete().eq('id', row.id)
    if (error) { alert('Gagal: ' + error.message); return }
    load()
  }

  return (
    <SectionCard
      title={`Standar Harga ${tahun}`}
      description="Referensi harga maksimal (dikelola Yayasan). Harga usulan di atas standar akan ditandai butuh justifikasi."
      actions={
        <div className="flex items-center gap-2">
          {open && canEdit && <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true) }}><Plus className="h-4 w-4" /> Tambah</Button>}
          <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}><Tag className="h-4 w-4" /> {open ? 'Tutup' : 'Buka'}</Button>
        </div>
      }
    >
      {!open ? null : loading ? <p className="text-sm text-[var(--color-ink-soft)]">Memuat…</p> : rows.length === 0 ? (
        <EmptyState icon={Tag} title="Belum ada standar harga" description={canEdit ? `Tetapkan standar harga untuk tahun ${tahun}.` : 'Yayasan belum menetapkan standar harga tahun ini.'} />
      ) : (
        <Table columns={['Kode', 'Nama Aset / Jasa', 'Satuan', 'Harga Maksimal', 'Sumber Rujukan', canEdit ? '' : null].filter((c) => c !== null)}>
          {rows.map((r) => (
            <Tr key={r.id}>
              <Td><span className="font-mono text-xs">{r.aset_klasifikasi?.kode || '—'}</span></Td>
              <Td>{r.nama_aset}</Td>
              <Td>{r.satuan}</Td>
              <Td>{formatRupiah(r.harga_maksimal)}</Td>
              <Td className="text-xs text-[var(--color-ink-soft)]">{r.sumber_rujukan || '—'}</Td>
              {canEdit && (
                <Td>
                  <div className="flex justify-end gap-1.5">
                    <button onClick={() => { setEditing(r); setFormOpen(true) }} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Ubah"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => handleDelete(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </Td>
              )}
            </Tr>
          ))}
        </Table>
      )}
      {canEdit && <StandarHargaModal open={formOpen} tahun={tahun} editing={editing} klasifikasiList={klasifikasiList} onClose={() => { setFormOpen(false); setEditing(null) }} onSaved={() => { setFormOpen(false); setEditing(null); load() }} />}
    </SectionCard>
  )
}

// Panel generik untuk Standar Aset & Standar Kebutuhan (kode_ref teks bebas,
// dikelola Yayasan; dibaca semua manajer). def menentukan tabel, kolom, field.
function StandarRefPanel({ tahun, canEdit, def }) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState([])
  const [klasifikasiList, setKlasifikasiList] = useState([])
  const [loading, setLoading] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    // Join kodefikasi (aset_klasifikasi) untuk menarik Kode Ref resmi. Daftar
    // klasifikasi dimuat sekali untuk pemilih di form.
    const [{ data }, { data: klas }] = await Promise.all([
      supabase.from(def.table).select('*, aset_klasifikasi(kode, uraian)').eq('tahun', tahun).order('kode_ref'),
      supabase.from('aset_klasifikasi').select('*').order('kode'),
    ])
    setRows(data || [])
    setKlasifikasiList(klas || [])
    setLoading(false)
  }, [tahun, def.table])
  useEffect(() => { if (open) load() }, [open, load])

  const handleDelete = async (row) => {
    if (!confirm(`Hapus "${row.nama_aset}"?`)) return
    const { error } = await supabase.from(def.table).delete().eq('id', row.id)
    if (error) { alert('Gagal: ' + error.message); return }
    load()
  }

  return (
    <SectionCard
      title={`${def.title} ${tahun}`}
      description={def.desc}
      actions={
        <div className="flex items-center gap-2">
          {open && canEdit && <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true) }}><Plus className="h-4 w-4" /> Tambah</Button>}
          <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}><Tag className="h-4 w-4" /> {open ? 'Tutup' : 'Buka'}</Button>
        </div>
      }
    >
      {!open ? null : loading ? <p className="text-sm text-[var(--color-ink-soft)]">Memuat…</p> : rows.length === 0 ? (
        <EmptyState icon={Tag} title={`Belum ada ${def.title.toLowerCase()}`} description={canEdit ? `Tetapkan untuk tahun ${tahun}.` : `Yayasan belum menetapkan ${def.title.toLowerCase()} tahun ini.`} />
      ) : (
        <div className="overflow-x-auto">
          <Table columns={[...def.columns.map((c) => c.label), canEdit ? '' : null].filter((c) => c !== null)}>
            {rows.map((r) => (
              <Tr key={r.id}>
                {def.columns.map((c) => (
                  <Td key={c.key} className={c.mono ? 'font-mono text-xs' : (c.small ? 'text-xs text-[var(--color-ink-soft)]' : '')}>
                    {c.key === 'kode_ref' ? (r.aset_klasifikasi?.kode || r.kode_ref || '—') : (r[c.key] || '—')}
                  </Td>
                ))}
                {canEdit && (
                  <Td>
                    <div className="flex justify-end gap-1.5">
                      <button onClick={() => { setEditing(r); setFormOpen(true) }} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Ubah"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => handleDelete(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </Td>
                )}
              </Tr>
            ))}
          </Table>
        </div>
      )}
      {canEdit && <StandarRefModal open={formOpen} tahun={tahun} editing={editing} def={def} klasifikasiList={klasifikasiList} onClose={() => { setFormOpen(false); setEditing(null) }} onSaved={() => { setFormOpen(false); setEditing(null); load() }} />}
    </SectionCard>
  )
}

function StandarRefModal({ open, tahun, editing, def, klasifikasiList = [], onClose, onSaved }) {
  const [f, setF] = useState({})
  const [klasifikasiId, setKlasifikasiId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isEdit = !!editing

  useEffect(() => {
    if (!open) return
    setError('')
    const init = {}
    for (const fld of def.fields) init[fld.key] = editing ? (editing[fld.key] ?? '') : (fld.default ?? '')
    setF(init)
    setKlasifikasiId(editing?.klasifikasi_id || '')
  }, [open, editing, def.fields])

  const set = (k, v) => setF((prev) => ({ ...prev, [k]: v }))

  // Saat klasifikasi (kodefikasi) dipilih: Kode Ref & Nama Aset ikut terisi
  // otomatis dari tabel kodefikasi — tapi hanya bila masih kosong, agar isian
  // manual pengguna tidak ditimpa.
  const pickKlasifikasi = (id) => {
    setKlasifikasiId(id)
    const k = klasifikasiList.find((x) => x.id === id)
    if (!k) return
    setF((prev) => ({
      ...prev,
      kode_ref: prev.kode_ref?.trim() ? prev.kode_ref : k.kode,
      nama_aset: prev.nama_aset?.trim() ? prev.nama_aset : k.uraian,
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!f.nama_aset?.trim()) { setError('Isi nama aset.'); return }
    setSaving(true); setError('')
    const payload = { tahun, klasifikasi_id: klasifikasiId || null }
    for (const fld of def.fields) {
      let v = f[fld.key]
      if (fld.type === 'number') v = v === '' || v == null ? null : Number(v)
      else v = (typeof v === 'string' ? v.trim() : v) || null
      payload[fld.key] = v
    }
    payload.nama_aset = f.nama_aset.trim()
    const query = isEdit ? supabase.from(def.table).update(payload).eq('id', editing.id) : supabase.from(def.table).insert(payload)
    const { error: err } = await query
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? `Ubah ${def.title}` : `Tambah ${def.title} ${tahun}`} width="max-w-lg">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <KlasifikasiPicker klasifikasiList={klasifikasiList} value={klasifikasiId} onChange={pickKlasifikasi} />
        <p className="-mt-1 text-xs text-[var(--color-ink-soft)]">Pilih dari kodefikasi aset — Kode Ref & Nama Aset terisi otomatis dan konsisten dengan Standar Harga. Kode Ref manual di bawah hanya cadangan bila belum ada di kodefikasi.</p>
        {def.fields.map((fld) => (
          fld.multiline
            ? <Textarea key={fld.key} label={fld.label} rows={2} value={f[fld.key] || ''} onChange={(e) => set(fld.key, e.target.value)} />
            : <Input key={fld.key} label={fld.key === 'kode_ref' ? 'Kode Ref (manual, opsional)' : fld.label} type={fld.type === 'number' ? 'number' : 'text'} required={fld.key === 'nama_aset'} value={f[fld.key] ?? ''} onChange={(e) => set(fld.key, e.target.value)} placeholder={fld.placeholder || ''} />
        ))}
        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button>
        </div>
      </form>
    </Modal>
  )
}

const STANDAR_ASET_DEF = {
  table: 'dka_standar_aset',
  title: 'Standar Aset',
  desc: 'STD-01 — spesifikasi minimal aset (dikelola Yayasan).',
  columns: [
    { key: 'kode_ref', label: 'Kode', mono: true },
    { key: 'nama_aset', label: 'Nama Aset' },
    { key: 'kelompok_aset', label: 'Kelompok' },
    { key: 'spesifikasi_minimal', label: 'Spesifikasi Minimal', small: true },
    { key: 'umur_manfaat_tahun', label: 'Umur (thn)' },
  ],
  fields: [
    { key: 'kode_ref', label: 'Kode Ref (mis. PRB-001)' },
    { key: 'nama_aset', label: 'Nama Aset' },
    { key: 'kelompok_aset', label: 'Kelompok Aset' },
    { key: 'spesifikasi_minimal', label: 'Spesifikasi Minimal', multiline: true },
    { key: 'keterangan_rujukan', label: 'Keterangan / Rujukan' },
    { key: 'umur_manfaat_tahun', label: 'Umur Manfaat (tahun)', type: 'number' },
  ],
}
const STANDAR_KEBUTUHAN_DEF = {
  table: 'dka_standar_kebutuhan',
  title: 'Standar Kebutuhan',
  desc: 'STD-02 — jumlah ideal aset sebagai acuan (dikelola Yayasan).',
  columns: [
    { key: 'kode_ref', label: 'Kode', mono: true },
    { key: 'nama_aset', label: 'Nama Aset' },
    { key: 'peruntukan', label: 'Peruntukan / Unit' },
    { key: 'jumlah_ideal', label: 'Jumlah Ideal' },
    { key: 'satuan', label: 'Satuan' },
  ],
  fields: [
    { key: 'kode_ref', label: 'Kode Ref (mis. PRB-001)' },
    { key: 'nama_aset', label: 'Nama Aset' },
    { key: 'peruntukan', label: 'Peruntukan / Unit Kerja' },
    { key: 'dasar_perhitungan', label: 'Dasar Perhitungan', multiline: true },
    { key: 'jumlah_ideal', label: 'Jumlah Ideal (mis. 1 per peserta didik)' },
    { key: 'satuan', label: 'Satuan', default: 'unit' },
  ],
}

function StandarAsetPanel({ tahun, canEdit }) {
  return <StandarRefPanel tahun={tahun} canEdit={canEdit} def={STANDAR_ASET_DEF} />
}
function StandarKebutuhanPanel({ tahun, canEdit }) {
  return <StandarRefPanel tahun={tahun} canEdit={canEdit} def={STANDAR_KEBUTUHAN_DEF} />
}

function StandarHargaModal({ open, tahun, editing, klasifikasiList, onClose, onSaved }) {
  const [f, setF] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isEdit = !!editing

  useEffect(() => {
    if (!open) return
    setError('')
    setF(editing
      ? { klasifikasi_id: editing.klasifikasi_id || '', nama_aset: editing.nama_aset || '', satuan: editing.satuan || 'unit', harga_maksimal: String(editing.harga_maksimal ?? '0'), sumber_rujukan: editing.sumber_rujukan || '' }
      : { klasifikasi_id: '', nama_aset: '', satuan: 'unit', harga_maksimal: '0', sumber_rujukan: '' })
  }, [open, editing])

  const set = (k, v) => setF((prev) => ({ ...prev, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!f.nama_aset?.trim()) { setError('Isi nama aset/jasa.'); return }
    setSaving(true); setError('')
    const payload = {
      tahun, klasifikasi_id: f.klasifikasi_id || null, nama_aset: f.nama_aset.trim(), satuan: f.satuan?.trim() || 'unit',
      harga_maksimal: Number(f.harga_maksimal) || 0, sumber_rujukan: f.sumber_rujukan?.trim() || null,
    }
    const query = isEdit ? supabase.from('dka_standar_harga').update(payload).eq('id', editing.id) : supabase.from('dka_standar_harga').insert(payload)
    const { error: err } = await query
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Ubah Standar Harga' : `Tambah Standar Harga ${tahun}`} width="max-w-lg">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <KlasifikasiPicker klasifikasiList={klasifikasiList} value={f.klasifikasi_id} onChange={(v) => set('klasifikasi_id', v)} />
        <Input label="Nama Aset / Jasa" required value={f.nama_aset || ''} onChange={(e) => set('nama_aset', e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Satuan" value={f.satuan || ''} onChange={(e) => set('satuan', e.target.value)} />
          <Input label="Harga Maksimal (Rp)" type="number" value={f.harga_maksimal ?? ''} onChange={(e) => set('harga_maksimal', e.target.value)} />
        </div>
        <Input label="Sumber Rujukan" value={f.sumber_rujukan || ''} onChange={(e) => set('sumber_rujukan', e.target.value)} placeholder="mis. survey pasar / e-katalog" />
        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button>
        </div>
      </form>
    </Modal>
  )
}
