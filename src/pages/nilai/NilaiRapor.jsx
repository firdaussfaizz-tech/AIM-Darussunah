import { useEffect, useState, useCallback } from 'react'
import { NotebookText, Plus, Trash2, Printer, ShieldAlert, BookOpen } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, SectionCard, Card, Button, Table, Tr, Td, Modal, Input, Select, Textarea, EmptyState, FullPageSpinner } from '../../components/ui'
import { SEMESTER_OPTIONS, NILAI_SIKAP_OPTIONS } from '../../lib/format'

const TABS = ['Input Nilai & Rapor', 'Mata Pelajaran']

// Semester berjalan ditebak dari bulan saat ini — Juli s/d Desember
// dianggap semester ganjil, Januari s/d Juni semester genap. Hanya nilai
// default awal, admin/guru tetap bisa mengganti lewat dropdown.
function tebakSemester() {
  const bulan = new Date().getMonth() + 1
  return bulan >= 7 ? 'ganjil' : 'genap'
}

export default function NilaiRapor() {
  const { isManager, isWaliKelas, waliKelasRombel, employee, loading: authLoading } = useAuth()
  const [tab, setTab] = useState('Input Nilai & Rapor')

  if (authLoading) return <FullPageSpinner />
  if (!isManager && !isWaliKelas) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Akses terbatas"
        description="Halaman Nilai & Rapor hanya dapat diakses oleh manajemen atau Wali Kelas."
      />
    )
  }

  const tabs = isManager ? TABS : [TABS[0]]

  return (
    <div>
      <PageHeader title="Nilai & Rapor" description="Input nilai siswa per mata pelajaran dan cetak rapor per semester." />
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-[var(--color-border)]">
        {tabs.map((t) => (
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

      {tab === 'Input Nilai & Rapor' && <InputNilaiTab isManager={isManager} waliKelasRombel={waliKelasRombel} employeeId={employee?.id} />}
      {tab === 'Mata Pelajaran' && isManager && <MataPelajaranTab />}
    </div>
  )
}

// =========================================================================
// TAB: INPUT NILAI & RAPOR
// =========================================================================
function InputNilaiTab({ isManager, waliKelasRombel, employeeId }) {
  const [semester, setSemester] = useState(tebakSemester())
  const [modalSiswa, setModalSiswa] = useState(null) // { siswa, rombel, tahunAjaranId }
  const [raporSiswa, setRaporSiswa] = useState(null)

  return (
    <div>
      <Card className="mb-4" padded={false}>
        <div className="p-4">
          <Select containerClassName="sm:w-56" label="Semester" value={semester} onChange={(e) => setSemester(e.target.value)}>
            {SEMESTER_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
        </div>
      </Card>

      {isManager ? (
        <ManagerRombelPicker onInputNilai={setModalSiswa} onRapor={setRaporSiswa} />
      ) : (
        <WaliKelasRombelPicker rombelList={waliKelasRombel} onInputNilai={setModalSiswa} onRapor={setRaporSiswa} />
      )}

      {modalSiswa && (
        <NilaiModal
          {...modalSiswa}
          semester={semester}
          employeeId={employeeId}
          onClose={() => setModalSiswa(null)}
        />
      )}
      {raporSiswa && (
        <RaporModal {...raporSiswa} semester={semester} onClose={() => setRaporSiswa(null)} />
      )}
    </div>
  )
}

function ManagerRombelPicker({ onInputNilai, onRapor }) {
  const [schools, setSchools] = useState([])
  const [schoolFilter, setSchoolFilter] = useState('')
  const [tahunAktif, setTahunAktif] = useState(null)
  const [rombelList, setRombelList] = useState([])
  const [rombelId, setRombelId] = useState('')
  const [loadingMeta, setLoadingMeta] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoadingMeta(true)
      const [{ data: sch }, { data: ta }] = await Promise.all([
        supabase.from('schools').select('id, nama, jenjang').order('jenjang'),
        supabase.from('tahun_ajaran').select('id, nama').eq('status', 'aktif').maybeSingle(),
      ])
      setSchools(sch || [])
      setTahunAktif(ta || null)
      if (ta) {
        const { data: r } = await supabase.from('rombel').select('id, nama_rombel, tingkat, school_id').eq('tahun_ajaran_id', ta.id).order('tingkat')
        setRombelList(r || [])
      }
      setLoadingMeta(false)
    }
    load()
  }, [])

  if (loadingMeta) return <FullPageSpinner />
  if (!tahunAktif) return <EmptyState icon={NotebookText} title="Belum ada tahun ajaran aktif" description="Atur tahun ajaran aktif terlebih dahulu di menu Kelas & Tahun Ajaran." />

  const filteredRombel = rombelList.filter((r) => !schoolFilter || r.school_id === schoolFilter)

  return (
    <div>
      <Card className="mb-4" padded={false}>
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <Select containerClassName="sm:w-56" value={schoolFilter} onChange={(e) => { setSchoolFilter(e.target.value); setRombelId('') }}>
            <option value="">Semua Unit</option>
            {schools.map((s) => <option key={s.id} value={s.id}>{s.jenjang} — {s.nama}</option>)}
          </Select>
          <Select containerClassName="sm:w-56" value={rombelId} onChange={(e) => setRombelId(e.target.value)}>
            <option value="">— Pilih Rombel —</option>
            {filteredRombel.map((r) => <option key={r.id} value={r.id}>{r.tingkat} {r.nama_rombel}</option>)}
          </Select>
        </div>
      </Card>
      {rombelId ? (
        <SiswaNilaiTable rombelId={rombelId} tahunAjaranId={tahunAktif.id} onInputNilai={onInputNilai} onRapor={onRapor} />
      ) : (
        <EmptyState icon={BookOpen} title="Pilih rombel" description="Pilih unit dan rombel untuk mulai mengelola nilai." />
      )}
    </div>
  )
}

function WaliKelasRombelPicker({ rombelList, onInputNilai, onRapor }) {
  const aktifList = rombelList.filter((r) => r.tahun_ajaran?.status === 'aktif')
  const [rombelId, setRombelId] = useState(aktifList[0]?.id || '')
  const selected = aktifList.find((r) => r.id === (rombelId || aktifList[0]?.id)) || aktifList[0]

  if (aktifList.length === 0) {
    return <EmptyState icon={NotebookText} title="Tidak ada kelas aktif" description="Anda tidak tercatat sebagai Wali Kelas pada tahun ajaran yang sedang aktif." />
  }

  return (
    <div>
      {aktifList.length > 1 && (
        <Card className="mb-4" padded={false}>
          <div className="p-4">
            <Select label="Rombel" value={rombelId || aktifList[0].id} onChange={(e) => setRombelId(e.target.value)}>
              {aktifList.map((r) => <option key={r.id} value={r.id}>{r.tingkat} {r.nama_rombel} — {r.schools?.nama}</option>)}
            </Select>
          </div>
        </Card>
      )}
      <SiswaNilaiTable rombelId={selected.id} tahunAjaranId={selected.tahun_ajaran_id} onInputNilai={onInputNilai} onRapor={onRapor} />
    </div>
  )
}

function SiswaNilaiTable({ rombelId, tahunAjaranId, onInputNilai, onRapor }) {
  const [rombel, setRombel] = useState(null)
  const [siswaList, setSiswaList] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [{ data: r }, { data: enroll }] = await Promise.all([
        supabase.from('rombel').select('id, nama_rombel, tingkat, school_id, tahun_ajaran_id').eq('id', rombelId).single(),
        supabase.from('riwayat_siswa').select('siswa_id, siswa!siswa_id(id, nama_lengkap, nis)').eq('rombel_id', rombelId).eq('tahun_ajaran_id', tahunAjaranId).eq('status', 'aktif'),
      ])
      setRombel(r || null)
      setSiswaList((enroll || []).map((e) => e.siswa).filter(Boolean).sort((a, b) => a.nama_lengkap.localeCompare(b.nama_lengkap)))
      setLoading(false)
    }
    load()
  }, [rombelId, tahunAjaranId])

  if (loading) return <FullPageSpinner />
  if (siswaList.length === 0) return <EmptyState icon={BookOpen} title="Tidak ada siswa aktif" description="Rombel ini belum memiliki siswa aktif pada tahun ajaran ini." />

  return (
    <Card padded={false}>
      <div className="p-5">
        <Table columns={['Nama', 'NIS', '']}>
          {siswaList.map((s) => (
            <Tr key={s.id}>
              <Td className="font-medium text-[var(--color-ink)]">{s.nama_lengkap}</Td>
              <Td className="text-[var(--color-ink-soft)]">{s.nis || '—'}</Td>
              <Td className="text-right">
                <div className="flex justify-end gap-3">
                  <button onClick={() => onInputNilai({ siswa: s, rombel, tahunAjaranId })} className="text-sm font-medium text-[var(--color-navy)] hover:underline">Input Nilai</button>
                  <button onClick={() => onRapor({ siswa: s, rombel, tahunAjaranId })} className="text-sm font-medium text-[var(--color-ink-soft)] hover:text-[var(--color-navy)] hover:underline">Rapor</button>
                </div>
              </Td>
            </Tr>
          ))}
        </Table>
      </div>
    </Card>
  )
}

function NilaiModal({ siswa, rombel, tahunAjaranId, semester, employeeId, onClose }) {
  const [mapelList, setMapelList] = useState([])
  const [nilaiMap, setNilaiMap] = useState({}) // mapel_id -> { pengetahuan, keterampilan, sikap, catatan }
  const [catatanWaliKelas, setCatatanWaliKelas] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [{ data: mapel }, { data: nilai }, { data: catatan }] = await Promise.all([
        supabase.from('mata_pelajaran').select('*').eq('school_id', rombel.school_id).order('nama'),
        supabase.from('nilai_siswa').select('*').eq('siswa_id', siswa.id).eq('tahun_ajaran_id', tahunAjaranId).eq('semester', semester),
        supabase.from('rapor_catatan').select('*').eq('siswa_id', siswa.id).eq('tahun_ajaran_id', tahunAjaranId).eq('semester', semester).maybeSingle(),
      ])
      setMapelList(mapel || [])
      const map = {}
      ;(nilai || []).forEach((n) => {
        map[n.mata_pelajaran_id] = { pengetahuan: n.nilai_pengetahuan ?? '', keterampilan: n.nilai_keterampilan ?? '', sikap: n.nilai_sikap || '', catatan: n.catatan_guru || '' }
      })
      setNilaiMap(map)
      setCatatanWaliKelas(catatan?.catatan_wali_kelas || '')
      setLoading(false)
    }
    load()
  }, [siswa.id, rombel.school_id, tahunAjaranId, semester])

  const setField = (mapelId, field, value) => setNilaiMap((m) => ({ ...m, [mapelId]: { ...m[mapelId], [field]: value } }))

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      for (const mapel of mapelList) {
        const v = nilaiMap[mapel.id]
        if (!v || (v.pengetahuan === '' && v.keterampilan === '' && v.sikap === '' && !v.catatan)) continue
        const { error: err } = await supabase.from('nilai_siswa').upsert({
          siswa_id: siswa.id, rombel_id: rombel.id, tahun_ajaran_id: tahunAjaranId, mata_pelajaran_id: mapel.id, semester,
          nilai_pengetahuan: v.pengetahuan === '' ? null : Number(v.pengetahuan),
          nilai_keterampilan: v.keterampilan === '' ? null : Number(v.keterampilan),
          nilai_sikap: v.sikap || null,
          catatan_guru: v.catatan || null,
          dicatat_oleh: employeeId || null,
        }, { onConflict: 'siswa_id,mata_pelajaran_id,tahun_ajaran_id,semester' })
        if (err) throw err
      }
      const { error: err2 } = await supabase.from('rapor_catatan').upsert({
        siswa_id: siswa.id, rombel_id: rombel.id, tahun_ajaran_id: tahunAjaranId, semester, catatan_wali_kelas: catatanWaliKelas || null,
      }, { onConflict: 'siswa_id,tahun_ajaran_id,semester' })
      if (err2) throw err2
      setSaving(false)
      onClose()
    } catch (err) {
      setSaving(false)
      setError(err.message)
    }
  }

  return (
    <Modal open onClose={onClose} title={`Input Nilai — ${siswa.nama_lengkap}`} width="max-w-2xl">
      {loading ? <FullPageSpinner /> : (
        <div className="flex flex-col gap-4">
          {mapelList.length === 0 ? (
            <p className="rounded-md bg-[var(--color-gold-soft)] px-3 py-2 text-sm text-[var(--color-gold)]">
              Belum ada mata pelajaran untuk unit sekolah ini. Tambahkan dulu di tab "Mata Pelajaran".
            </p>
          ) : (
            <div className="flex max-h-96 flex-col gap-3 overflow-y-auto">
              {mapelList.map((mapel) => {
                const v = nilaiMap[mapel.id] || { pengetahuan: '', keterampilan: '', sikap: '', catatan: '' }
                return (
                  <div key={mapel.id} className="rounded-md border border-[var(--color-border)] p-3">
                    <p className="mb-2 text-sm font-semibold text-[var(--color-ink)]">{mapel.nama}</p>
                    <div className="grid grid-cols-3 gap-2">
                      <Input label="Pengetahuan" type="number" min="0" max="100" value={v.pengetahuan} onChange={(e) => setField(mapel.id, 'pengetahuan', e.target.value)} />
                      <Input label="Keterampilan" type="number" min="0" max="100" value={v.keterampilan} onChange={(e) => setField(mapel.id, 'keterampilan', e.target.value)} />
                      <Select label="Sikap" value={v.sikap} onChange={(e) => setField(mapel.id, 'sikap', e.target.value)}>
                        <option value="">—</option>
                        {NILAI_SIKAP_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                      </Select>
                    </div>
                    <Input containerClassName="mt-2" label="Catatan Guru Mapel (opsional)" value={v.catatan} onChange={(e) => setField(mapel.id, 'catatan', e.target.value)} />
                  </div>
                )
              })}
            </div>
          )}
          <Textarea label="Catatan Wali Kelas (opsional)" rows={3} value={catatanWaliKelas} onChange={(e) => setCatatanWaliKelas(e.target.value)} placeholder="Catatan umum untuk rapor siswa ini pada semester ini" />
          {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
          <div className="flex justify-end gap-2 border-t border-[var(--color-border)] pt-3">
            <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
            <Button type="button" onClick={handleSave} disabled={saving || mapelList.length === 0}>{saving ? 'Menyimpan…' : 'Simpan Nilai'}</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function RaporModal({ siswa, rombel, tahunAjaranId, semester, onClose }) {
  const [loading, setLoading] = useState(true)
  const [nilai, setNilai] = useState([])
  const [catatan, setCatatan] = useState(null)
  const [presensiRecap, setPresensiRecap] = useState(null)
  const [tahunAjaran, setTahunAjaran] = useState(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [{ data: n }, { data: c }, { data: ta }] = await Promise.all([
        supabase.from('nilai_siswa').select('*, mata_pelajaran(nama)').eq('siswa_id', siswa.id).eq('tahun_ajaran_id', tahunAjaranId).eq('semester', semester),
        supabase.from('rapor_catatan').select('*').eq('siswa_id', siswa.id).eq('tahun_ajaran_id', tahunAjaranId).eq('semester', semester).maybeSingle(),
        supabase.from('tahun_ajaran').select('*').eq('id', tahunAjaranId).single(),
      ])
      setNilai((n || []).sort((a, b) => (a.mata_pelajaran?.nama || '').localeCompare(b.mata_pelajaran?.nama || '')))
      setCatatan(c || null)
      setTahunAjaran(ta || null)

      let presensiQuery = supabase.from('presensi_siswa').select('status').eq('siswa_id', siswa.id)
      if (ta?.tanggal_mulai) presensiQuery = presensiQuery.gte('tanggal', ta.tanggal_mulai)
      if (ta?.tanggal_selesai) presensiQuery = presensiQuery.lte('tanggal', ta.tanggal_selesai)
      const { data: presensi } = await presensiQuery
      const recap = { hadir: 0, izin: 0, sakit: 0, alpa: 0 }
      ;(presensi || []).forEach((p) => { recap[p.status] = (recap[p.status] || 0) + 1 })
      setPresensiRecap(recap)

      setLoading(false)
    }
    load()
  }, [siswa.id, tahunAjaranId, semester])

  const handlePrint = () => {
    const semesterLabel = SEMESTER_OPTIONS.find((s) => s.value === semester)?.label || semester
    const rowsHtml = nilai.length === 0
      ? '<tr><td colspan="4" style="padding:8px;color:#777;">Belum ada nilai tercatat.</td></tr>'
      : nilai.map((n) => `
        <tr>
          <td style="padding:6px 8px;border-bottom:1px solid #eee;">${n.mata_pelajaran?.nama || '-'}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;">${n.nilai_pengetahuan ?? '-'}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;">${n.nilai_keterampilan ?? '-'}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;">${n.nilai_sikap || '-'}</td>
        </tr>`).join('')

    const presensiHtml = presensiRecap
      ? `<p style="margin:14px 0 4px;font-weight:600;">Rekap Presensi (${tahunAjaran?.nama || ''})</p>
         <p style="margin:0;font-size:13px;">Hadir: ${presensiRecap.hadir} · Izin: ${presensiRecap.izin} · Sakit: ${presensiRecap.sakit} · Alpa: ${presensiRecap.alpa}</p>`
      : ''

    const html = `<!DOCTYPE html>
<html lang="id"><head><meta charset="utf-8"><title>Rapor — ${siswa.nama_lengkap} — ${semesterLabel}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; font-size: 13px; color: #1a1a1a; max-width: 680px; margin: 24px auto; padding: 0 16px; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  .meta { color: #555; margin-bottom: 18px; font-size: 12.5px; }
  .meta div { margin-bottom: 2px; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  th { text-align: left; padding: 6px 8px; border-bottom: 2px solid #333; font-size: 12.5px; }
  @media print { body { margin: 0; padding: 16px; } }
</style></head>
<body>
  <h1>Rapor Siswa</h1>
  <div class="meta">
    <div><strong>${siswa.nama_lengkap}</strong> — ${rombel.tingkat} ${rombel.nama_rombel}</div>
    <div>Tahun Ajaran ${tahunAjaran?.nama || '-'} — ${semesterLabel}</div>
  </div>
  <table>
    <thead><tr><th>Mata Pelajaran</th><th style="text-align:center;">Pengetahuan</th><th style="text-align:center;">Keterampilan</th><th style="text-align:center;">Sikap</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  ${presensiHtml}
  ${catatan?.catatan_wali_kelas ? `<p style="margin:14px 0 4px;font-weight:600;">Catatan Wali Kelas</p><p style="margin:0;font-size:13px;">${catatan.catatan_wali_kelas}</p>` : ''}
</body></html>`

    const w = window.open('', '_blank')
    if (!w) { alert('Popup diblokir browser. Izinkan popup untuk mencetak rapor.'); return }
    w.document.open()
    w.document.write(html)
    w.document.close()
    w.onload = () => { w.focus(); w.print() }
  }

  return (
    <Modal open onClose={onClose} title={`Rapor — ${siswa.nama_lengkap}`} width="max-w-2xl">
      {loading ? <FullPageSpinner /> : (
        <div className="flex flex-col gap-4">
          {nilai.length === 0 ? (
            <p className="text-sm text-[var(--color-ink-soft)]">Belum ada nilai tercatat untuk semester ini.</p>
          ) : (
            <Table columns={['Mata Pelajaran', 'Pengetahuan', 'Keterampilan', 'Sikap']}>
              {nilai.map((n) => (
                <Tr key={n.id}>
                  <Td className="font-medium">{n.mata_pelajaran?.nama || '—'}</Td>
                  <Td>{n.nilai_pengetahuan ?? '—'}</Td>
                  <Td>{n.nilai_keterampilan ?? '—'}</Td>
                  <Td>{n.nilai_sikap || '—'}</Td>
                </Tr>
              ))}
            </Table>
          )}
          {presensiRecap && (
            <p className="text-xs text-[var(--color-ink-soft)]">
              Rekap presensi tahun ajaran {tahunAjaran?.nama}: Hadir {presensiRecap.hadir} · Izin {presensiRecap.izin} · Sakit {presensiRecap.sakit} · Alpa {presensiRecap.alpa}
            </p>
          )}
          {catatan?.catatan_wali_kelas && (
            <div>
              <p className="text-[13px] font-semibold text-[var(--color-ink)]">Catatan Wali Kelas</p>
              <p className="text-sm text-[var(--color-ink-soft)]">{catatan.catatan_wali_kelas}</p>
            </div>
          )}
          <div className="flex justify-end gap-2 border-t border-[var(--color-border)] pt-3">
            <Button type="button" variant="outline" onClick={onClose}>Tutup</Button>
            <Button type="button" onClick={handlePrint}><Printer className="h-4 w-4" /> Cetak / PDF</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

// =========================================================================
// TAB: MATA PELAJARAN
// =========================================================================
function MataPelajaranTab() {
  const [schools, setSchools] = useState([])
  const [schoolFilter, setSchoolFilter] = useState('')
  const [mapelList, setMapelList] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ school_id: '', nama: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Daftar unit sekolah & filter default dimuat SEKALI, terpisah dari
  // reload daftar mapel — supaya filter unit yang sedang dipilih pengguna
  // tidak ke-reset setiap kali daftar mapel dimuat ulang setelah tambah/hapus.
  useEffect(() => {
    supabase.from('schools').select('id, nama, jenjang').order('jenjang').then(({ data }) => {
      setSchools(data || [])
      setSchoolFilter((prev) => prev || data?.[0]?.id || '')
    })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const { data: m } = await supabase.from('mata_pelajaran').select('*, schools!school_id(nama, jenjang)').order('nama')
    setMapelList(m || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const openAdd = () => { setForm({ school_id: schoolFilter || schools[0]?.id || '', nama: '' }); setError(''); setModalOpen(true) }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('mata_pelajaran').insert({ school_id: form.school_id, nama: form.nama.trim() })
    setSaving(false)
    if (err) { setError(err.message.includes('duplicate') ? 'Mata pelajaran ini sudah ada di unit tersebut.' : err.message); return }
    setModalOpen(false)
    load()
  }

  const handleDelete = async (m) => {
    if (!confirm(`Hapus mata pelajaran "${m.nama}"? Nilai yang sudah tercatat untuk mapel ini akan ikut terhapus.`)) return
    const { error: err } = await supabase.from('mata_pelajaran').delete().eq('id', m.id)
    if (err) { alert('Gagal menghapus: ' + err.message); return }
    load()
  }

  if (loading) return <FullPageSpinner />

  const filtered = mapelList.filter((m) => !schoolFilter || m.school_id === schoolFilter)

  return (
    <SectionCard
      title="Mata Pelajaran"
      description="Daftar mata pelajaran per unit sekolah — dipakai saat input nilai."
      actions={<Button size="sm" variant="outline" onClick={openAdd}><Plus className="h-4 w-4" /> Tambah</Button>}
    >
      <Select containerClassName="mb-4 sm:w-64" label="Unit Sekolah" value={schoolFilter} onChange={(e) => setSchoolFilter(e.target.value)}>
        {schools.map((s) => <option key={s.id} value={s.id}>{s.jenjang} — {s.nama}</option>)}
      </Select>
      {filtered.length === 0 ? <EmptyState icon={BookOpen} title="Belum ada mata pelajaran" description="Tambahkan mata pelajaran untuk unit sekolah ini." /> : (
        <Table columns={['Nama Mapel', '']}>
          {filtered.map((m) => (
            <Tr key={m.id}>
              <Td className="font-medium">{m.nama}</Td>
              <Td className="text-right">
                <button onClick={() => handleDelete(m)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]" aria-label="Hapus"><Trash2 className="h-4 w-4" /></button>
              </Td>
            </Tr>
          ))}
        </Table>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Tambah Mata Pelajaran">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Select label="Unit Sekolah" required value={form.school_id} onChange={(e) => setForm((s) => ({ ...s, school_id: e.target.value }))}>
            <option value="">— Pilih —</option>
            {schools.map((s) => <option key={s.id} value={s.id}>{s.jenjang} — {s.nama}</option>)}
          </Select>
          <Input label="Nama Mata Pelajaran" required placeholder="Matematika" value={form.nama} onChange={(e) => setForm((s) => ({ ...s, nama: e.target.value }))} />
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
