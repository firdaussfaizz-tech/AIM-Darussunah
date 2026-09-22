import { useEffect, useState, useCallback } from 'react'
import { CalendarRange, Plus, Pencil, Trash2, Users2, CheckCircle2, School, ArrowUpCircle } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, SectionCard, Button, Badge, Table, Tr, Td, Modal, Input, Select, EmptyState, FullPageSpinner } from '../../components/ui'

const TABS = ['Tahun Ajaran', 'Rombel / Kelas', 'Kenaikan Kelas']

export default function AcademicSettings() {
  const { isManager, hasFullAccess, managedSchoolIds, loading: authLoading } = useAuth()
  const [tab, setTab] = useState('Tahun Ajaran')
  const [tahunAjaran, setTahunAjaran] = useState([])
  const [schools, setSchools] = useState([])
  const [employees, setEmployees] = useState([])
  const [rombel, setRombel] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: ta }, { data: s }, { data: emp }, { data: r }, { data: enrollments }] = await Promise.all([
      supabase.from('tahun_ajaran').select('*').order('nama', { ascending: false }),
      supabase.from('schools').select('id, nama, jenjang').order('jenjang'),
      // positions!position_id(jenis) & employee_tugas_tambahan(tugas_tambahan(nama))
      // dipakai untuk menyaring dropdown Wali Kelas di tab Rombel/Kelas —
      // hanya pegawai berjabatan Guru YANG SUDAH ditetapkan tugas tambahan
      // "Wali Kelas" di data Kepegawaian (menu Detail Pegawai > Tugas
      // Tambahan) yang boleh dipilih, sesuai data Kepegawaian yang sebenarnya.
      supabase
        .from('employees')
        .select('id, nama, positions!position_id(jenis), employee_tugas_tambahan(tugas_tambahan(nama))')
        .eq('status', 'aktif').order('nama'),
      supabase
        .from('rombel')
        .select('*, schools!school_id(nama, jenjang), tahun_ajaran(nama), employees!wali_kelas_employee_id(nama)')
        .order('tingkat'),
      // Jumlah siswa per rombel dihitung di sisi klien (bukan lewat embed
      // `relation(count)` PostgREST) supaya tidak bergantung pada fitur
      // agregat PostgREST yang belum tentu aktif di semua proyek Supabase.
      supabase.from('riwayat_siswa').select('rombel_id'),
    ])
    const jumlahPerRombel = {}
    for (const e of enrollments || []) {
      jumlahPerRombel[e.rombel_id] = (jumlahPerRombel[e.rombel_id] || 0) + 1
    }
    setTahunAjaran(ta || [])
    setSchools(s || [])
    setEmployees(emp || [])
    setRombel((r || []).map((row) => ({ ...row, jumlah_siswa: jumlahPerRombel[row.id] || 0 })))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  if (authLoading || loading) return <FullPageSpinner />

  if (!isManager) {
    return (
      <EmptyState
        icon={CalendarRange}
        title="Halaman ini belum tersedia"
        description="Halaman ini hanya dapat diakses oleh Admin Yayasan, HR, Admin Sekolah, atau Kepala Sekolah."
      />
    )
  }

  // Admin Sekolah / Kepala Sekolah dikunci ke satuan pendidikannya sendiri
  // untuk tab Rombel/Kelas & Kenaikan Kelas. Admin Yayasan/HR tetap bisa
  // memilih/melihat seluruh unit.
  const lockedSchoolId = !hasFullAccess && managedSchoolIds.length > 0 ? managedSchoolIds[0] : null
  const visibleSchools = lockedSchoolId ? schools.filter((s) => s.id === lockedSchoolId) : schools

  return (
    <div>
      <PageHeader
        title="Kelas & Tahun Ajaran"
        description={lockedSchoolId ? 'Kelola rombongan belajar (rombel) di unit Anda.' : 'Kelola tahun ajaran dan rombongan belajar (rombel) di seluruh unit yayasan.'}
      />
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-[var(--color-border)]">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              tab === t ? 'border-[var(--color-navy)] text-[var(--color-navy)]' : 'border-transparent text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Tahun Ajaran' && <TahunAjaranTab tahunAjaran={tahunAjaran} reload={load} hasFullAccess={hasFullAccess} />}
      {tab === 'Rombel / Kelas' && (
        <RombelTab rombel={rombel} schools={visibleSchools} employees={employees} tahunAjaran={tahunAjaran} reload={load} lockedSchoolId={lockedSchoolId} />
      )}
      {tab === 'Kenaikan Kelas' && <KenaikanKelasTab rombel={rombel} schools={visibleSchools} tahunAjaran={tahunAjaran} lockedSchoolId={lockedSchoolId} />}
    </div>
  )
}

// =========================================================================
// TAB: TAHUN AJARAN
// =========================================================================
const emptyTAForm = { nama: '', tanggal_mulai: '', tanggal_selesai: '' }

function TahunAjaranTab({ tahunAjaran, reload, hasFullAccess }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyTAForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const openAdd = () => { setEditingId(null); setForm(emptyTAForm); setError(''); setModalOpen(true) }
  const openEdit = (t) => {
    setEditingId(t.id)
    setForm({ nama: t.nama, tanggal_mulai: t.tanggal_mulai || '', tanggal_selesai: t.tanggal_selesai || '' })
    setError('')
    setModalOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    const payload = {
      nama: form.nama,
      tanggal_mulai: form.tanggal_mulai || null,
      tanggal_selesai: form.tanggal_selesai || null,
    }
    const query = editingId ? supabase.from('tahun_ajaran').update(payload).eq('id', editingId) : supabase.from('tahun_ajaran').insert(payload)
    const { error: err } = await query
    setSaving(false)
    if (err) { setError(err.message.includes('duplicate') ? 'Tahun ajaran ini sudah ada.' : err.message); return }
    setModalOpen(false)
    reload()
  }

  // Hanya boleh satu tahun ajaran aktif: nonaktifkan semua dulu, baru
  // aktifkan yang dipilih (dua langkah, bukan satu transaksi database —
  // cukup aman untuk aksi admin yang jarang dan tidak konkuren).
  const handleActivate = async (id) => {
    if (!confirm('Jadikan tahun ajaran ini yang aktif? Tahun ajaran lain akan otomatis menjadi tidak aktif.')) return
    const { error: err1 } = await supabase.from('tahun_ajaran').update({ status: 'tidak_aktif' }).eq('status', 'aktif')
    if (err1) { alert('Gagal menonaktifkan tahun ajaran sebelumnya: ' + err1.message); return }
    const { error: err2 } = await supabase.from('tahun_ajaran').update({ status: 'aktif' }).eq('id', id)
    if (err2) { alert('Gagal mengaktifkan: ' + err2.message); return }
    reload()
  }

  const handleDelete = async (t) => {
    const { count } = await supabase.from('rombel').select('id', { count: 'exact', head: true }).eq('tahun_ajaran_id', t.id)
    if (count > 0) { alert(`Tidak bisa dihapus — masih ada ${count} rombel yang memakai tahun ajaran ini.`); return }
    if (!confirm(`Hapus tahun ajaran "${t.nama}"?`)) return
    const { error } = await supabase.from('tahun_ajaran').delete().eq('id', t.id)
    if (error) { alert('Gagal menghapus: ' + error.message); return }
    reload()
  }

  return (
    <SectionCard
      title="Tahun Ajaran"
      description={
        hasFullAccess
          ? 'Hanya satu tahun ajaran yang bisa berstatus aktif pada satu waktu.'
          : 'Hanya satu tahun ajaran yang bisa berstatus aktif pada satu waktu. Perubahan hanya dapat dilakukan oleh Admin Yayasan/HR.'
      }
      actions={hasFullAccess && <Button size="sm" variant="outline" onClick={openAdd}><Plus className="h-4 w-4" /> Tambah</Button>}
    >
      {tahunAjaran.length === 0 ? <EmptyState icon={CalendarRange} title="Belum ada tahun ajaran" /> : (
        <Table columns={hasFullAccess ? ['Nama', 'Mulai', 'Selesai', 'Status', ''] : ['Nama', 'Mulai', 'Selesai', 'Status']}>
          {tahunAjaran.map((t) => (
            <Tr key={t.id}>
              <Td className="font-medium">{t.nama}</Td>
              <Td className="text-[var(--color-ink-soft)]">{t.tanggal_mulai || '—'}</Td>
              <Td className="text-[var(--color-ink-soft)]">{t.tanggal_selesai || '—'}</Td>
              <Td>
                {t.status === 'aktif' ? <Badge color="success">Aktif</Badge> : <Badge color="neutral">Tidak Aktif</Badge>}
              </Td>
              {hasFullAccess && (
                <Td className="text-right">
                  <div className="flex justify-end gap-2">
                    {t.status !== 'aktif' && (
                      <button onClick={() => handleActivate(t.id)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-success)]" aria-label="Jadikan Aktif" title="Jadikan Aktif">
                        <CheckCircle2 className="h-4 w-4" />
                      </button>
                    )}
                    <button onClick={() => openEdit(t)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Ubah"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => handleDelete(t)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </Td>
              )}
            </Tr>
          ))}
        </Table>
      )}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Ubah Tahun Ajaran' : 'Tambah Tahun Ajaran'}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input label="Nama" required placeholder="2026/2027" value={form.nama} onChange={(e) => setForm((s) => ({ ...s, nama: e.target.value }))} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Tanggal Mulai" type="date" value={form.tanggal_mulai} onChange={(e) => setForm((s) => ({ ...s, tanggal_mulai: e.target.value }))} />
            <Input label="Tanggal Selesai" type="date" value={form.tanggal_selesai} onChange={(e) => setForm((s) => ({ ...s, tanggal_selesai: e.target.value }))} />
          </div>
          {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button>
          </div>
        </form>
      </Modal>
    </SectionCard>
  )
}

// =========================================================================
// TAB: ROMBEL / KELAS
// =========================================================================
const emptyRombelForm = { school_id: '', tahun_ajaran_id: '', tingkat: '', nama_rombel: '', wali_kelas_employee_id: '', kapasitas: '' }

function RombelTab({ rombel, schools, employees, tahunAjaran, reload, lockedSchoolId }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyRombelForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [rosterRombel, setRosterRombel] = useState(null)

  const tahunAktif = tahunAjaran.find((t) => t.status === 'aktif')

  // Peta pegawai -> daftar rombel yang sudah diampunya sebagai Wali Kelas,
  // dipakai untuk menambahkan keterangan di dropdown Wali Kelas (supaya
  // admin tidak tidak sengaja menugaskan satu guru jadi Wali Kelas di lebih
  // dari satu rombel pada tahun ajaran yang sama).
  const waliKelasAssignments = {}
  for (const r of rombel) {
    if (r.wali_kelas_employee_id) (waliKelasAssignments[r.wali_kelas_employee_id] ||= []).push(r)
  }

  // Dropdown Wali Kelas diintegrasikan dengan modul Kepegawaian: hanya
  // pegawai berjabatan Guru (positions.jenis = 'guru') YANG SUDAH ditetapkan
  // tugas tambahan "Wali Kelas" di Detail Pegawai > Tugas Tambahan yang
  // boleh dipilih — bukan lagi bebas dari seluruh pegawai aktif.
  const isEligibleWaliKelas = (e) =>
    e.positions?.jenis === 'guru' &&
    (e.employee_tugas_tambahan || []).some((t) => (t.tugas_tambahan?.nama || '').toLowerCase().includes('wali kelas'))
  const eligibleWaliKelas = employees.filter(isEligibleWaliKelas)
  // Kalau Wali Kelas yang SUDAH tersimpan di rombel ini ternyata tidak lagi
  // memenuhi syarat (mis. tugas tambahannya sudah dicabut di Kepegawaian,
  // atau jabatannya diubah), tetap ditampilkan di dropdown (ditandai)
  // supaya datanya tidak diam-diam hilang/berubah saat form cuma dibuka.
  const currentWaliKelas = employees.find((e) => e.id === form.wali_kelas_employee_id)
  const waliKelasOptions = currentWaliKelas && !isEligibleWaliKelas(currentWaliKelas)
    ? [...eligibleWaliKelas, currentWaliKelas]
    : eligibleWaliKelas

  const openAdd = () => {
    setEditingId(null)
    setForm({ ...emptyRombelForm, tahun_ajaran_id: tahunAktif?.id || '', school_id: lockedSchoolId || '' })
    setError('')
    setModalOpen(true)
  }
  const openEdit = (r) => {
    setEditingId(r.id)
    setForm({
      school_id: r.school_id, tahun_ajaran_id: r.tahun_ajaran_id, tingkat: r.tingkat || '',
      nama_rombel: r.nama_rombel || '', wali_kelas_employee_id: r.wali_kelas_employee_id || '', kapasitas: r.kapasitas ?? '',
    })
    setError('')
    setModalOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    const payload = {
      school_id: form.school_id, tahun_ajaran_id: form.tahun_ajaran_id, tingkat: form.tingkat, nama_rombel: form.nama_rombel,
      wali_kelas_employee_id: form.wali_kelas_employee_id || null,
      kapasitas: form.kapasitas === '' ? null : Number(form.kapasitas),
    }
    const query = editingId ? supabase.from('rombel').update(payload).eq('id', editingId) : supabase.from('rombel').insert(payload)
    const { error: err } = await query
    setSaving(false)
    if (err) { setError(err.message.includes('duplicate') ? 'Nama rombel ini sudah ada di unit sekolah & tahun ajaran yang sama.' : err.message); return }
    setModalOpen(false)
    reload()
  }

  const handleDelete = async (r) => {
    if (!confirm(`Hapus rombel "${r.nama_rombel}"? Riwayat penempatan siswa di rombel ini akan ikut terhapus.`)) return
    const { error } = await supabase.from('rombel').delete().eq('id', r.id)
    if (error) { alert('Gagal menghapus: ' + error.message); return }
    reload()
  }

  return (
    <SectionCard
      title="Rombongan Belajar (Rombel)"
      description={tahunAktif ? `Menampilkan seluruh rombel — tahun ajaran aktif saat ini: ${tahunAktif.nama}` : 'Belum ada tahun ajaran aktif — atur di tab Tahun Ajaran.'}
      actions={<Button size="sm" variant="outline" onClick={openAdd} disabled={!tahunAktif}><Plus className="h-4 w-4" /> Tambah Rombel</Button>}
    >
      {rombel.length === 0 ? <EmptyState icon={School} title="Belum ada rombel" /> : (
        <Table columns={['Tahun Ajaran', 'Unit', 'Tingkat', 'Nama Rombel', 'Wali Kelas', 'Jumlah Siswa', '']}>
          {rombel.map((r) => (
            <Tr key={r.id}>
              <Td className="text-[var(--color-ink-soft)]">{r.tahun_ajaran?.nama || '—'}</Td>
              <Td>{r.schools ? `${r.schools.jenjang} — ${r.schools.nama}` : '—'}</Td>
              <Td>{r.tingkat}</Td>
              <Td className="font-medium">{r.nama_rombel}</Td>
              <Td className="text-[var(--color-ink-soft)]">{r.employees?.nama || '—'}</Td>
              <Td>{r.jumlah_siswa}{r.kapasitas ? ` / ${r.kapasitas}` : ''}</Td>
              <Td className="text-right">
                <div className="flex justify-end gap-2">
                  <button onClick={() => setRosterRombel(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Kelola Siswa" title="Kelola Siswa">
                    <Users2 className="h-4 w-4" />
                  </button>
                  <button onClick={() => openEdit(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Ubah"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => handleDelete(r)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus"><Trash2 className="h-4 w-4" /></button>
                </div>
              </Td>
            </Tr>
          ))}
        </Table>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Ubah Rombel' : 'Tambah Rombel'}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Select label="Tahun Ajaran" required value={form.tahun_ajaran_id} onChange={(e) => setForm((s) => ({ ...s, tahun_ajaran_id: e.target.value }))}>
            <option value="">— Pilih —</option>
            {tahunAjaran.map((t) => <option key={t.id} value={t.id}>{t.nama}{t.status === 'aktif' ? ' (Aktif)' : ''}</option>)}
          </Select>
          <Select label="Unit Sekolah" required disabled={!!lockedSchoolId} value={form.school_id} onChange={(e) => setForm((s) => ({ ...s, school_id: e.target.value }))}>
            <option value="">— Pilih —</option>
            {schools.map((s) => <option key={s.id} value={s.id}>{s.jenjang} — {s.nama}</option>)}
          </Select>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Tingkat" required placeholder="1, 7, 10, dst." value={form.tingkat} onChange={(e) => setForm((s) => ({ ...s, tingkat: e.target.value }))} />
            <Input label="Nama Rombel" required placeholder="1A, VII-B, X IPA 1" value={form.nama_rombel} onChange={(e) => setForm((s) => ({ ...s, nama_rombel: e.target.value }))} />
          </div>
          <Select label="Wali Kelas" value={form.wali_kelas_employee_id} onChange={(e) => setForm((s) => ({ ...s, wali_kelas_employee_id: e.target.value }))}>
            <option value="">— Belum ditentukan —</option>
            {waliKelasOptions.map((e) => {
              // Rombel LAIN (bukan yang sedang diedit) pada tahun ajaran yang
              // sama tempat guru ini sudah jadi Wali Kelas — supaya admin
              // tahu kalau guru tsb sebenarnya sudah punya tugas tambahan ini.
              const sudahWaliKelas = (waliKelasAssignments[e.id] || []).filter(
                (r) => r.tahun_ajaran_id === form.tahun_ajaran_id && r.id !== editingId
              )
              const tidakEligibleLagi = !isEligibleWaliKelas(e)
              const keterangan = [
                sudahWaliKelas.length > 0 ? `sudah Wali Kelas ${sudahWaliKelas.map((r) => `${r.tingkat} ${r.nama_rombel}`).join(', ')}` : '',
                tidakEligibleLagi ? 'tidak lagi berjabatan Guru + tugas tambahan Wali Kelas di Kepegawaian' : '',
              ].filter(Boolean).join(' · ')
              return <option key={e.id} value={e.id}>{e.nama}{keterangan ? ` — ${keterangan}` : ''}</option>
            })}
          </Select>
          <p className="-mt-2 text-xs text-[var(--color-ink-soft)]">
            Daftar diambil dari data Kepegawaian: pegawai berjabatan Guru yang sudah ditetapkan tugas tambahan "Wali Kelas" (menu Pegawai &gt; Detail Pegawai &gt; Tugas Tambahan).
            {waliKelasOptions.length === 0 && ' Belum ada guru yang memenuhi syarat ini — tetapkan dulu tugas tambahan "Wali Kelas" ke pegawai yang bersangkutan.'}
          </p>
          {form.wali_kelas_employee_id && (waliKelasAssignments[form.wali_kelas_employee_id] || []).some((r) => r.tahun_ajaran_id === form.tahun_ajaran_id && r.id !== editingId) && (
            <p className="-mt-2 text-xs text-[var(--color-gold)]">
              ⚠️ Guru ini sudah menjadi Wali Kelas di rombel lain pada tahun ajaran yang sama. Pastikan ini memang disengaja (satu guru rangkap Wali Kelas) sebelum menyimpan.
            </p>
          )}
          <Input label="Kapasitas (opsional)" type="number" min="1" value={form.kapasitas} onChange={(e) => setForm((s) => ({ ...s, kapasitas: e.target.value }))} />
          {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button>
          </div>
        </form>
      </Modal>

      {rosterRombel && (
        <RosterModal
          rombel={rosterRombel}
          onClose={() => setRosterRombel(null)}
          onSaved={() => { setRosterRombel(null); reload() }}
        />
      )}
    </SectionCard>
  )
}

// Modal "Kelola Siswa" — centang siswa dari unit sekolah yang sama untuk
// ditempatkan ke rombel ini pada tahun ajaran rombel tsb. Siswa yang sudah
// tercatat di rombel LAIN pada tahun ajaran yang sama akan otomatis
// dipindahkan (bukan digandakan) kalau ikut dicentang.
function RosterModal({ rombel, onClose, onSaved }) {
  const [siswaSekolah, setSiswaSekolah] = useState([])
  const [enrollmentMap, setEnrollmentMap] = useState({}) // siswa_id -> { rombel_id, sama_rombel }
  const [selectedIds, setSelectedIds] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [{ data: siswa }, { data: enrollments }] = await Promise.all([
        supabase.from('siswa').select('id, nama_lengkap, nis').eq('school_id', rombel.school_id).eq('status', 'aktif').order('nama_lengkap'),
        supabase.from('riwayat_siswa').select('siswa_id, rombel_id').eq('tahun_ajaran_id', rombel.tahun_ajaran_id),
      ])
      setSiswaSekolah(siswa || [])
      const map = {}
      for (const e of enrollments || []) map[e.siswa_id] = e.rombel_id
      setEnrollmentMap(map)
      setSelectedIds((siswa || []).filter((s) => map[s.id] === rombel.id).map((s) => s.id))
      setLoading(false)
    }
    load()
  }, [rombel])

  const toggle = (id) => setSelectedIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  const handleSave = async () => {
    setSaving(true)
    setError('')
    const originalIds = siswaSekolah.filter((s) => enrollmentMap[s.id] === rombel.id).map((s) => s.id)
    const toRemove = originalIds.filter((id) => !selectedIds.includes(id))
    const toAdd = selectedIds.filter((id) => !originalIds.includes(id))

    if (toRemove.length) {
      const { error: err } = await supabase.from('riwayat_siswa').delete()
        .eq('tahun_ajaran_id', rombel.tahun_ajaran_id).eq('rombel_id', rombel.id).in('siswa_id', toRemove)
      if (err) { setSaving(false); setError(err.message); return }
    }
    if (toAdd.length) {
      // Lepas dulu dari rombel lain (kalau ada) di tahun ajaran yang sama,
      // supaya tidak melanggar unique(siswa_id, tahun_ajaran_id).
      const { error: delErr } = await supabase.from('riwayat_siswa').delete()
        .eq('tahun_ajaran_id', rombel.tahun_ajaran_id).in('siswa_id', toAdd)
      if (delErr) { setSaving(false); setError(delErr.message); return }
      const { error: insErr } = await supabase.from('riwayat_siswa').insert(
        toAdd.map((siswa_id) => ({
          siswa_id, rombel_id: rombel.id, tahun_ajaran_id: rombel.tahun_ajaran_id,
          status: 'aktif', tanggal_masuk: new Date().toISOString().slice(0, 10),
        }))
      )
      if (insErr) { setSaving(false); setError(insErr.message); return }
    }
    setSaving(false)
    onSaved()
  }

  return (
    <Modal open onClose={onClose} title={`Kelola Siswa — ${rombel.tingkat} ${rombel.nama_rombel}`}>
      <div className="flex flex-col gap-4">
        {loading ? (
          <p className="text-sm text-[var(--color-ink-soft)]">Memuat…</p>
        ) : siswaSekolah.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-soft)]">Belum ada siswa aktif di unit sekolah ini. Tambahkan dulu di menu Data Siswa.</p>
        ) : (
          <div className="flex max-h-96 flex-col gap-2 overflow-y-auto">
            {siswaSekolah.map((s) => {
              const currentRombelId = enrollmentMap[s.id]
              const diKelasLain = currentRombelId && currentRombelId !== rombel.id
              return (
                <label key={s.id} className="flex items-center justify-between gap-3 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm">
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(s.id)}
                      onChange={() => toggle(s.id)}
                      className="h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-navy)] focus:ring-[var(--color-navy)]"
                    />
                    {s.nama_lengkap}{s.nis ? ` (${s.nis})` : ''}
                  </span>
                  {diKelasLain && <Badge color="gold">Pindah dari kelas lain</Badge>}
                </label>
              )
            })}
          </div>
        )}
        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="button" onClick={handleSave} disabled={saving || loading}>{saving ? 'Menyimpan…' : 'Simpan'}</Button>
        </div>
      </div>
    </Modal>
  )
}

// =========================================================================
// TAB: KENAIKAN KELAS — wizard kenaikan kelas massal per rombel. Untuk
// setiap siswa aktif di rombel asal, admin memilih rombel tujuan (di tahun
// ajaran tujuan) atau menandai Lulus/Pindah/Keluar. Ditulis lewat beberapa
// panggilan Supabase berurutan per siswa (pola yang sama dipakai di
// RosterModal & "Proses Pegawai Aktif" penggajian) — bukan lewat RPC/
// stored procedure, konsisten dengan konvensi kode yang sudah ada.
// =========================================================================
const AKSI_LULUS = '__LULUS__'
const AKSI_KELUAR = '__KELUAR__'

function KenaikanKelasTab({ rombel, schools, tahunAjaran, lockedSchoolId }) {
  const [schoolFilter, setSchoolFilter] = useState(lockedSchoolId || '')
  const [asalTahunId, setAsalTahunId] = useState(tahunAjaran.find((t) => t.status === 'aktif')?.id || '')
  const [tujuanTahunId, setTujuanTahunId] = useState('')
  const [asalRombelId, setAsalRombelId] = useState('')

  useEffect(() => {
    if (lockedSchoolId) setSchoolFilter(lockedSchoolId)
  }, [lockedSchoolId])

  const [siswaList, setSiswaList] = useState([])
  const [loadingSiswa, setLoadingSiswa] = useState(false)
  const [defaultTujuan, setDefaultTujuan] = useState('')
  const [targetMap, setTargetMap] = useState({}) // siswa_id -> { aksi, tinggalKelas }
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const rombelAsalOptions = rombel.filter((r) => r.tahun_ajaran_id === asalTahunId && (!schoolFilter || r.school_id === schoolFilter))
  const rombelAsal = rombel.find((r) => r.id === asalRombelId)
  const rombelTujuanOptions = rombel.filter((r) => r.tahun_ajaran_id === tujuanTahunId && r.school_id === rombelAsal?.school_id)

  const loadSiswa = useCallback(async () => {
    if (!asalRombelId || !asalTahunId) { setSiswaList([]); return }
    setLoadingSiswa(true)
    setResult(null)
    const { data } = await supabase
      .from('riwayat_siswa')
      .select('id, siswa_id, siswa!siswa_id(id, nama_lengkap, nis)')
      .eq('rombel_id', asalRombelId).eq('tahun_ajaran_id', asalTahunId).eq('status', 'aktif')
    setSiswaList((data || []).sort((a, b) => (a.siswa?.nama_lengkap || '').localeCompare(b.siswa?.nama_lengkap || '')))
    setTargetMap({})
    setLoadingSiswa(false)
  }, [asalRombelId, asalTahunId])

  useEffect(() => { loadSiswa() }, [loadSiswa])

  const applyDefaultToAll = () => {
    if (!defaultTujuan) return
    const next = {}
    for (const item of siswaList) next[item.siswa_id] = { aksi: defaultTujuan, tinggalKelas: false }
    setTargetMap(next)
  }

  const setAksi = (siswaId, aksi) => setTargetMap((m) => ({ ...m, [siswaId]: { aksi, tinggalKelas: m[siswaId]?.tinggalKelas || false } }))
  const setTinggalKelas = (siswaId, val) => setTargetMap((m) => ({ ...m, [siswaId]: { ...m[siswaId], tinggalKelas: val } }))

  const handleProses = async () => {
    const items = siswaList.filter((s) => targetMap[s.siswa_id]?.aksi)
    if (items.length === 0) { setError('Pilih aksi untuk minimal satu siswa terlebih dahulu.'); return }
    if (!confirm(`Proses kenaikan kelas untuk ${items.length} siswa? Tindakan ini akan mengubah riwayat kelas siswa dan tidak dapat dibatalkan otomatis.`)) return

    setProcessing(true)
    setError('')
    const today = new Date().toISOString().slice(0, 10)
    const gagal = []

    for (const item of items) {
      const { aksi, tinggalKelas } = targetMap[item.siswa_id]
      try {
        if (aksi === AKSI_LULUS || aksi === AKSI_KELUAR) {
          const statusBaru = aksi === AKSI_LULUS ? 'lulus' : 'keluar'
          const { error: e1 } = await supabase.from('siswa').update({ status: statusBaru }).eq('id', item.siswa_id)
          if (e1) throw e1
          const { error: e2 } = await supabase.from('riwayat_siswa').update({ status: statusBaru, tanggal_keluar: today }).eq('id', item.id)
          if (e2) throw e2
        } else {
          // aksi berisi id rombel tujuan
          const { error: e1 } = await supabase.from('riwayat_siswa')
            .update({ status: tinggalKelas ? 'tinggal_kelas' : 'naik_kelas', tanggal_keluar: today })
            .eq('id', item.id)
          if (e1) throw e1
          const { error: e2 } = await supabase.from('riwayat_siswa').insert({
            siswa_id: item.siswa_id, rombel_id: aksi, tahun_ajaran_id: tujuanTahunId, status: 'aktif', tanggal_masuk: today,
          })
          if (e2) throw e2
        }
      } catch (err) {
        gagal.push(`${item.siswa?.nama_lengkap || item.siswa_id}: ${err.message.includes('duplicate') ? 'sudah punya riwayat di tahun ajaran tujuan' : err.message}`)
      }
    }

    setProcessing(false)
    setResult({ total: items.length, gagal })
    loadSiswa()
  }

  return (
    <SectionCard
      title="Kenaikan Kelas"
      description="Pindahkan siswa aktif dari satu rombel ke rombel tujuan di tahun ajaran berikutnya, atau tandai Lulus/Keluar. Lakukan per rombel."
    >
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select label="Tahun Ajaran Asal" value={asalTahunId} onChange={(e) => { setAsalTahunId(e.target.value); setAsalRombelId('') }}>
          <option value="">— Pilih —</option>
          {tahunAjaran.map((t) => <option key={t.id} value={t.id}>{t.nama}{t.status === 'aktif' ? ' (Aktif)' : ''}</option>)}
        </Select>
        <Select label="Tahun Ajaran Tujuan" value={tujuanTahunId} onChange={(e) => setTujuanTahunId(e.target.value)}>
          <option value="">— Pilih —</option>
          {tahunAjaran.filter((t) => t.id !== asalTahunId).map((t) => <option key={t.id} value={t.id}>{t.nama}{t.status === 'aktif' ? ' (Aktif)' : ''}</option>)}
        </Select>
        {!lockedSchoolId && (
          <Select label="Unit Sekolah (filter)" value={schoolFilter} onChange={(e) => { setSchoolFilter(e.target.value); setAsalRombelId('') }}>
            <option value="">Semua Unit</option>
            {schools.map((s) => <option key={s.id} value={s.id}>{s.jenjang} — {s.nama}</option>)}
          </Select>
        )}
        <Select label="Rombel Asal" value={asalRombelId} onChange={(e) => setAsalRombelId(e.target.value)} disabled={!asalTahunId}>
          <option value="">— Pilih —</option>
          {rombelAsalOptions.map((r) => <option key={r.id} value={r.id}>{r.schools ? `${r.schools.jenjang} — ` : ''}{r.tingkat} {r.nama_rombel}</option>)}
        </Select>
      </div>

      {!asalRombelId ? (
        <EmptyState icon={ArrowUpCircle} title="Pilih rombel asal" description="Pilih tahun ajaran asal, tujuan, dan rombel asal untuk mulai memproses kenaikan kelas." />
      ) : loadingSiswa ? (
        <FullPageSpinner />
      ) : siswaList.length === 0 ? (
        <EmptyState icon={School} title="Tidak ada siswa aktif" description="Rombel ini tidak memiliki siswa berstatus aktif pada tahun ajaran asal." />
      ) : (
        <>
          {!tujuanTahunId ? (
            <p className="mb-3 rounded-md bg-[var(--color-gold-soft)] px-3 py-2 text-sm text-[var(--color-gold)]">Pilih Tahun Ajaran Tujuan di atas untuk dapat memilih rombel tujuan per siswa.</p>
          ) : (
            <div className="mb-4 flex flex-col gap-2 rounded-md border border-[var(--color-border)] p-3 sm:flex-row sm:items-end">
              <Select containerClassName="flex-1" label="Terapkan ke Semua Siswa" value={defaultTujuan} onChange={(e) => setDefaultTujuan(e.target.value)}>
                <option value="">— Pilih aksi massal (opsional) —</option>
                {rombelTujuanOptions.map((r) => <option key={r.id} value={r.id}>Naik → {r.tingkat} {r.nama_rombel}</option>)}
                <option value={AKSI_LULUS}>Tandai semua Lulus</option>
                <option value={AKSI_KELUAR}>Tandai semua Keluar</option>
              </Select>
              <Button type="button" variant="outline" onClick={applyDefaultToAll} disabled={!defaultTujuan}>Terapkan</Button>
            </div>
          )}

          <Table columns={['Nama', 'NIS', 'Aksi', 'Tinggal Kelas']}>
            {siswaList.map((item) => {
              const current = targetMap[item.siswa_id] || {}
              const isRombelTarget = current.aksi && current.aksi !== AKSI_LULUS && current.aksi !== AKSI_KELUAR
              return (
                <Tr key={item.id}>
                  <Td className="font-medium text-[var(--color-ink)]">{item.siswa?.nama_lengkap}</Td>
                  <Td className="text-[var(--color-ink-soft)]">{item.siswa?.nis || '—'}</Td>
                  <Td>
                    <Select value={current.aksi || ''} onChange={(e) => setAksi(item.siswa_id, e.target.value)} disabled={!tujuanTahunId}>
                      <option value="">— Belum dipilih —</option>
                      {rombelTujuanOptions.map((r) => <option key={r.id} value={r.id}>Naik → {r.tingkat} {r.nama_rombel}</option>)}
                      <option value={AKSI_LULUS}>Lulus</option>
                      <option value={AKSI_KELUAR}>Pindah / Keluar</option>
                    </Select>
                  </Td>
                  <Td>
                    {isRombelTarget && (
                      <input
                        type="checkbox"
                        checked={!!current.tinggalKelas}
                        onChange={(e) => setTinggalKelas(item.siswa_id, e.target.checked)}
                        className="h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-navy)] focus:ring-[var(--color-navy)]"
                        title="Centang bila siswa tinggal kelas (mengulang tingkat yang sama)"
                      />
                    )}
                  </Td>
                </Tr>
              )
            })}
          </Table>

          {error && <p className="mt-3 rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
          {result && (
            <div className={`mt-3 rounded-md px-3 py-2 text-sm ${result.gagal.length ? 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]' : 'bg-[var(--color-success-soft)] text-[var(--color-success)]'}`}>
              {result.gagal.length === 0
                ? `Berhasil memproses ${result.total} siswa.`
                : `Selesai dengan ${result.gagal.length} kegagalan dari ${result.total} siswa: ${result.gagal.join('; ')}`}
            </div>
          )}

          <div className="mt-4 flex justify-end">
            <Button type="button" onClick={handleProses} disabled={processing}>
              <ArrowUpCircle className="h-4 w-4" /> {processing ? 'Memproses…' : 'Proses Kenaikan Kelas'}
            </Button>
          </div>
        </>
      )}
    </SectionCard>
  )
}
