import { Plus, Trash2 } from 'lucide-react'
import { Button } from './ui'
import { RichTextEditor, RichTextView, htmlKosong } from './RichTextEditor'

// ============================================================================
// Editor/penampil bagian kurikulum berbentuk TABEL (+ isi teks Word-like).
// Disimpan sebagai JSON di kolom `konten` (tanpa migrasi).
//
//  A. STRUKTUR (tipe:'struktur') — tabel TERPISAH per jenjang:
//     SD, SMP, SMA, Boarding SMP, Boarding SMA (bertumpuk, tidak menyamping).
//     { v:2, jenjang:[...], tabel:{ '<jenjang>':{mapel:[{nama,jp:{kelas:JP}}]} }, teks:'<html>' }
//
//  B. BEBAN BELAJAR (tipe:'beban') — tabel beban belajar + isi teks.
//     { v:1, rows:[{label,menit,jpMinggu,mingguEfektif,jamTahun,jam60}], teks:'<html>' }
//
// Angka JP = jam pelajaran per minggu.
// ============================================================================

export const JENJANG_KELAS = {
  'SD': ['I', 'II', 'III', 'IV', 'V', 'VI'],
  'SMP': ['VII', 'VIII', 'IX'],
  'SMA': ['X', 'XI', 'XII'],
  'Boarding SMP': ['VII', 'VIII', 'IX'],
  'Boarding SMA': ['X', 'XI', 'XII'],
}
export const JENJANG_ORDER = ['SD', 'SMP', 'SMA', 'Boarding SMP', 'Boarding SMA']

const emptyTabel = () => Object.fromEntries(JENJANG_ORDER.map((j) => [j, { mapel: [] }]))
const DEFAULT_STRUKTUR = { v: 2, jenjang: [...JENJANG_ORDER], tabel: emptyTabel(), teks: '' }
const pickKelas = (jp, kelasList) => {
  const out = {}
  for (const k of kelasList) if (jp && jp[k] != null && jp[k] !== '') out[k] = jp[k]
  return out
}

// ---------------------------------------------------------------- STRUKTUR ---
export function parseStruktur(konten) {
  if (!konten) return null
  let o
  try { o = JSON.parse(konten) } catch { return null }
  if (!o || typeof o !== 'object') return null

  // v2 (tabel per jenjang)
  if (o.tabel && typeof o.tabel === 'object') {
    const jenjang = Array.isArray(o.jenjang) && o.jenjang.length ? JENJANG_ORDER.filter((j) => o.jenjang.includes(j)) : [...JENJANG_ORDER]
    const tabel = {}
    for (const j of JENJANG_ORDER) {
      const t = o.tabel[j]
      tabel[j] = { mapel: Array.isArray(t?.mapel) ? t.mapel.map((m) => ({ nama: m?.nama || '', jp: m?.jp && typeof m.jp === 'object' ? m.jp : {} })) : [] }
    }
    return { v: 2, jenjang, tabel, teks: o.teks || '' }
  }

  // v1 (mapel datar) → migrasi ke v2
  if (Array.isArray(o.mapel)) {
    const jenjang = Array.isArray(o.jenjang) && o.jenjang.length ? JENJANG_ORDER.filter((j) => o.jenjang.includes(j)) : ['SD', 'SMP', 'SMA']
    const tabel = {}
    for (const j of JENJANG_ORDER) {
      tabel[j] = { mapel: jenjang.includes(j) ? o.mapel.map((m) => ({ nama: m?.nama || '', jp: pickKelas(m?.jp, JENJANG_KELAS[j]) })) : [] }
    }
    return { v: 2, jenjang, tabel, teks: o.catatan || '' }
  }
  return null
}

export function strukturKosong(data) {
  if (!data) return true
  const adaMapel = JENJANG_ORDER.some((j) => (data.tabel?.[j]?.mapel || []).some((m) => (m.nama || '').trim() || Object.keys(m.jp || {}).length))
  return !adaMapel && htmlKosong(data.teks)
}

export function ringkasStruktur(konten) {
  const d = parseStruktur(konten)
  if (!d) return null
  const n = JENJANG_ORDER.reduce((s, j) => s + (d.tabel[j]?.mapel?.length || 0), 0)
  return `Tabel struktur · jenjang: ${d.jenjang.join(', ') || '—'} · ${n} baris mapel`
}

const totalKelas = (mapel, kelas) => (mapel || []).reduce((s, m) => s + (Number(m.jp?.[kelas]) || 0), 0)

function TabelJenjangView({ jenjang, mapel }) {
  const kelas = JENJANG_KELAS[jenjang]
  return (
    <div>
      <p className="mb-1.5 text-[13px] font-semibold text-[var(--color-ink)]">{jenjang}</p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="text-[var(--color-ink-soft)]">
              <th className="border border-[var(--color-border)] px-2 py-1.5">No</th>
              <th className="border border-[var(--color-border)] px-2 py-1.5 text-left">Mata Pelajaran</th>
              {kelas.map((k) => <th key={k} className="border border-[var(--color-border)] px-2 py-1.5 text-center">{k}</th>)}
            </tr>
          </thead>
          <tbody>
            {(mapel || []).map((m, i) => (
              <tr key={i}>
                <td className="border border-[var(--color-border)] px-2 py-1.5 text-center">{i + 1}</td>
                <td className="border border-[var(--color-border)] px-2 py-1.5">{m.nama || '—'}</td>
                {kelas.map((k) => <td key={k} className="border border-[var(--color-border)] px-2 py-1.5 text-center">{m.jp?.[k] ?? ''}</td>)}
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="border border-[var(--color-border)] px-2 py-1.5 text-center" colSpan={2}>Jumlah Jam</td>
              {kelas.map((k) => <td key={k} className="border border-[var(--color-border)] bg-[var(--color-paper)] px-2 py-1.5 text-center">{totalKelas(mapel, k) || ''}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function StrukturKurikulumView({ konten }) {
  const data = parseStruktur(konten)
  if (!data) return <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-[var(--color-ink)]">{konten || '—'}</p>
  const aktif = data.jenjang.filter((j) => (data.tabel[j]?.mapel || []).length > 0)
  return (
    <div className="flex flex-col gap-4">
      {aktif.length === 0
        ? <p className="text-[13px] text-[var(--color-ink-soft)]">Tabel belum berisi mata pelajaran.</p>
        : aktif.map((j) => <TabelJenjangView key={j} jenjang={j} mapel={data.tabel[j].mapel} />)}
      {!htmlKosong(data.teks) && (
        <div>
          <p className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">Isi Bagian</p>
          <RichTextView html={data.teks} />
        </div>
      )}
    </div>
  )
}

export function StrukturKurikulumEditor({ value, onChange, editorKey }) {
  const data = value && value.tabel ? value : DEFAULT_STRUKTUR
  const emit = (next) => onChange(next)

  const toggleJenjang = (j) => {
    const next = data.jenjang.includes(j) ? data.jenjang.filter((x) => x !== j) : [...data.jenjang, j]
    emit({ ...data, jenjang: JENJANG_ORDER.filter((x) => next.includes(x)) })
  }
  const mutMapel = (j, fn) => {
    const tabel = { ...data.tabel, [j]: { mapel: fn(data.tabel[j]?.mapel || []) } }
    emit({ ...data, tabel })
  }
  const setNama = (j, i, nama) => mutMapel(j, (arr) => arr.map((m, idx) => (idx === i ? { ...m, nama } : m)))
  const setJp = (j, i, k, val) => mutMapel(j, (arr) => arr.map((m, idx) => {
    if (idx !== i) return m
    const jp = { ...m.jp }
    if (val === '' || val == null) delete jp[k]; else jp[k] = Math.max(0, Number(val) || 0)
    return { ...m, jp }
  }))
  const addMapel = (j) => mutMapel(j, (arr) => [...arr, { nama: '', jp: {} }])
  const delMapel = (j, i) => mutMapel(j, (arr) => arr.filter((_, idx) => idx !== i))
  const setTeks = (html) => emit({ ...data, teks: html })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-medium text-[var(--color-ink)]">Jenjang:</span>
        {JENJANG_ORDER.map((j) => (
          <label key={j} className="flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-white px-3 py-1 text-[13px]">
            <input type="checkbox" checked={data.jenjang.includes(j)} onChange={() => toggleJenjang(j)} />
            {j}
          </label>
        ))}
      </div>

      {data.jenjang.length === 0 && <p className="rounded-[10px] bg-[var(--color-paper)] p-3 text-[13px] text-[var(--color-ink-soft)]">Pilih minimal satu jenjang.</p>}

      {data.jenjang.map((j) => {
        const kelas = JENJANG_KELAS[j]
        const mapel = data.tabel[j]?.mapel || []
        return (
          <div key={j} className="rounded-[12px] border border-[var(--color-border)] p-3">
            <p className="mb-2 text-[13px] font-semibold text-[var(--color-ink)]">{j}</p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="text-[var(--color-ink-soft)]">
                    <th className="border border-[var(--color-border)] px-2 py-1.5">No</th>
                    <th className="border border-[var(--color-border)] px-2 py-1.5 text-left">Mata Pelajaran</th>
                    {kelas.map((k) => <th key={k} className="border border-[var(--color-border)] px-1.5 py-1.5 text-center">{k}</th>)}
                    <th className="border border-[var(--color-border)] px-1 py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {mapel.map((m, i) => (
                    <tr key={i}>
                      <td className="border border-[var(--color-border)] px-2 py-1 text-center text-[var(--color-ink-soft)]">{i + 1}</td>
                      <td className="border border-[var(--color-border)] p-1">
                        <input value={m.nama} onChange={(e) => setNama(j, i, e.target.value)} placeholder="Nama mapel…"
                          className="w-full min-w-[150px] rounded-[8px] border border-transparent bg-transparent px-2 py-1 text-[13px] focus:border-[var(--color-navy)] focus:bg-white focus:outline-none" />
                      </td>
                      {kelas.map((k) => (
                        <td key={k} className="border border-[var(--color-border)] p-0.5">
                          <input type="number" min="0" inputMode="numeric" value={m.jp?.[k] ?? ''} onChange={(e) => setJp(j, i, k, e.target.value)}
                            className="w-12 rounded-[6px] border border-transparent bg-transparent px-1 py-1 text-center text-[13px] focus:border-[var(--color-navy)] focus:bg-white focus:outline-none" />
                        </td>
                      ))}
                      <td className="border border-[var(--color-border)] px-1 text-center">
                        <button type="button" onClick={() => delMapel(j, i)} title="Hapus" className="btn-press rounded-full p-1 text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]"><Trash2 className="h-3.5 w-3.5" /></button>
                      </td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="border border-[var(--color-border)] px-2 py-1.5 text-center" colSpan={2}>Jumlah Jam</td>
                    {kelas.map((k) => <td key={k} className="border border-[var(--color-border)] bg-[var(--color-paper)] px-1 py-1.5 text-center">{totalKelas(mapel, k) || ''}</td>)}
                    <td className="border border-[var(--color-border)]" />
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-2"><Button size="sm" variant="outline" onClick={() => addMapel(j)}><Plus className="h-4 w-4" /> Tambah Mapel</Button></div>
          </div>
        )
      })}

      <div>
        <p className="mb-1.5 text-[13px] font-medium text-[var(--color-ink)]">Isi Bagian (khusus teks)</p>
        <RichTextEditor key={editorKey} value={data.teks} onChange={setTeks} placeholder="Penjelasan naratif struktur kurikulum…" />
      </div>
    </div>
  )
}

// ------------------------------------------------------------ BEBAN BELAJAR ---
const BEBAN_COLS = [
  { key: 'label', label: 'Jenjang, kelas', w: 'min-w-[120px]' },
  { key: 'menit', label: 'Satu jam pelajaran (menit)' },
  { key: 'jpMinggu', label: 'Jumlah jam Per/minggu' },
  { key: 'mingguEfektif', label: 'Minggu Efektif Per/tahun' },
  { key: 'jamTahun', label: 'Jumlah jam pelajaran Per/tahun', w: 'min-w-[150px]' },
  { key: 'jam60', label: 'Jumlah jam per/Tahun (@60 menit)' },
]
const DEFAULT_BEBAN = { v: 1, rows: [], teks: '' }
const emptyBebanRow = () => ({ label: '', menit: '', jpMinggu: '', mingguEfektif: '', jamTahun: '', jam60: '' })

export function parseBeban(konten) {
  if (!konten) return null
  let o
  try { o = JSON.parse(konten) } catch { return null }
  if (!o || !Array.isArray(o.rows)) return null
  return { v: 1, rows: o.rows.map((r) => ({ ...emptyBebanRow(), ...r })), teks: o.teks || '' }
}
export function bebanKosong(data) {
  if (!data) return true
  const adaRow = (data.rows || []).some((r) => BEBAN_COLS.some((c) => String(r[c.key] || '').trim()))
  return !adaRow && htmlKosong(data.teks)
}
export function ringkasBeban(konten) {
  const d = parseBeban(konten)
  if (!d) return null
  return `Tabel beban belajar · ${d.rows.length} baris`
}

export function BebanBelajarView({ konten }) {
  const data = parseBeban(konten)
  if (!data) return <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-[var(--color-ink)]">{konten || '—'}</p>
  return (
    <div className="flex flex-col gap-4">
      {data.rows.length === 0 ? (
        <p className="text-[13px] text-[var(--color-ink-soft)]">Tabel beban belajar belum diisi.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="text-[var(--color-ink-soft)]">
                {BEBAN_COLS.map((c) => <th key={c.key} className="border border-[var(--color-border)] bg-[var(--color-paper)] px-2 py-1.5 text-center">{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, i) => (
                <tr key={i}>
                  {BEBAN_COLS.map((c) => <td key={c.key} className="border border-[var(--color-border)] px-2 py-1.5 text-center">{r[c.key] || ''}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!htmlKosong(data.teks) && (
        <div>
          <p className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">Isi Bagian</p>
          <RichTextView html={data.teks} />
        </div>
      )}
    </div>
  )
}

export function BebanBelajarEditor({ value, onChange, editorKey }) {
  const data = value && Array.isArray(value.rows) ? value : DEFAULT_BEBAN
  const emit = (next) => onChange(next)
  const setCell = (i, key, val) => emit({ ...data, rows: data.rows.map((r, idx) => (idx === i ? { ...r, [key]: val } : r)) })
  const addRow = () => emit({ ...data, rows: [...data.rows, emptyBebanRow()] })
  const delRow = (i) => emit({ ...data, rows: data.rows.filter((_, idx) => idx !== i) })
  const setTeks = (html) => emit({ ...data, teks: html })

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="text-[var(--color-ink-soft)]">
              {BEBAN_COLS.map((c) => <th key={c.key} className="border border-[var(--color-border)] bg-[var(--color-paper)] px-2 py-1.5 text-center align-bottom">{c.label}</th>)}
              <th className="border border-[var(--color-border)] px-1 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r, i) => (
              <tr key={i}>
                {BEBAN_COLS.map((c) => (
                  <td key={c.key} className="border border-[var(--color-border)] p-0.5">
                    <input value={r[c.key]} onChange={(e) => setCell(i, c.key, e.target.value)}
                      className={`w-full ${c.w || 'min-w-[90px]'} rounded-[6px] border border-transparent bg-transparent px-1.5 py-1 text-center text-[13px] focus:border-[var(--color-navy)] focus:bg-white focus:outline-none`} />
                  </td>
                ))}
                <td className="border border-[var(--color-border)] px-1 text-center">
                  <button type="button" onClick={() => delRow(i)} title="Hapus" className="btn-press rounded-full p-1 text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]"><Trash2 className="h-3.5 w-3.5" /></button>
                </td>
              </tr>
            ))}
            {data.rows.length === 0 && (
              <tr><td colSpan={BEBAN_COLS.length + 1} className="border border-[var(--color-border)] px-2 py-3 text-center text-[13px] text-[var(--color-ink-soft)]">Belum ada baris. Klik "Tambah Baris".</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div><Button size="sm" variant="outline" onClick={addRow}><Plus className="h-4 w-4" /> Tambah Baris</Button></div>

      <div>
        <p className="mb-1.5 text-[13px] font-medium text-[var(--color-ink)]">Isi Bagian (khusus teks)</p>
        <RichTextEditor key={editorKey} value={data.teks} onChange={setTeks} placeholder="Penjelasan naratif beban belajar…" />
      </div>
    </div>
  )
}
