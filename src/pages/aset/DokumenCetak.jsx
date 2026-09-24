import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { Printer, ArrowLeft } from 'lucide-react'
import { KOP, loadDokumen, buildDokumen, DOKUMEN_BY_JENIS } from '../../lib/dokumenSarpras'
import { loadDokumenAkd, buildDokumenAkd, DOKUMEN_AKD_BY_JENIS } from '../../lib/dokumenAkademik'

// Halaman cetak dokumen kerja Sarpras & Akademik — standalone (tanpa sidebar), siap
// di-print / disimpan sebagai PDF lewat dialog print browser.
export default function DokumenCetak() {
  const { jenis, id } = useParams()
  const [sp] = useSearchParams()
  const navigate = useNavigate()
  const [def, setDef] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const isAkd = !!DOKUMEN_AKD_BY_JENIS[jenis]
  const meta = DOKUMEN_AKD_BY_JENIS[jenis] || DOKUMEN_BY_JENIS[jenis]
  const qsKey = sp.toString()

  useEffect(() => {
    let alive = true
    if (!DOKUMEN_AKD_BY_JENIS[jenis] && !DOKUMEN_BY_JENIS[jenis]) return
    setLoading(true); setErr('')
    ;(async () => {
      let built
      try {
        const qs = Object.fromEntries(new URLSearchParams(qsKey))
        built = isAkd
          ? buildDokumenAkd(jenis, await loadDokumenAkd(jenis, id, qs))
          : buildDokumen(jenis, await loadDokumen(jenis, id))
      } catch (e) {
        if (alive) { setErr(e?.message || String(e)); setLoading(false) }
        return
      }
      if (!alive) return
      setDef(built)
      setLoading(false)
      setTimeout(() => { document.title = (DOKUMEN_AKD_BY_JENIS[jenis] || DOKUMEN_BY_JENIS[jenis])?.label || 'Dokumen' }, 0)
    })()
    return () => { alive = false }
  }, [jenis, id, qsKey, isAkd])

  const landscape = def?.orientasi === 'landscape'

  if (!meta) return <div style={{ padding: 40, fontFamily: 'serif' }}>Jenis dokumen tidak dikenal: {jenis}</div>
  if (err) return <div style={{ padding: 40, fontFamily: 'serif' }}>Gagal memuat dokumen: {err}</div>
  if (loading || !def) return <div style={{ padding: 40, fontFamily: 'serif' }}>Memuat dokumen…</div>

  return (
    <div className="doc-root">
      <style>{`
        .doc-root { background: #f3f4f6; min-height: 100vh; padding: 24px 0 64px; }
        .doc-bar { position: sticky; top: 0; z-index: 10; display: flex; gap: 8px; justify-content: center; margin-bottom: 20px; }
        .doc-bar button { display: inline-flex; align-items: center; gap: 6px; font: 500 14px system-ui, sans-serif; padding: 8px 16px; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; cursor: pointer; }
        .doc-bar button.primary { background: #1e3a5f; color: #fff; border-color: #1e3a5f; }
        .doc-page { background: #fff; width: 210mm; min-height: 297mm; margin: 0 auto; padding: 18mm 16mm; box-shadow: 0 1px 8px rgba(0,0,0,.12); color: #111; font-family: 'Times New Roman', Georgia, serif; font-size: 12pt; line-height: 1.45; }
        .doc-kop { position: relative; text-align: center; border-bottom: 3px double #111; padding-bottom: 8px; margin-bottom: 16px; min-height: 64px; }
        .doc-logo { position: absolute; left: 0; top: 0; height: 64px; width: auto; max-width: 84px; object-fit: contain; }
        .doc-kop .y { font-size: 15pt; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; }
        .doc-kop .u { font-size: 11pt; }
        .doc-kop .a { font-size: 9.5pt; color: #333; }
        .doc-title { text-align: center; margin: 14px 0 4px; }
        .doc-title h1 { font-size: 13pt; font-weight: 700; text-transform: uppercase; text-decoration: underline; margin: 0; }
        .doc-title .no { font-size: 11pt; white-space: pre-line; }
        .doc-tt { text-align: right; margin: 10px 0 6px; }
        .doc-meta { margin: 8px 0; }
        .doc-meta div { display: flex; }
        .doc-meta .k { width: 190px; }
        .doc-meta .s { width: 10px; }
        .doc-intro, .doc-narasi p { margin: 8px 0; text-align: justify; }
        table.doc-tbl { width: 100%; border-collapse: collapse; margin: 8px 0 4px; }
        table.doc-tbl th, table.doc-tbl td { border: 1px solid #111; padding: 4px 6px; font-size: 10.5pt; vertical-align: top; white-space: pre-line; }
        .doc-page.land { width: 297mm; min-height: 210mm; }
        .doc-page.land table.doc-tbl th, .doc-page.land table.doc-tbl td { font-size: 9.5pt; }
        table.doc-tbl th { background: #eef2f7; text-align: left; }
        .doc-tbl-title { font-weight: 700; margin: 10px 0 2px; font-size: 11pt; }
        .doc-ttd { display: flex; justify-content: space-between; gap: 40px; margin-top: 32px; }
        .doc-ttd .blk { text-align: center; white-space: pre-line; min-width: 200px; }
        .doc-ttd .sp { height: 64px; }
        .doc-ttd .nm { text-decoration: underline; font-weight: 600; }
        .doc-ttd .jb { font-size: 10pt; color: #333; }
        @media print {
          .doc-root { background: #fff; padding: 0; }
          .doc-bar { display: none; }
          .doc-page { width: auto; min-height: auto; margin: 0; padding: 12mm 14mm; box-shadow: none; }
          @page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 8mm; }
        }
      `}</style>

      <div className="doc-bar">
        <button onClick={() => { if (window.history.length > 1) navigate(-1); else window.close() }}><ArrowLeft size={16} /> Kembali</button>
        <button className="primary" onClick={() => window.print()}><Printer size={16} /> Cetak / Simpan PDF</button>
      </div>

      <div className={`doc-page${landscape ? ' land' : ''}`}>
        <div className="doc-kop">
          <img className="doc-logo" src="/logo-yayasan.png" alt="" onError={(e) => { e.currentTarget.style.display = 'none' }} />
          <div className="y">{KOP.yayasan}</div>
          {def.unit && <div className="u">{def.unit}</div>}
          <div className="a">{KOP.alamat}</div>
        </div>

        <div className="doc-title">
          <h1>{def.judul}</h1>
          {def.nomor && <div className="no">{def.nomor}</div>}
        </div>

        {def.tanggalTempat && <div className="doc-tt">{def.tanggalTempat}</div>}

        {def.meta && def.meta.length > 0 && (
          <div className="doc-meta">
            {def.meta.map(([k, v], i) => (
              <div key={i}><span className="k">{k}</span><span className="s">:</span><span>{v}</span></div>
            ))}
          </div>
        )}

        {def.intro && <p className="doc-intro">{def.intro}</p>}

        {(def.tables || []).map((t, ti) => (
          <div key={ti}>
            {t.title && <div className="doc-tbl-title">{t.title}</div>}
            <table className="doc-tbl">
              <thead><tr>{t.columns.map((c, ci) => <th key={ci}>{c}</th>)}</tr></thead>
              <tbody>
                {t.rows.length === 0 ? (
                  <tr>{t.columns.map((_, ci) => <td key={ci}>&nbsp;</td>)}</tr>
                ) : t.rows.map((r, ri) => (
                  <tr key={ri}>{r.map((cell, ci) => <td key={ci}>{cell === '' || cell == null ? ' ' : cell}</td>)}</tr>
                ))}
                {t.footer && <tr>{t.footer.map((cell, ci) => <td key={ci} style={{ fontWeight: 700 }}>{cell === '' || cell == null ? ' ' : cell}</td>)}</tr>}
              </tbody>
            </table>
          </div>
        ))}

        {def.narasi && def.narasi.length > 0 && (
          <div className="doc-narasi">{def.narasi.map((p, i) => <p key={i}>{p}</p>)}</div>
        )}

        {def.ttd && def.ttd.length > 0 && (
          <div className="doc-ttd" style={{ justifyContent: def.ttd.length === 1 ? 'flex-end' : 'space-between' }}>
            {def.ttd.map((t, i) => (
              <div className="blk" key={i}>
                <div>{t.peran}</div>
                <div className="sp" />
                <div className="nm">{t.nama}</div>
                {t.jabatan && <div className="jb">{t.jabatan}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
