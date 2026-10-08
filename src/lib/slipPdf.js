// =====================================================================
// GENERATOR SLIP GAJI — PDF ASLI (Rekomendasi Asesmen ERP/HRIS #10).
//
// Menggantikan pendekatan lama window.print() (yang mengandalkan dialog
// cetak browser) dengan PDF sungguhan yang langsung terunduh. Memakai
// jsPDF yang diimpor SECARA DINAMIS (import() di dalam fungsi) agar tidak
// menambah berat bundle awal — library hanya diunduh saat pengguna benar-
// benar menekan tombol "Unduh Slip (PDF)".
//
// Isi slip identik dengan rincian pada layar (SlipDetailBody / printSlip
// lama di PayrollList.jsx): P1 Komponen Tetap, P2 Remunerasi & Honor,
// Potongan, lalu Gaji Bersih.
// =====================================================================
import { formatRupiah } from './format'

const NAVY = [12, 35, 64]

/**
 * Hasilkan & unduh slip gaji sebagai PDF.
 * @param {Object} p
 * @param {Object} p.row - baris payroll_details { detail, gaji_pokok, total_tunjangan, total_potongan, gaji_bersih }
 * @param {string} p.nama - nama pegawai
 * @param {string} p.unit - unit/sekolah (mis. "SD — Al-hanif") atau "Kantor Yayasan Pusat"
 * @param {string} p.periode - label periode (mis. "Oktober 2026")
 */
export async function unduhSlipPdf({ row, nama, unit, periode }) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const marginX = 48
  const rightX = pageW - marginX
  let y = 58

  // --- Kop ---
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...NAVY)
  doc.text('SLIP GAJI', marginX, y)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(95)
  doc.text('Yayasan Pendidikan Islam Darussunah', marginX, y + 16)
  y += 30
  doc.setDrawColor(210); doc.setLineWidth(0.8); doc.line(marginX, y, rightX, y)
  y += 22

  // --- Identitas ---
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(30)
  doc.text(String(nama || '—'), marginX, y)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(95)
  doc.text(String(unit || '—'), marginX, y + 14)
  doc.text(`Periode: ${periode || '—'}`, marginX, y + 28)
  y += 50

  const ensureSpace = () => { if (y > pageH - 80) { doc.addPage(); y = 58 } }

  const baris = (label, value, opts = {}) => {
    ensureSpace()
    if (opts.top) { doc.setDrawColor(224); doc.setLineWidth(0.6); doc.line(marginX, y - 11, rightX, y - 11) }
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal')
    doc.setFontSize(opts.bold ? 10.5 : 10)
    doc.setTextColor(opts.bold ? 30 : 70)
    const labelMax = rightX - marginX - 150
    const labelLines = doc.splitTextToSize(String(label), labelMax)
    doc.text(labelLines, marginX, y)
    doc.text(String(value), rightX, y, { align: 'right' })
    y += (opts.bold ? 18 : 15) + (labelLines.length - 1) * 12
  }

  const heading = (t) => {
    ensureSpace()
    y += 8
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...NAVY)
    doc.text(t.toUpperCase(), marginX, y)
    y += 15
  }

  const d = row.detail
  if (!d) {
    // Slip lama tanpa kolom `detail`.
    baris('Gaji Pokok', formatRupiah(row.gaji_pokok))
    baris('Total Tunjangan', `+${formatRupiah(row.total_tunjangan)}`)
    baris('Total Potongan', `-${formatRupiah(row.total_potongan)}`)
  } else {
    heading('P1 — Komponen Tetap')
    baris(`Gaji Pokok (Gol. ${d.golongan || '—'} / Ruang ${d.ruang || '—'})`, formatRupiah(d.gajiPokok))
    if (d.tunjanganStruktural > 0) baris('Tunjangan Jabatan Struktural', formatRupiah(d.tunjanganStruktural))
    if ((d.rincianFungsional || []).length) {
      d.rincianFungsional.forEach((t) => baris(`Tunjangan Fungsional — ${t.nama}${t.dibayarkan === false ? ' (tidak dibayar)' : ''}`, formatRupiah(t.nominal)))
    } else if (d.tunjanganFungsional > 0) {
      baris('Tunjangan Fungsional', formatRupiah(d.tunjanganFungsional))
    }
    baris('Tunjangan Transportasi & Makan', formatRupiah(d.transportMakan))
    baris('Total P1', formatRupiah(d.totalP1), { bold: true, top: true })

    heading('P2 — Remunerasi & Honor')
    baris(`Tunjangan Remunerasi${d.indeksKinerja != null && d.ihFinal != null ? ` (IK ${Number(d.indeksKinerja).toFixed(2)} x IH ${Number(d.ihFinal).toFixed(2)})` : ''}`, formatRupiah(d.tunjanganRemunerasi))
    if (d.honorMengajar > 0) baris(`Honor Jam Mengajar (${d.jpTambahan} JP)`, formatRupiah(d.honorMengajar))
    if (d.honorLembur > 0) baris(`Honor Lembur (${d.jamLembur} jam)`, formatRupiah(d.honorLembur))
    baris('Total P2', formatRupiah(d.totalP2), { bold: true, top: true })

    heading('Potongan')
    if (d.potonganBpjs > 0) baris('Potongan BPJS', `-${formatRupiah(d.potonganBpjs)}`)
    if (d.potonganPinjaman > 0) baris('Potongan Pinjaman/Cicilan', `-${formatRupiah(d.potonganPinjaman)}`)
    if (d.potonganLainnya > 0) baris('Potongan Lainnya', `-${formatRupiah(d.potonganLainnya)}`)
    if (d.totalPotongan === 0) baris('Tidak ada potongan', formatRupiah(0))
    baris('Total Potongan', `-${formatRupiah(d.totalPotongan)}`, { bold: true, top: true })
  }

  // --- Gaji Bersih (disorot) ---
  y += 14
  ensureSpace()
  doc.setFillColor(238, 244, 252)
  doc.rect(marginX, y - 15, rightX - marginX, 30, 'F')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...NAVY)
  doc.text('GAJI BERSIH', marginX + 12, y + 4)
  doc.text(formatRupiah(row.gaji_bersih), rightX - 12, y + 4, { align: 'right' })
  y += 42

  if (d && !d.lengkap) {
    ensureSpace()
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(165, 120, 0)
    doc.text('Catatan: sebagian data (Golongan/Indeks Kinerja) belum lengkap saat slip ini diproses.', marginX, y)
  }

  // --- Footer ---
  const tgl = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(150)
  doc.text(`Dicetak ${tgl} - Slip gaji ini dihasilkan otomatis oleh SIMPEG Yayasan.`, marginX, pageH - 36)

  const safe = (s) => String(s || '').trim().replace(/[^\w-]+/g, '_').replace(/_+/g, '_')
  doc.save(`Slip-Gaji-${safe(nama)}-${safe(periode)}.pdf`)
}
