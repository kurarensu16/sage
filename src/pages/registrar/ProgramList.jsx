import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import ConfirmModal from '../../components/ConfirmModal';
import {
  Plus, Edit2, Trash2, Search, GraduationCap, Building2, AlertTriangle, Layers
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toUserMessage } from '../../lib/errorMessages';
import { useAuth } from '../../lib/AuthContext';
import { logActivity, resolveActorName } from '../../lib/auditLog';
import { cn } from '../../lib/utils';

// Degree programs. Net-new in the Admin/Registrar split: programs already
// existed in the data model and were read in a few places, but no page ever
// managed them.
//
// Note on deletion: nothing in the schema holds a foreign key to programs.
// A section's program is encoded only in its name (e.g. "BSIT-1A"), so the
// link cannot be verified by the database. The delete check below is therefore
// name-based and advisory -- it warns rather than claiming certainty.

export default function ProgramList() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [programs, setPrograms] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [collegeFilter, setCollegeFilter] = useState('all');
  const [pendingDelete, setPendingDelete] = useState(null);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [progRes, deptRes, secRes] = await Promise.all([
        supabase.from('programs').select('program_id, name, abbreviation, department_id').order('name'),
        supabase.from('departments').select('department_id, name').order('name'),
        supabase.from('sections').select('section_id, name, department_id')
      ]);
      if (progRes.error) throw progRes.error;
      if (deptRes.error) throw deptRes.error;
      if (secRes.error) throw secRes.error;
      setPrograms(progRes.data || []);
      setDepartments(deptRes.data || []);
      setSections(secRes.data || []);
    } catch (err) {
      setError(toUserMessage(err, 'Could not load programs.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const collegeName = useMemo(
    () => new Map(departments.map((d) => [d.department_id, d.name])),
    [departments]
  );

  // Advisory only -- see the note at the top of this file.
  const sectionCountFor = (program) => {
    const abbr = (program.abbreviation || '').toUpperCase();
    if (!abbr) return 0;
    return sections.filter((s) => (s.name || '').toUpperCase().startsWith(`${abbr}-`)).length;
  };

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return programs.filter((p) => {
      if (collegeFilter !== 'all' && p.department_id !== collegeFilter) return false;
      if (!term) return true;
      return (
        (p.name || '').toLowerCase().includes(term) ||
        (p.abbreviation || '').toLowerCase().includes(term) ||
        (collegeName.get(p.department_id) || '').toLowerCase().includes(term)
      );
    });
  }, [programs, search, collegeFilter, collegeName]);

  const confirmDelete = async () => {
    const program = pendingDelete;
    setPendingDelete(null);
    if (!program) return;
    try {
      const { error: delErr } = await supabase
        .from('programs')
        .delete()
        .eq('program_id', program.program_id);
      if (delErr) throw delErr;
      await logActivity(
        'Delete',
        `Deleted degree program ${program.abbreviation || program.name}.`,
        resolveActorName(profile, user)
      );
      load();
    } catch (err) {
      setError(toUserMessage(err, 'Could not delete this program.'));
    }
  };

  return (
    <>
      <PageHeader title="Degree Programs" breadcrumb="Registrar Portal">
        <Link
          to="/registrar/programform"
          className="px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-medium bg-sage-600 hover:bg-sage-700 text-white rounded-xl transition-all shadow-xs flex items-center gap-1.5 sm:gap-2 cursor-pointer whitespace-nowrap"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Add Program</span>
          <span className="sm:hidden">Add</span>
        </Link>
      </PageHeader>

      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-3.5 sm:space-y-6">
        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl px-3.5 py-3 text-xs sm:text-sm flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2.5 sm:gap-4">
          <div className="bg-white rounded-2xl border border-slate-200/90 p-3 sm:p-4 shadow-2xs flex items-center gap-3">
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-sage-50 text-sage-700 flex items-center justify-center flex-shrink-0">
              <GraduationCap className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider block truncate">Programs</span>
              <span className="text-base sm:text-2xl font-bold font-display text-slate-900 leading-tight">
                {loading ? '—' : programs.length}
              </span>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200/90 p-3 sm:p-4 shadow-2xs flex items-center gap-3">
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-sage-50 text-sage-700 flex items-center justify-center flex-shrink-0">
              <Building2 className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider block truncate">Colleges</span>
              <span className="text-base sm:text-2xl font-bold font-display text-slate-900 leading-tight">
                {loading ? '—' : departments.length}
              </span>
            </div>
          </div>
        </div>

        {/* ── Search + college filter ─────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search program, abbreviation, or college"
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

        {/* ── List ────────────────────────────────────────────────────────── */}
        {loading ? (
          <p className="text-xs text-slate-400">Loading programs…</p>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-8 flex flex-col items-center text-center">
            <GraduationCap className="h-8 w-8 text-slate-300 stroke-1 mb-2" />
            <p className="text-sm font-medium text-slate-600">No programs found</p>
            <p className="text-xs text-slate-400 mt-1">
              {programs.length === 0 ? 'Add the first degree program to get started.' : 'No program matches this filter.'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden divide-y divide-slate-100">
            {filtered.map((program) => {
              const secCount = sectionCountFor(program);
              return (
                <div key={program.program_id} className="p-3.5 sm:p-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-sage-50 text-sage-700 flex items-center justify-center flex-shrink-0 font-mono text-[11px] font-bold">
                    {program.abbreviation || '—'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-xs sm:text-sm font-semibold text-slate-900 truncate">{program.name}</h3>
                    <p className="text-[10px] sm:text-xs text-slate-500 truncate">
                      {collegeName.get(program.department_id) || 'No college assigned'}
                    </p>
                  </div>
                  {secCount > 0 && (
                    <span className="hidden sm:flex items-center gap-1 text-[10px] text-slate-400 flex-shrink-0">
                      <Layers className="h-3 w-3" />
                      <span className="font-mono tabular-nums">{secCount}</span> sections
                    </span>
                  )}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => navigate(`/registrar/programform?id=${program.program_id}`)}
                      className="p-2 text-slate-400 hover:text-sage-700 hover:bg-sage-50 rounded-lg transition-colors cursor-pointer"
                      title="Edit program"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setPendingDelete(program)}
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      title="Delete program"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className={cn('text-[10px] sm:text-xs text-slate-400 flex items-start gap-1.5')}>
          <AlertTriangle className="h-3.5 w-3.5 mt-px flex-shrink-0" />
          Sections reference a program through their name only (for example BSIT-1A), so the
          section count shown is matched by name and is advisory.
        </p>
      </div>

      <ConfirmModal
        isOpen={!!pendingDelete}
        title="Delete this program?"
        message={
          pendingDelete
            ? `${pendingDelete.name} will be removed. ${
                sectionCountFor(pendingDelete) > 0
                  ? `About ${sectionCountFor(pendingDelete)} section(s) appear to use this program's abbreviation in their name and will keep it.`
                  : 'No sections appear to use its abbreviation.'
              }`
            : ''
        }
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}
