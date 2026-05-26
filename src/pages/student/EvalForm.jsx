import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { ChevronRight, ShieldAlert, Send, Check } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function EvalForm() {
  const navigate = useNavigate();
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [comment, setComment] = useState('');
  
  // Criteria questions initialized to null to allow dynamic progress tracking
  const [ratings, setRatings] = useState({
    q1: null,
    q2: null,
    q3: null,
    q4: null,
    q5: null
  });

  // Track hovered ratings per question for dynamic tooltip feedback
  const [hoveredRatings, setHoveredRatings] = useState({
    q1: null,
    q2: null,
    q3: null,
    q4: null,
    q5: null
  });

  const criteriaList = [
    { key: 'q1', title: 'Mastery of Subject Matter', desc: 'Explains concepts clearly and accurately, demonstrates deep academic familiarity.' },
    { key: 'q2', title: 'Teaching Methodology', desc: 'Maintains engaging presentations, manages session time efficiently, uses lab materials well.' },
    { key: 'q3', title: 'Classroom Management', desc: 'Fosters mutual respect, maintains discipline and a productive environment.' },
    { key: 'q4', title: 'Interpersonal Relations', desc: 'Approachable, fair in grading, and accommodates student consultation hours.' },
    { key: 'q5', title: 'Professionalism & Commitment', desc: 'Consistently punctual, adheres to standard university policies, and shows enthusiasm.' }
  ];

  const ratingLabels = {
    1: 'Poor',
    2: 'Fair',
    3: 'Satisfactory',
    4: 'Very Satisfactory',
    5: 'Outstanding'
  };

  const handleRating = (key, val) => {
    setRatings({ ...ratings, [key]: Number(val) });
  };

  const handleHover = (key, val) => {
    setHoveredRatings({ ...hoveredRatings, [key]: val });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setShowConfirmModal(true);
  };

  const confirmSubmit = () => {
    setShowConfirmModal(false);
    navigate('/student/evallist');
  };

  const answeredCount = Object.values(ratings).filter(r => r !== null).length;
  const progressPercent = (answeredCount / criteriaList.length) * 100;
  const isFormComplete = answeredCount === criteriaList.length;

  return (
    <>
      <PageHeader title="Faculty Evaluation Form" breadcrumb="Student Portal" />

      <div className="p-8 overflow-y-auto flex-1 max-w-4xl mx-auto w-full space-y-6 relative">
        
        {/* Sticky Context Banner & Progress Bar */}
        <div className="sticky top-0 bg-white/95 backdrop-blur-md z-35 border border-slate-200 shadow-sm rounded-xl p-4 flex flex-col sm:flex-row justify-between items-center gap-4 transition-all duration-300">
          <div className="text-center sm:text-left">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Evaluating Instructor</span>
            <h3 className="text-sm font-extrabold text-slate-900 mt-0.5">Prof. Amanda Rivera</h3>
            <p className="text-[11px] text-slate-500">IT201 • Data Structures and Algorithms</p>
          </div>
          
          <div className="w-full sm:w-auto flex flex-col sm:items-end gap-1.5">
            <div className="flex justify-between items-center text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              <span>Progress</span>
              <span className="font-mono font-bold text-slate-700">{answeredCount} of {criteriaList.length} Rated</span>
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
          <span className="font-medium text-slate-900">Prof. Rivera</span>
        </div>

        {/* Anonymity Alert Box */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex gap-3">
          <ShieldAlert className="h-5 w-5 text-sage-600 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="font-bold text-sm text-slate-900 text-left">Compliance & Privacy Guarantee</h4>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed text-left">
              This form is subject to strict student privacy protection. Submitted ratings are aggregated and comment logs randomized. No user identification parameters are passed.
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* Questions deck */}
          <div className="space-y-6">
            {criteriaList.map((item, idx) => {
              const selectedValue = ratings[item.key];
              const hoveredValue = hoveredRatings[item.key];
              const activeDisplayLabel = hoveredValue !== null 
                ? ratingLabels[hoveredValue] 
                : selectedValue !== null 
                  ? ratingLabels[selectedValue] 
                  : 'Select score...';

              return (
                <div 
                  key={item.key} 
                  className={cn(
                    "bg-white rounded-xl border p-6 shadow-sm hover:shadow-md hover:border-slate-300 transition-all space-y-4",
                    selectedValue !== null ? "border-slate-200" : "border-slate-200 border-l-4 border-l-amber-400"
                  )}
                >
                  <div className="space-y-1">
                    <h4 className="text-base font-bold text-slate-900 text-left">
                      {idx + 1}. {item.title}
                    </h4>
                    <p className="text-xs text-slate-500 max-w-2xl text-left">{item.desc}</p>
                  </div>

                  {/* Rating Selector Block */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 border-t border-slate-100">
                    
                    {/* Anchors and Radios container */}
                    <div className="flex items-center gap-3">
                      {/* Left anchor */}
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider hidden xs:block">Poor</span>
                      
                      {/* Radios Group */}
                      <div className="flex items-center gap-2">
                        {[1, 2, 3, 4, 5].map((val) => (
                          <label 
                            key={val}
                            onMouseEnter={() => handleHover(item.key, val)}
                            onMouseLeave={() => handleHover(item.key, null)}
                            className={cn(
                              "w-11 h-11 rounded-full border text-xs font-mono font-bold flex items-center justify-center cursor-pointer transition-all select-none p-1",
                              selectedValue === val
                                ? 'bg-sage-600 border-sage-600 text-white shadow-sm shadow-sage-500/25 scale-105'
                                : 'bg-white border-slate-200 text-slate-550 hover:bg-sage-50/50 hover:border-sage-400 hover:text-sage-900'
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

                      {/* Right anchor */}
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider hidden xs:block">Outstanding</span>
                    </div>

                    {/* Contextual dynamic label */}
                    <div className="text-left sm:text-right">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Rating</span>
                      <span className={cn(
                        "text-xs font-bold transition-all",
                        selectedValue !== null ? "text-sage-700" : "text-slate-400 italic"
                      )}>
                        {activeDisplayLabel}
                      </span>
                    </div>

                  </div>
                </div>
              );
            })}
          </div>

          {/* Comments block */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-3">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center">
              Additional Feedback / Comments
              <span className="text-[10px] font-normal italic text-slate-400 lowercase ml-1 select-none">(optional)</span>
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows="4"
              placeholder="Provide constructive comments regarding pacing, classroom resources, or teaching styles..."
              className="block w-full border border-slate-200 rounded-lg p-3.5 text-xs focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none transition-colors"
            />
          </div>

          {/* Form Actions */}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => navigate('/student/evallist')}
              className="px-5 py-2.5 text-sm font-medium border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg transition-colors bg-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isFormComplete}
              className="px-5 py-2.5 text-sm font-medium bg-sage-600 hover:bg-sage-700 text-white rounded-lg transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-40 disabled:hover:bg-sage-600 disabled:cursor-not-allowed"
            >
              Submit Evaluation <Send className="h-4 w-4" />
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
                <h3 className="text-xl font-bold font-display text-slate-900">Submit Anonymous Feedback?</h3>
                <p className="text-sm text-slate-550 mt-2">
                  Are you sure you want to submit this evaluation for <strong>Prof. Amanda Rivera</strong>? Once submitted, it cannot be modified, edited, or re-entered.
                </p>
              </div>
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                <button 
                  onClick={() => setShowConfirmModal(false)}
                  className="px-4 py-2 text-sm font-medium border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmSubmit}
                  className="px-4 py-2 text-sm font-medium bg-sage-600 hover:bg-sage-700 text-white rounded-lg transition-colors shadow-sm"
                >
                  Yes, Submit Feedback
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </>
  );
}

