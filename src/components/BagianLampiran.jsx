import { useEffect, useState, useCallback } from 'react'
import { FileText, Upload, Download, Trash2, FileInput } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { SectionCard, Button, Table, Tr, Td, EmptyState } from './ui'
import { docxToHtml, bisaEkstrakDocx } from '../lib/docxImport'

// Lampiran dokumen sumber per bagian kurikulum (Islam Plus / KOSP).
// Unggah & simpan berkas (seperti dokumen ijazah), unduh, hapus, dan — untuk
// .docx — "Ambil isi" yang mengekstrak isi dokumen ke editor bagian.
const BUCKET = 'kurikulum-files'

export default function BagianLampiran({ dokumen, schoolId, bagianKode, canManage, bisaEkstrak, employee, onAmbilIsi }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

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
      nama_file: file.name, file_url: path,
      diunggah_oleh: employee?.id || null, diunggah_nama: employee?.nama || null,
    })
    setBusy(false)
    if (insErr) { setMsg('Gagal menyimpan catatan: ' + insErr.message); return }
    setMsg('Dokumen terunggah.')
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

  return (
    <SectionCard
      title="Dokumen Sumber (Lampiran)"
      description="Unggah dokumen yang sudah dibuat (mis. .docx). Untuk berkas .docx, isinya dapat diambil langsung ke editor isi bagian."
    >
      {canManage && (
        <div className="mb-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[var(--color-border)] bg-white px-3.5 py-1.5 text-[13px] font-medium text-[var(--color-ink)] hover:bg-[var(--color-paper)]">
            <Upload className="h-4 w-4" /> {busy ? 'Memproses…' : 'Unggah Dokumen'}
            <input type="file" className="hidden" onChange={handleUpload} disabled={busy} />
          </label>
        </div>
      )}
      {msg && <p className="mb-3 rounded-[10px] bg-[var(--color-paper)] px-3 py-2 text-[13px] text-[var(--color-ink)]">{msg}</p>}
      {loading ? (
        <p className="text-[13px] text-[var(--color-ink-soft)]">Memuat…</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={FileText} title="Belum ada lampiran" description="Unggah dokumen sumber di sini bila sudah ada." />
      ) : (
        <div className="overflow-x-auto">
          <Table columns={['Berkas', 'Diunggah', '']}>
            {rows.map((r) => (
              <Tr key={r.id}>
                <Td className="font-medium text-[var(--color-ink)]">
                  {r.nama_file}
                  {bisaEkstrakDocx(r.nama_file) && <span className="ml-2 rounded-full bg-[var(--color-navy-50)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-navy)]">.docx</span>}
                </Td>
                <Td className="text-[13px] text-[var(--color-ink-soft)]">{r.diunggah_nama || '—'}</Td>
                <Td className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    {bisaEkstrak && canManage && bisaEkstrakDocx(r.nama_file) && (
                      <Button size="sm" variant="outline" onClick={() => handleAmbil(r)} disabled={busy}><FileInput className="h-4 w-4" /> Ambil isi</Button>
                    )}
                    <button onClick={() => handleDownload(r)} className="text-[var(--color-navy)] hover:text-[var(--color-navy-light)]" aria-label="Unduh"><Download className="h-4 w-4" /></button>
                    {canManage && <button onClick={() => handleDelete(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus"><Trash2 className="h-4 w-4" /></button>}
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
