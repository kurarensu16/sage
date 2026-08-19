import { getTransmutedGrade } from '../../lib/gradingMath';
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { ChevronDown, Eye, CheckCircle, Award, TrendingUp } from 'lucide-react';
import { cn } from '../../lib/utils';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';

// Helper to transmute raw scores to DYCI standard grades


// Helper to calculate term ratings from draft scores
const calculateTermRating = (draftScores, maxSetup) => {
  if (!draftScores) return null;
  const max = maxSetup || { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, exam: 40 };

  const act1 = draftScores.act1 !== null ? draftScores.act1 : 0;
  const act2 = draftScores.act2 !== null ? draftScores.act2 : 0;
  const act3 = draftScores.act3 !== null ? draftScores.act3 : 0;
  const act4 = draftScores.act4 !== null ? draftScores.act4 : 0;
  const act5 = draftScores.act5 !== null ? draftScores.act5 : 0;
  const act6 = draftScores.act6 !== null ? draftScores.act6 : 0;
  const char = draftScores.char_rating !== null ? draftScores.char_rating : 0;
  const exam = draftScores.exam !== null ? draftScores.exam : 0;

  // Class Standing (50%)
  const csSum = act1 + act2 + act3 + act4 + act5 + act6;
  const csMax = max.act1 + max.act2 + max.act3 + max.act4 + max.act5 + max.act6;
  const csPct = csMax > 0 ? (csSum / csMax) * 50 : 0;

  // Character Rating (10%)
  const charPct = char * 0.1;

  // Term Exam (40%)
  const examMax = max.exam;
  const examPct = examMax > 0 ? (exam / examMax) * 40 : 0;

  return Math.min(100, Math.max(0, Math.round(csPct + charPct + examPct)));
};

export default function MyGradesList() {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [semestersList, setSemestersList] = useState([]);
  const [selectedSemLabel, setSelectedSemLabel] = useState('');
  const [grades, setGrades] = useState([]);

  const [officialGwa, setOfficialGwa] = useState(null);
  const [officialStanding, setOfficialStanding] = useState('No grades posted yet');
  const [runningGwa, setRunningGwa] = useState(null);
  const [runningStanding, setRunningStanding] = useState('No grades yet');

  useEffect(() => {
    async function loadSemesters() {
      if (!user) return;
      try {
        const { data: enrolls, error } = await supabase
          .from('enrollments')
          .select(`
            section_id,
            sections ( section_id, name, school_year, semester )
          `)
          .eq('student_id', user.id);

        if (error) throw error;

        const options = [];
        const seen = new Set();

        if (profile?.section_id) {
          const { data: currentSec } = await supabase
            .from('sections')
            .select('*')
            .eq('section_id', profile.section_id)
            .single();

          if (currentSec) {
            const sy = currentSec.school_year.startsWith('AY') ? currentSec.school_year : `AY ${currentSec.school_year}`;
            const semName = currentSec.semester === '1st' ? 'First' : currentSec.semester === '2nd' ? 'Second' : currentSec.semester;
            const label = `${semName} Semester, ${sy}`;
            seen.add(label);
            options.push({
              label,
              semester: currentSec.semester,
              school_year: currentSec.school_year,
              section_id: currentSec.section_id
            });
          }
        }

        enrolls?.forEach(e => {
          if (e.sections) {
            const sy = e.sections.school_year.startsWith('AY') ? e.sections.school_year : `AY ${e.sections.school_year}`;
            const semName = e.sections.semester === '1st' ? 'First' : e.sections.semester === '2nd' ? 'Second' : e.sections.semester;
            const label = `${semName} Semester, ${sy}`;
            if (!seen.has(label)) {
              seen.add(label);
              options.push({
                label,
                semester: e.sections.semester,
                school_year: e.sections.school_year,
                section_id: e.sections.section_id
              });
            }
          }
        });

        setSemestersList(options);
        if (options.length > 0) {
          const currentOpt = options.find(o => o.section_id === profile?.section_id) || options[0];
          setSelectedSemLabel(currentOpt.label);
        } else {
          setLoading(false);
        }
      } catch (err) {
        console.error('Error loading semesters:', err);
        setLoading(false);
      }
    }

    loadSemesters();
  }, [user, profile]);

  useEffect(() => {
    async function loadGradesForSem() {
      if (!user || !selectedSemLabel) return;
      setLoading(true);
      try {
        const activeOpt = semestersList.find(o => o.label === selectedSemLabel);
        if (!activeOpt) return;

        // 1. Fetch enrollments for the selected semester
        const { data: enrolls } = await supabase
          .from('enrollments')
          .select(`
            subject_id,
            section_id,
            subjects ( subject_id, code, name, units )
          `)
          .eq('student_id', user.id)
          .eq('section_id', activeOpt.section_id);

        const subjectIds = enrolls?.map(e => e.subject_id) || [];
        
        // 2. Fetch class records
        const { data: classRecords } = await supabase
          .from('class_records')
          .select(`
            class_record_id,
            subject_id,
            faculty:users!faculty_id ( first_name, last_name )
          `)
          .eq('section_id', activeOpt.section_id)
          .in('subject_id', subjectIds)
          .eq('status', 'active');

        const classRecordIds = classRecords?.map(cr => cr.class_record_id) || [];

        // 3. Fetch posted grades
        const { data: posted } = await supabase
          .from('posted_grades')
          .select('*')
          .eq('student_id', user.id)
          .in('class_record_id', classRecordIds);

        // 4. Fetch draft scores
        const { data: drafts } = await supabase
          .from('student_term_scores')
          .select('*')
          .eq('student_id', user.id)
          .in('class_record_id', classRecordIds);

        // 5. Fetch class grading columns (max scores)
        const { data: gradingCols, error: colsErr } = await supabase
          .from('class_grading_columns')
          .select('*')
          .in('class_record_id', classRecordIds);

        if (colsErr) throw colsErr;

        // Map data structures
        const subMap = {};
        enrolls?.forEach(e => {
          if (e.subjects) {
            subMap[e.subject_id] = e.subjects;
          }
        });

        const postedMap = {};
        posted?.forEach(p => {
          if (!postedMap[p.class_record_id]) postedMap[p.class_record_id] = [];
          postedMap[p.class_record_id].push(p);
        });

        const draftsMap = {};
        drafts?.forEach(d => {
          if (!draftsMap[d.class_record_id]) draftsMap[d.class_record_id] = {};
          draftsMap[d.class_record_id][d.term] = d;
        });

        const colsMap = {};
        gradingCols?.forEach(c => {
          if (!colsMap[c.class_record_id]) colsMap[c.class_record_id] = {};
          colsMap[c.class_record_id][c.term] = {
            act1: c.act1_max,
            act2: c.act2_max,
            act3: c.act3_max,
            act4: c.act4_max,
            act5: c.act5_max,
            act6: c.act6_max,
            exam: c.exam_max
          };
        });

        let totalOfficialUnits = 0;
        let weightedOfficialSum = 0;
        let totalRunningUnits = 0;
        let weightedRunningSum = 0;

        const mappedGrades = (classRecords || [])
          .filter(cr => subMap[cr.subject_id])
          .map(cr => {
            const subj = subMap[cr.subject_id];

            const crPosted = postedMap[cr.class_record_id] || [];
            const crDrafts = draftsMap[cr.class_record_id] || {};
            const crCols = colsMap[cr.class_record_id] || {};

            const getTermRating = (termName) => {
              const dbTermKey = termName.toLowerCase().replace('-', '_');
              const postedRow = crPosted.find(p => p.grade_period === dbTermKey);
              if (postedRow) {
                return parseFloat(postedRow.computed_grade);
              }
              const draftRow = crDrafts[termName];
              if (draftRow) {
                const hasScores = 
                  (draftRow.act1 && draftRow.act1 > 0) ||
                  (draftRow.act2 && draftRow.act2 > 0) ||
                  (draftRow.act3 && draftRow.act3 > 0) ||
                  (draftRow.act4 && draftRow.act4 > 0) ||
                  (draftRow.act5 && draftRow.act5 > 0) ||
                  (draftRow.act6 && draftRow.act6 > 0) ||
                  (draftRow.char_rating && draftRow.char_rating > 0) ||
                  (draftRow.exam && draftRow.exam > 0);
                if (!hasScores) return null;
                return calculateTermRating(draftRow, crCols[termName]);
              }
              return null;
            };

            const prelimRating = getTermRating('Prelim');
            const midtermRating = getTermRating('Midterm');
            const semifinalRating = getTermRating('Semi-Final');
            const finalRating = getTermRating('Final');

            // Compute running rating
            let runningRating = null;
            let runningLatestPeriod = '—';
            if (finalRating !== null) {
              const mr = Math.round(((prelimRating || 0) + (midtermRating || 0)) / 2);
              const tfr = Math.round(((semifinalRating || 0) + finalRating) / 2);
              runningRating = Math.round((mr + tfr) / 2);
              runningLatestPeriod = 'Final';
            } else if (semifinalRating !== null) {
              const mr = Math.round(((prelimRating || 0) + (midtermRating || 0)) / 2);
              const tfr = semifinalRating;
              runningRating = Math.round((mr + tfr) / 2);
              runningLatestPeriod = 'Semi-Final';
            } else if (midtermRating !== null) {
              runningRating = Math.round(((prelimRating || 0) + midtermRating) / 2);
              runningLatestPeriod = 'Midterm';
            } else if (prelimRating !== null) {
              runningRating = prelimRating;
              runningLatestPeriod = 'Prelim';
            }

            const runningGrade = runningRating !== null ? getTransmutedGrade(runningRating).toFixed(2) : '—';

            // Compute official grade
            let officialGrade = '—';
            let officialLatestPeriod = '—';
            const postedTermsOrder = ['Final', 'Semi-Final', 'Midterm', 'Prelim'];
            for (const t of postedTermsOrder) {
              const dbTermKey = t.toLowerCase().replace('-', '_');
              const postRow = crPosted.find(p => p.grade_period === dbTermKey);
              if (postRow) {
                officialGrade = postRow.effective_grade !== null 
                  ? postRow.effective_grade.toFixed(2) 
                  : getTransmutedGrade(parseFloat(postRow.computed_grade)).toFixed(2);
                officialLatestPeriod = t;
                break;
              }
            }

            if (officialGrade !== '—') {
              const numGrade = parseFloat(officialGrade);
              if (!isNaN(numGrade)) {
                totalOfficialUnits += subj.units;
                weightedOfficialSum += numGrade * subj.units;
              }
            }

            if (runningGrade !== '—') {
              const numGrade = parseFloat(runningGrade);
              if (!isNaN(numGrade)) {
                totalRunningUnits += subj.units;
                weightedRunningSum += numGrade * subj.units;
              }
            }

            return {
              class_record_id: cr.class_record_id,
              code: subj.code,
              name: subj.name,
              credits: subj.units,
              instructor: cr.faculty ? `Prof. ${cr.faculty.first_name} ${cr.faculty.last_name}` : 'TBA',
              officialLatestPeriod,
              officialGrade,
              runningLatestPeriod,
              runningGrade
            };
          });

        setGrades(mappedGrades);

        const offGwa = totalOfficialUnits > 0 ? (weightedOfficialSum / totalOfficialUnits) : null;
        const runGwa = totalRunningUnits > 0 ? (weightedRunningSum / totalRunningUnits) : null;

        setOfficialGwa(offGwa);
        setRunningGwa(runGwa);

        const getStanding = (gwaNum) => {
          if (gwaNum === null) return 'No grades posted yet';
          if (gwaNum <= 1.45) return 'Excellent';
          if (gwaNum <= 1.75) return 'Very Good';
          if (gwaNum <= 3.00) return 'Satisfactory';
          return 'Academic warning';
        };

        setOfficialStanding(getStanding(offGwa));
        setRunningStanding(getStanding(runGwa));

      } catch (err) {
        console.error('Error loading grades details:', err);
      } finally {
        setLoading(false);
      }
    }

    loadGradesForSem();
  }, [user, selectedSemLabel, semestersList]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-sage-600"></div>
          <p className="text-sm text-slate-500 font-medium font-sans">Loading grades...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHeader title="My Grades" breadcrumb="Student Portal">
        <div className="relative">
          <select 
            value={selectedSemLabel}
            onChange={(e) => setSelectedSemLabel(e.target.value)}
            className="appearance-none bg-white border border-slate-200 hover:border-sage-300 text-slate-700 px-4 py-2 pr-10 rounded-lg text-sm font-medium focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none transition-all cursor-pointer"
          >
            {semestersList.map((sem, idx) => (
              <option key={idx} value={sem.label}>{sem.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
        </div>
      </PageHeader>

      <div className="p-8 overflow-y-auto flex-1 space-y-8">
        
        {/* Double GWA Metrics Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card 1: Official Academic GWA */}
          <div className="bg-emerald-50/40 border border-emerald-100 rounded-xl p-5 shadow-sm flex items-center justify-between">
            <div className="space-y-1 text-left">
              <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">Official GWA</span>
              <div className="text-3xl font-extrabold font-mono text-emerald-950">
                {officialGwa !== null ? officialGwa.toFixed(2) : '—'}
              </div>
              <p className="text-xs text-emerald-700">Standing: <strong className="font-bold">{officialStanding}</strong></p>
            </div>
            <div className="p-3 bg-emerald-100 text-emerald-700 rounded-xl shadow-sm">
              <Award className="h-6 w-6" />
            </div>
          </div>

          {/* Card 2: Running/Unofficial GWA */}
          <div className="bg-blue-50/40 border border-blue-100 rounded-xl p-5 shadow-sm flex items-center justify-between">
            <div className="space-y-1 text-left">
              <span className="text-[10px] font-bold text-blue-800 uppercase tracking-wider block">Live Running GWA</span>
              <div className="text-3xl font-extrabold font-mono text-blue-950">
                {runningGwa !== null ? runningGwa.toFixed(2) : '—'}
              </div>
              <p className="text-xs text-blue-700">Standing: <strong className="font-bold">{runningStanding}</strong></p>
            </div>
            <div className="p-3 bg-blue-100 text-blue-700 rounded-xl shadow-sm">
              <TrendingUp className="h-6 w-6" />
            </div>
          </div>
        </div>

        {/* Double Table View Layout */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          
          {/* LEFT TABLE: Official Grades Ledger */}
          <div className="bg-white rounded-xl border border-emerald-100 shadow-sm overflow-hidden flex flex-col">
            <div className="bg-emerald-50/50 px-6 py-4 border-b border-emerald-100 flex items-center gap-2">
              <CheckCircle className="h-4.5 w-4.5 text-emerald-600" />
              <h3 className="text-sm font-bold text-emerald-900 uppercase tracking-wider font-display text-left">📊 Official Grades Ledger</h3>
            </div>
            <div className="table-container overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-450 text-[10px] font-bold uppercase tracking-wider">
                    <th className="px-5 py-3 font-medium">Subject Code & Name</th>
                    <th className="px-3 py-3 text-center font-medium">Units</th>
                    <th className="px-4 py-3 font-medium">Verification Status</th>
                    <th className="px-4 py-3 text-center font-medium">Grade</th>
                    <th className="px-5 py-3 text-right font-medium">Breakdown</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
                  {grades.map((item) => (
                    <tr key={`off-${item.class_record_id}`} className="hover:bg-slate-50/30 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="font-bold text-slate-900 text-xs sm:text-sm">{item.code}</div>
                        <div className="text-slate-400 font-normal mt-0.5 max-w-[200px] truncate">{item.name}</div>
                      </td>
                      <td className="px-3 py-3.5 text-center font-mono text-slate-650">{item.credits.toFixed(1)}</td>
                      <td className="px-4 py-3.5">
                        {item.officialLatestPeriod !== '—' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                            {item.officialLatestPeriod} Posted
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-50 text-slate-400 border border-slate-100">
                            No Grades Posted
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className={cn(
                          "font-mono text-sm font-bold",
                          item.officialGrade === '—' ? 'text-slate-350' : 'text-emerald-700'
                        )}>
                          {item.officialGrade}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <Link 
                          to={`/student/mygradesdetail?id=${item.class_record_id}`}
                          className="px-2 py-1.5 border border-slate-200 hover:border-emerald-300 text-slate-600 hover:text-emerald-700 bg-white rounded-lg transition-colors inline-flex items-center justify-center gap-1 text-[11px]"
                        >
                          <Eye className="h-3 w-3" /> View
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {grades.length === 0 && (
                    <tr>
                      <td colSpan="5" className="px-6 py-12 text-center text-slate-400 text-sm">
                        No official grades found for this semester.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* RIGHT TABLE: Live Running Dashboard */}
          <div className="bg-white rounded-xl border border-blue-100 shadow-sm overflow-hidden flex flex-col">
            <div className="bg-blue-50/50 px-6 py-4 border-b border-blue-100 flex items-center gap-2">
              <TrendingUp className="h-4.5 w-4.5 text-blue-600" />
              <h3 className="text-sm font-bold text-blue-900 uppercase tracking-wider font-display text-left">📈 Unofficial Running Grade Dashboard</h3>
            </div>
            <div className="table-container overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-450 text-[10px] font-bold uppercase tracking-wider">
                    <th className="px-5 py-3 font-medium">Subject Code & Name</th>
                    <th className="px-3 py-3 text-center font-medium">Units</th>
                    <th className="px-4 py-3 font-medium">Live Activity Period</th>
                    <th className="px-4 py-3 text-center font-medium">Est. Grade</th>
                    <th className="px-5 py-3 text-right font-medium">Breakdown</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
                  {grades.map((item) => (
                    <tr key={`run-${item.class_record_id}`} className="hover:bg-slate-50/30 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="font-bold text-slate-900 text-xs sm:text-sm">{item.code}</div>
                        <div className="text-slate-400 font-normal mt-0.5 max-w-[200px] truncate">{item.name}</div>
                      </td>
                      <td className="px-3 py-3.5 text-center font-mono text-slate-650">{item.credits.toFixed(1)}</td>
                      <td className="px-4 py-3.5">
                        {item.runningLatestPeriod !== '—' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100">
                            {item.runningLatestPeriod} Running
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-50 text-slate-400 border border-slate-100">
                            No Scores Entered
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className={cn(
                          "font-mono text-sm font-bold",
                          item.runningGrade === '—' ? 'text-slate-350' : 'text-blue-700'
                        )}>
                          {item.runningGrade}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <Link 
                          to={`/student/mygradesdetail?id=${item.class_record_id}`}
                          className="px-2 py-1.5 border border-slate-200 hover:border-blue-300 text-slate-600 hover:text-blue-700 bg-white rounded-lg transition-colors inline-flex items-center justify-center gap-1 text-[11px]"
                        >
                          <Eye className="h-3 w-3" /> View
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {grades.length === 0 && (
                    <tr>
                      <td colSpan="5" className="px-6 py-12 text-center text-slate-400 text-sm">
                        No running grades found for this semester.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>

      </div>
    </>
  );
}
