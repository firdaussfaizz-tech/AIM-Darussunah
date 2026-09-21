import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Pencil, Trash2, School } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, Card, Badge, Button, FullPageSpinner, EmptyState, Table, Tr, Td } from '../../components/ui'
import { STATUS_BADGE_COLOR, SISWA_STATUS_LABELS, formatDate } from '../../lib/format'
import StudentFormModal from './StudentFormModal'
import StudentDocumentsSection from '../../components/StudentDocumentsSection'

const TABS = ['Biodata', 'Data Ortu/Wali', 'Riwayat Kelas', 'Dokumen']

export default function StudentDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isManager } = useAuth()
  const [siswa, setSiswa] = useState(null)
  const [riwayat, setRiwayat] = useState([])
  const [schools, setSchools] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('Biodata')
  const [editOpen, setEditOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: s }, { data: r }, { data: sch }] = await Promise.all([
      supabase.from('siswa').select('*, schools!school_id(id, nama, jenjang)').eq('id', id).maybeSingle(),
      supabase
        .from('riwayat_siswa')
        .select('id, status, tanggal_masuk, tanggal_keluar, keterangan, tahun_ajaran(nama), rombel(nama_rombel, tingkat, employees!wali_kelas_employee_id(nama))')
        .eq('siswa_id', id)
        .order('created_at', { ascending: false }),
      supabase.from('schools').select('id, nama, jenjang').order('jenjang'),
    ])
    setSiswa(s)
    setRiwayat(r || [])
    setSchools(sch || [])
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  if (loading) return <FullPageSpinner />
  if (!siswa) return <EmptyState title="Data siswa tidak ditemukan" description="Data mungkin telah dihapus atau Anda tidak memiliki akses." />

  const canManage = isManager

  const handleDelete = async () => {
    if (!confirm(`Hapus data siswa "${siswa.nama_lengkap}"? Seluruh riwayat kelas dan dokumennya akan ikut terhapus permanen.`)) return
    const { error } = await supabase.from('siswa').delete().eq('id', siswa.id)
    if (error) { alert('Gagal menghapus: ' + error.message); return }
    navigate('/siswa', { replace: true })
  }

  return (
    <div>
      <button onClick={() => navigate(-1)} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-ink-soft)] hover:text-[var(--color-navy)]">
        <ArrowLeft className="h-4 w-4" /> Kembali
      </button>

      <PageHeader
        title={siswa.nama_lengkap}
        description={siswa.schools ? `${siswa.schools.jenjang} — ${siswa.schools.nama}` : 'Unit sekolah belum diisi'}
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
        <Badge color={STATUS_BADGE_COLOR[siswa.status]}>{SISWA_STATUS_LABELS[siswa.status] || siswa.status}</Badge>
        {siswa.nis && <Badge color="neutral">NIS {siswa.nis}</Badge>}
        {siswa.nisn && <Badge color="navy">NISN {siswa.nisn}</Badge>}
      </div>

      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-[var(--color-border)]">
        {TABS.map((t) => (
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

      {tab === 'Biodata' && (
        <Card>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[
              ['Nama Panggilan', siswa.nama_panggilan],
              ['NIK', siswa.nik],
              ['Jenis Kelamin', siswa.jenis_kelamin === 'L' ? 'Laki-laki' : siswa.jenis_kelamin === 'P' ? 'Perempuan' : '—'],
              ['Tempat, Tanggal Lahir', `${siswa.tempat_lahir || '—'}, ${formatDate(siswa.tanggal_lahir)}`],
              ['Agama', siswa.agama],
              ['Anak ke-', siswa.anak_ke],
              ['Jumlah Saudara', siswa.jumlah_saudara],
              ['Alamat', siswa.alamat],
              ['Catatan', siswa.catatan],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-[13px] font-medium text-[var(--color-ink-soft)]">{label}</dt>
                <dd className="mt-0.5 text-sm text-[var(--color-ink)]">{value || '—'}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}

      {tab === 'Data Ortu/Wali' && (
        <div className="flex flex-col gap-5">
          <Card>
            <p className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">Data Ayah</p>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[
                ['Nama', siswa.nama_ayah], ['NIK', siswa.nik_ayah], ['Tahun Lahir', siswa.tahun_lahir_ayah],
                ['Pendidikan', siswa.pendidikan_ayah], ['Pekerjaan', siswa.pekerjaan_ayah], ['No. HP', siswa.no_hp_ayah],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[13px] font-medium text-[var(--color-ink-soft)]">{label}</dt>
                  <dd className="mt-0.5 text-sm text-[var(--color-ink)]">{value || '—'}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card>
            <p className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">Data Ibu</p>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[
                ['Nama', siswa.nama_ibu], ['NIK', siswa.nik_ibu], ['Tahun Lahir', siswa.tahun_lahir_ibu],
                ['Pendidikan', siswa.pendidikan_ibu], ['Pekerjaan', siswa.pekerjaan_ibu], ['No. HP', siswa.no_hp_ibu],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[13px] font-medium text-[var(--color-ink-soft)]">{label}</dt>
                  <dd className="mt-0.5 text-sm text-[var(--color-ink)]">{value || '—'}</dd>
                </div>
              ))}
            </dl>
          </Card>
          {(siswa.nama_wali || siswa.no_hp_wali) && (
            <Card>
              <p className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">Data Wali</p>
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {[['Nama', siswa.nama_wali], ['Hubungan', siswa.hubungan_wali], ['No. HP', siswa.no_hp_wali]].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-[13px] font-medium text-[var(--color-ink-soft)]">{label}</dt>
                    <dd className="mt-0.5 text-sm text-[var(--color-ink)]">{value || '—'}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          )}
          <Card>
            <dt className="text-[13px] font-medium text-[var(--color-ink-soft)]">Email Orang Tua (notifikasi)</dt>
            <dd className="mt-0.5 text-sm text-[var(--color-ink)]">{siswa.email_ortu || '—'}</dd>
          </Card>
        </div>
      )}

      {tab === 'Riwayat Kelas' && (
        <Card padded={false}>
          <div className="p-5">
            {riwayat.length === 0 ? (
              <EmptyState icon={School} title="Belum ada riwayat kelas" description="Siswa ini belum ditempatkan ke rombel manapun. Kelola penempatan di menu Kelas & Tahun Ajaran." />
            ) : (
              <Table columns={['Tahun Ajaran', 'Kelas', 'Wali Kelas', 'Status', 'Tanggal Masuk', 'Tanggal Keluar']}>
                {riwayat.map((r) => (
                  <Tr key={r.id}>
                    <Td className="font-medium text-[var(--color-ink)]">{r.tahun_ajaran?.nama || '—'}</Td>
                    <Td>{r.rombel ? `${r.rombel.tingkat} — ${r.rombel.nama_rombel}` : '—'}</Td>
                    <Td className="text-[var(--color-ink-soft)]">{r.rombel?.employees?.nama || '—'}</Td>
                    <Td><Badge color={STATUS_BADGE_COLOR[r.status] || 'neutral'}>{r.status}</Badge></Td>
                    <Td>{formatDate(r.tanggal_masuk)}</Td>
                    <Td>{formatDate(r.tanggal_keluar)}</Td>
                  </Tr>
                ))}
              </Table>
            )}
          </div>
        </Card>
      )}

      {tab === 'Dokumen' && <StudentDocumentsSection siswaId={siswa.id} canManage={canManage} />}

      <StudentFormModal open={editOpen} onClose={() => setEditOpen(false)} onSaved={() => { setEditOpen(false); load() }} schools={schools} initialData={siswa} />
    </div>
  )
}
