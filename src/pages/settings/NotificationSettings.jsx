import { useEffect, useState } from 'react'
import { Mail, Send, ShieldAlert, ExternalLink } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, Card, Button, Input, FullPageSpinner, EmptyState } from '../../components/ui'

// Halaman pengaturan notifikasi email (Roadmap B Otomasi #4 — keputusan
// pengguna: "Pakai email dulu saja"). Pengiriman sesungguhnya dilakukan
// langsung dari database trigger (lihat migrasi
// 0015_email_notifications.sql) lewat Resend API — halaman ini hanya
// tempat mengisi API Key & alamat pengirim, karena keduanya tersimpan di
// tabel app_settings yang dibatasi RLS khusus Admin Yayasan/HR.
export default function NotificationSettings() {
  const { hasFullAccess, loading: authLoading } = useAuth()
  const [loading, setLoading] = useState(true)
  const [row, setRow] = useState(null)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [fromEmail, setFromEmail] = useState('')
  const [fromName, setFromName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [testTo, setTestTo] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState('')

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('app_settings').select('*').eq('id', 1).maybeSingle()
    setRow(data || null)
    setFromEmail(data?.notif_from_email || '')
    setFromName(data?.notif_from_name || 'SIMPEG Yayasan')
    setLoading(false)
  }

  useEffect(() => { if (hasFullAccess) load() }, [hasFullAccess])

  if (authLoading) return <FullPageSpinner />
  if (!hasFullAccess) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Akses terbatas"
        description="Halaman Notifikasi Email hanya dapat diakses oleh Admin Yayasan atau HR."
      />
    )
  }
  if (loading) return <FullPageSpinner />

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSaved(false)
    const payload = { id: 1, notif_from_email: fromEmail, notif_from_name: fromName, updated_at: new Date().toISOString() }
    // Hanya kirim API key kalau admin benar-benar mengetik nilai baru —
    // field dibiarkan kosong secara default (tidak menampilkan key yang
    // sudah tersimpan) supaya key lama tidak sengaja tertimpa nilai kosong
    // saat admin cuma mau mengubah alamat pengirim.
    if (apiKeyInput.trim() !== '') payload.resend_api_key = apiKeyInput.trim()
    const { error: err } = await supabase.from('app_settings').upsert(payload, { onConflict: 'id' })
    setSaving(false)
    if (err) { setError(err.message); return }
    setApiKeyInput('')
    setSaved(true)
    load()
  }

  const handleTest = async () => {
    if (!testTo.trim()) return
    setTesting(true)
    setTestResult('')
    const { error: err } = await supabase.rpc('test_send_notification', { p_to: testTo.trim() })
    setTesting(false)
    setTestResult(err ? `Gagal: ${err.message}` : 'Permintaan kirim email uji coba terkirim — cek kotak masuk (dan folder spam) dalam beberapa menit.')
  }

  const sudahDiatur = !!(row?.resend_api_key && row?.notif_from_email)

  return (
    <div>
      <PageHeader
        title="Notifikasi Email"
        description="Kirim email otomatis saat cuti/izin diajukan, disetujui/ditolak, dan saat slip gaji terbit — lewat Resend."
      />

      {!sudahDiatur && (
        <Card className="mb-4 border-[var(--color-gold)] bg-[var(--color-gold-soft)]">
          <p className="text-sm font-medium text-[var(--color-gold)]">Notifikasi email belum aktif — isi API Key Resend dan alamat pengirim di bawah untuk mengaktifkan.</p>
        </Card>
      )}

      <Card className="mb-4">
        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <div>
            <p className="text-[15px] font-semibold text-[var(--color-ink)]">Pengaturan Resend</p>
            <p className="mt-1 flex items-center gap-1 text-xs text-[var(--color-ink-soft)]">
              Buat akun &amp; API Key gratis di{' '}
              <a href="https://resend.com" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-[var(--color-navy)] hover:underline">
                resend.com <ExternalLink className="h-3 w-3" />
              </a>
              , lalu verifikasi domain pengirim Anda di sana sebelum mengisi alamat pengirim di bawah.
            </p>
          </div>

          <Input
            label="Resend API Key"
            type="password"
            placeholder={row?.resend_api_key ? 'Sudah diatur — kosongkan bila tidak ingin mengubah' : 're_xxxxxxxxxxxxxxxxxxxx'}
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            autoComplete="off"
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Nama Pengirim" placeholder="SIMPEG Yayasan" value={fromName} onChange={(e) => setFromName(e.target.value)} />
            <Input label="Email Pengirim" type="email" placeholder="noreply@yayasananda.org" required value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} />
          </div>
          <p className="-mt-2 text-xs text-[var(--color-ink-soft)]">Email pengirim harus dari domain yang sudah diverifikasi di akun Resend Anda, atau Resend akan menolak pengiriman.</p>

          {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
          {saved && <p className="rounded-md bg-[var(--color-success-soft)] px-3 py-2 text-sm text-[var(--color-success)]">Pengaturan tersimpan.</p>}

          <div className="flex justify-end">
            <Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan Pengaturan'}</Button>
          </div>
        </form>
      </Card>

      <Card>
        <p className="text-[15px] font-semibold text-[var(--color-ink)]">Kirim Email Uji Coba</p>
        <p className="mt-1 text-xs text-[var(--color-ink-soft)]">Pastikan pengaturan di atas sudah disimpan terlebih dahulu.</p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <Input containerClassName="flex-1" label="Kirim ke Email" type="email" placeholder="anda@contoh.com" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
          <Button type="button" variant="outline" onClick={handleTest} disabled={testing || !testTo.trim()}>
            <Send className="h-4 w-4" /> {testing ? 'Mengirim…' : 'Kirim Uji Coba'}
          </Button>
        </div>
        {testResult && <p className="mt-3 text-sm text-[var(--color-ink-soft)]">{testResult}</p>}
      </Card>

      <Card className="mt-4 bg-[var(--color-navy-50)]">
        <p className="flex items-center gap-1.5 text-sm font-medium text-[var(--color-ink)]"><Mail className="h-4 w-4" /> Email otomatis dikirim saat:</p>
        <ul className="mt-2 list-inside list-disc text-sm text-[var(--color-ink-soft)]">
          <li>Cuti/izin diajukan — ke Admin Yayasan/HR &amp; Kepala Sekolah/Admin Sekolah unit pegawai</li>
          <li>Cuti/izin disetujui atau ditolak — ke pegawai pengaju</li>
          <li>Slip gaji periode difinalisasi — ke setiap pegawai pada periode tersebut</li>
        </ul>
        <p className="mt-2 text-xs text-[var(--color-ink-soft)]">Pegawai hanya menerima email bila akun login mereka sudah ditautkan ke data kepegawaian dan memiliki alamat email.</p>
      </Card>
    </div>
  )
}
