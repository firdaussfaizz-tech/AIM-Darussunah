import { useEffect, useState, useMemo, useCallback } from 'react'
import { AlertTriangle, Pencil } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { SectionCard, Card, Table, Tr, Td, Button, Badge, Modal, Input, FullPageSpinner } from './ui'
import { formatRupiah } from '../lib/format'
import { hitungIH } from '../lib/remunerasi'
import { hitungKomponenGaji } from '../lib/payroll'

export default function SalarySection({ employee, canManage }) {
  const [loading, setLoading] = useState(true)
  const [salaryScale, setSalaryScale] = useState([])
  const [settings, setSettings] = useState(null)
  const [attendanceRows, setAttendanceRows] = useState([])
  const [performanceIndex, setPerformanceIndex] = useState(null)
  const [holidayDates, setHolidayDates] = useState([])
  const [tugasTambahanList, setTugasTambahanList] = useState([])
  const [potonganBpjs, setPotonganBpjs] = useState(0)
  const [bpjsModalOpen, setBpjsModalOpen] = useState(false)
  const [bpjsInput, setBpjsInput] = useState('0')
  const [saving, setSaving] = useState(false)

  const now = new Date()
  const tahun = now.getFullYear()
  const bulan = now.getMonth() + 1

  const load = useCallback(async () => {
    setLoading(true)
    const start = `${tahun}-${String(bulan).padStart(2, '0')}-01`
    const endDate = new Date(tahun, bulan, 1).toISOString().slice(0, 10)
    const [{ data: scale }, { data: settingsRow }, { data: att }, { data: perf }, { data: salaryRow }, { data: tugas }, { data: holidays }] = await Promise.all([
      supabase.from('salary_scale').select('*'),
      supabase.from('payroll_settings').select('*').maybeSingle(),
      supabase
        .from('attendance')
        .select('*, leave_requests(dokumen_terlampir, durasi_jam, leave_types(kode, nama, nilai_hari_hadir, hitung_hari_kerja_wajib, batas_kejadian_per_bulan, pengurangan_ih_setelah_batas))')
        .eq('employee_id', employee.id)
        .gte('tanggal', start)
        .lt('tanggal', endDate),
      supabase
        .from('performance_index')
        .select('*')
        .eq('employee_id', employee.id)
        .lte('periode_mulai', endDate)
        .gte('periode_selesai', start)
        .order('periode_mulai', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from('employee_salary').select('potongan_bpjs').eq('employee_id', employee.id).order('berlaku_sejak', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('employee_tugas_tambahan').select('tugas_tambahan(nama, tunjangan_nominal)').eq('employee_id', employee.id),
      supabase
        .from('school_holidays')
        .select('tanggal')
        .gte('tanggal', start).lt('tanggal', endDate)
        .or(`school_id.is.null${employee.school_id ? `,school_id.eq.${employee.school_id}` : ''}`),
    ])
    setSalaryScale(scale || [])
    setSettings(settingsRow || null)
    setAttendanceRows(att || [])
    setPerformanceIndex(perf || null)
    setPotonganBpjs(salaryRow?.potongan_bpjs || 0)
    setTugasTambahanList((tugas || []).map((t) => t.tugas_tambahan).filter(Boolean))
    setHolidayDates((holidays || []).map((h) => h.tanggal))
    setLoading(false)
  }, [employee.id, employee.school_id, tahun, bulan])

  useEffect(() => { load() }, [load])

  const ih = useMemo(() => {
    if (loading) return null
    return hitungIH({ attendanceRows, tahun, bulan, holidayDates })
  }, [attendanceRows, tahun, bulan, holidayDates, loading])

  const komponen = useMemo(() => {
    if (!settings || !ih) return null
    return hitungKomponenGaji({
      employee, position: employee.positions, tugasTambahanList, salaryScaleRows: salaryScale, settings,
      ihResult: ih, performanceIndex, potonganBpjs,
    })
  }, [employee, salaryScale, settings, ih, performanceIndex, potonganBpjs, tugasTambahanList])

  const saveBpjs = async () => {
    setSaving(true)
    await supabase.from('employee_salary').insert({
      employee_id: employee.id,
      potongan_bpjs: Number(bpjsInput) || 0,
      gaji_pokok: 0, tunjangan_jabatan: 0, tunjangan_transport: 0, tunjangan_makan: 0, tunjangan_lainnya: 0, potongan_lainnya: 0,
      berlaku_sejak: new Date().toISOString().slice(0, 10),
    })
    setSaving(false)
    setBpjsModalOpen(false)
    load()
  }

  if (loading || !komponen) return <FullPageSpinner />

  const rows = [
    ['Gaji Pokok', komponen.gajiPokok, `Golongan ${komponen.golongan || '—'} / Ruang ${komponen.ruang || '—'}`],
    ['Tunjangan Jabatan Struktural', komponen.tunjanganStruktural, komponen.tunjanganStruktural ? employee.positions?.nama : 'Tidak menjabat struktural'],
  ]

  return (
    <div className="flex flex-col gap-5">
      {!komponen.lengkap && (
        <Card className="border-[var(--color-gold)] bg-[var(--color-gold-soft)]">
          <p className="flex items-center gap-2 text-sm font-medium text-[var(--color-gold)]">
            <AlertTriangle className="h-4 w-4" /> Sebagian data belum lengkap (Golongan / Indeks Kinerja periode ini), Tunjangan Remunerasi ditampilkan sebagai Rp0 sampai dilengkapi.
          </p>
        </Card>
      )}

      <SectionCard title="P1 — Komponen Tetap Bulanan" description="Otomatis dari Golongan/Ruang & Jabatan (Pasal 3-6 SK 01.012)">
        <Table columns={['Komponen', 'Nominal', 'Keterangan']}>
          {rows.map(([label, value, ket]) => (
            <Tr key={label}>
              <Td className="font-medium text-[var(--color-ink)]">{label}</Td>
              <Td>{formatRupiah(value)}</Td>
              <Td className="text-[var(--color-ink-soft)]">{ket}</Td>
            </Tr>
          ))}
          {komponen.rincianFungsional.length === 0 ? (
            <Tr>
              <Td className="font-medium text-[var(--color-ink)]">Tunjangan Fungsional</Td>
              <Td>{formatRupiah(0)}</Td>
              <Td className="text-[var(--color-ink-soft)]">Tidak mengemban tugas tambahan</Td>
            </Tr>
          ) : (
            komponen.rincianFungsional.map((t) => (
              <Tr key={t.nama}>
                <Td className="font-medium text-[var(--color-ink)]">Tunjangan Fungsional — {t.nama}</Td>
                <Td className={t.dibayarkan ? '' : 'text-[var(--color-ink-soft)] line-through'}>{formatRupiah(t.nominal)}</Td>
                <Td>
                  {t.dibayarkan ? (
                    <Badge color="success">Dibayarkan</Badge>
                  ) : (
                    <Badge color="neutral">Tidak dibayar — bukan yang tertinggi</Badge>
                  )}
                </Td>
              </Tr>
            ))
          )}
          <Tr>
            <Td className="font-medium text-[var(--color-ink)]">Tunjangan Transportasi &amp; Makan</Td>
            <Td>{formatRupiah(komponen.transportMakan)}</Td>
            <Td className="text-[var(--color-ink-soft)]">Tarif tetap seluruh yayasan — diatur di menu Penggajian &gt; Pengaturan</Td>
          </Tr>
          <Tr>
            <Td className="font-semibold text-[var(--color-ink)]">Total P1</Td>
            <Td className="font-semibold">{formatRupiah(komponen.totalP1)}</Td>
            <Td />
          </Tr>
        </Table>
        {komponen.rincianFungsional.length > 1 && (
          <p className="mt-3 text-xs text-[var(--color-ink-soft)]">
            Mengemban {komponen.rincianFungsional.length} tugas tambahan sekaligus — hanya Tunjangan Fungsional yang nominalnya paling tinggi yang dibayarkan.
          </p>
        )}
      </SectionCard>

      <SectionCard title="P2 — Remunerasi Bulan Ini (Estimasi)" description="Otomatis dari Nilai Jabatan × Indeks Kinerja × Indeks Kehadiran bulan berjalan (Pasal 7)">
        <Table columns={['Komponen', 'Nominal', 'Keterangan']}>
          <Tr>
            <Td className="font-medium text-[var(--color-ink)]">Tunjangan Remunerasi</Td>
            <Td>{formatRupiah(komponen.tunjanganRemunerasi)}</Td>
            <Td className="text-[var(--color-ink-soft)]">
              {performanceIndex ? `IK ${performanceIndex.indeks_kinerja.toFixed(2)} × IH ${ih.ihFinal.toFixed(2)}` : 'Indeks Kinerja periode ini belum diatur'}
            </Td>
          </Tr>
        </Table>
        <p className="mt-3 text-xs text-[var(--color-ink-soft)]">
          Rincian lengkap Indeks Kehadiran ada di tab "Indeks Kehadiran". Honor Jam Mengajar/Lembur dihitung saat proses Penggajian bulanan, bukan di sini.
        </p>
      </SectionCard>

      <SectionCard
        title="Potongan Tetap"
        description="Diatur manual, berlaku sampai diubah kembali"
        actions={canManage && (
          <Button size="sm" variant="outline" onClick={() => { setBpjsInput(String(potonganBpjs)); setBpjsModalOpen(true) }}>
            <Pencil className="h-4 w-4" /> Ubah
          </Button>
        )}
      >
        <Table columns={['Komponen', 'Nominal']}>
          <Tr>
            <Td className="font-medium text-[var(--color-ink)]">Potongan BPJS</Td>
            <Td className="text-[var(--color-danger)]">-{formatRupiah(potonganBpjs)}</Td>
          </Tr>
        </Table>
      </SectionCard>

      <Card className="bg-[var(--color-navy-50)]">
        <p className="text-[13px] font-medium text-[var(--color-ink-soft)]">Estimasi Take Home Pay Bulan Ini</p>
        <p className="mt-1 font-[family-name:var(--font-display)] text-[32px] font-semibold text-[var(--color-navy)]">{formatRupiah(komponen.gajiBersih)}</p>
        <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
          P1 {formatRupiah(komponen.totalP1)} + P2 {formatRupiah(komponen.tunjanganRemunerasi)} − Potongan {formatRupiah(komponen.potonganBpjs)}. Belum termasuk Honor Mengajar/Lembur & potongan pinjaman — angka final ada di slip gaji bulanan (menu Penggajian).
        </p>
      </Card>

      <Modal open={bpjsModalOpen} onClose={() => setBpjsModalOpen(false)} title="Ubah Potongan BPJS">
        <div className="flex flex-col gap-4">
          <Input label="Potongan BPJS / bulan" type="number" min="0" value={bpjsInput} onChange={(e) => setBpjsInput(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setBpjsModalOpen(false)}>Batal</Button>
            <Button type="button" onClick={saveBpjs} disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
