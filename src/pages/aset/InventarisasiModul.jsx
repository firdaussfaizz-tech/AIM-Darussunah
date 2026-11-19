import { useEffect, useState, useCallback, useMemo } from 'react'
import { LayoutDashboard, ClipboardList, Search, Tag, Boxes, Plus, Pencil, Trash2, CheckCircle2, Download, Printer, ListChecks, DoorOpen, Settings } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { SectionCard, Card, Button, Badge, Table, Tr, Td, Modal, Input, Select, EmptyState, FullPageSpinner, StatCard } from '../../components/ui'
import { formatRupiah } from '../../lib/format'
import { KONDISI_LABEL } from '../../lib/aset'
import { barcode39, exportExcelWorkbook } from '../../lib/inventarisasiExport'
import { useUnitFilter, UnitBar, AsetFormModal, InventarisasiTab, openCetak } from './AsetList'

const KONDISI_CHIP = { baik: 'success', rusak_ringan: 'gold', rusak_berat: 'danger' }
const SUBNAV = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'pendataan', label: 'Pendataan', icon: ClipboardList },
  { id: 'identifikasi', label: 'Identifikasi', icon: Search },
  { id: 'kiakir', label: 'KIA / KIR', icon: DoorOpen },
  { id: 'label', label: 'Cetak Label', icon: Tag },
  { id: 'golongan', label: 'Master Golongan', icon: Boxes },
  { id: 'periode', label: 'Periode & Alur', icon: ListChecks },
  { id: 'pengaturan', label: 'Pengaturan', icon: Settings },
]

export default function InventarisasiModul({ hasFullAccess, mySchools }) {
  const { schools, schoolId, setSchoolId } = useUnitFilter(hasFullAccess, mySchools)
  const managesUnit = useMemo(() => !!mySchools.find((s) => s.id === schoolId)?.kelola, [mySchools, schoolId])
  const canManage = hasFullAccess || managesUnit
  const [sub, setSub] = useState('dashboard')
  const [aset, setAset] = useState([])
  const [ruangan, setRuangan] = useState([])
  const [klasifikasi, setKlasifikasi] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: kl } = await supabase.from('aset_klasifikasi').select('id, kode, uraian').order('kode')
    setKlasifikasi(kl || [])
    if (!schoolId) { setAset([]); setRuangan([]); setLoading(false); return }
    const [{ data: a }, { data: rg }] = await Promise.all([
      supabase.from('aset').select('*, aset_klasifikasi(kode, uraian), ruangan(nama, kode_ruangan)').eq('school_id', schoolId).eq('status', 'aktif').order('kode_aset', { nullsFirst: false }),
      supabase.from('ruangan').select('id, nama').eq('school_id', schoolId).order('nama'),
    ])
    setAset(a || [])
    setRuangan(rg || [])
    setLoading(false)
  }, [schoolId])
  useEffect(() => { load() }, [load])

  return (
    <div className="flex flex-col gap-5">
      <UnitBar hasFullAccess={hasFullAccess} schools={schools} schoolId={schoolId} setSchoolId={setSchoolId} />
      <Card className="bg-[var(--color-navy-50)]">
        <p className="text-[13px] text-[var(--color-ink)]"><b>SIMAS Inventarisasi (BAB VII).</b> Satu modul terintegrasi: ringkasan aset (Dashboard), pencatatan & kondisi (Pendataan), verifikasi & kodefikasi (Identifikasi), cetak label barcode, master golongan, dan alur berperiode (Opname) yang otomatis terhubung ke Penghapusan, Pemeliharaan, KIA/KIR, dan Buku Kas.</p>
      </Card>
      {/* Sub-navigation */}
      <div className="flex flex-wrap gap-2">
        {SUBNAV.map((s) => {
          const on = sub === s.id; const Icon = s.icon
          return (
            <button key={s.id} onClick={() => setSub(s.id)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition ${on ? 'border-[var(--color-navy)] bg-[var(--color-navy)] text-white' : 'border-[var(--color-border)] bg-white text-[var(--color-ink)] hover:border-[var(--color-navy)]'}`}>
              <Icon className="h-3.5 w-3.5" /> {s.label}
            </button>
          )
        })}
      </div>

      {sub === 'golongan' ? (
        <MasterGolongan klasifikasi={klasifikasi} canManage={hasFullAccess} onChanged={load} />
      ) : sub === 'periode' ? (
        <InventarisasiTab hasFullAccess={hasFullAccess} mySchools={mySchools} />
      ) : sub === 'pengaturan' ? (
        <InvPengaturan />
      ) : !schoolId ? (
        <p className="text-sm text-[var(--color-ink-soft)]">Pilih unit lebih dulu.</p>
      ) : loading ? <FullPageSpinner /> : (
        <>
          {sub === 'dashboard' && <InvDashboard aset={aset} ruangan={ruangan} />}
          {sub === 'pendataan' && <InvPendataan aset={aset} ruangan={ruangan} klasifikasi={klasifikasi} schools={schools} schoolId={schoolId} canManage={canManage} onChanged={load} />}
          {sub === 'identifikasi' && <InvIdentifikasi aset={aset} canManage={canManage} onChanged={load} />}
          {sub === 'kiakir' && <InvKiaKir aset={aset} ruangan={ruangan} />}
          {sub === 'label' && <InvLabel aset={aset} ruangan={ruangan} schoolName={schools.find((s) => s.id === schoolId)?.nama} />}
        </>
      )}
    </div>
  )
}

/* ---------------- Dashboard ---------------- */
function InvDashboard({ aset, ruangan }) {
  const s = useMemo(() => {
    const total = aset.length
    const unit = aset.reduce((a, x) => a + (Number(x.jumlah) || 1), 0)
    const nilai = aset.reduce((a, x) => a + (Number(x.nilai_perolehan) || 0), 0)
    const baik = aset.filter((x) => x.kondisi === 'baik').length
    const rr = aset.filter((x) => x.kondisi === 'rusak_ringan').length
    const rb = aset.filter((x) => x.kondisi === 'rusak_berat').length
    const verified = aset.filter((x) => x.verified).length
    return { total, unit, nilai, baik, rr, rb, verified }
  }, [aset])
  const perRuangan = useMemo(() => {
    const m = new Map()
    for (const x of aset) { const n = x.ruangan?.nama || '(tanpa ruangan)'; m.set(n, (m.get(n) || 0) + 1) }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  }, [aset])
  const perGol = useMemo(() => {
    const m = new Map()
    for (const x of aset) { const k = x.aset_klasifikasi?.uraian || 'Lainnya'; m.set(k, (m.get(k) || 0) + 1) }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
  }, [aset])
  const recent = useMemo(() => [...aset].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))).slice(0, 6), [aset])
  const maxR = Math.max(1, ...perRuangan.map((x) => x[1]))
  const maxG = Math.max(1, ...perGol.map((x) => x[1]))
  const bar = (v, max, color) => (
    <span className="inline-block h-3 rounded-full" style={{ width: `${Math.round((v / max) * 100)}%`, background: color, minWidth: 6 }} />
  )
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Item Aset" value={s.total} />
        <StatCard label="Nilai Perolehan" value={formatRupiah(s.nilai)} accent="gold" />
        <StatCard label="Terverifikasi" value={`${s.verified}/${s.total}`} />
        <StatCard label="Perlu Tindak Lanjut" value={s.rb} accent={s.rb ? 'gold' : undefined} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <SectionCard title="Kondisi Aset">
          <div className="flex flex-col gap-2">
            {[['Baik', s.baik, '#17814c'], ['Rusak Ringan', s.rr, '#c9a227'], ['Rusak Berat', s.rb, '#c0392b']].map(([l, v, col]) => (
              <div key={l} className="flex items-center gap-3 text-sm">
                <span className="w-28 flex-shrink-0 text-[var(--color-ink)]"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: col }} />{l}</span>
                <span className="flex-1">{bar(v, Math.max(1, s.total), col)}</span>
                <b className="w-10 text-right">{v}</b>
              </div>
            ))}
          </div>
        </SectionCard>
        <SectionCard title={`Aset per Ruangan (${ruangan.length} ruangan)`}>
          {perRuangan.length === 0 ? <p className="text-sm text-[var(--color-ink-soft)]">Belum ada data.</p> : (
            <div className="flex flex-col gap-2">
              {perRuangan.map(([n, v]) => (
                <div key={n} className="flex items-center gap-3 text-xs">
                  <span className="w-32 flex-shrink-0 truncate text-[var(--color-ink)]">{n}</span>
                  <span className="flex-1">{bar(v, maxR, 'var(--color-navy)')}</span>
                  <b className="w-14 text-right">{v} item</b>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <SectionCard title="Golongan Terbanyak">
          {perGol.length === 0 ? <p className="text-sm text-[var(--color-ink-soft)]">Belum ada data.</p> : (
            <div className="flex flex-col gap-2">
              {perGol.map(([n, v]) => (
                <div key={n} className="flex items-center gap-3 text-xs">
                  <span className="w-40 flex-shrink-0 truncate text-[var(--color-ink)]">{n}</span>
                  <span className="flex-1">{bar(v, maxG, 'var(--color-gold)')}</span>
                  <b className="w-14 text-right">{v} item</b>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
        <SectionCard title="Entri Terbaru">
          {recent.length === 0 ? <p className="text-sm text-[var(--color-ink-soft)]">Belum ada data.</p> : (
            <div className="overflow-x-auto">
              <Table columns={['Kode', 'Nama', 'Kondisi']}>
                {recent.map((a) => (
                  <Tr key={a.id}><Td className="font-mono text-[11px]">{a.kode_aset || '—'}</Td><Td className="font-medium">{a.nama}</Td><Td><Badge color={KONDISI_CHIP[a.kondisi]}>{KONDISI_LABEL[a.kondisi]}</Badge></Td></Tr>
                ))}
              </Table>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  )
}

/* ---------------- Pendataan ---------------- */
function InvPendataan({ aset, ruangan, klasifikasi, schools, schoolId, canManage, onChanged }) {
  const [q, setQ] = useState('')
  const [fRuangan, setFRuangan] = useState('')
  const [fKondisi, setFKondisi] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const filtered = useMemo(() => {
    let A = aset
    if (q) { const s = q.toLowerCase(); A = A.filter((a) => [a.nama, a.kode_aset, a.merk_tipe].some((x) => (x || '').toLowerCase().includes(s))) }
    if (fRuangan) A = A.filter((a) => a.ruangan_id === fRuangan)
    if (fKondisi) A = A.filter((a) => a.kondisi === fKondisi)
    return A
  }, [aset, q, fRuangan, fKondisi])
  const hapus = async (a) => {
    if (!confirm(`Hapus data aset "${a.nama}" dari inventaris?`)) return
    const { error } = await supabase.from('aset').update({ status: 'dihapus' }).eq('id', a.id)
    if (error) { alert('Gagal: ' + error.message); return }
    onChanged()
  }
  const exportExcel = () => {
    const sheetAset = {
      name: 'Daftar Aset',
      columns: ['Kode Aset', 'Kode Lokasi', 'Nama Barang', 'Merk/Jenis', 'Golongan', 'Ruangan', 'Jumlah', 'Satuan', 'Kondisi', 'Tahun', 'Nilai Perolehan', 'Verifikasi', 'Keterangan'],
      rows: filtered.map((a) => [a.kode_aset || '', a.kode_lokasi || '', a.nama || '', a.merk_tipe || '', a.aset_klasifikasi?.uraian || '', a.ruangan?.nama || '', Number(a.jumlah) || 1, a.satuan || '', KONDISI_LABEL[a.kondisi] || '', a.tahun_perolehan || '', Number(a.nilai_perolehan) || 0, a.verified ? 'Ya' : 'Belum', a.keterangan || '']),
    }
    const kond = ['baik', 'rusak_ringan', 'rusak_berat'].map((k) => [KONDISI_LABEL[k], filtered.filter((a) => a.kondisi === k).length, filtered.filter((a) => a.kondisi === k).reduce((s, a) => s + (Number(a.nilai_perolehan) || 0), 0)])
    const gmap = new Map()
    for (const a of filtered) { const key = a.aset_klasifikasi?.kode || '—'; const u = a.aset_klasifikasi?.uraian || 'Lainnya'; const cur = gmap.get(key) || { u, n: 0, v: 0 }; cur.n++; cur.v += Number(a.nilai_perolehan) || 0; gmap.set(key, cur) }
    exportExcelWorkbook(`inventaris_${new Date().toISOString().slice(0, 10)}`, [
      sheetAset,
      { name: 'Rekap Kondisi', columns: ['Kondisi', 'Jumlah', 'Nilai'], rows: kond },
      { name: 'Rekap Golongan', columns: ['Kode', 'Golongan', 'Jumlah', 'Nilai'], rows: [...gmap.entries()].map(([k, v]) => [k, v.u, v.n, v.v]) },
    ])
  }
  return (
    <SectionCard title="Pendataan Aset" description="Daftar aset unit (Buku Inventaris). Tambah, ubah, hapus, dan ekspor ke Excel.">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {canManage && <Button onClick={() => { setEditing(null); setFormOpen(true) }}><Plus className="h-4 w-4" /> Tambah Barang</Button>}
        <Input placeholder="Cari nama / kode / merk…" value={q} onChange={(e) => setQ(e.target.value)} className="min-w-[200px]" />
        <Select value={fRuangan} onChange={(e) => setFRuangan(e.target.value)}><option value="">Semua Ruangan</option>{ruangan.map((r) => <option key={r.id} value={r.id}>{r.nama}</option>)}</Select>
        <Select value={fKondisi} onChange={(e) => setFKondisi(e.target.value)}><option value="">Semua Kondisi</option>{['baik', 'rusak_ringan', 'rusak_berat'].map((k) => <option key={k} value={k}>{KONDISI_LABEL[k]}</option>)}</Select>
        <div className="flex-1" />
        <Button variant="outline" onClick={exportExcel}><Download className="h-4 w-4" /> Export Excel</Button>
      </div>
      {filtered.length === 0 ? (
        <EmptyState icon={Boxes} title="Belum ada data" description="Tambah barang atau sesuaikan filter." />
      ) : (
        <div className="overflow-x-auto">
          <Table columns={['Kode Aset', 'Nama', 'Merk/Jenis', 'Ruangan', 'Jml', 'Kondisi', 'Nilai', canManage ? '' : null].filter((c) => c !== null)}>
            {filtered.map((a) => (
              <Tr key={a.id}>
                <Td className="font-mono text-[11px]">{a.kode_aset || '—'}{a.verified ? <CheckCircle2 className="ml-1 inline h-3 w-3 text-[var(--color-success,#17814c)]" /> : null}</Td>
                <Td className="font-medium">{a.nama}</Td>
                <Td className="text-xs">{a.merk_tipe || '—'}<span className="block text-[11px] text-[var(--color-ink-soft)]">{a.aset_klasifikasi?.uraian || ''}</span></Td>
                <Td className="text-xs">{a.ruangan?.nama || '—'}</Td>
                <Td className="text-xs">{Number(a.jumlah) || 1} {a.satuan || ''}</Td>
                <Td><Badge color={KONDISI_CHIP[a.kondisi]}>{KONDISI_LABEL[a.kondisi]}</Badge></Td>
                <Td className="text-xs">{formatRupiah(a.nilai_perolehan)}</Td>
                {canManage && (
                  <Td><div className="flex justify-end gap-1.5">
                    <button onClick={() => { setEditing(a); setFormOpen(true) }} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Ubah"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => hapus(a)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus"><Trash2 className="h-4 w-4" /></button>
                  </div></Td>
                )}
              </Tr>
            ))}
          </Table>
          <p className="mt-2 text-xs text-[var(--color-ink-soft)]">Menampilkan {filtered.length} item · Total nilai: <b>{formatRupiah(filtered.reduce((s, a) => s + (Number(a.nilai_perolehan) || 0), 0))}</b></p>
        </div>
      )}
      <AsetFormModal open={formOpen} editingRow={editing} schools={schools} defaultSchoolId={schoolId} klasifikasiList={klasifikasi} onClose={() => { setFormOpen(false); setEditing(null) }} onSaved={() => { setFormOpen(false); setEditing(null); onChanged() }} />
    </SectionCard>
  )
}

/* ---------------- Identifikasi (verifikasi) ---------------- */
function InvIdentifikasi({ aset, canManage, onChanged }) {
  const [hanyaBelum, setHanyaBelum] = useState(true)
  const rows = useMemo(() => hanyaBelum ? aset.filter((a) => !a.verified) : aset, [aset, hanyaBelum])
  const setVerif = async (a, val) => {
    const { error } = await supabase.from('aset').update({ verified: val, verified_at: val ? new Date().toISOString() : null }).eq('id', a.id)
    if (error) { alert('Gagal: ' + error.message); return }
    onChanged()
  }
  const verifSemua = async () => {
    if (!confirm('Tandai semua aset yang tampil sebagai terverifikasi?')) return
    const ids = rows.map((a) => a.id)
    const { error } = await supabase.from('aset').update({ verified: true, verified_at: new Date().toISOString() }).in('id', ids)
    if (error) { alert('Gagal: ' + error.message); return }
    onChanged()
  }
  const total = aset.length; const sudah = aset.filter((a) => a.verified).length
  return (
    <SectionCard title="Identifikasi & Verifikasi" description="Cocokkan data aset dengan fisik lalu tandai terverifikasi. Nilai & kode mengikuti data Inventaris.">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge color={sudah === total && total ? 'success' : 'gold'}>{sudah}/{total} terverifikasi</Badge>
        <label className="flex items-center gap-2 text-sm text-[var(--color-ink)]"><input type="checkbox" checked={hanyaBelum} onChange={(e) => setHanyaBelum(e.target.checked)} /> Tampilkan yang belum saja</label>
        <div className="flex-1" />
        {canManage && rows.length > 0 && <Button variant="outline" onClick={verifSemua}><CheckCircle2 className="h-4 w-4" /> Verifikasi Semua ({rows.length})</Button>}
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={CheckCircle2} title={hanyaBelum ? 'Semua sudah diverifikasi' : 'Belum ada aset'} description={hanyaBelum ? 'Tidak ada aset yang menunggu verifikasi.' : 'Tambah aset di Pendataan.'} />
      ) : (
        <div className="overflow-x-auto">
          <Table columns={['Kode Aset', 'Nama', 'Golongan', 'Kondisi', 'Status', canManage ? '' : null].filter((c) => c !== null)}>
            {rows.map((a) => (
              <Tr key={a.id}>
                <Td className="font-mono text-[11px]">{a.kode_aset || '—'}</Td>
                <Td className="font-medium">{a.nama}</Td>
                <Td className="text-xs">{a.aset_klasifikasi?.uraian || '—'}</Td>
                <Td><Badge color={KONDISI_CHIP[a.kondisi]}>{KONDISI_LABEL[a.kondisi]}</Badge></Td>
                <Td>{a.verified ? <Badge color="success">Terverifikasi</Badge> : <Badge color="gold">Belum</Badge>}</Td>
                {canManage && <Td><div className="flex justify-end">{a.verified ? <button onClick={() => setVerif(a, false)} className="text-xs text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]">Batalkan</button> : <button onClick={() => setVerif(a, true)} className="rounded-md bg-[var(--color-navy)] px-2 py-1 text-[11px] font-medium text-white hover:opacity-90">Verifikasi</button>}</div></Td>}
              </Tr>
            ))}
          </Table>
        </div>
      )}
    </SectionCard>
  )
}

/* ---------------- Cetak Label (barcode) ---------------- */
function InvLabel({ aset, ruangan, schoolName }) {
  const [fRuangan, setFRuangan] = useState('')
  const [jenis, setJenis] = useState('Permanen')
  const rows = useMemo(() => fRuangan ? aset.filter((a) => a.ruangan_id === fRuangan) : aset, [aset, fRuangan])
  const cetak = () => {
    const win = window.open('', '_blank')
    if (!win) { alert('Popup diblokir. Izinkan popup untuk mencetak label.'); return }
    const labels = rows.map((a) => `
      <div class="label">
        <div class="lh"><b>${esc(schoolName || '')}</b><span class="perm">${esc(jenis)}</span></div>
        <div class="nm">${esc(a.nama || '')}</div>
        <div class="meta"><span>${esc(a.aset_klasifikasi?.uraian || '')}</span><span>${esc(KONDISI_LABEL[a.kondisi] || '')}</span></div>
        ${barcode39(a.kode_aset || a.id)}
        <div class="code">${esc(a.kode_aset || '-')}</div>
      </div>`).join('')
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Label Aset</title><style>
      @page{margin:10mm} body{font-family:Arial,sans-serif;margin:0;padding:10px}
      .sheet{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
      .label{border:1.5px solid #111;border-radius:6px;padding:8px 9px;page-break-inside:avoid}
      .lh{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #999;padding-bottom:3px;margin-bottom:4px}
      .lh b{font-size:9px} .lh .perm{font-size:7.5px;border:1px solid #111;border-radius:3px;padding:0 4px}
      .nm{font-size:11px;font-weight:700;line-height:1.15;min-height:26px}
      .meta{font-size:8.5px;color:#333;display:flex;justify-content:space-between;margin:2px 0}
      .code{text-align:center;font-size:9px;letter-spacing:1px;font-weight:700;margin-top:2px}
      </style></head><body><div class="sheet">${labels}</div>
      <scr${''}ipt>window.onload=function(){setTimeout(function(){window.print()},250)}</scr${''}ipt></body></html>`)
    win.document.close()
  }
  return (
    <SectionCard title="Cetak Label Aset (Barcode)" description="Label aset ber-barcode (Code 39) dari kode aset. Pilih ruangan & jenis label, lalu cetak.">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select value={fRuangan} onChange={(e) => setFRuangan(e.target.value)}><option value="">Semua Ruangan</option>{ruangan.map((r) => <option key={r.id} value={r.id}>{r.nama}</option>)}</Select>
        <Select value={jenis} onChange={(e) => setJenis(e.target.value)}><option>Permanen</option><option>Sementara</option></Select>
        <div className="flex-1" />
        <Button onClick={cetak} disabled={rows.length === 0}><Printer className="h-4 w-4" /> Cetak {rows.length} Label</Button>
      </div>
      {rows.length === 0 ? <EmptyState icon={Tag} title="Tidak ada aset" description="Pilih ruangan lain atau tambah aset." /> : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {rows.slice(0, 12).map((a) => (
            <div key={a.id} className="rounded-lg border border-[var(--color-border)] p-2">
              <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-1 text-[9px] font-semibold"><span className="truncate">{schoolName}</span><span className="rounded border border-current px-1">{jenis}</span></div>
              <div className="min-h-[26px] py-1 text-[11px] font-bold leading-tight">{a.nama}</div>
              <div className="barcode" dangerouslySetInnerHTML={{ __html: barcode39(a.kode_aset || a.id, { height: 30 }) }} />
              <div className="text-center text-[9px] font-bold tracking-wider">{a.kode_aset || '—'}</div>
            </div>
          ))}
        </div>
      )}
      {rows.length > 12 && <p className="mt-2 text-xs text-[var(--color-ink-soft)]">Pratinjau 12 dari {rows.length} label. Semua akan tercetak.</p>}
    </SectionCard>
  )
}

/* ---------------- Master Golongan / Kodefikasi ---------------- */
function MasterGolongan({ klasifikasi, canManage, onChanged }) {
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState(null)
  const [open, setOpen] = useState(false)
  const rows = useMemo(() => { const s = q.toLowerCase(); return klasifikasi.filter((k) => !q || (k.kode + ' ' + (k.uraian || '')).toLowerCase().includes(s)) }, [klasifikasi, q])
  const hapus = async (k) => {
    if (!confirm(`Hapus golongan "${k.kode} — ${k.uraian}"? Pastikan tidak dipakai aset.`)) return
    const { error } = await supabase.from('aset_klasifikasi').delete().eq('id', k.id)
    if (error) { alert('Gagal: ' + error.message + '\n(Golongan yang dipakai aset tidak bisa dihapus.)'); return }
    onChanged()
  }
  return (
    <SectionCard title="Master Golongan / Kodefikasi Barang" description="Daftar golongan (kode klasifikasi) penyusun kode aset. Dikelola Yayasan agar seragam se-yayasan.">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {canManage && <Button onClick={() => { setEdit(null); setOpen(true) }}><Plus className="h-4 w-4" /> Tambah Golongan</Button>}
        <Input placeholder="Cari kode / nama golongan…" value={q} onChange={(e) => setQ(e.target.value)} className="min-w-[220px]" />
        <div className="flex-1" />
        <span className="text-xs text-[var(--color-ink-soft)]">{klasifikasi.length} golongan</span>
      </div>
      {rows.length === 0 ? <EmptyState icon={Boxes} title="Belum ada golongan" /> : (
        <div className="overflow-x-auto">
          <Table columns={['Kode', 'Golongan Barang', canManage ? '' : null].filter((c) => c !== null)}>
            {rows.map((k) => (
              <Tr key={k.id}>
                <Td className="font-mono text-xs">{k.kode}</Td>
                <Td>{k.uraian}</Td>
                {canManage && <Td><div className="flex justify-end gap-1.5"><button onClick={() => { setEdit(k); setOpen(true) }} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]"><Pencil className="h-4 w-4" /></button><button onClick={() => hapus(k)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]"><Trash2 className="h-4 w-4" /></button></div></Td>}
              </Tr>
            ))}
          </Table>
        </div>
      )}
      {!canManage && <p className="mt-2 text-xs text-[var(--color-ink-soft)]">Hanya Admin Yayasan yang dapat mengubah master golongan.</p>}
      <GolonganModal open={open} editing={edit} onClose={() => { setOpen(false); setEdit(null) }} onSaved={() => { setOpen(false); setEdit(null); onChanged() }} />
    </SectionCard>
  )
}
function GolonganModal({ open, editing, onClose, onSaved }) {
  const [f, setF] = useState({ kode: '', uraian: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { if (open) { setError(''); setF({ kode: editing?.kode || '', uraian: editing?.uraian || '' }) } }, [open, editing])
  const submit = async (e) => {
    e.preventDefault()
    if (!f.kode.trim() || !f.uraian.trim()) { setError('Kode & nama wajib diisi.'); return }
    setSaving(true)
    const payload = { kode: f.kode.trim(), uraian: f.uraian.trim() }
    const { error: err } = editing ? await supabase.from('aset_klasifikasi').update(payload).eq('id', editing.id) : await supabase.from('aset_klasifikasi').insert(payload)
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }
  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Ubah Golongan' : 'Tambah Golongan'} width="max-w-md">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Input label="Kode Golongan" value={f.kode} onChange={(e) => setF((s) => ({ ...s, kode: e.target.value }))} placeholder="mis. 02.05.02.01" />
        <Input label="Nama Golongan" value={f.uraian} onChange={(e) => setF((s) => ({ ...s, uraian: e.target.value }))} placeholder="mis. Meja/Kursi" />
        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Batal</Button><Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button></div>
      </form>
    </Modal>
  )
}

/* ---------------- KIA / KIR (pakai dokumen yang sudah ada) ---------------- */
function InvKiaKir({ aset, ruangan }) {
  const [tab, setTab] = useState('kir')
  const [q, setQ] = useState('')
  const countRuangan = useMemo(() => {
    const m = new Map()
    for (const a of aset) { if (a.ruangan_id) m.set(a.ruangan_id, (m.get(a.ruangan_id) || 0) + 1) }
    return m
  }, [aset])
  const asetFiltered = useMemo(() => { const s = q.toLowerCase(); return aset.filter((a) => !q || [a.nama, a.kode_aset].some((x) => (x || '').toLowerCase().includes(s))) }, [aset, q])
  return (
    <SectionCard title="KIA / KIR" description="Kartu Inventaris Aset (per aset) & Kartu Inventaris Ruangan (per ruangan). Cetak memakai dokumen resmi yang sudah ada — data & kop otomatis.">
      <div className="mb-3 flex gap-2">
        <button onClick={() => setTab('kir')} className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${tab === 'kir' ? 'border-[var(--color-navy)] bg-[var(--color-navy)] text-white' : 'border-[var(--color-border)] bg-white'}`}><DoorOpen className="mr-1 inline h-3.5 w-3.5" /> KIR — per Ruangan</button>
        <button onClick={() => setTab('kia')} className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${tab === 'kia' ? 'border-[var(--color-navy)] bg-[var(--color-navy)] text-white' : 'border-[var(--color-border)] bg-white'}`}><ClipboardList className="mr-1 inline h-3.5 w-3.5" /> KIA — per Aset</button>
      </div>
      {tab === 'kir' ? (
        ruangan.length === 0 ? <EmptyState icon={DoorOpen} title="Belum ada ruangan" /> : (
          <div className="overflow-x-auto">
            <Table columns={['Ruangan', 'Jumlah Aset', 'Cetak']}>
              {ruangan.map((r) => (
                <Tr key={r.id}>
                  <Td className="font-medium">{r.nama}</Td>
                  <Td>{countRuangan.get(r.id) || 0} aset</Td>
                  <Td><div className="flex justify-end"><Button size="sm" variant="outline" onClick={() => openCetak('kir', r.id)}><Printer className="h-3.5 w-3.5" /> Cetak KIR</Button></div></Td>
                </Tr>
              ))}
            </Table>
          </div>
        )
      ) : (
        <>
          <Input placeholder="Cari nama / kode aset…" value={q} onChange={(e) => setQ(e.target.value)} className="mb-3 min-w-[220px]" />
          {asetFiltered.length === 0 ? <EmptyState icon={ClipboardList} title="Belum ada aset" /> : (
            <div className="overflow-x-auto">
              <Table columns={['Kode Aset', 'Nama', 'Ruangan', 'Cetak']}>
                {asetFiltered.slice(0, 100).map((a) => (
                  <Tr key={a.id}>
                    <Td className="font-mono text-[11px]">{a.kode_aset || '—'}</Td>
                    <Td className="font-medium">{a.nama}</Td>
                    <Td className="text-xs">{a.ruangan?.nama || '—'}</Td>
                    <Td><div className="flex justify-end"><Button size="sm" variant="outline" onClick={() => openCetak('kia', a.id)}><Printer className="h-3.5 w-3.5" /> Cetak KIA</Button></div></Td>
                  </Tr>
                ))}
              </Table>
              {asetFiltered.length > 100 && <p className="mt-2 text-xs text-[var(--color-ink-soft)]">Menampilkan 100 dari {asetFiltered.length}. Gunakan pencarian untuk mempersempit.</p>}
            </div>
          )}
        </>
      )}
    </SectionCard>
  )
}

/* ---------------- Pengaturan: Identitas Yayasan (kop) ---------------- */
function InvPengaturan() {
  const { isAdminYayasan } = useAuth()
  const [f, setF] = useState(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  useEffect(() => {
    supabase.from('yayasan_identitas').select('*').eq('id', 1).maybeSingle()
      .then(({ data }) => setF(data || { id: 1, nama: '', singkat: '', alamat: '', kota: '', logo_url: '' }))
  }, [])
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const simpan = async () => {
    setSaving(true); setMsg('')
    const { error } = await supabase.from('yayasan_identitas').upsert({ id: 1, nama: f.nama, singkat: f.singkat, alamat: f.alamat, kota: f.kota || null, logo_url: f.logo_url || null, updated_at: new Date().toISOString() })
    setSaving(false)
    setMsg(error ? 'Gagal: ' + error.message : 'Identitas tersimpan. Kop dokumen & label akan mengikuti.')
  }
  if (!f) return <FullPageSpinner />
  return (
    <SectionCard title="Pengaturan — Identitas Yayasan" description="Nama, alamat, dan logo yayasan yang tampil sebagai kop di seluruh dokumen Sarpras (KIA/KIR, LHI, Berita Acara, dll) dan label.">
      {!isAdminYayasan && <p className="mb-3 rounded-md bg-[var(--color-gold-soft)] px-3 py-2 text-sm text-[var(--color-gold)]">Hanya Admin Yayasan yang dapat mengubah identitas. Anda dapat melihat nilainya.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Nama Yayasan (kop baris 1)" value={f.nama || ''} onChange={(e) => set('nama', e.target.value)} disabled={!isAdminYayasan} />
        <Input label="Singkatan" value={f.singkat || ''} onChange={(e) => set('singkat', e.target.value)} disabled={!isAdminYayasan} />
        <Input label="Alamat (kop baris bawah)" value={f.alamat || ''} onChange={(e) => set('alamat', e.target.value)} disabled={!isAdminYayasan} />
        <Input label="Kota" value={f.kota || ''} onChange={(e) => set('kota', e.target.value)} disabled={!isAdminYayasan} />
        <Input label="URL Logo (opsional)" value={f.logo_url || ''} onChange={(e) => set('logo_url', e.target.value)} disabled={!isAdminYayasan} placeholder="/logo-yayasan.png" />
      </div>
      <div className="mt-4 rounded-lg border border-[var(--color-border)] p-4 text-center">
        <p className="text-xs text-[var(--color-ink-soft)]">Pratinjau kop:</p>
        <div className="mt-1 text-sm font-bold uppercase tracking-wide">{f.nama || '—'}</div>
        <div className="text-xs text-[var(--color-ink-soft)]">{f.alamat || ''}{f.kota ? ` · ${f.kota}` : ''}</div>
      </div>
      {isAdminYayasan && (
        <div className="mt-3 flex items-center gap-3">
          <Button onClick={simpan} disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan Identitas'}</Button>
          {msg && <span className="text-sm text-[var(--color-ink-soft)]">{msg}</span>}
        </div>
      )}
    </SectionCard>
  )
}

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) }
