import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, PlayCircle, Lock } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { PageHeader, Card, Button, Table, Tr, Td, Badge, EmptyState, FullPageSpinner } from '../../components/ui'
import { STATUS_BADGE_COLOR, formatRupiah, BULAN } from '../../lib/format'

export default function PayrollRunDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [run, setRun] = useState(null)
  const [details, setDetails] = useState([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: r }, { data: d }] = await Promise.all([
      supabase.from('payroll_runs').select('*').eq('id', id).maybeSingle(),
      supabase.from('payroll_details').select('*, employees(nama, schools!school_id(nama, jenjang))').eq('payroll_run_id', id).order('created_at'),
    ])
    setRun(r)
    setDetails(d || [])
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  const handleGenerate = async () => {
    setProcessing(true)
    const { data: employees } = await supabase.from('employees').select('id').eq('status', 'aktif')
    const already = new Set(details.map((d) => d.employee_id))
    const toProcess = (employees || []).filter((e) => !already.has(e.id))

    for (const emp of toProcess) {
      const { data: salary } = await supabase
        .from('employee_salary').select('*').eq('employee_id', emp.id)
        .order('berlaku_sejak', { ascending: false }).limit(1).maybeSingle()
      if (!salary) continue
      const totalTunjangan = salary.tunjangan_jabatan + salary.tunjangan_transport + salary.tunjangan_makan + salary.tunjangan_lainnya
      const totalPotongan = salary.potongan_bpjs + salary.potongan_lainnya
      await supabase.from('payroll_details').insert({
        payroll_run_id: id,
        employee_id: emp.id,
        gaji_pokok: salary.gaji_pokok,
        total_tunjangan: totalTunjangan,
        total_potongan: totalPotongan,
        gaji_bersih: salary.gaji_pokok + totalTunjangan - totalPotongan,
        detail: salary,
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
              description="Klik 'Proses Pegawai Aktif' untuk menghasilkan slip gaji dari komponen gaji terbaru setiap pegawai."
            />
          ) : (
            <Table columns={['Pegawai', 'Unit', 'Gaji Pokok', 'Tunjangan', 'Potongan', 'Gaji Bersih']}>
              {details.map((d) => (
                <Tr key={d.id}>
                  <Td className="font-medium text-[var(--color-ink)]">{d.employees?.nama}</Td>
                  <Td className="text-[var(--color-ink-soft)]">{d.employees?.schools ? `${d.employees.schools.jenjang} — ${d.employees.schools.nama}` : '—'}</Td>
                  <Td>{formatRupiah(d.gaji_pokok)}</Td>
                  <Td className="text-[var(--color-success)]">+{formatRupiah(d.total_tunjangan)}</Td>
                  <Td className="text-[var(--color-danger)]">-{formatRupiah(d.total_potongan)}</Td>
                  <Td className="font-medium">{formatRupiah(d.gaji_bersih)}</Td>
                </Tr>
              ))}
            </Table>
          )}
        </div>
      </Card>
      {details.some((d) => !d.detail) === false && (
        <p className="mt-3 text-xs text-[var(--color-ink-soft)]">
          Catatan: pegawai tanpa data komponen gaji (tab "Gaji" pada profil pegawai) akan dilewati saat diproses.
        </p>
      )}
    </div>
  )
}
