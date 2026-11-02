import { useState, useEffect, useMemo } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import { Users, Search, Eye, AlertTriangle, Info } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toUserMessage } from '../../lib/errorMessages';
import { cn } from '../../lib/utils';

const PAGE_SIZE = 1000;
const ROLE_TABS = ['all', 'student', 'faculty', 'dean', 'registrar', 'admin'];

// Read-only user directory for the Registrar.
//
// Deliberately has no create, edit, or deactivate control: account management is
// Admin's alone, and the database agrees -- users_insert_admin and
// users_update_self_or_admin admit only an admin (or the row owner), with no
// registrar branch. So even if a control were added here by mistake, the write
// would be refused at the RLS layer rather than silently succeeding.
//
// Column scope is full parity with Admin's Manage Users list, per the confirmed
// decision. The one registrar-writable slice of this data -- a student's home
// section, year level, and college -- is edited in Enrollment Management, which
// routes through registrar_set_student_records.

export default function ViewUsers() {
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleTab, setRoleTab] = useState('all');
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      try {
        const [deptRes, secRes] = await Promise.all([
          supabase.from('departments').select('department_id, name'),
          supabase.from('sections').select('section_id, name')
        ]);
        if (deptRes.error) throw deptRes.error;
        if (secRes.error) throw secRes.error;
        setDepartments(deptRes.data || []);
        setSections(secRes.data || []);

        // Paginated: PostgREST caps responses at 1000 rows, which would quietly
        // hide part of the directory.
        const rows = [];
        for (let from = 0; ; from += PAGE_SIZE) {
          const { data, error: uErr } = await supabase
            .from('users')
            .select('user_id, user_number, first_name, middle_name, last_name, email, role, status, department_id, section_id, year_level')
            .order('last_name')
            .range(from, from + PAGE_SIZE - 1);
          if (uErr) throw uErr;
          const page = data || [];
          rows.push(...page);
          if (page.length < PAGE_SIZE) break;
        }
        setUsers(rows);
      } catch (err) {
        setError(toUserMessage(err, 'Could not load the user directory.'));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const collegeName = useMemo(
    () => new Map(departments.map((d) => [d.department_id, d.name])),
    [departments]
  );
  const sectionName = useMemo(
    () => new Map(sections.map((s) => [s.section_id, s.name])),
    [sections]
  );

  const counts = useMemo(() => {
    const out = { all: users.length };
    for (const role of ROLE_TABS.slice(1)) {
      out[role] = users.filter((u) => u.role === role).length;
    }
    return out;
  }, [users]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleTab !== 'all' && u.role !== roleTab) return false;
      if (!term) return true;
      return (
        `${u.last_name || ''} ${u.first_name || ''} ${u.middle_name || ''}`.toLowerCase().includes(term) ||
        (u.email || '').toLowerCase().includes(term) ||
        (u.user_number || '').toLowerCase().includes(term)
      );
    });
  }, [users, search, roleTab]);

  const statusTone = (status) =>
    (status || 'active') === 'active'
      ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
      : status === 'archived'
        ? 'text-slate-600 bg-slate-50 border-slate-200'
        : 'text-amber-700 bg-amber-50 border-amber-200';

  return (
    <>
      <PageHeader title="View Users" breadcrumb="Registrar Portal" />

      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-3.5 sm:space-y-6">
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-[11px] sm:text-xs text-slate-600 flex items-start gap-2">
          <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>
            Read-only. Accounts are created, edited, and deactivated by an administrator. To change
            a student's home section, year level, or college, use{' '}
            <strong>Student Records → Enrollment Management</strong>.
          </span>
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl px-3.5 py-3 text-xs sm:text-sm flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-200/90 p-3 sm:p-4 shadow-2xs flex items-center gap-3">
          <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-sage-50 text-sage-700 flex items-center justify-center flex-shrink-0">
            <Users className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider block truncate">
              Accounts
            </span>
            <span className="text-base sm:text-2xl font-bold font-display text-slate-900 leading-tight">
              {loading ? '—' : counts.all.toLocaleString()}
            </span>
          </div>
        </div>

        {/* ── Role tabs ───────────────────────────────────────────────────── */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {ROLE_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setRoleTab(tab)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap capitalize cursor-pointer',
                roleTab === tab
                  ? 'bg-sage-600 text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              )}
            >
              {tab}
              {!loading && (
                <span className="ml-1.5 font-mono tabular-nums opacity-70">{counts[tab] ?? 0}</span>
              )}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, or ID number"
            className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm bg-white border border-slate-200 rounded-xl outline-none focus:border-sage-400"
          />
        </div>

        {/* ── Directory ───────────────────────────────────────────────────── */}
        {loading ? (
          <p className="text-xs text-slate-400">Loading directory…</p>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-8 flex flex-col items-center text-center">
            <Eye className="h-8 w-8 text-slate-300 stroke-1 mb-2" />
            <p className="text-sm font-medium text-slate-600">No accounts match this filter</p>
          </div>
        ) : (
          <>
            <p className="text-[10px] sm:text-xs text-slate-400">
              Showing <span className="font-mono tabular-nums">{Math.min(filtered.length, 200).toLocaleString()}</span>
              {filtered.length > 200 && <> of <span className="font-mono tabular-nums">{filtered.length.toLocaleString()}</span></>}
            </p>
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden divide-y divide-slate-100">
              {filtered.slice(0, 200).map((u) => (
                <div key={u.user_id} className="p-3.5 sm:p-4 flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-xs sm:text-sm font-semibold text-slate-900 truncate">
                        {u.last_name}, {u.first_name} {u.middle_name || ''}
                      </h3>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-sage-700 bg-sage-50 border border-sage-200 px-1.5 py-0.5 rounded">
                        {u.role}
                      </span>
                      <span
                        className={cn(
                          'text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border',
                          statusTone(u.status)
                        )}
                      >
                        {u.status || 'active'}
                      </span>
                    </div>
                    <p className="text-[10px] sm:text-xs text-slate-500 truncate mt-0.5">
                      <span className="font-mono">{u.user_number || '—'}</span>
                      {u.email && <span className="ml-2">{u.email}</span>}
                    </p>
                    <p className="text-[10px] sm:text-xs text-slate-400 truncate mt-0.5">
                      {collegeName.get(u.department_id) || 'No college'}
                      {u.section_id && <> · <span className="font-mono">{sectionName.get(u.section_id) || 'unknown section'}</span></>}
                      {u.year_level && <> · {u.year_level}</>}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            {filtered.length > 200 && (
              <p className="text-[10px] sm:text-xs text-slate-400">
                Showing the first 200. Narrow the search or role filter to reach the rest.
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}
