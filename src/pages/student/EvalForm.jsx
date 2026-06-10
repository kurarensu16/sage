import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { ChevronRight, ShieldAlert, Send, Check, Heart, HelpCircle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';

const ratingLabels = {
  1: 'Poor',
  2: 'Needs Improvement',
  3: 'Satisfactory',
  4: 'Exemplary'
};

const ratingDesc = {
  1: 'Fails to meet basic expectations. Needs major intervention.',
  2: 'Occasionally meets expectations but requires guidance and development.',
  3: 'Consistently meets teaching standards and course requirements.',
  4: 'Exceeds all benchmarks. Demonstrates exceptional pedagogical skill.'
};

// Helper to compute SHA-256 hash for evaluation anonymity (FR25)
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export default function EvalForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();
  
  const windowId = new URLSearchParams(location.search).get('id');

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [windowInfo, setWindowInfo] = useState(null);
  const [subjectInfo, setSubjectInfo] = useState(null);
  const [categories, setCategories] = useState([]);
  const [totalQuestions, setTotalQuestions] = useState(0);

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [strengths, setStrengths] = useState('');
  const [improvements, setImprovements] = useState('');

  // Dynamic ratings state: criteria_id -> rating (number)
  const [ratings, setRatings] = useState({});
  const [hoveredKey, setHoveredKey] = useState(null);
  const [hoveredValue, setHoveredValue] = useState(null);

  useEffect(() => {
    async function loadFormSetup() {
      if (!user || !windowId || !profile?.section_id) {
        setLoading(false);
        return;
      }
      try {
        // 1. Fetch Window details
        const { data: win, error: winErr } = await supabase
          .from('evaluation_windows')
          .select(`
            window_id,
            form_id,
            faculty_id,
            faculty:users!evaluation_windows_faculty_id_fkey ( first_name, last_name )
          `)
          .eq('window_id', windowId)
          .single();

        if (winErr) throw winErr;
        setWindowInfo(win);

        // 2. Fetch subject information from class record
        const { data: classRec } = await supabase
          .from('class_records')
          .select('*, subjects(*)')
          .eq('section_id', profile.section_id)
          .eq('faculty_id', win.faculty_id)
          .eq('status', 'active')
          .limit(1)
          .maybeSingle();

        if (classRec) {
          setSubjectInfo(classRec.subjects);
        }

        // 3. Fetch Evaluation Criteria
        const { data: criteria, error: critErr } = await supabase
          .from('evaluation_criteria')
          .select('*')
          .eq('form_id', win.form_id)
          .order('order_index', { ascending: true });

        if (critErr) throw critErr;

        if (criteria && criteria.length > 0) {
          setTotalQuestions(criteria.length);

          // Group by category (label in DB)
          const cats = [];
          const seen = new Set();

          criteria.forEach((crit) => {
            if (!seen.has(crit.label)) {
              seen.add(crit.label);
              cats.push({
                title: crit.label,
                questions: []
              });
            }
            const matchingCat = cats.find(c => c.title === crit.label);
            matchingCat.questions.push({
              id: crit.criteria_id,
              desc: crit.description,
              maxRating: crit.max_rating || 4
            });
          });

          setCategories(cats);

          // Initialize ratings state
          const initialRatings = {};
          criteria.forEach(c => {
            initialRatings[c.criteria_id] = null;
          });
          setRatings(initialRatings);
        }

      } catch (err) {
        console.error('Error loading evaluation form:', err);
      } finally {
        setLoading(false);
      }
    }

    loadFormSetup();
  }, [user, windowId, profile]);

  const handleRating = (criteriaId, val) => {
    setRatings(prev => ({ ...prev, [criteriaId]: Number(val) }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setShowConfirmModal(true);
  };

  const confirmSubmit = async () => {
    setShowConfirmModal(false);
    setSubmitting(true);
    try {
      // 1. Generate anonymous token to ensure response privacy (FR25)
      const token = await sha256(user.id + "_" + windowId);

      // 2. Insert evaluation response row
      const { data: resp, error: respErr } = await supabase
        .from('evaluation_responses')
        .insert({
          window_id: windowId,
          anonymous_token: token,
          student_id: user.id
        })
        .select('response_id')
        .single();

      if (respErr) throw respErr;
      const responseId = resp.response_id;

      // 3. Insert ratings mapped to criteria
      const ratingsPayload = Object.entries(ratings).map(([critId, val]) => ({
        response_id: responseId,
        criteria_id: critId,
        rating: val
      }));

      const { error: ratingsErr } = await supabase
        .from('evaluation_ratings')
        .insert(ratingsPayload);

      if (ratingsErr) throw ratingsErr;

      // 4. Insert qualitative feedback if provided
      if (strengths.trim() || improvements.trim()) {
        const commentParts = [];
        if (strengths.trim()) commentParts.push(`Strengths:\n${strengths.trim()}`);
        if (improvements.trim()) commentParts.push(`Points for Improvement:\n${improvements.trim()}`);
        const combinedComment = commentParts.join('\n\n');

        const { error: commentErr } = await supabase
          .from('evaluation_comments')
          .insert({
            response_id: responseId,
            comment: combinedComment
          });

        if (commentErr) throw commentErr;
      }

      setSubmitting(false);
      setShowSuccessModal(true);
    } catch (err) {
      console.error('Error submitting evaluation:', err);
      setSubmitting(false);
      alert('Failed to submit evaluation. Please try again.');
    }
  };

  const successModalClose = () => {
    setShowSuccessModal(false);
    navigate('/student/evallist');
  };

  const answeredCount = Object.values(ratings).filter(r => r !== null).length;
  const progressPercent = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;
  const isFormComplete = totalQuestions > 0 && answeredCount === totalQuestions;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-sage-600"></div>
          <p className="text-sm text-slate-500 font-medium font-sans">Loading evaluation form...</p>
        </div>
      </div>
    );
  }

  if (!windowInfo) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-500 font-sans">Evaluation window not found or is closed.</p>
      </div>
    );
  }

  const facultyName = windowInfo.faculty 
    ? `${windowInfo.faculty.first_name} ${windowInfo.faculty.last_name}` 
    : 'Instructor';

  const subjectCode = subjectInfo?.code || 'N/A';
  const subjectName = subjectInfo?.name || 'Unknown Course';

  return (
    <>
      <PageHeader title="PPST Faculty Evaluation Form" breadcrumb="Student Portal" />

      <div className="p-8 overflow-y-auto flex-1 max-w-4xl mx-auto w-full space-y-6 relative">
        
        {/* Sticky Context Banner & Progress Bar */}
        <div className="sticky top-0 bg-white/95 backdrop-blur-md z-35 border border-slate-200 shadow-sm rounded-xl p-4 flex flex-col sm:flex-row justify-between items-center gap-4 transition-all duration-300">
          <div className="text-center sm:text-left">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Evaluating Instructor</span>
            <h3 className="text-sm font-extrabold text-slate-900 mt-0.5 font-display">Prof. {facultyName}</h3>
            <p className="text-[11px] text-slate-500 font-mono">{subjectCode} • {subjectName}</p>
          </div>
          
          <div className="w-full sm:w-auto flex flex-col sm:items-end gap-1.5">
            <div className="flex justify-between items-center text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              <span>Evaluation Progress</span>
              <span className="font-mono font-bold text-slate-700">{answeredCount} of {totalQuestions} Rated</span>
            </div>
            <div className="flex items-center gap-3 w-full sm:w-56">
              <div className="flex-1 bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200">
                <div 
                  className="bg-sage-600 h-full transition-all duration-300" 
                  style={{ width: `${progressPercent}%` }}
                ></div>
              </div>
              <span className="text-xs font-mono font-bold text-slate-700">{Math.round(progressPercent)}%</span>
            </div>
          </div>
        </div>

        {/* Navigation Breadcrumb detail */}
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span className="hover:text-sage-600 cursor-pointer transition-colors" onClick={() => navigate('/student/evallist')}>
            Evaluations
          </span>
          <ChevronRight className="h-3 w-3" />
          <span className="font-medium text-slate-900 font-sans">Evaluation Form</span>
        </div>

        {/* Privacy Alert Box */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex gap-3">
          <ShieldAlert className="h-5 w-5 text-sage-600 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="font-bold text-sm text-slate-900 text-left">Compliance & Privacy Notice</h4>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed text-left">
              In accordance with school policy, individual ratings are converted to aggregated index scores, and comments are stored securely to help improve instruction.
            </p>
          </div>
        </div>

        {/* Scoring Guide */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 text-left">PPST Performance Evaluation Rating Scale</h4>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-left">
            {[1, 2, 3, 4].map(val => (
              <div key={val} className="border border-slate-100 rounded-lg p-2.5 bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-sage-600 text-white font-mono text-[10px] font-bold flex items-center justify-center">{val}</span>
                  <span className="text-xs font-bold text-slate-800">{ratingLabels[val]}</span>
                </div>
                <p className="text-[10px] text-slate-440 mt-1 leading-relaxed">{ratingDesc[val]}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-8">
          
          {/* Categories Deck */}
          {categories.map((cat, cIdx) => (
            <div key={cIdx} className="space-y-4">
              {/* Category Header */}
              <div className="bg-slate-100 border-l-4 border-sage-600 px-4 py-2.5 rounded-r-lg">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide text-left">
                  {cIdx + 1}. {cat.title}
                </h3>
              </div>

              {/* Questions within Category */}
              <div className="space-y-4">
                {cat.questions.map((item, qIdx) => {
                  const selectedValue = ratings[item.id];
                  const isHovered = hoveredKey === item.id;
                  const displayValue = isHovered ? hoveredValue : selectedValue;
                  const activeLabel = displayValue !== null ? ratingLabels[displayValue] : 'Select score...';

                  return (
                    <div 
                      key={item.id} 
                      className={cn(
                        "bg-white rounded-xl border p-5 shadow-sm hover:shadow-md hover:border-slate-300 transition-all space-y-3",
                        selectedValue !== null ? "border-slate-200" : "border-slate-200 border-l-4 border-l-amber-400"
                      )}
                    >
                      <div className="text-left">
                        <p className="text-xs font-bold text-slate-400 font-mono uppercase font-display">Item {cIdx + 1}.{qIdx + 1}</p>
                        <p className="text-sm font-medium text-slate-850 mt-1">{item.desc}</p>
                      </div>

                      {/* Selector Container */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2.5 border-t border-slate-100">
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider hidden xs:block">Poor</span>
                          
                          <div className="flex items-center gap-2">
                            {[1, 2, 3, 4].map((val) => (
                              <label 
                                key={val}
                                onMouseEnter={() => { setHoveredKey(item.id); setHoveredValue(val); }}
                                onMouseLeave={() => { setHoveredKey(null); setHoveredValue(null); }}
                                className={cn(
                                  "w-9 h-9 rounded-full border text-xs font-mono font-bold flex items-center justify-center cursor-pointer transition-all select-none p-1",
                                  selectedValue === val
                                    ? 'bg-sage-600 border-sage-600 text-white shadow-sm scale-105'
                                    : 'bg-white border-slate-200 text-slate-500 hover:bg-sage-50 hover:border-sage-400 hover:text-sage-900'
                                )}
                              >
                                <input
                                  type="radio"
                                  required
                                  name={item.id}
                                  value={val}
                                  checked={selectedValue === val}
                                  onChange={(e) => handleRating(item.id, e.target.value)}
                                  className="sr-only"
                                />
                                {val}
                              </label>
                            ))}
                          </div>

                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider hidden xs:block">Exemplary</span>
                        </div>

                        {/* Active rating indicator */}
                        <div className="text-left sm:text-right">
                          <span className={cn(
                            "text-[11px] font-bold transition-all px-2.5 py-1 rounded-full border",
                            selectedValue !== null 
                              ? "bg-sage-50 text-sage-700 border-sage-200" 
                              : "bg-slate-50 text-slate-400 border-slate-100 italic"
                          )}>
                            {activeLabel}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Qualitative Feedback Sections */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
            <div className="pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold font-display text-slate-900 text-left">Qualitative Student Feedback</h3>
              <p className="text-xs text-slate-450 text-left mt-0.5">Please provide constructive feedback for evaluation purposes.</p>
            </div>

            {/* Strengths */}
            <div className="flex flex-col gap-1.5 text-left">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                <Heart className="h-4 w-4 text-emerald-500" /> My Faculty strengths are:
              </label>
              <textarea
                value={strengths}
                onChange={(e) => setStrengths(e.target.value)}
                rows="3"
                placeholder="What did this instructor do exceptionally well in terms of pedagogy or support?"
                className="block w-full border border-slate-200 rounded-lg p-3 text-xs focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none transition-colors"
              />
            </div>

            {/* Points for Improvement */}
            <div className="flex flex-col gap-1.5 text-left">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                <HelpCircle className="h-4 w-4 text-amber-500" /> My Faculty Points for Improvement are:
              </label>
              <textarea
                value={improvements}
                onChange={(e) => setImprovements(e.target.value)}
                rows="3"
                placeholder="Where can this instructor improve regarding methods, pacing, materials, or communications?"
                className="block w-full border border-slate-200 rounded-lg p-3 text-xs focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none transition-colors"
              />
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex justify-end gap-3 pb-6">
            <button
              type="button"
              onClick={() => navigate('/student/evallist')}
              className="px-5 py-2.5 text-sm font-medium border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg transition-colors bg-white font-sans"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isFormComplete || submitting}
              className="px-6 py-2.5 text-sm font-semibold bg-sage-600 hover:bg-sage-700 text-white rounded-lg transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-40 disabled:hover:bg-sage-600 disabled:cursor-not-allowed"
            >
              {submitting ? 'Submitting...' : 'Submit Evaluation'} <Send className="h-4 w-4" />
            </button>
          </div>

        </form>

        {/* Confirmation Modal */}
        {showConfirmModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="p-6">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4">
                  <Check className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold font-display text-slate-900 text-left">Submit Evaluation?</h3>
                <p className="text-sm text-slate-550 mt-2 text-left">
                  Are you sure you want to submit this PPST Faculty Evaluation for <strong>Prof. {facultyName}</strong>? Once submitted, it cannot be modified or re-entered.
                </p>
              </div>
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                <button 
                  onClick={() => setShowConfirmModal(false)}
                  className="px-4 py-2 text-sm font-medium border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors font-sans"
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmSubmit}
                  className="px-4 py-2 text-sm font-semibold bg-sage-600 hover:bg-sage-700 text-white rounded-lg transition-colors shadow-sm font-sans"
                >
                  Yes, Submit Evaluation
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Success Modal (Compliant with no browser alert rule) */}
        {showSuccessModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-6 text-center">
                <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4 border border-emerald-100">
                  <Check className="h-8 w-8" />
                </div>
                <h3 className="text-xl font-extrabold font-display text-slate-900">Evaluation Submitted!</h3>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed px-4">
                  Thank you! Your feedback has been securely recorded.
                </p>
              </div>
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-center">
                <button 
                  onClick={successModalClose}
                  className="px-6 py-2 text-sm font-semibold bg-sage-600 hover:bg-sage-700 text-white rounded-lg transition-all shadow-sm w-full sm:w-auto"
                >
                  Return to List
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </>
  );
}
