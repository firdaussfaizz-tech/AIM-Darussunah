import { useState, useRef } from 'react'
import { Download, FileSpreadsheet } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { Modal, Button, Select, Table, Tr, Td, Badge } from '../../components/ui'

// Definisi kolom template: [field, label, contoh].
const KOLOM = [
  ['nama_lengkap', 'Nama Lengkap*', 'Ahmad Fauzi'],
  ['nama_panggilan', 'Nama Panggilan', 'Fauzi'],
  ['nis', 'NIS', '262701001'],
  ['nisn', 'NISN', '3203796100'],
  ['nik', 'NIK', '3201xxxxxxxxxxxx'],
  ['jenis_kelamin', 'Jenis Kelamin (L/P)', 'L'],
  ['tempat_lahir', 'Tempat Lahir', 'Bekasi'],
  ['tanggal_lahir', 'Tanggal Lahir (YYYY-MM-DD)', '2015-08-17'],
  ['agama', 'Agama', 'Islam'],
  ['anak_ke', 'Anak ke-', '1'],
  ['jumlah_saudara', 'Jumlah Saudara', '2'],
  ['alamat', 'Alamat', 'Jl. Melati No. 1'],
  ['program', 'Program (fullday/boarding)', 'fullday'],
  ['status', 'Status (aktif/lulus/pindah/keluar)', 'aktif'],
  ['unit', 'Unit (SD/SMP/SMA/Boarding atau nama unit)', 'SD'],
  ['nama_ayah', 'Nama Ayah', ''],
  ['no_hp_ayah', 'No. HP Ayah', ''],
  ['nama_ibu', 'Nama Ibu', ''],
  ['no_hp_ibu', 'No. HP Ibu', ''],
  ['nama_wali', 'Nama Wali', ''],
  ['no_hp_wali', 'No. HP Wali', ''],
  ['email_ortu', 'Email Ortu', ''],
]

const STATUS_VALID = ['aktif', 'lulus', 'pindah', 'keluar']
const norm = (s) => String(s ?? '').trim().toLowerCase()

// Peta header (apa pun ejaannya) → field. Terima label manusiawi, nama field,
// dan beberapa sinonim umum.
const HEADER_MAP = {}
for (const [field, label] of KOLOM) {
  HEADER_MAP[norm(field)] = field
  HEADER_MAP[norm(label)] = field
  HEADER_MAP[norm(label.replace(/\*.*$/, '').replace(/\(.*\)/, ''))] = field
}
// Sinonim tambahan agar toleran terhadap file sekolah yang sudah ada.
Object.assign(HEADER_MAP, {
  'nama': 'nama_lengkap', 'nama siswa': 'nama_lengkap', 'nama peserta didik': 'nama_lengkap',
  'l/p': 'jenis_kelamin', 'jk': 'jenis_kelamin', 'jenis kelamin': 'jenis_kelamin', 'gender': 'jenis_kelamin',
  'tgl lahir': 'tanggal_lahir', 'tanggal lahir': 'tanggal_lahir', 'ttl': 'tanggal_lahir',
  'unit': 'unit', 'sekolah': 'unit', 'jenjang': 'unit', 'satuan pendidikan': 'unit',
  'no hp ayah': 'no_hp_ayah', 'no hp ibu': 'no_hp_ibu', 'email': 'email_ortu', 'email orang tua': 'email_ortu',
})

function normalTanggal(v) {
  if (v == null || v === '') return null
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const p = (n) => String(n).padStart(2, '0')
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`
  }
  const s = String(v).trim()
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/) // DD-MM-YYYY
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return null
}
function normalJk(v) {
  const s = norm(v)
  if (!s) return null
  if (s === 'l' || s.startsWith('laki')) return 'L'
  if (s === 'p' || s.startsWith('perempuan') || s === 'w') return 'P'
  return null
}
function toInt(v) {
  if (v == null || v === '') return null
  const n = parseInt(String(v).replace(/\D/g, ''), 10)
  return Number.isNaN(n) ? null : n
}
function ringkasError(msg) {
  if (/siswa_nisn_unik_idx/.test(msg)) return 'NISN sudah dipakai siswa lain.'
  if (/siswa_nis_per_sekolah_idx/.test(msg)) return 'NIS sudah dipakai di unit yang sama.'
  if (/null value in column "nama_lengkap"/.test(msg)) return 'Nama lengkap kosong.'
  return msg
}

export default function StudentImportModal({ open, onClose, onImported, schools = [], lockedSchoolId = null }) {
  const [rows, setRows] = useState([])
  const [fileName, setFileName] = useState('')
  const [defaultSchool, setDefaultSchool] = useState(lockedSchoolId || '')
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [log, setLog] = useState([])
  const addLog = (m) => setLog((l) => [...l, m])
  const fileRef = useRef(null)

  const resolveSchool = (unitStr) => {
    if (lockedSchoolId) return lockedSchoolId
    const u = norm(unitStr)
    if (u) {
      const byJenjang = schools.find((s) => norm(s.jenjang) === u)
      if (byJenjang) return byJenjang.id
      const byNama = schools.find((s) => norm(s.nama) === u || norm(s.nama).includes(u))
      if (byNama) return byNama.id
    }
    return defaultSchool || null
  }

  const unduhTemplate = async () => {
    try {
      const XLSX = await import('xlsx')
      const aoa = [KOLOM.map((k) => k[1]), KOLOM.map((k) => k[2])]
      const ws = XLSX.utils.aoa_to_sheet(aoa)
      ws['!cols'] = KOLOM.map((k) => ({ wch: Math.max(14, k[1].length + 2) }))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Siswa')
      const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
      const url = URL.createObjectURL(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      const a = document.createElement('a')
      a.href = url; a.download = 'Template-Impor-Siswa.xlsx'
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 2000)
    } catch (err) {
      setError('Gagal membuat template: ' + (err?.message || err))
    }
  }

  const bacaBuffer = (file) => new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result)
    fr.onerror = () => reject(fr.error || new Error('FileReader gagal'))
    fr.readAsArrayBuffer(file)
  })

  const prosesFile = async (file) => {
    setLog([])
    if (!file) { addLog('Tidak ada file terpilih.'); return }
    setParsing(true); setError(''); setResult(null); setRows([]); setFileName(file.name)
    addLog(`File dipilih: ${file.name} (${Math.round(file.size / 1024)} KB)`)
    try {
      addLog('Memuat pustaka Excel…')
      const XLSX = await import('xlsx')
      addLog('Membaca isi file…')
      const buf = await bacaBuffer(file)
      const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true })
      addLog(`Sheet ditemukan: ${(wb.SheetNames || []).join(', ') || '(tidak ada)'}`)
      const ws = wb.Sheets[wb.SheetNames[0]]
      if (!ws) { setError('File tidak memiliki sheet data.'); setParsing(false); return }
      const raw = XLSX.utils.sheet_to_json(ws, { defval: '' })
      const detected = raw.length ? Object.keys(raw[0]) : []
      addLog(`Baris data terbaca: ${raw.length}. Kolom: ${detected.join(' | ') || '(kosong)'}`)
      const mapped = []
      for (const r of raw) {
        const obj = {}
        for (const [key, val] of Object.entries(r)) {
          const field = HEADER_MAP[norm(key)]
          if (field) obj[field] = val
        }
        if (!String(obj.nama_lengkap ?? '').trim()) continue
        const unitStr = obj.unit
        mapped.push({
          payload: {
            nama_lengkap: String(obj.nama_lengkap).trim(),
            nama_panggilan: obj.nama_panggilan ? String(obj.nama_panggilan).trim() : null,
            nis: obj.nis ? String(obj.nis).trim() : null,
            nisn: obj.nisn ? String(obj.nisn).trim() : null,
            nik: obj.nik ? String(obj.nik).trim() : null,
            jenis_kelamin: normalJk(obj.jenis_kelamin),
            tempat_lahir: obj.tempat_lahir ? String(obj.tempat_lahir).trim() : null,
            tanggal_lahir: normalTanggal(obj.tanggal_lahir),
            agama: obj.agama ? String(obj.agama).trim() : null,
            anak_ke: toInt(obj.anak_ke),
            jumlah_saudara: toInt(obj.jumlah_saudara),
            alamat: obj.alamat ? String(obj.alamat).trim() : null,
            program: norm(obj.program).includes('boarding') || norm(obj.program).includes('asrama') ? 'boarding' : 'fullday',
            status: STATUS_VALID.includes(norm(obj.status)) ? norm(obj.status) : 'aktif',
            school_id: resolveSchool(unitStr),
            nama_ayah: obj.nama_ayah ? String(obj.nama_ayah).trim() : null,
            no_hp_ayah: obj.no_hp_ayah ? String(obj.no_hp_ayah).trim() : null,
            nama_ibu: obj.nama_ibu ? String(obj.nama_ibu).trim() : null,
            no_hp_ibu: obj.no_hp_ibu ? String(obj.no_hp_ibu).trim() : null,
            nama_wali: obj.nama_wali ? String(obj.nama_wali).trim() : null,
            no_hp_wali: obj.no_hp_wali ? String(obj.no_hp_wali).trim() : null,
            email_ortu: obj.email_ortu ? String(obj.email_ortu).trim() : null,
          },
        })
      }
      addLog(`Siswa valid (Nama Lengkap terisi): ${mapped.length}`)
      setRows(mapped)
      if (mapped.length === 0) {
        setError(detected.length
          ? `Tidak ada baris dengan "Nama Lengkap" terisi. Kolom terdeteksi: ${detected.join(', ')}.`
          : 'File kosong atau tidak terbaca. Pastikan baris pertama berisi judul kolom (gunakan template).')
      }
    } catch (err) {
      addLog('ERROR: ' + (err?.message || err))
      setError('Gagal membaca file: ' + (err?.message || err))
      setRows([])
    } finally {
      setParsing(false)
    }
  }

  // Dua jalur agar andal di semua browser: (1) event onChange input file,
  // (2) tombol "Proses File" yang membaca langsung dari ref.
  const onPilihFile = (e) => { const f = e.target.files && e.target.files[0]; prosesFile(f) }
  const prosesDariTombol = () => {
    const f = fileRef.current?.files?.[0]
    if (!f) { setError('Pilih file dulu di kotak di atas, lalu klik "Proses File".'); return }
    prosesFile(f)
  }

  const unitNama = (id) => { const s = schools.find((x) => x.id === id); return s ? `${s.jenjang} — ${s.nama}` : '— (tanpa unit)' }

  const jalankanImpor = async () => {
    setImporting(true); setError(''); setResult(null)
    const payloads = rows.map((r) => r.payload)
    let sukses = 0
    const gagal = []
    const CHUNK = 100
    for (let i = 0; i < payloads.length; i += CHUNK) {
      const batch = payloads.slice(i, i + CHUNK)
      const { error: err } = await supabase.from('siswa').insert(batch)
      if (!err) { sukses += batch.length; continue }
      for (const p of batch) {
        const { error: e2 } = await supabase.from('siswa').insert(p)
        if (e2) gagal.push({ nama: p.nama_lengkap, pesan: ringkasError(e2.message) })
        else sukses += 1
      }
    }
    setImporting(false)
    setResult({ sukses, gagal })
    if (sukses > 0) onImported?.()
  }

  const reset = () => { setRows([]); setResult(null); setError(''); setFileName(''); setLog([]) }

  const valid = rows.length
  const tanpaUnit = rows.filter((r) => !r.payload.school_id).length

  return (
    <Modal open={open} onClose={() => { reset(); onClose() }} title="Impor Siswa dari Excel" width="max-w-3xl">
      <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">
        <div className="rounded-md bg-[var(--color-success-soft)] px-3 py-2 text-xs font-semibold text-[var(--color-success)]">✓ Impor Siswa v3 — jika Anda melihat baris ini, versi terbaru sudah termuat.</div>
        <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-navy-50)] p-3 text-sm text-[var(--color-ink)]">
          <p className="font-medium">Cara impor:</p>
          <ol className="ml-4 mt-1 list-decimal space-y-0.5 text-[13px] text-[var(--color-ink-soft)]">
            <li>Unduh template, isi data siswa (satu baris satu siswa). Hanya <b>Nama Lengkap</b> yang wajib.</li>
            <li>Kolom <b>Unit</b> boleh diisi SD/SMP/SMA/Boarding; bila kosong dipakai unit default di bawah.</li>
            <li>Unggah file, periksa pratinjau, lalu klik <b>Impor</b>.</li>
          </ol>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <Button type="button" variant="outline" onClick={unduhTemplate}><Download className="h-4 w-4" /> Unduh Template</Button>
          {!lockedSchoolId && (
            <Select containerClassName="w-60" label="Unit default (bila kolom Unit kosong)" value={defaultSchool} onChange={(e) => setDefaultSchool(e.target.value)}>
              <option value="">— tanpa unit —</option>
              {schools.map((s) => <option key={s.id} value={s.id}>{s.jenjang} — {s.nama}</option>)}
            </Select>
          )}
          <div className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-[var(--color-ink)]">Pilih File Excel/CSV {parsing && <span className="text-[var(--color-navy)]">— membaca…</span>}</span>
            <div className="flex items-center gap-2">
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={onPilihFile}
                className="block text-sm text-[var(--color-ink)] file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-[var(--color-navy)] file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:brightness-110" />
              <Button type="button" variant="outline" onClick={prosesDariTombol} disabled={parsing}>Proses File</Button>
            </div>
            <span className="text-[11px] text-[var(--color-ink-soft)]">Setelah memilih file, bila pratinjau tak muncul otomatis, klik <b>Proses File</b>.</span>
          </div>
        </div>

        {fileName && !error && !result && (
          <p className="text-xs text-[var(--color-ink-soft)]"><FileSpreadsheet className="mr-1 inline h-3.5 w-3.5" />{fileName}{parsing ? ' — membaca…' : ''}</p>
        )}

        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}

        <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-paper)] px-3 py-2">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">Status Proses</p>
          <ul className="space-y-0.5 text-xs text-[var(--color-ink-soft)]">
            {log.length === 0
              ? <li className="italic">Menunggu file dipilih…</li>
              : log.map((m, i) => <li key={i} className={m.startsWith('ERROR') ? 'text-[var(--color-danger)]' : ''}>• {m}</li>)}
          </ul>
        </div>

        {rows.length > 0 && !result && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <FileSpreadsheet className="h-4 w-4 text-[var(--color-navy)]" />
              <span>{fileName}</span>
              <Badge color="navy">{valid} siswa siap diimpor</Badge>
              {tanpaUnit > 0 && <Badge color="gold">{tanpaUnit} tanpa unit</Badge>}
            </div>
            <div className="max-h-64 overflow-auto rounded-md border border-[var(--color-border)]">
              <Table columns={['#', 'Nama', 'JK', 'NISN', 'Program', 'Unit']}>
                {rows.slice(0, 50).map((r, i) => (
                  <Tr key={i}>
                    <Td className="text-xs text-[var(--color-ink-soft)]">{i + 1}</Td>
                    <Td className="font-medium">{r.payload.nama_lengkap}</Td>
                    <Td className="text-xs">{r.payload.jenis_kelamin || '—'}</Td>
                    <Td className="text-xs">{r.payload.nisn || '—'}</Td>
                    <Td className="text-xs capitalize">{r.payload.program}</Td>
                    <Td className="text-xs text-[var(--color-ink-soft)]">{unitNama(r.payload.school_id)}</Td>
                  </Tr>
                ))}
              </Table>
            </div>
            {rows.length > 50 && <p className="text-xs text-[var(--color-ink-soft)]">Menampilkan 50 dari {rows.length} baris.</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={reset}>Ganti File</Button>
              <Button type="button" onClick={jalankanImpor} disabled={importing}>{importing ? 'Mengimpor…' : `Impor ${valid} Siswa`}</Button>
            </div>
          </div>
        )}

        {result && (
          <div className="flex flex-col gap-2">
            <div className="rounded-md bg-[var(--color-success-soft)] px-3 py-2 text-sm text-[var(--color-success)]">{result.sukses} siswa berhasil diimpor.</div>
            {result.gagal.length > 0 && (
              <div className="rounded-md border border-[var(--color-border)] p-3">
                <p className="mb-1 text-sm font-medium text-[var(--color-danger)]">{result.gagal.length} baris gagal:</p>
                <ul className="max-h-40 list-disc space-y-0.5 overflow-auto pl-5 text-xs text-[var(--color-ink-soft)]">
                  {result.gagal.slice(0, 50).map((g, i) => <li key={i}><b>{g.nama}</b> — {g.pesan}</li>)}
                </ul>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={reset}>Impor Lagi</Button>
              <Button type="button" onClick={() => { reset(); onClose() }}>Selesai</Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
