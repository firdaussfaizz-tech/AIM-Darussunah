// Auto-refresh daftar data (#1): dua mekanisme yang saling melengkapi.
//  1. useVisibilityRefresh — muat ulang saat tab/jendela kembali aktif
//     (mis. data ditambah di perangkat/tempat lain lalu pengguna kembali).
//     Ringan, tanpa perubahan DB, selalu jalan.
//  2. useRealtime — langganan Supabase Realtime; muat ulang (didebounce)
//     saat ada perubahan pada tabel terkait. Butuh tabel terdaftar di
//     publication `supabase_realtime` (lihat migrasi 0051). Bila realtime
//     tidak aktif untuk tabel tsb, langganan hanya diam — tidak error.
import { useEffect, useRef } from 'react'
import { supabase } from './supabaseClient'

export function useVisibilityRefresh(onRefresh) {
  const cb = useRef(onRefresh)
  cb.current = onRefresh
  useEffect(() => {
    const handler = () => { if (document.visibilityState === 'visible') cb.current?.() }
    window.addEventListener('focus', handler)
    document.addEventListener('visibilitychange', handler)
    return () => {
      window.removeEventListener('focus', handler)
      document.removeEventListener('visibilitychange', handler)
    }
  }, [])
}

export function useRealtime(tables, onRefresh, { schema = 'public' } = {}) {
  const cb = useRef(onRefresh)
  cb.current = onRefresh
  const key = (Array.isArray(tables) ? tables : [tables]).filter(Boolean).join(',')
  useEffect(() => {
    if (!key) return undefined
    let timer = null
    const trigger = () => { clearTimeout(timer); timer = setTimeout(() => cb.current?.(), 300) }
    const channel = supabase.channel(`rt-${key}-${Math.random().toString(36).slice(2)}`)
    for (const t of key.split(',')) {
      channel.on('postgres_changes', { event: '*', schema, table: t }, trigger)
    }
    channel.subscribe()
    return () => { clearTimeout(timer); supabase.removeChannel(channel) }
  }, [key, schema])
}

// Gabungan praktis: refetch saat fokus + realtime pada tabel yang diberikan.
export function useAutoRefresh(tables, onRefresh) {
  useVisibilityRefresh(onRefresh)
  useRealtime(tables, onRefresh)
}
