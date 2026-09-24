import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { RequireAuth, RequireFullAccess } from './components/RouteGuards'
import Layout from './components/Layout'
import Login from './pages/auth/Login'
import Dashboard from './pages/Dashboard'
import EmployeeList from './pages/employees/EmployeeList'
import EmployeeDetail from './pages/employees/EmployeeDetail'
import AttendanceList from './pages/attendance/AttendanceList'
import StudentAttendanceList from './pages/attendance/StudentAttendanceList'
import LeaveList from './pages/leave/LeaveList'
import PayrollList from './pages/payroll/PayrollList'
import PayrollRunDetail from './pages/payroll/PayrollRunDetail'
import PerformanceList from './pages/performance/PerformanceList'
import KinerjaLembaga from './pages/performance/KinerjaLembaga'
import WorkloadList from './pages/workload/WorkloadList'
import TrainingList from './pages/training/TrainingList'
import TrainingDetail from './pages/training/TrainingDetail'
import OrgStructure from './pages/org/OrgStructure'
import UserRoles from './pages/users/UserRoles'
import HolidayList from './pages/holidays/HolidayList'
import ActivityLog from './pages/activity/ActivityLog'
import NotificationSettings from './pages/settings/NotificationSettings'
import StudentList from './pages/students/StudentList'
import StudentDetail from './pages/students/StudentDetail'
import AcademicSettings from './pages/academic/AcademicSettings'
import SppList from './pages/spp/SppList'
import NilaiRapor from './pages/nilai/NilaiRapor'
import KesiswaanDashboard from './pages/kesiswaan/KesiswaanDashboard'
import AsetList from './pages/aset/AsetList'
import DokumenCetak from './pages/aset/DokumenCetak'
import AcademicManagement from './pages/academic/AcademicManagement'
import KeuanganManagement from './pages/keuangan/KeuanganManagement'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
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
            <Route path="penggajian/:id" element={<RequireFullAccess><PayrollRunDetail /></RequireFullAccess>} />
            <Route path="kinerja" element={<PerformanceList />} />
            <Route path="kinerja-lembaga" element={<KinerjaLembaga />} />
            {/* Alias lama: /okr kini bagian dari menu gabungan OKR & KPI. */}
            <Route path="okr" element={<KinerjaLembaga />} />
            <Route path="beban-kerja" element={<WorkloadList />} />
            <Route path="pelatihan" element={<TrainingList />} />
            <Route path="pelatihan/:id" element={<RequireFullAccess><TrainingDetail /></RequireFullAccess>} />
            <Route path="kalender-libur" element={<HolidayList />} />
            <Route path="struktur" element={<RequireFullAccess><OrgStructure /></RequireFullAccess>} />
            <Route path="pengguna" element={<RequireFullAccess><UserRoles /></RequireFullAccess>} />
            <Route path="log-aktivitas" element={<RequireFullAccess><ActivityLog /></RequireFullAccess>} />
            <Route path="notifikasi-email" element={<RequireFullAccess><NotificationSettings /></RequireFullAccess>} />
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
      </BrowserRouter>
    </AuthProvider>
  )
}
