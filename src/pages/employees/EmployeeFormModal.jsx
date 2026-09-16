import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { Modal, Input, Select, Button } from '../../components/ui'
import { STATUS_KEPEGAWAIAN_OPTIONS, EMPLOYEE_STATUS_OPTIONS } from '../../lib/format'

const emptyForm = {
  nama: '', nik: '', nip: '', jenis_kelamin: 'L', tempat_lahir: '', tanggal_lahir: '',
  alamat: '', no_hp: '', email: '', school_id: '', department_id: '', position_id: '',
  status_kepegawaian: 'Kontrak', status: 'aktif', tanggal_masuk: '', pendidikan_terakhir: '',
}

export default function EmployeeFormModal({ open, onClose, onSaved, schools, initialData = null }) {
  const [form, setForm] = useState(emptyForm)
  const [departments, setDepartments] = useState([])
  const [positions, setPositions] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setForm(initialData ? mapInitial(initialData) : emptyForm)
      setError('')
    }
  }, [open, initialData])

  useEffect(() => {
    supabase.from('positions').select('id, nama, jenis').order('nama').then(({ data }) => setPositions(data || []))
  }, [])

  useEffect(() => {
    const load = async () => {
      const query = supabase.from('departments').select('id, nama, school_id').order('nama')
      const { data } = form.school_id
        ? await query.or(`school_id.eq.${form.school_id},school_id.is.null`)
        : await query
      setDepartments(data || [])
    }
    load()
  }, [form.school_id])

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    const payload = {
      ...form,
      school_id: form.school_id || null,
      department_id: form.department_id || null,
      position_id: form.position_id || null,
      tanggal_lahir: form.tanggal_lahir || null,
      tanggal_masuk: form.tanggal_masuk || null,
      nip: form.nip || null,
    }
    const query = initialData
      ? supabase.from('employees').update(payload).eq('id', initialData.id)
      : supabase.from('employees').insert(payload)
    const { error: err } = await query
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title={initialData ? 'Ubah Data Pegawai' : 'Tambah Pegawai Baru'} width="max-w-2xl">
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Nama Lengkap" required value={form.nama} onChange={update('nama')} containerClassName="sm:col-span-2" />
        <Input label="NIP (opsional)" value={form.nip} onChange={update('nip')} />
        <Input label="NIK" value={form.nik} onChange={update('nik')} />
        <Select label="Jenis Kelamin" value={form.jenis_kelamin} onChange={update('jenis_kelamin')}>
          <option value="L">Laki-laki</option>
          <option value="P">Perempuan</option>
        </Select>
        <Input label="Tanggal Lahir" type="date" value={form.tanggal_lahir} onChange={update('tanggal_lahir')} />
        <Input label="Tempat Lahir" value={form.tempat_lahir} onChange={update('tempat_lahir')} />
        <Input label="No. HP" value={form.no_hp} onChange={update('no_hp')} />
        <Input label="Email" type="email" value={form.email} onChange={update('email')} />
        <Input label="Pendidikan Terakhir" value={form.pendidikan_terakhir} onChange={update('pendidikan_terakhir')} placeholder="S1 Pendidikan Guru SD" />
        <Input label="Alamat" value={form.alamat} onChange={update('alamat')} containerClassName="sm:col-span-2" />

        <Select label="Unit Sekolah" value={form.school_id} onChange={update('school_id')}>
          <option value="">— Kantor Yayasan Pusat —</option>
          {schools.map((s) => (
            <option key={s.id} value={s.id}>{s.jenjang} — {s.nama}</option>
          ))}
        </Select>
        <Select label="Unit Kerja / Departemen" value={form.department_id} onChange={update('department_id')}>
          <option value="">— Pilih —</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.nama}</option>
          ))}
        </Select>
        <Select label="Jabatan" value={form.position_id} onChange={update('position_id')}>
          <option value="">— Pilih —</option>
          {positions.map((p) => (
            <option key={p.id} value={p.id}>{p.nama}</option>
          ))}
        </Select>
        <Input label="Tanggal Masuk Kerja" type="date" value={form.tanggal_masuk} onChange={update('tanggal_masuk')} />
        <Select label="Status Kepegawaian" value={form.status_kepegawaian} onChange={update('status_kepegawaian')}>
          {STATUS_KEPEGAWAIAN_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Select label="Status" value={form.status} onChange={update('status')}>
          {EMPLOYEE_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>

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
  return {
    nama: d.nama || '', nik: d.nik || '', nip: d.nip || '', jenis_kelamin: d.jenis_kelamin || 'L',
    tempat_lahir: d.tempat_lahir || '', tanggal_lahir: d.tanggal_lahir || '',
    alamat: d.alamat || '', no_hp: d.no_hp || '', email: d.email || '',
    school_id: d.school_id || '', department_id: d.department_id || '', position_id: d.position_id || '',
    status_kepegawaian: d.status_kepegawaian || 'Kontrak', status: d.status || 'aktif',
    tanggal_masuk: d.tanggal_masuk || '', pendidikan_terakhir: d.pendidikan_terakhir || '',
  }
}
