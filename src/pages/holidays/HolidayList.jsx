import { useEffect, useState, useCallback } from 'react'
import { CalendarOff, Plus, Pencil, Trash2, ShieldAlert, Check, X } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, Card, Button, Table, Tr, Td, Badge, EmptyState, FullPageSpinner, Modal, Input, Select } from '../../components/ui'
import { formatDate, STATUS_BADGE_COLOR } from '../../lib/format'

const STATUS_LABEL = { diajukan: 'Menunggu', disetujui: 'Disetujui', ditolak: 'Ditolak' }

// Kalender Libur — Roadmap B Otomasi #6: hari libur (di luar Minggu) yang
// dikecualikan dari Hari Kerja Wajib pada perhitungan Indeks Kehadiran
// (lihat remunerasi.js: hitungIH/hitungHariKerjaWajibDefault). Hanya
// diseeed dengan libur nasional bertanggal tetap (1 Jan, 17 Agu, 25 Des) —
// libur berbasis kalender Hijriah/lunar (Idul Fitri, Idul Adha, dst.) dan
// libur semester ditambahkan manual oleh admin di sini.
export default function HolidayList() {
  const { isManager, hasFullAccess, managedSchoolIds, can, permsReady, loading: authLoading } = useAuth()
  // Hormati MATRIKS IZIN per-modul (Pengguna & Peran) lebih dulu: peran mana
  // pun yang dicentang 'kalender_libur:lihat' kini benar-benar bisa membuka
  // halaman ini. Bila RPC izin belum siap (DB lama), jatuh ke gerbang peran
  // lama (isManager) agar tidak ada yang kehilangan akses. Aditif — manajemen
  // tetap masuk seperti biasa.
  const bolehKelola = permsReady ? can('kalender_libur', 'lihat') : isManager
  const [rows, setRows] = useState([])
  const [schools, setSchools] = useState([])
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(new Date().getFullYear())
  const [formOpen, setFormOpen] = useState(false)
  const [editingRow, setEditingRow] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: h }, { data: s }] = await Promise.all([
      supabase
        .from('school_holidays')
        .select('*, schools(nama, jenjang)')
        .gte('tanggal', `${year}-01-01`)
        .lte('tanggal', `${year}-12-31`)
        .order('tanggal'),
      supabase.from('schools').select('id, nama, jenjang').order('jenjang'),
    ])
    setRows(h || [])
    setSchools(s || [])
    setLoading(false)
  }, [year])

  useEffect(() => { if (bolehKelola) load() }, [bolehKelola, load])

  if (authLoading) return <FullPageSpinner />
  if (!bolehKelola) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Akses terbatas"
        description="Halaman Kalender Libur hanya dapat diakses oleh Admin Yayasan, HR, Kepala Sekolah, atau Admin Sekolah."
      />
    )
  }

  const handleDelete = async (row) => {
    if (!confirm(`Hapus hari libur "${row.keterangan}" (${formatDate(row.tanggal)})?`)) return
    const { error } = await supabase.from('school_holidays').delete().eq('id', row.id)
    if (error) { alert('Gagal menghapus: ' + error.message); return }
    load()
  }

  // Persetujuan Yayasan atas usulan libur dari Kepala/Admin Sekolah.
  const decide = async (row, status) => {
    const { error } = await supabase.from('school_holidays').update({ status }).eq('id', row.id)
    if (error) { alert('Gagal: ' + error.message); return }
    load()
  }

  const adaUsulan = rows.some((r) => r.status === 'diajukan')

  return (
    <div>
      <PageHeader
        title="Kalender Libur"
        description="Hari libur (di luar Minggu) yang dikecualikan dari Hari Kerja Wajib saat menghitung Indeks Kehadiran & Tunjangan Remunerasi."
        actions={
          <div className="flex items-center gap-2">
            <Select value={year} onChange={(e) => setYear(Number(e.target.value))} containerClassName="w-28">
              {[year - 1, year, year + 1, year + 2].map((y) => <option key={y} value={y}>{y}</option>)}
            </Select>
            <Button onClick={() => { setEditingRow(null); setFormOpen(true) }}><Plus className="h-4 w-4" /> Tambah Libur</Button>
          </div>
        }
      />

      {!hasFullAccess && (
        <p className="mb-4 rounded-lg bg-[var(--color-navy-50)] px-4 py-2.5 text-sm text-[var(--color-ink-soft)]">
          Hari libur yang Anda tambahkan bersifat <b>usulan</b> dan baru berlaku (ikut dihitung pada Indeks Kehadiran & kalender akademik) setelah <b>disetujui Yayasan</b>.
        </p>
      )}
      {hasFullAccess && adaUsulan && (
        <p className="mb-4 rounded-lg bg-[var(--color-gold-soft)] px-4 py-2.5 text-sm text-[var(--color-gold)]">
          Ada usulan hari libur dari unit yang menunggu persetujuan Anda (tombol ✓ / ✕ pada baris berstatus <b>Menunggu</b>).
        </p>
      )}

      <Card padded={false}>
        <div className="p-5">
          {loading ? (
            <FullPageSpinner />
          ) : rows.length === 0 ? (
            <EmptyState icon={CalendarOff} title="Belum ada hari libur tercatat" description={`Tambahkan hari libur untuk tahun ${year} — libur nasional bertanggal tetap sudah terisi otomatis, sisanya (Idul Fitri, Idul Adha, libur semester, dll.) perlu ditambahkan manual.`} />
          ) : (
            <Table columns={['Tanggal', 'Keterangan', 'Cakupan', 'Status', '']}>
              {rows.map((r) => (
                <Tr key={r.id}>
                  <Td className="font-medium text-[var(--color-ink)]">{formatDate(r.tanggal)}</Td>
                  <Td>{r.keterangan}</Td>
                  <Td>
                    {r.school_id ? (
                      <Badge color="navy">{r.schools ? `${r.schools.jenjang} — ${r.schools.nama}` : 'Sekolah'}</Badge>
                    ) : (
                      <Badge color="gold">Seluruh Yayasan</Badge>
                    )}
                  </Td>
                  <Td><Badge color={STATUS_BADGE_COLOR[r.status] || 'neutral'}>{STATUS_LABEL[r.status] || r.status || 'Disetujui'}</Badge></Td>
                  <Td className="flex items-center justify-end gap-2">
                    {hasFullAccess && r.status === 'diajukan' && (
                      <>
                        <button onClick={() => decide(r, 'disetujui')} className="text-[var(--color-ink-soft)] hover:text-[var(--color-success)]" aria-label="Setujui" title="Setujui">
                          <Check className="h-4 w-4" />
                        </button>
                        <button onClick={() => decide(r, 'ditolak')} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Tolak" title="Tolak">
                          <X className="h-4 w-4" />
                        </button>
                      </>
                    )}
                    <button onClick={() => { setEditingRow(r); setFormOpen(true) }} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Ubah">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleDelete(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </Td>
                </Tr>
              ))}
            </Table>
          )}
        </div>
      </Card>

      <HolidayFormModal
        open={formOpen}
        editingRow={editingRow}
        schools={schools}
        hasFullAccess={hasFullAccess}
        managedSchoolIds={managedSchoolIds}
        onClose={() => setFormOpen(false)}
        onSaved={() => { setFormOpen(false); load() }}
      />
    </div>
  )
}

function HolidayFormModal({ open, editingRow, schools, hasFullAccess, managedSchoolIds, onClose, onSaved }) {
  const isEdit = !!editingRow
  const [form, setForm] = useState({ tanggal: '', keterangan: '', school_id: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setForm(editingRow
        ? { tanggal: editingRow.tanggal, keterangan: editingRow.keterangan, school_id: editingRow.school_id || '' }
        // Admin sekolah/kepala sekolah hanya bisa membuat libur untuk sekolah
        // yang menjadi wewenangnya — school_id awal langsung diisi sekolah
        // pertama mereka bila bukan hasFullAccess.
        : { tanggal: '', keterangan: '', school_id: hasFullAccess ? '' : (managedSchoolIds[0] || '') })
      setError('')
    }
  }, [open, editingRow, hasFullAccess, managedSchoolIds])

  const schoolOptions = hasFullAccess ? schools : schools.filter((s) => managedSchoolIds.includes(s.id))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    const payload = {
      tanggal: form.tanggal,
      keterangan: form.keterangan,
      school_id: form.school_id || null,
    }
    const { error: err } = isEdit
      ? await supabase.from('school_holidays').update(payload).eq('id', editingRow.id)
      : await supabase.from('school_holidays').insert(payload)
    setSaving(false)
    if (err) { setError(err.message.includes('duplicate') ? 'Tanggal ini sudah tercatat sebagai libur untuk cakupan yang sama.' : err.message); return }
    onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Ubah Hari Libur' : 'Tambah Hari Libur'}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input label="Tanggal" type="date" required value={form.tanggal} onChange={(e) => setForm((s) => ({ ...s, tanggal: e.target.value }))} />
        <Input label="Keterangan" required placeholder="Idul Fitri, Libur Semester Ganjil, dll." value={form.keterangan} onChange={(e) => setForm((s) => ({ ...s, keterangan: e.target.value }))} />
        <Select label="Cakupan" value={form.school_id} onChange={(e) => setForm((s) => ({ ...s, school_id: e.target.value }))} disabled={!hasFullAccess && schoolOptions.length <= 1}>
          {hasFullAccess && <option value="">Seluruh Yayasan</option>}
          {schoolOptions.map((s) => <option key={s.id} value={s.id}>{s.jenjang} — {s.nama}</option>)}
        </Select>
        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button>
        </div>
      </form>
    </Modal>
  )
}
