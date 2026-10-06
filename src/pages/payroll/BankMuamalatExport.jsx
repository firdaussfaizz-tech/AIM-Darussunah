import { useEffect, useMemo, useState } from 'react'
import { Download, AlertTriangle } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { Modal, Input, Button, Badge } from '../../components/ui'
import { BULAN, formatRupiah } from '../../lib/format'

// =====================================================================
// EKSPOR FILE PAYROLL — BANK MUAMALAT
//
// Menghasilkan file .xls PERSIS sesuai template unggah massal Bank
// Muamalat (14 kolom, urutan tetap) dari slip gaji periode yang SUDAH
// DIFINALISASI. Nilai per kolom:
//   Account Number : employees.rekening_nomor (ditulis sebagai TEKS agar
//                    angka nol di depan tidak hilang).
//   Amount         : gaji bersih, dibulatkan ke rupiah bulat (tanpa desimal).
//   Message        : "GAJI <BULAN> <TAHUN> - <NAMA>".
//   Name           : rekening_atas_nama (fallback: nama pegawai).
//   Transfer Type / Bank Code / Resident / WNI / RTGS Code / Customer type /
//   From City Code / From Address / To City Code / To Address :
//                    kolom berkode khas bank. TIDAK dikarang di sini —
//                    diisi dari "Konstanta File Bank" yang bisa diedit
//                    pengguna (disimpan di browser) sesuai panduan unggah
//                    Muamalat. Karena seluruh gaji disalurkan sesama
//                    Muamalat (in-house), kolom Bank Code/RTGS/Kota/Alamat
//                    default dikosongkan.
//
// Catatan: penulisan .xls (format lama BIFF) memakai SheetJS yang diimpor
// secara DINAMIS hanya saat tombol unduh ditekan — agar tidak menambah
// berat bundle utama aplikasi.
// =====================================================================

// Urutan kolom WAJIB sama persis dengan template (payroll_template.xls).
const HEADER = [
  'Account Number', 'Amount', 'Message', 'Transfer Type', 'Bank Code', 'Name',
  'Resident', 'WNI', 'RTGS Code', 'Customer type', 'From City Code',
  'From Address', 'To City Code', 'To Address',
]

const LS_KEY = 'bankfile:muamalat:v1'

// Default konservatif. Resident/WNI/Customer type diisi nilai yang paling
// lazim untuk rekening perorangan WNI dalam negeri, TETAP bisa diubah
// pengguna. Transfer Type sengaja kosong agar pengguna mengisinya sesuai
// kode jenis transfer di panduan Muamalat (tidak ditebak).
const DEFAULT_KONST = {
  transferType: '',
  bankCode: '',
  resident: 'Y',
  wni: 'Y',
  rtgsCode: '',
  customerType: '1',
  fromCityCode: '',
  fromAddress: '',
  toCityCode: '',
  toAddress: '',
}

function bacaKonst() {
  try {
    const saved = localStorage.getItem(LS_KEY)
    return saved ? { ...DEFAULT_KONST, ...JSON.parse(saved) } : { ...DEFAULT_KONST }
  } catch {
    return { ...DEFAULT_KONST }
  }
}

function simpanKonst(k) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(k)) } catch { /* abaikan bila storage diblokir */ }
}

export default function BankMuamalatExport({ open, onClose, run, details }) {
  const [konst, setKonst] = useState(DEFAULT_KONST)
  const [rekMap, setRekMap] = useState(null) // { employee_id: {rekening_nomor, rekening_atas_nama, bank_nama} }
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setKonst(bacaKonst())
    setError('')
    const ids = details.map((d) => d.employee_id)
    if (ids.length === 0) { setRekMap({}); return }
    setLoading(true)
    supabase.from('employees').select('id, nama, bank_nama, rekening_nomor, rekening_atas_nama').in('id', ids)
      .then(({ data, error: err }) => {
        if (err) { setError(err.message); setRekMap({}); return }
        const map = {}
        ;(data || []).forEach((e) => { map[e.id] = e })
        setRekMap(map)
      })
      .finally(() => setLoading(false))
  }, [open, details])

  const setK = (field) => (e) => setKonst((k) => ({ ...k, [field]: e.target.value }))

  // Pisahkan slip yang siap (punya nomor rekening) dari yang belum.
  const { siap, belum } = useMemo(() => {
    const siap = []
    const belum = []
    if (!rekMap) return { siap, belum }
    for (const d of details) {
      const e = rekMap[d.employee_id]
      const nomor = (e?.rekening_nomor || '').trim()
      if (nomor) siap.push({ d, e, nomor })
      else belum.push({ d, e })
    }
    return { siap, belum }
  }, [details, rekMap])

  const buatBaris = () => {
    const namaBulan = (BULAN[run.periode_bulan - 1] || '').toUpperCase()
    return siap.map(({ d, e, nomor }) => {
      const nama = d.employees?.nama || e?.nama || ''
      const atasNama = (e?.rekening_atas_nama || '').trim() || nama
      return {
        'Account Number': nomor,
        'Amount': Math.round(Number(d.gaji_bersih) || 0),
        'Message': `GAJI ${namaBulan} ${run.periode_tahun} - ${nama}`.trim(),
        'Transfer Type': konst.transferType,
        'Bank Code': konst.bankCode,
        'Name': atasNama,
        'Resident': konst.resident,
        'WNI': konst.wni,
        'RTGS Code': konst.rtgsCode,
        'Customer type': konst.customerType,
        'From City Code': konst.fromCityCode,
        'From Address': konst.fromAddress,
        'To City Code': konst.toCityCode,
        'To Address': konst.toAddress,
      }
    })
  }

  const handleDownload = async () => {
    if (siap.length === 0) { setError('Tidak ada pegawai dengan nomor rekening untuk diekspor.'); return }
    setDownloading(true)
    setError('')
    try {
      simpanKonst(konst)
      const XLSX = await import('xlsx')
      const baris = buatBaris()
      const aoa = [HEADER, ...baris.map((b) => HEADER.map((h) => b[h]))]
      const ws = XLSX.utils.aoa_to_sheet(aoa)
      // Account Number (kolom A) + City Code (kolom K & M) dipaksa bertipe
      // TEKS agar nol di depan tidak hilang / kode kota tidak jadi angka.
      for (let r = 1; r <= baris.length; r++) {
        for (const col of ['A', 'K', 'M']) {
          const ref = `${col}${r + 1}`
          if (ws[ref] != null && ws[ref].v !== '') { ws[ref].t = 's'; ws[ref].v = String(ws[ref].v); ws[ref].z = '@' }
        }
      }
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
      const buf = XLSX.write(wb, { bookType: 'xls', type: 'array' })
      const blob = new Blob([buf], { type: 'application/vnd.ms-excel' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Payroll-Muamalat-${BULAN[run.periode_bulan - 1]}-${run.periode_tahun}.xls`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      onClose()
    } catch (err) {
      setError('Gagal membuat file: ' + (err?.message || String(err)))
    } finally {
      setDownloading(false)
    }
  }

  const totalSiap = siap.reduce((s, x) => s + (Math.round(Number(x.d.gaji_bersih) || 0)), 0)

  return (
    <Modal open={open} onClose={onClose} title="Unduh File Payroll — Bank Muamalat" width="max-w-2xl">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-[var(--color-ink-soft)]">
          Menghasilkan file <strong>.xls</strong> sesuai template unggah massal Bank Muamalat untuk periode{' '}
          <strong>{BULAN[run.periode_bulan - 1]} {run.periode_tahun}</strong>. Nomor rekening & atas nama diambil dari
          data Rekening Gaji tiap pegawai (menu Data Pegawai).
        </p>

        {loading ? (
          <p className="text-sm text-[var(--color-ink-soft)]">Memuat data rekening…</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge color="success">{siap.length} siap diekspor</Badge>
              {belum.length > 0 && <Badge color="danger">{belum.length} belum ada rekening</Badge>}
              <span className="text-[var(--color-ink-soft)]">· Total transfer: <strong>{formatRupiah(totalSiap)}</strong></span>
            </div>

            {belum.length > 0 && (
              <div className="rounded-md bg-[var(--color-gold-soft)] px-3 py-2 text-sm text-[var(--color-gold)]">
                <p className="flex items-center gap-1.5 font-medium"><AlertTriangle className="h-4 w-4" /> {belum.length} pegawai dilewati karena belum ada Nomor Rekening:</p>
                <p className="mt-1 text-[13px] leading-relaxed">{belum.map(({ d, e }) => d.employees?.nama || e?.nama || d.employee_id).join(', ')}</p>
                <p className="mt-1 text-[13px]">Isi dulu lewat Data Pegawai → Ubah Biodata → Rekening Gaji, lalu ekspor ulang.</p>
              </div>
            )}

            <div className="rounded-md border border-[var(--color-border)] p-3">
              <p className="mb-1 text-[13px] font-semibold text-[var(--color-ink)]">Konstanta File Bank</p>
              <p className="mb-3 text-[12px] text-[var(--color-ink-soft)]">
                Nilai kolom berkode khas Bank Muamalat. <strong>Periksa & sesuaikan dengan panduan unggah Muamalat Anda</strong> sebelum
                mengunggah (bila ragu, tanyakan ke RM/cabang). Nilai ini diingat di browser ini. Karena semua gaji disalurkan sesama
                Muamalat (in-house), Bank Code/RTGS/Kota/Alamat umumnya dikosongkan.
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input label="Transfer Type" value={konst.transferType} onChange={setK('transferType')} placeholder="Isi sesuai panduan Muamalat" />
                <Input label="Customer type" value={konst.customerType} onChange={setK('customerType')} placeholder="mis. 1 (perorangan)" />
                <Input label="Resident" value={konst.resident} onChange={setK('resident')} placeholder="mis. Y" />
                <Input label="WNI" value={konst.wni} onChange={setK('wni')} placeholder="mis. Y" />
                <Input label="Bank Code" value={konst.bankCode} onChange={setK('bankCode')} placeholder="kosong utk in-house" />
                <Input label="RTGS Code" value={konst.rtgsCode} onChange={setK('rtgsCode')} placeholder="kosong utk in-house" />
                <Input label="From City Code" value={konst.fromCityCode} onChange={setK('fromCityCode')} placeholder="opsional" />
                <Input label="To City Code" value={konst.toCityCode} onChange={setK('toCityCode')} placeholder="opsional" />
                <Input label="From Address" value={konst.fromAddress} onChange={setK('fromAddress')} placeholder="opsional" containerClassName="sm:col-span-2" />
                <Input label="To Address" value={konst.toAddress} onChange={setK('toAddress')} placeholder="opsional" containerClassName="sm:col-span-2" />
              </div>
            </div>
          </>
        )}

        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="button" onClick={handleDownload} disabled={downloading || loading || siap.length === 0}>
            <Download className="h-4 w-4" /> {downloading ? 'Membuat file…' : `Unduh .xls (${siap.length})`}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
