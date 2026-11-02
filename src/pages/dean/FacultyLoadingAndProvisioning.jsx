import FacultyLoadingWorkspace from '../../components/provisioning/FacultyLoadingWorkspace';
import { useAuth } from '../../lib/AuthContext';

// Dean's faculty loading: fixed to their own college, with no college picker.
//
// The scope is passed in explicitly rather than resolved inside the shared
// workspace. The database enforces the same boundary regardless --
// can_load_faculty_for_department() admits a dean only for their own college --
// so a bug here cannot widen a dean's reach.
export default function DeanFacultyLoading() {
  const { profile } = useAuth();

  return (
    <FacultyLoadingWorkspace
      canChooseCollege={false}
      fixedDepartmentId={profile?.department_id || null}
      portalLabel="Dean Portal"
    />
  );
}
