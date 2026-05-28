import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { 
  Plus, 
  Trash2, 
  Check, 
  AlertTriangle, 
  Info,
  ChevronRight,
  RefreshCw
} from 'lucide-react';

export default function GradeComponentsSetup() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState([
    { name: 'Written Work (Quizzes, Long Exams)', weight: 30 },
    { name: 'Performance Tasks (Laboratory, Coding Exercises)', weight: 40 },
    { name: 'Quarterly Examination (Midterm Exam)', weight: 30 }
  ]);

  const [totalWeight, setTotalWeight] = useState(100);

  // Recalculate total weight in real time
  useEffect(() => {
    const sum = categories.reduce((acc, curr) => acc + (Number(curr.weight) || 0), 0);
    setTotalWeight(sum);
  }, [categories]);

  const handleWeightChange = (index, val) => {
    const newCats = [...categories];
    newCats[index].weight = val === '' ? '' : Number(val);
    setCategories(newCats);
  };

  const handleNameChange = (index, val) => {
    const newCats = [...categories];
    newCats[index].name = val;
    setCategories(newCats);
  };

  const addCategory = () => {
    setCategories([...categories, { name: 'New Component Category', weight: 0 }]);
  };

  const deleteCategory = (index) => {
    if (categories.length === 1) return;
    const newCats = categories.filter((_, i) => i !== index);
    setCategories(newCats);
  };

  const applyPreset = (presetType) => {
    if (presetType === 'CCS-LEC') {
      setCategories([
        { name: 'Quizzes & Seatworks', weight: 25 },
        { name: 'Assignments & Projects', weight: 35 },
        { name: 'Term Examination', weight: 40 }
      ]);
    } else if (presetType === 'CCS-LAB') {
      setCategories([
        { name: 'Laboratory Activities', weight: 40 },
        { name: 'Practical Exercises', weight: 30 },
        { name: 'Hands-on Exam', weight: 30 }
      ]);
    } else if (presetType === 'DYCI-STD') {
      setCategories([
        { name: 'Class Standing (Quizzes/Activities)', weight: 50 },
        { name: 'Character Rating', weight: 10 },
        { name: 'Term Examination', weight: 40 }
      ]);
    }
  };

  const handleSave = (e) => {
    e.preventDefault();
    if (totalWeight === 100) {
      navigate('/faculty/classrecordslist');
    }
  };

  return (
    <>
      <PageHeader title="Grade Weights Setup" breadcrumb="Faculty Portal" />
      
      <div className="p-8 overflow-y-auto flex-1 max-w-4xl mx-auto w-full space-y-6">
        
        {/* Navigation Breadcrumb detail */}
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span className="hover:text-sage-600 cursor-pointer" onClick={() => navigate('/faculty/classrecordslist')}>
            Class Records
          </span>
          <ChevronRight className="h-3 w-3" />
          <span className="font-medium text-slate-900">Configure Grade Components</span>
        </div>

        {/* Info Box */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex gap-3">
          <Info className="h-5 w-5 text-sage-600 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="font-bold text-sm text-slate-900">Weight Verification Rules</h4>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
              Define the percentage breakdown for this section. The sum of all active component weights must equal exactly <strong>100%</strong> before score logging can begin.
            </p>
          </div>
        </div>

        {/* Preset Pickers */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Quick Presets & Grading Standards
          </h4>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => applyPreset('DYCI-STD')}
              type="button"
              className="px-3.5 py-2 text-xs font-semibold bg-sage-50 hover:bg-sage-100 border border-sage-200 text-sage-800 rounded-lg transition-colors font-bold"
            >
              DYCI Official Standard (50% CS / 10% Char / 40% Exam)
            </button>
            <button
              onClick={() => applyPreset('CCS-LEC')}
              type="button"
              className="px-3.5 py-2 text-xs font-semibold bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-700 transition-colors"
            >
              CCS Lecture Default (25% / 35% / 40%)
            </button>
            <button
              onClick={() => applyPreset('CCS-LAB')}
              type="button"
              className="px-3.5 py-2 text-xs font-semibold bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-700 transition-colors"
            >
              CCS Lab Default (40% / 30% / 30%)
            </button>
          </div>
        </div>

        {/* Main Configuration Card */}
        <form onSubmit={handleSave} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h3 className="font-bold text-sm text-slate-800">Grade Components Breakdown</h3>
              <button
                type="button"
                onClick={addCategory}
                className="px-3 py-1.5 text-xs font-semibold bg-sage-50 hover:bg-sage-100 text-sage-700 rounded-lg border border-sage-200 transition-colors flex items-center gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" /> Add Category
              </button>
            </div>

            <div className="space-y-4">
              {categories.map((cat, idx) => (
                <div key={idx} className="flex gap-4 items-center animate-in fade-in slide-in-from-top-1 duration-150">
                  <div className="flex-1">
                    <input
                      type="text"
                      required
                      placeholder="e.g. Quizzes, Written Exams"
                      value={cat.name}
                      onChange={(e) => handleNameChange(idx, e.target.value)}
                      className="block w-full border border-slate-200 rounded-lg px-3.5 py-2 text-sm focus:ring-1 focus:ring-sage-500 focus:border-sage-500 transition-colors outline-none"
                    />
                  </div>

                  <div className="w-28 flex items-center gap-2">
                    <input
                      type="number"
                      required
                      min="1"
                      max="100"
                      value={cat.weight}
                      onChange={(e) => handleWeightChange(idx, e.target.value)}
                      className="block w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono text-center focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none"
                    />
                    <span className="text-slate-400 font-bold text-sm">%</span>
                  </div>

                  <button
                    type="button"
                    disabled={categories.length === 1}
                    onClick={() => deleteCategory(idx)}
                    className="p-2 border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-200 rounded-lg transition-colors disabled:opacity-40 disabled:hover:text-slate-400 disabled:hover:border-slate-200"
                    title="Delete category"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Sum Calculator Footer */}
          <div className="border-t border-slate-100 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="text-sm font-medium text-slate-500">
                Sum Total Weight: 
              </div>
              <div className={`text-xl font-bold font-mono px-3 py-1 rounded-lg border ${
                totalWeight === 100 
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                  : 'bg-rose-50 text-rose-700 border-rose-200'
              }`}>
                {totalWeight}%
              </div>

              {totalWeight === 100 ? (
                <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                  <Check className="h-4 w-4" /> Component weights total exactly 100%
                </span>
              ) : (
                <span className="text-xs text-rose-600 font-semibold flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4" /> Must equal exactly 100%
                </span>
              )}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => navigate('/faculty/classrecordslist')}
                className="px-5 py-2.5 text-sm font-medium border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={totalWeight !== 100}
                className="px-5 py-2.5 text-sm font-medium bg-sage-600 hover:bg-sage-700 text-white rounded-lg transition-colors shadow-sm disabled:opacity-40 disabled:hover:bg-sage-600 flex items-center gap-1.5"
              >
                Save Configurations
              </button>
            </div>
          </div>

        </form>

      </div>
    </>
  );
}

