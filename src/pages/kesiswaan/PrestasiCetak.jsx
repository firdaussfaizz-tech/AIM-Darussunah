import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { formatDate } from '../../lib/format'
import { TINGKAT_LABEL, KATEGORI_LABEL } from '../../lib/prestasi'

const unitNama = (s) => (s?.schools ? `${s.schools.jenjang} — ${s.schools.nama}` : '')

// Halaman cetak prestasi (standalone, tanpa sidebar).
//  mode = 'piagam'   → sertifikat per prestasi (:id = id prestasi)
//  mode = 'lampiran' → daftar prestasi per siswa (:id = id siswa)
export default function PrestasiCetak({ mode }) {
  const { id } = useParams()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)

  useEffect(() => {
    (async () => {
      setLoading(true)
      if (mode === 'piagam') {
        const { data: p } = await supabase.from('prestasi_siswa')
          .select('*, siswa!siswa_id(nama_lengkap, nis, schools!school_id(nama, jenjang)), tahun_ajaran(nama)')
          .eq('id', id).maybeSingle()
        setData(p || null)
      } else {
        const { data: s } = await supabase.from('siswa').select('id, nama_lengkap, nis, schools!school_id(nama, jenjang)').eq('id', id).maybeSingle()
        const { data: list } = await supabase.from('prestasi_siswa').select('*').eq('siswa_id', id).order('tanggal', { ascending: true, nullsFirst: true })
        setData({ siswa: s, list: list || [] })
      }
      setLoading(false)
    })()
  }, [mode, id])

  useEffect(() => {
    if (!loading && data) { const t = setTimeout(() => window.print(), 400); return () => clearTimeout(t) }
  }, [loading, data])

  if (loading) return <div style={{ padding: 40, fontFamily: 'serif' }}>Memuat…</div>
  if (!data || (mode === 'piagam' && !data.siswa) || (mode === 'lampiran' && !data.siswa)) {
    return <div style={{ padding: 40, fontFamily: 'serif' }}>Data tidak ditemukan.</div>
  }

  return (
    <div className="prestasi-cetak">
      <style>{`
        @page { size: A4; margin: 18mm; }
        @media print { .no-print { display: none !important; } }
        .prestasi-cetak { font-family: Georgia, 'Times New Roman', serif; color: #1a2332; background: #fff; }
        .sheet { max-width: 800px; margin: 0 auto; padding: 24px; }
        .btn { background:#1e3a5f; color:#fff; border:none; padding:8px 16px; border-radius:6px; cursor:pointer; font-family:system-ui; }
        .center { text-align:center; }
        table { width:100%; border-collapse:collapse; margin-top:12px; }
        th,td { border:1px solid #c9d2de; padding:7px 9px; font-size:13px; text-align:left; vertical-align:top; }
        th { background:#f0f3f8; }
      `}</style>
      <div className="no-print" style={{ textAlign: 'center', padding: '12px' }}>
        <button className="btn" onClick={() => window.print()}>Cetak / Simpan PDF</button>
      </div>

      {mode === 'piagam' ? <Piagam p={data} /> : <Lampiran siswa={data.siswa} list={data.list} />}
    </div>
  )
}

function Piagam({ p }) {
  return (
    <div className="sheet" style={{ border: '3px double #b38b2d', padding: 40, marginTop: 8 }}>
      <div className="center">
        <p style={{ letterSpacing: 2, fontSize: 13, textTransform: 'uppercase', color: '#6b7685' }}>Yayasan Pendidikan Islam Darussunah</p>
        <p style={{ fontSize: 14, marginTop: 2 }}>{unitNama(p.siswa)}</p>
        <h1 style={{ fontSize: 34, letterSpacing: 6, margin: '22px 0 4px', color: '#b38b2d' }}>PIAGAM PENGHARGAAN</h1>
        <p style={{ fontSize: 13, color: '#6b7685' }}>Nomor: ____/PRES/____/{p.tahun_ajaran?.nama ? p.tahun_ajaran.nama.split('/')[0] : new Date().getFullYear()}</p>
        <p style={{ marginTop: 26, fontSize: 15 }}>Diberikan kepada:</p>
        <p style={{ fontSize: 28, fontWeight: 'bold', margin: '8px 0' }}>{p.siswa?.nama_lengkap}</p>
        {p.siswa?.nis && <p style={{ fontSize: 13, color: '#6b7685' }}>NIS {p.siswa.nis}</p>}
        <p style={{ marginTop: 22, fontSize: 15, lineHeight: 1.7 }}>
          atas prestasi yang diraih sebagai<br />
          <b style={{ fontSize: 19 }}>{p.peringkat ? `${p.peringkat} — ` : ''}{p.judul}</b><br />
          {p.bidang ? `Bidang ${p.bidang} · ` : ''}Tingkat {TINGKAT_LABEL[p.tingkat]}
          {p.penyelenggara ? <><br />Penyelenggara: {p.penyelenggara}</> : null}
          {p.tanggal ? <><br />{formatDate(p.tanggal)}{p.lokasi ? ` · ${p.lokasi}` : ''}</> : null}
        </p>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 48 }}>
        <div className="center" style={{ fontSize: 13, width: '45%' }}>
          <p>Guru Pembina,</p><div style={{ height: 60 }} /><p style={{ borderTop: '1px solid #1a2332', paddingTop: 4 }}>{p.pembina || '(…………………………)'}</p>
        </div>
        <div className="center" style={{ fontSize: 13, width: '45%' }}>
          <p>Kepala Satuan Pendidikan,</p><div style={{ height: 60 }} /><p style={{ borderTop: '1px solid #1a2332', paddingTop: 4 }}>(…………………………)</p>
        </div>
      </div>
    </div>
  )
}

function Lampiran({ siswa, list }) {
  const totalPoin = list.reduce((s, r) => s + Number(r.poin || 0), 0)
  return (
    <div className="sheet">
      <div className="center" style={{ borderBottom: '2px solid #1a2332', paddingBottom: 10, marginBottom: 14 }}>
        <p style={{ letterSpacing: 2, fontSize: 12, textTransform: 'uppercase', color: '#6b7685' }}>Yayasan Pendidikan Islam Darussunah</p>
        <h1 style={{ fontSize: 20, margin: '6px 0' }}>Daftar Prestasi Siswa</h1>
      </div>
      <table style={{ marginBottom: 14, border: 'none' }}>
        <tbody>
          <tr><td style={{ border: 'none', width: 140 }}>Nama</td><td style={{ border: 'none' }}><b>{siswa.nama_lengkap}</b></td></tr>
          <tr><td style={{ border: 'none' }}>NIS</td><td style={{ border: 'none' }}>{siswa.nis || '—'}</td></tr>
          <tr><td style={{ border: 'none' }}>Unit</td><td style={{ border: 'none' }}>{unitNama(siswa)}</td></tr>
        </tbody>
      </table>
      {list.length === 0 ? <p>Belum ada prestasi tercatat.</p> : (
        <table>
          <thead><tr><th style={{ width: 28 }}>No</th><th>Prestasi</th><th>Kategori/Bidang</th><th>Tingkat</th><th>Capaian</th><th>Tanggal</th><th style={{ width: 44 }}>Poin</th></tr></thead>
          <tbody>
            {list.map((r, i) => (
              <tr key={r.id}>
                <td>{i + 1}</td>
                <td>{r.judul}{r.penyelenggara ? <span style={{ color: '#6b7685' }}><br />{r.penyelenggara}</span> : null}</td>
                <td>{KATEGORI_LABEL[r.kategori]}{r.bidang ? ` · ${r.bidang}` : ''}</td>
                <td>{TINGKAT_LABEL[r.tingkat]}</td>
                <td>{r.peringkat || '—'}</td>
                <td>{r.tanggal ? formatDate(r.tanggal) : '—'}</td>
                <td style={{ textAlign: 'right' }}>{r.poin}</td>
              </tr>
            ))}
            <tr><td colSpan={6} style={{ textAlign: 'right', fontWeight: 'bold' }}>Total Poin</td><td style={{ textAlign: 'right', fontWeight: 'bold' }}>{totalPoin}</td></tr>
          </tbody>
        </table>
      )}
    </div>
  )
}
