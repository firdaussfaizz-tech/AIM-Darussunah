import { useEffect, useState, useCallback, useMemo } from 'react'
import { Boxes, Plus, Pencil, Trash2, DoorOpen, ShieldAlert, Search, ClipboardList, Send, CheckCircle2, RotateCcw, Download, Tag, BookOpen, Clock3, ShieldCheck } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, SectionCard, Card, Button, Badge, Table, Tr, Td, Modal, Input, Select, Textarea, EmptyState, FullPageSpinner, StatCard } from '../../components/ui'
import { formatRupiah } from '../../lib/format'
import { KONDISI_OPTIONS, KONDISI_LABEL, KONDISI_BADGE, hitungPenyusutan, umurLabel } from '../../lib/aset'
import {
  DKA_STATUS_LABEL, DKA_STATUS_BADGE, ALASAN_KEBUTUHAN_OPTIONS, CARA_PENGADAAN_OPTIONS,
  SUMBER_ANGGARAN_OPTIONS, JENIS_PEMELIHARAAN_OPTIONS, validasiHargaItem,
} from '../../lib/dka'
import { useParams, Navigate } from 'react-router-dom'
import { SOP_SARPRAS, PIC_SARPRAS } from '../../lib/sopSarpras'
import { SARPRAS_AREAS, SARPRAS_DEFAULT } from '../../lib/sarpras'

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

      {active.kind === 'live-dka' && <DkaTab hasFullAccess={hasFullAccess} mySchools={mySchools} />}
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
