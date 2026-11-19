// Utilitas Inventarisasi: barcode Code 39 (SVG), QR Code (SVG), & ekspor Excel
// workbook (SpreadsheetML 2003).
import qrcode from 'qrcode-generator'

// QR Code SVG dari teks (mis. kode aset). Andal dipindai kamera HP.
export function qrSvg(text, { margin = 2 } = {}) {
  const qr = qrcode(0, 'M')
  qr.addData(String(text || '-'))
  qr.make()
  const n = qr.getModuleCount()
  const size = n + margin * 2
  let rects = ''
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) rects += `<rect x="${c + margin}" y="${r + margin}" width="1" height="1"/>`
  return `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" style="display:block;width:100%;height:100%"><rect width="${size}" height="${size}" fill="#fff"/><g fill="#000">${rects}</g></svg>`
}

const C39 = {
  '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn', '4': 'nnnwwnnnw',
  '5': 'wnnwwnnnn', '6': 'nnwwwnnnn', '7': 'nnnwnnwnw', '8': 'wnnwnnwnn', '9': 'nnwwnnwnn',
  A: 'wnnnnwnnw', B: 'nnwnnwnnw', C: 'wnwnnwnnn', D: 'nnnnwwnnw', E: 'wnnnwwnnn', F: 'nnwnwwnnn',
  G: 'nnnnnwwnw', H: 'wnnnnwwnn', I: 'nnwnnwwnn', J: 'nnnnwwwnn', K: 'wnnnnnnww', L: 'nnwnnnnww',
  M: 'wnwnnnnwn', N: 'nnnnwnnww', O: 'wnnnwnnwn', P: 'nnwnwnnwn', Q: 'nnnnnnwww', R: 'wnnnnnwwn',
  S: 'nnwnnnwwn', T: 'nnnnwnwwn', U: 'wwnnnnnnw', V: 'nwwnnnnnw', W: 'wwwnnnnnn', X: 'nwnnwnnnw',
  Y: 'wwnnwnnnn', Z: 'nwwnwnnnn', '-': 'nwnnnnwnw', '.': 'wwnnnnwnn', ' ': 'nwwnnnwnn',
  $: 'nwnwnwnnn', '/': 'nwnwnnnwn', '+': 'nwnnnwnwn', '%': 'nnnwnwnwn', '*': 'nwnnwnwnn',
}

// Mengembalikan string SVG barcode Code 39. Render via dangerouslySetInnerHTML.
export function barcode39(text, { height = 40 } = {}) {
  const t = String(text || '').toUpperCase().replace(/[^0-9A-Z\-. $/+%]/g, '-')
  const seq = '*' + t + '*'
  const nW = 1, wW = 3, gap = 1
  let x = 0, rects = ''
  for (let ci = 0; ci < seq.length; ci++) {
    const pat = C39[seq[ci]] || C39['-']
    for (let i = 0; i < 9; i++) {
      const w = pat[i] === 'w' ? wW : nW
      if (i % 2 === 0) rects += `<rect x="${x}" y="0" width="${w}" height="${height}" fill="#000"/>`
      x += w
    }
    x += gap
  }
  return `<svg viewBox="0 0 ${x} ${height}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:${height}px">${rects}</svg>`
}

const xmlEsc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]))

// sheets: [{ name, columns:[string], rows:[[cell]] }]  — cell number → Number, else String.
export function exportExcelWorkbook(filename, sheets) {
  const ws = sheets.map((sh) => {
    const head = `<Row>${(sh.columns || []).map((c) => `<Cell ss:StyleID="hdr"><Data ss:Type="String">${xmlEsc(c)}</Data></Cell>`).join('')}</Row>`
    const body = (sh.rows || []).map((r) => `<Row>${r.map((cell) => {
      const isNum = typeof cell === 'number' && Number.isFinite(cell)
      return `<Cell><Data ss:Type="${isNum ? 'Number' : 'String'}">${xmlEsc(isNum ? cell : (cell == null ? '' : cell))}</Data></Cell>`
    }).join('')}</Row>`).join('')
    return `<Worksheet ss:Name="${xmlEsc((sh.name || 'Sheet').slice(0, 31))}"><Table>${head}${body}</Table></Worksheet>`
  }).join('')
  const xml = `<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>\n` +
    `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:x="urn:schemas-microsoft-com:office:excel">` +
    `<Styles><Style ss:ID="hdr"><Font ss:Bold="1"/><Interior ss:Color="#E7F4EE" ss:Pattern="Solid"/></Style></Styles>` +
    ws + `</Workbook>`
  const blob = new Blob(['﻿', xml], { type: 'application/vnd.ms-excel;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename.endsWith('.xls') ? filename : filename + '.xls'
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
