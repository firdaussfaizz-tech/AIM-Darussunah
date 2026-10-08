// =====================================================================
// Edge Function: spp-webhook
// Menerima Payment Notification dari Midtrans, memverifikasi signature,
// lalu (bila lunas) MENYISIPKAN baris ke public.spp_pembayaran. Trigger
// yang sudah ada otomatis menghitung ulang status tagihan, memposting ke
// Buku Kas (A19), dan mengirim email "SPP lunas".
//
// URL webhook ini didaftarkan di Midtrans:
//   Dashboard Midtrans > Settings > Configuration > Payment Notification URL
//   => https://<project-ref>.functions.supabase.co/spp-webhook
//
// PENTING: fungsi ini harus bisa dipanggil TANPA JWT (Midtrans tidak kirim
// token Supabase). Deploy dengan: supabase functions deploy spp-webhook --no-verify-jwt
// Keamanan dijamin oleh verifikasi SIGNATURE Midtrans di bawah.
//
// SECRET: MIDTRANS_SERVER_KEY (sama dengan create-payment).
// =====================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

async function sha512Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-512', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const SERVER_KEY = Deno.env.get('MIDTRANS_SERVER_KEY') || ''
  const admin = createClient(SUPABASE_URL, SERVICE_KEY)

  let body: Record<string, string>
  try { body = await req.json() } catch { return new Response('bad json', { status: 400 }) }

  const orderId = body.order_id
  const statusCode = body.status_code
  const grossAmount = body.gross_amount
  const trxStatus = body.transaction_status
  const trxId = body.transaction_id
  const paymentType = body.payment_type
  const fraudStatus = body.fraud_status

  // Verifikasi signature: sha512(order_id + status_code + gross_amount + ServerKey).
  const expected = await sha512Hex(`${orderId}${statusCode}${grossAmount}${SERVER_KEY}`)
  const valid = !!body.signature_key && expected === body.signature_key

  // Selalu catat notifikasi (audit), termasuk yang gagal verifikasi.
  await admin.from('spp_gateway_events').insert({
    order_id: orderId || null, transaction_id: trxId || null, transaction_status: trxStatus || null,
    payment_type: paymentType || null, gross_amount: grossAmount ? Number(grossAmount) : null,
    signature_valid: valid, raw: body,
  })

  if (!valid) return new Response('invalid signature', { status: 403 })

  // Cari tagihan berdasarkan order_id yang kita simpan saat charge.
  const { data: tagihan } = await admin
    .from('spp_tagihan').select('id, status').eq('gateway_order_id', orderId).single()

  if (tagihan) {
    await admin.from('spp_tagihan')
      .update({ gateway_status: trxStatus, gateway_updated_at: new Date().toISOString() })
      .eq('id', tagihan.id)
  }

  const paid = trxStatus === 'settlement' || (trxStatus === 'capture' && fraudStatus === 'accept')
  if (paid && tagihan) {
    const metode = paymentType === 'qris' ? 'QRIS (Midtrans)' : 'Transfer VA (Midtrans)'
    // gateway_ref UNIQUE => notifikasi ganda tidak akan menggandakan pembayaran.
    const { error } = await admin.from('spp_pembayaran').insert({
      tagihan_id: tagihan.id,
      nominal_dibayar: Number(grossAmount),
      tanggal_bayar: new Date().toISOString().slice(0, 10),
      metode,
      catatan: `Order ${orderId}`,
      gateway_ref: trxId,
    })
    if (error && error.code !== '23505' && !String(error.message).toLowerCase().includes('duplicate')) {
      return new Response('db error: ' + error.message, { status: 500 })
    }
  }

  return new Response('OK', { status: 200 })
})
