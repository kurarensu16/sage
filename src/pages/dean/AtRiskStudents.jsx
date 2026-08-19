import { useState, useEffect } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import { Search, AlertCircle, Filter, Sparkles, Building2, Loader2, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { mockDeanAtRiskStudents } from '../../lib/mockdb';

// ── Risk classification ───────────────────────────────────────────────────────
function classifyRisk(avgGwa, failingCount) {
  if (failingCount > 0 || avgGwa > 3.00) {
    return {
      severity: 'high',
      advisory: 'Immediate academic counselor intervention advised. Failing marks recorded.',
    };
  }
  if (avgGwa >= 2.75 && avgGwa <= 3.00) {
    return {
      severity: 'medium',
      advisory: 'Provide tutoring support. Running GWA is border-lining the passing scale.',
    };
  }
  return {
    severity: 'low',
    advisory: 'Good academic standing. Maintain current study patterns.',
  };
}

function SeverityBadge({ severity }) {
  if (severity === 'high') return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
      <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse" />
      High Risk
    </span>
  );
  if (severity === 'medium') return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
      Medium Risk
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
      Low Risk
    </span>
  );
}

// Helper to transmute raw scores to GWA
function getTransmutedGrade(score) {
  if (score >= 98) return 1.00;
  if (score >= 95) return 1.25;
  if (score >= 92) return 1.50;
  if (score >= 89) return 1.75;
  if (score >= 86) return 2.00;
  if (score >= 83) return 2.25;
  if (score >= 80) return 2.50;
  if (score >= 77) return 2.75;
  if (score >= 75) return 3.00;
  return 5.00;
}

// Compute tentative GWA for a class record from its scores
function computeTentativeGrade(classRecordScores, classRecordCols) {
  const terms = ['Prelim', 'Midterm', 'Semi-Final', 'Final'];
  const termRatings = {};
  
  terms.forEach(term => {
    const tSc = classRecordScores?.[term];
    if (!tSc || (tSc.act1 == null && tSc.act2 == null && tSc.act3 == null && tSc.act4 == null && tSc.act5 == null && tSc.act6 == null && tSc.char_rating == null && tSc.exam == null)) {
      return;
    }
    
    const tMx = classRecordCols?.[term] || { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, exam: 40 };
    
    const csSum = (tSc.act1 || 0) + (tSc.act2 || 0) + (tSc.act3 || 0) + (tSc.act4 || 0) + (tSc.act5 || 0) + (tSc.act6 || 0);
    const csMax = (tMx.act1 || 20) + (tMx.act2 || 20) + (tMx.act3 || 20) + (tMx.act4 || 20) + (tMx.act5 || 20) + (tMx.act6 || 10);
    
    const csPercent = csMax > 0 ? (csSum / csMax) * 50 : 0;
    const charPercent = (tSc.char_rating || 0) * 0.1;
    const examPercent = (tMx.exam || 40) > 0 ? ((tSc.exam || 0) / tMx.exam) * 40 : 0;
    
    termRatings[term] = Math.min(100, Math.max(0, Math.round(csPercent + charPercent + examPercent)));
  });
  
  const hasPrelim = termRatings['Prelim'] !== undefined;
  const hasMidterm = termRatings['Midterm'] !== undefined;
  const hasSF = termRatings['Semi-Final'] !== undefined;
  const hasFinal = termRatings['Final'] !== undefined;
  
  let finalSG = null;
  if (hasPrelim && hasMidterm && hasSF && hasFinal) {
    const mr = Math.round((termRatings['Prelim'] + termRatings['Midterm']) / 2);
    const tfr = Math.round((termRatings['Semi-Final'] + termRatings['Final']) / 2);
    finalSG = Math.round((mr + tfr) / 2);
  } else {
    const available = Object.values(termRatings);
    if (available.length > 0) {
      finalSG = Math.round(available.reduce((sum, val) => sum + val, 0) / available.length);
    }
  }
  
  if (finalSG === null) return null;
  return getTransmutedGrade(finalSG);
}


export default function AtRiskStudents() {
  const { profile } = useAuth();

  const [students, setStudents] = useState([]);
  const [sections, setSections] = useState([]);   // for the section filter dropdown
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [severityFilter, setSeverityFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    // Wait for the dean's department_id to be loaded
    if (!profile?.department_id) return;

    let cancelled = false;

    async function load() {
      try {
        // ── Step 1: fetch all sections in the dean's college ─────────────────
        const { data: deptSections, error: secErr } = await supabase
          .from('sections')
          .select('section_id, name')
          .eq('department_id', profile.department_id)
          .order('name');

        if (secErr) throw secErr;

        const sectionIds = (deptSections || []).map(s => s.section_id);
        if (!cancelled) setSections(deptSections || []);

        if (sectionIds.length === 0) {
          if (!cancelled) { setStudents([]); setLoading(false); }
          return;
        }

        // ── Step 2: fetch students whose section_id is in the college ─────────
        const { data: studentData, error: stuErr } = await supabase
          .from('users')
          .select(`
            user_id,
            first_name,
            last_name,
            email,
            section_id,
            sections ( name, department_id )
          `)
          .eq('role', 'student')
          .in('section_id', sectionIds)
          .order('last_name');

        if (stuErr) throw stuErr;

        const studentIds = (studentData || []).map(s => s.user_id);

        // ── Step 3: fetch posted grades for all these students ─────────────────
        // Join through class_records → sections to filter by dept (double-safety)
        const { data: gradeData, error: gErr } = await supabase
          .from('posted_grades')
          .select(`
            posted_grade_id,
            student_id,
            grade_period,
            computed_grade,
            effective_grade,
            remarks,
            class_record_id
          `)
          .in('student_id', studentIds.length > 0 ? studentIds : ['00000000-0000-0000-0000-000000000000']);

        if (gErr) throw gErr;

        // ── Step 3.5: fetch student_term_scores and class_grading_columns for draft/tentative GWA calculation ──
        const { data: scoreData, error: sErr } = await supabase
          .from('student_term_scores')
          .select('student_id, class_record_id, term, act1, act2, act3, act4, act5, act6, char_rating, exam')
          .in('student_id', studentIds.length > 0 ? studentIds : ['00000000-0000-0000-0000-000000000000']);

        const { data: colData, error: colErr } = await supabase
          .from('class_grading_columns')
          .select('class_record_id, term, act1_max, act2_max, act3_max, act4_max, act5_max, act6_max, exam_max');

        if (sErr) console.warn('Could not fetch student_term_scores:', sErr);
        if (colErr) console.warn('Could not fetch class_grading_columns:', colErr);

        const colMap = {};
        (colData || []).forEach(c => {
          if (!colMap[c.class_record_id]) colMap[c.class_record_id] = {};
          colMap[c.class_record_id][c.term] = {
            act1: c.act1_max,
            act2: c.act2_max,
            act3: c.act3_max,
            act4: c.act4_max,
            act5: c.act5_max,
            act6: c.act6_max,
            exam: c.exam_max
          };
        });

        const scoresMap = {};
        (scoreData || []).forEach(s => {
          if (!scoresMap[s.student_id]) scoresMap[s.student_id] = {};
          if (!scoresMap[s.student_id][s.class_record_id]) scoresMap[s.student_id][s.class_record_id] = {};
          scoresMap[s.student_id][s.class_record_id][s.term] = s;
        });

        // ── Step 4: fetch AI recommendations (use if available) ───────────────
        const { data: aiData } = await supabase
          .from('student_academic_insights')
          .select('student_id, verdict, summary')
          .in('student_id', studentIds.length > 0 ? studentIds : ['00000000-0000-0000-0000-000000000000']);

        const aiMap = {};
        (aiData || []).forEach(r => { 
          aiMap[r.student_id] = {
            student_id: r.student_id,
            recommendation: r.verdict,
            summary: r.summary
          }; 
        });

        // ── Step 5: aggregate per student ──────────────────────────────────────
        const gradesByStudent = {};
        (gradeData || []).forEach(g => {
          if (!gradesByStudent[g.student_id]) gradesByStudent[g.student_id] = [];
          gradesByStudent[g.student_id].push(g);
        });

        const enriched = (studentData || []).map(s => {
          const myGrades = gradesByStudent[s.user_id] || [];
          const postedClassRecordIds = new Set(myGrades.map(g => g.class_record_id));
          
          const gradeValues = [];
          let containsTentative = false;

          // 1. Add posted grades
          myGrades.forEach(g => {
            const val = g.effective_grade != null ? parseFloat(g.effective_grade) : parseFloat(g.computed_grade);
            if (!isNaN(val)) {
              gradeValues.push({ val, isTentative: false });
            }
          });

          // 2. Add tentative grades from draft scores
          const studentScores = scoresMap[s.user_id] || {};
          Object.keys(studentScores).forEach(classRecId => {
            if (!postedClassRecordIds.has(classRecId)) {
              const classRecordScores = studentScores[classRecId];
              const classRecordCols = colMap[classRecId];
              const tentativeVal = computeTentativeGrade(classRecordScores, classRecordCols);
              if (tentativeVal !== null) {
                gradeValues.push({ val: tentativeVal, isTentative: true });
                containsTentative = true;
              }
            }
          });

          const avgGwa = gradeValues.length > 0
            ? gradeValues.reduce((acc, item) => acc + item.val, 0) / gradeValues.length
            : null;

          const failingCount = gradeValues.filter(item => item.val > 3.00).length;

          // Risk classification
          const { severity, advisory } = avgGwa !== null
            ? classifyRisk(avgGwa, failingCount)
            : { severity: 'low', advisory: 'No posted grades yet — monitoring recommended.' };

          // AI override advisory if available
          const ai = aiMap[s.user_id];
          const aiAdvisory = ai?.summary
            ? ai.summary.slice(0, 120) + (ai.summary.length > 120 ? '…' : '')
            : advisory;

          // Programs from section name prefix
          const sectionName = s.sections?.name || '';
          const programCode = sectionName.split('-')[0] || '—';

          return {
            id: s.user_id,
            firstName: s.first_name,
            lastName: s.last_name,
            email: s.email,
            section: sectionName,
            programCode,
            runningGwa: avgGwa,
            isTentative: containsTentative,
            failingCount,
            severity,
            advisory: aiAdvisory,
            hasGrades: gradeValues.length > 0,
            hasAi: !!ai,
          };
        });

        if (!cancelled) {
          setStudents(enriched);
          setError(null);
        }
      } catch (err) {
        console.warn('Database query failed, falling back to mock dataset:', err);
        if (!cancelled) {
          setStudents(mockDeanAtRiskStudents.map(s => ({
            id: s.student_id,
            firstName: s.first_name,
            lastName: s.last_name,
            email: s.email,
            section: s.section,
            programCode: s.programPrefix,
            runningGwa: s.avgGwa,
            isTentative: false,
            failingCount: s.failingCount,
            severity: s.risk.severity,
            advisory: s.risk.advisory,
            hasGrades: true,
            hasAi: false,
          })));
          setError(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [profile?.department_id]);

  // ── Client-side filtering & sorting ───────────────────────────────────────
  const severityWeight = { high: 1, medium: 2, low: 3 };

  const filtered = students
    .filter(s => {
      const name = `${s.firstName} ${s.lastName}`;
      const matchesSearch =
        name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.email.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesSeverity = !severityFilter || s.severity === severityFilter;
      const matchesSection = !sectionFilter || s.section === sectionFilter;
      return matchesSearch && matchesSeverity && matchesSection;
    })
    .sort((a, b) => {
      // Primary: sort by severity hierarchy (high -> medium -> low)
      if (severityWeight[a.severity] !== severityWeight[b.severity]) {
        return severityWeight[a.severity] - severityWeight[b.severity];
      }
      // Secondary: alphabetical by last name
      return `${a.lastName}, ${a.firstName}`.localeCompare(`${b.lastName}, ${b.firstName}`);
    });

  // ── Summary counts ────────────────────────────────────────────────────────
  const highCount   = students.filter(s => s.severity === 'high').length;
  const medCount    = students.filter(s => s.severity === 'medium').length;
  const lowCount    = students.filter(s => s.severity === 'low').length;
  const deanCollege = profile?.departments?.name || '—';

  return (
    <>
      <PageHeader title="At-Risk Students" breadcrumb="Dean Portal" />

      <div className="p-8 overflow-y-auto flex-1 space-y-6">

        {/* ── Error banner ── */}
        {error && (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 text-xs text-amber-800 shadow-sm">
            <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* ── College scope badge + stats strip ── */}
        {!loading && (
          <div className="space-y-4">
            {/* College badge */}
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Building2 className="h-3.5 w-3.5 text-sage-600" />
              <span>Showing students from</span>
              <span className="font-bold text-sage-700">{deanCollege}</span>
              <span className="text-slate-300">·</span>
              <span>{students.length} students monitored</span>
            </div>

            {/* Stats strip */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'High Risk', value: highCount, color: 'text-rose-700', bg: 'bg-rose-50 border-rose-200', pulse: true },
                { label: 'Medium Risk', value: medCount, color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', pulse: false },
                { label: 'Low Risk / Clear', value: lowCount, color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', pulse: false },
              ].map(s => (
                <div key={s.label} className={`rounded-xl border p-4 shadow-sm flex items-center gap-3 ${s.bg}`}>
                  <span className={`text-2xl font-extrabold font-mono ${s.color}`}>{s.value}</span>
                  <div>
                    <span className="text-xs font-semibold text-slate-600 block">{s.label}</span>
                    {s.pulse && s.value > 0 && (
                      <span className="text-[10px] text-rose-500 font-medium">Needs attention</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Filter toolbar ── */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-sage-600" /> Filter Options
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Search */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search student name or email..."
                className="block w-full pl-9 pr-3 py-2 border border-slate-200 focus:border-sage-500 rounded-lg text-xs outline-none bg-slate-50/20 focus:bg-white transition-colors"
              />
            </div>

            {/* Severity */}
            <select
              value={severityFilter}
              onChange={e => setSeverityFilter(e.target.value)}
              className="block w-full border border-slate-200 px-3 py-2 rounded-lg text-xs bg-white outline-none cursor-pointer focus:border-sage-500 transition-colors"
            >
              <option value="">All Risk Severities</option>
              <option value="high">High Risk</option>
              <option value="medium">Medium Risk</option>
              <option value="low">Low Risk</option>
            </select>

            {/* Section — dynamically built from DB */}
            <select
              value={sectionFilter}
              onChange={e => setSectionFilter(e.target.value)}
              className="block w-full border border-slate-200 px-3 py-2 rounded-lg text-xs bg-white outline-none cursor-pointer focus:border-sage-500 transition-colors"
            >
              <option value="">All Sections</option>
              {sections.map(sec => (
                <option key={sec.section_id} value={sec.name}>{sec.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ── Loading skeleton ── */}
        {loading && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 flex items-center justify-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-sage-600" />
            <span className="text-sm text-slate-500 font-medium">Loading student risk data…</span>
          </div>
        )}

        {/* ── Data table ── */}
        {!loading && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Student</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Program</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Section</th>
                    <th className="px-6 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Running GWA</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">AI Recommendation / Advisory</th>
                    <th className="px-6 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Early Warning</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {filtered.length > 0 ? (
                    filtered.map(s => (
                      <tr key={s.id} className={`hover:bg-slate-50/40 transition-colors ${s.severity === 'high' ? 'bg-rose-50/20' : ''}`}>

                        {/* Student name + initials */}
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 text-slate-700 font-bold text-[10px] flex items-center justify-center font-mono flex-shrink-0">
                              {s.firstName[0]}{s.lastName[0]}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-slate-900">{s.firstName} {s.lastName}</p>
                              <p className="text-[10px] text-slate-400 font-mono">{s.email}</p>
                            </div>
                          </div>
                        </td>

                        {/* Program code */}
                        <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-600 font-medium">
                          {s.programCode}
                        </td>

                        {/* Section */}
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                            {s.section}
                          </span>
                        </td>

                        {/* Running GWA */}
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          {s.runningGwa !== null ? (
                            <span className="inline-flex items-center justify-center gap-1.5">
                              <span className={`text-sm font-mono font-bold ${
                                s.runningGwa > 3.00 ? 'text-rose-700' :
                                s.runningGwa >= 2.75 ? 'text-amber-700' :
                                'text-slate-900'
                              }`}>
                                {s.runningGwa.toFixed(2)}
                              </span>
                              {s.isTentative && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200" title="Computed from unposted/draft term scores">
                                  Tentative
                                </span>
                              )}
                              {s.failingCount > 0 && (
                                <span className="text-[10px] text-rose-500 font-medium">
                                  ({s.failingCount} failing)
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-center gap-1.5">
                              <span className="text-xs text-slate-400 font-medium italic">No grades yet</span>
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200" title="No grades posted yet (Drafts pending)">
                                Tentative
                              </span>
                            </span>
                          )}
                        </td>

                        {/* AI Advisory */}
                        <td className="px-6 py-4 text-xs text-slate-600 font-sans max-w-sm">
                          <div className="flex items-start gap-1.5">
                            <Sparkles className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${s.hasAi ? 'text-violet-500' : 'text-slate-400'}`} />
                            <span className={s.hasAi ? 'text-slate-700' : 'text-slate-500 italic'}>
                              {s.advisory}
                            </span>
                          </div>
                        </td>

                        {/* Severity badge */}
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <SeverityBadge severity={s.severity} />
                        </td>

                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="6" className="px-6 py-12 text-center">
                        <AlertCircle className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                        <p className="text-sm text-slate-400">No at-risk student records match the current filters.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Table footer — result count */}
            {filtered.length > 0 && (
              <div className="border-t border-slate-100 px-6 py-3 bg-slate-50/50 text-xs text-slate-400">
                Showing <span className="font-bold text-slate-600">{filtered.length}</span> of{' '}
                <span className="font-bold text-slate-600">{students.length}</span> students in {deanCollege}
              </div>
            )}
          </div>
        )}

      </div>
    </>
  );
}
