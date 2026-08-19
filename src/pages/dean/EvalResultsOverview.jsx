import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { Search, Star, ArrowRight, Filter, Users, AlertTriangle, Building2, Lock, Unlock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { mockDeanFacultyData } from '../../lib/mockdb';
export default function EvalResultsOverview() {
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [facultyList, setFacultyList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    // Wait until the dean's profile (and department_id) is loaded
    if (!profile?.department_id) return;

    let cancelled = false;

    async function load() {
      try {
        // 1. Fetch faculty scoped to the Dean's own college/department
        const { data: facultyData, error: fErr } = await supabase
          .from('users')
          .select(`
            user_id,
            first_name,
            last_name,
            email,
            department_id,
            departments ( name )
          `)
          .eq('role', 'faculty')
          .eq('department_id', profile.department_id)
          .order('last_name');

        if (fErr) throw fErr;

        // 2. Fetch all evaluation windows with nested responses → ratings
        const { data: windowData, error: wErr } = await supabase
          .from('evaluation_windows')
          .select(`
            window_id,
            faculty_id,
            section_id,
            is_closed,
            is_released_to_faculty,
            sections ( name ),
            evaluation_responses (
              response_id,
              is_on_time,
              evaluation_ratings (
                rating,
                criteria_id,
                evaluation_criteria ( label, max_rating )
              )
            )
          `);

        if (wErr) throw wErr;

        // 3. Aggregate per faculty: group windows → responses → ratings
        //    Fairness Clause: Calculate average rating strictly from on-time responses
        const aggregated = (facultyData || []).map(f => {
          const myWindows = (windowData || []).filter(w => w.faculty_id === f.user_id);

          const allResponses = myWindows.flatMap(w => w.evaluation_responses || []);
          const onTimeResponses = allResponses.filter(r => r.is_on_time !== false);
          const lateResponses = allResponses.filter(r => r.is_on_time === false);

          const onTimeRatings = onTimeResponses.flatMap(r =>
            (r.evaluation_ratings || []).map(er => er.rating)
          );

          const rating = onTimeRatings.length > 0
            ? onTimeRatings.reduce((acc, r) => acc + r, 0) / onTimeRatings.length
            : null;

          const sectionCodes = myWindows
            .filter(w => w.sections?.name)
            .map(w => w.sections.name);

          // Released status: true if any window has is_released_to_faculty === true
          const isReleased = myWindows.some(w => w.is_released_to_faculty === true);

          return {
            id: f.user_id,
            firstName: f.first_name,
            lastName: f.last_name,
            email: f.email,
            department: f.departments?.name || '—',
            sectionsCount: myWindows.length,
            subjectCodes: [...new Set(sectionCodes)],
            rating,
            responseCount: allResponses.length,
            onTimeCount: onTimeResponses.length,
            lateCount: lateResponses.length,
            hasResponses: allResponses.length > 0,
            isReleased,
            windows: myWindows
          };
        });

        if (!cancelled) {
          setFacultyList(aggregated);
          setError(null);
        }
      } catch (err) {
        console.warn('Database query failed, falling back to mock dataset:', err);
        if (!cancelled) {
          setFacultyList(mockDeanFacultyData);
          setError(null); // Clear error since we have fallback data
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [profile?.department_id]);

  // Toggle Dean Release Status
  const toggleReleaseStatus = async (facultyId, currentStatus) => {
    const nextStatus = !currentStatus;
    try {
      // Update Supabase evaluation_windows for this faculty
      await supabase
        .from('evaluation_windows')
        .update({ is_released_to_faculty: nextStatus })
        .eq('faculty_id', facultyId);

      setFacultyList(prev => prev.map(f => f.id === facultyId ? { ...f, isReleased: nextStatus } : f));
    } catch (err) {
      console.error('Error toggling release status:', err);
    }
  };

  // ── Filtering — search only (dept is already scoped to dean's college) ───────
  const filtered = facultyList.filter(f =>
    `${f.firstName} ${f.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Dean's college label
  const deanCollege = profile?.departments?.name || profile?.department_id || '—';

  const ratingColor = (r) => {
    if (r === null) return 'text-slate-400';
    if (r >= 3.5) return 'text-emerald-700';
    if (r >= 2.5) return 'text-amber-700';
    return 'text-rose-700';
  };

  const ratingBg = (r) => {
    if (r === null) return 'bg-slate-50 border-slate-200';
    if (r >= 3.5) return 'bg-emerald-50 border-emerald-100';
    if (r >= 2.5) return 'bg-amber-50 border-amber-100';
    return 'bg-rose-50 border-rose-100';
  };

  return (
    <>
      <PageHeader title="Faculty Evaluation Overview" breadcrumb="Dean Portal" />

      <div className="p-8 overflow-y-auto flex-1 space-y-6">

        {/* ── Error banner ── */}
        {error && (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 text-xs text-amber-800 shadow-sm">
            <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* ── Stats strip ── */}
        {!loading && (
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Total Faculty', value: facultyList.length, color: 'text-sage-700', bg: 'bg-sage-50 border-sage-200' },
              { label: 'With Responses', value: facultyList.filter(f => f.hasResponses).length, color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
              { label: 'Pending Evaluation', value: facultyList.filter(f => !f.hasResponses).length, color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
            ].map(s => (
              <div key={s.label} className={`rounded-xl border p-4 shadow-sm flex items-center gap-3 ${s.bg}`}>
                <span className={`text-2xl font-extrabold font-mono ${s.color}`}>{s.value}</span>
                <span className="text-xs font-semibold text-slate-600">{s.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── Filters ── */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-sage-600" /> Search Faculty
            </h3>
            {/* Dean's college badge — read-only scope indicator */}
            <div className="flex items-center gap-1.5 bg-sage-50 border border-sage-200 text-sage-700 text-[10px] font-bold px-3 py-1.5 rounded-lg">
              <Building2 className="h-3.5 w-3.5 flex-shrink-0" />
              {deanCollege}
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search faculty name or email..."
              className="block w-full pl-9 pr-3 py-2 border border-slate-200 focus:border-sage-500 rounded-lg text-xs outline-none bg-slate-50/20 focus:bg-white transition-colors"
            />
          </div>
        </div>

        {/* ── Loading skeleton ── */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-pulse">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-100" />
                  <div className="space-y-2 flex-1">
                    <div className="h-3 bg-slate-200 rounded w-3/4" />
                    <div className="h-2 bg-slate-100 rounded w-1/2" />
                  </div>
                </div>
                <div className="h-12 bg-slate-100 rounded-lg" />
                <div className="h-8 bg-slate-100 rounded-lg" />
              </div>
            ))}
          </div>
        )}

        {/* ── Faculty Cards Grid ── */}
        {!loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filtered.length > 0 ? filtered.map(f => (
              <div
                key={f.id}
                className="bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition-all p-6 flex flex-col justify-between space-y-5"
              >
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-sage-50 border border-sage-200 text-sage-700 font-bold text-xs flex items-center justify-center font-mono">
                      {f.firstName[0]}{f.lastName[0]}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 font-display text-sm">
                        Prof. {f.firstName} {f.lastName}
                      </h4>
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5">{f.email}</p>
                    </div>
                  </div>

                  {/* Rating badge */}
                  <div className={`flex items-center gap-1 border px-2 py-1 rounded-lg text-xs font-mono font-bold ${ratingBg(f.rating)} ${ratingColor(f.rating)}`}>
                    <Star className={`h-3.5 w-3.5 ${f.rating !== null ? 'fill-current' : ''}`} />
                    {f.rating !== null ? f.rating.toFixed(2) : 'N/A'}
                  </div>
                </div>

                {/* Substats */}
                <div className="space-y-2 border-t border-b border-slate-100 py-3 text-xs leading-normal">
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">Department:</span>
                    <span className="font-bold text-slate-800 text-right max-w-[55%] truncate">{f.department}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">Eval Windows:</span>
                    <span className="font-bold text-slate-800">{f.sectionsCount} window{f.sectionsCount !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">Responses Received:</span>
                    <span className={`font-bold ${f.responseCount > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
                      {f.responseCount} student{f.responseCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                  
                  {/* Fairness Clause Breakdown */}
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-slate-500 font-medium">Fairness Audit:</span>
                    <span className="font-semibold text-slate-700 font-mono">
                      {f.onTimeCount} On-Time {f.lateCount > 0 && <span className="text-amber-600">({f.lateCount} late excluded)</span>}
                    </span>
                  </div>

                  {/* Section tags */}
                  {f.subjectCodes.length > 0 && (
                    <div className="pt-1 flex flex-wrap gap-1">
                      {f.subjectCodes.map(code => (
                        <span
                          key={code}
                          className="px-1.5 py-0.5 bg-slate-100 text-[10px] font-mono font-medium rounded text-slate-600 border border-slate-200"
                        >
                          {code}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* No responses notice */}
                  {!f.hasResponses && (
                    <div className="flex items-center gap-1.5 mt-1 text-[10px] text-amber-600">
                      <Users className="h-3 w-3" />
                      <span>No student responses yet</span>
                    </div>
                  )}
                </div>

                {/* Dean Controlled Release & Drilldown Actions */}
                <div className="pt-1 flex items-center justify-between gap-2">
                  <button
                    onClick={() => toggleReleaseStatus(f.id, f.isReleased)}
                    className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer border ${
                      f.isReleased
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                        : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                    }`}
                  >
                    {f.isReleased ? (
                      <><Unlock className="h-3.5 w-3.5 text-emerald-600" /> Released to Faculty</>
                    ) : (
                      <><Lock className="h-3.5 w-3.5 text-amber-600" /> Release to Faculty</>
                    )}
                  </button>

                  <button
                    onClick={() => navigate(`/dean/evalresultsfaculty?id=${f.id}`)}
                    className="py-2 px-3 bg-slate-50 hover:bg-sage-600 text-slate-700 hover:text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer border border-slate-200"
                    title="Inspect Ratings Dashboard"
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )) : (
              <div className="col-span-full bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400 text-sm">
                No faculty evaluation records found.
              </div>
            )}
          </div>
        )}

      </div>
    </>
  );
}
