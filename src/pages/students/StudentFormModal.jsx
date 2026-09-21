import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { Modal, Input, Select, Button } from '../../components/ui'
import { SISWA_STATUS_OPTIONS, SISWA_STATUS_LABELS } from '../../lib/format'

const emptyForm = {
  nama_lengkap: '', nama_panggilan: '', nis: '', nisn: '', nik: '', jenis_kelamin: 'L',
  tempat_lahir: '', tanggal_lahir: '', agama: '', alamat: '', anak_ke: '', jumlah_saudara: '',
  school_id: '', status: 'aktif',
  nama_ayah: '', nik_ayah: '', tahun_lahir_ayah: '', pendidikan_ayah: '', pekerjaan_ayah: '', no_hp_ayah: '',
  nama_ibu: '', nik_ibu: '', tahun_lahir_ibu: '', pendidikan_ibu: '', pekerjaan_ibu: '', no_hp_ibu: '',
  nama_wali: '', hubungan_wali: '', no_hp_wali: '',
  email_ortu: '', catatan: '',
}

// Kolom numerik/tanggal yang harus dikirim sebagai null (bukan string
// kosong) kalau tidak diisi, supaya tidak ditolak Postgres.
const NUMERIC_OR_DATE_FIELDS = ['tanggal_lahir', 'anak_ke', 'jumlah_saudara', 'tahun_lahir_ayah', 'tahun_lahir_ibu']

export default function StudentFormModal({ open, onClose, onSaved, schools, initialData = null }) {
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setForm(initialData ? mapInitial(initialData) : emptyForm)
      setError('')
    }
  }, [open, initialData])

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    const payload = { ...form }
    for (const key of NUMERIC_OR_DATE_FIELDS) {
      payload[key] = payload[key] === '' ? null : payload[key]
    }
    payload.school_id = payload.school_id || null
    payload.nis = payload.nis || null
    payload.nisn = payload.nisn || null

    const query = initialData
      ? supabase.from('siswa').update(payload).eq('id', initialData.id)
      : supabase.from('siswa').insert(payload)
    const { error: err } = await query
    setSaving(false)
    if (err) {
      setError(
        err.message.includes('siswa_nisn_unik_idx') ? 'NISN ini sudah dipakai siswa lain.' :
        err.message.includes('siswa_nis_per_sekolah_idx') ? 'NIS ini sudah dipakai siswa lain di unit sekolah yang sama.' :
        err.message
      )
      return
    }
    onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title={initialData ? 'Ubah Data Siswa' : 'Tambah Siswa Baru'} width="max-w-3xl">
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <p className="sm:col-span-2 text-[13px] font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">Data Siswa</p>
        <Input label="Nama Lengkap" required value={form.nama_lengkap} onChange={update('nama_lengkap')} containerClassName="sm:col-span-2" />
        <Input label="Nama Panggilan" value={form.nama_panggilan} onChange={update('nama_panggilan')} />
        <Select label="Unit Sekolah" value={form.school_id} onChange={update('school_id')}>
          <option value="">— Pilih —</option>
          {schools.map((s) => (
            <option key={s.id} value={s.id}>{s.jenjang} — {s.nama}</option>
          ))}
        </Select>
        <Input label="NIS (opsional)" value={form.nis} onChange={update('nis')} />
        <Input label="NISN" value={form.nisn} onChange={update('nisn')} placeholder="10 digit sesuai Dapodik" />
        <Input label="NIK" value={form.nik} onChange={update('nik')} />
        <Select label="Jenis Kelamin" value={form.jenis_kelamin} onChange={update('jenis_kelamin')}>
          <option value="L">Laki-laki</option>
          <option value="P">Perempuan</option>
        </Select>
        <Input label="Tempat Lahir" value={form.tempat_lahir} onChange={update('tempat_lahir')} />
        <Input label="Tanggal Lahir" type="date" value={form.tanggal_lahir} onChange={update('tanggal_lahir')} />
        <Input label="Agama" value={form.agama} onChange={update('agama')} />
        <Input label="Anak ke-" type="number" min="1" value={form.anak_ke} onChange={update('anak_ke')} />
        <Input label="Jumlah Saudara" type="number" min="0" value={form.jumlah_saudara} onChange={update('jumlah_saudara')} />
        <Select label="Status" value={form.status} onChange={update('status')}>
          {SISWA_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{SISWA_STATUS_LABELS[s]}</option>)}
        </Select>
        <Input label="Alamat" value={form.alamat} onChange={update('alamat')} containerClassName="sm:col-span-2" />

        <p className="sm:col-span-2 mt-2 text-[13px] font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">Data Ayah</p>
        <Input label="Nama Ayah" value={form.nama_ayah} onChange={update('nama_ayah')} />
        <Input label="NIK Ayah" value={form.nik_ayah} onChange={update('nik_ayah')} />
        <Input label="Tahun Lahir Ayah" type="number" value={form.tahun_lahir_ayah} onChange={update('tahun_lahir_ayah')} />
        <Input label="Pendidikan Ayah" value={form.pendidikan_ayah} onChange={update('pendidikan_ayah')} />
        <Input label="Pekerjaan Ayah" value={form.pekerjaan_ayah} onChange={update('pekerjaan_ayah')} />
        <Input label="No. HP Ayah" value={form.no_hp_ayah} onChange={update('no_hp_ayah')} />

        <p className="sm:col-span-2 mt-2 text-[13px] font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">Data Ibu</p>
        <Input label="Nama Ibu" value={form.nama_ibu} onChange={update('nama_ibu')} />
        <Input label="NIK Ibu" value={form.nik_ibu} onChange={update('nik_ibu')} />
        <Input label="Tahun Lahir Ibu" type="number" value={form.tahun_lahir_ibu} onChange={update('tahun_lahir_ibu')} />
        <Input label="Pendidikan Ibu" value={form.pendidikan_ibu} onChange={update('pendidikan_ibu')} />
        <Input label="Pekerjaan Ibu" value={form.pekerjaan_ibu} onChange={update('pekerjaan_ibu')} />
        <Input label="No. HP Ibu" value={form.no_hp_ibu} onChange={update('no_hp_ibu')} />

        <p className="sm:col-span-2 mt-2 text-[13px] font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">Data Wali (isi hanya jika bukan diasuh orang tua kandung)</p>
        <Input label="Nama Wali" value={form.nama_wali} onChange={update('nama_wali')} />
        <Input label="Hubungan dengan Siswa" value={form.hubungan_wali} onChange={update('hubungan_wali')} placeholder="Kakek, Paman, dll." />
        <Input label="No. HP Wali" value={form.no_hp_wali} onChange={update('no_hp_wali')} />

        <p className="sm:col-span-2 mt-2 text-[13px] font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">Lainnya</p>
        <Input
          label="Email Orang Tua (untuk notifikasi)"
          type="email"
          value={form.email_ortu}
          onChange={update('email_ortu')}
          containerClassName="sm:col-span-2"
          placeholder="Dipakai untuk kirim notifikasi presensi, tagihan, dan rapor"
        />
        <Input label="Catatan" value={form.catatan} onChange={update('catatan')} containerClassName="sm:col-span-2" />

        {error && <p className="sm:col-span-2 rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}

        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button>
        </div>
      </form>
    </Modal>
  )
}

function mapInitial(d) {
  const out = { ...emptyForm }
  for (const key of Object.keys(emptyForm)) {
    out[key] = d[key] ?? emptyForm[key]
  }
  return out
}
