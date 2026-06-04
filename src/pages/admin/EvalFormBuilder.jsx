import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { ChevronRight, Save, Plus, Trash2, ArrowUp, ArrowDown, Sparkles, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import SuccessModal from '../../components/SuccessModal';
import { logActivity, resolveActorName } from '../../lib/auditLog';

const PPST_CATEGORIES = [
  "Content Knowledge and Pedagogy",
  "Learning Environment",
  "Diversity of Learners",
  "Teaching, Learning, and Planning",
  "Assessment and Reporting",
  "Community Linkages and Professional Engagement",
  "Personal Growth and Professional Development"
];

const PPST_STANDARD_QUESTIONS = [
  {
    label: "Content Knowledge and Pedagogy",
    description: "My teacher utilizes a variety of instructional methods to improve students' reading and numeracy proficiency.",
    maxRating: 4
  },
  {
    label: "Content Knowledge and Pedagogy",
    description: "My teacher uses different instructional techniques to promote the growth of higher-order thinking abilities such as critical and creative thinking.",
    maxRating: 4
  },
  {
    label: "Content Knowledge and Pedagogy",
    description: "My teacher demonstrates proficient language use to facilitate teaching and learning.",
    maxRating: 4
  },
  {
    label: "Content Knowledge and Pedagogy",
    description: "My teacher uses excellent verbal and nonverbal classroom strategies to promote students' understanding, participation, motivation, and performance.",
    maxRating: 4
  },
  {
    label: "Learning Environment",
    description: "My teacher creates a safe, secure, and learning-focused environment by consistently implementing policies, standards, and procedures, and effectively manages student's behavior using positive, supportive approaches that promote engagement and learning.",
    maxRating: 4
  },
  {
    label: "Learning Environment",
    description: "My teacher organizes classroom structure to engage students in significant inquiry, discovery, and hands-on activities in a variety of physical learning situations, whether individually or in groups.",
    maxRating: 4
  },
  {
    label: "Learning Environment",
    description: "My teacher maintains supportive learning environments that encourage and motivate students to engage, cooperate, and collaborate in active learning.",
    maxRating: 4
  },
  {
    label: "Diversity of Learners",
    description: "My teacher exhibits a learner-centered culture that promotes success by using effective teaching strategies that respond to their linguistic, cultural, socio-economic, and religious backgrounds.",
    maxRating: 4
  },
  {
    label: "Diversity of Learners",
    description: "My teacher plans and implements instructional techniques that are sensitive to the unique educational needs of students who are experiencing challenges.",
    maxRating: 4
  },
  {
    label: "Diversity of Learners",
    description: "My teacher adapts and applies culturally relevant teaching practices to address the needs of indigenous students.",
    maxRating: 4
  },
  {
    label: "Teaching, Learning, and Planning",
    description: "My teacher creates, organizes, and implements a sequential teaching and learning process to meet the specified academic targets in varied teaching situations.",
    maxRating: 4
  },
  {
    label: "Teaching, Learning, and Planning",
    description: "My teacher develops and initiates learning programs to promote usefulness and adaptability to all students' needs.",
    maxRating: 4
  },
  {
    label: "Teaching, Learning, and Planning",
    description: "My teacher chooses, designs, organizes, and applies suitable teaching and learning materials, including technology, to achieve learning objectives.",
    maxRating: 4
  },
  {
    label: "Assessment and Reporting",
    description: "My teacher develops, chooses, organizes, and implements assessment strategies that are in accordance with learning objectives.",
    maxRating: 4
  },
  {
    label: "Assessment and Reporting",
    description: "My teacher utilizes student performance information to monitor and evaluate student progress.",
    maxRating: 4
  },
  {
    label: "Assessment and Reporting",
    description: "My teacher informs important stakeholders as soon as possible and clearly about the needs, development, and accomplishments of the students.",
    maxRating: 4
  },
  {
    label: "Community Linkages and Professional Engagement",
    description: "My teacher creates ties with the rest of the school community to encourage participation in the educational process.",
    maxRating: 4
  },
  {
    label: "Community Linkages and Professional Engagement",
    description: "My teacher shows evidence of examining personal teaching governing the teaching profession, as shown from the ethical and moral behavior of the teacher.",
    maxRating: 4
  },
  {
    label: "Community Linkages and Professional Engagement",
    description: "My teacher consistently follows and puts into practice school rules and regulations to promote positive interactions between students, parents, and other partners.",
    maxRating: 4
  },
  {
    label: "Personal Growth and Professional Development",
    description: "My teacher practices attitudes that protect the honor of teaching as a profession by acting with care, integrity, and respect.",
    maxRating: 4
  },
  {
    label: "Personal Growth and Professional Development",
    description: "My teacher participates in professional communities to exchange knowledge and improve practice.",
    maxRating: 4
  },
  {
    label: "Personal Growth and Professional Development",
    description: "My teacher shows evidence of creating a personal growth strategy based on reflection on work and continued professional education.",
    maxRating: 4
  },
  {
    label: "Personal Growth and Professional Development",
    description: "My teacher shows evidence of established professional learning goals aligned with professional teachers' standards.",
    maxRating: 4
  }
];

export default function EvalFormBuilder() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();
  const params = new URLSearchParams(location.search);
  const templateId = params.get('id');

  const [title, setTitle] = useState('');
  const [criteria, setCriteria] = useState([
    { id: 'c-1', label: 'Content Knowledge and Pedagogy', description: "My teacher utilizes a variety of instructional methods to improve students' reading and numeracy proficiency.", maxRating: 4 },
    { id: 'c-2', label: 'Learning Environment', description: 'My teacher creates a safe, secure, and learning-focused environment by consistently implementing policies, standards, and procedures.', maxRating: 4 }
  ]);
  
  const [errorMsg, setErrorMsg] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);

  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [successModalMessage, setSuccessModalMessage] = useState('');

  useEffect(() => {
    if (templateId) {
      setIsEditMode(true);
      async function loadTemplate() {
        try {
          const { data: existing, error } = await supabase
            .from('evaluation_forms')
            .select('*, evaluation_criteria(*)')
            .eq('form_id', templateId)
            .single();

          if (error) throw error;
          
          if (existing) {
            setTitle(existing.title);
            const sortedCriteria = (existing.evaluation_criteria || [])
              .sort((a, b) => a.order_index - b.order_index)
              .map(c => ({
                id: c.criteria_id,
                label: c.label,
                description: c.description,
                maxRating: c.max_rating,
                isCustomCategory: !PPST_CATEGORIES.includes(c.label)
              }));
            setCriteria(sortedCriteria);
          }
        } catch (err) {
          console.error(err);
          setErrorMsg('Template not found or error loading.');
        }
      }
      loadTemplate();
    }
  }, [templateId]);

  const handlePreFillPPST = () => {
    setTitle("PPST Faculty Appraisal Form");
    const prefilled = PPST_STANDARD_QUESTIONS.map((q, idx) => ({
      id: `c-ppst-${idx}`,
      label: q.label,
      description: q.description,
      maxRating: q.maxRating,
      isCustomCategory: false
    }));
    setCriteria(prefilled);
  };

  const handleAddCriteria = () => {
    const newId = `c-${Math.random().toString(36).substr(2, 9)}`;
    setCriteria([...criteria, {
      id: newId,
      label: 'Content Knowledge and Pedagogy',
      description: '',
      maxRating: 4,
      isCustomCategory: false
    }]);
  };

  const handleRemoveCriteria = (id) => {
    setCriteria(criteria.filter(c => c.id !== id));
  };

  const handleChangeCriteria = (id, field, value) => {
    setCriteria(criteria.map(c => {
      if (c.id === id) {
        if (field === 'label' && value === '__custom__') {
          return { ...c, label: '', isCustomCategory: true };
        }
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

  const handleSave = async (e) => {
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

    try {
      let targetFormId = templateId;

      if (isEditMode) {
        const { error: formErr } = await supabase
          .from('evaluation_forms')
          .update({ title: title.trim() })
          .eq('form_id', templateId);
        
        if (formErr) throw formErr;

        const { error: delErr } = await supabase
          .from('evaluation_criteria')
          .delete()
          .eq('form_id', templateId);

        if (delErr) throw delErr;
      } else {
        const { data: newForm, error: formErr } = await supabase
          .from('evaluation_forms')
          .insert({
            title: title.trim(),
            created_by: user?.id
          })
          .select()
          .single();

        if (formErr) throw formErr;
        targetFormId = newForm.form_id;
      }

      const criteriaToInsert = criteria.map((c, idx) => ({
        form_id: targetFormId,
        label: c.label.trim(),
        description: c.description.trim(),
        max_rating: c.maxRating,
        order_index: idx
      }));

      const { error: insErr } = await supabase
        .from('evaluation_criteria')
        .insert(criteriaToInsert);

      if (insErr) throw insErr;

      const actorName = resolveActorName(profile, user);
      await logActivity(
        isEditMode ? 'Eval Form Update' : 'Eval Form Creation',
        isEditMode
          ? `Updated evaluation form template "${title.trim()}" with ${criteria.length} criteria.`
          : `Created new evaluation form template "${title.trim()}" with ${criteria.length} criteria.`,
        actorName
      );

      setSuccessModalMessage(isEditMode ? "Evaluation form template updated successfully!" : "Evaluation form template saved successfully!");
      setIsSuccessModalOpen(true);
    } catch (err) {
      console.error('Error saving template:', err);
      setErrorMsg('Error saving template: ' + err.message);
    }
  };

  // Group criteria by label (category) for preview
  const groupedCriteria = criteria.reduce((groups, item) => {
    const category = item.label || 'Uncategorized Criteria';
    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(item);
    return groups;
  }, {});

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
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Evaluation Questions & Criteria</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePreFillPPST}
                    className="px-3 py-1 bg-violet-50 hover:bg-violet-100 text-violet-700 rounded-md text-xs font-bold transition-colors flex items-center gap-1 border border-violet-100 shadow-sm animate-pulse"
                    title="Load standard 7 categories & 23 questions from PPST student form"
                  >
                    <Sparkles className="h-3.5 w-3.5" /> Pre-fill PPST Template
                  </button>
                  <button
                    type="button"
                    onClick={handleAddCriteria}
                    className="px-3 py-1 bg-sage-50 text-sage-700 hover:bg-sage-100 rounded-md text-xs font-bold transition-colors flex items-center gap-1 border border-sage-100 shadow-sm"
                  >
                    <Plus className="h-3 w-3" /> Add Criteria
                  </button>
                </div>
              </div>

              <div className="space-y-4 max-h-[450px] overflow-y-auto pr-1">
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
                      {/* Label/Category Selector */}
                      <div className="sm:col-span-3 flex flex-col gap-1.5 text-left">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Category</label>
                        {!crit.isCustomCategory && PPST_CATEGORIES.includes(crit.label) ? (
                          <select
                            required
                            value={crit.label}
                            onChange={(e) => handleChangeCriteria(crit.id, 'label', e.target.value)}
                            className="block w-full bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-xs outline-none cursor-pointer font-semibold focus:border-sage-500 focus:ring-1 focus:ring-sage-500"
                          >
                            <option value="">Select PPST Category...</option>
                            {PPST_CATEGORIES.map((cat) => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                            <option value="__custom__">Other / Custom Category...</option>
                          </select>
                        ) : (
                          <div className="flex gap-2">
                            <input 
                              type="text" 
                              required
                              value={crit.label}
                              onChange={(e) => handleChangeCriteria(crit.id, 'label', e.target.value)}
                              placeholder="Enter Custom Category Name"
                              className="block flex-1 px-3 py-1.5 border border-slate-200 focus:border-sage-500 rounded-lg text-xs outline-none bg-white transition-all focus:ring-1 focus:ring-sage-500 font-semibold"
                            />
                            <button
                              type="button"
                              onClick={() => handleChangeCriteria(crit.id, 'isCustomCategory', false)}
                              className="px-2 py-1 text-slate-550 hover:text-slate-800 hover:bg-slate-100 text-xs border border-slate-200 rounded-md transition-colors"
                            >
                              Standard
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Max Rating */}
                      <div className="flex flex-col gap-1.5 text-left">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Max Score</label>
                        <select
                          value={crit.maxRating}
                          onChange={(e) => handleChangeCriteria(crit.id, 'maxRating', parseInt(e.target.value))}
                          className="block w-full bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-xs outline-none cursor-pointer focus:border-sage-500 focus:ring-1 focus:ring-sage-500"
                        >
                          <option value="4">Max 4 (PPST Scale)</option>
                          <option value="5">Max 5</option>
                          <option value="10">Max 10</option>
                        </select>
                      </div>

                      {/* Description */}
                      <div className="sm:col-span-4 flex flex-col gap-1.5 text-left">
                        <label className="text-[10px] font-bold text-slate-550 uppercase tracking-wider">Evaluation Prompt / Question</label>
                        <textarea 
                          required
                          value={crit.description}
                          onChange={(e) => handleChangeCriteria(crit.id, 'description', e.target.value)}
                          placeholder="e.g. Explains complex topics clearly with relevant examples."
                          rows="2"
                          className="block w-full px-3 py-1.5 border border-slate-200 focus:border-sage-500 rounded-lg text-xs outline-none bg-white transition-all focus:ring-1 focus:ring-sage-500 leading-relaxed font-sans"
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
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 space-y-4 lg:sticky lg:top-6">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-violet-600" /> Student View Live Preview
            </h3>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              {/* Preview Header */}
              <div className="p-5 border-b border-slate-100 bg-slate-900 text-white text-left">
                <span className="text-[10px] font-mono font-semibold tracking-wide text-sage-400 bg-slate-800 px-2 py-0.5 rounded">
                  STUDENT PORTAL
                </span>
                <h4 className="text-sm font-bold mt-2 font-display text-white">
                  {title || 'Faculty Evaluation Form'}
                </h4>
                <p className="text-[11px] text-slate-400 mt-1">Evaluator Identity: <span className="font-semibold text-emerald-400">Anonymized</span></p>
              </div>

              {/* Preview Form Content */}
              <div className="p-5 space-y-5 max-h-[480px] overflow-y-auto">
                <div className="bg-emerald-50/50 border border-emerald-100 rounded-lg p-3 text-[11px] text-emerald-800 leading-normal text-left">
                  <strong>Evaluation Security:</strong> Your response is fully anonymized. The faculty member will see comments and criteria scores, but student identities are stripped from the records.
                </div>

                {Object.keys(groupedCriteria).map((category, catIdx) => (
                  <div key={category} className="space-y-3 text-left">
                    {/* Category Header */}
                    <div className="bg-slate-150 border-l-4 border-sage-600 px-3 py-1.5 rounded-r-lg bg-slate-100">
                      <h6 className="text-[10px] font-extrabold text-slate-700 uppercase tracking-wide">
                        {category}
                      </h6>
                    </div>

                    <div className="space-y-4 pl-1">
                      {groupedCriteria[category].map((crit, idx) => (
                        <div key={crit.id} className="space-y-2 pb-4 border-b border-slate-100 last:border-b-0 last:pb-0">
                          <div className="flex justify-between items-start">
                            <span className="text-[9px] font-mono text-slate-400">Item {catIdx + 1}.{idx + 1}</span>
                          </div>
                          <h5 className="text-xs font-semibold text-slate-850 leading-normal">
                            {crit.description || 'Provide question details...'}
                          </h5>

                          {/* Rating buttons */}
                          <div className="flex gap-1.5 pt-1">
                            {Array.from({ length: crit.maxRating || 4 }).map((_, rIdx) => (
                              <div 
                                key={rIdx} 
                                className="w-7 h-7 rounded-full border border-slate-200 text-[10px] font-mono font-bold flex items-center justify-center cursor-not-allowed hover:bg-slate-50 select-none text-slate-500"
                              >
                                {rIdx + 1}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {/* Optional Comments */}
                <div className="space-y-1.5 pt-2 text-left">
                  <h5 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Qualitative Evaluation comments</h5>
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

      <SuccessModal
        isOpen={isSuccessModalOpen}
        message={successModalMessage}
        onClose={() => {
          setIsSuccessModalOpen(false);
          navigate('/admin/evalformslist');
        }}
      />
    </>
  );
}
