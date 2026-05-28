import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { ChevronRight, ShieldAlert, Send, Check, Heart, HelpCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

const categories = [
  {
    id: 1,
    title: "1. Content Knowledge and Pedagogy (Instructional Practices)",
    questions: [
      { key: "q1_1", desc: "My teacher utilizes a variety of instructional methods to improve students' reading and numeracy proficiency." },
      { key: "q1_2", desc: "My teacher uses different instructional techniques to promote the growth of higher-order thinking abilities such as critical and creative thinking." },
      { key: "q1_3", desc: "My teacher demonstrates proficient language use to facilitate teaching and learning." },
      { key: "q1_4", desc: "My teacher uses excellent verbal and nonverbal classroom strategies to promote students' understanding, participation, motivation, and performance." }
    ]
  },
  {
    id: 2,
    title: "2. Learning Environment",
    questions: [
      { key: "q2_1", desc: "My teacher creates a safe, secure, and learning-focused environment by consistently implementing policies, standards, and procedures, and effectively manages student's behavior using positive, supportive approaches that promote engagement and learning." },
      { key: "q2_2", desc: "My teacher organizes classroom structure to engage students in significant inquiry, discovery, and hands-on activities in a variety of physical learning situations, whether individually or in groups." },
      { key: "q2_3", desc: "My teacher maintains supportive learning environments that encourage and motivate students to engage, cooperate, and collaborate in active learning." }
    ]
  },
  {
    id: 3,
    title: "3. Diversity of Learners",
    questions: [
      { key: "q3_1", desc: "My teacher exhibits a learner-centered culture that promotes success by using effective teaching strategies that respond to their linguistic, cultural, socio-economic, and religious backgrounds." },
      { key: "q3_2", desc: "My teacher plans and implements instructional techniques that are sensitive to the unique educational needs of students who are experiencing challenges." },
      { key: "q3_3", desc: "My teacher adapts and applies culturally relevant teaching practices to address the needs of indigenous students." }
    ]
  },
  {
    id: 4,
    title: "4. Teaching, Learning, and Planning",
    questions: [
      { key: "q4_1", desc: "My teacher creates, organizes, and implements a sequential teaching and learning process to meet the specified academic targets in varied teaching situations." },
      { key: "q4_2", desc: "My teacher develops and initiates learning programs to promote usefulness and adaptability to all students' needs." },
      { key: "q4_3", desc: "My teacher chooses, designs, organizes, and applies suitable teaching and learning materials, including technology, to achieve learning objectives." }
    ]
  },
  {
    id: 5,
    title: "5. Assessment and Reporting",
    questions: [
      { key: "q5_1", desc: "My teacher develops, chooses, organizes, and implements assessment strategies that are in accordance with learning objectives." },
      { key: "q5_2", desc: "My teacher utilizes student performance information to monitor and evaluate student progress." },
      { key: "q5_3", desc: "My teacher informs important stakeholders as soon as possible and clearly about the needs, development, and accomplishments of the students." }
    ]
  },
  {
    id: 6,
    title: "6. Community Linkages and Professional Engagement",
    questions: [
      { key: "q6_1", desc: "My teacher creates ties with the rest of the school community to encourage participation in the educational process." },
      { key: "q6_2", desc: "My teacher shows evidence of examining personal teaching governing the teaching profession, as shown from the ethical and moral behavior of the teacher." },
      { key: "q6_3", desc: "My teacher consistently follows and puts into practice school rules and regulations to promote positive interactions between students, parents, and other partners." }
    ]
  },
  {
    id: 7,
    title: "7. Personal Growth and Professional Development",
    questions: [
      { key: "q7_1", desc: "My teacher practices attitudes that protect the honor of teaching as a profession by acting with care, integrity, and respect." },
      { key: "q7_2", desc: "My teacher participates in professional communities to exchange knowledge and improve practice." },
      { key: "q7_3", desc: "My teacher shows evidence of creating a personal growth strategy based on reflection on work and continued professional education." },
      { key: "q7_4", desc: "My teacher shows evidence of established professional learning goals aligned with professional teachers' standards." }
    ]
  }
];

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

export default function EvalForm() {
  const navigate = useNavigate();
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [strengths, setStrengths] = useState('');
  const [improvements, setImprovements] = useState('');

  // 23 questions state
  const [ratings, setRatings] = useState({
    q1_1: null, q1_2: null, q1_3: null, q1_4: null,
    q2_1: null, q2_2: null, q2_3: null,
    q3_1: null, q3_2: null, q3_3: null,
    q4_1: null, q4_2: null, q4_3: null,
    q5_1: null, q5_2: null, q5_3: null,
    q6_1: null, q6_2: null, q6_3: null,
    q7_1: null, q7_2: null, q7_3: null, q7_4: null,
  });

  const [hoveredKey, setHoveredKey] = useState(null);
  const [hoveredValue, setHoveredValue] = useState(null);

  const handleRating = (key, val) => {
    setRatings(prev => ({ ...prev, [key]: Number(val) }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setShowConfirmModal(true);
  };

  const confirmSubmit = () => {
    setShowConfirmModal(false);
    navigate('/student/evallist');
  };

  const totalQuestions = 23;
  const answeredCount = Object.values(ratings).filter(r => r !== null).length;
  const progressPercent = (answeredCount / totalQuestions) * 100;
  const isFormComplete = answeredCount === totalQuestions;

  return (
    <>
      <PageHeader title="PPST Faculty Appraisal Form" breadcrumb="Student Portal" />

      <div className="p-8 overflow-y-auto flex-1 max-w-4xl mx-auto w-full space-y-6 relative">
        
        {/* Sticky Context Banner & Progress Bar */}
        <div className="sticky top-0 bg-white/95 backdrop-blur-md z-35 border border-slate-200 shadow-sm rounded-xl p-4 flex flex-col sm:flex-row justify-between items-center gap-4 transition-all duration-300">
          <div className="text-center sm:text-left">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Evaluating Instructor</span>
            <h3 className="text-sm font-extrabold text-slate-900 mt-0.5 font-display">Prof. Amanda Rivera</h3>
            <p className="text-[11px] text-slate-500 font-mono">IT201 • Data Structures and Algorithms</p>
          </div>
          
          <div className="w-full sm:w-auto flex flex-col sm:items-end gap-1.5">
            <div className="flex justify-between items-center text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              <span>Appraisal Progress</span>
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
          <span className="hover:text-sage-600 cursor-pointer" onClick={() => navigate('/student/evallist')}>
            Evaluations
          </span>
          <ChevronRight className="h-3 w-3" />
          <span className="font-medium text-slate-900 font-sans">Appraisal Form</span>
        </div>

        {/* Anonymity Alert Box */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex gap-3">
          <ShieldAlert className="h-5 w-5 text-sage-600 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="font-bold text-sm text-slate-900 text-left">Compliance & Privacy Guarantee</h4>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed text-left">
              In accordance with school policy, evaluations are fully anonymized. Individual ratings are converted to aggregated index scores, and comments are shuffled dynamically to prevent identification.
            </p>
          </div>
        </div>

        {/* Scoring Guide */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 text-left">PPST Performance Appraisal Rating Scale</h4>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-left">
            {[1, 2, 3, 4].map(val => (
              <div key={val} className="border border-slate-100 rounded-lg p-2.5 bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-sage-600 text-white font-mono text-[10px] font-bold flex items-center justify-center">{val}</span>
                  <span className="text-xs font-bold text-slate-800">{ratingLabels[val]}</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">{ratingDesc[val]}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-8">
          
          {/* Categories Deck */}
          {categories.map((cat) => (
            <div key={cat.id} className="space-y-4">
              {/* Category Header */}
              <div className="bg-slate-100 border-l-4 border-sage-600 px-4 py-2.5 rounded-r-lg">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide text-left">
                  {cat.title}
                </h3>
              </div>

              {/* Questions within Category */}
              <div className="space-y-4">
                {cat.questions.map((item, qIdx) => {
                  const selectedValue = ratings[item.key];
                  const isHovered = hoveredKey === item.key;
                  const displayValue = isHovered ? hoveredValue : selectedValue;
                  const activeLabel = displayValue !== null ? ratingLabels[displayValue] : 'Select score...';

                  return (
                    <div 
                      key={item.key} 
                      className={cn(
                        "bg-white rounded-xl border p-5 shadow-sm hover:shadow-md hover:border-slate-300 transition-all space-y-3",
                        selectedValue !== null ? "border-slate-200" : "border-slate-200 border-l-4 border-l-amber-400"
                      )}
                    >
                      <div className="text-left">
                        <p className="text-xs font-bold text-slate-400 font-mono uppercase">Item {cat.id}.{qIdx + 1}</p>
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
                                onMouseEnter={() => { setHoveredKey(item.key); setHoveredValue(val); }}
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
                                  name={item.key}
                                  value={val}
                                  checked={selectedValue === val}
                                  onChange={(e) => handleRating(item.key, e.target.value)}
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
              <p className="text-xs text-slate-400 text-left mt-0.5">Please provide construct feedback for appraisal purposes.</p>
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
              disabled={!isFormComplete}
              className="px-6 py-2.5 text-sm font-semibold bg-sage-600 hover:bg-sage-700 text-white rounded-lg transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-40 disabled:hover:bg-sage-600 disabled:cursor-not-allowed"
            >
              Submit Appraisal <Send className="h-4 w-4" />
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
                <h3 className="text-xl font-bold font-display text-slate-900 text-left">Submit Appraisal?</h3>
                <p className="text-sm text-slate-550 mt-2 text-left">
                  Are you sure you want to submit this PPST Faculty Appraisal for <strong>Prof. Amanda Rivera</strong>? Once submitted, it cannot be modified or re-entered.
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
                  Yes, Submit Appraisal
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </>
  );
}
