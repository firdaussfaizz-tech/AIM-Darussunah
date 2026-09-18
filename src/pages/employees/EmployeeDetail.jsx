import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Pencil, Trash2, GraduationCap, Briefcase, FileSignature } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, Card, Badge, Button, FullPageSpinner, EmptyState } from '../../components/ui'
import { STATUS_BADGE_COLOR, formatDate } from '../../lib/format'
import { hitungRuang } from '../../lib/remunerasi'
import EmployeeFormModal from './EmployeeFormModal'
import RecordListSection from '../../components/RecordListSection'
import DocumentsSection from '../../components/DocumentsSection'
import SalarySection from '../../components/SalarySection'
import IndeksKehadiranSection from '../../components/IndeksKehadiranSection'

const TABS = ['Biodata', 'Pendidikan', 'Riwayat Kerja', 'Kontrak', 'Dokumen', 'Gaji', 'Indeks Kehadiran']

export default function EmployeeDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isManager, hasFullAccess, employee: myEmployee } = useAuth()
  const [employee, setEmployee] = useState(null)
  const [schools, setSchools] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('Biodata')
  const [editOpen, setEditOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: emp }, { data: sch }] = await Promise.all([
      supabase.from('employees').select('*, schools!school_id(id, nama, jenjang), departments(nama), positions(nama, tunjangan_jenis, tunjangan_nominal)').eq('id', id).maybeSingle(),
      supabase.from('schools').select('id, nama, jenjang').order('jenjang'),
    ])
    setEmployee(emp)
    setSchools(sch || [])
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  if (loading) return <FullPageSpinner />
  if (!employee) return <EmptyState title="Data pegawai tidak ditemukan" description="Data mungkin telah dihapus atau Anda tidak memiliki akses." />

  const isOwnProfile = myEmployee?.id === employee.id
  const canManage = isManager
  const canViewSalary = hasFullAccess || isOwnProfile
  const visibleTabs = canViewSalary ? TABS : TABS.filter((t) => t !== 'Gaji' && t !== 'Indeks Kehadiran')

  const handleDelete = async () => {
    if (!confirm(`Hapus data pegawai "${employee.nama}"? Seluruh riwayat presensi, cuti, gaji, kinerja, dan pelatihannya akan ikut terhapus permanen.`)) return
    const { error } = await supabase.from('employees').delete().eq('id', employee.id)
    if (error) { alert('Gagal menghapus: ' + error.message); return }
    navigate('/pegawai', { replace: true })
  }

  return (
    <div>
      <button onClick={() => navigate(-1)} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]">
        <ArrowLeft className="h-4 w-4" /> Kembali
      </button>

      <PageHeader
        title={employee.nama}
        description={`${employee.positions?.nama || 'Jabatan belum diisi'} · ${employee.schools ? `${employee.schools.jenjang} — ${employee.schools.nama}` : 'Kantor Yayasan Pusat'}`}
        actions={canManage && (
          <>
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" /> Ubah Biodata
            </Button>
            <Button variant="outline" onClick={handleDelete} className="text-[var(--color-danger)]">
              <Trash2 className="h-4 w-4" /> Hapus
            </Button>
          </>
        )}
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Badge color={STATUS_BADGE_COLOR[employee.status]}>{employee.status}</Badge>
        <Badge color="navy">{employee.status_kepegawaian}</Badge>
        {employee.nip && <Badge color="neutral">NIP {employee.nip}</Badge>}
      </div>

      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-[var(--color-border)]">
        {visibleTabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              tab === t ? 'border-[var(--color-navy)] text-[var(--color-navy)]' : 'border-transparent text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Biodata' && <BiodataTab employee={employee} />}
      {tab === 'Pendidikan' && (
        <RecordListSection
          title="Riwayat Pendidikan"
          table="employee_education"
          employeeId={employee.id}
          canManage={canManage}
          emptyIcon={GraduationCap}
          columns={[
            { key: 'jenjang_pendidikan', label: 'Jenjang' },
            { key: 'institusi', label: 'Institusi' },
            { key: 'jurusan', label: 'Jurusan' },
            { key: 'tahun_lulus', label: 'Tahun Lulus' },
          ]}
          formFields={[
            { name: 'jenjang_pendidikan', label: 'Jenjang Pendidikan (SMA/D3/S1/S2)', required: true },
            { name: 'institusi', label: 'Institusi / Sekolah / Universitas' },
            { name: 'jurusan', label: 'Jurusan' },
            { name: 'tahun_lulus', label: 'Tahun Lulus', type: 'number' },
          ]}
        />
      )}
      {tab === 'Riwayat Kerja' && (
        <RecordListSection
          title="Riwayat Kerja Sebelumnya"
          table="employee_work_history"
          employeeId={employee.id}
          canManage={canManage}
          emptyIcon={Briefcase}
          columns={[
            { key: 'nama_instansi', label: 'Instansi' },
            { key: 'jabatan', label: 'Jabatan' },
            { key: 'tahun_mulai', label: 'Dari' },
            { key: 'tahun_selesai', label: 'Sampai' },
          ]}
          formFields={[
            { name: 'nama_instansi', label: 'Nama Instansi', required: true },
            { name: 'jabatan', label: 'Jabatan' },
            { name: 'tahun_mulai', label: 'Tahun Mulai', type: 'number' },
            { name: 'tahun_selesai', label: 'Tahun Selesai', type: 'number' },
          ]}
        />
      )}
      {tab === 'Kontrak' && (
        <RecordListSection
          title="Kontrak Kerja"
          description="Riwayat SK pengangkatan dan perpanjangan kontrak"
          table="employment_contracts"
          employeeId={employee.id}
          canManage={canManage}
          emptyIcon={FileSignature}
          columns={[
            { key: 'jenis_kontrak', label: 'Jenis Kontrak' },
            { key: 'nomor_sk', label: 'No. SK' },
            { key: 'tanggal_mulai', label: 'Mulai' },
            { key: 'tanggal_selesai', label: 'Selesai' },
            { key: 'status', label: 'Status' },
          ]}
          formFields={[
            { name: 'jenis_kontrak', label: 'Jenis Kontrak', required: true, placeholder: 'Kontrak 1 Tahun, SK Tetap Yayasan, dll.' },
            { name: 'nomor_sk', label: 'Nomor SK' },
            { name: 'tanggal_mulai', label: 'Tanggal Mulai', type: 'date', required: true },
            { name: 'tanggal_selesai', label: 'Tanggal Selesai', type: 'date' },
            { name: 'status', label: 'Status', type: 'select', options: ['aktif', 'berakhir', 'diperpanjang'] },
          ]}
        />
      )}
      {tab === 'Dokumen' && <DocumentsSection employeeId={employee.id} canManage={canManage} />}
      {tab === 'Gaji' && canViewSalary && <SalarySection employee={employee} canManage={hasFullAccess} />}
      {tab === 'Indeks Kehadiran' && canViewSalary && <IndeksKehadiranSection employee={employee} canManage={hasFullAccess} />}

      <EmployeeFormModal open={editOpen} onClose={() => setEditOpen(false)} onSaved={() => { setEditOpen(false); load() }} schools={schools} initialData={employee} />
    </div>
  )
}

function BiodataTab({ employee }) {
  const fields = [
    ['NIK', employee.nik],
    ['Jenis Kelamin', employee.jenis_kelamin === 'L' ? 'Laki-laki' : employee.jenis_kelamin === 'P' ? 'Perempuan' : '—'],
    ['Tempat, Tanggal Lahir', `${employee.tempat_lahir || '—'}, ${formatDate(employee.tanggal_lahir)}`],
    ['No. HP', employee.no_hp],
    ['Email', employee.email],
    ['Alamat', employee.alamat],
    ['Unit Kerja', employee.departments?.nama],
    ['Pendidikan Terakhir', employee.pendidikan_terakhir],
    ['PIN Mesin Fingerprint', employee.pin_fingerprint],
    ['Tanggal Masuk Kerja', formatDate(employee.tanggal_masuk)],
    ['Golongan / Ruang', employee.golongan ? `Golongan ${employee.golongan} / Ruang ${hitungRuang(employee.tanggal_masuk) || '—'}` : 'Belum ditentukan'],
  ]
  return (
    <Card>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt className="text-[13px] font-medium text-[var(--color-ink-soft)]">{label}</dt>
            <dd className="mt-0.5 text-sm text-[var(--color-ink)]">{value || '—'}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}
