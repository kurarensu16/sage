import { useState, useEffect, useMemo } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import {
  Users, Search, Save, AlertTriangle, CheckCircle2, Layers, UserX, Filter, Shuffle
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toUserMessage } from '../../lib/errorMessages';
import { useAuth } from '../../lib/AuthContext';
import { logActivity, resolveActorName } from '../../lib/auditLog';
import { cn } from '../../lib/utils';

const YEAR_LEVELS = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
const PAGE_SIZE = 1000;

// Enrollment Management: assigns a student's home section, year level, and
// college. Net-new -- no page has ever managed student records directly; today
// the only way to set a home section is Admin's Manage Users form.
//
// Writes go through registrar_set_student_records (SECURITY DEFINER), never a
// direct table write: public.users RLS admits only the row owner or an admin,
// and that boundary is deliberately left intact. The RPC fixes the writable
// column set to section_id / year_level / department_id and refuses any
// non-student target, so this page cannot touch a role, a status, or a staff row.
//
// On "Irregular": getEnrollmentType() reports a student with no block section as
// Irregular in every class they appear in. At DYCI that is a legitimate student
// category, not a missing record -- irregular students genuinely have no block.
// So the count below is informational and a filter, and is deliberately NOT
// listed among the dashboard's Records Integrity items, which are work to clear.
// Assign a block section here only when a student should in fact be regular.

export default function EnrollmentManagement() {
  const { user, profile } = useAuth();
  const [students, setStudents] = useState([]);
  const [sections, setSections] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  // 'all' | 'irregular' (no block section) | 'offblock' (has a block but takes a
  // subject outside it). Those are two different things and the page says so.
  const [focus, setFocus] = useState('all');
  const [offBlockIds, setOffBlockIds] = useState(() => new Set());
  const [collegeFilter, setCollegeFilter] = useState('all');
  const [edits, setEdits] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [secRes, deptRes] = await Promise.all([
        supabase.from('sections').select('section_id, name, department_id').order('name'),
        supabase.from('departments').select('department_id, name').order('name')
      ]);
      if (secRes.error) throw secRes.error;
      if (deptRes.error) throw deptRes.error;
      setSections(secRes.data || []);
      setDepartments(deptRes.data || []);

      // Paginated: PostgREST caps a response at 1000 rows, and a silent
      // truncation here would hide exactly the unassigned students this page
      // exists to find.
      const rows = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error: sErr } = await supabase
          .from('users')
          .select('user_id, first_name, last_name, user_number, section_id, year_level, department_id, status')
          .eq('role', 'student')
          .order('last_name')
          .range(from, from + PAGE_SIZE - 1);
        if (sErr) throw sErr;
        const page = data || [];
        rows.push(...page);
        if (page.length < PAGE_SIZE) break;
      }
      setStudents(rows);

      // Off-block: students who DO have a block section but are enrolled in at
      // least one class belonging to a different section. Distinct from the
      // Irregular count above, which is students with no block at all. Both are
      // normal; they just mean different things, so they are counted separately
      // rather than lumped together.
      const homeById = new Map(rows.map((s) => [s.user_id, s.section_id]));
      const offBlock = new Set();
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error: eErr } = await supabase
          .from('enrollments')
          .select('student_id, section_id')
          .range(from, from + PAGE_SIZE - 1);
        if (eErr) throw eErr;
        const page = data || [];
        for (const row of page) {
          const home = homeById.get(row.student_id);
          if (home && row.section_id && home !== row.section_id) offBlock.add(row.student_id);
        }
        if (page.length < PAGE_SIZE) break;
      }
      setOffBlockIds(offBlock);
    } catch (err) {
      setError(toUserMessage(err, 'Could not load students.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const sectionById = useMemo(() => new Map(sections.map((s) => [s.section_id, s])), [sections]);
  const collegeName = useMemo(
    () => new Map(departments.map((d) => [d.department_id, d.name])),
    [departments]
  );

  const unassignedCount = useMemo(
    () => students.filter((s) => !s.section_id && (s.status || 'active') === 'active').length,
    [students]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return students.filter((s) => {
      if (focus === 'irregular' && s.section_id) return false;
      if (focus === 'offblock' && !offBlockIds.has(s.user_id)) return false;
      if (collegeFilter !== 'all' && s.department_id !== collegeFilter) return false;
      if (!term) return true;
      const name = `${s.last_name || ''} ${s.first_name || ''}`.toLowerCase();
      return name.includes(term) || (s.user_number || '').toLowerCase().includes(term);
    });
  }, [students, search, focus, offBlockIds, collegeFilter]);

  const editFor = (student) => ({
    sectionId: edits[student.user_id]?.sectionId ?? (student.section_id || ''),
    yearLevel: edits[student.user_id]?.yearLevel ?? (student.year_level || ''),
    departmentId: edits[student.user_id]?.departmentId ?? (student.department_id || '')
  });

  const isDirty = (student) => {
    const e = editFor(student);
    return (
      e.sectionId !== (student.section_id || '') ||
      e.yearLevel !== (student.year_level || '') ||
      e.departmentId !== (student.department_id || '')
    );
  };

  // Only the changed keys are stored; editFor() falls back to the student's
  // saved values for anything absent.
  const setEdit = (studentId, patch) => {
    setEdits((prev) => ({ ...prev, [studentId]: { ...prev[studentId], ...patch } }));
  };

  // Choosing a section implies its college, so keep the two consistent rather
  // than letting the RPC reject the pair.
  const onSectionChange = (student, sectionId) => {
    const section = sectionById.get(sectionId);
    setEdit(student.user_id, {
      sectionId,
      departmentId: section?.department_id || editFor(student).departmentId
    });
  };

  const save = async (student) => {
    setSavingId(student.user_id);
    setError('');
    setNotice('');
    const e = editFor(student);
    try {
      const { error: rpcErr } = await supabase.rpc('registrar_set_student_records', {
        p_student_id: student.user_id,
        p_section_id: e.sectionId || null,
        p_year_level: e.yearLevel || null,
        p_department_id: e.departmentId || null
      });
      if (rpcErr) throw rpcErr;

      await logActivity(
        'Update',
        `Set student records for ${student.user_number || student.user_id}: section ${
          sectionById.get(e.sectionId)?.name || 'none'
        }, ${e.yearLevel || 'no year level'}.`,
        resolveActorName(profile, user)
      );

      setStudents((prev) =>
        prev.map((s) =>
          s.user_id === student.user_id
            ? { ...s, section_id: e.sectionId || null, year_level: e.yearLevel || null, department_id: e.departmentId || null }
            : s
        )
      );
      setEdits((prev) => {
        const next = { ...prev };
        delete next[student.user_id];
        return next;
      });
      setNotice(`Saved ${student.last_name}, ${student.first_name}.`);
    } catch (err) {
      setError(toUserMessage(err, 'Could not save this student.'));
    } finally {
      setSavingId(null);
    }
  };

  const sectionOptions = useMemo(() => {
    const e = collegeFilter;
    if (e === 'all') return sections;
    return sections.filter((s) => s.department_id === e);
  }, [sections, collegeFilter]);

  return (
    <>
      <PageHeader title="Enrollment Management" breadcrumb="Registrar Portal" />

      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-3.5 sm:space-y-6">
        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl px-3.5 py-3 text-xs sm:text-sm flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {notice && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-3.5 py-3 text-xs sm:text-sm flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{notice}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-4">
          <div className="bg-white rounded-2xl border border-slate-200/90 p-3 sm:p-4 shadow-2xs flex items-center gap-3">
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-sage-50 text-sage-700 flex items-center justify-center flex-shrink-0">
              <Users className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider block truncate">Students</span>
              <span className="text-base sm:text-2xl font-bold font-display text-slate-900 leading-tight">
                {loading ? '—' : students.length.toLocaleString()}
              </span>
            </div>
          </div>
          <button
            onClick={() => setFocus((v) => (v === 'irregular' ? 'all' : 'irregular'))}
            className={cn(
              'bg-white rounded-2xl border p-3 sm:p-4 shadow-2xs flex items-center gap-3 text-left transition-colors cursor-pointer',
              focus === 'irregular' ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200/90 hover:border-amber-200'
            )}
          >
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center flex-shrink-0">
              <UserX className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider block truncate">
                Irregular
              </span>
              <span className="text-base sm:text-2xl font-bold font-display text-slate-900 leading-tight">
                {loading ? '—' : unassignedCount.toLocaleString()}
              </span>
              <span className="text-[10px] text-slate-400 block truncate">
                {focus === 'irregular' ? 'Filtering — tap to clear' : 'No block section'}
              </span>
            </div>
          </button>

          {/* Distinct from Irregular: these students DO have a block, but take at
              least one subject outside it. Counted separately because the two
              mean different things operationally. */}
          <button
            onClick={() => setFocus((v) => (v === 'offblock' ? 'all' : 'offblock'))}
            className={cn(
              'bg-white rounded-2xl border p-3 sm:p-4 shadow-2xs flex items-center gap-3 text-left transition-colors cursor-pointer',
              focus === 'offblock' ? 'border-indigo-300 bg-indigo-50/40' : 'border-slate-200/90 hover:border-indigo-200'
            )}
          >
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center flex-shrink-0">
              <Shuffle className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider block truncate">
                Off-block
              </span>
              <span className="text-base sm:text-2xl font-bold font-display text-slate-900 leading-tight">
                {loading ? '—' : offBlockIds.size.toLocaleString()}
              </span>
              <span className="text-[10px] text-slate-400 block truncate">
                {focus === 'offblock' ? 'Filtering — tap to clear' : 'Takes a subject outside their block'}
              </span>
            </div>
          </button>
        </div>

        <div className="bg-sage-50 border border-sage-200 rounded-xl px-3.5 py-2.5 text-[11px] sm:text-xs text-sage-900 flex items-start gap-2">
          <Filter className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>
            An <strong>irregular</strong> student has no block section, so they are reported
            Irregular in every class — enrollment type is derived by comparing a student's home
            section to the class's section. This is a normal category, not a backlog. Assign a
            block section here only if the student should in fact be regular.
          </span>
        </div>

        {/* ── Filters ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or student number"
              className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm bg-white border border-slate-200 rounded-xl outline-none focus:border-sage-400"
            />
          </div>
          <select
            value={collegeFilter}
            onChange={(e) => setCollegeFilter(e.target.value)}
            className="px-3 py-2 text-xs sm:text-sm bg-white border border-slate-200 rounded-xl outline-none focus:border-sage-400 cursor-pointer"
          >
            <option value="all">All colleges</option>
            {departments.map((d) => (
              <option key={d.department_id} value={d.department_id}>{d.name}</option>
            ))}
          </select>
        </div>

        {/* ── Students ────────────────────────────────────────────────────── */}
        {loading ? (
          <p className="text-xs text-slate-400">Loading students…</p>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-8 flex flex-col items-center text-center">
            <Users className="h-8 w-8 text-slate-300 stroke-1 mb-2" />
            <p className="text-sm font-medium text-slate-600">No students match this filter</p>
          </div>
        ) : (
          <>
            <p className="text-[10px] sm:text-xs text-slate-400">
              Showing <span className="font-mono tabular-nums">{filtered.length.toLocaleString()}</span> student(s)
            </p>
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden divide-y divide-slate-100">
              {filtered.slice(0, 200).map((student) => {
                const e = editFor(student);
                const dirty = isDirty(student);
                return (
                  <div key={student.user_id} className="p-3.5 sm:p-4 space-y-2.5">
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-xs sm:text-sm font-semibold text-slate-900 truncate">
                          {student.last_name}, {student.first_name}
                        </h3>
                        <p className="text-[10px] sm:text-xs text-slate-500 truncate font-mono">
                          {student.user_number || 'No student number'}
                          {!student.section_id && (
                            <span className="ml-2 font-sans text-amber-600 font-semibold">Irregular</span>
                          )}
                        </p>
                      </div>
                      {dirty && (
                        <button
                          onClick={() => save(student)}
                          disabled={savingId === student.user_id}
                          className="px-3 py-1.5 text-xs font-medium bg-sage-600 hover:bg-sage-700 text-white rounded-lg transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 flex-shrink-0"
                        >
                          <Save className="h-3.5 w-3.5" />
                          {savingId === student.user_id ? 'Saving…' : 'Save'}
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <select
                        value={e.departmentId}
                        onChange={(ev) => setEdit(student.user_id, { departmentId: ev.target.value })}
                        className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg outline-none focus:border-sage-400 cursor-pointer"
                      >
                        <option value="">No college</option>
                        {departments.map((d) => (
                          <option key={d.department_id} value={d.department_id}>{d.name}</option>
                        ))}
                      </select>

                      <select
                        value={e.sectionId}
                        onChange={(ev) => onSectionChange(student, ev.target.value)}
                        className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg outline-none focus:border-sage-400 cursor-pointer font-mono"
                      >
                        <option value="">No block section (irregular)</option>
                        {(e.departmentId
                          ? sections.filter((s) => s.department_id === e.departmentId)
                          : sectionOptions
                        ).map((s) => (
                          <option key={s.section_id} value={s.section_id}>{s.name}</option>
                        ))}
                      </select>

                      <select
                        value={e.yearLevel}
                        onChange={(ev) => setEdit(student.user_id, { yearLevel: ev.target.value })}
                        className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg outline-none focus:border-sage-400 cursor-pointer"
                      >
                        <option value="">No year level</option>
                        {YEAR_LEVELS.map((y) => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                    </div>

                    {student.section_id && (
                      <p className="text-[10px] text-slate-400 flex items-center gap-1">
                        <Layers className="h-3 w-3" />
                        Currently {sectionById.get(student.section_id)?.name || 'unknown section'}
                        {student.department_id && ` · ${collegeName.get(student.department_id) || ''}`}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            {filtered.length > 200 && (
              <p className="text-[10px] sm:text-xs text-slate-400">
                Showing the first 200. Narrow the search or college filter to reach the rest.
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}
