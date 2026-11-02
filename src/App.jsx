import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import MainLayout from './components/layout/MainLayout';
import { AuthProvider } from './lib/AuthContext';
import { MaintenanceProvider } from './lib/MaintenanceContext';

import PublicLogin from './pages/public/Login';
import PublicForgotPassword from './pages/public/ForgotPassword';
import PublicResetPassword from './pages/public/ResetPassword';
import ForceChangePassword from './pages/public/ForceChangePassword';
import Forbidden from './pages/public/Forbidden';
import NotFound from './pages/public/NotFound';
import RoleGuard from './components/layout/RoleGuard';

// Admin Pages
import AdminDashboard from './pages/admin/Dashboard';
import AdminUserList from './pages/admin/UserList';
import AdminUserForm from './pages/admin/UserForm';
import AdminAuditLog from './pages/admin/AuditLog';
import AdminNotifications from './pages/admin/Notifications';
import AdminMaintenanceMode from './pages/admin/MaintenanceMode';
import AdminSystemHealth from './pages/admin/SystemHealth';
import AdminStorageHealth from './pages/admin/StorageHealth';
import AdminBackupAndRestore from './pages/admin/BackupAndRestore';
import AdminStudentAccountRequests from './pages/admin/StudentAccountRequests';

// Registrar Pages
// Academic Setup, Academic Terms, Section Rosters, and Grade Override moved here
// from Admin in the Admin/Registrar role split; Admin is now maintenance-only.
import RegistrarDashboard from './pages/registrar/Dashboard';
import RegistrarReports from './pages/registrar/Reports';
import RegistrarNotifications from './pages/registrar/Notifications';
import RegistrarProgramList from './pages/registrar/ProgramList';
import RegistrarProgramForm from './pages/registrar/ProgramForm';
import RegistrarEnrollmentManagement from './pages/registrar/EnrollmentManagement';
import RegistrarStudentAccountRequests from './pages/registrar/StudentAccountRequests';
import RegistrarFacultyLoading from './pages/registrar/FacultyLoadingAndProvisioning';
import RegistrarLateGradeChanges from './pages/registrar/LateGradeChanges';
import DeanFacultyLoading from './pages/dean/FacultyLoadingAndProvisioning';
import RegistrarViewUsers from './pages/registrar/ViewUsers';
import RegistrarSubjectList from './pages/registrar/SubjectList';
import RegistrarSubjectForm from './pages/registrar/SubjectForm';
import RegistrarSectionList from './pages/registrar/SectionList';
import RegistrarSectionForm from './pages/registrar/SectionForm';
import RegistrarSectionMasterlist from './pages/registrar/SectionMasterlist';
import RegistrarTermManagement from './pages/registrar/TermManagement';
import RegistrarGradeComputationsList from './pages/registrar/GradeComputationsList';
import RegistrarDepartmentsList from './pages/registrar/DepartmentsList';
import RegistrarGradeOverride from './pages/registrar/GradeOverride';

// Dean Pages
import DeanDashboard from './pages/dean/Dashboard';
import DeanGradePostingStatus from './pages/dean/GradePostingStatus';
import DeanGradeDistribution from './pages/dean/GradeDistribution';
import DeanAtRiskStudents from './pages/dean/AtRiskStudents';
import DeanSummaryReports from './pages/dean/SummaryReports';
import DeanNotifications from './pages/dean/Notifications';
import DeanGradeChangeRequests from './pages/dean/GradeChangeRequests';
import DeanGradeOverrides from './pages/dean/GradeOverrides';

// Faculty Pages
import FacultyDashboard from './pages/faculty/Dashboard';
import FacultyClassRecordsList from './pages/faculty/ClassRecordsList';
import FacultyGradeComponentsSetup from './pages/faculty/GradeComponentsSetup';
import FacultyScoreInput from './pages/faculty/ScoreInput';
import FacultyGradeComputationPreview from './pages/faculty/GradeComputationPreview';
import FacultyPostedGradesView from './pages/faculty/PostedGradesView';
import FacultyClassAttendance from './pages/faculty/ClassAttendance';
import FacultyNotifications from './pages/faculty/Notifications';
import FacultyStudentRisk from './pages/faculty/StudentRisk';
import FacultyEvaluatedStudents from './pages/faculty/EvaluatedStudents';
import FacultyGradeConsultationLog from './pages/faculty/GradeConsultationLog';
import FacultyGradeChangeRequests from './pages/faculty/GradeChangeRequests';
import FacultyApplyMilestoneCorrection from './pages/faculty/ApplyMilestoneCorrection';
import FacultyClassPerformance from './pages/faculty/ClassPerformance';
import FacultyPerformanceComparison from './pages/faculty/PerformanceComparison';

// Student Pages
import StudentDashboard from './pages/student/Dashboard';
import StudentMySubjects from './pages/student/MySubjects';
import StudentMyGradesList from './pages/student/MyGradesList';
import StudentMyGradesDetail from './pages/student/MyGradesDetail';
import StudentAdvisingInbox from './pages/student/FacultyAdvisingInbox';
import StudentAcademicInsights from './pages/student/AcademicInsights';
import StudentStudyTutor from './pages/student/StudyTutor';
import StudentConsultationHistory from './pages/student/ConsultationHistory';
import StudentGradeChangeRequests from './pages/student/MyGradeChangeRequests';
import StudentSubmitGradeChangeRequest from './pages/student/SubmitGradeChangeRequest';
import StudentNotifications from './pages/student/Notifications';
import StudentAttendance from './pages/student/Attendance';

// Shared Pages
import Settings from './pages/shared/Settings';
import NetworkBanner from './components/layout/NetworkBanner';
import React, { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';

function LegacyStudentRiskRedirect() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  params.set('view', 'needs-evaluation');
  return <Navigate to={`/faculty/evaluatestudent?${params}`} replace />;
}

function App() {
  useEffect(() => {
    let backListener;
    if (Capacitor.isNativePlatform()) {
      const listenerPromise = CapApp.addListener('backButton', ({ canGoBack }) => {
        if (canGoBack) {
          window.history.back();
        } else {
          CapApp.minimizeApp();
        }
      });

      listenerPromise.then((h) => {
        backListener = h;
      });
    }

    return () => {
      if (backListener) {
        backListener.remove();
      }
    };
  }, []);

  return (
    <AuthProvider>
      {/* Inside AuthProvider because maintenance state depends on the session and
          the signed-in role (admin is exempt), and outside BrowserRouter so one
          subscription serves every route rather than one per navigation. */}
      <MaintenanceProvider>
      <NetworkBanner />
      <BrowserRouter>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<PublicLogin />} />
          <Route path="/forgotpassword" element={<PublicForgotPassword />} />
          <Route path="/resetpassword" element={<PublicResetPassword />} />
          <Route path="/change-password" element={<ForceChangePassword />} />
          <Route path="/403" element={<Forbidden />} />
          <Route path="/" element={<Navigate to="/login" replace />} />

          {/* Protected Routes (Wrapped in Layout) */}
          <Route element={<MainLayout />}>
            {/* Admin Routes */}
            <Route element={<RoleGuard allowedRoles={['admin']} />}>
              <Route path="/admin/dashboard" element={<AdminDashboard />} />
              <Route path="/admin/userlist" element={<AdminUserList />} />
              <Route path="/admin/userform" element={<AdminUserForm />} />
              <Route path="/admin/studentaccountrequests" element={<AdminStudentAccountRequests />} />
              <Route path="/admin/auditlog" element={<AdminAuditLog />} />
              <Route path="/admin/notifications" element={<AdminNotifications />} />
              <Route path="/admin/maintenance" element={<AdminMaintenanceMode />} />
              <Route path="/admin/systemhealth" element={<AdminSystemHealth />} />
              <Route path="/admin/storagehealth" element={<AdminStorageHealth />} />
              <Route path="/admin/backup" element={<AdminBackupAndRestore />} />
              <Route path="/admin/settings" element={<Settings />} />
            </Route>

            {/* Registrar Routes */}
            <Route element={<RoleGuard allowedRoles={['registrar']} />}>
              <Route path="/registrar/dashboard" element={<RegistrarDashboard />} />
              <Route path="/registrar/reports" element={<RegistrarReports />} />
              <Route path="/registrar/viewusers" element={<RegistrarViewUsers />} />
              <Route path="/registrar/programlist" element={<RegistrarProgramList />} />
              <Route path="/registrar/programform" element={<RegistrarProgramForm />} />
              <Route path="/registrar/enrollment" element={<RegistrarEnrollmentManagement />} />
              <Route path="/registrar/newstudentaccounts" element={<RegistrarStudentAccountRequests />} />
              <Route path="/registrar/facultyloading" element={<RegistrarFacultyLoading />} />
              <Route path="/registrar/lategradechanges" element={<RegistrarLateGradeChanges />} />
              <Route path="/registrar/subjectlist" element={<RegistrarSubjectList />} />
              <Route path="/registrar/subjectform" element={<RegistrarSubjectForm />} />
              <Route path="/registrar/gradecomputationslist" element={<RegistrarGradeComputationsList />} />
              <Route path="/registrar/sectionlist" element={<RegistrarSectionList />} />
              <Route path="/registrar/sectionform" element={<RegistrarSectionForm />} />
              <Route path="/registrar/sectionmasterlist" element={<RegistrarSectionMasterlist />} />
              <Route path="/registrar/departmentslist" element={<RegistrarDepartmentsList />} />
              <Route path="/registrar/termmanagement" element={<RegistrarTermManagement />} />
              <Route path="/registrar/gradeoverride" element={<RegistrarGradeOverride />} />
              <Route path="/registrar/notifications" element={<RegistrarNotifications />} />
              <Route path="/registrar/settings" element={<Settings />} />
            </Route>

            {/* Dean Routes */}
            <Route element={<RoleGuard allowedRoles={['dean']} />}>
              <Route path="/dean/facultyloading" element={<DeanFacultyLoading />} />
              <Route path="/dean/dashboard" element={<DeanDashboard />} />
              <Route path="/dean/gradepostingstatus" element={<DeanGradePostingStatus />} />
              {/* Retired page. Its URL is kept because the Dean dashboard links
                  here and bookmarks exist; the new page supersedes it. */}
              <Route path="/dean/remarkoverriderequests" element={<DeanGradeChangeRequests />} />
              <Route path="/dean/graderequests" element={<DeanGradeChangeRequests />} />
              <Route path="/dean/gradeoverrides" element={<DeanGradeOverrides />} />
              <Route path="/dean/gradedistribution" element={<DeanGradeDistribution />} />
              <Route path="/dean/atriskstudents" element={<DeanAtRiskStudents />} />
              <Route path="/dean/escalatedcases" element={<DeanAtRiskStudents initialTab="discussion_queue" standalone />} />
              <Route path="/dean/interventionresults" element={<DeanAtRiskStudents initialTab="outcomes_tracker" standalone />} />
              <Route path="/dean/summaryreports" element={<DeanSummaryReports />} />
              <Route path="/dean/notifications" element={<DeanNotifications />} />
              <Route path="/dean/settings" element={<Settings />} />
            </Route>

            {/* Faculty Routes */}
            <Route element={<RoleGuard allowedRoles={['faculty']} />}>
              <Route path="/faculty/dashboard" element={<FacultyDashboard />} />
              <Route path="/faculty/classrecordslist" element={<FacultyClassRecordsList />} />
              <Route path="/faculty/gradecomponentssetup" element={<FacultyGradeComponentsSetup />} />
              <Route path="/faculty/scoreinput" element={<FacultyScoreInput />} />
              <Route path="/faculty/gradecomputationpreview" element={<FacultyGradeComputationPreview />} />
              <Route path="/faculty/postedgradesview" element={<FacultyPostedGradesView />} />
              {/* Backward-compatible target used by durable grade notifications. */}
              <Route path="/faculty/postedgrades" element={<Navigate to="/faculty/classrecordslist" replace />} />
              <Route path="/faculty/atriskstudents" element={<LegacyStudentRiskRedirect />} />
              <Route path="/faculty/evaluatestudent" element={<FacultyStudentRisk mode="evaluate" />} />
              <Route path="/faculty/evaluatedstudents" element={<FacultyEvaluatedStudents />} />
              <Route path="/faculty/consultations" element={<FacultyGradeConsultationLog />} />
              <Route path="/faculty/graderequests" element={<FacultyGradeChangeRequests />} />
              <Route path="/faculty/graderequests/:requestId/apply" element={<FacultyApplyMilestoneCorrection />} />
              {/* Retired with the class join code. The URL is kept and
                  redirected rather than removed, so an old bookmark or a link
                  in a past notification lands somewhere useful instead of on
                  the 404 page. */}
              <Route path="/faculty/enrollmentrequests" element={<Navigate to="/faculty/classrecordslist" replace />} />
              <Route path="/faculty/classattendance" element={<FacultyClassAttendance />} />
              <Route path="/faculty/reports/class-performance" element={<FacultyClassPerformance />} />
              <Route path="/faculty/reports/comparison" element={<FacultyPerformanceComparison />} />
              <Route path="/faculty/notifications" element={<FacultyNotifications />} />
              <Route path="/faculty/settings" element={<Settings />} />
            </Route>

            {/* Student Routes */}
            <Route element={<RoleGuard allowedRoles={['student']} />}>
              <Route path="/student/dashboard" element={<StudentDashboard />} />
              <Route path="/student/mysubjects" element={<StudentMySubjects />} />
              <Route path="/student/mygradeslist" element={<StudentMyGradesList />} />
              {/* Stable notification/email target retained independently of UI naming. */}
              <Route path="/student/grades" element={<StudentMyGradesList />} />
              <Route path="/student/mygradesdetail" element={<StudentMyGradesDetail />} />
              <Route path="/student/advising-inbox" element={<StudentAdvisingInbox />} />
              <Route path="/student/academic-insights" element={<StudentAcademicInsights />} />
              <Route path="/student/tutor" element={<StudentStudyTutor />} />
              <Route path="/student/consultations" element={<StudentConsultationHistory />} />
              <Route path="/student/graderequests" element={<StudentGradeChangeRequests />} />
              <Route path="/student/graderequests/new" element={<StudentSubmitGradeChangeRequest />} />
              <Route path="/student/airecommendation" element={<Navigate to="/student/academic-insights" replace />} />
              <Route path="/student/notifications" element={<StudentNotifications />} />
              <Route path="/student/attendance" element={<StudentAttendance />} />
              <Route path="/student/settings" element={<Settings />} />
            </Route>
          </Route>

          {/* Catch-all Route for 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
      </MaintenanceProvider>
    </AuthProvider>
  );
}

export default App;
