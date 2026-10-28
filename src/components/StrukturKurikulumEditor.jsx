import { Plus, Trash2 } from 'lucide-react'
import { Button } from './ui'

// ============================================================================
// Editor/penampil tabel "Muatan / Struktur Kurikulum".
//
// Dipakai pada bagian struktur kurikulum (Islam Plus I.D & KOSP III.A).
// Data disimpan sebagai JSON di kolom `konten` (tanpa migrasi), bentuk:
//   { v:1, jenjang:['SD','SMP','SMA'], mapel:[{nama, jp:{ '<kelas>': angka }}], catatan }
// Angka JP = jam pelajaran per minggu (dianggap sama untuk kedua semester).
// ============================================================================

export const JENJANG_KELAS = {
  SD: ['I', 'II', 'III', 'IV', 'V', 'VI'],
  SMP: ['VII', 'VIII', 'IX'],
  SMA: ['X', 'XI', 'XII'],
}
export const JENJANG_ORDER = ['SD', 'SMP', 'SMA']

const DEFAULT_STRUKTUR = { v: 1, jenjang: ['SD', 'SMP', 'SMA'], mapel: [], catatan: '' }

// Parse konten → objek struktur ternormalisasi, atau null bila bukan struktur.
export function parseStruktur(konten) {
  if (!konten) return null
  let obj
  try { obj = JSON.parse(konten) } catch { return null }
  if (!obj || !Array.isArray(obj.mapel)) return null
  return {
    v: 1,
    jenjang: Array.isArray(obj.jenjang) && obj.jenjang.length ? JENJANG_ORDER.filter((j) => obj.jenjang.includes(j)) : ['SD', 'SMP', 'SMA'],
    mapel: obj.mapel.map((m) => ({ nama: m?.nama || '', jp: m?.jp && typeof m.jp === 'object' ? m.jp : {} })),
    catatan: obj.catatan || '',
  }
}

export const strukturKosong = (data) => !data || !data.mapel || data.mapel.length === 0

export function ringkasStruktur(konten) {
  const d = parseStruktur(konten)
  if (!d) return null
  return `Tabel struktur · ${d.mapel.length} mapel · jenjang ${d.jenjang.join(', ') || '—'}`
}

const kelasAktif = (data) => JENJANG_ORDER
  .filter((j) => data.jenjang.includes(j))
  .flatMap((j) => JENJANG_KELAS[j].map((k) => ({ jenjang: j, kelas: k })))

const totalKelas = (data, kelas) => data.mapel.reduce((s, m) => s + (Number(m.jp?.[kelas]) || 0), 0)

// ---- Penampil read-only ----
export function StrukturKurikulumView({ konten }) {
  const data = parseStruktur(konten)
  if (!data) return <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-[var(--color-ink)]">{konten || '—'}</p>
  if (strukturKosong(data)) return <p className="text-[13px] text-[var(--color-ink-soft)]">Tabel belum berisi mata pelajaran.</p>
  const kelas = kelasAktif(data)
  const grup = JENJANG_ORDER.filter((j) => data.jenjang.includes(j))
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="text-[var(--color-ink-soft)]">
              <th rowSpan={2} className="border border-[var(--color-border)] px-2 py-1.5 text-left">No</th>
              <th rowSpan={2} className="border border-[var(--color-border)] px-2 py-1.5 text-left">Mata Pelajaran</th>
              {grup.map((j) => (
                <th key={j} colSpan={JENJANG_KELAS[j].length} className="border border-[var(--color-border)] bg-[var(--color-paper)] px-2 py-1.5 text-center">{j}</th>
              ))}
            </tr>
            <tr className="text-[var(--color-ink-soft)]">
              {kelas.map((c) => (
                <th key={c.kelas} className="border border-[var(--color-border)] px-2 py-1 text-center font-medium">{c.kelas}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.mapel.map((m, i) => (
              <tr key={i}>
                <td className="border border-[var(--color-border)] px-2 py-1.5 text-center">{i + 1}</td>
                <td className="border border-[var(--color-border)] px-2 py-1.5">{m.nama || '—'}</td>
                {kelas.map((c) => (
                  <td key={c.kelas} className="border border-[var(--color-border)] px-2 py-1.5 text-center">{m.jp?.[c.kelas] ?? ''}</td>
                ))}
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="border border-[var(--color-border)] px-2 py-1.5 text-center" colSpan={2}>Jumlah Jam</td>
              {kelas.map((c) => (
                <td key={c.kelas} className="border border-[var(--color-border)] bg-[var(--color-paper)] px-2 py-1.5 text-center">{totalKelas(data, c.kelas) || ''}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      {data.catatan && <p className="text-[13px] text-[var(--color-ink-soft)]"><strong>Catatan:</strong> {data.catatan}</p>}
    </div>
  )
}

// ---- Editor ----
export function StrukturKurikulumEditor({ value, onChange }) {
  const data = value && Array.isArray(value.mapel) ? value : DEFAULT_STRUKTUR
  const kelas = kelasAktif(data)
  const grup = JENJANG_ORDER.filter((j) => data.jenjang.includes(j))

  const emit = (next) => onChange(next)
  const setNama = (i, nama) => emit({ ...data, mapel: data.mapel.map((m, idx) => (idx === i ? { ...m, nama } : m)) })
  const setJp = (i, k, val) => {
    const jp = { ...data.mapel[i].jp }
    if (val === '' || val == null) delete jp[k]
    else jp[k] = Math.max(0, Number(val) || 0)
    emit({ ...data, mapel: data.mapel.map((m, idx) => (idx === i ? { ...m, jp } : m)) })
  }
  const addMapel = () => emit({ ...data, mapel: [...data.mapel, { nama: '', jp: {} }] })
  const delMapel = (i) => emit({ ...data, mapel: data.mapel.filter((_, idx) => idx !== i) })
  const toggleJenjang = (j) => {
    const next = data.jenjang.includes(j) ? data.jenjang.filter((x) => x !== j) : [...data.jenjang, j]
    emit({ ...data, jenjang: JENJANG_ORDER.filter((x) => next.includes(x)) })
  }
  const setCatatan = (c) => emit({ ...data, catatan: c })

  return (
    <div className="flex flex-col gap-3">
      {/* Pilih jenjang/kolom */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-medium text-[var(--color-ink)]">Jenjang:</span>
        {JENJANG_ORDER.map((j) => (
          <label key={j} className="flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-white px-3 py-1 text-[13px]">
            <input type="checkbox" checked={data.jenjang.includes(j)} onChange={() => toggleJenjang(j)} />
            {j}
          </label>
        ))}
      </div>

      {grup.length === 0 ? (
        <p className="rounded-[10px] bg-[var(--color-paper)] p-3 text-[13px] text-[var(--color-ink-soft)]">Pilih minimal satu jenjang untuk menampilkan kolom kelas.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="text-[var(--color-ink-soft)]">
                <th rowSpan={2} className="border border-[var(--color-border)] px-2 py-1.5">No</th>
                <th rowSpan={2} className="border border-[var(--color-border)] px-2 py-1.5 text-left">Mata Pelajaran</th>
                {grup.map((j) => (
                  <th key={j} colSpan={JENJANG_KELAS[j].length} className="border border-[var(--color-border)] bg-[var(--color-paper)] px-2 py-1.5 text-center">{j}</th>
                ))}
                <th rowSpan={2} className="border border-[var(--color-border)] px-2 py-1.5" />
              </tr>
              <tr className="text-[var(--color-ink-soft)]">
                {kelas.map((c) => (
                  <th key={c.kelas} className="border border-[var(--color-border)] px-1.5 py-1 text-center font-medium">{c.kelas}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.mapel.map((m, i) => (
                <tr key={i}>
                  <td className="border border-[var(--color-border)] px-2 py-1 text-center text-[var(--color-ink-soft)]">{i + 1}</td>
                  <td className="border border-[var(--color-border)] p-1">
                    <input
                      value={m.nama}
                      onChange={(e) => setNama(i, e.target.value)}
                      placeholder="Nama mapel…"
                      className="w-full min-w-[160px] rounded-[8px] border border-transparent bg-transparent px-2 py-1 text-[13px] text-[var(--color-ink)] focus:border-[var(--color-navy)] focus:bg-white focus:outline-none"
                    />
                  </td>
                  {kelas.map((c) => (
                    <td key={c.kelas} className="border border-[var(--color-border)] p-0.5">
                      <input
                        type="number" min="0" inputMode="numeric"
                        value={m.jp?.[c.kelas] ?? ''}
                        onChange={(e) => setJp(i, c.kelas, e.target.value)}
                        className="w-12 rounded-[6px] border border-transparent bg-transparent px-1 py-1 text-center text-[13px] text-[var(--color-ink)] focus:border-[var(--color-navy)] focus:bg-white focus:outline-none"
                      />
                    </td>
                  ))}
                  <td className="border border-[var(--color-border)] px-1 text-center">
                    <button type="button" onClick={() => delMapel(i)} title="Hapus mapel" className="btn-press rounded-full p-1 text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="border border-[var(--color-border)] px-2 py-1.5 text-center" colSpan={2}>Jumlah Jam</td>
                {kelas.map((c) => (
                  <td key={c.kelas} className="border border-[var(--color-border)] bg-[var(--color-paper)] px-1 py-1.5 text-center">{totalKelas(data, c.kelas) || ''}</td>
                ))}
                <td className="border border-[var(--color-border)]" />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div>
        <Button size="sm" variant="outline" onClick={addMapel}><Plus className="h-4 w-4" /> Tambah Mapel</Button>
      </div>

      <label className="block">
        <span className="mb-1 block text-[13px] font-medium text-[var(--color-ink)]">Catatan Struktur (opsional)</span>
        <textarea
          rows={2}
          value={data.catatan}
          onChange={(e) => setCatatan(e.target.value)}
          placeholder="mis. keterangan kokurikuler/pembiasaan, perbedaan semester, dll."
          className="w-full rounded-[12px] border border-[var(--color-border)] bg-white px-3.5 py-2.5 text-[14px] text-[var(--color-ink)] focus:border-[var(--color-navy)] focus:outline-none focus:ring-2 focus:ring-[var(--color-navy-50)]"
        />
      </label>
    </div>
  )
}
