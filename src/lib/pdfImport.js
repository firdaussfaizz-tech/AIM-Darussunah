// =====================================================================
// Pembaca PDF berbasis teks → HTML, tanpa dependensi eksternal.
//
// PDF menyimpan teks pada content stream yang umumnya dipadatkan FlateDecode
// (zlib) — di-inflate memakai DecompressionStream bawaan browser. Teks dibaca
// dari operator Tj/TJ. Font modern (ekspor Word/LibreOffice) memakai subset
// sehingga string berisi KODE GLYPH, bukan karakter; karena itu tiap font
// dipetakan lewat /ToUnicode CMap-nya agar menghasilkan teks sebenarnya.
//
// Keterbatasan: PDF hasil SCAN (gambar tanpa teks) tidak bisa diekstrak
// (perlu OCR). Bila hasil kosong/aneh, gunakan .docx.
// =====================================================================

export const bisaEkstrakPdf = (nama) => /\.pdf$/i.test(String(nama || ''))

async function inflate(bytes) {
  for (const fmt of ['deflate', 'deflate-raw']) {
    try {
      const ds = new DecompressionStream(fmt)
      const stream = new Blob([bytes]).stream().pipeThrough(ds)
      return new Uint8Array(await new Response(stream).arrayBuffer())
    } catch { /* coba format berikutnya */ }
  }
  return null
}
const latin1 = (bytes) => new TextDecoder('latin1').decode(bytes)
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const isWsByte = (b) => b === 0x0a || b === 0x0d || b === 0x20 || b === 0x09 || b === 0x0c || b === 0x00
const isWS = (c) => c === ' ' || c === '\n' || c === '\r' || c === '\t' || c === '\f' || c === '\0'

// Semua objek "N G obj … (stream)" → { body, streamBytes }.
function parseObjs(bytes, latin) {
  const objs = new Map()
  const re = /(\d+)\s+\d+\s+obj\b/g
  const starts = []
  let m
  while ((m = re.exec(latin))) starts.push({ id: m[1], at: re.lastIndex })
  for (let k = 0; k < starts.length; k++) {
    const st = starts[k].at
    const en = k + 1 < starts.length ? latin.lastIndexOf(' obj', starts[k + 1].at) : latin.length
    const seg = latin.substring(st, Math.max(st, en))
    let streamBytes = null
    let body = seg
    const si = seg.indexOf('stream')
    if (si >= 0) {
      body = seg.substring(0, si)
      let dataStart = st + si + 6
      if (latin[dataStart] === '\r') dataStart++
      if (latin[dataStart] === '\n') dataStart++
      const ei = latin.indexOf('endstream', dataStart)
      if (ei >= 0) {
        let end = ei
        while (end > dataStart && isWsByte(bytes[end - 1])) end--
        streamBytes = bytes.subarray(dataStart, end)
      }
    }
    if (!objs.has(starts[k].id)) objs.set(starts[k].id, { body, streamBytes })
  }
  return objs
}

const hexToStr = (h) => {
  if (h.length % 2) h += '0'
  let s = ''
  for (let i = 0; i < h.length; i += 4) {
    const cu = parseInt(h.substr(i, 4).padEnd(4, '0'), 16)
    if (!Number.isNaN(cu)) s += String.fromCharCode(cu)
  }
  return s
}

// Parse CMap /ToUnicode → { map: {code→teks}, width: 1|2 }.
function parseCMap(t) {
  const map = {}
  let m
  const reChar = /beginbfchar([\s\S]*?)endbfchar/g
  while ((m = reChar.exec(t))) {
    const pr = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g
    let p
    while ((p = pr.exec(m[1]))) map[parseInt(p[1], 16)] = hexToStr(p[2])
  }
  const reRange = /beginbfrange([\s\S]*?)endbfrange/g
  while ((m = reRange.exec(t))) {
    const body = m[1]
    const r1 = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g
    let p
    while ((p = r1.exec(body))) {
      const lo = parseInt(p[1], 16); const hi = parseInt(p[2], 16); const dst = parseInt(p[3], 16)
      for (let c = lo; c <= hi && c - lo < 65536; c++) map[c] = String.fromCodePoint(dst + (c - lo))
    }
    const r2 = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[([\s\S]*?)\]/g
    while ((p = r2.exec(body))) {
      const lo = parseInt(p[1], 16)
      const items = p[3].match(/<([0-9A-Fa-f]+)>/g) || []
      for (let k = 0; k < items.length; k++) map[lo + k] = hexToStr(items[k].replace(/[<>]/g, ''))
    }
  }
  let maxKey = 0
  for (const k in map) maxKey = Math.max(maxKey, +k)
  return { map, width: maxKey > 255 ? 2 : 1 }
}

function readDictAt(latin, pos) {
  let depth = 0; let i = pos
  while (i < latin.length) {
    if (latin[i] === '<' && latin[i + 1] === '<') { depth++; i += 2; continue }
    if (latin[i] === '>' && latin[i + 1] === '>') { depth -= 1; i += 2; if (depth === 0) return latin.substring(pos, i); continue }
    i++
  }
  return latin.substring(pos)
}

// Map nama resource font (F1, …) → tabel ToUnicode.
async function buildFontTables(objs, latin) {
  const nameToTable = {}
  const cache = new Map()
  const getTable = async (id) => {
    if (cache.has(id)) return cache.get(id)
    const o = objs.get(id); let tbl = null
    if (o && o.streamBytes) { const dec = await inflate(o.streamBytes); if (dec) tbl = parseCMap(latin1(dec)) }
    cache.set(id, tbl); return tbl
  }
  const dictTexts = []
  let i = 0
  while ((i = latin.indexOf('/Font', i)) >= 0) {
    let j = i + 5
    while (j < latin.length && isWS(latin[j])) j++
    if (latin[j] === '<' && latin[j + 1] === '<') dictTexts.push(readDictAt(latin, j))
    else {
      const mm = /^(\d+)\s+\d+\s+R/.exec(latin.substr(j, 24))
      if (mm) { const o = objs.get(mm[1]); if (o) dictTexts.push(o.body) }
    }
    i = j
  }
  for (const dt of dictTexts) {
    const re = /\/([A-Za-z0-9_.+-]+)\s+(\d+)\s+\d+\s+R/g
    let m
    while ((m = re.exec(dt))) {
      const name = m[1]; const fontId = m[2]
      if (nameToTable[name]) continue
      const fo = objs.get(fontId); if (!fo) continue
      const tm = /\/ToUnicode\s+(\d+)\s+\d+\s+R/.exec(fo.body)
      if (tm) { const t = await getTable(tm[1]); if (t) nameToTable[name] = t }
    }
  }
  return nameToTable
}

// Baca content stream → teks, memetakan kode lewat tabel font aktif.
function parseContent(s, fontTables) {
  let out = ''
  const n = s.length
  let i = 0
  let nums = []
  let lastRaw = ''
  let lastName = ''
  let curTable = null
  let inArray = false
  let arr = [] // elemen TJ: {raw} atau {sp:true}
  const DELIM = '()<>[]{}/%'

  // Pelacakan posisi teks: tiap potongan umumnya BT→Td<x y absolut>→Tj→ET.
  // Baris baru hanya saat Y berpindah; selain itu antar-potongan beri spasi.
  let curY = null; let lastEmitY = null; let btReset = false; let pendingSep = ''
  const setPos = (newY) => {
    if (lastEmitY == null) pendingSep = ''
    else if (Math.abs(newY - lastEmitY) > 1.5) pendingSep = '\n'
    else if (pendingSep !== '\n') pendingSep = ' '
    curY = newY
  }
  const emit = (txt) => { out += pendingSep + txt; lastEmitY = curY; pendingSep = '' }

  const render = (raw) => {
    if (!curTable) return raw
    const { map, width } = curTable
    let o = ''
    if (width === 2) {
      for (let k = 0; k + 1 < raw.length || k < raw.length; k += 2) {
        const code = (raw.charCodeAt(k) << 8) | (k + 1 < raw.length ? raw.charCodeAt(k + 1) : 0)
        o += (code in map) ? map[code] : ''
      }
    } else {
      for (let k = 0; k < raw.length; k++) { const c = raw.charCodeAt(k); o += (c in map) ? map[c] : raw[k] }
    }
    return o
  }

  const readLiteral = (start) => {
    let depth = 1; let o = ''; let j = start + 1
    while (j < n && depth > 0) {
      const c = s[j]
      if (c === '\\') {
        const d = s[j + 1]
        if (d >= '0' && d <= '7') {
          let oct = d; let k = j + 2; let cnt = 1
          while (cnt < 3 && s[k] >= '0' && s[k] <= '7') { oct += s[k]; k++; cnt++ }
          o += String.fromCharCode(parseInt(oct, 8) & 0xFF); j = k; continue
        }
        const mapc = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' }
        if (d === '\n') { /* sambung */ } else o += (mapc[d] ?? d)
        j += 2; continue
      }
      if (c === '(') { depth++; o += c; j++; continue }
      if (c === ')') { depth--; if (depth === 0) { j++; break } o += c; j++; continue }
      o += c; j++
    }
    return { text: o, next: j }
  }
  const readHex = (start) => {
    let j = start + 1; let hex = ''
    while (j < n && s[j] !== '>') { if (!isWS(s[j])) hex += s[j]; j++ }
    j++
    if (hex.length % 2) hex += '0'
    let o = ''
    for (let k = 0; k < hex.length; k += 2) o += String.fromCharCode(parseInt(hex.substr(k, 2), 16) & 0xFF)
    return { text: o, next: j }
  }

  while (i < n) {
    const c = s[i]
    if (isWS(c)) { i++; continue }
    if (c === '(') { const r = readLiteral(i); i = r.next; if (inArray) arr.push({ raw: r.text }); else lastRaw = r.text; continue }
    if (c === '<' && s[i + 1] === '<') {
      let depth = 0
      while (i < n) {
        if (s[i] === '<' && s[i + 1] === '<') { depth++; i += 2; continue }
        if (s[i] === '>' && s[i + 1] === '>') { depth--; i += 2; if (depth === 0) break; continue }
        i++
      }
      continue
    }
    if (c === '<') { const r = readHex(i); i = r.next; if (inArray) arr.push({ raw: r.text }); else lastRaw = r.text; continue }
    if (c === '[') { inArray = true; arr = []; i++; continue }
    if (c === ']') { inArray = false; i++; continue }
    if (c === '%') { while (i < n && s[i] !== '\n' && s[i] !== '\r') i++; continue }
    if (c === ')' || c === '>' || c === '{' || c === '}') { i++; continue }
    if (c === '/') {
      i++; let st = i
      while (i < n && !isWS(s[i]) && !DELIM.includes(s[i])) i++
      lastName = s.substring(st, i); continue
    }
    if (c === '-' || c === '+' || c === '.' || (c >= '0' && c <= '9')) {
      let j = i; while (j < n && '0123456789.-+eE'.includes(s[j])) j++
      const v = parseFloat(s.substring(i, j))
      if (!Number.isNaN(v)) { nums.push(v); if (inArray && v < -100) arr.push({ sp: true }) }
      i = j; continue
    }
    let j = i; while (j < n && !isWS(s[j]) && !DELIM.includes(s[j])) j++
    if (j === i) { i++; continue }
    const op = s.substring(i, j); i = j
    if (op === 'Tf') { curTable = fontTables[lastName] || null; nums = [] }
    else if (op === 'Tj') { emit(render(lastRaw)); nums = [] }
    else if (op === 'TJ') { let s = ''; for (const el of arr) s += el.sp ? ' ' : render(el.raw); emit(s); arr = []; nums = [] }
    else if (op === "'" || op === '"') { pendingSep = '\n'; emit(render(lastRaw)); nums = [] }
    else if (op === 'Td' || op === 'TD') {
      const ty = nums.length >= 2 ? nums[nums.length - 1] : 0
      setPos(btReset || curY == null ? ty : curY + ty); btReset = false; nums = []
    }
    else if (op === 'Tm') { const ty = nums.length >= 6 ? nums[5] : (curY ?? 0); btReset = false; setPos(ty); nums = [] }
    else if (op === 'T*') { setPos((curY ?? 0) - 1.6); pendingSep = '\n'; nums = [] }
    else if (op === 'BT') { btReset = true; nums = [] }
    else { nums = [] }
  }
  return out
}

const bersihkan = (t) => t.replace(/\r/g, '\n').replace(/[ \t\f\0]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim()

export async function pdfToHtml(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer)
  const latin = latin1(bytes)
  const objs = parseObjs(bytes, latin)
  const fontTables = await buildFontTables(objs, latin)
  const potongan = []
  for (const o of objs.values()) {
    if (!o.streamBytes) continue
    const dec = await inflate(o.streamBytes)
    if (!dec) continue
    const content = latin1(dec)
    if (!/BT|Tj|TJ/.test(content)) continue
    const teks = bersihkan(parseContent(content, fontTables))
    if (teks) potongan.push(teks)
  }
  const teks = bersihkan(potongan.join('\n'))
  if (!teks) return ''
  return teks.split('\n').map((ln) => ln.trim()).filter(Boolean).map((ln) => `<p>${esc(ln)}</p>`).join('')
}
