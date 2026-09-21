import { useState } from 'react'
import Papa from 'papaparse'
import { Upload, ArrowRight, CheckCircle2, AlertTriangle } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { Modal, Button, Select, EmptyState } from '../../components/ui'

const DATE_FORMATS = [
  { value: 'YYYY-MM-DD', label: '2026-09-17' },
  { value: 'DD/MM/YYYY', label: '17/09/2026' },
  { value: 'MM/DD/YYYY', label: '09/17/2026' },
]

function parseDate(raw, fmt) {
  if (!raw) return null
  const clean = String(raw).trim().replace(/[.]/g, '/').replace(/-/g, '/')
  const parts = clean.split(/[/ ]/).filter(Boolean)
  if (parts.length < 3) return null
  let y, m, d
  if (fmt === 'YYYY-MM-DD') { [y, m, d] = parts }
  else if (fmt === 'DD/MM/YYYY') { [d, m, y] = parts }
  else { [m, d, y] = parts }
  if (!y || !m || !d) return null
  if (y.length === 2) y = `20${y}`
  const mm = m.padStart(2, '0')
  const dd = d.padStart(2, '0')
  if (Number(mm) > 12 || Number(dd) > 31) return null
  return `${y}-${mm}-${dd}`
}

function parseTime(raw) {
  if (!raw) return null
  const match = String(raw).trim().match(/(\d{1,2}):(\d{2})/)
  if (!match) return null
  return `${match[1].padStart(2, '0')}:${match[2]}:00`
}

export default function FingerprintImportModal({ open, onClose, onImported }) {
  const [step, setStep] = useState('upload') // upload | mapping | processing | result
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState([])
  const [rows, setRows] = useState([])
  const [mapping, setMapping] = useState({ pin: '', tanggal: '', jam: '', jenis: '' })
  const [dateFormat, setDateFormat] = useState('YYYY-MM-DD')
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const reset = () => {
    setStep('upload'); setFileName(''); setHeaders([]); setRows([])
    setMapping({ pin: '', tanggal: '', jam: '', jenis: '' }); setError(''); setResult(null)
  }

  const handleClose = () => { reset(); onClose() }

  const handleFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setError('')
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        if (!res.meta.fields || res.meta.fields.length === 0) {
          setError('Tidak dapat membaca kolom pada file ini. Pastikan file berformat CSV dengan baris judul kolom.')
          return
        }
        setHeaders(res.meta.fields)
        setRows(res.data)
        // Tebak otomatis kolom yang cocok, admin tetap bisa mengubahnya
        const guess = (keywords) => res.meta.fields.find((f) => keywords.some((k) => f.toLowerCase().includes(k))) || ''
        setMapping({
          pin: guess(['pin', 'id', 'nik', 'no. karyawan', 'employee']),
          tanggal: guess(['tanggal', 'date']),
          jam: guess(['jam', 'time', 'waktu']),
          jenis: guess(['jenis', 'mode', 'status', 'type', 'in/out']),
        })
        setStep('mapping')
      },
      error: () => setError('Gagal membaca file. Pastikan formatnya CSV.'),
    })
  }

  const handleProcess = async () => {
    if (!mapping.pin || !mapping.tanggal || !mapping.jam) {
      setError('Lengkapi pemetaan kolom PIN, Tanggal, dan Jam terlebih dahulu.')
      return
    }
    setStep('processing')
    setError('')

    // 1. Susun data mentah: pin -> tanggal -> daftar jam
    const raw = {}
    const unmatchedPins = new Set()
    let skipped = 0
    for (const row of rows) {
      const pin = String(row[mapping.pin] || '').trim()
      const tanggal = parseDate(row[mapping.tanggal], dateFormat)
      const jam = parseTime(row[mapping.jam])
      if (!pin || !tanggal || !jam) { skipped++; continue }
      const jenisRaw = mapping.jenis ? String(row[mapping.jenis] || '').toLowerCase() : ''
      raw[pin] = raw[pin] || {}
      raw[pin][tanggal] = raw[pin][tanggal] || []
      raw[pin][tanggal].push({ jam, jenisRaw })
    }

    // 2. Cocokkan PIN ke data pegawai
    const pins = Object.keys(raw)
    const { data: employees } = await supabase.from('employees').select('id, pin_fingerprint').in('pin_fingerprint', pins)
    const pinToEmployee = {}
    ;(employees || []).forEach((e) => { pinToEmployee[e.pin_fingerprint] = e.id })
    pins.forEach((p) => { if (!pinToEmployee[p]) unmatchedPins.add(p) })

    // 3. Tentukan jam masuk/pulang per pegawai per tanggal
    const perEmployeeDay = {} // key: employeeId_tanggal -> { jam_masuk, jam_pulang }
    for (const pin of pins) {
      const employeeId = pinToEmployee[pin]
      if (!employeeId) continue
      for (const tanggal of Object.keys(raw[pin])) {
        const entries = raw[pin][tanggal]
        let jamMasuk = null, jamPulang = null
        const masukEntry = entries.find((e) => /masuk|in\b/.test(e.jenisRaw))
        const pulangEntry = entries.find((e) => /pulang|keluar|out\b/.test(e.jenisRaw))
        if (masukEntry || pulangEntry) {
          jamMasuk = masukEntry?.jam || null
          jamPulang = pulangEntry?.jam || null
        } else {
          const sorted = [...entries].map((e) => e.jam).sort()
          jamMasuk = sorted[0]
          jamPulang = sorted.length > 1 ? sorted[sorted.length - 1] : null
        }
        perEmployeeDay[`${employeeId}_${tanggal}`] = { employee_id: employeeId, tanggal, jam_masuk: jamMasuk, jam_pulang: jamPulang }
      }
    }

    const keys = Object.keys(perEmployeeDay)
    if (keys.length === 0) {
      setResult({ processed: 0, unmatchedPins: [...unmatchedPins], skipped })
      setStep('result')
      return
    }

    // Simpan per-batch (bukan satu request per baris) — jauh lebih cepat
    // untuk file besar, dan setiap batch benar-benar dicek error-nya
    // (sebelumnya baris yang gagal tersimpan tetap dihitung "berhasil").
    // Baris yang SUDAH ada (existingMap) dipertahankan statusnya (mis.
    // Cuti/Izin manual) — hanya jam_masuk/jam_pulang yang diperbarui,
    // makanya upsert TIDAK menyertakan kolom status.
    const BATCH_SIZE = 300
    const upsertRows = keys.map((key) => {
      const { employee_id, tanggal, jam_masuk, jam_pulang } = perEmployeeDay[key]
      return { employee_id, tanggal, jam_masuk, jam_pulang }
    })
    let processed = 0
    const failedBatches = []
    for (let i = 0; i < upsertRows.length; i += BATCH_SIZE) {
      const batch = upsertRows.slice(i, i + BATCH_SIZE)
      const { error: batchErr } = await supabase.from('attendance').upsert(batch, { onConflict: 'employee_id,tanggal' })
      if (batchErr) failedBatches.push({ jumlah: batch.length, pesan: batchErr.message })
      else processed += batch.length
    }

    setResult({ processed, unmatchedPins: [...unmatchedPins], skipped, failedBatches })
    setStep('result')
  }

  return (
    <Modal open={open} onClose={handleClose} title="Impor Presensi dari Fingerprint" width="max-w-2xl">
      {step === 'upload' && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-[var(--color-ink-soft)]">
            Unduh data presensi dari dashboard cloud Solution Anda sebagai file <strong>CSV</strong>, lalu unggah di sini.
            Kalau hasil unduhannya berupa Excel, buka lalu simpan ulang (Save As) sebagai CSV terlebih dahulu.
          </p>
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-[var(--radius-card)] border-2 border-dashed border-[var(--color-border)] p-10 text-center hover:border-[var(--color-navy)]">
            <Upload className="h-8 w-8 text-[var(--color-ink-soft)]" />
            <span className="text-sm font-medium text-[var(--color-ink)]">{fileName || 'Klik untuk pilih file CSV'}</span>
            <input type="file" accept=".csv" className="hidden" onChange={handleFile} />
          </label>
          {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        </div>
      )}

      {step === 'mapping' && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-[var(--color-ink-soft)]">
            File <strong>{fileName}</strong> terbaca, {rows.length} baris. Cocokkan kolom di file dengan data yang dibutuhkan
            (tebakan otomatis sudah diisi, silakan periksa/ubah).
          </p>
          <Select label="Kolom PIN Pegawai" required value={mapping.pin} onChange={(e) => setMapping((m) => ({ ...m, pin: e.target.value }))}>
            <option value="">— Pilih kolom —</option>
            {headers.map((h) => <option key={h} value={h}>{h}</option>)}
          </Select>
          <div className="grid grid-cols-2 gap-4">
            <Select label="Kolom Tanggal" required value={mapping.tanggal} onChange={(e) => setMapping((m) => ({ ...m, tanggal: e.target.value }))}>
              <option value="">— Pilih kolom —</option>
              {headers.map((h) => <option key={h} value={h}>{h}</option>)}
            </Select>
            <Select label="Format Tanggal" value={dateFormat} onChange={(e) => setDateFormat(e.target.value)}>
              {DATE_FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </Select>
          </div>
          <Select label="Kolom Jam" required value={mapping.jam} onChange={(e) => setMapping((m) => ({ ...m, jam: e.target.value }))}>
            <option value="">— Pilih kolom —</option>
            {headers.map((h) => <option key={h} value={h}>{h}</option>)}
          </Select>
          <Select label="Kolom Jenis (Masuk/Pulang) — opsional" value={mapping.jenis} onChange={(e) => setMapping((m) => ({ ...m, jenis: e.target.value }))}>
            <option value="">— Tidak ada, tentukan otomatis dari urutan jam —</option>
            {headers.map((h) => <option key={h} value={h}>{h}</option>)}
          </Select>
          {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setStep('upload')}>Kembali</Button>
            <Button type="button" onClick={handleProcess}>Proses <ArrowRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}

      {step === 'processing' && (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-navy)]" />
          <p className="text-sm text-[var(--color-ink-soft)]">Memproses dan mencocokkan data…</p>
        </div>
      )}

      {step === 'result' && result && (
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3 rounded-[var(--radius-card)] bg-[var(--color-success-soft)] p-4">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-success)]" />
            <p className="text-sm text-[var(--color-success)]">
              <strong>{result.processed}</strong> data presensi (kombinasi pegawai + tanggal) berhasil diproses.
            </p>
          </div>
          {result.unmatchedPins.length > 0 && (
            <div className="flex items-start gap-3 rounded-[var(--radius-card)] bg-[var(--color-gold-soft)] p-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-gold)]" />
              <div className="text-sm text-[var(--color-gold)]">
                <p><strong>{result.unmatchedPins.length}</strong> PIN tidak dikenal (belum ada pegawai dengan PIN Mesin Fingerprint ini):</p>
                <p className="mt-1 font-mono text-xs">{result.unmatchedPins.join(', ')}</p>
                <p className="mt-1">Isi kolom "PIN Mesin Fingerprint" di halaman Data Pegawai, lalu impor ulang baris yang sama tidak masalah — data akan diperbarui, bukan dobel.</p>
              </div>
            </div>
          )}
          {result.skipped > 0 && (
            <p className="text-sm text-[var(--color-ink-soft)]">{result.skipped} baris dilewati karena data tanggal/jam tidak terbaca.</p>
          )}
          {result.failedBatches?.length > 0 && (
            <div className="flex items-start gap-3 rounded-[var(--radius-card)] bg-[var(--color-danger-soft)] p-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-danger)]" />
              <div className="text-sm text-[var(--color-danger)]">
                <p><strong>{result.failedBatches.reduce((s, b) => s + b.jumlah, 0)}</strong> data GAGAL tersimpan (tidak termasuk dalam angka berhasil di atas):</p>
                <ul className="mt-1 list-inside list-disc">
                  {result.failedBatches.map((b, i) => <li key={i}>{b.jumlah} data — {b.pesan}</li>)}
                </ul>
                <p className="mt-1">Aman untuk mengimpor ulang file yang sama setelah masalahnya diperbaiki — data yang sudah berhasil tidak akan dobel.</p>
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={() => { handleClose(); onImported() }}>Selesai</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
