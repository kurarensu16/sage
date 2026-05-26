import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { ChevronRight, Save, Plus, Trash2, ArrowUp, ArrowDown, Sparkles, FileText } from 'lucide-react';
import { mockDb } from '../../lib/mockDb';

export default function EvalFormBuilder() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const templateId = params.get('id');

  const [title, setTitle] = useState('');
  const [criteria, setCriteria] = useState([
    { id: 'c-1', label: 'Teaching Effectiveness', description: 'Explains complex topics clearly with relevant examples.', maxRating: 5 },
    { id: 'c-2', label: 'Communication & Engagement', description: 'Addresses student inquiries patiently and professionally.', maxRating: 5 }
  ]);
  
  const [errorMsg, setErrorMsg] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);

  useEffect(() => {
    if (templateId) {
      setIsEditMode(true);
      const templates = mockDb.getEvalTemplates();
      const existing = templates.find(t => t.id === templateId);
      if (existing) {
        setTitle(existing.title);
        setCriteria(existing.criteria);
      } else {
        setErrorMsg('Template not found.');
      }
    }
  }, [templateId]);

  const handleAddCriteria = () => {
    const newId = `c-${Math.random().toString(36).substr(2, 9)}`;
    setCriteria([...criteria, {
      id: newId,
      label: '',
      description: '',
      maxRating: 5
    }]);
  };

  const handleRemoveCriteria = (id) => {
    setCriteria(criteria.filter(c => c.id !== id));
  };

  const handleChangeCriteria = (id, field, value) => {
    setCriteria(criteria.map(c => {
      if (c.id === id) {
        return { ...c, [field]: value };
      }
      return c;
    }));
  };

  const handleMove = (index, direction) => {
    const nextIndex = direction === 'up' ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= criteria.length) return;

    const list = [...criteria];
    const temp = list[index];
    list[index] = list[nextIndex];
    list[nextIndex] = temp;
    setCriteria(list);
  };

  const handleSave = (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!title.trim()) {
      setErrorMsg('Please provide a title for the evaluation form.');
      return;
    }

    if (criteria.length === 0) {
      setErrorMsg('Please add at least one criteria item.');
      return;
    }

    const invalid = criteria.some(c => !c.label.trim() || !c.description.trim());
    if (invalid) {
      setErrorMsg('Please complete all criteria label and description fields.');
      return;
    }

    const templateToSave = {
      title: title.trim(),
      criteria: criteria.map((c, idx) => ({
        ...c,
        label: c.label.trim(),
        description: c.description.trim(),
        orderIndex: idx
      })),
      author: 'Admin System Control'
    };

    if (isEditMode) {
      templateToSave.id = templateId;
    }

    mockDb.saveEvalTemplate(templateToSave);
    navigate('/admin/evalformslist');
  };

  return (
    <>
      <PageHeader 
        title={isEditMode ? "Edit Evaluation Form" : "Create Evaluation Form"} 
        breadcrumb="Admin Portal" 
      />

      <div className="p-8 overflow-y-auto flex-1 space-y-6">
        
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span className="hover:text-sage-600 cursor-pointer transition-colors" onClick={() => navigate('/admin/evalformslist')}>
            Evaluation Forms
          </span>
          <ChevronRight className="h-3 w-3" />
          <span className="font-medium text-slate-900">
            {isEditMode ? "Form Builder (Edit)" : "Form Builder (New)"}
          </span>
        </div>

        {errorMsg && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 p-4 rounded-lg text-sm font-semibold">
            {errorMsg}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          
          {/* Form Editor Card */}
          <form onSubmit={handleSave} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6 flex flex-col">
            <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
              <div className="p-2 bg-sage-50 text-sage-600 rounded-lg">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold font-display text-slate-900">Form Templates Details</h3>
                <p className="text-xs text-slate-500 mt-0.5 font-sans">Define criteria, prompts, and score limits.</p>
              </div>
            </div>

            {/* Template Title */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Template Title <span className="text-rose-500">*</span></label>
              <input 
                type="text" 
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. AY 2025-2026 Semester 2 Faculty Evaluation"
                className="block w-full px-3.5 py-2.5 border border-slate-200 hover:border-slate-300 focus:border-sage-500 rounded-lg text-sm outline-none transition-all focus:ring-1 focus:ring-sage-500"
              />
            </div>

            {/* Criteria Editor */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Evaluation Questions & Criteria</label>
                <button
                  type="button"
                  onClick={handleAddCriteria}
                  className="px-3 py-1 bg-sage-50 text-sage-700 hover:bg-sage-100 rounded-md text-xs font-bold transition-colors flex items-center gap-1 border border-sage-100"
                >
                  <Plus className="h-3 w-3" /> Add Criteria
                </button>
              </div>

              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1">
                {criteria.map((crit, index) => (
                  <div key={crit.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 relative group">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-sage-700 font-mono">Criteria #{index + 1}</span>
                      
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => handleMove(index, 'up')}
                          className="p-1 text-slate-400 hover:text-slate-700 disabled:text-slate-200 transition-colors"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={index === criteria.length - 1}
                          onClick={() => handleMove(index, 'down')}
                          className="p-1 text-slate-400 hover:text-slate-700 disabled:text-slate-200 transition-colors"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveCriteria(crit.id)}
                          className="p-1 text-rose-500 hover:text-rose-700 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      {/* Label */}
                      <div className="sm:col-span-3 flex flex-col gap-1">
                        <input 
                          type="text" 
                          required
                          value={crit.label}
                          onChange={(e) => handleChangeCriteria(crit.id, 'label', e.target.value)}
                          placeholder="e.g. Teaching Effectiveness"
                          className="block w-full px-3 py-1.5 border border-slate-200 focus:border-sage-500 rounded-lg text-xs outline-none bg-white transition-all focus:ring-1 focus:ring-sage-500 font-semibold"
                        />
                      </div>

                      {/* Max Rating */}
                      <div className="flex flex-col gap-1">
                        <select
                          value={crit.maxRating}
                          onChange={(e) => handleChangeCriteria(crit.id, 'maxRating', parseInt(e.target.value))}
                          className="block w-full bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-xs outline-none cursor-pointer"
                        >
                          <option value="5">Max 5</option>
                          <option value="10">Max 10</option>
                        </select>
                      </div>

                      {/* Description */}
                      <div className="sm:col-span-4 flex flex-col gap-1">
                        <textarea 
                          required
                          value={crit.description}
                          onChange={(e) => handleChangeCriteria(crit.id, 'description', e.target.value)}
                          placeholder="e.g. Explains complex topics clearly with relevant examples."
                          rows="2"
                          className="block w-full px-3 py-1.5 border border-slate-200 focus:border-sage-500 rounded-lg text-xs outline-none bg-white transition-all focus:ring-1 focus:ring-sage-500 leading-relaxed"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
              <button 
                type="button" 
                onClick={() => navigate('/admin/evalformslist')}
                className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="px-4 py-2 bg-sage-600 hover:bg-sage-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm"
              >
                <Save className="h-4 w-4" /> Save Template
              </button>
            </div>
          </form>

          {/* High-Fidelity Side Live Preview Panel */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 space-y-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-violet-600" /> Student View Live Preview
            </h3>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              {/* Preview Header */}
              <div className="p-5 border-b border-slate-100 bg-slate-900 text-white">
                <span className="text-[10px] font-mono font-semibold tracking-wide text-sage-400 bg-slate-800 px-2 py-0.5 rounded">
                  STUDENT PORTAL
                </span>
                <h4 className="text-sm font-bold mt-2 font-display">
                  {title || 'Faculty Evaluation Form'}
                </h4>
                <p className="text-[11px] text-slate-400 mt-1">Evaluator Identity: <span className="font-semibold text-emerald-400">Anonymized</span></p>
              </div>

              {/* Preview Form Content */}
              <div className="p-5 space-y-5 max-h-[450px] overflow-y-auto">
                <div className="bg-emerald-50/50 border border-emerald-100 rounded-lg p-3 text-[11px] text-emerald-800 leading-normal">
                  <strong>Evaluation Security:</strong> Your response is fully anonymized. The faculty member will see comments and criteria scores, but student identities are stripped from the records.
                </div>

                {criteria.map((crit, idx) => (
                  <div key={crit.id} className="space-y-2 pb-4 border-b border-slate-100 last:border-b-0">
                    <div className="flex justify-between items-start">
                      <span className="text-[11px] font-mono text-slate-400">Question {idx + 1}</span>
                    </div>
                    <h5 className="text-sm font-bold text-slate-800">
                      {crit.label || `Criteria Label #${idx + 1}`}
                    </h5>
                    <p className="text-xs text-slate-500 leading-normal">
                      {crit.description || 'Provide question details...'}
                    </p>

                    {/* Rating buttons */}
                    <div className="flex gap-2 pt-1.5">
                      {Array.from({ length: crit.maxRating || 5 }).map((_, rIdx) => (
                        <div 
                          key={rIdx} 
                          className="w-8 h-8 rounded-full border border-slate-200 text-xs font-mono font-medium flex items-center justify-center cursor-not-allowed hover:bg-slate-50 select-none text-slate-500"
                        >
                          {rIdx + 1}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {/* Optional Comments */}
                <div className="space-y-1.5 pt-2">
                  <h5 className="text-sm font-bold text-slate-800">Qualitative Evaluation comments</h5>
                  <textarea 
                    disabled 
                    rows="2"
                    placeholder="Enter anonymized comments for instructor..."
                    className="block w-full border border-slate-200 rounded-lg p-2 text-xs bg-slate-50 text-slate-400 cursor-not-allowed resize-none"
                  />
                </div>
              </div>
            </div>
          </div>

        </div>

      </div>
    </>
  );
}
