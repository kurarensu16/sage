import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './components/layout/MainLayout';
import { AuthProvider } from './lib/AuthContext';

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
import AdminGradeOverride from './pages/admin/GradeOverride';
import AdminAuditLog from './pages/admin/AuditLog';
import AdminSubjectList from './pages/admin/SubjectList';
import AdminSubjectForm from './pages/admin/SubjectForm';
import AdminSectionList from './pages/admin/SectionList';
import AdminSectionForm from './pages/admin/SectionForm';
import AdminNotifications from './pages/admin/Notifications';
import AdminTermManagement from './pages/admin/TermManagement';
import AdminGradeComputationsList from './pages/admin/GradeComputationsList';
import AdminDepartmentsList from './pages/admin/DepartmentsList';
import AdminClassroomProvisioning from './pages/admin/ClassroomProvisioning';

// Dean Pages
import DeanDashboard from './pages/dean/Dashboard';
import DeanGradePostingStatus from './pages/dean/GradePostingStatus';
import DeanGradeDistribution from './pages/dean/GradeDistribution';
import DeanAtRiskStudents from './pages/dean/AtRiskStudents';
import DeanSummaryReports from './pages/dean/SummaryReports';
import DeanNotifications from './pages/dean/Notifications';
import DeanRemarkOverrideRequests from './pages/dean/RemarkOverrideRequests';

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
import FacultyConsultationRequests from './pages/faculty/ConsultationRequests';
import FacultyEnrollmentRequests from './pages/faculty/EnrollmentRequests';

// Student Pages
import StudentDashboard from './pages/student/Dashboard';
import StudentMySubjects from './pages/student/MySubjects';
import StudentMyGradesList from './pages/student/MyGradesList';
import StudentMyGradesDetail from './pages/student/MyGradesDetail';
import StudentAdvisingInbox from './pages/student/FacultyAdvisingInbox';
import StudentAcademicInsights from './pages/student/AcademicInsights';
import StudentNotifications from './pages/student/Notifications';
import StudentAttendance from './pages/student/Attendance';

// Shared Pages
import Settings from './pages/shared/Settings';
import NetworkBanner from './components/layout/NetworkBanner';
import React, { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';

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
              <Route path="/admin/gradeoverride" element={<AdminGradeOverride />} />
              <Route path="/admin/auditlog" element={<AdminAuditLog />} />
              <Route path="/admin/subjectlist" element={<AdminSubjectList />} />
              <Route path="/admin/subjectform" element={<AdminSubjectForm />} />
              <Route path="/admin/sectionlist" element={<AdminSectionList />} />
              <Route path="/admin/sectionform" element={<AdminSectionForm />} />
              <Route path="/admin/notifications" element={<AdminNotifications />} />
              <Route path="/admin/termmanagement" element={<AdminTermManagement />} />
              <Route path="/admin/gradecomputationslist" element={<AdminGradeComputationsList />} />
              <Route path="/admin/departmentslist" element={<AdminDepartmentsList />} />
              <Route path="/admin/classrooms" element={<AdminClassroomProvisioning />} />
              <Route path="/admin/settings" element={<Settings />} />
            </Route>

            {/* Dean Routes */}
            <Route element={<RoleGuard allowedRoles={['dean']} />}>
              <Route path="/dean/dashboard" element={<DeanDashboard />} />
              <Route path="/dean/gradepostingstatus" element={<DeanGradePostingStatus />} />
              <Route path="/dean/remarkoverriderequests" element={<DeanRemarkOverrideRequests />} />
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
              <Route path="/faculty/atriskstudents" element={<FacultyStudentRisk mode="risk" />} />
              <Route path="/faculty/evaluatestudent" element={<FacultyStudentRisk mode="evaluate" />} />
              <Route path="/faculty/consultations" element={<FacultyConsultationRequests />} />
              <Route path="/faculty/enrollmentrequests" element={<FacultyEnrollmentRequests />} />
              <Route path="/faculty/classattendance" element={<FacultyClassAttendance />} />
              <Route path="/faculty/notifications" element={<FacultyNotifications />} />
              <Route path="/faculty/settings" element={<Settings />} />
            </Route>

            {/* Student Routes */}
            <Route element={<RoleGuard allowedRoles={['student']} />}>
              <Route path="/student/dashboard" element={<StudentDashboard />} />
              <Route path="/student/mysubjects" element={<StudentMySubjects />} />
              <Route path="/student/mygradeslist" element={<StudentMyGradesList />} />
              <Route path="/student/mygradesdetail" element={<StudentMyGradesDetail />} />
              <Route path="/student/advising-inbox" element={<StudentAdvisingInbox />} />
              <Route path="/student/academic-insights" element={<StudentAcademicInsights />} />
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
    </AuthProvider>
  );
}

export default App;
