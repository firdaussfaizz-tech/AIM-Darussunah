// =====================================================================
// fingerspot-sync — Supabase Edge Function (OPSIONAL, otomasi lanjutan)
//
// Roadmap B Integrasi #10: integrasi mesin fingerprint absensi.
// Rekomendasi mesin: Fingerspot Revo W-202BNC (~Rp 2,3 juta, sidik jari
// WiFi/LAN/USB, kapasitas 6.000 user / 12.000 sidik jari / 200.000 log)
// + layanan cloud Fingerspot.io (~Rp 300.000/mesin/tahun, termasuk akses
// API lewat developer.fingerspot.io). Lihat catatan lengkap di chat/
// laporan pengiriman paket ini untuk sumber & alternatif.
//
// CARA KERJA YANG SUDAH BISA DIPAKAI HARI INI (tanpa fungsi ini sama
// sekali): dashboard Fingerspot.io bisa mengekspor log presensi ke
// CSV/Excel — tinggal unggah lewat menu Presensi > "Impor dari
// Fingerprint" (FingerprintImportModal.jsx) yang sudah ada di aplikasi.
// Pemetaan pegawai memakai kolom "PIN Mesin Fingerprint"
// (employees.pin_fingerprint) yang sudah ada di halaman Data Pegawai.
//
// FUNGSI INI adalah level otomasi berikutnya: menarik log presensi dari
// API Fingerspot.io secara terjadwal (lewat pg_cron, lihat contoh SQL di
// bagian bawah file ini) sehingga tidak perlu ekspor/impor CSV manual
// lagi. supabase/functions HANYA di-deploy kalau admin sudah:
//   1. Beli & pasang mesin Fingerspot Revo (atau seri Revo/Vida/Vega
//      lain yang mendukung Fingerspot.io).
//   2. Daftar akun di https://developer.fingerspot.io/, ambil token API
//      & "Cloud ID"/nomor seri mesin dari dashboard mereka.
//   3. Isi kolom "PIN Mesin Fingerprint" tiap pegawai di halaman Data
//      Pegawai — HARUS SAMA PERSIS dengan PIN yang didaftarkan di mesin.
//
// PENTING — response API Fingerspot BELUM diverifikasi terhadap akun
// nyata (tidak ada kredensial API pada saat kode ini dibuat). Bagian
// yang ditandai "TODO SESUAIKAN" di bawah HARUS disesuaikan setelah
// admin login ke developer.fingerspot.io dan melihat contoh response
// asli mereka (tersedia di dashboard developer setelah registrasi).
// Struktur fungsi (ambil log -> cocokkan PIN -> upsert ke `attendance`)
// sudah benar dan tidak perlu diubah, hanya path field JSON-nya saja.
// =====================================================================

// @ts-ignore - Deno global tersedia di runtime Supabase Edge Functions
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
// @ts-ignore
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
// @ts-ignore
const FINGERSPOT_API_URL = Deno.env.get('FINGERSPOT_API_URL') || 'https://developer.fingerspot.io/api'
// @ts-ignore
const FINGERSPOT_TOKEN = Deno.env.get('FINGERSPOT_TOKEN')!
// @ts-ignore
const FINGERSPOT_CLOUD_ID = Deno.env.get('FINGERSPOT_CLOUD_ID')!

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

Deno.serve(async (req: Request) => {
  if (!FINGERSPOT_TOKEN || !FINGERSPOT_CLOUD_ID) {
    return jsonResponse({ error: 'FINGERSPOT_TOKEN / FINGERSPOT_CLOUD_ID belum diatur di Edge Function secrets.' }, 500)
  }

  try {
    // -----------------------------------------------------------------
    // 1. Tarik log scan (attlog) dari Fingerspot.io.
    // TODO SESUAIKAN: endpoint & bentuk request persis mengikuti
    // dokumentasi "Get Attlog" di developer.fingerspot.io (perlu login
    // untuk melihatnya). Contoh umum layanan sejenis: kirim cloud_id +
    // rentang tanggal, terima daftar log { pin, scan_date, scan_time }.
    // -----------------------------------------------------------------
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10) // 24 jam terakhir
    const fpRes = await fetch(`${FINGERSPOT_API_URL}/get_attlog`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${FINGERSPOT_TOKEN}`, // TODO SESUAIKAN skema auth bila berbeda
      },
      body: JSON.stringify({ cloud_id: FINGERSPOT_CLOUD_ID, start_date: since }),
    })

    if (!fpRes.ok) {
      const text = await fpRes.text()
      return jsonResponse({ error: `Fingerspot API error ${fpRes.status}: ${text}` }, 502)
    }

    const fpJson = await fpRes.json()
    // TODO SESUAIKAN: ganti `fpJson.data` sesuai nama field asli respons
    // Fingerspot (mis. bisa jadi `fpJson.attlog` atau `fpJson.result.logs`).
    const logs: Array<{ pin: string; scan_date: string; scan_time: string }> = fpJson.data || []

    if (logs.length === 0) {
      return jsonResponse({ message: 'Tidak ada log presensi baru.', processed: 0 })
    }

    // -----------------------------------------------------------------
    // 2. Kelompokkan per pin+tanggal -> jam masuk (paling awal) & jam
    //    pulang (paling akhir), sama seperti logika FingerprintImportModal.jsx.
    // -----------------------------------------------------------------
    const grouped: Record<string, { pin: string; tanggal: string; jams: string[] }> = {}
    for (const log of logs) {
      const key = `${log.pin}_${log.scan_date}`
      if (!grouped[key]) grouped[key] = { pin: log.pin, tanggal: log.scan_date, jams: [] }
      grouped[key].jams.push(log.scan_time)
    }

    // -----------------------------------------------------------------
    // 3. Cocokkan PIN -> employee_id lewat kolom employees.pin_fingerprint
    //    (kolom yang sama dipakai fitur Impor CSV manual yang sudah ada).
    // -----------------------------------------------------------------
    // @ts-ignore - import dari CDN, standar pola Supabase Edge Functions
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const pins = [...new Set(Object.values(grouped).map((g) => g.pin))]
    const { data: employees, error: empErr } = await supabase
      .from('employees')
      .select('id, pin_fingerprint')
      .in('pin_fingerprint', pins)
    if (empErr) return jsonResponse({ error: `Gagal membaca data pegawai: ${empErr.message}` }, 500)

    const pinToEmployeeId: Record<string, string> = {}
    for (const e of employees || []) pinToEmployeeId[e.pin_fingerprint] = e.id
    const unmatchedPins = pins.filter((p) => !pinToEmployeeId[p])

    // -----------------------------------------------------------------
    // 4. Upsert ke tabel attendance (onConflict employee_id,tanggal),
    //    sama seperti fitur impor CSV manual.
    // -----------------------------------------------------------------
    const upsertRows = Object.values(grouped)
      .filter((g) => pinToEmployeeId[g.pin])
      .map((g) => {
        const sorted = [...g.jams].sort()
        return {
          employee_id: pinToEmployeeId[g.pin],
          tanggal: g.tanggal,
          jam_masuk: sorted[0],
          jam_pulang: sorted.length > 1 ? sorted[sorted.length - 1] : null,
          status: 'hadir',
        }
      })

    let processed = 0
    if (upsertRows.length > 0) {
      const { error: upsertErr } = await supabase.from('attendance').upsert(upsertRows, { onConflict: 'employee_id,tanggal' })
      if (upsertErr) return jsonResponse({ error: `Gagal menyimpan presensi: ${upsertErr.message}` }, 500)
      processed = upsertRows.length
    }

    return jsonResponse({ message: 'Sinkronisasi selesai.', processed, unmatchedPins })
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500)
  }
})

// =====================================================================
// CARA DEPLOY (setelah punya mesin + akun developer.fingerspot.io):
//
//   1. Install Supabase CLI di komputer mana saja (tidak harus komputer
//      yang dipakai sehari-hari) — lihat https://supabase.com/docs/guides/cli
//   2. supabase login
//   3. supabase link --project-ref <project-ref-anda>
//   4. supabase secrets set FINGERSPOT_TOKEN=xxx FINGERSPOT_CLOUD_ID=xxx
//   5. supabase functions deploy fingerspot-sync
//
// (Kalau dashboard Supabase Anda sudah punya editor kode Edge Function
// langsung di browser, itu juga bisa dipakai — tempel isi file ini di
// sana, lalu isi Secrets lewat menu Edge Functions > Settings.)
//
// CARA MENJADWALKAN (setelah fungsi ter-deploy dan Anda punya URL-nya,
// contoh https://xxxx.supabase.co/functions/v1/fingerspot-sync) —
// jalankan SQL berikut SEKALI di SQL Editor Supabase (memakai pg_cron +
// pg_net yang sudah diaktifkan lewat migrasi 0015_email_notifications.sql):
//
//   select cron.schedule(
//     'fingerspot-sync-15min',
//     '*/15 * * * *',
//     $$
//       select net.http_post(
//         url := 'https://xxxx.supabase.co/functions/v1/fingerspot-sync',
//         headers := jsonb_build_object('Authorization', 'Bearer <service-role-key-anda>')
//       );
//     $$
//   );
//
// (Ganti URL & service-role-key sesuai project Anda. pg_cron mungkin
// perlu diaktifkan dulu lewat: create extension if not exists pg_cron;)
// =====================================================================
