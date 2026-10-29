// =====================================================================
// Ekspor dokumen .docx (Microsoft Word / OOXML) tanpa dependensi eksternal.
//
// Membuat paket .docx minimal (ZIP berisi [Content_Types].xml, _rels/.rels,
// word/document.xml) dengan penulis ZIP "store" (tanpa kompresi) + CRC32
// buatan sendiri, serta WordprocessingML untuk judul, heading, paragraf,
// teks kaya (dari editor Word-like), dan tabel (struktur & beban belajar).
//
// Dipakai untuk mengekspor Kurikulum Islam Plus & Kurikulum Satuan
// Pendidikan yang telah DITETAPKAN menjadi file Word yang bisa diedit.
// =====================================================================

import { htmlKosong } from '../components/RichTextEditor'
import { strukturToTables, bebanToTable } from '../components/StrukturKurikulumEditor'

// ---------- ZIP (store, tanpa kompresi) ----------
let CRC_TABLE
function crc32(bytes) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
      CRC_TABLE[n] = c >>> 0
    }
  }
  let crc = 0xFFFFFFFF
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8)
  return (crc ^ 0xFFFFFFFF) >>> 0
}
const u16 = (a, v) => a.push(v & 0xFF, (v >>> 8) & 0xFF)
const u32 = (a, v) => a.push(v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF)
const enc = (s) => new TextEncoder().encode(s)

export function zipStore(files) {
  const localParts = []
  const central = []
  let offset = 0
  for (const f of files) {
    const name = enc(f.name)
    const data = f.data
    const crc = crc32(data)
    const local = []
    u32(local, 0x04034b50); u16(local, 20); u16(local, 0); u16(local, 0); u16(local, 0); u16(local, 0)
    u32(local, crc); u32(local, data.length); u32(local, data.length); u16(local, name.length); u16(local, 0)
    for (const b of name) local.push(b)
    const localHeader = new Uint8Array(local)
    localParts.push(localHeader, data)
    u32(central, 0x02014b50); u16(central, 20); u16(central, 20); u16(central, 0); u16(central, 0); u16(central, 0); u16(central, 0)
    u32(central, crc); u32(central, data.length); u32(central, data.length); u16(central, name.length); u16(central, 0); u16(central, 0); u16(central, 0); u16(central, 0); u32(central, 0); u32(central, offset)
    for (const b of name) central.push(b)
    offset += localHeader.length + data.length
  }
  const centralArr = new Uint8Array(central)
  const end = []
  u32(end, 0x06054b50); u16(end, 0); u16(end, 0); u16(end, files.length); u16(end, files.length); u32(end, centralArr.length); u32(end, offset); u16(end, 0)
  const parts = [...localParts, centralArr, new Uint8Array(end)]
  let total = 0; for (const p of parts) total += p.length
  const out = new Uint8Array(total); let pos = 0
  for (const p of parts) { out.set(p, pos); pos += p.length }
  return out
}

// ---------- OOXML ----------
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
  + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
  + '<Default Extension="xml" ContentType="application/xml"/>'
  + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
  + '</Types>'

const RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
  + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
  + '</Relationships>'

function runXml(r, def = {}) {
  if (r.br) return '<w:r><w:br/></w:r>'
  const b = r.b || def.b
  const i = r.i || def.i
  const sz = r.sz || def.sz
  const color = r.color || def.color
  const rpr = []
  if (b) rpr.push('<w:b/>')
  if (i) rpr.push('<w:i/>')
  if (r.u) rpr.push('<w:u w:val="single"/>')
  if (r.strike) rpr.push('<w:strike/>')
  if (sz) rpr.push(`<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/>`)
  if (color) rpr.push(`<w:color w:val="${color}"/>`)
  const rprXml = rpr.length ? `<w:rPr>${rpr.join('')}</w:rPr>` : ''
  return `<w:r>${rprXml}<w:t xml:space="preserve">${esc(r.text)}</w:t></w:r>`
}

function paraXml(runs, opts = {}) {
  const ppr = []
  if (opts.align) ppr.push(`<w:jc w:val="${opts.align}"/>`)
  if (opts.indent) ppr.push(`<w:ind w:left="${opts.indent}"/>`)
  const sp = []
  if (opts.before != null) sp.push(`w:before="${opts.before}"`)
  if (opts.after != null) sp.push(`w:after="${opts.after}"`)
  if (sp.length) ppr.push(`<w:spacing ${sp.join(' ')}/>`)
  const pprXml = ppr.length ? `<w:pPr>${ppr.join('')}</w:pPr>` : ''
  const body = (runs && runs.length ? runs : [{ text: '' }]).map((r) => runXml(r, opts)).join('')
  return `<w:p>${pprXml}${body}</w:p>`
}

const BORDER = '<w:tblBorders>'
  + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="999999"/>`).join('')
  + '</w:tblBorders>'

function tableXml(columns, rows) {
  const ncol = columns.length || 1
  const colw = Math.floor(9300 / ncol)
  const grid = `<w:tblGrid>${columns.map(() => `<w:gridCol w:w="${colw}"/>`).join('')}</w:tblGrid>`
  const cell = (text, { header = false } = {}) => {
    const shd = header ? '<w:shd w:val="clear" w:color="auto" w:fill="EFEFEF"/>' : ''
    return `<w:tc><w:tcPr><w:tcW w:w="${colw}" w:type="dxa"/>${shd}</w:tcPr>${paraXml([{ text }], { b: header, align: 'center', after: 0 })}</w:tc>`
  }
  const headRow = `<w:tr>${columns.map((c) => cell(c, { header: true })).join('')}</w:tr>`
  const bodyRows = rows.map((row) => `<w:tr>${row.map((c, idx) => cell(c, { header: false, left: idx === 1 })).join('')}</w:tr>`).join('')
  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>${BORDER}<w:tblLook w:val="0420"/></w:tblPr>${grid}${headRow}${bodyRows}</w:tbl>`
}

// HTML (dari editor Word-like) → array paragraf { style, runs }.
function htmlToParas(html) {
  if (typeof DOMParser === 'undefined') return [{ runs: [{ text: String(html || '').replace(/<[^>]*>/g, ' ') }] }]
  const doc = new DOMParser().parseFromString(`<body>${html || ''}</body>`, 'text/html')
  const out = []
  const inlineRuns = (node, fmt) => {
    const runs = []
    node.childNodes.forEach((n) => {
      if (n.nodeType === 3) { if (n.textContent) runs.push({ text: n.textContent, ...fmt }); return }
      if (n.nodeType !== 1) return
      const tag = n.tagName.toLowerCase()
      if (tag === 'br') { runs.push({ br: true }); return }
      const f = { ...fmt }
      if (tag === 'b' || tag === 'strong') f.b = true
      if (tag === 'i' || tag === 'em') f.i = true
      if (tag === 'u') f.u = true
      if (tag === 's' || tag === 'strike' || tag === 'del') f.strike = true
      runs.push(...inlineRuns(n, f))
    })
    return runs
  }
  doc.body.childNodes.forEach((node) => {
    if (node.nodeType === 3) { if (node.textContent && node.textContent.trim()) out.push({ runs: [{ text: node.textContent }] }); return }
    if (node.nodeType !== 1) return
    const tag = node.tagName.toLowerCase()
    if (tag === 'h1' || tag === 'h2' || tag === 'h3') { out.push({ style: tag, runs: inlineRuns(node, {}) }); return }
    if (tag === 'blockquote') { out.push({ style: 'quote', runs: inlineRuns(node, {}) }); return }
    if (tag === 'ul' || tag === 'ol') {
      let i = 1
      node.querySelectorAll(':scope > li').forEach((li) => {
        const prefix = tag === 'ul' ? '•  ' : `${i++}.  `
        out.push({ style: 'list', runs: [{ text: prefix }, ...inlineRuns(li, {})] })
      })
      return
    }
    out.push({ runs: inlineRuns(node, {}) })
  })
  return out.length ? out : [{ runs: [{ text: '' }] }]
}

function htmlBlockXml(html) {
  return htmlToParas(html).map((p) => {
    if (p.style === 'h1') return paraXml(p.runs, { b: true, sz: 30, before: 160, after: 80 })
    if (p.style === 'h2') return paraXml(p.runs, { b: true, sz: 26, before: 120, after: 60 })
    if (p.style === 'h3') return paraXml(p.runs, { b: true, sz: 22, before: 100, after: 60 })
    if (p.style === 'quote') return paraXml(p.runs, { i: true, indent: 360, after: 60 })
    if (p.style === 'list') return paraXml(p.runs, { indent: 360, after: 40 })
    return paraXml(p.runs, { after: 60 })
  }).join('')
}

function blockXml(block) {
  switch (block.type) {
    case 'title': return paraXml([{ text: block.text }], { align: 'center', b: true, sz: 36, after: 40 })
    case 'subtitle': return paraXml([{ text: block.text }], { align: 'center', sz: 22, color: '666666', after: 240 })
    case 'heading': {
      const sz = block.level === 1 ? 30 : block.level === 3 ? 22 : 26
      return paraXml([{ text: block.text }], { b: true, sz, before: block.level === 1 ? 240 : 160, after: 80 })
    }
    case 'paragraph': return paraXml([{ text: block.text, i: block.italic }], { after: 60 })
    case 'table': {
      const cap = block.caption ? paraXml([{ text: block.caption }], { b: true, sz: 22, before: 80, after: 40 }) : ''
      return cap + tableXml(block.columns, block.rows) + paraXml([{ text: '' }], { after: 40 })
    }
    case 'html': return htmlBlockXml(block.html)
    default: return ''
  }
}

function documentXml(blocks) {
  const body = blocks.map(blockXml).join('')
  const sect = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr>'
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    + `<w:body>${body}<w:p/>${sect}</w:body></w:document>`
}

export function buildDocxBytes(blocks) {
  return zipStore([
    { name: '[Content_Types].xml', data: enc(CONTENT_TYPES) },
    { name: '_rels/.rels', data: enc(RELS) },
    { name: 'word/document.xml', data: enc(documentXml(blocks)) },
  ])
}

function downloadBytes(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

// Satu bagian outline → blok dokumen (heading + isi sesuai tipe).
function bagianToBlocks(item, konten) {
  const blocks = [{ type: 'heading', level: 2, text: `${item.kode} · ${item.judul}` }]
  if (item.tipe === 'struktur') {
    const { tables, teks } = strukturToTables(konten)
    for (const t of tables) blocks.push({ type: 'table', caption: t.caption, columns: t.columns, rows: t.rows })
    if (!htmlKosong(teks)) blocks.push({ type: 'html', html: teks })
    if (!tables.length && htmlKosong(teks)) blocks.push({ type: 'paragraph', text: '(Belum ditetapkan)', italic: true })
  } else if (item.tipe === 'beban') {
    const { table, teks } = bebanToTable(konten)
    if (table) blocks.push({ type: 'table', columns: table.columns, rows: table.rows })
    if (!htmlKosong(teks)) blocks.push({ type: 'html', html: teks })
    if (!table && htmlKosong(teks)) blocks.push({ type: 'paragraph', text: '(Belum ditetapkan)', italic: true })
  } else if (konten && !htmlKosong(konten)) {
    blocks.push({ type: 'html', html: konten })
  } else {
    blocks.push({ type: 'paragraph', text: '(Belum ditetapkan)', italic: true })
  }
  return blocks
}

/**
 * Ekspor dokumen kurikulum ke .docx.
 * @param {Object} p
 * @param {string} p.filename - nama file (mis. 'Kurikulum-Islam-Plus.docx')
 * @param {string} p.title - judul dokumen
 * @param {string} [p.subtitle]
 * @param {Array} p.outline - [{ bab, items:[{kode,judul,tipe}] }]
 * @param {Object} p.kontenByKode - { [kode]: konten isi resmi (ditetapkan) }
 */
export function exportKurikulumDocx({ filename, title, subtitle, outline, kontenByKode }) {
  const blocks = [{ type: 'title', text: title }]
  if (subtitle) blocks.push({ type: 'subtitle', text: subtitle })
  for (const bab of outline) {
    blocks.push({ type: 'heading', level: 1, text: bab.bab })
    for (const it of bab.items) blocks.push(...bagianToBlocks(it, kontenByKode[it.kode]))
  }
  downloadBytes(buildDocxBytes(blocks), filename)
}
