import { useEffect, useState, useCallback, useMemo } from 'react'
import { Boxes, Plus, Pencil, Trash2, DoorOpen, ShieldAlert, Search, ClipboardList, Send, CheckCircle2, RotateCcw, Download, Tag, BookOpen, Clock3, ShieldCheck, Truck, ClipboardCheck, PackageCheck, Wrench, UserCheck, ScanLine, ArchiveX, Printer } from 'lucide-react'
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
import { DOKUMEN_LIST, listRecords } from '../../lib/dokumenSarpras'

// Buka halaman cetak dokumen di tab baru (siap print/PDF).
function openCetak(jenis, id) {
  window.open(id ? `/aset/cetak/${jenis}/${id}` : `/aset/cetak/${jenis}`, '_blank', 'noopener')
}

// Tiap area = satu halaman /aset/:area (menu dropdown di Sidebar). Konten
// dipilih dari SARPRAS_AREAS berdasarkan slug pada URL.
export default function AsetList() {
  const { isManager, hasFullAccess, roles, loading: authLoading } = useAuth()
  const { area } = useParams()
  const [sopOpen, setSopOpen] = useState(false)

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
  if (!isManager) {
    return <EmptyState icon={ShieldAlert} title="Akses terbatas" description="Halaman Sarana & Prasarana hanya untuk manajemen (Admin Yayasan/HR, Admin Sekolah, Kepala Sekolah)." />
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
  useEffect(() => {
    if (hasFullAccess) {
      supabase.from('schools').select('id, nama, jenjang').order('jenjang').then(({ data }) => setSchools(data || []))
    } else {
      setSchools(mySchools)
      if (!schoolId && mySchools.length) setSchoolId(mySchools[0].id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasFullAccess])
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
        <Button onClick={() => { setEditingRow(null); setFormOpen(true) }} disabled={!schoolId && !hasFullAccess}><Plus className="h-4 w-4" /> Tambah Aset</Button>
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
function RuanganTab({ hasFullAccess, mySchools }) {
  const { schools, schoolId, setSchoolId } = useUnitFilter(hasFullAccess, mySchools)
  const [rows, setRows] = useState([])
  const [counts, setCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editingRow, setEditingRow] = useState(null)

  const load = useCallback(async () => {
    if (!schoolId) { setRows([]); setCounts({}); setLoading(false); return }
    setLoading(true)
    const [{ data: r }, { data: aset }] = await Promise.all([
      supabase.from('ruangan').select('*, employees:pic_employee_id(nama)').eq('school_id', schoolId).order('nama'),
      supabase.from('aset').select('ruangan_id').eq('school_id', schoolId).eq('status', 'aktif'),
    ])
    const c = {}
    for (const a of (aset || [])) if (a.ruangan_id) c[a.ruangan_id] = (c[a.ruangan_id] || 0) + 1
    setRows(r || [])
    setCounts(c)
    setLoading(false)
  }, [schoolId])

  useEffect(() => { load() }, [load])

  const handleDelete = async (row) => {
    if (!confirm(`Hapus ruangan "${row.nama}"? Aset di dalamnya tidak ikut terhapus.`)) return
    const { error } = await supabase.from('ruangan').delete().eq('id', row.id)
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
        <Button onClick={() => { setEditingRow(null); setFormOpen(true) }} disabled={!schoolId}><Plus className="h-4 w-4" /> Tambah Ruangan</Button>
      </div>

      <SectionCard title="Daftar Ruangan" description="Kode Unit Kerja & Kode Ruangan dipakai untuk menyusun Kode Lokasi aset.">
        {!schoolId ? (
          <p className="text-sm text-[var(--color-ink-soft)]">Pilih unit lebih dulu.</p>
        ) : rows.length === 0 ? (
          <EmptyState icon={DoorOpen} title="Belum ada ruangan" description="Tambahkan ruangan (dasar KIR)." />
        ) : (
          <Table columns={['Kode Unit', 'Kode Ruang', 'Nama Ruangan', 'Lantai', 'PIC', 'Jml Aset', '']}>
            {rows.map((r) => (
              <Tr key={r.id}>
                <Td><span className="font-mono text-xs">{r.kode_unit_kerja || '—'}</span></Td>
                <Td><span className="font-mono text-xs">{r.kode_ruangan || '—'}</span></Td>
                <Td>{r.nama}</Td>
                <Td>{r.lantai || '—'}</Td>
                <Td>{r.employees?.nama || r.pic_nama || '—'}</Td>
                <Td>{counts[r.id] || 0}</Td>
                <Td>
                  <div className="flex justify-end gap-1.5">
                    <button onClick={() => { setEditingRow(r); setFormOpen(true) }} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Ubah"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => handleDelete(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </SectionCard>

      <RuanganFormModal open={formOpen} editingRow={editingRow} schoolId={schoolId} onClose={() => { setFormOpen(false); setEditingRow(null) }} onSaved={() => { setFormOpen(false); setEditingRow(null); load() }} />
    </div>
  )
}

function RuanganFormModal({ open, editingRow, schoolId, onClose, onSaved }) {
  const [f, setF] = useState({})
  const [pegawai, setPegawai] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isEdit = !!editingRow

  useEffect(() => {
    if (!open) return
    setError('')
    setF(editingRow
      ? { kode_unit_kerja: editingRow.kode_unit_kerja || '', kode_ruangan: editingRow.kode_ruangan || '', nama: editingRow.nama || '', lantai: editingRow.lantai || '', pic_employee_id: editingRow.pic_employee_id || '', pic_nama: editingRow.pic_nama || '', keterangan: editingRow.keterangan || '' }
      : { kode_unit_kerja: '', kode_ruangan: '', nama: '', lantai: '', pic_employee_id: '', pic_nama: '', keterangan: '' })
  }, [open, editingRow])

  useEffect(() => {
    if (!open || !schoolId) return
    supabase.from('employees').select('id, nama').eq('school_id', schoolId).eq('status', 'aktif').order('nama').then(({ data }) => setPegawai(data || []))
  }, [open, schoolId])

  const set = (k, v) => setF((prev) => ({ ...prev, [k]: v }))
  const pad2 = (v) => (v === '' ? '' : String(v).replace(/\D/g, '').slice(0, 2))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!f.nama?.trim()) { setError('Isi nama ruangan.'); return }
    setSaving(true)
    const payload = {
      school_id: schoolId,
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
        <Input label="Nama Ruangan" required value={f.nama || ''} onChange={(e) => set('nama', e.target.value)} placeholder="Contoh: Lab Komputer 1" />
        <div className="grid grid-cols-3 gap-3">
          <Input label="Kode Unit Kerja" value={f.kode_unit_kerja || ''} onChange={(e) => set('kode_unit_kerja', pad2(e.target.value))} placeholder="mis. 01" />
          <Input label="Kode Ruangan" value={f.kode_ruangan || ''} onChange={(e) => set('kode_ruangan', pad2(e.target.value))} placeholder="mis. 12" />
          <Input label="Lantai" value={f.lantai || ''} onChange={(e) => set('lantai', e.target.value)} />
        </div>
        <Select label="PIC Ruangan (pegawai)" value={f.pic_employee_id || ''} onChange={(e) => set('pic_employee_id', e.target.value)}>
          <option value="">— Pilih pegawai / isi manual di bawah —</option>
          {pegawai.map((p) => <option key={p.id} value={p.id}>{p.nama}</option>)}
        </Select>
        {!f.pic_employee_id && (
          <Input label="PIC (tulis manual, bila bukan pegawai terdaftar)" value={f.pic_nama || ''} onChange={(e) => set('pic_nama', e.target.value)} />
        )}
        <Textarea label="Keterangan (opsional)" rows={2} value={f.keterangan || ''} onChange={(e) => set('keterangan', e.target.value)} />
        <p className="text-xs text-[var(--color-ink-soft)]">Kode Unit Kerja & Kode Ruangan (2 digit) menjadi bagian Kode Lokasi aset: kepemilikan.lembaga.<b>unit</b>.<b>ruang</b>.tahun.</p>
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
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [editGol, setEditGol] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: g }, { data: k }] = await Promise.all([
      supabase.from('aset_golongan').select('*').order('kode'),
      supabase.from('aset_klasifikasi').select('*').order('kode'),
    ])
    setGolongan(g || [])
    setKlas(k || [])
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

      <GolonganFormModal golongan={editGol} onClose={() => setEditGol(null)} onSaved={() => { setEditGol(null); load() }} />
    </div>
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

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const [{ data: u }, { data: klas }, { data: ruang }] = await Promise.all([
      supabase.from('dka_usulan').select('*, diajukan_nama:dka_usulan_diajukan_nama').eq('school_id', schoolId).eq('tahun', tahun).maybeSingle(),
      supabase.from('aset_klasifikasi').select('*').order('kode'),
      supabase.from('ruangan').select('id, nama').eq('school_id', schoolId).order('nama'),
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
              <Table columns={['Kode Aset', 'Nama & Spesifikasi', 'Alasan', 'Cara', 'Riil', 'Ajuan', 'Harga Satuan', 'Jumlah', 'Validasi', canEditItems ? '' : null].filter((c) => c !== null)}>
                {items.map((r) => {
                  const v = validasiHargaItem(r)
                  return (
                    <Tr key={r.id}>
                      <Td><span className="font-mono text-xs">{r.aset_klasifikasi?.kode || '—'}</span></Td>
                      <Td>
                        <span className="font-medium">{r.nama_aset}</span>
                        {r.spesifikasi && <span className="block text-xs text-[var(--color-ink-soft)]">{r.spesifikasi}</span>}
                        {(r.ruangan?.nama || r.lokasi) && <span className="block text-[11px] text-[var(--color-ink-soft)]">📍 {r.ruangan?.nama || r.lokasi}</span>}
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
                      {canEditItems && (
                        <Td>
                          <div className="flex justify-end gap-1.5">
                            <button onClick={() => { setEditingItem(r); setFormOpen(true) }} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Ubah"><Pencil className="h-4 w-4" /></button>
                            <button onClick={() => deleteItem(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus"><Trash2 className="h-4 w-4" /></button>
                          </div>
                        </Td>
                      )}
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
              <Table columns={['Kode Aset', 'Nama Aset', 'Kondisi', 'Jenis', 'Volume', 'Harga Satuan', 'Jumlah Biaya', canEditItems ? '' : null].filter((c) => c !== null)}>
                {pemel.map((r) => (
                  <Tr key={r.id}>
                    <Td><span className="font-mono text-xs">{r.kode_aset || '—'}</span></Td>
                    <Td>
                      <span className="font-medium">{r.nama_aset}</span>
                      {(r.lokasi || r.nama_kegiatan) && <span className="block text-[11px] text-[var(--color-ink-soft)]">{r.lokasi ? `📍 ${r.lokasi}` : ''}{r.lokasi && r.nama_kegiatan ? ' · ' : ''}{r.nama_kegiatan || ''}</span>}
                    </Td>
                    <Td><Badge color={KONDISI_BADGE[r.kondisi]}>{KONDISI_LABEL[r.kondisi]}</Badge></Td>
                    <Td className="text-xs">{r.jenis_pemeliharaan || '—'}</Td>
                    <Td>{Number(r.volume)} <span className="text-[11px] text-[var(--color-ink-soft)]">{r.satuan}</span></Td>
                    <Td>{formatRupiah(r.harga_satuan)}</Td>
                    <Td className="font-medium">{formatRupiah(r.jumlah_biaya)}</Td>
                    {canEditItems && (
                      <Td>
                        <div className="flex justify-end gap-1.5">
                          <button onClick={() => { setEditingPemel(r); setPemelOpen(true) }} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Ubah"><Pencil className="h-4 w-4" /></button>
                          <button onClick={() => deletePemel(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus"><Trash2 className="h-4 w-4" /></button>
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
    </div>
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
  const [saving, setSaving] = useState(false)
  const [ambil, setAmbil] = useState(false)
  const [error, setError] = useState('')
  const isEdit = !!editingItem

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
      })
    } else {
      setF({
        klasifikasi_id: '', nama_aset: '', spesifikasi: '', unit_kerja: '', nama_kegiatan: '', ruangan_id: '', lokasi: '', penanggung_jawab: '',
        alasan_kebutuhan: '', cara_pengadaan: '', sumber_anggaran: '', jumlah_maksimal: '1', jumlah_tersedia: '0', jumlah_pengajuan: '1', satuan: 'unit',
        harga_satuan: '0', standar_harga: '', justifikasi: '',
      })
    }
  }, [open, editingItem])

  const set = (k, v) => setF((prev) => ({ ...prev, [k]: v }))

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
        <KlasifikasiPicker klasifikasiList={klasifikasiList} value={f.klasifikasi_id} onChange={onPickKlasifikasi} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Nama Aset" required value={f.nama_aset || ''} onChange={(e) => set('nama_aset', e.target.value)} placeholder="mis. Laptop" />
          <Input label="Merk & Spesifikasi" value={f.spesifikasi || ''} onChange={(e) => set('spesifikasi', e.target.value)} placeholder="mis. Core i5, 8GB" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Nama Proker/Kegiatan" value={f.nama_kegiatan || ''} onChange={(e) => set('nama_kegiatan', e.target.value)} />
          <Input label="Unit Kerja" value={f.unit_kerja || ''} onChange={(e) => set('unit_kerja', e.target.value)} placeholder="Kurikulum / Tata Usaha…" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Ruangan / Lokasi" value={f.ruangan_id || ''} onChange={(e) => set('ruangan_id', e.target.value)}>
            <option value="">— Isi manual di bawah —</option>
            {ruanganList.map((r) => <option key={r.id} value={r.id}>{r.nama}</option>)}
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

  const load = useCallback(async () => {
    setLoading(true)
    const { data: u } = await supabase.from('dka_usulan').select('*').eq('school_id', schoolId).eq('tahun', tahun).eq('status', 'disahkan').maybeSingle()
    setUsulan(u || null)
    if (u) {
      const { data: it } = await supabase.from('dka_usulan_item').select('*, aset_klasifikasi(kode, uraian), ruangan(nama)').eq('usulan_id', u.id).order('urutan')
      const itemIds = (it || []).map((x) => x.id)
      let prosesMap = {}
      if (itemIds.length) {
        const { data: pr } = await supabase.from('dka_pengadaan_proses').select('*').in('usulan_item_id', itemIds)
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

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard label="Total Item" value={items.length} />
        <StatCard label="Menunggu" value={byStatus('menunggu')} />
        <StatCard label="Dipesan" value={byStatus('dipesan')} accent="gold" />
        <StatCard label="Lolos Periksa" value={byStatus('pemeriksaan')} />
        <StatCard label="Diterima" value={byStatus('diterima')} accent="gold" />
      </div>

      <SectionCard title="Daftar Hasil Pengadaan" description="Berdasarkan DKA disahkan. Ikuti tahap: Catat Pemesanan (SPK) → BA Pemeriksaan → BA Serah Terima (otomatis masuk Inventaris).">
        {items.length === 0 ? (
          <EmptyState icon={ClipboardList} title="Tidak ada item pengadaan" description="DKA unit ini tidak memiliki item rencana pengadaan." />
        ) : (
          <div className="overflow-x-auto">
            <Table columns={['Nama & Spesifikasi', 'Jumlah', 'Cara Rencana', 'Status', canAct ? 'Aksi' : null].filter(Boolean)}>
              {items.map((r) => {
                const st = r.proses?.status || 'menunggu'
                return (
                  <Tr key={r.id}>
                    <Td>
                      <span className="font-medium">{r.nama_aset}</span>
                      {r.spesifikasi && <span className="block text-xs text-[var(--color-ink-soft)]">{r.spesifikasi}</span>}
                      {r.proses?.nomor_spk && <span className="block text-[11px] text-[var(--color-ink-soft)]">SPK {r.proses.nomor_spk}</span>}
                    </Td>
                    <Td>{Number(r.jumlah_pengajuan)} <span className="text-[11px] text-[var(--color-ink-soft)]">{r.satuan}</span></Td>
                    <Td className="text-xs">{r.cara_pengadaan || '—'}</Td>
                    <Td>
                      <Badge color={PENGADAAN_STATUS_BADGE[st]}>{PENGADAAN_STATUS_LABEL[st]}</Badge>
                      {r.proses?.aset_id && <span className="block text-[11px] text-[var(--color-success)]">✓ masuk Inventaris</span>}
                    </Td>
                    {canAct && (
                      <Td className="text-right">
                        {(st === 'menunggu' || st === 'ditolak') && (
                          <Button size="sm" variant="outline" onClick={() => { setActiveItem(r); setPesanOpen(true) }}><Truck className="h-3.5 w-3.5" /> {st === 'ditolak' ? 'Pesan Ulang' : 'Catat Pemesanan'}</Button>
                        )}
                        {st === 'dipesan' && (
                          <Button size="sm" variant="outline" onClick={() => { setActiveItem(r); setPeriksaOpen(true) }}><ClipboardCheck className="h-3.5 w-3.5" /> BA Pemeriksaan</Button>
                        )}
                        {st === 'pemeriksaan' && (
                          <Button size="sm" onClick={() => { setActiveItem(r); setBastOpen(true) }}><PackageCheck className="h-3.5 w-3.5" /> BA Serah Terima</Button>
                        )}
                        {st === 'diterima' && <span className="text-xs text-[var(--color-ink-soft)]">Selesai</span>}
                      </Td>
                    )}
                  </Tr>
                )
              })}
            </Table>
          </div>
        )}
      </SectionCard>

      <PengadaanPesanModal open={pesanOpen} item={activeItem} onClose={() => { setPesanOpen(false); setActiveItem(null) }} onSaved={() => { setPesanOpen(false); setActiveItem(null); load() }} />
      <PengadaanPeriksaModal open={periksaOpen} item={activeItem} onClose={() => { setPeriksaOpen(false); setActiveItem(null) }} onSaved={() => { setPeriksaOpen(false); setActiveItem(null); load() }} />
      <PengadaanBastModal open={bastOpen} item={activeItem} onClose={() => { setBastOpen(false); setActiveItem(null) }} onSaved={() => { setBastOpen(false); setActiveItem(null); load() }} />
    </div>
  )
}

function PengadaanPesanModal({ open, item, onClose, onSaved }) {
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
    const payload = {
      status: 'dipesan',
      metode_realisasi: f.metode_realisasi,
      penyedia: f.penyedia?.trim() || null,
      nomor_spk: f.nomor_spk?.trim() || null,
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
          <Input label="Nomor SPK / Pesanan" value={f.nomor_spk || ''} onChange={(e) => set('nomor_spk', e.target.value)} placeholder="Wajib bila Rp50–200 juta" />
          <Input label="Tanggal SPK" type="date" value={f.tanggal_spk || ''} onChange={(e) => set('tanggal_spk', e.target.value)} />
        </div>
        <Input label="Nomor Nota/Kuitansi/Invoice" value={f.nomor_bukti || ''} onChange={(e) => set('nomor_bukti', e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Jumlah Realisasi" type="number" value={f.jumlah_realisasi ?? ''} onChange={(e) => set('jumlah_realisasi', e.target.value)} />
          <Input label="Harga Satuan Realisasi (Rp)" type="number" value={f.harga_realisasi ?? ''} onChange={(e) => set('harga_realisasi', e.target.value)} />
        </div>
        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button>
        </div>
      </form>
    </Modal>
  )
}

function PengadaanPeriksaModal({ open, item, onClose, onSaved }) {
  const [f, setF] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !item) return
    setError('')
    setF({ ba_pemeriksaan_tanggal: new Date().toISOString().slice(0, 10), ba_pemeriksaan_hasil: 'sesuai', ba_pemeriksaan_catatan: '' })
  }, [open, item])

  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (f.ba_pemeriksaan_hasil === 'tidak_sesuai' && !f.ba_pemeriksaan_catatan?.trim()) { setError('Isi catatan ketidaksesuaian agar penyedia bisa menindaklanjuti.'); return }
    setSaving(true)
    const payload = {
      status: f.ba_pemeriksaan_hasil === 'sesuai' ? 'pemeriksaan' : 'ditolak',
      ba_pemeriksaan_tanggal: f.ba_pemeriksaan_tanggal || null,
      ba_pemeriksaan_hasil: f.ba_pemeriksaan_hasil,
      ba_pemeriksaan_catatan: f.ba_pemeriksaan_catatan?.trim() || null,
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
        <Input label="Tanggal Pemeriksaan" type="date" value={f.ba_pemeriksaan_tanggal || ''} onChange={(e) => set('ba_pemeriksaan_tanggal', e.target.value)} />
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

function PengadaanBastModal({ open, item, onClose, onSaved }) {
  const [f, setF] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !item) return
    setError('')
    setF({ ba_serah_terima_tanggal: new Date().toISOString().slice(0, 10), ba_serah_terima_catatan: '' })
  }, [open, item])

  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    const payload = {
      status: 'diterima',
      ba_serah_terima_tanggal: f.ba_serah_terima_tanggal || null,
      ba_serah_terima_catatan: f.ba_serah_terima_catatan?.trim() || null,
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
        <p className="rounded-md bg-[var(--color-navy-50)] px-3 py-2 text-xs text-[var(--color-ink)]">Menyimpan BAST akan langsung menambahkan aset ini ke Inventaris (kode aset & lokasi dibuat otomatis).</p>
        <Input label="Tanggal Serah Terima" type="date" value={f.ba_serah_terima_tanggal || ''} onChange={(e) => set('ba_serah_terima_tanggal', e.target.value)} />
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
function DokumenRow({ doc, schoolId }) {
  const [recs, setRecs] = useState(null)
  const [sel, setSel] = useState('')
  const [loading, setLoading] = useState(false)

  if (!doc.pick) {
    return (
      <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] py-2 last:border-0">
        <span className="text-sm text-[var(--color-ink)]">{doc.label}</span>
        <Button size="sm" variant="outline" onClick={() => openCetak(doc.jenis)}><Printer className="h-3.5 w-3.5" /> Cetak</Button>
      </div>
    )
  }
  const loadRecs = async () => { setLoading(true); const r = await listRecords(doc.pick, schoolId); setRecs(r); setLoading(false) }
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] py-2 last:border-0">
      <span className="text-sm text-[var(--color-ink)]">{doc.label}</span>
      <div className="flex items-center gap-2">
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
            <Button size="sm" disabled={!sel} onClick={() => openCetak(doc.jenis, sel)}><Printer className="h-3.5 w-3.5" /> Cetak</Button>
          </>
        )}
      </div>
    </div>
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
        right={canManage && schoolId && <Button onClick={() => { setEditing(null); setFormOpen(true) }}><Plus className="h-4 w-4" /> Tetapkan Penggunaan</Button>} />
      {!schoolId ? (
        <p className="text-sm text-[var(--color-ink-soft)]">Pilih unit lebih dulu.</p>
      ) : loading ? <FullPageSpinner /> : (
        <SectionCard title="Status Penggunaan Aset" description="Penetapan pemakaian aset ke pegawai/unit (Berita Acara Status Penggunaan).">
          {rows.length === 0 ? (
            <EmptyState icon={UserCheck} title="Belum ada penetapan" description="Tetapkan status penggunaan aset kepada pegawai/unit." />
          ) : (
            <div className="overflow-x-auto">
              <Table columns={['Aset', 'Pengguna', 'Unit Kerja', 'Tgl Penetapan', 'No. BA', 'Status', canManage ? '' : null].filter((c) => c !== null)}>
                {rows.map((r) => (
                  <Tr key={r.id}>
                    <Td><span className="font-medium">{r.aset?.nama}</span><span className="block font-mono text-[11px] text-[var(--color-ink-soft)]">{r.aset?.kode_aset || '—'}</span></Td>
                    <Td>{r.employees?.nama || r.pengguna_nama || '—'}</Td>
                    <Td className="text-xs">{r.unit_kerja || '—'}</Td>
                    <Td className="text-xs">{r.tanggal_penetapan ? new Date(r.tanggal_penetapan).toLocaleDateString('id-ID') : '—'}</Td>
                    <Td className="text-xs">{r.nomor_ba || '—'}</Td>
                    <Td><Badge color={PENGGUNAAN_STATUS_BADGE[r.status]}>{PENGGUNAAN_STATUS_LABEL[r.status]}</Badge></Td>
                    {canManage && (
                      <Td>
                        <div className="flex justify-end gap-1.5">
                          {r.status === 'aktif' && <button onClick={() => handleReturn(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Kembalikan"><RotateCcw className="h-4 w-4" /></button>}
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
    const payload = {
      aset_id: f.aset_id,
      pengguna_employee_id: f.pengguna_employee_id || null,
      pengguna_nama: f.pengguna_nama?.trim() || null,
      unit_kerja: f.unit_kerja?.trim() || null,
      tanggal_penetapan: f.tanggal_penetapan || null,
      nomor_ba: f.nomor_ba?.trim() || null,
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
        <Input label="Nomor Berita Acara" value={f.nomor_ba || ''} onChange={(e) => set('nomor_ba', e.target.value)} />
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
        <p className="text-sm text-[var(--color-ink-soft)]">Pilih unit lebih dulu.</p>
      ) : loading ? <FullPageSpinner /> : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCard label="Catatan Pemeliharaan" value={rows.length} />
            <StatCard label="Total Biaya" value={formatRupiah(totalBiaya)} accent="gold" />
          </div>
          <SectionCard title="Logbook Pemeliharaan & Perbaikan" description="Kondisi 'sesudah' otomatis memperbarui kondisi aset di Inventaris.">
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
    const no = prompt('Nomor SPPA (Surat Perintah Penyaluran Aset):', row.nomor_sppa || '')
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

  return (
    <div className="flex flex-col gap-5">
      <UnitBar hasFullAccess={hasFullAccess} schools={schools} schoolId={schoolId} setSchoolId={setSchoolId}
        right={canManage && schoolId && <Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" /> Permintaan Aset (SPA)</Button>} />
      {!schoolId ? (
        <p className="text-sm text-[var(--color-ink-soft)]">Pilih unit lebih dulu.</p>
      ) : loading ? <FullPageSpinner /> : (
        <SectionCard title="Penerimaan & Penyaluran Aset" description="Permintaan (SPA) → penyaluran (SPPA). Saat disalurkan, lokasi aset otomatis dipindah ke ruangan tujuan.">
          {rows.length === 0 ? (
            <EmptyState icon={Send} title="Belum ada permintaan" description="Buat Surat Permintaan Aset (SPA) untuk menyalurkan aset ke ruangan/unit." />
          ) : (
            <div className="overflow-x-auto">
              <Table columns={['Aset', 'Tujuan', 'Penerima', 'SPA', 'SPPA', 'Status', canManage ? 'Aksi' : null].filter((c) => c !== null)}>
                {rows.map((r) => (
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
                          {r.status === 'diminta' && <><Button size="sm" variant="outline" onClick={() => handleSalurkan(r)}><Truck className="h-3.5 w-3.5" /> Salurkan</Button><button onClick={() => handleTolak(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Tolak"><RotateCcw className="h-4 w-4" /></button></>}
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
    const payload = {
      aset_id: f.aset_id,
      ruangan_tujuan_id: f.ruangan_tujuan_id || null,
      tujuan_lokasi: f.ruangan_tujuan_id ? null : (f.tujuan_lokasi?.trim() || null),
      penerima: f.penerima?.trim() || null,
      jumlah: Number(f.jumlah) || 1,
      tanggal_permintaan: f.tanggal_permintaan || null,
      nomor_spa: f.nomor_spa?.trim() || null,
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
          <Input label="Nomor SPA" value={f.nomor_spa || ''} onChange={(e) => set('nomor_spa', e.target.value)} />
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
        <p className="text-sm text-[var(--color-ink-soft)]">Pilih unit lebih dulu.</p>
      ) : loading ? <FullPageSpinner /> : (
        <SectionCard title="Sesi Inventarisasi (Opname)" description="Sensus aset vs Buku Inventaris. Kondisi aktual otomatis memperbarui kondisi aset.">
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
  const selesaikan = async () => {
    if (!confirm('Selesaikan sesi opname ini?')) return
    setBusy(true)
    const { error } = await supabase.from('aset_opname').update({ status: 'selesai', tanggal_selesai: new Date().toISOString().slice(0, 10) }).eq('id', opnameId)
    setBusy(false)
    if (error) { alert('Gagal: ' + error.message); return }
    load()
  }

  if (loading) return <FullPageSpinner />
  if (!sesi) return <EmptyState title="Sesi tidak ditemukan" />

  const dicek = items.filter((i) => i.ditemukan !== null).length
  const hilang = items.filter((i) => i.ditemukan === false).length
  const editable = canManage && sesi.status === 'berjalan'

  return (
    <div className="flex flex-col gap-4">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]"><RotateCcw className="h-4 w-4" /> Kembali ke daftar sesi</button>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2"><h3 className="text-base font-semibold text-[var(--color-ink)]">{sesi.judul || 'Opname'} — {sesi.tahun}</h3><Badge color={OPNAME_STATUS_BADGE[sesi.status]}>{OPNAME_STATUS_LABEL[sesi.status]}</Badge></div>
            <p className="mt-1 text-xs text-[var(--color-ink-soft)]">{items.length} aset · {dicek} dicek · {hilang} tidak ditemukan</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => openCetak('lhi', opnameId)}><Printer className="h-4 w-4" /> Cetak LHI</Button>
            {editable && <Button variant="outline" onClick={generate} disabled={busy}><Download className="h-4 w-4" /> {items.length ? 'Tarik Ulang' : 'Tarik dari Inventaris'}</Button>}
            {editable && <Button onClick={selesaikan} disabled={busy}><CheckCircle2 className="h-4 w-4" /> Selesaikan</Button>}
          </div>
        </div>
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
        <p className="text-sm text-[var(--color-ink-soft)]">Pilih unit lebih dulu.</p>
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
    const sk = prompt('Nomor SK Penghapusan (opsional):', u.nomor_sk || '')
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
  const [loading, setLoading] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from(def.table).select('*').eq('tahun', tahun).order('kode_ref')
    setRows(data || [])
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
                  <Td key={c.key} className={c.mono ? 'font-mono text-xs' : (c.small ? 'text-xs text-[var(--color-ink-soft)]' : '')}>{r[c.key] || '—'}</Td>
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
      {canEdit && <StandarRefModal open={formOpen} tahun={tahun} editing={editing} def={def} onClose={() => { setFormOpen(false); setEditing(null) }} onSaved={() => { setFormOpen(false); setEditing(null); load() }} />}
    </SectionCard>
  )
}

function StandarRefModal({ open, tahun, editing, def, onClose, onSaved }) {
  const [f, setF] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isEdit = !!editing

  useEffect(() => {
    if (!open) return
    setError('')
    const init = {}
    for (const fld of def.fields) init[fld.key] = editing ? (editing[fld.key] ?? '') : (fld.default ?? '')
    setF(init)
  }, [open, editing, def.fields])

  const set = (k, v) => setF((prev) => ({ ...prev, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!f.nama_aset?.trim()) { setError('Isi nama aset.'); return }
    setSaving(true); setError('')
    const payload = { tahun }
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
        {def.fields.map((fld) => (
          fld.multiline
            ? <Textarea key={fld.key} label={fld.label} rows={2} value={f[fld.key] || ''} onChange={(e) => set(fld.key, e.target.value)} />
            : <Input key={fld.key} label={fld.label} type={fld.type === 'number' ? 'number' : 'text'} required={fld.key === 'nama_aset'} value={f[fld.key] ?? ''} onChange={(e) => set(fld.key, e.target.value)} placeholder={fld.placeholder || ''} />
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
