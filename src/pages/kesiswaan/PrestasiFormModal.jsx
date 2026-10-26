import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { Modal, Input, Select, Textarea, Button } from '../../components/ui'
import { KATEGORI_OPTIONS, TINGKAT_OPTIONS, TINGKAT_LABEL, PERINGKAT_SUGGEST, BIDANG_SUGGEST } from '../../lib/prestasi'

const empty = {
  judul: '', kategori: 'akademik', bidang: '', tingkat: 'sekolah', peringkat: '',
  penyelenggara: '', tanggal: '', lokasi: '', pembina: '', deskripsi: '', tahun_ajaran_id: '',
}

// Form tambah/ubah prestasi. Jika siswaFixed diberikan, siswa dikunci;
// jika tidak, tampilkan pencarian siswa.
export default function PrestasiFormModal({ open, entry, siswaFixed, employeeId, onClose, onSaved }) {
  const isEdit = entry && entry !== 'new'
  const [form, setForm] = useState(empty)
  const [taList, setTaList] = useState([])
  const [siswaId, setSiswaId] = useState(siswaFixed?.id || '')
  const [siswaNama, setSiswaNama] = useState(siswaFixed?.nama_lengkap || '')
  const [cari, setCari] = useState('')
  const [hasil, setHasil] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }))

  useEffect(() => {
    if (!open) return
    setError('')
    supabase.from('tahun_ajaran').select('id, nama, status').order('nama', { ascending: false }).then(({ data }) => {
      setTaList(data || [])
      if (!isEdit) {
        const aktif = (data || []).find((t) => t.status === 'aktif')
        setForm((s) => ({ ...s, tahun_ajaran_id: aktif?.id || '' }))
      }
    })
    if (isEdit) {
      setForm({
        judul: entry.judul || '', kategori: entry.kategori || 'akademik', bidang: entry.bidang || '',
        tingkat: entry.tingkat || 'sekolah', peringkat: entry.peringkat || '', penyelenggara: entry.penyelenggara || '',
        tanggal: entry.tanggal || '', lokasi: entry.lokasi || '', pembina: entry.pembina || '',
        deskripsi: entry.deskripsi || '', tahun_ajaran_id: entry.tahun_ajaran_id || '',
      })
      setSiswaId(entry.siswa_id)
      setSiswaNama(entry.siswa?.nama_lengkap || '')
    } else {
      setForm(empty)
      setSiswaId(siswaFixed?.id || '')
      setSiswaNama(siswaFixed?.nama_lengkap || '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const doCari = useCallback(async (q) => {
    if (!q || q.trim().length < 2) { setHasil([]); return }
    const { data } = await supabase.from('siswa').select('id, nama_lengkap, nis, schools!school_id(jenjang, nama)')
      .ilike('nama_lengkap', `%${q.trim()}%`).eq('status', 'aktif').limit(15)
    setHasil(data || [])
  }, [])

  if (!open) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!siswaId) { setError('Pilih siswa dulu.'); return }
    if (!form.judul.trim()) { setError('Isi judul/nama prestasi.'); return }
    setSaving(true)
    const payload = {
      siswa_id: siswaId,
      judul: form.judul.trim(), kategori: form.kategori, bidang: form.bidang.trim() || null,
      tingkat: form.tingkat, peringkat: form.peringkat.trim() || null, penyelenggara: form.penyelenggara.trim() || null,
      tanggal: form.tanggal || null, lokasi: form.lokasi.trim() || null, pembina: form.pembina.trim() || null,
      deskripsi: form.deskripsi.trim() || null, tahun_ajaran_id: form.tahun_ajaran_id || null,
    }
    const query = isEdit
      ? supabase.from('prestasi_siswa').update(payload).eq('id', entry.id)
      : supabase.from('prestasi_siswa').insert({ ...payload, dicatat_oleh: employeeId || null })
    const { error: err } = await query
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Ubah Prestasi' : 'Tambah Prestasi'} width="max-w-2xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {!siswaFixed && !isEdit && (
          <div className="rounded-md border border-[var(--color-border)] p-3">
            {siswaId ? (
              <div className="flex items-center justify-between">
                <span className="text-sm">Siswa: <b>{siswaNama}</b></span>
                <button type="button" onClick={() => { setSiswaId(''); setSiswaNama('') }} className="text-xs font-medium text-[var(--color-navy)] hover:underline">Ganti</button>
              </div>
            ) : (
              <div>
                <Input label="Cari Siswa" value={cari} onChange={(e) => { setCari(e.target.value); doCari(e.target.value) }} placeholder="Ketik nama siswa (min. 2 huruf)…" />
                {hasil.length > 0 && (
                  <div className="mt-2 flex max-h-44 flex-col gap-1 overflow-y-auto">
                    {hasil.map((s) => (
                      <button type="button" key={s.id} onClick={() => { setSiswaId(s.id); setSiswaNama(s.nama_lengkap); setHasil([]); setCari('') }}
                        className="flex items-center justify-between rounded border border-[var(--color-border)] px-2 py-1.5 text-left text-sm hover:border-[var(--color-navy)]">
                        <span>{s.nama_lengkap}</span>
                        <span className="text-xs text-[var(--color-ink-soft)]">{s.schools ? `${s.schools.jenjang} — ${s.schools.nama}` : ''}{s.nis ? ` · ${s.nis}` : ''}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <Input label="Judul / Nama Prestasi" required value={form.judul} onChange={set('judul')} placeholder="mis. Juara 1 Olimpiade Matematika" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select label="Kategori" value={form.kategori} onChange={set('kategori')}>
            {KATEGORI_OPTIONS.map((k) => <option key={k.v} value={k.v}>{k.l}</option>)}
          </Select>
          <>
            <Input label="Bidang" value={form.bidang} onChange={set('bidang')} list="bidang-suggest" placeholder="mis. Matematika, Tahfidz" />
            <datalist id="bidang-suggest">{BIDANG_SUGGEST.map((b) => <option key={b} value={b} />)}</datalist>
          </>
          <Select label="Tingkat" value={form.tingkat} onChange={set('tingkat')}>
            {TINGKAT_OPTIONS.map((t) => <option key={t} value={t}>{TINGKAT_LABEL[t]}</option>)}
          </Select>
          <>
            <Input label="Peringkat / Capaian" value={form.peringkat} onChange={set('peringkat')} list="peringkat-suggest" placeholder="mis. Juara 1, Medali Emas" />
            <datalist id="peringkat-suggest">{PERINGKAT_SUGGEST.map((p) => <option key={p} value={p} />)}</datalist>
          </>
          <Input label="Penyelenggara" value={form.penyelenggara} onChange={set('penyelenggara')} placeholder="mis. Kemenag Kab." />
          <Input label="Tanggal" type="date" value={form.tanggal} onChange={set('tanggal')} />
          <Input label="Lokasi" value={form.lokasi} onChange={set('lokasi')} />
          <Input label="Guru Pembina" value={form.pembina} onChange={set('pembina')} />
          <Select label="Tahun Ajaran" value={form.tahun_ajaran_id} onChange={set('tahun_ajaran_id')}>
            <option value="">—</option>
            {taList.map((t) => <option key={t.id} value={t.id}>{t.nama}{t.status === 'aktif' ? ' (Aktif)' : ''}</option>)}
          </Select>
        </div>
        <Textarea label="Deskripsi (opsional)" value={form.deskripsi} onChange={set('deskripsi')} rows={2} />
        <p className="text-xs text-[var(--color-ink-soft)]">Poin prestasi dihitung otomatis dari tingkat &amp; capaian (untuk rekap analitik/KPI).</p>
        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button>
        </div>
      </form>
    </Modal>
  )
}
