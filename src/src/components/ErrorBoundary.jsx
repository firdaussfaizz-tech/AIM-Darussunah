import { Component } from 'react'
import { AlertTriangle } from 'lucide-react'

// Jaring pengaman terakhir di sisi aplikasi (client): kalau ada bug pada
// satu halaman/komponen yang menyebabkan error saat render (mis. data tak
// terduga dari server), tanpa ErrorBoundary React akan menampilkan LAYAR
// PUTIH KOSONG untuk pengguna itu — terasa seperti aplikasi "crash" total,
// padahal sebenarnya hanya satu komponen yang bermasalah. Dengan
// ErrorBoundary, yang muncul adalah pesan yang jelas + tombol untuk
// memuat ulang, bukan layar kosong yang membingungkan.
//
// PENTING: ini HANYA menangkap error di sisi browser pengguna itu sendiri
// (satu tab, satu orang) — tidak ada hubungannya dengan beban server/
// database dan tidak melindungi pengguna lain. Untuk ketahanan terhadap
// banyak pengguna mengakses bersamaan, yang berperan adalah kapasitas
// Supabase (database) dan index yang memadai (lihat migrasi
// 0017_perf_indexes.sql), bukan komponen ini.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('Kesalahan tak terduga ditangkap oleh ErrorBoundary:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[var(--color-paper)] px-4">
          <div className="glass max-w-md rounded-2xl p-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-danger-soft)]">
              <AlertTriangle className="h-6 w-6 text-[var(--color-danger)]" />
            </div>
            <h1 className="mb-1.5 text-lg font-semibold text-[var(--color-ink)]">Terjadi kesalahan tak terduga</h1>
            <p className="mb-5 text-sm text-[var(--color-ink-soft)]">
              Halaman ini mengalami masalah dan tidak bisa ditampilkan. Data Anda aman — coba muat ulang halaman.
              Jika masalah terus terjadi, hubungi admin sistem.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg bg-[var(--color-navy)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
            >
              Muat Ulang Halaman
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
