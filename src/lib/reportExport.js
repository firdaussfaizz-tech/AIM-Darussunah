// =====================================================================
// Helper ekspor laporan — dipakai modul Analitik & Laporan (menutup gap
// "HR Analytics / Reporting" pada asesmen ERP/HRIS). Satu set fungsi untuk
// mengubah sebuah tabel laporan (kolom + baris) menjadi berkas Excel, CSV,
// atau PDF, tanpa menambah vendor/pustaka baru.
//
// Pustaka berat (xlsx, jspdf) di-`import()` SECARA DINAMIS di dalam fungsi
// agar tidak ikut masuk ke bundle awal (selaras kebijakan code-splitting).
//
// Kontrak data:
//   columns : [{ key, label, align?: 'left'|'right', type?: 'rupiah'|'persen'|'number'|'text' }]
//   rows    : array objek biasa ({ [key]: value })  — nilai mentah (angka/teks)
// Pemformatan tampilan (Rp, %, ribuan) dilakukan di sini agar seragam di
// ketiga format keluaran.
// =====================================================================

function fmtCell(value, type) {
  if (value == null || value === '') return ''
  if (type === 'rupiah') {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value) || 0)
  }
  if (type === 'persen') return `${Number(value) || 0}%`
  if (type === 'number') return new Intl.NumberFormat('id-ID').format(Number(value) || 0)
  return String(value)
}

// Nilai "polos" untuk Excel/CSV: angka tetap angka (biar bisa dihitung di
// spreadsheet), teks tetap teks. Persen disimpan sebagai angka + label kolom.
function rawCell(value, type) {
  if (value == null || value === '') return ''
  if (type === 'rupiah' || type === 'number' || type === 'persen') return Number(value) || 0
  return String(value)
}

function timestampSlug() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

// ---- Excel (.xlsx) ----
export async function exportExcel({ filename, sheetName = 'Laporan', columns, rows, title, meta = [] }) {
  const XLSX = await import('xlsx')
  const aoa = []
  if (title) aoa.push([title])
  for (const m of meta) aoa.push([m])
  if (title || meta.length) aoa.push([])
  aoa.push(columns.map((c) => c.label))
  for (const r of rows) aoa.push(columns.map((c) => rawCell(r[c.key], c.type)))

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  // Lebar kolom proporsional terhadap panjang label/isi.
  ws['!cols'] = columns.map((c) => {
    const headerLen = c.label.length
    const maxCellLen = rows.reduce((mx, r) => Math.max(mx, String(fmtCell(r[c.key], c.type)).length), 0)
    return { wch: Math.min(40, Math.max(10, headerLen, maxCellLen) + 2) }
  })
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31))
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  triggerDownload(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${filename}-${timestampSlug()}.xlsx`)
}

// ---- CSV ----
export function exportCsv({ filename, columns, rows }) {
  const esc = (v) => {
    const s = String(v ?? '')
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [columns.map((c) => esc(c.label)).join(',')]
  for (const r of rows) lines.push(columns.map((c) => esc(rawCell(r[c.key], c.type))).join(','))
  // BOM UTF-8 agar Excel membaca karakter Indonesia dengan benar.
  triggerDownload(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), `${filename}-${timestampSlug()}.csv`)
}

// ---- PDF (tabel digambar manual; tanpa plugin autotable) ----
export async function exportPdf({ filename, title, meta = [], columns, rows }) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: columns.length > 5 ? 'landscape' : 'portrait' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 40
  const usableW = pageW - margin * 2

  // Lebar kolom proporsional terhadap panjang maksimum isi.
  const weights = columns.map((c) => {
    const headerLen = c.label.length
    const maxCellLen = rows.reduce((mx, r) => Math.max(mx, String(fmtCell(r[c.key], c.type)).length), 0)
    return Math.max(headerLen, maxCellLen, 4)
  })
  const totalW = weights.reduce((a, b) => a + b, 0)
  const colW = weights.map((w) => (w / totalW) * usableW)

  let y = margin

  const drawHeaderBlock = () => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(20, 33, 61)
    doc.text(title || 'Laporan', margin, y); y += 18
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90, 90, 90)
    for (const m of meta) { doc.text(String(m), margin, y); y += 12 }
    y += 6
  }

  const drawColumnHeader = () => {
    doc.setFillColor(20, 33, 61)
    doc.rect(margin, y, usableW, 20, 'F')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(255, 255, 255)
    let x = margin
    columns.forEach((c, i) => {
      const txt = doc.splitTextToSize(c.label, colW[i] - 8)[0] || c.label
      if (c.align === 'right') doc.text(txt, x + colW[i] - 5, y + 13, { align: 'right' })
      else doc.text(txt, x + 5, y + 13)
      x += colW[i]
    })
    y += 20
  }

  drawHeaderBlock()
  drawColumnHeader()

  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(30, 30, 30)
  const rowH = 18
  rows.forEach((r, idx) => {
    if (y + rowH > pageH - margin) {
      doc.addPage()
      y = margin
      drawColumnHeader()
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(30, 30, 30)
    }
    if (idx % 2 === 1) { doc.setFillColor(244, 246, 250); doc.rect(margin, y, usableW, rowH, 'F') }
    let x = margin
    columns.forEach((c, i) => {
      const txt = doc.splitTextToSize(fmtCell(r[c.key], c.type), colW[i] - 8)[0] || ''
      if (c.align === 'right') doc.text(txt, x + colW[i] - 5, y + 12, { align: 'right' })
      else doc.text(txt, x + 5, y + 12)
      x += colW[i]
    })
    y += rowH
  })

  // Footer halaman.
  const pages = doc.internal.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(140, 140, 140)
    doc.text(`Halaman ${p} dari ${pages}`, pageW - margin, pageH - 20, { align: 'right' })
    doc.text('SIMPEG Yayasan — Analitik & Laporan', margin, pageH - 20)
  }

  doc.save(`${filename}-${timestampSlug()}.pdf`)
}

// Util kecil: ubah cell terformat jadi string (dipakai bila perlu di UI).
export { fmtCell }
