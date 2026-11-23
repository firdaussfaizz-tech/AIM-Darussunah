// Perekam error klien — menulis tiap error ke tabel `error_log` beserta
// konteks pengguna (user_id, peran, unit, halaman). Tujuannya: menemukan bug
// yang hanya muncul pada peran/akun tertentu, langsung dari pemakaian nyata.
//
// Cakupan:
//  - window 'error'            → error JavaScript tak tertangani
//  - window 'unhandledrejection' → Promise gagal tak tertangani
//  - patch fetch               → respons Supabase 4xx/5xx (termasuk penolakan
//                                RLS/izin per peran) tertangkap otomatis
//  - ErrorBoundary (komponen)  → crash saat render React
//
// Prinsip: logger TIDAK BOLEH pernah melempar atau mengganggu aplikasi.
import { supabase } from './supabaseClient'

// Konteks pengguna aktif — diisi AuthContext saat sesi/role termuat.
let ctx = { user_id: null, nama: null, peran: null, school_id: null }
export function setErrorLogContext(next) { ctx = { ...ctx, ...next } }

// Throttle: cegah banjir log dari error yang sama berulang-ulang.
const recent = new Map() // signature -> timestamp(ms)
const WINDOW_MS = 30000
function signature(kind, message, route) { return `${kind}|${route}|${String(message || '').slice(0, 200)}` }

export async function logClientError({ kind = 'error', message = '', stack = '', detail = null } = {}) {
  try {
    const route = typeof location !== 'undefined' ? location.pathname : ''
    const sig = signature(kind, message, route)
    const now = Date.now()
    const last = recent.get(sig)
    if (last && now - last < WINDOW_MS) return
    recent.set(sig, now)
    if (recent.size > 300) { for (const [k, t] of recent) if (now - t > WINDOW_MS) recent.delete(k) }
    await supabase.from('error_log').insert({
      user_id: ctx.user_id || null,
      nama: ctx.nama || null,
      peran: ctx.peran || null,
      school_id: ctx.school_id || null,
      route,
      kind,
      message: String(message || '').slice(0, 2000),
      stack: String(stack || '').slice(0, 6000),
      detail: detail ? safeJson(detail) : null,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    })
  } catch { /* jangan pernah melempar dari logger */ }
}

function safeJson(v) { try { return JSON.parse(JSON.stringify(v)) } catch { return null } }

// Error Supabase yang dikembalikan sebagai { data, error } (bukan dilempar)
// bisa dicatat manual dari pemanggil bila perlu konteks tambahan.
export function logSupabaseError(error, where) {
  if (!error) return
  logClientError({ kind: 'supabase', message: `${where ? where + ': ' : ''}${error.message || 'unknown'}`, detail: { code: error.code, details: error.details, hint: error.hint } })
}

let installed = false
export function installGlobalErrorLogging() {
  if (installed || typeof window === 'undefined') return
  installed = true

  window.addEventListener('error', (e) => {
    if (e && e.message) logClientError({ kind: 'window.error', message: e.message, stack: e.error?.stack || '', detail: { filename: e.filename, lineno: e.lineno, colno: e.colno } })
  })
  window.addEventListener('unhandledrejection', (e) => {
    const r = e?.reason
    logClientError({ kind: 'unhandledrejection', message: r?.message || String(r || 'unknown'), stack: r?.stack || '' })
  })

  // Patch fetch: tangkap respons gagal ke REST/RPC Supabase (4xx/5xx).
  // Ini menangkap penolakan RLS/izin per peran tanpa menyentuh call-site.
  if (typeof window.fetch === 'function') {
    const orig = window.fetch.bind(window)
    window.fetch = async (...args) => {
      const res = await orig(...args)
      try {
        const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '')
        const method = (args[1]?.method || (typeof args[0] === 'object' ? args[0]?.method : '') || 'GET').toUpperCase()
        // Jangan pernah mencatat kegagalan endpoint error_log itu sendiri (anti-rekursi),
        // dan abaikan 406 (PostgREST maybeSingle/single tanpa baris) yang bukan bug.
        if (res && !res.ok && res.status !== 406 && /\/rest\/v1\/|\/rpc\//.test(url) && !url.includes('error_log')) {
          let body = ''
          try { body = await res.clone().text() } catch { /* ignore */ }
          const path = url.split('?')[0].replace(/^.*\/rest\/v1\//, '')
          logClientError({ kind: `http.${res.status}`, message: `${method} ${path} → ${res.status}`, detail: { body: body.slice(0, 1000) } })
        }
      } catch { /* ignore */ }
      return res
    }
  }
}
