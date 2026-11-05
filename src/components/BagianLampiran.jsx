import { useEffect, useState, useCallback, useRef, forwardRef, useImperativeHandle } from 'react'
import { FileText, Download, Trash2, FileInput, CheckCircle2, XCircle, Clock, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { SectionCard, Button, Table, Tr, Td, EmptyState, Badge, Textarea } from './ui'
import { docxToHtml, bisaEkstrakDocx } from '../lib/docxImport'

// Lampiran dokumen sumber per bagian kurikulum (Islam Plus / KOSP).
// Dokumen diunggah sebagai AJUAN (status 'diajukan') → Admin Yayasan
// Tetapkan (acc) / Tolak. Tombol unggah dipicu dari luar (baris aksi editor)
// lewat ref.openPicker(). Untuk .docx tersedia "Ambil isi" ke editor bagian.
const BUCKET = 'kurikulum-files'

const STATUS_META = {
  diajukan: { label: 'Diajukan', color: 'gold', icon: Clock },
  ditetapkan: { label: 'Ditetapkan', color: 'success', icon: CheckCircle2 },
  ditolak: { label: 'Ditolak', color: 'danger', icon: XCircle },
}

function BagianLampiran({ dokumen, schoolId, bagianKode, canManage, bisaEkstrak, isYayasan, employee, onAmbilIsi }, ref) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [reviuFor, setReviuFor] = useState(null) // lampiran yang sedang ditolak (isi catatan)
  const [reviuNote, setReviuNote] = useState('')
  const inputRef = useRef(null)

  useImperativeHandle(ref, () => ({ openPicker: () => inputRef.current?.click() }), [])

  const load = useCallback(async () => {
    if (!schoolId) { setRows([]); setLoading(false); return }
    setLoading(true)
    const { data } = await supabase.from('kurikulum_lampiran').select('*')
      .eq('dokumen', dokumen).eq('school_id', schoolId).eq('bagian_kode', bagianKode)
      .order('created_at', { ascending: false })
    setRows(data || [])
    setLoading(false)
  }, [dokumen, schoolId, bagianKode])
  useEffect(() => { load() }, [load])

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true); setMsg('')
    const path = `${dokumen}/${schoolId}/${bagianKode}/${Date.now()}_${file.name.replace(/\s+/g, '_')}`
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file)
    if (upErr) { setBusy(false); setMsg('Gagal mengunggah: ' + upErr.message); return }
    const { error: insErr } = await supabase.from('kurikulum_lampiran').insert({
      dokumen, school_id: schoolId, bagian_kode: bagianKode,
      nama_file: file.name, file_url: path, status: 'diajukan',
      diunggah_oleh: employee?.id || null, diunggah_nama: employee?.nama || null,
    })
    setBusy(false)
    if (insErr) { setMsg('Gagal menyimpan catatan: ' + insErr.message); return }
    setMsg('Dokumen terunggah sebagai ajuan. Menunggu penetapan Yayasan.')
    load()
  }

  const handleDownload = async (r) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(r.file_url, 120)
    if (error || !data) { setMsg('Gagal membuka berkas: ' + (error?.message || '')); return }
    window.open(data.signedUrl, '_blank')
  }

  const handleDelete = async (r) => {
    if (!window.confirm(`Hapus lampiran "${r.nama_file}"?`)) return
    setBusy(true)
    await supabase.storage.from(BUCKET).remove([r.file_url])
    const { error } = await supabase.from('kurikulum_lampiran').delete().eq('id', r.id)
    setBusy(false)
    if (error) { setMsg('Gagal menghapus: ' + error.message); return }
    load()
  }

  const putuskan = async (r, keputusan) => {
    if (keputusan === 'ditolak' && reviuFor === r.id && !reviuNote.trim()) { setMsg('Mohon isi catatan alasan penolakan.'); return }
    setBusy(true); setMsg('')
    const { error } = await supabase.from('kurikulum_lampiran').update({
      status: keputusan,
      catatan_reviu: keputusan === 'ditolak' ? (reviuNote || null) : null,
      direviu_oleh: employee?.id || null,
      direviu_nama: employee?.nama || null,
      direviu_at: new Date().toISOString(),
    }).eq('id', r.id)
    setBusy(false)
    if (error) { setMsg('Gagal: ' + error.message); return }
    setReviuFor(null); setReviuNote('')
    load()
  }

  const handleAmbil = async (r) => {
    setBusy(true); setMsg('')
    try {
      const { data, error } = await supabase.storage.from(BUCKET).download(r.file_url)
      if (error || !data) throw new Error(error?.message || 'gagal mengunduh berkas')
      const html = await docxToHtml(await data.arrayBuffer())
      if (!html.trim()) { setMsg('Dokumen tidak berisi teks yang dapat diekstrak.'); return }
      onAmbilIsi(html)
      setMsg('Isi dokumen dimuat ke editor. Periksa, rapikan bila perlu, lalu Simpan Draft / Ajukan.')
    } catch (err) { setMsg('Gagal mengekstrak: ' + err.message) }
    finally { setBusy(false) }
  }

  const StatusBadge = ({ status }) => {
    const m = STATUS_META[status] || STATUS_META.diajukan
    const Icon = m.icon
    return <Badge color={m.color}><Icon className="mr-1 inline h-3.5 w-3.5" />{m.label}</Badge>
  }

  return (
    <SectionCard
      title="Dokumen Sumber (Lampiran)"
      description="Dokumen yang diunggah bersifat ajuan ke Yayasan dan harus ditetapkan (acc) terlebih dahulu. Untuk berkas .docx, isinya dapat diambil ke editor isi bagian."
    >
      {/* Input file tersembunyi — dipicu dari tombol pada baris aksi editor. */}
      <input ref={inputRef} type="file" className="hidden" onChange={handleUpload} disabled={busy} />
      {msg && <p className="mb-3 rounded-[10px] bg-[var(--color-paper)] px-3 py-2 text-[13px] text-[var(--color-ink)]">{msg}</p>}
      {loading ? (
        <p className="text-[13px] text-[var(--color-ink-soft)]">Memuat…</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={FileText} title="Belum ada lampiran" description="Gunakan tombol Unggah Dokumen (di atas, dekat Simpan/Ajukan) untuk mengunggah dokumen sumber." />
      ) : (
        <div className="overflow-x-auto">
          <Table columns={['Berkas', 'Status', 'Diunggah', '']}>
            {rows.map((r) => (
              <Tr key={r.id}>
                <Td className="font-medium text-[var(--color-ink)]">
                  {r.nama_file}
                  {bisaEkstrakDocx(r.nama_file) && <span className="ml-2 rounded-full bg-[var(--color-navy-50)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-navy)]">.docx</span>}
                  {r.status === 'ditolak' && r.catatan_reviu && <span className="mt-0.5 block text-[12px] text-[var(--color-danger)]">Ditolak: {r.catatan_reviu}</span>}
                </Td>
                <Td><StatusBadge status={r.status} /></Td>
                <Td className="text-[13px] text-[var(--color-ink-soft)]">{r.diunggah_nama || '—'}</Td>
                <Td className="text-right">
                  <div className="flex flex-col items-end gap-1.5">
                    <div className="flex items-center justify-end gap-2">
                      {bisaEkstrak && canManage && bisaEkstrakDocx(r.nama_file) && (
                        <Button size="sm" variant="outline" onClick={() => handleAmbil(r)} disabled={busy}><FileInput className="h-4 w-4" /> Ambil isi</Button>
                      )}
                      <button onClick={() => handleDownload(r)} className="text-[var(--color-navy)] hover:text-[var(--color-navy-light)]" aria-label="Unduh"><Download className="h-4 w-4" /></button>
                      {canManage && <button onClick={() => handleDelete(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus"><Trash2 className="h-4 w-4" /></button>}
                    </div>
                    {isYayasan && r.status === 'diajukan' && (
                      reviuFor === r.id ? (
                        <div className="flex w-full max-w-xs flex-col gap-1.5">
                          <Textarea rows={2} placeholder="Catatan alasan penolakan…" value={reviuNote} onChange={(e) => setReviuNote(e.target.value)} />
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="ghost" onClick={() => { setReviuFor(null); setReviuNote('') }}>Batal</Button>
                            <Button size="sm" variant="danger" onClick={() => putuskan(r, 'ditolak')} disabled={busy}>Tolak</Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <ShieldCheck className="h-4 w-4 text-[var(--color-navy)]" />
                          <Button size="sm" onClick={() => putuskan(r, 'ditetapkan')} disabled={busy}><CheckCircle2 className="h-4 w-4" /> Tetapkan</Button>
                          <Button size="sm" variant="danger" onClick={() => setReviuFor(r.id)} disabled={busy}><XCircle className="h-4 w-4" /> Tolak</Button>
                        </div>
                      )
                    )}
                  </div>
                </Td>
              </Tr>
            ))}
          </Table>
        </div>
      )}
    </SectionCard>
  )
}

export default forwardRef(BagianLampiran)
