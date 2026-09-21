import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Papa from 'papaparse'
import { ArrowLeft, PlayCircle, Lock, Pencil, RefreshCw, Download } from 'lucide-react'
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
  const [salaryScale, setSalaryScale] = useState([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [recomputingId, setRecomputingId] = useState(null)
  const [recomputingAll, setRecomputingAll] = useState(false)
  const [editRow, setEditRow] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: r }, { data: d }, { data: s }, { data: scale }] = await Promise.all([
      supabase.from('payroll_runs').select('*').eq('id', id).maybeSingle(),
      supabase.from('payroll_details').select('*, employees(nama, golongan, tanggal_masuk, school_id, positions(nama, tunjangan_jenis, tunjangan_nominal), schools!school_id(nama, jenjang))').eq('payroll_run_id', id).order('created_at'),
      supabase.from('payroll_settings').select('*').maybeSingle(),
      supabase.from('salary_scale').select('*'),
    ])
    setRun(r)
    setDetails(d || [])
    setSettings(s || null)
    setSalaryScale(scale || [])
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  // Hitung ulang seluruh komponen (Gaji Pokok, Tunjangan Struktural/Fungsional,
  // Remunerasi, Honor) satu pegawai dari data TERKINI (Golongan, Ruang,
  // Jabatan, Tugas Tambahan, presensi, kinerja) — dipakai baik saat
  // memproses pegawai baru maupun saat menghitung ulang slip yang sudah ada.
  const hitungKomponenTerkini = async (emp, { jpTambahan = 0, jamLembur = 0, potonganPinjaman = 0, potonganLainnya = 0 } = {}) => {
    const start = `${run.periode_tahun}-${String(run.periode_bulan).padStart(2, '0')}-01`
    const endDate = new Date(run.periode_tahun, run.periode_bulan, 1).toISOString().slice(0, 10)
    const [{ data: att }, { data: perf }, { data: salaryRow }, { data: tugas }, { data: holidays }] = await Promise.all([
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
      // Libur yayasan (school_id null) + libur khusus sekolah pegawai ini,
      // dikecualikan dari Hari Kerja Wajib (Roadmap B Otomasi #6).
      supabase
        .from('school_holidays')
        .select('tanggal')
        .gte('tanggal', start).lt('tanggal', endDate)
        .or(`school_id.is.null${emp.school_id ? `,school_id.eq.${emp.school_id}` : ''}`),
    ])
    const ih = hitungIH({ attendanceRows: att || [], tahun: run.periode_tahun, bulan: run.periode_bulan, holidayDates: (holidays || []).map((h) => h.tanggal) })
    return hitungKomponenGaji({
      employee: emp, position: emp.positions, tugasTambahanList: (tugas || []).map((t) => t.tugas_tambahan).filter(Boolean),
      salaryScaleRows: salaryScale, settings,
      ihResult: ih, performanceIndex: perf, potonganBpjs: salaryRow?.potongan_bpjs || 0,
      jpTambahan, jamLembur, potonganPinjaman, potonganLainnya,
    })
  }

  const handleGenerate = async () => {
    setProcessing(true)
    try {
      const { data: employees } = await supabase.from('employees').select('id, nama, golongan, tanggal_masuk, school_id, positions(tunjangan_jenis, tunjangan_nominal)').eq('status', 'aktif')
      const already = new Set(details.map((d) => d.employee_id))
      const toProcess = (employees || []).filter((e) => !already.has(e.id))

      for (const emp of toProcess) {
        const komponen = await hitungKomponenTerkini(emp)
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
    } catch (err) {
      alert('Gagal memproses: ' + err.message)
    } finally {
      setProcessing(false)
      load()
    }
  }

  // Hitung ulang satu slip yang SUDAH diproses — dipakai ketika data dasar
  // pegawai (Golongan/Ruang, Jabatan, Tugas Tambahan) berubah SETELAH
  // "Proses Pegawai Aktif" diklik, sehingga slip lama jadi kadaluarsa.
  // Input manual (JP Tambahan, Jam Lembur, Potongan Pinjaman) yang sudah
  // diisi admin tetap dipertahankan.
  const handleRecompute = async (row) => {
    setRecomputingId(row.id)
    try {
      const emp = {
        id: row.employee_id,
        golongan: row.employees?.golongan,
        tanggal_masuk: row.employees?.tanggal_masuk,
        school_id: row.employees?.school_id,
        positions: row.employees?.positions,
      }
      const komponen = await hitungKomponenTerkini(emp, {
        jpTambahan: row.jp_tambahan || 0,
        jamLembur: row.jam_lembur || 0,
        potonganPinjaman: row.potongan_pinjaman || 0,
        potonganLainnya: row.detail?.potonganLainnya || 0,
      })
      await supabase.from('payroll_details').update({
        gaji_pokok: komponen.gajiPokok,
        total_tunjangan: komponen.totalTunjangan,
        total_potongan: komponen.totalPotongan,
        gaji_bersih: komponen.gajiBersih,
        detail: komponen,
      }).eq('id', row.id)
    } catch (err) {
      alert('Gagal menghitung ulang: ' + err.message)
    } finally {
      setRecomputingId(null)
      load()
    }
  }

  // Simpan hasil EditSlipModal (JP mengajar/jam lembur/potongan pinjaman)
  // — dipakai HANYA lewat jalur ini (bukan menempel ke row.detail lama)
  // supaya Gaji Pokok/Tunjangan Struktural/Fungsional/Remunerasi ikut
  // dihitung ulang dari data TERKINI setiap kali slip disimpan, persis
  // seperti tombol "Hitung Ulang". Ini menutup celah yang sama dengan
  // bug Golongan Yanah/Karsih — kali ini di jalur ubah honor/potongan.
  // Hitung ulang SEMUA slip draft sekaligus dari data terkini (Golongan/Ruang,
  // Jabatan, Tugas Tambahan, presensi, kinerja) — dipakai setelah perubahan
  // massal (mis. kenaikan golongan banyak pegawai, revisi Payroll Settings)
  // supaya admin tidak perlu klik ikon Hitung Ulang satu per satu.
  const handleRecomputeAll = async () => {
    if (!confirm(`Hitung ulang seluruh ${details.length} slip pada periode ini dari data terkini?`)) return
    setRecomputingAll(true)
    const gagal = []
    try {
      for (const row of details) {
        try {
          const emp = {
            id: row.employee_id,
            golongan: row.employees?.golongan,
            tanggal_masuk: row.employees?.tanggal_masuk,
            school_id: row.employees?.school_id,
            positions: row.employees?.positions,
          }
          const komponen = await hitungKomponenTerkini(emp, {
            jpTambahan: row.jp_tambahan || 0,
            jamLembur: row.jam_lembur || 0,
            potonganPinjaman: row.potongan_pinjaman || 0,
            potonganLainnya: row.detail?.potonganLainnya || 0,
          })
          const { error: updErr } = await supabase.from('payroll_details').update({
            gaji_pokok: komponen.gajiPokok,
            total_tunjangan: komponen.totalTunjangan,
            total_potongan: komponen.totalPotongan,
            gaji_bersih: komponen.gajiBersih,
            detail: komponen,
          }).eq('id', row.id)
          if (updErr) gagal.push(`${row.employees?.nama || row.employee_id}: ${updErr.message}`)
        } catch (err) {
          gagal.push(`${row.employees?.nama || row.employee_id}: ${err.message}`)
        }
      }
      if (gagal.length > 0) {
        alert(`Selesai dengan ${gagal.length} kegagalan:\n\n${gagal.join('\n')}`)
      }
    } finally {
      setRecomputingAll(false)
      load()
    }
  }

  const persistEditedSlip = async (row, { jpTambahan, jamLembur, potonganPinjaman, keterangan }) => {
    try {
      const emp = {
        id: row.employee_id,
        golongan: row.employees?.golongan,
        tanggal_masuk: row.employees?.tanggal_masuk,
        school_id: row.employees?.school_id,
        positions: row.employees?.positions,
      }
      const komponen = await hitungKomponenTerkini(emp, {
        jpTambahan, jamLembur, potonganPinjaman,
        potonganLainnya: row.detail?.potonganLainnya || 0,
      })
      return await supabase.from('payroll_details').update({
        jp_tambahan: jpTambahan,
        jam_lembur: jamLembur,
        potongan_pinjaman: potonganPinjaman,
        potongan_pinjaman_keterangan: keterangan,
        gaji_pokok: komponen.gajiPokok,
        total_tunjangan: komponen.totalTunjangan,
        total_potongan: komponen.totalPotongan,
        gaji_bersih: komponen.gajiBersih,
        detail: komponen,
      }).eq('id', row.id)
    } catch (err) {
      return { error: err }
    }
  }

  // Ekspor rekap periode ini ke CSV (bisa dibuka di Excel/Google Sheets).
  // Memakai papaparse yang sudah jadi dependensi proyek — tidak menambah
  // paket baru.
  const handleExportCsv = () => {
    const rows = details.map((d) => ({
      'Nama Pegawai': d.employees?.nama || '',
      'Unit': d.employees?.schools ? `${d.employees.schools.jenjang} — ${d.employees.schools.nama}` : '',
      'Golongan': d.employees?.golongan || '',
      'P1 (Gaji Pokok + Tunjangan Tetap)': d.detail?.totalP1 ?? d.gaji_pokok,
      'Tunjangan Remunerasi': d.detail?.tunjanganRemunerasi || 0,
      'Honor Mengajar': d.detail?.honorMengajar || 0,
      'Honor Lembur': d.detail?.honorLembur || 0,
      'Total Potongan': d.total_potongan,
      'Gaji Bersih': d.gaji_bersih,
      'Data Lengkap': d.detail?.lengkap === true ? 'Ya' : 'Tidak',
    }))
    const csv = Papa.unparse(rows)
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Rekap-Gaji-${BULAN[run.periode_bulan - 1]}-${run.periode_tahun}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Sebelum Finalisasi, cek setiap slip: detail.lengkap (dihitung di
  // hitungKomponenGaji, payroll.js) hanya true jika Golongan, baris Skala
  // Gaji, hasil Indeks Kehadiran, dan Indeks Kinerja semuanya tersedia.
  // Slip yang belum lengkap kemungkinan memakai nilai 0/default yang keliru
  // — admin diberi peringatan berisi nama pegawai sebelum bisa lanjut.
  const handleFinalize = async () => {
    const belumLengkap = details.filter((d) => d.detail?.lengkap !== true)
    if (belumLengkap.length > 0) {
      const daftar = belumLengkap.map((d) => `- ${d.employees?.nama || d.employee_id}`).join('\n')
      const lanjut = confirm(
        `Peringatan: ${belumLengkap.length} slip berikut datanya belum lengkap (Golongan/Skala Gaji/Indeks Kehadiran/Indeks Kinerja belum tersedia saat dihitung):\n\n${daftar}\n\n` +
        `Slip ini kemungkinan memakai nilai default/0 yang tidak akurat. Disarankan periksa dan "Hitung Ulang" dulu sebelum Finalisasi.\n\n` +
        `Tetap lanjutkan Finalisasi sekarang?`
      )
      if (!lanjut) return
    } else if (!confirm('Finalisasi periode ini? Slip gaji akan terlihat oleh pegawai dan tidak disarankan diubah lagi.')) {
      return
    }
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
                {details.length > 0 && (
                  <Button variant="outline" onClick={handleRecomputeAll} disabled={recomputingAll}>
                    <RefreshCw className={`h-4 w-4 ${recomputingAll ? 'animate-spin' : ''}`} /> {recomputingAll ? 'Menghitung Ulang…' : 'Hitung Ulang Semua'}
                  </Button>
                )}
                <Button onClick={handleFinalize}><Lock className="h-4 w-4" /> Finalisasi</Button>
              </>
            )}
            {details.length > 0 && (
              <Button variant="outline" onClick={handleExportCsv}>
                <Download className="h-4 w-4" /> Ekspor CSV
              </Button>
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
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleRecompute(d)}
                          disabled={recomputingId === d.id}
                          className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)] disabled:opacity-50"
                          aria-label="Hitung ulang dari data terkini"
                          title="Hitung ulang dari data terkini (Golongan/Ruang, Jabatan, Tugas Tambahan)"
                        >
                          <RefreshCw className={`h-4 w-4 ${recomputingId === d.id ? 'animate-spin' : ''}`} />
                        </button>
                        <button onClick={() => setEditRow(d)} className="text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]" aria-label="Ubah honor/potongan">
                          <Pencil className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </Td>
                </Tr>
              ))}
            </Table>
          )}
        </div>
      </Card>
      <p className="mt-3 text-xs text-[var(--color-ink-soft)]">
        Gaji Pokok, Tunjangan Jabatan, dan Remunerasi dihitung otomatis. Klik ikon pensil untuk menambahkan JP mengajar tambahan, jam lembur, atau potongan pinjaman/cicilan per pegawai —
        menyimpan lewat ikon pensil ini SELALU ikut menghitung ulang Gaji Pokok/Tunjangan dari data Golongan/Ruang, Jabatan, dan Tugas Tambahan pegawai yang terkini, jadi tidak akan
        menimpa dengan angka lama. Ikon <RefreshCw className="inline h-3.5 w-3.5 align-text-bottom" /> tersedia untuk menghitung ulang cepat tanpa membuka form honor/potongan.
      </p>

      <EditSlipModal row={editRow} settings={settings} onSave={persistEditedSlip} onClose={() => setEditRow(null)} onSaved={() => { setEditRow(null); load() }} />
    </div>
  )
}

function EditSlipModal({ row, settings, onSave, onClose, onSaved }) {
  const [jpTambahan, setJpTambahan] = useState('0')
  const [jamLembur, setJamLembur] = useState('0')
  const [potonganPinjaman, setPotonganPinjaman] = useState('0')
  const [keterangan, setKeterangan] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (row) {
      setJpTambahan(String(row.jp_tambahan ?? 0))
      setJamLembur(String(row.jam_lembur ?? 0))
      setPotonganPinjaman(String(row.potongan_pinjaman ?? 0))
      setKeterangan(row.potongan_pinjaman_keterangan || '')
      setError('')
    }
  }, [row])

  if (!row) return null
  const isStruktural = row.employees?.positions?.tunjangan_jenis === 'struktural'

  // Catatan: Gaji Pokok/Tunjangan/Remunerasi TIDAK dihitung manual di sini
  // lagi — persistEditedSlip() di komponen induk selalu mengambil data
  // Golongan/Ruang, Jabatan, dan Tugas Tambahan TERKINI dan menghitung
  // ulang semuanya, sama seperti tombol "Hitung Ulang". Ini mencegah slip
  // tersimpan dengan Gaji Pokok/Tunjangan yang sudah kadaluarsa.
  const handleSave = async () => {
    setSaving(true)
    setError('')
    const jp = Number(jpTambahan) || 0
    const jam = isStruktural ? 0 : (Number(jamLembur) || 0)
    const pinjaman = Number(potonganPinjaman) || 0

    const { error: err } = await onSave(row, { jpTambahan: jp, jamLembur: jam, potonganPinjaman: pinjaman, keterangan })
    setSaving(false)
    if (err) { setError(err.message); return }
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

        <p className="-mt-2 text-xs text-[var(--color-ink-soft)]">Menyimpan di sini juga otomatis menghitung ulang Gaji Pokok, Tunjangan, dan Remunerasi dari data pegawai terkini.</p>

        {error && <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="button" onClick={handleSave} disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button>
        </div>
      </div>
    </Modal>
  )
}
