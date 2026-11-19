import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { KONDISI_LABEL } from '../../lib/aset'

// Halaman info aset PUBLIK — dibuka saat QR label aset dipindai kamera HP.
// Hanya menampilkan field aman (tanpa nilai/sumber dana). Tidak perlu login.
const VERIF_LABEL = { belum: 'Belum diverifikasi', diajukan: 'Diajukan', diverifikasi: 'Diverifikasi Sekolah', disahkan: 'Disahkan Yayasan', ditolak: 'Ditolak' }
const KON_COLOR = { baik: '#17814c', rusak_ringan: '#b7791f', rusak_berat: '#c0392b' }
const VER_COLOR = { disahkan: '#17814c', diverifikasi: '#0f766e', diajukan: '#b7791f', ditolak: '#c0392b', belum: '#5f6f67' }

export default function AsetInfo() {
  const { kode } = useParams()
  const [data, setData] = useState(undefined) // undefined=loading, null=notfound, obj=ok
  useEffect(() => {
    let alive = true
    supabase.rpc('aset_info_publik', { p_kode: kode }).then(({ data: rows, error }) => {
      if (!alive) return
      setData(error ? null : (rows && rows[0]) || null)
    })
    return () => { alive = false }
  }, [kode])

  const Row = ({ k, v }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '9px 0', borderBottom: '1px solid #eef2ef', fontSize: 14 }}>
      <span style={{ color: '#5f6f67' }}>{k}</span>
      <b style={{ textAlign: 'right' }}>{v || '—'}</b>
    </div>
  )
  return (
    <div style={{ minHeight: '100vh', background: '#f4f7f5', fontFamily: "system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif", color: '#122018', padding: '20px 14px' }}>
      <div style={{ maxWidth: 440, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 14 }}>
          <img src="/logo-yayasan.png" alt="" style={{ height: 48 }} onError={(e) => { e.currentTarget.style.display = 'none' }} />
          <div style={{ fontWeight: 800, letterSpacing: .3, marginTop: 4 }}>Kartu Informasi Aset</div>
          <div style={{ fontSize: 12, color: '#5f6f67' }}>SIS HanifOne · Inventaris Sarpras</div>
        </div>
        {data === undefined ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#5f6f67' }}>Memuat…</div>
        ) : data === null ? (
          <div style={{ background: '#fff', border: '1px solid #e2e8e4', borderRadius: 14, padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 34 }}>🔍</div>
            <h3 style={{ margin: '8px 0 4px' }}>Aset tidak ditemukan</h3>
            <p style={{ color: '#5f6f67', fontSize: 13, margin: 0 }}>Kode <b style={{ fontFamily: 'monospace' }}>{kode}</b> tidak terdaftar atau sudah dihapus.</p>
          </div>
        ) : (
          <div style={{ background: '#fff', border: '1px solid #e2e8e4', borderRadius: 14, boxShadow: '0 1px 3px rgba(16,40,28,.08)', overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(180deg,#0e7a4f,#0a5c3b)', color: '#fff', padding: '16px 18px' }}>
              <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.2 }}>{data.nama}</div>
              <div style={{ fontFamily: 'monospace', fontSize: 13, opacity: .9, marginTop: 3 }}>{data.kode_aset}</div>
            </div>
            <div style={{ padding: '6px 18px 16px' }}>
              <div style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
                <span style={{ background: KON_COLOR[data.kondisi] || '#5f6f67', color: '#fff', borderRadius: 20, padding: '3px 11px', fontSize: 12, fontWeight: 700 }}>{KONDISI_LABEL[data.kondisi] || data.kondisi}</span>
                <span style={{ background: VER_COLOR[data.verif_status] || '#5f6f67', color: '#fff', borderRadius: 20, padding: '3px 11px', fontSize: 12, fontWeight: 700 }}>{VERIF_LABEL[data.verif_status] || data.verif_status}</span>
              </div>
              <Row k="Golongan" v={data.golongan} />
              <Row k="Merk / Jenis / Ukuran" v={data.merk_tipe} />
              <Row k="Jumlah" v={`${Number(data.jumlah) || 1} ${data.satuan || ''}`} />
              <Row k="Ruangan" v={data.ruangan} />
              <Row k="Unit" v={data.unit ? `${data.unit}${data.jenjang ? ` (${data.jenjang.toUpperCase()})` : ''}` : '—'} />
              <Row k="Kode Lokasi" v={data.kode_lokasi} />
              <Row k="Tahun Perolehan" v={data.tahun_perolehan} />
            </div>
          </div>
        )}
        <p style={{ textAlign: 'center', fontSize: 11, color: '#9aa8a0', marginTop: 16 }}>Informasi ringkas dari label aset. Data rinci & keuangan tersedia di aplikasi bagi pengguna berwenang.</p>
      </div>
    </div>
  )
}
