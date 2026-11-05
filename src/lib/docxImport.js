// =====================================================================
// Pembaca .docx (Microsoft Word / OOXML) → HTML, tanpa dependensi eksternal.
//
// Sebuah .docx adalah arsip ZIP. Berkas word/document.xml biasanya dipadatkan
// dengan deflate (metode 8); di-inflate memakai DecompressionStream bawaan
// browser. XML WordprocessingML lalu dipetakan ke HTML sederhana (paragraf,
// heading, tebal/miring/garis bawah, daftar, tabel) yang cocok dimuat ke
// editor teks kaya (RichTextEditor).
//
// Dipakai untuk mengekstrak isi dokumen kurikulum yang diunggah menjadi isi
// bagian. Hanya .docx (Word modern) yang didukung ekstraksinya.
// =====================================================================

export const bisaEkstrakDocx = (nama) => /\.docx$/i.test(String(nama || ''))

async function inflateRaw(bytes) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Peramban ini belum mendukung ekstraksi otomatis. Gunakan peramban terbaru (Edge/Chrome/Firefox).')
  }
  const ds = new DecompressionStream('deflate-raw')
  const stream = new Blob([bytes]).stream().pipeThrough(ds)
  const buf = await new Response(stream).arrayBuffer()
  return new Uint8Array(buf)
}

async function extractDocumentXml(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer)
  const dv = new DataView(arrayBuffer)
  // End Of Central Directory
  let eocd = -1
  const minI = Math.max(0, bytes.length - 22 - 65536)
  for (let i = bytes.length - 22; i >= minI; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('Berkas bukan .docx yang valid (ZIP tidak ditemukan).')
  const cdOffset = dv.getUint32(eocd + 16, true)
  const cdCount = dv.getUint16(eocd + 10, true)
  let p = cdOffset
  let target = null
  for (let n = 0; n < cdCount; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break
    const method = dv.getUint16(p + 10, true)
    const compSize = dv.getUint32(p + 20, true)
    const nameLen = dv.getUint16(p + 28, true)
    const extraLen = dv.getUint16(p + 30, true)
    const commentLen = dv.getUint16(p + 32, true)
    const localOff = dv.getUint32(p + 42, true)
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen))
    if (name === 'word/document.xml') { target = { method, compSize, localOff }; break }
    p += 46 + nameLen + extraLen + commentLen
  }
  if (!target) throw new Error('document.xml tidak ditemukan dalam berkas.')
  const lo = target.localOff
  if (dv.getUint32(lo, true) !== 0x04034b50) throw new Error('Header ZIP rusak.')
  const lNameLen = dv.getUint16(lo + 26, true)
  const lExtraLen = dv.getUint16(lo + 28, true)
  const dataStart = lo + 30 + lNameLen + lExtraLen
  const comp = bytes.subarray(dataStart, dataStart + target.compSize)
  let raw
  if (target.method === 0) raw = comp
  else if (target.method === 8) raw = await inflateRaw(comp)
  else throw new Error('Metode kompresi .docx tidak didukung.')
  return new TextDecoder().decode(raw)
}

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function styleOf(p) {
  const el = p.getElementsByTagName('w:pStyle')[0]
  const v = (el?.getAttribute('w:val') || '').toLowerCase()
  if (v === 'title' || v === 'heading1') return 'h1'
  if (v === 'heading2') return 'h2'
  if (v === 'heading3' || v === 'heading4' || v === 'heading5') return 'h3'
  return 'p'
}
function rprOn(rpr, tag) {
  if (!rpr) return false
  const e = rpr.getElementsByTagName(tag)[0]
  if (!e) return false
  const v = e.getAttribute('w:val')
  return v !== '0' && v !== 'false'
}
function runsHtml(p) {
  let s = ''
  for (const r of Array.from(p.getElementsByTagName('w:r'))) {
    const rpr = r.getElementsByTagName('w:rPr')[0]
    let text = ''
    for (const c of Array.from(r.children)) {
      const t = c.tagName
      if (t === 'w:t') text += c.textContent
      else if (t === 'w:br') text += '\n'
      else if (t === 'w:tab') text += '  '
    }
    if (!text) continue
    let frag = esc(text).replace(/\n/g, '<br>')
    if (rprOn(rpr, 'w:b')) frag = `<b>${frag}</b>`
    if (rprOn(rpr, 'w:i')) frag = `<i>${frag}</i>`
    if (rpr && rpr.getElementsByTagName('w:u')[0]) frag = `<u>${frag}</u>`
    s += frag
  }
  return s
}
function tableHtml(tbl) {
  const rows = Array.from(tbl.children).filter((n) => n.tagName === 'w:tr')
  let html = '<table>'
  for (const tr of rows) {
    html += '<tr>'
    for (const tc of Array.from(tr.children).filter((n) => n.tagName === 'w:tc')) {
      const txt = Array.from(tc.getElementsByTagName('w:p')).map((pp) => runsHtml(pp)).filter(Boolean).join('<br>')
      html += `<td>${txt || '&nbsp;'}</td>`
    }
    html += '</tr>'
  }
  return html + '</table>'
}

function xmlToHtml(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const body = doc.getElementsByTagName('w:body')[0]
  if (!body) return ''
  const out = []
  let listBuf = []
  const flush = () => { if (listBuf.length) { out.push('<ul>' + listBuf.join('') + '</ul>'); listBuf = [] } }
  for (const node of Array.from(body.children)) {
    if (node.tagName === 'w:p') {
      const isList = !!node.getElementsByTagName('w:numPr')[0]
      const html = runsHtml(node)
      if (isList) { listBuf.push(`<li>${html || '&nbsp;'}</li>`); continue }
      flush()
      if (!html.trim()) { out.push('<p><br></p>'); continue }
      const st = styleOf(node)
      out.push(st === 'p' ? `<p>${html}</p>` : `<${st}>${html}</${st}>`)
    } else if (node.tagName === 'w:tbl') {
      flush()
      out.push(tableHtml(node))
    }
  }
  flush()
  return out.join('')
}

export async function docxToHtml(arrayBuffer) {
  const xml = await extractDocumentXml(arrayBuffer)
  return xmlToHtml(xml)
}
