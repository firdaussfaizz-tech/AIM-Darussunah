import { useEffect, useState, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Activity, Pencil, Settings2, Info } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, Card, SectionCard, Button, Badge, Table, Tr, Td, Select, Input, Textarea, Modal, EmptyState, FullPageSpinner } from '../../components/ui'
import { hitungBebanKerja, DEFAULT_BEBAN_KERJA_SETTINGS, STATUS_BADGE_COLOR_BEBAN_KERJA } from '../../lib/workload'

const jam = (n) => `${Number(n || 0).toFixed(1)} jam`

export default function WorkloadList() {
  const { isManager, employee, loading: authLoading } = useAuth()
  if (authLoading) return <FullPageSpinner />
  return (
    <div>
      <PageHeader
        title="Beban Kerja"
        description={isManager
          ? 'Analisis beban kerja pegawai — jam tatap muka, tugas tambahan, dan ketatausahaan dibandingkan kapasitas jam kerja mingguan.'
          : 'Rincian beban kerja Anda bulan berjalan, dibandingkan kapasitas jam kerja mingguan.'}
      />
      {isManager ? <ManagerWorkload /> : <SelfWorkload employeeId={employee?.id} />}
    </div>
  )
}

function useBebanKerjaSettings() {
  const [settings, setSettings] = useState(DEFAULT_BEBAN_KERJA_SETTINGS)
  const [loaded, setLoaded] = useState(false)
  const load = useCallback(async () => {
    const { data } = await supabase.from('beban_kerja_settings').select('*').maybeSingle()
    setSettings(data || DEFAULT_BEBAN_KERJA_SETTINGS)
    setLoaded(true)
  }, [])
  useEffect(() => { load() }, [load])
  return { settings, loaded, reload: load }
}

function ManagerWorkload() {
  const { hasFullAccess } = useAuth()
  const { settings, loaded: settingsLoaded, reload: reloadSettings } = useBebanKerjaSettings()
  const [employees, setEmployees] = useState([])
  const [schools, setSchools] = useState([])
  const [bebanRows, setBebanRows] = useState([])
  const [tugasRows, setTugasRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [schoolFilter, setSchoolFilter] = useState('')
  const [editEmployee, setEditEmployee] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: emp }, { data: sch }, { data: beban }, { data: tugas }] = await Promise.all([
      supabase.from('employees').select('id, nama, schools!school_id(id, nama, jenjang), positions(nama, tunjangan_jenis, jp_ekuivalensi)').eq('status', 'aktif').order('nama'),
      supabase.from('schools').select('id, nama, jenjang').order('jenjang'),
      supabase.from('employee_beban_kerja').select('*'),
      supabase.from('employee_tugas_tambahan').select('employee_id, tugas_tambahan(nama, jp_ekuivalensi)'),
    ])
    setEmployees(emp || [])
    setSchools(sch || [])
    setBebanRows(beban || [])
    setTugasRows(tugas || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const bebanByEmployee = useMemo(() => Object.fromEntries(bebanRows.map((b) => [b.employee_id, b])), [bebanRows])
  const tugasByEmployee = useMemo(() => {
    const map = {}
    for (const t of tugasRows) {
      if (!t.tugas_tambahan) continue
      ;(map[t.employee_id] ||= []).push(t.tugas_tambahan)
    }
    return map
  }, [tugasRows])

  const rows = useMemo(() => {
    return employees
      .filter((e) => !schoolFilter || e.schools?.id === schoolFilter)
      .map((e) => {
        const b = bebanByEmployee[e.id]
        const hasil = hitungBebanKerja({
          position: e.positions,
          jenjang: e.schools?.jenjang,
          tugasTambahanList: tugasByEmployee[e.id] || [],
          jpMengajar: b?.jp_mengajar || 0,
          jamKetatausahaan: b?.jam_ketatausahaan || 0,
          settings,
        })
        return { employee: e, beban: b, hasil }
      })
  }, [employees, schoolFilter, bebanByEmployee, tugasByEmployee, settings])

  const rekapUnit = useMemo(() => {
    const map = {}
    for (const r of rows) {
      const jenjang = r.employee.schools?.jenjang || 'Kantor Yayasan'
      if (!map[jenjang]) map[jenjang] = { jenjang, jumlah: 0, totalTerpakai: 0, kapasitas: 0 }
      map[jenjang].jumlah += 1
      map[jenjang].totalTerpakai += r.hasil.totalJamTerpakai
      map[jenjang].kapasitas += r.hasil.kapasitas
    }
    return Object.values(map).map((u) => ({ ...u, utilisasi: u.kapasitas > 0 ? u.totalTerpakai / u.kapasitas : 0 }))
  }, [rows])

  if (loading || !settingsLoaded) return <FullPageSpinner />

  return (
    <div className="flex flex-col gap-6">
      {rekapUnit.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {rekapUnit.map((u) => (
            <Card key={u.jenjang}>
              <p className="text-[13px] font-medium text-[var(--color-ink-soft)]">{u.jenjang}</p>
              <p className="mt-1 font-[family-name:var(--font-display)] text-[22px] font-semibold text-[var(--color-navy)]">{Math.round(u.utilisasi * 100)}%</p>
              <p className="text-xs text-[var(--color-ink-soft)]">{u.jumlah} pegawai · rata-rata utilisasi</p>
            </Card>
          ))}
        </div>
      )}

      <Card padded={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] p-5">
          <Select value={schoolFilter} onChange={(e) => setSchoolFilter(e.target.value)} containerClassName="w-56">
            <option value="">Semua Unit Sekolah</option>
            {schools.map((s) => <option key={s.id} value={s.id}>{s.jenjang} — {s.nama}</option>)}
          </Select>
          {hasFullAccess && (
            <Button size="sm" variant="outline" onClick={() => setSettingsOpen(true)}>
              <Settings2 className="h-4 w-4" /> Pengaturan
            </Button>
          )}
        </div>
        <div className="p-5">
          {rows.length === 0 ? (
            <EmptyState icon={Activity} title="Tidak ada pegawai aktif" />
          ) : (
            <Table columns={['Pegawai', 'Unit', 'JP Mengajar', 'Rincian Jam Terpakai', 'Sisa Jam', 'Utilisasi', 'Status', '']}>
              {rows.map(({ employee: e, hasil }) => (
                <Tr key={e.id}>
                  <Td className="font-medium text-[var(--color-ink)]">{e.nama}</Td>
                  <Td className="text-[var(--color-ink-soft)]">{e.schools ? `${e.schools.jenjang} — ${e.schools.nama}` : 'Yayasan'}</Td>
                  <Td>{hasil.jpMengajar} JP</Td>
                  <Td className="text-[var(--color-ink-soft)]">
                    Tatap muka {jam(hasil.jamTatapMuka)} + Tugas tambahan {jam(hasil.jamTugasTambahan)} + TU {jam(hasil.jamKetatausahaan)}
                    <span className="ml-1 font-medium text-[var(--color-ink)]">= {jam(hasil.totalJamTerpakai)}</span>
                  </Td>
                  <Td className={hasil.sisaJamKerja < 0 ? 'text-[var(--color-danger)]' : ''}>{jam(hasil.sisaJamKerja)}</Td>
                  <Td>{Math.round(hasil.utilisasi * 100)}%</Td>
                  <Td><Badge color={STATUS_BADGE_COLOR_BEBAN_KERJA[hasil.status] || 'neutral'}>{hasil.status}</Badge></Td>
                  <Td className="text-right">
                    <button onClick={() => setEditEmployee({ employee: e, beban: bebanByEmployee[e.id], hasil })} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Ubah">
                      <Pencil className="h-4 w-4" />
                    </button>
                  </Td>
                </Tr>
              ))}
            </Table>
          )}
        </div>
      </Card>

      <EditBebanKerjaModal row={editEmployee} onClose={() => setEditEmployee(null)} onSaved={() => { setEditEmployee(null); load() }} />
      <BebanKerjaSettingsModal open={settingsOpen} settings={settings} onClose={() => setSettingsOpen(false)} onSaved={() => { setSettingsOpen(false); reloadSettings() }} />
    </div>
  )
}

function EditBebanKerjaModal({ row, onClose, onSaved }) {
  const [jpMengajar, setJpMengajar] = useState('0')
  const [jamKetatausahaan, setJamKetatausahaan] = useState('0')
  const [catatan, setCatatan] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (row) {
      setJpMengajar(String(row.beban?.jp_mengajar ?? 0))
      setJamKetatausahaan(String(row.beban?.jam_ketatausahaan ?? 0))
      setCatatan(row.beban?.catatan || '')
      setError('')
    }
  }, [row])

  if (!row) return null
  const { employee: e, hasil } = row

  const handleSave = async () => {
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('employee_beban_kerja').upsert(
      { employee_id: e.id, jp_mengajar: Number(jpMengajar) || 0, jam_ketatausahaan: Number(jamKetatausahaan) || 0, catatan: catatan || null, updated_at: new Date().toISOString() },
      { onConflict: 'employee_id' },
    )
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  return (
    <Modal open={!!row} onClose={onClose} title={`Beban Kerja — ${e.nama}`}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <Input label="JP Mengajar / Minggu" type="number" min="0" step="0.5" value={jpMengajar} onChange={(ev) => setJpMengajar(ev.target.value)} />
          <Input label="Jam Ketatausahaan / Minggu" type="number" min="0" step="0.5" value={jamKetatausahaan} onChange={(ev) => setJamKetatausahaan(ev.target.value)} />
        </div>
        <p className="-mt-2 text-xs text-[var(--color-ink-soft)]">Jam Ketatausahaan hanya diisi untuk staf TU murni tanpa jam mengajar.</p>
        <Textarea label="Catatan (opsional)" rows={2} value={catatan} onChange={(ev) => setCatatan(ev.target.value)} />

        <div className="rounded-md bg-[var(--color-navy-50)] p-3 text-xs text-[var(--color-ink-soft)]">
          <p className="mb-1 flex items-center gap-1.5 font-medium text-[var(--color-ink)]"><Info className="h-3.5 w-3.5" /> Jam Tugas Tambahan (otomatis, {jam(hasil.jamTugasTambahan)})</p>
          {hasil.rincianTugasTambahan.length === 0 ? (
            <p>Tidak ada Jabatan Struktural / Tugas Tambahan yang tercatat.</p>
          ) : (
            <ul className="list-inside list-disc">
              {hasil.rincianTugasTambahan.map((t) => <li key={t.nama}>{t.nama} — {t.jp} JP/mg</li>)}
            </ul>
          )}
          <Link to={`/pegawai/${e.id}`} className="mt-1.5 inline-block font-medium text-[var(--color-navy)] hover:underline">Kelola Jabatan/Tugas Tambahan di profil pegawai →</Link>
        </div>

        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="button" onClick={handleSave} disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button>
        </div>
      </div>
    </Modal>
  )
}

const SETTINGS_FIELDS = [
  ['kapasitas_jam_kerja', 'Kapasitas Jam Kerja (jam/mg)'],
  ['beban_mengajar_min', 'Beban Mengajar Minimal (JP/mg)'],
  ['beban_mengajar_maks', 'Beban Mengajar Maksimal (JP/mg)'],
  ['ambang_longgar', 'Ambang Utilisasi "Longgar" (rasio, mis. 0.7)'],
  ['ambang_padat', 'Ambang Utilisasi "Padat" (rasio, mis. 0.9)'],
  ['durasi_jp_sd', 'Durasi 1 JP — SD (menit)'],
  ['durasi_jp_smp', 'Durasi 1 JP — SMP (menit)'],
  ['durasi_jp_sma', 'Durasi 1 JP — SMA (menit)'],
  ['durasi_jp_boarding', 'Durasi 1 JP — Boarding (menit)'],
]

function BebanKerjaSettingsModal({ open, settings, onClose, onSaved }) {
  const [form, setForm] = useState(settings)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { if (open) { setForm(settings); setError('') } }, [open, settings])

  const handleSave = async () => {
    setSaving(true)
    setError('')
    const payload = Object.fromEntries(SETTINGS_FIELDS.map(([key]) => [key, Number(form[key]) || 0]))
    const { error: err } = await supabase.from('beban_kerja_settings').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', true)
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title="Pengaturan Beban Kerja" width="max-w-xl">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          {SETTINGS_FIELDS.map(([key, label]) => (
            <Input
              key={key} label={label} type="number" min="0" step="0.01"
              value={form[key] ?? ''}
              onChange={(e) => setForm((s) => ({ ...s, [key]: e.target.value }))}
            />
          ))}
        </div>
        <p className="text-xs text-[var(--color-ink-soft)]">Mengacu pada Analisis Beban Kerja YPI Darussunah (FRM-SDM-02). Perubahan berlaku langsung tanpa deploy ulang.</p>
        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="button" onClick={handleSave} disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button>
        </div>
      </div>
    </Modal>
  )
}

function SelfWorkload({ employeeId }) {
  const { settings, loaded: settingsLoaded } = useBebanKerjaSettings()
  const [loading, setLoading] = useState(true)
  const [employee, setEmployee] = useState(null)
  const [beban, setBeban] = useState(null)
  const [tugasList, setTugasList] = useState([])

  useEffect(() => {
    if (!employeeId) { setLoading(false); return }
    const load = async () => {
      setLoading(true)
      const [{ data: e }, { data: b }, { data: t }] = await Promise.all([
        supabase.from('employees').select('id, nama, schools!school_id(jenjang, nama), positions(nama, tunjangan_jenis, jp_ekuivalensi)').eq('id', employeeId).maybeSingle(),
        supabase.from('employee_beban_kerja').select('*').eq('employee_id', employeeId).maybeSingle(),
        supabase.from('employee_tugas_tambahan').select('tugas_tambahan(nama, jp_ekuivalensi)').eq('employee_id', employeeId),
      ])
      setEmployee(e)
      setBeban(b)
      setTugasList((t || []).map((r) => r.tugas_tambahan).filter(Boolean))
      setLoading(false)
    }
    load()
  }, [employeeId])

  if (!employeeId) return <EmptyState icon={Activity} title="Data beban kerja tidak tersedia" description="Akun Anda belum ditautkan ke data kepegawaian." />
  if (loading || !settingsLoaded) return <FullPageSpinner />
  if (!employee) return <EmptyState icon={Activity} title="Data pegawai tidak ditemukan" />

  const hasil = hitungBebanKerja({
    position: employee.positions,
    jenjang: employee.schools?.jenjang,
    tugasTambahanList: tugasList,
    jpMengajar: beban?.jp_mengajar || 0,
    jamKetatausahaan: beban?.jam_ketatausahaan || 0,
    settings,
  })

  return (
    <div className="flex flex-col gap-5">
      {!beban && (
        <Card className="border-[var(--color-gold)] bg-[var(--color-gold-soft)]">
          <p className="text-sm font-medium text-[var(--color-gold)]">Data JP Mengajar/Jam Ketatausahaan Anda belum diisi oleh Kepala Sekolah/admin — angka di bawah masih Rp0/kosong.</p>
        </Card>
      )}

      <Card className="bg-[var(--color-navy-50)]">
        <p className="text-[13px] font-medium text-[var(--color-ink-soft)]">Utilisasi Jam Kerja Mingguan</p>
        <p className="mt-1 font-[family-name:var(--font-display)] text-[36px] font-semibold text-[var(--color-navy)]">{Math.round(hasil.utilisasi * 100)}%</p>
        <Badge color={STATUS_BADGE_COLOR_BEBAN_KERJA[hasil.status] || 'neutral'}>{hasil.status}</Badge>
        <p className="mt-2 text-xs text-[var(--color-ink-soft)]">
          {jam(hasil.totalJamTerpakai)} terpakai dari kapasitas {jam(hasil.kapasitas)}/minggu · sisa {jam(hasil.sisaJamKerja)}
        </p>
      </Card>

      <SectionCard title="Rincian Komponen Beban Kerja" description="Dikonversi ke jam kerja (60 menit) per minggu, mengacu pada Analisis Beban Kerja YPI Darussunah (FRM-SDM-02)">
        <Table columns={['Komponen', 'Nilai', 'Setara Jam']}>
          <Tr>
            <Td className="font-medium text-[var(--color-ink)]">Jam Tatap Muka</Td>
            <Td>{hasil.jpMengajar} JP mengajar</Td>
            <Td>{jam(hasil.jamTatapMuka)}</Td>
          </Tr>
          <Tr>
            <Td className="font-medium text-[var(--color-ink)]">Jam Tugas Tambahan</Td>
            <Td className="text-[var(--color-ink-soft)]">
              {hasil.rincianTugasTambahan.length === 0 ? 'Tidak ada' : hasil.rincianTugasTambahan.map((t) => `${t.nama} (${t.jp} JP)`).join(', ')}
            </Td>
            <Td>{jam(hasil.jamTugasTambahan)}</Td>
          </Tr>
          <Tr>
            <Td className="font-medium text-[var(--color-ink)]">Jam Ketatausahaan</Td>
            <Td>—</Td>
            <Td>{jam(hasil.jamKetatausahaan)}</Td>
          </Tr>
          <Tr>
            <Td className="font-semibold text-[var(--color-ink)]">Total Jam Terpakai</Td>
            <Td />
            <Td className="font-semibold">{jam(hasil.totalJamTerpakai)}</Td>
          </Tr>
          <Tr>
            <Td className="font-medium text-[var(--color-ink)]">Kapasitas Jam Kerja</Td>
            <Td />
            <Td>{jam(hasil.kapasitas)}</Td>
          </Tr>
          <Tr>
            <Td className="font-semibold text-[var(--color-ink)]">Sisa Jam Kerja Efektif</Td>
            <Td />
            <Td className={`font-semibold ${hasil.sisaJamKerja < 0 ? 'text-[var(--color-danger)]' : ''}`}>{jam(hasil.sisaJamKerja)}</Td>
          </Tr>
        </Table>
      </SectionCard>

      <Card>
        <p className="text-sm text-[var(--color-ink-soft)]">
          Sisa jam kerja efektif bukan berarti waktu kosong — sebagian besar dipakai untuk perencanaan pembelajaran, penyusunan &amp; koreksi soal, input nilai,
          serta bimbingan peserta didik (Permendikbud 15/2018). Data ini dikelola oleh Kepala Sekolah/admin; hubungi mereka bila ada koreksi.
        </p>
      </Card>
    </div>
  )
}
