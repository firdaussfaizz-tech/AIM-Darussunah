import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wallet, Plus, Settings2, Printer } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, Card, Button, Table, Tr, Td, Badge, EmptyState, FullPageSpinner, Modal, Select, Input } from '../../components/ui'
import { STATUS_BADGE_COLOR, formatRupiah, BULAN } from '../../lib/format'

const PAYROLL_SETTINGS_FIELDS = [
  ['honor_mengajar_gol3', 'Honor Jam Mengajar — Golongan III (Rp/JP)'],
  ['honor_mengajar_gol4', 'Honor Jam Mengajar — Golongan IV (Rp/JP)'],
  ['honor_lembur_per_jam', 'Honor Lembur (Rp/jam)'],
  ['lembur_maks_jam_per_hari', 'Maks. Jam Lembur per Hari (jam)'],
  ['lembur_maks_jam_per_minggu', 'Maks. Jam Lembur per Minggu (jam)'],
  ['transport_makan_nominal', 'Tunjangan Transport & Makan (Rp/bulan)'],
]

function usePayrollSettings() {
  const [settings, setSettings] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const load = useCallback(async () => {
    const { data } = await supabase.from('payroll_settings').select('*').maybeSingle()
    setSettings(data || null)
    setLoaded(true)
  }, [])
  useEffect(() => { load() }, [load])
  return { settings, loaded, reload: load }
}

export default function PayrollList() {
  const { hasFullAccess, employee, loading: authLoading } = useAuth()
  if (authLoading) return <FullPageSpinner />
  return (
    <div>
      <PageHeader title={hasFullAccess ? 'Penggajian' : 'Slip Gaji Saya'} description={hasFullAccess ? 'Kelola periode penggajian bulanan seluruh pegawai.' : 'Riwayat slip gaji Anda.'} />
      {hasFullAccess ? <ManagerPayroll /> : <SelfPayroll employeeId={employee?.id} employee={employee} />}
    </div>
  )
}

function ManagerPayroll() {
  const navigate = useNavigate()
  const { settings, loaded: settingsLoaded, reload: reloadSettings } = usePayrollSettings()
  const [runs, setRuns] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [form, setForm] = useState({ periode_bulan: new Date().getMonth() + 1, periode_tahun: new Date().getFullYear() })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('payroll_runs').select('*, payroll_details(id)').order('periode_tahun', { ascending: false }).order('periode_bulan', { ascending: false })
    setRuns(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreate = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('payroll_runs').insert({ periode_bulan: Number(form.periode_bulan), periode_tahun: Number(form.periode_tahun) })
    setSaving(false)
    if (err) { setError(err.message.includes('duplicate') ? 'Periode ini sudah dibuat sebelumnya.' : err.message); return }
    setModalOpen(false)
    load()
  }

  return (
    <div>
      {settingsLoaded && !settings && (
        <Card className="mb-4 border-[var(--color-gold)] bg-[var(--color-gold-soft)]">
          <p className="text-sm font-medium text-[var(--color-gold)]">Tarif penggajian (honor mengajar/lembur, transport &amp; makan) belum diatur. Klik "Pengaturan" untuk mengisinya sebelum memproses periode baru.</p>
        </Card>
      )}
      <div className="mb-4 flex justify-end gap-2">
        <Button variant="outline" onClick={() => setSettingsOpen(true)}><Settings2 className="h-4 w-4" /> Pengaturan</Button>
        <Button onClick={() => setModalOpen(true)}><Plus className="h-4 w-4" /> Buat Periode Baru</Button>
      </div>
      <Card padded={false}>
        <div className="p-5">
          {loading ? (
            <FullPageSpinner />
          ) : runs.length === 0 ? (
            <EmptyState icon={Wallet} title="Belum ada periode penggajian" description="Buat periode penggajian bulanan pertama Anda." />
          ) : (
            <Table columns={['Periode', 'Jumlah Pegawai Diproses', 'Status', '']}>
              {runs.map((r) => (
                <Tr key={r.id} onClick={() => navigate(`/penggajian/${r.id}`)}>
                  <Td className="font-medium text-[var(--color-ink)]">{BULAN[r.periode_bulan - 1]} {r.periode_tahun}</Td>
                  <Td>{r.payroll_details?.length || 0} pegawai</Td>
                  <Td><Badge color={STATUS_BADGE_COLOR[r.status]}>{r.status}</Badge></Td>
                  <Td className="text-right text-sm font-medium text-[var(--color-navy)]">Kelola →</Td>
                </Tr>
              ))}
            </Table>
          )}
        </div>
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Buat Periode Penggajian">
        <form onSubmit={handleCreate} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <Select label="Bulan" value={form.periode_bulan} onChange={(e) => setForm((s) => ({ ...s, periode_bulan: e.target.value }))}>
              {BULAN.map((b, i) => <option key={b} value={i + 1}>{b}</option>)}
            </Select>
            <Input label="Tahun" type="number" value={form.periode_tahun} onChange={(e) => setForm((s) => ({ ...s, periode_tahun: e.target.value }))} />
          </div>
          {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Membuat…' : 'Buat'}</Button>
          </div>
        </form>
      </Modal>

      <PayrollSettingsModal
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onSaved={() => { setSettingsOpen(false); reloadSettings() }}
      />
    </div>
  )
}

function PayrollSettingsModal({ open, settings, onClose, onSaved }) {
  const [form, setForm] = useState(settings || {})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { if (open) { setForm(settings || {}); setError('') } }, [open, settings])

  const handleSave = async () => {
    setSaving(true)
    setError('')
    const payload = Object.fromEntries(PAYROLL_SETTINGS_FIELDS.map(([key]) => [key, Number(form[key]) || 0]))
    // Baris payroll_settings mungkin belum pernah dibuat — update by id kalau
    // sudah ada, kalau belum langsung insert baris baru, supaya penyimpanan
    // tidak pernah "berhasil" secara diam-diam tanpa benar-benar tersimpan.
    const { error: err } = settings?.id
      ? await supabase.from('payroll_settings').update(payload).eq('id', settings.id)
      : await supabase.from('payroll_settings').insert(payload)
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title="Pengaturan Penggajian" width="max-w-xl">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          {PAYROLL_SETTINGS_FIELDS.map(([key, label]) => (
            <Input
              key={key} label={label} type="number" min="0" step="1"
              value={form[key] ?? ''}
              onChange={(e) => setForm((s) => ({ ...s, [key]: e.target.value }))}
            />
          ))}
        </div>
        <p className="text-xs text-[var(--color-ink-soft)]">
          Tarif ini dipakai otomatis saat "Proses Pegawai Aktif" dan "Hitung Ulang" di setiap periode penggajian. Perubahan di sini TIDAK mengubah slip yang sudah diproses sebelumnya —
          gunakan tombol Hitung Ulang per pegawai bila perlu menerapkan tarif baru ke slip yang sudah ada.
        </p>
        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="button" onClick={handleSave} disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button>
        </div>
      </div>
    </Modal>
  )
}

function SelfPayroll({ employeeId, employee }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [detailModal, setDetailModal] = useState(null)

  useEffect(() => {
    if (!employeeId) { setLoading(false); return }
    supabase
      .from('payroll_details')
      .select('*, payroll_runs(periode_bulan, periode_tahun, status)')
      .eq('employee_id', employeeId)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setRows(data || []); setLoading(false) })
  }, [employeeId])

  if (!employeeId) return <EmptyState icon={Wallet} title="Data gaji tidak tersedia" description="Akun Anda belum ditautkan ke data kepegawaian." />
  if (loading) return <FullPageSpinner />

  return (
    <div>
      <Card padded={false}>
        <div className="p-5">
          {rows.length === 0 ? (
            <EmptyState icon={Wallet} title="Belum ada slip gaji" description="Slip gaji akan muncul setelah periode penggajian diproses HR." />
          ) : (
            <Table columns={['Periode', 'Gaji Bersih', 'Status', '']}>
              {rows.map((r) => (
                <Tr key={r.id}>
                  <Td className="font-medium">{r.payroll_runs ? `${BULAN[r.payroll_runs.periode_bulan - 1]} ${r.payroll_runs.periode_tahun}` : '—'}</Td>
                  <Td>{formatRupiah(r.gaji_bersih)}</Td>
                  <Td>{r.payroll_runs ? <Badge color={STATUS_BADGE_COLOR[r.payroll_runs.status]}>{r.payroll_runs.status}</Badge> : '—'}</Td>
                  <Td className="text-right">
                    <button onClick={() => setDetailModal(r)} className="text-sm font-medium text-[var(--color-navy)] hover:underline">Lihat Rincian</button>
                  </Td>
                </Tr>
              ))}
            </Table>
          )}
        </div>
      </Card>

      <Modal open={!!detailModal} onClose={() => setDetailModal(null)} title="Rincian Slip Gaji">
        {detailModal && (
          <div className="flex flex-col gap-4">
            <SlipDetailBody row={detailModal} />
            <div className="flex justify-end border-t border-[var(--color-border)] pt-3">
              <Button type="button" variant="outline" onClick={() => printSlip(detailModal, employee)}>
                <Printer className="h-4 w-4" /> Cetak / PDF
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

// Buka tab baru berisi slip gaji siap cetak, lalu panggil dialog cetak
// browser (pilih "Simpan sebagai PDF" pada dialog tersebut untuk mengunduh
// PDF). Tidak menambah dependensi baru — memakai window.print() bawaan.
function printSlip(row, employee) {
  const d = row.detail
  const periode = row.payroll_runs ? `${BULAN[row.payroll_runs.periode_bulan - 1]} ${row.payroll_runs.periode_tahun}` : '—'
  const nama = employee?.nama || '—'
  const unit = employee?.schools ? `${employee.schools.jenjang} — ${employee.schools.nama}` : '—'

  const rowsHtml = (label, value, bold) =>
    `<div style="display:flex;justify-content:space-between;gap:16px;padding:3px 0;${bold ? 'font-weight:600;border-top:1px solid #ddd;margin-top:4px;padding-top:6px;' : ''}"><span>${label}</span><span>${value}</span></div>`

  let body
  if (!d) {
    body = [
      rowsHtml('Gaji Pokok', formatRupiah(row.gaji_pokok)),
      rowsHtml('Total Tunjangan', `+${formatRupiah(row.total_tunjangan)}`),
      rowsHtml('Total Potongan', `-${formatRupiah(row.total_potongan)}`),
      rowsHtml('Gaji Bersih', formatRupiah(row.gaji_bersih), true),
    ].join('')
  } else {
    const fungsionalRows = (d.rincianFungsional || []).length
      ? d.rincianFungsional.map((t) => rowsHtml(`Tunjangan Fungsional — ${t.nama}${t.dibayarkan === false ? ' (tidak dibayar)' : ''}`, formatRupiah(t.nominal))).join('')
      : (d.tunjanganFungsional > 0 ? rowsHtml('Tunjangan Fungsional', formatRupiah(d.tunjanganFungsional)) : '')
    body = `
      <p style="font-weight:600;margin:14px 0 4px;">P1 — Komponen Tetap</p>
      ${rowsHtml(`Gaji Pokok (Gol. ${d.golongan || '—'} / Ruang ${d.ruang || '—'})`, formatRupiah(d.gajiPokok))}
      ${d.tunjanganStruktural > 0 ? rowsHtml('Tunjangan Jabatan Struktural', formatRupiah(d.tunjanganStruktural)) : ''}
      ${fungsionalRows}
      ${rowsHtml('Tunjangan Transportasi & Makan', formatRupiah(d.transportMakan))}
      ${rowsHtml('Total P1', formatRupiah(d.totalP1), true)}

      <p style="font-weight:600;margin:14px 0 4px;">P2 — Remunerasi & Honor</p>
      ${rowsHtml(`Tunjangan Remunerasi${d.indeksKinerja != null && d.ihFinal != null ? ` (IK ${Number(d.indeksKinerja).toFixed(2)} × IH ${Number(d.ihFinal).toFixed(2)})` : ''}`, formatRupiah(d.tunjanganRemunerasi))}
      ${d.honorMengajar > 0 ? rowsHtml(`Honor Jam Mengajar (${d.jpTambahan} JP)`, formatRupiah(d.honorMengajar)) : ''}
      ${d.honorLembur > 0 ? rowsHtml(`Honor Lembur (${d.jamLembur} jam)`, formatRupiah(d.honorLembur)) : ''}
      ${rowsHtml('Total P2', formatRupiah(d.totalP2), true)}

      <p style="font-weight:600;margin:14px 0 4px;">Potongan</p>
      ${d.potonganBpjs > 0 ? rowsHtml('Potongan BPJS', `-${formatRupiah(d.potonganBpjs)}`) : ''}
      ${d.potonganPinjaman > 0 ? rowsHtml('Potongan Pinjaman/Cicilan', `-${formatRupiah(d.potonganPinjaman)}`) : ''}
      ${d.potonganLainnya > 0 ? rowsHtml('Potongan Lainnya', `-${formatRupiah(d.potonganLainnya)}`) : ''}
      ${rowsHtml('Total Potongan', `-${formatRupiah(d.totalPotongan)}`, true)}

      <div style="margin-top:16px;">${rowsHtml('Gaji Bersih', formatRupiah(row.gaji_bersih), true)}</div>
    `
  }

  const html = `<!DOCTYPE html>
<html lang="id"><head><meta charset="utf-8"><title>Slip Gaji — ${nama} — ${periode}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; font-size: 13px; color: #1a1a1a; max-width: 640px; margin: 24px auto; padding: 0 16px; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  .meta { color: #555; margin-bottom: 18px; font-size: 12.5px; }
  .meta div { margin-bottom: 2px; }
  @media print { body { margin: 0; padding: 16px; } }
</style></head>
<body>
  <h1>Slip Gaji</h1>
  <div class="meta">
    <div><strong>${nama}</strong> — ${unit}</div>
    <div>Periode: ${periode}</div>
  </div>
  ${body}
</body></html>`

  const w = window.open('', '_blank')
  if (!w) { alert('Popup diblokir browser. Izinkan popup untuk mencetak slip gaji.'); return }
  w.document.open()
  w.document.write(html)
  w.document.close()
  w.onload = () => { w.focus(); w.print() }
}

function SlipDetailBody({ row }) {
  const d = row.detail

  // Slip lama (sebelum modul Komponen Gaji) belum punya kolom `detail` —
  // tampilkan ringkasan lama agar tidak error.
  if (!d) {
    return (
      <div className="flex flex-col gap-2 text-sm">
        <Row label="Gaji Pokok" value={formatRupiah(row.gaji_pokok)} />
        <Row label="Total Tunjangan" value={`+${formatRupiah(row.total_tunjangan)}`} />
        <Row label="Total Potongan" value={`-${formatRupiah(row.total_potongan)}`} />
        <div className="my-1 border-t border-[var(--color-border)]" />
        <Row label="Gaji Bersih" value={formatRupiah(row.gaji_bersih)} bold />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div>
        <p className="mb-1.5 text-[13px] font-semibold text-[var(--color-ink)]">P1 — Komponen Tetap</p>
        <div className="flex flex-col gap-1.5">
          <Row label={`Gaji Pokok (Gol. ${d.golongan || '—'} / Ruang ${d.ruang || '—'})`} value={formatRupiah(d.gajiPokok)} />
          {d.tunjanganStruktural > 0 && <Row label="Tunjangan Jabatan Struktural" value={formatRupiah(d.tunjanganStruktural)} />}
          {(d.rincianFungsional || []).map((t) => (
            <Row
              key={t.nama}
              label={`Tunjangan Fungsional — ${t.nama}${t.dibayarkan === false ? ' (tidak dibayar)' : ''}`}
              value={formatRupiah(t.nominal)}
            />
          ))}
          {!d.rincianFungsional?.length && d.tunjanganFungsional > 0 && <Row label="Tunjangan Fungsional" value={formatRupiah(d.tunjanganFungsional)} />}
          <Row label="Tunjangan Transportasi & Makan" value={formatRupiah(d.transportMakan)} />
          <Row label="Total P1" value={formatRupiah(d.totalP1)} bold />
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-[13px] font-semibold text-[var(--color-ink)]">P2 — Remunerasi & Honor</p>
        <div className="flex flex-col gap-1.5">
          <Row
            label={`Tunjangan Remunerasi${d.indeksKinerja != null && d.ihFinal != null ? ` (IK ${Number(d.indeksKinerja).toFixed(2)} × IH ${Number(d.ihFinal).toFixed(2)})` : ''}`}
            value={formatRupiah(d.tunjanganRemunerasi)}
          />
          {d.honorMengajar > 0 && <Row label={`Honor Jam Mengajar (${d.jpTambahan} JP)`} value={formatRupiah(d.honorMengajar)} />}
          {d.honorLembur > 0 && <Row label={`Honor Lembur (${d.jamLembur} jam)`} value={formatRupiah(d.honorLembur)} />}
          <Row label="Total P2" value={formatRupiah(d.totalP2)} bold />
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-[13px] font-semibold text-[var(--color-ink)]">Potongan</p>
        <div className="flex flex-col gap-1.5">
          {d.potonganBpjs > 0 && <Row label="Potongan BPJS" value={`-${formatRupiah(d.potonganBpjs)}`} />}
          {d.potonganPinjaman > 0 && <Row label="Potongan Pinjaman/Cicilan" value={`-${formatRupiah(d.potonganPinjaman)}`} />}
          {d.potonganLainnya > 0 && <Row label="Potongan Lainnya" value={`-${formatRupiah(d.potonganLainnya)}`} />}
          {d.totalPotongan === 0 && <Row label="Tidak ada potongan" value={formatRupiah(0)} />}
          <Row label="Total Potongan" value={`-${formatRupiah(d.totalPotongan)}`} bold />
        </div>
      </div>

      <div className="border-t border-[var(--color-border)] pt-3">
        <Row label="Gaji Bersih" value={formatRupiah(row.gaji_bersih)} bold />
      </div>

      {!d.lengkap && (
        <p className="text-xs text-[var(--color-gold)]">Sebagian data (Golongan/Indeks Kinerja) belum lengkap saat slip ini diproses.</p>
      )}
    </div>
  )
}

function Row({ label, value, bold }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-[var(--color-ink-soft)]">{label}</span>
      <span className={`shrink-0 ${bold ? 'font-semibold text-[var(--color-ink)]' : ''}`}>{value}</span>
    </div>
  )
}
