import { Component } from 'react'
import { logClientError } from '../lib/errorLog'

// Menangkap crash saat render React agar: (1) tercatat ke error_log beserta
// peran/halaman, (2) pengguna melihat pesan ramah + tombol pulih, bukan layar
// putih. Dipasang membungkus seluruh App di main.jsx.
export default class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false } }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch(error, info) {
    logClientError({ kind: 'react', message: error?.message || 'React render error', stack: error?.stack || '', detail: { componentStack: info?.componentStack?.slice(0, 2000) } })
  }
  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f4f7f5', fontFamily: "system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif", padding: 20 }}>
        <div style={{ maxWidth: 440, background: '#fff', border: '1px solid #e2e8e4', borderRadius: 14, boxShadow: '0 1px 3px rgba(16,40,28,.08)', padding: 28, textAlign: 'center' }}>
          <div style={{ fontSize: 34 }}>⚠️</div>
          <h2 style={{ margin: '8px 0 4px', color: '#122018', fontSize: 18 }}>Terjadi gangguan di halaman ini</h2>
          <p style={{ color: '#5f6f67', fontSize: 14, margin: '0 0 18px' }}>Maaf, ada bagian yang gagal dimuat. Kejadian ini sudah otomatis tercatat untuk diperbaiki tim. Anda bisa memuat ulang atau kembali ke Dasbor.</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button onClick={() => window.location.reload()} style={{ background: '#0e7a4f', color: '#fff', border: 0, borderRadius: 10, padding: '10px 16px', fontWeight: 700, cursor: 'pointer' }}>Muat ulang</button>
            <button onClick={() => { window.location.href = '/' }} style={{ background: '#fff', color: '#122018', border: '1px solid #cfdcd4', borderRadius: 10, padding: '10px 16px', fontWeight: 700, cursor: 'pointer' }}>Ke Dasbor</button>
          </div>
        </div>
      </div>
    )
  }
}
