import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, PlayCircle, Lock, Pencil } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { PageHeader, Card, Button, Table, Tr, Td, Badge, EmptyState, FullPageSpinner, Modal, Input, Textarea } from '../../components/ui'
import { STATUS_BADGE_COLOR, formatRupiah, BULAN } from '../../lib/format'
import { hitungIH } from '../../lib/remunerasi'
import { hitungKomponenGaji } from '../../lib/payroll'

export default function PayrollRunDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [run, setRun] = useState(null)
  const [details, setDetails] = useState([])
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [editRow, setEditRow] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: r }, { data: d }, { data: s }] = await Promise.all([
      supabase.from('payroll_runs').select('*').eq('id', id).maybeSingle(),
      supabase.from('payroll_details').select('*, employees(nama, golongan, positions(nama, tunjangan_jenis), schools!school_id(nama, jenjang))').eq('payroll_run_id', id).order('created_at'),
      supabase.from('payroll_settings').select('*').maybeSingle(),
    ])
    setRun(r)
    setDetails(d || [])
    setSettings(s || null)
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  const handleGenerate = async () => {
    setProcessing(true)
    const [{ data: employees }, { data: salaryScale }, { data: settingsRow }] = await Promise.all([
      supabase.from('employees').select('id, nama, golongan, tanggal_masuk, positions(tunjangan_jenis, tunjangan_nominal)').eq('status', 'aktif'),
      supabase.from('salary_scale').select('*'),
      supabase.from('payroll_settings').select('*').maybeSingle(),
    ])
    const already = new Set(details.map((d) => d.employee_id))
    const toProcess = (employees || []).filter((e) => !already.has(e.id))

    const start = `${run.periode_tahun}-${String(run.periode_bulan).padStart(2, '0')}-01`
    const endDate = new Date(run.periode_tahun, run.periode_bulan, 1).toISOString().slice(0, 10)

    for (const emp of toProcess) {
      const [{ data: att }, { data: perf }, { data: salaryRow }, { data: tugas }] = await Promise.all([
        supabase
          .from('attendance')
          .select('*, leave_requests(dokumen_terlampir, durasi_jam, leave_types(kode, nama, nilai_hari_hadir, hitung_hari_kerja_wajib, batas_kejadian_per_bulan, pengurangan_ih_setelah_batas))')
          .eq('employee_id', emp.id).gte('tanggal', start).lt('tanggal', endDate),
        supabase.from('performance_index').select('*').eq('employee_id', emp.id)
          .lte('periode_mulai', endDate).gte('periode_selesai', start)
          .order('periode_mulai', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('employee_salary').select('potongan_bpjs').eq('employee_id', emp.id)
          .order('berlaku_sejak', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('employee_tugas_tambahan').select('tugas_tambahan(nama, tunjangan_nominal)').eq('employee_id', emp.id),
      ])
      const ih = hitungIH({ attendanceRows: att || [], tahun: run.periode_tahun, bulan: run.periode_bulan })
      const komponen = hitungKomponenGaji({
        employee: emp, position: emp.positions, tugasTambahanList: (tugas || []).map((t) => t.tugas_tambahan).filter(Boolean),
        salaryScaleRows: salaryScale || [], settings: settingsRow,
        ihResult: ih, performanceIndex: perf, potonganBpjs: salaryRow?.potongan_bpjs || 0,
      })
      await supabase.from('payroll_details').insert({
        payroll_run_id: id,
        employee_id: emp.id,
        gaji_pokok: komponen.gajiPokok,
        total_tunjangan: komponen.totalTunjangan,
        total_potongan: komponen.totalPotongan,
        gaji_bersih: komponen.gajiBersih,
        jp_tambahan: 0, jam_lembur: 0, potongan_pinjaman: 0,
        detail: komponen,
      })
    }
    setProcessing(false)
    load()
  }

  const handleFinalize = async () => {
    if (!confirm('Finalisasi periode ini? Slip gaji akan terlihat oleh pegawai dan tidak disarankan diubah lagi.')) return
    await supabase.from('payroll_runs').update({ status: 'final' }).eq('id', id)
    load()
  }

  if (loading) return <FullPageSpinner />
  if (!run) return <EmptyState title="Periode tidak ditemukan" />

  const totalGaji = details.reduce((sum, d) => sum + Number(d.gaji_bersih), 0)

  return (
    <div>
      <button onClick={() => navigate('/penggajian')} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]">
        <ArrowLeft className="h-4 w-4" /> Kembali ke Daftar Periode
      </button>

      <PageHeader
        title={`Penggajian ${BULAN[run.periode_bulan - 1]} ${run.periode_tahun}`}
        description={`Total ${details.length} pegawai diproses · Total ${formatRupiah(totalGaji)}`}
        actions={
          <div className="flex gap-2">
            {run.status === 'draft' && (
              <>
                <Button variant="outline" onClick={handleGenerate} disabled={processing}>
                  <PlayCircle className="h-4 w-4" /> {processing ? 'Memproses…' : 'Proses Pegawai Aktif'}
                </Button>
                <Button onClick={handleFinalize}><Lock className="h-4 w-4" /> Finalisasi</Button>
              </>
            )}
            <Badge color={STATUS_BADGE_COLOR[run.status]}>{run.status}</Badge>
          </div>
        }
      />

      <Card padded={false}>
        <div className="p-5">
          {details.length === 0 ? (
            <EmptyState
              title="Belum ada slip diproses"
              description="Klik 'Proses Pegawai Aktif' untuk menghasilkan slip gaji otomatis (Gaji Pokok, Tunjangan Jabatan, Remunerasi) dari setiap pegawai aktif."
            />
          ) : (
            <Table columns={['Pegawai', 'Unit', 'P1', 'P2 (Remunerasi+Honor)', 'Potongan', 'Gaji Bersih', '']}>
              {details.map((d) => (
                <Tr key={d.id}>
                  <Td className="font-medium text-[var(--color-ink)]">{d.employees?.nama}</Td>
                  <Td className="text-[var(--color-ink-soft)]">{d.employees?.schools ? `${d.employees.schools.jenjang} — ${d.employees.schools.nama}` : '—'}</Td>
                  <Td>{formatRupiah(d.detail?.totalP1 ?? d.gaji_pokok)}</Td>
                  <Td className="text-[var(--color-success)]">+{formatRupiah((d.detail?.tunjanganRemunerasi || 0) + (d.detail?.honorMengajar || 0) + (d.detail?.honorLembur || 0))}</Td>
                  <Td className="text-[var(--color-danger)]">-{formatRupiah(d.total_potongan)}</Td>
                  <Td className="font-medium">{formatRupiah(d.gaji_bersih)}</Td>
                  <Td>
                    {run.status === 'draft' && (
                      <button onClick={() => setEditRow(d)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Ubah honor/potongan">
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                  </Td>
                </Tr>
              ))}
            </Table>
          )}
        </div>
      </Card>
      <p className="mt-3 text-xs text-[var(--color-ink-soft)]">
        Gaji Pokok, Tunjangan Jabatan, dan Remunerasi dihitung otomatis. Klik ikon pensil untuk menambahkan JP mengajar tambahan, jam lembur, atau potongan pinjaman/cicilan per pegawai.
      </p>

      <EditSlipModal row={editRow} settings={settings} onClose={() => setEditRow(null)} onSaved={() => { setEditRow(null); load() }} />
    </div>
  )
}

function EditSlipModal({ row, settings, onClose, onSaved }) {
  const [jpTambahan, setJpTambahan] = useState('0')
  const [jamLembur, setJamLembur] = useState('0')
  const [potonganPinjaman, setPotonganPinjaman] = useState('0')
  const [keterangan, setKeterangan] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (row) {
      setJpTambahan(String(row.jp_tambahan ?? 0))
      setJamLembur(String(row.jam_lembur ?? 0))
      setPotonganPinjaman(String(row.potongan_pinjaman ?? 0))
      setKeterangan(row.potongan_pinjaman_keterangan || '')
    }
  }, [row])

  if (!row) return null
  const isStruktural = row.employees?.positions?.tunjangan_jenis === 'struktural'

  const handleSave = async () => {
    setSaving(true)
    const detail = { ...row.detail }
    const jp = Number(jpTambahan) || 0
    const jam = isStruktural ? 0 : (Number(jamLembur) || 0)
    const pinjaman = Number(potonganPinjaman) || 0

    const tarifMengajar = detail.golongan === 'IV' ? settings.honor_mengajar_gol4 : settings.honor_mengajar_gol3
    const honorMengajar = jp * Number(tarifMengajar)
    const honorLembur = jam * Number(settings.honor_lembur_per_jam)

    detail.jpTambahan = jp
    detail.jamLembur = jam
    detail.honorMengajar = honorMengajar
    detail.honorLembur = honorLembur
    detail.potonganPinjaman = pinjaman
    detail.totalP2 = detail.tunjanganRemunerasi + honorMengajar + honorLembur

    const totalTunjangan = (detail.totalP1 - detail.gajiPokok) + detail.totalP2
    const totalPotongan = Number(detail.potonganBpjs || 0) + pinjaman + Number(detail.potonganLainnya || 0)
    const gajiBersih = detail.gajiPokok + totalTunjangan - totalPotongan
    detail.totalTunjangan = totalTunjangan
    detail.totalPotongan = totalPotongan
    detail.gajiBersih = gajiBersih

    await supabase.from('payroll_details').update({
      jp_tambahan: jp, jam_lembur: jam, potongan_pinjaman: pinjaman, potongan_pinjaman_keterangan: keterangan,
      total_tunjangan: totalTunjangan, total_potongan: totalPotongan, gaji_bersih: gajiBersih, detail,
    }).eq('id', row.id)
    setSaving(false)
    onSaved()
  }

  return (
    <Modal open={!!row} onClose={onClose} title={`Honor & Potongan — ${row.employees?.nama}`}>
      <div className="flex flex-col gap-4">
        <Input
          label="JP Mengajar Tambahan (Kelas Pengganti/Tambahan/Pendalaman)"
          type="number" min="0" step="0.5" value={jpTambahan} onChange={(e) => setJpTambahan(e.target.value)}
        />
        <p className="-mt-2 text-xs text-[var(--color-ink-soft)]">Hanya JP di luar 40 JP reguler & di luar jam kerja efektif (Pasal 17 SK 01.012).</p>

        <Input
          label="Jam Lembur"
          type="number" min="0" step="0.5" value={jamLembur} onChange={(e) => setJamLembur(e.target.value)}
          disabled={isStruktural}
        />
        {isStruktural ? (
          <p className="-mt-2 text-xs text-[var(--color-gold)]">Pegawai berjabatan struktural tidak berhak Honor Lembur (Pasal 9 ayat 5 Draft SK).</p>
        ) : (
          <p className="-mt-2 text-xs text-[var(--color-ink-soft)]">Maks. {settings?.lembur_maks_jam_per_hari} jam/hari, {settings?.lembur_maks_jam_per_minggu} jam/minggu.</p>
        )}

        <Input label="Potongan Pinjaman/Cicilan" type="number" min="0" value={potonganPinjaman} onChange={(e) => setPotonganPinjaman(e.target.value)} />
        <Textarea label="Keterangan Pinjaman (opsional)" rows={2} value={keterangan} onChange={(e) => setKeterangan(e.target.value)} placeholder="Cicilan bulan ke-3 dari 12" />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="button" onClick={handleSave} disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button>
        </div>
      </div>
    </Modal>
  )
}
