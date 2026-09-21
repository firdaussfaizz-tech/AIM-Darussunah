import { useEffect, useState } from 'react'
import { FileText, Trash2, Download, Upload } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { SectionCard, Table, Tr, Td, Button, Modal, Select, EmptyState } from './ui'
import { formatDate, JENIS_DOKUMEN_SISWA_OPTIONS } from '../lib/format'

const BUCKET = 'siswa-files'

export default function StudentDocumentsSection({ siswaId, canManage }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [jenisDokumen, setJenisDokumen] = useState(JENIS_DOKUMEN_SISWA_OPTIONS[0].value)
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('siswa_dokumen').select('*').eq('siswa_id', siswaId).order('uploaded_at', { ascending: false })
    setRows(data || [])
    setLoading(false)
  }

  useEffect(() => { if (siswaId) load() }, [siswaId])

  const handleUpload = async (e) => {
    e.preventDefault()
    if (!file) { setError('Pilih berkas terlebih dahulu.'); return }
    setSaving(true)
    setError('')
    const path = `${siswaId}/${Date.now()}_${file.name.replace(/\s+/g, '_')}`
    const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(path, file)
    if (uploadErr) { setSaving(false); setError(uploadErr.message); return }
    const { error: insertErr } = await supabase.from('siswa_dokumen').insert({
      siswa_id: siswaId,
      jenis_dokumen: jenisDokumen,
      nama_file: file.name,
      file_url: path,
    })
    setSaving(false)
    if (insertErr) { setError(insertErr.message); return }
    setModalOpen(false)
    setFile(null)
    load()
  }

  const handleDownload = async (row) => {
    const { data, error: err } = await supabase.storage.from(BUCKET).createSignedUrl(row.file_url, 60)
    if (err || !data) { alert('Gagal membuka berkas: ' + err?.message); return }
    window.open(data.signedUrl, '_blank')
  }

  const handleDelete = async (row) => {
    if (!confirm(`Hapus dokumen "${row.nama_file}"?`)) return
    const { error: storageErr } = await supabase.storage.from(BUCKET).remove([row.file_url])
    if (storageErr) { alert('Gagal menghapus berkas: ' + storageErr.message); return }
    const { error: dbErr } = await supabase.from('siswa_dokumen').delete().eq('id', row.id)
    if (dbErr) { alert('Berkas terhapus dari penyimpanan, tetapi gagal menghapus catatannya: ' + dbErr.message); return }
    load()
  }

  const jenisLabel = (v) => JENIS_DOKUMEN_SISWA_OPTIONS.find((o) => o.value === v)?.label || v

  return (
    <SectionCard
      title="Dokumen Siswa"
      description="Akta lahir, Kartu Keluarga, ijazah jenjang sebelumnya, foto, dan berkas lainnya"
      actions={canManage && (
        <Button size="sm" variant="outline" onClick={() => setModalOpen(true)}>
          <Upload className="h-4 w-4" /> Unggah
        </Button>
      )}
    >
      {loading ? (
        <p className="text-sm text-[var(--color-ink-soft)]">Memuat…</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={FileText} title="Belum ada dokumen" description="Unggah akta lahir, KK, atau berkas lain di sini." />
      ) : (
        <Table columns={['Jenis Dokumen', 'Nama Berkas', 'Diunggah', '']}>
          {rows.map((r) => (
            <Tr key={r.id}>
              <Td className="font-medium text-[var(--color-ink)]">{jenisLabel(r.jenis_dokumen)}</Td>
              <Td className="text-[var(--color-ink-soft)]">{r.nama_file}</Td>
              <Td>{formatDate(r.uploaded_at)}</Td>
              <Td className="flex items-center justify-end gap-2">
                <button onClick={() => handleDownload(r)} className="text-[var(--color-navy)] hover:text-[var(--color-navy-light)]" aria-label="Unduh">
                  <Download className="h-4 w-4" />
                </button>
                {canManage && (
                  <button onClick={() => handleDelete(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </Td>
            </Tr>
          ))}
        </Table>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Unggah Dokumen Siswa">
        <form onSubmit={handleUpload} className="flex flex-col gap-4">
          <Select label="Jenis Dokumen" value={jenisDokumen} onChange={(e) => setJenisDokumen(e.target.value)}>
            {JENIS_DOKUMEN_SISWA_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-[var(--color-ink)]">Berkas</span>
            <input
              type="file"
              required
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm"
            />
          </label>
          {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Mengunggah…' : 'Unggah'}</Button>
          </div>
        </form>
      </Modal>
    </SectionCard>
  )
}
