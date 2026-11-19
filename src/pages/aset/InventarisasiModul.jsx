import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { LayoutDashboard, ClipboardList, Search, Tag, Boxes, Plus, Pencil, Trash2, CheckCircle2, Download, Printer, ListChecks, DoorOpen, Settings, ClipboardCheck, ScanLine, Camera, X, ShieldCheck } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { SectionCard, Card, Button, Badge, Table, Tr, Td, Modal, Input, Select, EmptyState, FullPageSpinner, StatCard } from '../../components/ui'
import { formatRupiah } from '../../lib/format'
import { KONDISI_LABEL } from '../../lib/aset'
import { barcode39, qrSvg, exportExcelWorkbook } from '../../lib/inventarisasiExport'
import { useUnitFilter, UnitBar, AsetFormModal, DokumenAreaCard, openCetak } from './AsetList'

const KONDISI_CHIP = { baik: 'success', rusak_ringan: 'gold', rusak_berat: 'danger' }
export const VERIF_LABEL = { belum: 'Belum diverifikasi', diajukan: 'Diajukan', diverifikasi: 'Diverifikasi Sekolah', disahkan: 'Disahkan Yayasan', ditolak: 'Ditolak' }
const VERIF_BADGE = { belum: 'neutral', diajukan: 'gold', diverifikasi: 'navy', disahkan: 'success', ditolak: 'danger' }
const SUBNAV = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'persiapan', label: 'Persiapan', icon: ListChecks },
  { id: 'pendataan', label: 'Pendataan', icon: ClipboardList },
  { id: 'identifikasi', label: 'Identifikasi', icon: Search },
  { id: 'scan', label: 'Scan Aset', icon: ScanLine },
  { id: 'kiakir', label: 'KIA / KIR', icon: DoorOpen },
  { id: 'label', label: 'Cetak Label', icon: Tag },
  { id: 'golongan', label: 'Master Golongan', icon: Boxes },
  { id: 'instrumen', label: 'Instrumen Verifikasi', icon: ClipboardCheck },
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
  const [instrumen, setInstrumen] = useState([])
  const [persiapan, setPersiapan] = useState(null)
  const [tim, setTim] = useState([])
  const [pegawai, setPegawai] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: kl }, { data: ins }] = await Promise.all([
      supabase.from('aset_klasifikasi').select('id, kode, uraian').order('kode'),
      supabase.from('aset_instrumen_item').select('*').order('urutan'),
    ])
    setKlasifikasi(kl || [])
    setInstrumen(ins || [])
    if (!schoolId) { setAset([]); setRuangan([]); setPersiapan(null); setTim([]); setPegawai([]); setLoading(false); return }
    const [{ data: a }, { data: rg }, { data: p }, { data: tm }, { data: pg }] = await Promise.all([
      supabase.from('aset').select('*, aset_klasifikasi(kode, uraian), ruangan(nama, kode_ruangan)').eq('school_id', schoolId).eq('status', 'aktif').order('kode_aset', { nullsFirst: false }),
      supabase.from('ruangan').select('id, nama, jenis, pic_nama, pic_employee_id, employees:pic_employee_id(nama), rombel:rombel_id(wali_kelas_employee_id, wali:wali_kelas_employee_id(nama))').eq('school_id', schoolId).order('nama'),
      supabase.from('inventarisasi_persiapan').select('*').eq('school_id', schoolId).maybeSingle(),
      supabase.from('inventarisasi_tim').select('*').eq('school_id', schoolId).order('created_at'),
      supabase.from('employees').select('id, nama').eq('school_id', schoolId).eq('status', 'aktif').order('nama'),
    ])
    setAset(a || [])
    setRuangan(rg || [])
    setPersiapan(p || null)
    setTim(tm || [])
    setPegawai(pg || [])
    setLoading(false)
  }, [schoolId])
  useEffect(() => { load() }, [load])
  const siapPendataan = !!persiapan?.tim_disahkan

  return (
    <div className="flex flex-col gap-5">
      <UnitBar hasFullAccess={hasFullAccess} schools={schools} schoolId={schoolId} setSchoolId={setSchoolId} />
      <Card className="bg-[var(--color-navy-50)]">
        <p className="text-[13px] text-[var(--color-ink)]"><b>SIMAS Inventarisasi (BAB VII).</b> Alur: <b>Persiapan</b> (Tim + pengesahan Yayasan) → <b>Pendataan</b> → <b>Identifikasi &amp; Verifikasi</b> (instrumen, 2 tingkat) → <b>KIA/KIR</b>, <b>Label QR</b>, <b>Dokumen &amp; Formulir</b>. Terintegrasi ke Penghapusan, Pemeliharaan, dan Buku Kas.</p>
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
      ) : sub === 'instrumen' ? (
        <MasterInstrumen klasifikasi={klasifikasi} instrumen={instrumen} canManage={hasFullAccess} onChanged={load} />
      ) : sub === 'pengaturan' ? (
        <InvPengaturan />
      ) : !schoolId ? (
        <p className="text-sm text-[var(--color-ink-soft)]">Pilih unit lebih dulu.</p>
      ) : loading ? <FullPageSpinner /> : (
        <>
          {sub === 'dashboard' && <><InvDashboard aset={aset} ruangan={ruangan} /><DokumenAreaCard area="Inventarisasi" schoolId={schoolId} /></>}
          {sub === 'persiapan' && <InvPersiapan schoolId={schoolId} persiapan={persiapan} tim={tim} pegawai={pegawai} ruangan={ruangan} klasifikasiCount={klasifikasi.length} canManage={canManage} onChanged={load} onMulai={() => setSub('pendataan')} />}
          {sub === 'pendataan' && (siapPendataan
            ? <InvPendataan aset={aset} ruangan={ruangan} klasifikasi={klasifikasi} schools={schools} schoolId={schoolId} canManage={canManage} onChanged={load} />
            : <GateCard onGo={() => setSub('persiapan')} />)}
          {sub === 'identifikasi' && <InvIdentifikasi aset={aset} instrumen={instrumen} canManage={canManage} onChanged={load} />}
          {sub === 'scan' && <InvScan aset={aset} instrumen={instrumen} canManage={canManage} onChanged={load} />}
          {sub === 'kiakir' && <InvKiaKir aset={aset} ruangan={ruangan} />}
          {sub === 'label' && <InvLabel aset={aset} ruangan={ruangan} schoolName={schools.find((s) => s.id === schoolId)?.nama} />}
        </>
      )}
    </div>
  )
}

const PERAN_TIM = { penanggung_jawab: 'Penanggung Jawab', ketua: 'Ketua', sekretaris: 'Sekretaris', anggota: 'Anggota', pengelola_aset: 'Pengelola Aset', petugas: 'Petugas Pendata' }

// PJ/PIC ruangan — integrasi langsung dari modul Ruangan: kelas → Wali Kelas,
// lainnya → PIC pegawai, atau PIC manual. Mengembalikan { nama, employee_id, sumber }.
function pjOf(r) {
  if (r?.jenis === 'kelas' && r?.rombel?.wali?.nama) return { nama: r.rombel.wali.nama, employee_id: r.rombel.wali_kelas_employee_id || null, sumber: 'Wali Kelas' }
  if (r?.employees?.nama) return { nama: r.employees.nama, employee_id: r.pic_employee_id || null, sumber: 'PIC Pegawai' }
  if (r?.pic_nama) return { nama: r.pic_nama, employee_id: null, sumber: 'PIC Manual' }
  return null
}

function GateCard({ onGo }) {
  return (
    <Card>
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-gold-soft,#fdf3dc)]"><ListChecks className="h-6 w-6 text-[var(--color-gold,#b7791f)]" /></div>
        <h3 className="text-base font-semibold text-[var(--color-ink)]">Pendataan terkunci</h3>
        <p className="max-w-md text-sm text-[var(--color-ink-soft)]">Persiapan Inventarisasi harus matang dan <b>disahkan Yayasan</b> terlebih dahulu sebelum pendataan dapat dimulai.</p>
        <Button onClick={onGo}><ListChecks className="h-4 w-4" /> Buka Persiapan</Button>
      </div>
    </Card>
  )
}

/* ---------------- Persiapan Inventarisasi (gerbang Pendataan) ---------------- */
function InvPersiapan({ schoolId, persiapan, tim, pegawai, ruangan, klasifikasiCount, canManage, onChanged, onMulai }) {
  const { isAdminYayasan } = useAuth()
  const disahkan = !!persiapan?.tim_disahkan
  const [p, setP] = useState({})
  const [savingP, setSavingP] = useState(false)
  const [busy, setBusy] = useState(false)
  // Tim add form
  const [pegawaiId, setPegawaiId] = useState('')
  const [namaManual, setNamaManual] = useState('')
  const [peran, setPeran] = useState('anggota')
  const [asal, setAsal] = useState('')
  useEffect(() => { setP({ periode_nama: persiapan?.periode_nama || '', periode_jenis: persiapan?.periode_jenis || 'Semester Ganjil', periode_mulai: persiapan?.periode_mulai || '', periode_selesai: persiapan?.periode_selesai || '', no_sk: persiapan?.no_sk || '', catatan: persiapan?.catatan || '' }) }, [persiapan])
  const setField = (k, v) => setP((s) => ({ ...s, [k]: v }))

  const simpanPeriode = async () => {
    setSavingP(true)
    const { error } = await supabase.from('inventarisasi_persiapan').upsert({ school_id: schoolId, periode_nama: p.periode_nama?.trim() || null, periode_jenis: p.periode_jenis || null, periode_mulai: p.periode_mulai || null, periode_selesai: p.periode_selesai || null, no_sk: p.no_sk?.trim() || null, catatan: p.catatan?.trim() || null })
    setSavingP(false)
    if (error) { alert('Gagal: ' + error.message); return }
    onChanged()
  }
  const manual = pegawaiId === '__manual__'
  const tambahTim = async (e) => {
    e.preventDefault()
    const pg = pegawai.find((x) => x.id === pegawaiId)
    const nama = manual ? namaManual.trim() : (pg?.nama || '')
    if (!nama) return
    const { error } = await supabase.from('inventarisasi_tim').insert({ school_id: schoolId, nama, employee_id: manual ? null : (pg?.id || null), peran, jabatan_asal: asal.trim() || null })
    if (error) { alert('Gagal: ' + error.message); return }
    setPegawaiId(''); setNamaManual(''); setAsal(''); onChanged()
  }
  const hapusTim = async (id) => { const { error } = await supabase.from('inventarisasi_tim').delete().eq('id', id); if (error) { alert('Gagal: ' + error.message); return } onChanged() }
  // Tarik PJ/PIC ruangan (unik) ke dalam tim dengan peran yang sedang dipilih.
  const tarikPjRuangan = async () => {
    const existEmp = new Set(tim.filter((m) => m.employee_id).map((m) => m.employee_id))
    const existNama = new Set(tim.map((m) => (m.nama || '').trim().toLowerCase()))
    const seen = new Set(); const rows = []
    for (const r of ruangan) {
      const pj = pjOf(r); if (!pj) continue
      const nk = pj.nama.trim().toLowerCase()
      const key = pj.employee_id ? `e:${pj.employee_id}` : `n:${nk}`
      if (seen.has(key)) continue; seen.add(key)
      if ((pj.employee_id && existEmp.has(pj.employee_id)) || existNama.has(nk)) continue
      rows.push({ school_id: schoolId, nama: pj.nama, employee_id: pj.employee_id, peran, jabatan_asal: 'PJ Ruangan' })
    }
    if (rows.length === 0) { alert('Tidak ada PJ/PIC ruangan baru untuk ditambahkan (sudah ada di tim atau belum ditetapkan di modul Ruangan).'); return }
    if (!confirm(`Tambahkan ${rows.length} PJ/PIC ruangan ke tim sebagai "${PERAN_TIM[peran]}"?`)) return
    const { error } = await supabase.from('inventarisasi_tim').insert(rows)
    if (error) { alert('Gagal: ' + error.message); return } onChanged()
  }
  // Daftar ruangan + PJ (ringkas) untuk ditampilkan & dihitung.
  const daftarRuangan = ruangan.map((r) => ({ id: r.id, nama: r.nama, pj: pjOf(r) }))
  const tanpaPj = daftarRuangan.filter((r) => !r.pj).length
  const sahkan = async () => {
    if (tim.length === 0) { alert('Tambahkan anggota Tim dulu.'); return }
    if (!p.periode_nama?.trim()) { alert('Isi & simpan Periode dulu.'); return }
    if (!confirm('Sahkan Persiapan Inventarisasi (atas nama Yayasan)? Setelah disahkan, Pendataan dapat dimulai.')) return
    setBusy(true); const { error } = await supabase.from('inventarisasi_persiapan').update({ tim_disahkan: true }).eq('school_id', schoolId); setBusy(false)
    if (error) { alert('Gagal: ' + error.message); return } onChanged()
  }
  const batal = async () => { setBusy(true); const { error } = await supabase.from('inventarisasi_persiapan').update({ tim_disahkan: false }).eq('school_id', schoolId); setBusy(false); if (error) { alert('Gagal: ' + error.message); return } onChanged() }

  const ceklist = [
    { ok: !!p.periode_nama, t: 'Periode inventarisasi ditetapkan' },
    { ok: tim.length > 0, t: `Tim Inventarisasi disusun (${tim.length} anggota)` },
    { ok: tim.some((m) => m.peran === 'ketua'), t: 'Ada Ketua Tim' },
    { ok: ruangan.length > 0, t: `Ruangan terdaftar (${ruangan.length} ruangan)` },
    { ok: ruangan.length > 0 && tanpaPj === 0, t: tanpaPj === 0 ? 'Semua ruangan punya Penanggung Jawab' : `${tanpaPj} ruangan belum punya PJ` },
    { ok: klasifikasiCount > 0, t: `Golongan/kodefikasi siap (${klasifikasiCount} golongan)` },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {disahkan ? <Badge color="success">Persiapan disahkan Yayasan</Badge> : <Badge color="gold">Persiapan belum disahkan</Badge>}
        {disahkan && <Button size="sm" onClick={onMulai}>Mulai Pendataan →</Button>}
      </div>

      <SectionCard title="1. Periode Inventarisasi" description="Tetapkan periode & dasar pelaksanaan. Menjadi header dokumen (LHI, BA, SK Tim).">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Nama Periode" value={p.periode_nama || ''} onChange={(e) => setField('periode_nama', e.target.value)} placeholder="Inventarisasi Semester Ganjil 2026/2027" disabled={disahkan || !canManage} />
          <Select label="Jenis" value={p.periode_jenis || 'Semester Ganjil'} onChange={(e) => setField('periode_jenis', e.target.value)} disabled={disahkan || !canManage}>{['Semester Ganjil', 'Semester Genap', 'Tahunan', 'Khusus'].map((j) => <option key={j}>{j}</option>)}</Select>
          <Input label="Tanggal Mulai" type="date" value={p.periode_mulai || ''} onChange={(e) => setField('periode_mulai', e.target.value)} disabled={disahkan || !canManage} />
          <Input label="Tanggal Selesai" type="date" value={p.periode_selesai || ''} onChange={(e) => setField('periode_selesai', e.target.value)} disabled={disahkan || !canManage} />
          <Input label="No. SK / Dasar Pelaksanaan" value={p.no_sk || ''} onChange={(e) => setField('no_sk', e.target.value)} placeholder="SK Ketua Yayasan No. ..." disabled={disahkan || !canManage} />
          <Input label="Catatan" value={p.catatan || ''} onChange={(e) => setField('catatan', e.target.value)} disabled={disahkan || !canManage} />
        </div>
        {!disahkan && canManage && <div className="mt-3"><Button onClick={simpanPeriode} disabled={savingP}>{savingP ? 'Menyimpan…' : 'Simpan Periode'}</Button></div>}
      </SectionCard>

      <SectionCard title="2. Tim Inventarisasi" description="Susun tim (Ketua, Sekretaris, Anggota, dll). Nama diambil dari daftar pegawai unit.">
        {tim.length > 0 ? (
          <div className="overflow-x-auto">
            <Table columns={['Nama', 'Peran', 'Jabatan/Unit Asal', disahkan || !canManage ? null : ''].filter((c) => c !== null)}>
              {tim.map((m) => (
                <Tr key={m.id}><Td className="font-medium">{m.nama}</Td><Td className="text-xs">{PERAN_TIM[m.peran] || m.peran}</Td><Td className="text-xs">{m.jabatan_asal || '—'}</Td>
                  {!disahkan && canManage && <Td><div className="flex justify-end"><button onClick={() => hapusTim(m.id)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]"><Trash2 className="h-4 w-4" /></button></div></Td>}
                </Tr>
              ))}
            </Table>
          </div>
        ) : <p className="text-sm text-[var(--color-ink-soft)]">Belum ada anggota tim.</p>}
        {!disahkan && canManage && (
          <form onSubmit={tambahTim} className="mt-3 flex flex-wrap items-end gap-2 border-t border-[var(--color-border)] pt-3">
            <div className="min-w-[180px] flex-1"><Select label="Nama (dari pegawai)" value={pegawaiId} onChange={(e) => setPegawaiId(e.target.value)}><option value="">— pilih pegawai —</option>{pegawai.map((x) => <option key={x.id} value={x.id}>{x.nama}</option>)}<option value="__manual__">Ketik manual…</option></Select></div>
            {manual && <Input label="Nama manual" value={namaManual} onChange={(e) => setNamaManual(e.target.value)} containerClassName="min-w-[150px] flex-1" />}
            <Select label="Peran" value={peran} onChange={(e) => setPeran(e.target.value)}>{Object.entries(PERAN_TIM).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
            <Input label="Jabatan/Asal" value={asal} onChange={(e) => setAsal(e.target.value)} containerClassName="min-w-[120px]" />
            <Button type="submit"><Plus className="h-4 w-4" /> Tambah</Button>
            <Button type="button" variant="outline" onClick={tarikPjRuangan} title="Tambahkan semua PJ/PIC ruangan ke tim dengan peran yang dipilih"><DoorOpen className="h-4 w-4" /> Tarik PJ Ruangan</Button>
          </form>
        )}
        {!disahkan && canManage && <p className="mt-2 text-xs text-[var(--color-ink-soft)]">Tip: pilih peran dulu (mis. <b>Petugas Pendata</b>), lalu <b>Tarik PJ Ruangan</b> untuk memasukkan seluruh penanggung jawab ruangan sekaligus. Duplikat otomatis dilewati.</p>}
      </SectionCard>

      <SectionCard title="Ruangan & Penanggung Jawab" description={`Terintegrasi langsung dari modul Ruangan (${daftarRuangan.length} ruangan${tanpaPj ? ` · ${tanpaPj} belum punya PJ` : ''}). Kelas → Wali Kelas; lainnya → PIC Ruangan.`}>
        {daftarRuangan.length === 0 ? <p className="text-sm text-[var(--color-ink-soft)]">Belum ada ruangan. Tambahkan di menu Sarana & Prasarana → Ruangan.</p> : (
          <div className="max-h-80 overflow-auto">
            <Table columns={['Ruangan', 'Penanggung Jawab', 'Sumber']}>
              {daftarRuangan.map((r) => (
                <Tr key={r.id}><Td className="font-medium">{r.nama}</Td>
                  <Td className="text-xs">{r.pj ? r.pj.nama : <span className="text-[var(--color-gold)]">Belum ditetapkan</span>}</Td>
                  <Td className="text-[11px] text-[var(--color-ink-soft)]">{r.pj?.sumber || '—'}</Td>
                </Tr>
              ))}
            </Table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="3. Kesiapan" description="Pastikan prasyarat lengkap sebelum pengesahan. Ruangan/PJ dikelola di menu Ruangan; Golongan di Master Golongan.">
        <ul className="flex flex-col gap-2 text-sm">
          {ceklist.map((c) => (<li key={c.t} className="flex items-center gap-2"><CheckCircle2 className={`h-4 w-4 ${c.ok ? 'text-[var(--color-success,#17814c)]' : 'text-[var(--color-border)]'}`} /> <span className={c.ok ? 'text-[var(--color-ink)]' : 'text-[var(--color-ink-soft)]'}>{c.t}</span></li>))}
        </ul>
      </SectionCard>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-[var(--color-ink)]">{disahkan ? 'Persiapan telah disahkan — Pendataan terbuka.' : 'Minta Yayasan mengesahkan Persiapan untuk membuka Pendataan.'}</p>
          <div className="flex gap-2">
            {!disahkan && isAdminYayasan && <Button onClick={sahkan} disabled={busy}><ShieldCheck className="h-4 w-4" /> Sahkan Persiapan (Yayasan)</Button>}
            {!disahkan && !isAdminYayasan && <span className="self-center text-xs text-[var(--color-ink-soft)]">Pengesahan oleh Admin Yayasan.</span>}
            {disahkan && isAdminYayasan && <Button variant="outline" onClick={batal} disabled={busy}>Batalkan Pengesahan</Button>}
            {disahkan && <Button onClick={onMulai}>Mulai Pendataan →</Button>}
          </div>
        </div>
      </Card>
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

/* ---------------- Identifikasi & Verifikasi (berinstrumen, 2 tingkat) ---------------- */
function InvIdentifikasi({ aset, instrumen, canManage, onChanged }) {
  const { isAdminYayasan } = useAuth()
  const [filter, setFilter] = useState('aktif')
  const [modal, setModal] = useState(null) // { aset, mode: 'isi'|'reviu' }
  const rows = useMemo(() => {
    if (filter === 'semua') return aset
    if (filter === 'disahkan') return aset.filter((a) => a.verif_status === 'disahkan')
    return aset.filter((a) => a.verif_status !== 'disahkan') // aktif = belum selesai
  }, [aset, filter])
  const total = aset.length
  const sudah = aset.filter((a) => a.verif_status === 'disahkan').length

  // Transisi status cepat (verifikasi sekolah / sahkan / tolak) + reset.
  const ubahStatus = async (a, status, extra = {}) => {
    const { error } = await supabase.from('aset').update({ verif_status: status, ...extra }).eq('id', a.id)
    if (error) { alert('Gagal: ' + error.message); return }
    onChanged()
  }
  return (
    <SectionCard title="Identifikasi & Verifikasi" description="Isi instrumen pemeriksaan tiap aset, ajukan, verifikasi tingkat sekolah, lalu disahkan Yayasan. Instrumen mengikuti golongan aset.">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge color={sudah === total && total ? 'success' : 'gold'}>{sudah}/{total} disahkan</Badge>
        <Select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="aktif">Belum selesai</option>
          <option value="disahkan">Sudah disahkan</option>
          <option value="semua">Semua</option>
        </Select>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={CheckCircle2} title={filter === 'aktif' ? 'Tidak ada yang menunggu' : 'Tidak ada aset'} />
      ) : (
        <div className="overflow-x-auto">
          <Table columns={['Kode Aset', 'Nama', 'Golongan', 'Kondisi', 'Status Verifikasi', 'Aksi']}>
            {rows.map((a) => {
              const st = a.verif_status || 'belum'
              return (
                <Tr key={a.id}>
                  <Td className="font-mono text-[11px]">{a.kode_aset || '—'}</Td>
                  <Td className="font-medium">{a.nama}</Td>
                  <Td className="text-xs">{a.aset_klasifikasi?.uraian || '—'}</Td>
                  <Td><Badge color={KONDISI_CHIP[a.kondisi]}>{KONDISI_LABEL[a.kondisi]}</Badge></Td>
                  <Td><Badge color={VERIF_BADGE[st]}>{VERIF_LABEL[st]}</Badge></Td>
                  <Td>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {a.verif_jawaban && <button onClick={() => setModal({ aset: a, mode: 'reviu' })} className="text-xs text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]">Lihat</button>}
                      {canManage && (st === 'belum' || st === 'ditolak') && <button onClick={() => setModal({ aset: a, mode: 'isi' })} className="rounded-md bg-[var(--color-navy)] px-2 py-1 text-[11px] font-medium text-white hover:opacity-90">Isi Instrumen & Ajukan</button>}
                      {canManage && st === 'diajukan' && <button onClick={() => ubahStatus(a, 'diverifikasi')} className="rounded-md bg-[var(--color-navy)] px-2 py-1 text-[11px] font-medium text-white hover:opacity-90">Verifikasi (Sekolah)</button>}
                      {isAdminYayasan && st === 'diverifikasi' && <><button onClick={() => ubahStatus(a, 'disahkan')} className="rounded-md bg-[var(--color-success,#17814c)] px-2 py-1 text-[11px] font-medium text-white hover:opacity-90">Sahkan</button><button onClick={() => { const c = prompt('Alasan penolakan (opsional):') || null; ubahStatus(a, 'ditolak', { verif_catatan: c }) }} className="rounded-md border border-[var(--color-danger)] px-2 py-1 text-[11px] font-medium text-[var(--color-danger)]">Tolak</button></>}
                      {isAdminYayasan && st === 'disahkan' && <button onClick={() => ubahStatus(a, 'belum')} className="text-xs text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]">Batalkan</button>}
                    </div>
                  </Td>
                </Tr>
              )
            })}
          </Table>
        </div>
      )}
      <InstrumenModal data={modal} instrumen={instrumen} onClose={() => setModal(null)} onSaved={() => { setModal(null); onChanged() }} />
    </SectionCard>
  )
}

/* ---------------- Scan Aset (QR/Barcode: kamera + scanner fisik) ---------------- */
function InvScan({ aset, instrumen, canManage, onChanged }) {
  const { isAdminYayasan } = useAuth()
  const [code, setCode] = useState('')
  const [found, setFound] = useState(null) // asset row | 'notfound' | null
  const [modal, setModal] = useState(null)
  const [camOn, setCamOn] = useState(false)
  const [camErr, setCamErr] = useState('')
  const videoRef = useRef(null)
  const asetRef = useRef(aset)
  asetRef.current = aset
  const supported = typeof window !== 'undefined' && 'BarcodeDetector' in window

  const lookup = (raw) => {
    // Terima kode mentah atau URL info (dari QR): .../aset/info/<kode>
    let v = String(raw || '').trim()
    const m = v.match(/\/aset\/info\/([^/?#]+)/i)
    if (m) { try { v = decodeURIComponent(m[1]) } catch { v = m[1] } }
    const q = v.toUpperCase()
    if (!q) return
    const hit = asetRef.current.find((a) => (a.kode_aset || '').toUpperCase() === q)
    setCode(q); setFound(hit || 'notfound')
  }
  const submit = (e) => { e.preventDefault(); lookup(code) }

  useEffect(() => {
    if (!camOn) return
    let stream, raf, stopped = false, detector
    setCamErr('')
    ;(async () => {
      try {
        detector = new window.BarcodeDetector({ formats: ['qr_code', 'code_39'] })
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play() }
        const tick = async () => {
          if (stopped) return
          try { const codes = await detector.detect(videoRef.current); if (codes && codes[0]) { lookup(codes[0].rawValue); setCamOn(false); return } } catch { /* frame not ready */ }
          raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
      } catch (e) { setCamErr('Tidak bisa mengakses kamera: ' + (e?.message || e)); setCamOn(false) }
    })()
    return () => { stopped = true; if (raf) cancelAnimationFrame(raf); if (stream) stream.getTracks().forEach((t) => t.stop()) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camOn])

  const ubahStatus = async (a, status, extra = {}) => {
    const { error } = await supabase.from('aset').update({ verif_status: status, ...extra }).eq('id', a.id)
    if (error) { alert('Gagal: ' + error.message); return }
    setFound((f) => (f && f !== 'notfound' ? { ...f, verif_status: status } : f))
    onChanged()
  }

  const a = found && found !== 'notfound' ? found : null
  const st = a?.verif_status || 'belum'
  return (
    <SectionCard title="Scan Aset" description="Pindai QR/barcode label aset untuk langsung menemukan & memverifikasi. Mendukung kamera HP (QR/Code 39) dan scanner fisik (USB/Bluetooth).">
      <div className="flex flex-col gap-3">
        <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
          <Input autoFocus placeholder="Scan di sini (scanner fisik) atau ketik kode aset…" value={code} onChange={(e) => setCode(e.target.value)} containerClassName="min-w-[260px] flex-1" />
          <Button type="submit"><Search className="h-4 w-4" /> Cari</Button>
          {supported && !camOn && <Button type="button" variant="outline" onClick={() => { setCamErr(''); setCamOn(true) }}><Camera className="h-4 w-4" /> Scan via Kamera</Button>}
          {camOn && <Button type="button" variant="outline" onClick={() => setCamOn(false)}><X className="h-4 w-4" /> Tutup Kamera</Button>}
        </form>
        {!supported && <p className="text-xs text-[var(--color-ink-soft)]">Scan kamera tidak didukung browser ini — gunakan scanner fisik (otomatis mengetik ke kotak di atas) atau ketik manual. Untuk kamera, pakai Chrome/Edge di Android.</p>}
        {camErr && <p className="text-sm text-[var(--color-danger)]">{camErr}</p>}
        {camOn && (
          <div className="relative mx-auto w-full max-w-sm overflow-hidden rounded-lg border-2 border-[var(--color-navy)] bg-black">
            <video ref={videoRef} className="w-full" muted playsInline />
            <div className="pointer-events-none absolute inset-6 rounded-lg border-2 border-white/70" />
          </div>
        )}

        {found === 'notfound' && (
          <div className="rounded-lg border border-[var(--color-danger)] bg-[var(--color-danger-soft,#fdecea)] p-3 text-sm">Aset dengan kode <b className="font-mono">{code}</b> tidak ditemukan di unit ini. Pastikan unit yang dipilih benar.</div>
        )}
        {a && (
          <div className="rounded-lg border border-[var(--color-border)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h4 className="text-base font-semibold text-[var(--color-ink)]">{a.nama}</h4>
                <p className="font-mono text-xs text-[var(--color-ink-soft)]">{a.kode_aset}</p>
                <p className="mt-1 text-xs text-[var(--color-ink-soft)]">{a.aset_klasifikasi?.uraian || '—'} · {a.ruangan?.nama || 'tanpa ruangan'} · {Number(a.jumlah) || 1} {a.satuan || ''}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge color={KONDISI_CHIP[a.kondisi]}>{KONDISI_LABEL[a.kondisi]}</Badge>
                <Badge color={VERIF_BADGE[st]}>{VERIF_LABEL[st]}</Badge>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--color-border)] pt-3">
              {a.verif_jawaban && <Button size="sm" variant="ghost" onClick={() => setModal({ aset: a, mode: 'reviu' })}>Lihat Instrumen</Button>}
              {canManage && (st === 'belum' || st === 'ditolak') && <Button size="sm" onClick={() => setModal({ aset: a, mode: 'isi' })}>Isi Instrumen & Ajukan</Button>}
              {canManage && st === 'diajukan' && <Button size="sm" onClick={() => ubahStatus(a, 'diverifikasi')}>Verifikasi (Sekolah)</Button>}
              {isAdminYayasan && st === 'diverifikasi' && <><Button size="sm" onClick={() => ubahStatus(a, 'disahkan')}>Sahkan</Button><Button size="sm" variant="outline" onClick={() => { const c = prompt('Alasan penolakan (opsional):') || null; ubahStatus(a, 'ditolak', { verif_catatan: c }) }}>Tolak</Button></>}
              {st === 'disahkan' && <span className="self-center text-xs text-[var(--color-ink-soft)]">Aset sudah disahkan Yayasan.</span>}
            </div>
          </div>
        )}
      </div>
      <InstrumenModal data={modal} instrumen={instrumen} onClose={() => setModal(null)} onSaved={() => { setModal(null); onChanged() }} />
    </SectionCard>
  )
}

function poinUntukAset(instrumen, asetRow) {
  return instrumen
    .filter((i) => i.klasifikasi_id == null || i.klasifikasi_id === asetRow?.klasifikasi_id)
    .sort((a, b) => (a.klasifikasi_id ? 1 : 0) - (b.klasifikasi_id ? 1 : 0) || (a.urutan || 0) - (b.urutan || 0))
}

function InstrumenModal({ data, instrumen, onClose, onSaved }) {
  const [ans, setAns] = useState({})
  const [catatan, setCatatan] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const a = data?.aset
  const mode = data?.mode
  const items = useMemo(() => a ? poinUntukAset(instrumen, a) : [], [instrumen, a])
  useEffect(() => {
    if (!data) return
    setError(''); setCatatan(a?.verif_catatan || '')
    if (mode === 'reviu') setAns({})
    else { const init = {}; items.forEach((it) => { init[it.id] = it.tipe === 'ya_tidak' ? '' : '' }); setAns(init) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])
  if (!data) return null
  const simpan = async () => {
    const wajibKurang = items.filter((it) => it.wajib && !String(ans[it.id] ?? '').trim())
    if (wajibKurang.length) { setError(`${wajibKurang.length} poin wajib belum diisi.`); return }
    setSaving(true); setError('')
    const jawaban = { diisi_at: new Date().toISOString(), items: items.map((it) => ({ poin: it.poin, tipe: it.tipe, nilai: ans[it.id] ?? '' })) }
    const { error: err } = await supabase.from('aset').update({ verif_status: 'diajukan', verif_jawaban: jawaban, verif_catatan: catatan?.trim() || null }).eq('id', a.id)
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }
  const tersimpan = a?.verif_jawaban?.items || []
  return (
    <Modal open={!!data} onClose={onClose} title={mode === 'reviu' ? `Instrumen — ${a?.nama}` : `Isi Instrumen — ${a?.nama}`} width="max-w-lg">
      <div className="flex flex-col gap-3">
        <div className="rounded-lg bg-[var(--color-navy-50)] p-3 text-xs"><b>{a?.nama}</b> <span className="font-mono">{a?.kode_aset || ''}</span><span className="block text-[var(--color-ink-soft)]">Golongan: {a?.aset_klasifikasi?.uraian || '—'} · Status: {VERIF_LABEL[a?.verif_status] || a?.verif_status}</span></div>
        {mode === 'reviu' ? (
          tersimpan.length === 0 ? <p className="text-sm text-[var(--color-ink-soft)]">Instrumen belum diisi.</p> : (
            <div className="flex flex-col gap-2">
              {tersimpan.map((it, i) => (
                <div key={i} className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] pb-1.5 text-sm">
                  <span className="text-[var(--color-ink)]">{it.poin}</span>
                  <b className="flex-shrink-0 text-right">{it.tipe === 'ya_tidak' ? (it.nilai === 'ya' ? '✓ Ya' : it.nilai === 'tidak' ? '✗ Tidak' : '—') : (it.nilai || '—')}</b>
                </div>
              ))}
              {a?.verif_catatan && <p className="text-xs text-[var(--color-ink-soft)]">Catatan: {a.verif_catatan}</p>}
            </div>
          )
        ) : (
          <>
            {items.length === 0 ? <p className="text-sm text-[var(--color-ink-soft)]">Belum ada instrumen. Admin Yayasan dapat menyusunnya di menu Instrumen Verifikasi.</p> : items.map((it) => (
              <div key={it.id} className="flex flex-col gap-1">
                <label className="text-sm text-[var(--color-ink)]">{it.poin}{it.wajib && <span className="text-[var(--color-danger)]"> *</span>}{it.klasifikasi_id ? <span className="ml-1 text-[10px] text-[var(--color-ink-soft)]">(khusus golongan)</span> : null}</label>
                {it.tipe === 'ya_tidak' ? (
                  <div className="flex gap-2">
                    {[['ya', 'Ya'], ['tidak', 'Tidak']].map(([v, l]) => <button key={v} type="button" onClick={() => setAns((s) => ({ ...s, [it.id]: v }))} className={`rounded-md border px-3 py-1 text-xs ${ans[it.id] === v ? 'border-[var(--color-navy)] bg-[var(--color-navy)] text-white' : 'border-[var(--color-border)]'}`}>{l}</button>)}
                  </div>
                ) : it.tipe === 'pilihan' ? (
                  <Select value={ans[it.id] || ''} onChange={(e) => setAns((s) => ({ ...s, [it.id]: e.target.value }))}><option value="">— pilih —</option>{(it.opsi || '').split(',').map((o) => o.trim()).filter(Boolean).map((o) => <option key={o} value={o}>{o}</option>)}</Select>
                ) : (
                  <Input type={it.tipe === 'angka' ? 'number' : 'text'} value={ans[it.id] || ''} onChange={(e) => setAns((s) => ({ ...s, [it.id]: e.target.value }))} />
                )}
              </div>
            ))}
            <textarea className="w-full rounded-md border border-[var(--color-border)] p-2 text-sm" rows={2} placeholder="Catatan verifikasi (opsional)" value={catatan} onChange={(e) => setCatatan(e.target.value)} />
            {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
          </>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Tutup</Button>
          {mode === 'isi' && <Button onClick={simpan} disabled={saving || items.length === 0}>{saving ? 'Menyimpan…' : 'Simpan & Ajukan'}</Button>}
        </div>
      </div>
    </Modal>
  )
}

/* ---------------- Master Instrumen Verifikasi (per golongan) ---------------- */
function MasterInstrumen({ klasifikasi, instrumen, canManage, onChanged }) {
  const [scope, setScope] = useState('') // '' = umum, else klasifikasi_id
  const [open, setOpen] = useState(false)
  const [edit, setEdit] = useState(null)
  const items = useMemo(() => instrumen.filter((i) => (scope === '' ? i.klasifikasi_id == null : i.klasifikasi_id === scope)).sort((a, b) => (a.urutan || 0) - (b.urutan || 0)), [instrumen, scope])
  const hapus = async (it) => { if (!confirm('Hapus poin instrumen ini?')) return; const { error } = await supabase.from('aset_instrumen_item').delete().eq('id', it.id); if (error) { alert('Gagal: ' + error.message); return } onChanged() }
  return (
    <SectionCard title="Instrumen Verifikasi (per Golongan)" description="Blanko pemeriksaan yang diisi petugas saat verifikasi. Poin 'Umum' berlaku untuk semua aset; poin golongan khusus ditambahkan untuk golongan itu. Dikelola Yayasan.">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="">Umum (semua aset)</option>
          {klasifikasi.map((k) => <option key={k.id} value={k.id}>{k.kode} — {k.uraian}</option>)}
        </Select>
        {canManage && <Button onClick={() => { setEdit(null); setOpen(true) }}><Plus className="h-4 w-4" /> Tambah Poin</Button>}
        <div className="flex-1" />
        <span className="text-xs text-[var(--color-ink-soft)]">{items.length} poin</span>
      </div>
      {items.length === 0 ? <EmptyState icon={ClipboardCheck} title="Belum ada poin instrumen" description={scope === '' ? 'Tambahkan poin umum, atau pilih golongan.' : 'Golongan ini belum punya poin khusus (poin umum tetap berlaku).'} /> : (
        <div className="overflow-x-auto">
          <Table columns={['#', 'Poin Pemeriksaan', 'Tipe', 'Wajib', canManage ? '' : null].filter((c) => c !== null)}>
            {items.map((it) => (
              <Tr key={it.id}>
                <Td className="text-xs">{it.urutan}</Td>
                <Td>{it.poin}</Td>
                <Td className="text-xs">{({ ya_tidak: 'Ya/Tidak', teks: 'Teks', angka: 'Angka', pilihan: 'Pilihan' })[it.tipe]}</Td>
                <Td className="text-xs">{it.wajib ? 'Ya' : '—'}</Td>
                {canManage && <Td><div className="flex justify-end gap-1.5"><button onClick={() => { setEdit(it); setOpen(true) }} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]"><Pencil className="h-4 w-4" /></button><button onClick={() => hapus(it)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]"><Trash2 className="h-4 w-4" /></button></div></Td>}
              </Tr>
            ))}
          </Table>
        </div>
      )}
      {!canManage && <p className="mt-2 text-xs text-[var(--color-ink-soft)]">Hanya Admin Yayasan yang dapat menyusun instrumen.</p>}
      <InstrumenItemModal open={open} editing={edit} klasifikasiId={scope || null} onClose={() => { setOpen(false); setEdit(null) }} onSaved={() => { setOpen(false); setEdit(null); onChanged() }} />
    </SectionCard>
  )
}
function InstrumenItemModal({ open, editing, klasifikasiId, onClose, onSaved }) {
  const [f, setF] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { if (open) { setError(''); setF({ poin: editing?.poin || '', tipe: editing?.tipe || 'ya_tidak', opsi: editing?.opsi || '', wajib: editing?.wajib ?? true, urutan: editing?.urutan ?? 0 }) } }, [open, editing])
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const submit = async (e) => {
    e.preventDefault()
    if (!f.poin?.trim()) { setError('Poin wajib diisi.'); return }
    setSaving(true)
    const payload = { poin: f.poin.trim(), tipe: f.tipe, opsi: f.tipe === 'pilihan' ? (f.opsi?.trim() || null) : null, wajib: !!f.wajib, urutan: Number(f.urutan) || 0, klasifikasi_id: klasifikasiId }
    const { error: err } = editing ? await supabase.from('aset_instrumen_item').update(payload).eq('id', editing.id) : await supabase.from('aset_instrumen_item').insert(payload)
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }
  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Ubah Poin Instrumen' : 'Tambah Poin Instrumen'} width="max-w-md">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Input label="Poin Pemeriksaan" value={f.poin || ''} onChange={(e) => set('poin', e.target.value)} placeholder="mis. Kelengkapan kabel & adaptor" />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Tipe Jawaban" value={f.tipe || 'ya_tidak'} onChange={(e) => set('tipe', e.target.value)}>
            <option value="ya_tidak">Ya / Tidak</option><option value="teks">Teks</option><option value="angka">Angka</option><option value="pilihan">Pilihan</option>
          </Select>
          <Input label="Urutan" type="number" value={f.urutan ?? 0} onChange={(e) => set('urutan', e.target.value)} />
        </div>
        {f.tipe === 'pilihan' && <Input label="Opsi (pisah koma)" value={f.opsi || ''} onChange={(e) => set('opsi', e.target.value)} placeholder="Baik, Cukup, Kurang" />}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.wajib} onChange={(e) => set('wajib', e.target.checked)} /> Wajib diisi</label>
        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Batal</Button><Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button></div>
      </form>
    </Modal>
  )
}

/* ---------------- Cetak Label (barcode) ---------------- */
function InvLabel({ aset, ruangan, schoolName }) {
  const [fRuangan, setFRuangan] = useState('')
  const [format, setFormat] = useState('qr') // qr | barcode | keduanya
  const rows = useMemo(() => fRuangan ? aset.filter((a) => a.ruangan_id === fRuangan) : aset, [aset, fRuangan])
  // Jenis label otomatis: Permanen bila sudah disahkan Yayasan, selain itu Sementara.
  const labelJenis = (a) => (a.verif_status === 'disahkan' ? 'Permanen' : 'Sementara')
  // QR berisi URL info aset agar kamera HP langsung membuka info lengkap.
  const infoUrl = (kode) => `${window.location.origin}/aset/info/${encodeURIComponent(kode)}`
  const kodeFmt = (a) => {
    const kode = a.kode_aset || a.id
    const qr = `<div class="qr">${qrSvg(infoUrl(kode))}</div>`
    const bc = barcode39(kode)
    return format === 'qr' ? qr : format === 'barcode' ? bc : `<div class="dual">${qr}${bc}</div>`
  }
  const cetak = () => {
    const win = window.open('', '_blank')
    if (!win) { alert('Popup diblokir. Izinkan popup untuk mencetak label.'); return }
    const labels = rows.map((a) => `
      <div class="label">
        <div class="lh"><b>${esc(schoolName || '')}</b><span class="perm">${esc(labelJenis(a))}</span></div>
        <div class="nm">${esc(a.nama || '')}</div>
        <div class="meta"><span>${esc(a.aset_klasifikasi?.uraian || '')}</span><span>${esc(KONDISI_LABEL[a.kondisi] || '')}</span></div>
        ${kodeFmt(a)}
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
      .qr{width:70px;height:70px;margin:2px auto} .qr svg{width:100%;height:100%}
      .dual{display:flex;gap:6px;align-items:center}.dual .qr{width:54px;height:54px;margin:0;flex:0 0 auto}.dual svg.bc{flex:1}
      .code{text-align:center;font-size:9px;letter-spacing:1px;font-weight:700;margin-top:2px}
      </style></head><body><div class="sheet">${labels}</div>
      <scr${''}ipt>window.onload=function(){setTimeout(function(){window.print()},250)}</scr${''}ipt></body></html>`)
    win.document.close()
  }
  return (
    <SectionCard title="Cetak Label Aset (QR / Barcode)" description="Jenis label otomatis: Sementara bila belum disahkan Yayasan, Permanen bila sudah. QR Code andal dipindai kamera HP; Code 39 cocok untuk scanner laser.">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select value={fRuangan} onChange={(e) => setFRuangan(e.target.value)}><option value="">Semua Ruangan</option>{ruangan.map((r) => <option key={r.id} value={r.id}>{r.nama}</option>)}</Select>
        <Select value={format} onChange={(e) => setFormat(e.target.value)}><option value="qr">QR Code</option><option value="barcode">Barcode (Code 39)</option><option value="keduanya">Keduanya</option></Select>
        <div className="flex-1" />
        <Button onClick={cetak} disabled={rows.length === 0}><Printer className="h-4 w-4" /> Cetak {rows.length} Label</Button>
      </div>
      {rows.length === 0 ? <EmptyState icon={Tag} title="Tidak ada aset" description="Pilih ruangan lain atau tambah aset." /> : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {rows.slice(0, 12).map((a) => (
            <div key={a.id} className="rounded-lg border border-[var(--color-border)] p-2">
              <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-1 text-[9px] font-semibold"><span className="truncate">{schoolName}</span><span className={`rounded border px-1 ${a.verif_status === 'disahkan' ? 'border-[var(--color-success,#17814c)] text-[var(--color-success,#17814c)]' : 'border-[var(--color-gold,#b7791f)] text-[var(--color-gold,#b7791f)]'}`}>{labelJenis(a)}</span></div>
              <div className="min-h-[26px] py-1 text-[11px] font-bold leading-tight">{a.nama}</div>
              {format === 'qr' ? <div className="mx-auto h-16 w-16" dangerouslySetInnerHTML={{ __html: qrSvg(infoUrl(a.kode_aset || a.id)) }} />
                : format === 'barcode' ? <div dangerouslySetInnerHTML={{ __html: barcode39(a.kode_aset || a.id, { height: 30 }) }} />
                : <div className="flex items-center gap-1.5"><div className="h-12 w-12 flex-shrink-0" dangerouslySetInnerHTML={{ __html: qrSvg(infoUrl(a.kode_aset || a.id)) }} /><div className="flex-1" dangerouslySetInnerHTML={{ __html: barcode39(a.kode_aset || a.id, { height: 28 }) }} /></div>}
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
  // Gerbang: KIR butuh SEMUA aset ruangan disahkan; KIA butuh aset itu disahkan.
  const ruanganStat = useMemo(() => {
    const m = new Map()
    for (const a of aset) { if (!a.ruangan_id) continue; const c = m.get(a.ruangan_id) || { n: 0, ok: 0 }; c.n++; if (a.verif_status === 'disahkan') c.ok++; m.set(a.ruangan_id, c) }
    return m
  }, [aset])
  const asetFiltered = useMemo(() => { const s = q.toLowerCase(); return aset.filter((a) => !q || [a.nama, a.kode_aset].some((x) => (x || '').toLowerCase().includes(s))) }, [aset, q])
  return (
    <SectionCard title="KIA / KIR" description="Kartu Inventaris Aset (per aset) & Kartu Inventaris Ruangan (per ruangan). Hanya dapat dicetak/diperbarui setelah aset DISAHKAN Yayasan (KIR: semua aset ruangan itu).">
      <div className="mb-3 flex gap-2">
        <button onClick={() => setTab('kir')} className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${tab === 'kir' ? 'border-[var(--color-navy)] bg-[var(--color-navy)] text-white' : 'border-[var(--color-border)] bg-white'}`}><DoorOpen className="mr-1 inline h-3.5 w-3.5" /> KIR — per Ruangan</button>
        <button onClick={() => setTab('kia')} className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${tab === 'kia' ? 'border-[var(--color-navy)] bg-[var(--color-navy)] text-white' : 'border-[var(--color-border)] bg-white'}`}><ClipboardList className="mr-1 inline h-3.5 w-3.5" /> KIA — per Aset</button>
      </div>
      {tab === 'kir' ? (
        ruangan.length === 0 ? <EmptyState icon={DoorOpen} title="Belum ada ruangan" /> : (
          <div className="overflow-x-auto">
            <Table columns={['Ruangan', 'Aset Disahkan', 'Cetak']}>
              {ruangan.map((r) => {
                const st = ruanganStat.get(r.id) || { n: 0, ok: 0 }
                const siap = st.n > 0 && st.ok === st.n
                return (
                  <Tr key={r.id}>
                    <Td className="font-medium">{r.nama}</Td>
                    <Td><Badge color={siap ? 'success' : st.n === 0 ? 'neutral' : 'gold'}>{st.ok}/{st.n} disahkan</Badge></Td>
                    <Td><div className="flex justify-end">
                      {siap ? <Button size="sm" variant="outline" onClick={() => openCetak('kir', r.id)}><Printer className="h-3.5 w-3.5" /> Cetak KIR</Button>
                        : <span className="text-[11px] text-[var(--color-ink-soft)]">{st.n === 0 ? 'tidak ada aset' : 'belum semua disahkan'}</span>}
                    </div></Td>
                  </Tr>
                )
              })}
            </Table>
          </div>
        )
      ) : (
        <>
          <Input placeholder="Cari nama / kode aset…" value={q} onChange={(e) => setQ(e.target.value)} className="mb-3 min-w-[220px]" />
          {asetFiltered.length === 0 ? <EmptyState icon={ClipboardList} title="Belum ada aset" /> : (
            <div className="overflow-x-auto">
              <Table columns={['Kode Aset', 'Nama', 'Status', 'Cetak']}>
                {asetFiltered.slice(0, 100).map((a) => {
                  const ok = a.verif_status === 'disahkan'
                  return (
                    <Tr key={a.id}>
                      <Td className="font-mono text-[11px]">{a.kode_aset || '—'}</Td>
                      <Td className="font-medium">{a.nama}<span className="block text-[11px] text-[var(--color-ink-soft)]">{a.ruangan?.nama || ''}</span></Td>
                      <Td><Badge color={VERIF_BADGE[a.verif_status || 'belum']}>{VERIF_LABEL[a.verif_status || 'belum']}</Badge></Td>
                      <Td><div className="flex justify-end">{ok ? <Button size="sm" variant="outline" onClick={() => openCetak('kia', a.id)}><Printer className="h-3.5 w-3.5" /> Cetak KIA</Button> : <span className="text-[11px] text-[var(--color-ink-soft)]">belum disahkan</span>}</div></Td>
                    </Tr>
                  )
                })}
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
