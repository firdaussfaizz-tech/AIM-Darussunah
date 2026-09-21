import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { RequireAuth, RequireFullAccess } from './components/RouteGuards'
import Layout from './components/Layout'
import Login from './pages/auth/Login'
import Dashboard from './pages/Dashboard'
import EmployeeList from './pages/employees/EmployeeList'
import EmployeeDetail from './pages/employees/EmployeeDetail'
import AttendanceList from './pages/attendance/AttendanceList'
import LeaveList from './pages/leave/LeaveList'
import PayrollList from './pages/payroll/PayrollList'
import PayrollRunDetail from './pages/payroll/PayrollRunDetail'
import PerformanceList from './pages/performance/PerformanceList'
import WorkloadList from './pages/workload/WorkloadList'
import TrainingList from './pages/training/TrainingList'
import TrainingDetail from './pages/training/TrainingDetail'
import OrgStructure from './pages/org/OrgStructure'
import UserRoles from './pages/users/UserRoles'
import HolidayList from './pages/holidays/HolidayList'
import ActivityLog from './pages/activity/ActivityLog'
import NotificationSettings from './pages/settings/NotificationSettings'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
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
            <Route path="beban-kerja" element={<WorkloadList />} />
            <Route path="pelatihan" element={<TrainingList />} />
            <Route path="pelatihan/:id" element={<RequireFullAccess><TrainingDetail /></RequireFullAccess>} />
            <Route path="kalender-libur" element={<HolidayList />} />
            <Route path="struktur" element={<RequireFullAccess><OrgStructure /></RequireFullAccess>} />
            <Route path="pengguna" element={<RequireFullAccess><UserRoles /></RequireFullAccess>} />
            <Route path="log-aktivitas" element={<RequireFullAccess><ActivityLog /></RequireFullAccess>} />
            <Route path="notifikasi-email" element={<RequireFullAccess><NotificationSettings /></RequireFullAccess>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
