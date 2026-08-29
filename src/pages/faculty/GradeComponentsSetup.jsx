import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { 
  Check, 
  Info,
  ChevronRight,
  RefreshCw,
  Save,
  AlertCircle
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { logActivity, resolveActorName } from '../../lib/auditLog';
import { cn } from '../../lib/utils';

export default function GradeComponentsSetup() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();
  const classRecordId = new URLSearchParams(location.search).get('id');

  const [classInfo, setClassInfo] = useState(null);
  const [adminTemplates, setAdminTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTerm, setActiveTerm] = useState('Prelim');
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const [columnsData, setColumnsData] = useState({
    Prelim: { act1_max: 20, act2_max: 20, act3_max: 20, act4_max: 20, act5_max: 20, act6_max: 10, exam_max: 40 },
    Midterm: { act1_max: 20, act2_max: 20, act3_max: 20, act4_max: 20, act5_max: 20, act6_max: 10, exam_max: 40 },
    'Semi-Final': { act1_max: 20, act2_max: 20, act3_max: 20, act4_max: 20, act5_max: 20, act6_max: 10, exam_max: 40 },
    Final: { act1_max: 20, act2_max: 20, act3_max: 20, act4_max: 20, act5_max: 20, act6_max: 10, exam_max: 40 }
  });

  const termsList = ['Prelim', 'Midterm', 'Semi-Final', 'Final'];

  useEffect(() => {
    async function loadData() {
      if (!classRecordId || !user) return;
      setLoading(true);
      try {
        // 1. Fetch class record info
        const { data: cr, error: crErr } = await supabase
          .from('class_records')
          .select(`
            class_record_id,
            school_year,
            semester,
            subjects ( code, name, computation_id ),
            sections ( name )
          `)
          .eq('class_record_id', classRecordId)
          .single();

        if (crErr) throw crErr;
        setClassInfo(cr);

        // 2. Fetch live Admin Grade Computation Templates
        const { data: templatesData, error: tempErr } = await supabase
          .from('grade_computations')
          .select('*, grade_computation_components(*)');

        if (!tempErr && templatesData) {
          setAdminTemplates(templatesData);
          if (cr?.subjects?.computation_id) {
            const matchedTemplate = templatesData.find(t => t.computation_id === cr.subjects.computation_id);
            if (matchedTemplate) {
              setSelectedTemplateId(matchedTemplate.computation_id);
            }
          } else {
            const fallbackTemplate = templatesData.find(t => t.name === 'General / Professional Education Scale');
            if (fallbackTemplate) {
              setSelectedTemplateId(fallbackTemplate.computation_id);
            }
          }
        }

        // 3. Fetch configured grading columns for this class
        const { data: cols, error: colsErr } = await supabase
          .from('class_grading_columns')
          .select('*')
          .eq('class_record_id', classRecordId);

        if (colsErr) throw colsErr;

        if (cols && cols.length > 0) {
          const loadedData = { ...columnsData };
          cols.forEach(row => {
            if (loadedData[row.term]) {
              loadedData[row.term] = {
                act1_max: row.act1_max,
                act2_max: row.act2_max,
                act3_max: row.act3_max,
                act4_max: row.act4_max,
                act5_max: row.act5_max,
                act6_max: row.act6_max,
                exam_max: row.exam_max
              };
            }
          });
          setColumnsData(loadedData);
        }
      } catch (err) {
        console.error('Error loading grade weight setup:', err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [classRecordId, user]);

  const handleMaxChange = (term, key, val) => {
    setColumnsData(prev => ({
      ...prev,
      [term]: {
        ...prev[term],
        [key]: val === '' ? '' : Math.max(1, parseInt(val) || 0)
      }
    }));
  };

  const applyAdminTemplate = (template) => {
    setSelectedTemplateId(template.computation_id);
    const comps = template.grade_computation_components || [];
    
    // Find formative/class standing & exam components
    const csComp = comps.find(c => (c.name || '').toLowerCase().includes('class standing') || (c.name || '').toLowerCase().includes('formative')) || comps[0];
    const examComp = comps.find(c => (c.name || '').toLowerCase().includes('exam') || (c.name || '').toLowerCase().includes('major')) || comps[1];

    const faMax = csComp?.max_score ? parseFloat(csComp.max_score) : 20;
    const examMax = examComp?.max_score ? parseFloat(examComp.max_score) : 40;

    const preset = {
      act1_max: faMax,
      act2_max: faMax,
      act3_max: faMax,
      act4_max: faMax,
      act5_max: faMax,
      act6_max: Math.round(faMax / 2) || 10,
      exam_max: examMax
    };

    setColumnsData(prev => {
      const updated = { ...prev };
      termsList.forEach(t => {
        updated[t] = { ...preset };
      });
      return updated;
    });
  };

  const applyPreset = (presetType) => {
    setSelectedTemplateId(null);
    let preset = {};
    if (presetType === 'DYCI-STD') {
      preset = { act1_max: 20, act2_max: 20, act3_max: 20, act4_max: 20, act5_max: 20, act6_max: 10, exam_max: 40 };
    } else if (presetType === 'QUIZ-HEAVY') {
      preset = { act1_max: 50, act2_max: 50, act3_max: 50, act4_max: 50, act5_max: 50, act6_max: 30, exam_max: 100 };
    } else if (presetType === 'SHORT-QUIZ') {
      preset = { act1_max: 10, act2_max: 10, act3_max: 10, act4_max: 10, act5_max: 10, act6_max: 5, exam_max: 30 };
    }

    setColumnsData(prev => {
      const updated = { ...prev };
      termsList.forEach(t => {
        updated[t] = { ...preset };
      });
      return updated;
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!classRecordId) return;

    try {
      const upsertRows = termsList.map(term => ({
        class_record_id: classRecordId,
        term,
        act1_max: columnsData[term].act1_max || 20,
        act2_max: columnsData[term].act2_max || 20,
        act3_max: columnsData[term].act3_max || 20,
        act4_max: columnsData[term].act4_max || 20,
        act5_max: columnsData[term].act5_max || 20,
        act6_max: columnsData[term].act6_max || 10,
        exam_max: columnsData[term].exam_max || 40
      }));

      const { error } = await supabase
        .from('class_grading_columns')
        .upsert(upsertRows, { onConflict: 'class_record_id,term' });

      if (error) throw error;

      // Log activity
      const actorName = resolveActorName(profile, user);
      const subjCode = classInfo?.subjects?.code || '';
      const sectName = classInfo?.sections?.name || '';
      await logActivity(
        'Grade Component Setup',
        `Configured formative assessment and exam maximum points for ${subjCode} (${sectName}) across all terms`,
        actorName
      );

      setSuccessMessage(`Grade columns configuration for ${subjCode} (${sectName}) has been successfully saved.`);
      setShowSuccess(true);
    } catch (err) {
      console.error('Error saving grade configurations:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-sage-600"></div>
          <p className="text-sm text-slate-500 font-medium font-sans">Loading configurations...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Grade Columns Setup" breadcrumb="Faculty Portal" />
      
      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 max-w-4xl mx-auto w-full space-y-4 sm:space-y-6">
        
        {/* Navigation Breadcrumb */}
        <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-slate-500">
          <span className="hover:text-sage-600 cursor-pointer transition-colors" onClick={() => navigate('/faculty/classrecordslist')}>
            Class Records
          </span>
          <ChevronRight className="h-3 w-3 text-slate-400" />
          <span className="font-medium text-slate-900 truncate">
            Configure Columns — {classInfo?.subjects?.code} ({classInfo?.sections?.name})
          </span>
        </div>

        {/* Locked Weights Notice Banner */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 sm:p-4 flex gap-3 text-left shadow-2xs">
          <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="font-bold text-xs sm:text-sm text-amber-900 font-display">Standardized Grading Weights Locked</h4>
            <p className="text-[11px] sm:text-xs text-amber-700 mt-0.5 leading-relaxed font-medium">
              This class is bound to the official template: <strong className="text-amber-950 font-bold">"{adminTemplates.find(t => t.computation_id === selectedTemplateId)?.name || 'General / Professional Education Scale'}"</strong>.
              Manual adjustments and template customizations have been standardly configured by the Academic Administrator to maintain grading integrity across sections.
            </p>
          </div>
        </div>

        {/* Main Configuration Card */}
        <form onSubmit={handleSave} className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 sm:p-6 space-y-4 sm:space-y-6 text-left">
          
          {/* Term Tab Switcher */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-slate-100 no-scrollbar">
            {termsList.map(term => (
              <button
                key={term}
                type="button"
                onClick={() => setActiveTerm(term)}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer whitespace-nowrap flex-shrink-0 ${
                  activeTerm === term 
                    ? 'bg-sage-600 text-white shadow-2xs' 
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700 border border-transparent'
                }`}
              >
                {term}
              </button>
            ))}
          </div>

          <div className="space-y-3 sm:space-y-4">
            <h3 className="font-bold text-xs sm:text-sm text-slate-800 flex items-center gap-1.5 font-sans">
              Configure Max Items — {activeTerm} Period
            </h3>

            {/* Config Fields Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4">
              {[1, 2, 3, 4, 5, 6].map(num => (
                <div key={num} className="space-y-1 bg-slate-50/60 p-2.5 sm:p-3 rounded-xl border border-slate-200/70">
                  <label className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wide block truncate">Formative {num} Max</label>
                  <input
                    type="number"
                    required
                    min="1"
                    max="500"
                    disabled
                    value={columnsData[activeTerm][`act${num}_max`]}
                    className="block w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs sm:text-sm font-mono text-center bg-slate-100/90 text-slate-500 outline-none"
                  />
                </div>
              ))}
              
              <div className="col-span-2 sm:col-span-3 lg:col-span-4 border-t border-slate-100 pt-3 mt-1"></div>
              
              <div className="col-span-1 sm:col-span-2 space-y-1 bg-slate-50/60 p-2.5 sm:p-3 rounded-xl border border-slate-200/70">
                <label className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wide block truncate">Term Exam Max Points</label>
                <input
                  type="number"
                  required
                  min="5"
                  max="1000"
                  disabled
                  value={columnsData[activeTerm].exam_max}
                  className="block w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs sm:text-sm font-mono text-center bg-slate-100/90 text-slate-500 outline-none font-bold"
                />
              </div>

              <div className="col-span-1 sm:col-span-2 space-y-1 bg-slate-50/60 p-2.5 sm:p-3 rounded-xl border border-slate-200/70">
                <label className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wide block truncate">Character Rating (Fixed)</label>
                <input
                  type="text"
                  disabled
                  value="100"
                  className="block w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs sm:text-sm font-mono text-center bg-slate-100/90 text-slate-450 outline-none"
                />
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="border-t border-slate-100 pt-4 sm:pt-6 flex flex-col sm:flex-row justify-end gap-2.5 sm:gap-3">
            <button
              type="button"
              onClick={() => navigate('/faculty/classrecordslist')}
              className="w-full sm:w-auto px-4 py-2.5 text-xs sm:text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer"
            >
              Back to Class Records
            </button>
            <button
              type="button"
              onClick={() => navigate(`/faculty/scoreinput?id=${classRecordId}`)}
              className="w-full sm:w-auto px-5 py-2.5 text-xs sm:text-sm font-semibold bg-sage-600 hover:bg-sage-700 text-white rounded-xl transition-all shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              Proceed to Score Input
            </button>
          </div>

        </form>
      </div>

      {/* Success Modal Popup */}
      {showSuccess && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-end sm:items-center justify-center z-50 animate-in fade-in duration-200 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 max-w-sm w-full shadow-2xl border border-slate-100 flex flex-col items-center text-center space-y-4 animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
            <div className="sm:hidden w-12 h-1.5 bg-slate-200 rounded-full -mt-2 mb-1" />
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
              <Check className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base sm:text-lg font-bold text-slate-900 font-display">Configurations Saved!</h3>
              <p className="text-xs text-slate-500">{successMessage}</p>
            </div>
            <button
              onClick={() => {
                setShowSuccess(false);
                navigate(`/faculty/scoreinput?id=${classRecordId}`);
              }}
              className="w-full py-2.5 bg-sage-600 hover:bg-sage-700 text-white font-semibold text-xs sm:text-sm rounded-xl transition-colors shadow-2xs font-sans cursor-pointer"
            >
              Proceed to Score Input
            </button>
          </div>
        </div>
      )}
    </>
  );
}
