// =====================================================================
// Edge Function: spp-create-payment
// Membuat transaksi pembayaran SPP (Virtual Account / QRIS) via Midtrans
// Core API, lalu menyimpan info VA/QRIS ke public.spp_tagihan.
//
// Dipanggil dari aplikasi (Admin/Bendahara) lewat:
//   supabase.functions.invoke('spp-create-payment', { body: { tagihan_id, method, bank } })
//   - method: 'qris' | 'va'
//   - bank  : (untuk method 'va') 'bca' | 'bni' | 'bri' | 'permata' | 'mandiri'
//
// SECRET yang harus diset (supabase secrets set ...):
//   MIDTRANS_SERVER_KEY        = Server Key dari dashboard Midtrans
//   MIDTRANS_IS_PRODUCTION     = 'true' untuk produksi, selain itu sandbox
// (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY otomatis ada.)
// =====================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
    const SERVER_KEY = Deno.env.get('MIDTRANS_SERVER_KEY')
    const isProd = (Deno.env.get('MIDTRANS_IS_PRODUCTION') || 'false') === 'true'
    if (!SERVER_KEY) return json({ error: 'MIDTRANS_SERVER_KEY belum diset.' }, 500)

    // 1. Verifikasi pengguna login (dipanggil dari UI Admin/Bendahara).
    const authHeader = req.headers.get('Authorization') || ''
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } })
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) return json({ error: 'Tidak terautentikasi.' }, 401)

    const { tagihan_id, method, bank } = await req.json()
    if (!tagihan_id) return json({ error: 'tagihan_id wajib diisi.' }, 400)

    // 2. Ambil tagihan (service role; otorisasi peran diverifikasi di UI + RLS app).
    const admin = createClient(SUPABASE_URL, SERVICE_KEY)
    const { data: tagihan, error: tErr } = await admin
      .from('spp_tagihan')
      .select('id, nominal_tagihan, status, bulan, tahun, siswa:siswa_id(nama_lengkap)')
      .eq('id', tagihan_id).single()
    if (tErr || !tagihan) return json({ error: 'Tagihan tidak ditemukan.' }, 404)
    if (tagihan.status === 'lunas') return json({ error: 'Tagihan sudah lunas.' }, 400)

    const gross = Math.round(Number(tagihan.nominal_tagihan))
    if (!gross || gross <= 0) return json({ error: 'Nominal tagihan tidak valid.' }, 400)

    const siswaNama = (tagihan.siswa?.nama_lengkap || 'Siswa').slice(0, 50)
    const orderId = `SPP-${String(tagihan_id).slice(0, 8)}-${Date.now()}`

    // 3. Susun payload charge Midtrans Core API.
    const charge: Record<string, unknown> = {
      transaction_details: { order_id: orderId, gross_amount: gross },
      item_details: [{ id: 'spp', price: gross, quantity: 1, name: `SPP ${siswaNama}`.slice(0, 50) }],
      customer_details: { first_name: siswaNama },
    }
    if (method === 'va') {
      const b = String(bank || 'bca').toLowerCase()
      if (b === 'mandiri') { charge.payment_type = 'echannel'; charge.echannel = { bill_info1: 'Pembayaran SPP', bill_info2: siswaNama } }
      else if (b === 'permata') { charge.payment_type = 'permata' }
      else { charge.payment_type = 'bank_transfer'; charge.bank_transfer = { bank: b } }
    } else {
      charge.payment_type = 'qris'
      charge.qris = { acquirer: 'gopay' }
    }

    // 4. Panggil Midtrans.
    const base = isProd ? 'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com'
    const resp = await fetch(`${base}/v2/charge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Basic ${btoa(`${SERVER_KEY}:`)}` },
      body: JSON.stringify(charge),
    })
    const mt = await resp.json()
    const code = Number(mt.status_code || resp.status)
    if (!resp.ok || (code >= 400)) return json({ error: `Midtrans: ${mt.status_message || resp.statusText}` }, 400)

    // 5. Ekstrak VA / QRIS.
    let va_bank: string | null = null, va_number: string | null = null, qris_url: string | null = null
    if (Array.isArray(mt.va_numbers) && mt.va_numbers.length) { va_bank = mt.va_numbers[0].bank; va_number = mt.va_numbers[0].va_number }
    else if (mt.permata_va_number) { va_bank = 'permata'; va_number = mt.permata_va_number }
    else if (mt.biller_code && mt.bill_key) { va_bank = 'mandiri'; va_number = `${mt.biller_code} / ${mt.bill_key}` }
    if (Array.isArray(mt.actions)) { const qr = mt.actions.find((a: { name: string }) => a.name === 'generate-qr-code'); if (qr) qris_url = qr.url }

    // Normalisasi expiry Midtrans ("YYYY-MM-DD HH:mm:ss +0700") -> ISO.
    let expIso: string | null = null
    if (mt.expiry_time) {
      const d = new Date(String(mt.expiry_time).replace(' ', 'T').replace(/\s*([+-]\d{2})(\d{2})$/, '$1:$2'))
      if (!isNaN(d.getTime())) expIso = d.toISOString()
    }

    // 6. Simpan ke tagihan + log.
    await admin.from('spp_tagihan').update({
      gateway_order_id: orderId,
      gateway_status: mt.transaction_status || 'pending',
      gateway_payment_type: mt.payment_type || charge.payment_type,
      gateway_va_bank: va_bank,
      gateway_va_number: va_number,
      gateway_qris_url: qris_url,
      gateway_expiry: expIso,
      gateway_updated_at: new Date().toISOString(),
    }).eq('id', tagihan_id)

    await admin.from('spp_gateway_events').insert({
      order_id: orderId, transaction_id: mt.transaction_id || null, transaction_status: mt.transaction_status || null,
      payment_type: mt.payment_type || null, gross_amount: gross, signature_valid: null, raw: mt,
    })

    return json({ ok: true, order_id: orderId, payment_type: charge.payment_type, va_bank, va_number, qris_url, expiry: expIso })
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500)
  }
})
