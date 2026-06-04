import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { 
  Check, 
  Info,
  ChevronRight,
  RefreshCw,
  Save
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { logActivity, resolveActorName } from '../../lib/auditLog';

export default function GradeComponentsSetup() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();
  const classRecordId = new URLSearchParams(location.search).get('id');

  const [classInfo, setClassInfo] = useState(null);
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
        // Fetch class record info
        const { data: cr, error: crErr } = await supabase
          .from('class_records')
          .select(`
            class_record_id,
            school_year,
            semester,
            subjects ( code, name ),
            sections ( name )
          `)
          .eq('class_record_id', classRecordId)
          .single();

        if (crErr) throw crErr;
        setClassInfo(cr);

        // Fetch configured grading columns
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

  const applyPreset = (presetType) => {
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
      
      <div className="p-8 overflow-y-auto flex-1 max-w-4xl mx-auto w-full space-y-6">
        
        {/* Navigation Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span className="hover:text-sage-600 cursor-pointer transition-colors" onClick={() => navigate('/faculty/classrecordslist')}>
            Class Records
          </span>
          <ChevronRight className="h-3 w-3" />
          <span className="font-medium text-slate-900">
            Configure Columns — {classInfo?.subjects?.code} ({classInfo?.sections?.name})
          </span>
        </div>

        {/* Info Box */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex gap-3">
          <Info className="h-5 w-5 text-sage-600 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="font-bold text-sm text-slate-900">DYCI Grading Standard Setup</h4>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
              Configure the maximum points for each of the 6 Formative Assessments (representing 50% Class Standing) and the Term Examination (40% Term Exam). The remaining 10% is allocated to student Character rating (scored out of 100).
            </p>
          </div>
        </div>

        {/* Preset Pickers */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5 font-sans">
            <RefreshCw className="h-3.5 w-3.5 text-sage-500" /> Apply Preset to All Terms
          </h4>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => applyPreset('DYCI-STD')}
              type="button"
              className="px-3.5 py-2 text-xs font-semibold bg-sage-50 hover:bg-sage-100 border border-sage-200 text-sage-800 rounded-lg transition-colors font-sans"
            >
              DYCI Standard (20pt FAs / 40pt Exam)
            </button>
            <button
              onClick={() => applyPreset('QUIZ-HEAVY')}
              type="button"
              className="px-3.5 py-2 text-xs font-semibold bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-700 transition-colors font-sans"
            >
              High Capacity (50pt FAs / 100pt Exam)
            </button>
            <button
              onClick={() => applyPreset('SHORT-QUIZ')}
              type="button"
              className="px-3.5 py-2 text-xs font-semibold bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-700 transition-colors font-sans"
            >
              Short Quizzes (10pt FAs / 30pt Exam)
            </button>
          </div>
        </div>

        {/* Main Configuration Card */}
        <form onSubmit={handleSave} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
          
          {/* Term Tab Switcher */}
          <div className="flex border-b border-slate-100 pb-2 gap-2">
            {termsList.map(term => (
              <button
                key={term}
                type="button"
                onClick={() => setActiveTerm(term)}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                  activeTerm === term 
                    ? 'bg-sage-600 text-white shadow-sm' 
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`}
              >
                {term}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            <h3 className="font-bold text-sm text-slate-800 flex items-center gap-1.5 font-sans">
              Configure Max Items — {activeTerm} Period
            </h3>

            {/* Config Fields Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[1, 2, 3, 4, 5, 6].map(num => (
                <div key={num} className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Formative Assessment {num} Max</label>
                  <input
                    type="number"
                    required
                    min="1"
                    max="500"
                    value={columnsData[activeTerm][`act${num}_max`]}
                    onChange={(e) => handleMaxChange(activeTerm, `act${num}_max`, e.target.value)}
                    className="block w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono text-center focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none bg-slate-50/50"
                  />
                </div>
              ))}
              
              <div className="col-span-2 sm:col-span-4 border-t border-slate-100 pt-4 mt-2"></div>
              
              <div className="col-span-2 space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Term Exam Max Points</label>
                <input
                  type="number"
                  required
                  min="5"
                  max="1000"
                  value={columnsData[activeTerm].exam_max}
                  onChange={(e) => handleMaxChange(activeTerm, 'exam_max', e.target.value)}
                  className="block w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono text-center focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none bg-slate-50/50 font-bold"
                />
              </div>

              <div className="col-span-2 space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Character Rating Max (Fixed)</label>
                <input
                  type="text"
                  disabled
                  value="100"
                  className="block w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono text-center bg-slate-100 text-slate-400 outline-none"
                />
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="border-t border-slate-100 pt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => navigate('/faculty/classrecordslist')}
              className="px-5 py-2.5 text-sm font-medium border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 text-sm font-medium bg-sage-600 hover:bg-sage-700 text-white rounded-lg transition-colors shadow-sm flex items-center gap-1.5"
            >
              <Save className="h-4 w-4" /> Save Configurations
            </button>
          </div>

        </form>
      </div>

      {/* Success Modal Popup */}
      {showSuccess && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl border border-slate-100 flex flex-col items-center text-center space-y-4 animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
              <Check className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-slate-900 font-display">Configurations Saved!</h3>
              <p className="text-xs text-slate-500">{successMessage}</p>
            </div>
            <button
              onClick={() => {
                setShowSuccess(false);
                navigate(`/faculty/scoreinput?id=${classRecordId}`);
              }}
              className="w-full py-2 bg-sage-600 hover:bg-sage-700 text-white font-medium text-sm rounded-xl transition-colors shadow-sm font-sans"
            >
              Proceed to Score Input
            </button>
          </div>
        </div>
      )}
    </>
  );
}
