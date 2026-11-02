import FacultyLoadingWorkspace from '../../components/provisioning/FacultyLoadingWorkspace';

// Registrar's faculty loading: institution-wide, so the college is chosen here.
//
// A separate page file from the Dean's on purpose. Scope is declared explicitly
// by each page rather than inferred from the signed-in role inside one shared
// component -- role-sniffing is what makes a scoping bug invisible.
export default function RegistrarFacultyLoading() {
  return (
    <FacultyLoadingWorkspace
      canChooseCollege
      portalLabel="Registrar Portal"
    />
  );
}
