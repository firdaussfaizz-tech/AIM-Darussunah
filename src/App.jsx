import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { RequireAuth, RequireFullAccess } from './components/RouteGuards'
import { FullPageSpinner } from './components/ui'
import Layout from './components/Layout'
import Login from './pages/auth/Login'

// Code-splitting (Rekomendasi Asesmen ERP/HRIS — Performa): tiap halaman
// dimuat sebagai chunk terpisah lewat React.lazy, sehingga bundle awal jauh
// lebih ringan dan hanya kode halaman yang sedang dibuka yang diunduh.
// Shell (Layout), guard rute, dan Login tetap dimuat langsung agar tampil
// instan tanpa kedip.
const Dashboard = lazy(() => import('./pages/Dashboard'))
const EmployeeList = lazy(() => import('./pages/employees/EmployeeList'))
const EmployeeDetail = lazy(() => import('./pages/employees/EmployeeDetail'))
const AttendanceList = lazy(() => import('./pages/attendance/AttendanceList'))
const StudentAttendanceList = lazy(() => import('./pages/attendance/StudentAttendanceList'))
const LeaveList = lazy(() => import('./pages/leave/LeaveList'))
const PayrollList = lazy(() => import('./pages/payroll/PayrollList'))
const PayrollRunDetail = lazy(() => import('./pages/payroll/PayrollRunDetail'))
const PerformanceList = lazy(() => import('./pages/performance/PerformanceList'))
const KinerjaLembaga = lazy(() => import('./pages/performance/KinerjaLembaga'))
const WorkloadList = lazy(() => import('./pages/workload/WorkloadList'))
const TrainingList = lazy(() => import('./pages/training/TrainingList'))
const TrainingDetail = lazy(() => import('./pages/training/TrainingDetail'))
const OrgStructure = lazy(() => import('./pages/org/OrgStructure'))
const UserRoles = lazy(() => import('./pages/users/UserRoles'))
const HolidayList = lazy(() => import('./pages/holidays/HolidayList'))
const ActivityLog = lazy(() => import('./pages/activity/ActivityLog'))
const NotificationSettings = lazy(() => import('./pages/settings/NotificationSettings'))
const StudentList = lazy(() => import('./pages/students/StudentList'))
const StudentDetail = lazy(() => import('./pages/students/StudentDetail'))
const AcademicSettings = lazy(() => import('./pages/academic/AcademicSettings'))
const SppList = lazy(() => import('./pages/spp/SppList'))
const NilaiRapor = lazy(() => import('./pages/nilai/NilaiRapor'))
const KesiswaanDashboard = lazy(() => import('./pages/kesiswaan/KesiswaanDashboard'))
const AsetList = lazy(() => import('./pages/aset/AsetList'))
const DokumenCetak = lazy(() => import('./pages/aset/DokumenCetak'))
const AcademicManagement = lazy(() => import('./pages/academic/AcademicManagement'))
const KeuanganManagement = lazy(() => import('./pages/keuangan/KeuanganManagement'))

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<FullPageSpinner />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          {/* Halaman cetak dokumen — di luar Layout (tanpa sidebar) agar siap print/PDF. */}
          <Route path="/aset/cetak/:jenis" element={<RequireAuth><DokumenCetak /></RequireAuth>} />
          <Route path="/aset/cetak/:jenis/:id" element={<RequireAuth><DokumenCetak /></RequireAuth>} />
          <Route path="/cetak/:jenis" element={<RequireAuth><DokumenCetak /></RequireAuth>} />
          <Route path="/cetak/:jenis/:id" element={<RequireAuth><DokumenCetak /></RequireAuth>} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="pegawai" element={<EmployeeList />} />
            <Route path="pegawai/:id" element={<EmployeeDetail />} />
            <Route path="presensi" element={<AttendanceList />} />
            <Route path="cuti" element={<LeaveList />} />
            <Route path="penggajian" element={<PayrollList />} />
            <Route path="penggajian/:id" element={<RequireFullAccess modul="penggajian"><PayrollRunDetail /></RequireFullAccess>} />
            <Route path="kinerja" element={<PerformanceList />} />
            <Route path="kinerja-lembaga" element={<KinerjaLembaga />} />
            {/* Alias lama: /okr kini bagian dari menu gabungan OKR & KPI. */}
            <Route path="okr" element={<KinerjaLembaga />} />
            <Route path="beban-kerja" element={<WorkloadList />} />
            <Route path="pelatihan" element={<TrainingList />} />
            <Route path="pelatihan/:id" element={<RequireFullAccess modul="pelatihan"><TrainingDetail /></RequireFullAccess>} />
            <Route path="kalender-libur" element={<HolidayList />} />
            <Route path="struktur" element={<RequireFullAccess modul="struktur"><OrgStructure /></RequireFullAccess>} />
            <Route path="pengguna" element={<RequireFullAccess modul="pengguna"><UserRoles /></RequireFullAccess>} />
            <Route path="log-aktivitas" element={<RequireFullAccess modul="log"><ActivityLog /></RequireFullAccess>} />
            <Route path="notifikasi-email" element={<RequireFullAccess modul="notifikasi"><NotificationSettings /></RequireFullAccess>} />
            <Route path="kesiswaan" element={<KesiswaanDashboard />} />
            <Route path="siswa" element={<StudentList />} />
            <Route path="siswa/:id" element={<StudentDetail />} />
            <Route path="akademik" element={<AcademicSettings />} />
            <Route path="presensi-siswa" element={<StudentAttendanceList />} />
            <Route path="spp" element={<SppList />} />
            <Route path="nilai-rapor" element={<NilaiRapor />} />
            <Route path="aset" element={<Navigate to="/aset/inventaris" replace />} />
            <Route path="aset/:area" element={<AsetList />} />
            <Route path="pembelajaran" element={<Navigate to="/pembelajaran/jadwal" replace />} />
            <Route path="pembelajaran/:area" element={<AcademicManagement />} />
            <Route path="keuangan" element={<Navigate to="/keuangan/dashboard" replace />} />
            <Route path="keuangan/:area" element={<KeuanganManagement />} />
          </Route>
        </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  )
}
