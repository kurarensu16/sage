import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { ArrowLeft, Star, Sparkles, MessageSquare, ChevronRight, Award, AlertCircle } from 'lucide-react';
import { mockDb } from '../../lib/mockDb';

export default function EvalResultsFaculty() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const facultyId = params.get('id');

  const [faculty, setFaculty] = useState(null);
  const [classrooms, setClassrooms] = useState([]);
  const [criteriaRatings, setCriteriaRatings] = useState([]);
  const [comments, setComments] = useState([]);
  const [aiVerdict, setAiVerdict] = useState(null);

  useEffect(() => {
    if (!facultyId) return;

    // Load faculty details
    const users = mockDb.getUsers();
    const target = users.find(u => u.id === facultyId && u.role === 'faculty');
    if (!target) return;
    setFaculty(target);

    // Load sections taught
    const classes = mockDb.getClassrooms().filter(c => c.facultyId === facultyId && c.status === 'active');
    setClassrooms(classes);

    // Set criteria breakdown & simulated values
    // Prof. Amanda Rivera gets higher marks
    const isAmanda = facultyId === 'usr-003';
    
    const ratings = [
      { id: 'crit-1', label: 'Teaching Effectiveness', rating: isAmanda ? 4.82 : 4.10, max: 5 },
      { id: 'crit-2', label: 'Punctuality & Attendance', rating: isAmanda ? 4.65 : 4.25, max: 5 },
      { id: 'crit-3', label: 'Fair Grading Assessment', rating: isAmanda ? 4.70 : 3.90, max: 5 },
      { id: 'crit-4', label: 'Communication & Engagement', rating: isAmanda ? 4.88 : 4.15, max: 5 }
    ];
    setCriteriaRatings(ratings);

    // Comments deck
    const amandaComments = [
      "Explains complex coding concepts clearly. Always helpful during lab hours.",
      "The grading metrics are very fair. I know exactly why I got my marks.",
      "Very patient and responds to MS Teams queries quickly.",
      "Starts class on time and provides additional code snippets for study."
    ];
    const defaultComments = [
      "Good instructor. Explains theories well.",
      "Sometimes grading takes time, but overall criteria are fair.",
      "Conducts classes regularly.",
      "Class activities are engaging."
    ];
    setComments(isAmanda ? amandaComments : defaultComments);

    // AI Fitness summary
    setAiVerdict({
      score: isAmanda ? 95.4 : 81.2,
      status: isAmanda ? 'Exemplary Teaching Profile' : 'Qualified / Performance Match',
      severity: isAmanda ? 'success' : 'warning',
      summary: isAmanda 
        ? "AI evaluation engine predicts high retention outcomes (98% probability) and strong grade mapping alignment. Performance reflects excellent engagement scores. No corrective action plan required."
        : "AI evaluation engine notes a slight deviation in grading feedback satisfaction (3.90 rating). Recommends a review of grading component weights. Overall teaching capacity matches standard institutional benchmarks."
    });

  }, [facultyId]);

  if (!faculty) {
    return (
      <div className="p-8 text-center text-slate-400 text-sm">
        Faculty record not found.
      </div>
    );
  }

  // Calculate cumulative average
  const totalSum = criteriaRatings.reduce((acc, curr) => acc + curr.rating, 0);
  const cumulativeRating = criteriaRatings.length > 0 ? totalSum / criteriaRatings.length : 0.0;

  return (
    <>
      <PageHeader title="Faculty Evaluation Dashboard" breadcrumb="Dean Portal" />
      
      <div className="p-8 overflow-y-auto flex-1 space-y-6">
        
        {/* Navigation back */}
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span className="hover:text-sage-600 cursor-pointer transition-colors" onClick={() => navigate('/dean/evalresultsoverview')}>
            Faculty Evaluations
          </span>
          <ChevronRight className="h-3 w-3" />
          <span className="font-medium text-slate-900">Prof. {faculty.firstName} {faculty.lastName}</span>
        </div>

        {/* Header summary panel */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-full bg-sage-50 border border-sage-200 text-sage-700 font-bold text-sm flex items-center justify-center font-mono">
              {faculty.firstName[0]}{faculty.lastName[0]}
            </div>
            <div>
              <h2 className="text-xl font-bold font-display text-slate-950">
                Prof. {faculty.firstName} {faculty.lastName}
              </h2>
              <p className="text-xs text-slate-500 font-mono mt-0.5">{faculty.email} &bull; {faculty.department}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 text-amber-700 px-3.5 py-1.5 rounded-xl font-mono font-bold text-sm">
            <Star className="h-4 w-4 fill-current" /> Cumulative Rating: {cumulativeRating.toFixed(2)} / 5.00
          </div>
        </div>

        {/* AI Verdict Banner */}
        {aiVerdict && (
          <div className={`p-5 border rounded-xl shadow-sm flex flex-col md:flex-row items-start md:items-center gap-4 justify-between transition-colors ${
            aiVerdict.severity === 'success' 
              ? 'bg-emerald-50/50 border-emerald-100 text-emerald-950' 
              : 'bg-amber-50/50 border-amber-100 text-amber-950'
          }`}>
            <div className="space-y-1">
              <h3 className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 text-slate-800">
                <Sparkles className="h-4 w-4 text-violet-600" /> AI Performance Fitness Verdict
              </h3>
              <p className="text-xs leading-relaxed max-w-2xl font-sans mt-1">
                {aiVerdict.summary}
              </p>
            </div>
            <div className="flex flex-col items-end shrink-0">
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full uppercase border ${
                aiVerdict.severity === 'success' 
                  ? 'bg-emerald-100/60 border-emerald-200 text-emerald-800' 
                  : 'bg-amber-100/60 border-amber-200 text-amber-800'
              }`}>
                {aiVerdict.status}
              </span>
              <span className="text-[10px] text-slate-400 font-mono font-medium mt-1">
                Fitness Index: {aiVerdict.score}%
              </span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Criteria Breakdown list */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-5">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-3 flex items-center gap-1">
              <Award className="h-4 w-4 text-sage-600" /> Criteria Breakdown Ratings
            </h3>

            <div className="space-y-5">
              {criteriaRatings.map(crit => (
                <div key={crit.id} className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-900">{crit.label}</span>
                    <span className="font-mono font-bold text-slate-700">
                      {crit.rating.toFixed(2)} / {crit.max}.00
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                    <div 
                      className="bg-sage-600 h-full rounded-full transition-all duration-500" 
                      style={{ width: `${(crit.rating / crit.max) * 100}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Anonymized student feedback comments */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-3 flex items-center gap-1">
              <MessageSquare className="h-4 w-4 text-sage-600" /> Qualitative Feedback Comments
            </h3>

            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
              {comments.map((comment, idx) => (
                <div key={idx} className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl text-xs leading-relaxed text-slate-700 relative">
                  <div className="absolute top-2.5 right-3 text-[10px] font-mono text-slate-350 font-medium">Anonymized Student #{idx + 1}</div>
                  <p className="pr-12">{comment}</p>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>
    </>
  );
}
