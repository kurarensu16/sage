import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { Save, X, GraduationCap, AlertTriangle, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toUserMessage } from '../../lib/errorMessages';
import { useAuth } from '../../lib/AuthContext';
import { logActivity, resolveActorName } from '../../lib/auditLog';

// Create or edit a degree program. Mirrors SubjectForm's shape so every Academic
// Setup entity behaves the same way for the Registrar.

export default function ProgramForm() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const programId = params.get('id');
  const isEdit = !!programId;
  const { user, profile } = useAuth();

  const [departments, setDepartments] = useState([]);
  const [form, setForm] = useState({ name: '', abbreviation: '', departmentId: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: depts, error: deptErr } = await supabase
          .from('departments')
          .select('department_id, name')
          .order('name');
        if (deptErr) throw deptErr;
        setDepartments(depts || []);

        if (isEdit) {
          const { data, error: progErr } = await supabase
            .from('programs')
            .select('program_id, name, abbreviation, department_id')
            .eq('program_id', programId)
            .single();
          if (progErr) throw progErr;
          setForm({
            name: data.name || '',
            abbreviation: data.abbreviation || '',
            departmentId: data.department_id || ''
          });
        }
      } catch (err) {
        setError(toUserMessage(err, 'Could not load this program.'));
      } finally {
        setLoading(false);
      }
    })();
  }, [isEdit, programId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.name.trim()) {
      setError('Enter the program name.');
      return;
    }
    if (!form.abbreviation.trim()) {
      // Section names are built from the abbreviation, so an empty one would
      // produce section names like "-1A".
      setError('Enter an abbreviation — section names are built from it (for example BSIT-1A).');
      return;
    }
    if (!form.departmentId) {
      setError('Choose the college this program belongs to.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        abbreviation: form.abbreviation.trim().toUpperCase(),
        department_id: form.departmentId
      };

      if (isEdit) {
        const { error: updErr } = await supabase
          .from('programs')
          .update(payload)
          .eq('program_id', programId);
        if (updErr) throw updErr;
        await logActivity(
          'Update',
          `Updated degree program ${payload.abbreviation}.`,
          resolveActorName(profile, user)
        );
      } else {
        const { error: insErr } = await supabase.from('programs').insert(payload);
        if (insErr) throw insErr;
        await logActivity(
          'Create',
          `Created degree program ${payload.abbreviation}.`,
          resolveActorName(profile, user)
        );
      }
      navigate('/registrar/programlist');
    } catch (err) {
      // The unique constraint on programs.name is the most likely failure.
      setError(
        err?.code === '23505'
          ? 'A program with this name already exists.'
          : toUserMessage(err, 'Could not save this program.')
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader title={isEdit ? 'Edit Program' : 'Add Program'} breadcrumb="Registrar Portal" />

      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1">
        <div className="flex items-center gap-1 text-[11px] sm:text-xs text-slate-400 mb-3.5">
          <span
            className="hover:text-sage-600 cursor-pointer transition-colors"
            onClick={() => navigate('/registrar/programlist')}
          >
            Degree Programs
          </span>
          <ChevronRight className="h-3 w-3" />
          <span className="text-slate-600">{isEdit ? form.abbreviation || 'Edit' : 'New'}</span>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs max-w-2xl"
        >
          <div className="px-3.5 sm:px-5 py-3 sm:py-4 border-b border-slate-100 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sage-50 text-sage-700 flex items-center justify-center flex-shrink-0">
              <GraduationCap className="h-4 w-4" />
            </div>
            <h2 className="text-sm sm:text-base font-semibold font-display text-slate-900">
              Program details
            </h2>
          </div>

          <div className="p-3.5 sm:p-5 space-y-3.5">
            {error && (
              <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl px-3.5 py-3 text-xs sm:text-sm flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="text-[11px] sm:text-xs font-semibold text-slate-600 uppercase tracking-wider block mb-1.5">
                Program name
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                disabled={loading}
                placeholder="Bachelor of Science in Information Technology"
                className="w-full px-3 py-2 text-xs sm:text-sm bg-white border border-slate-200 rounded-xl outline-none focus:border-sage-400 disabled:bg-slate-50"
              />
            </div>

            <div>
              <label className="text-[11px] sm:text-xs font-semibold text-slate-600 uppercase tracking-wider block mb-1.5">
                Abbreviation
              </label>
              <input
                type="text"
                value={form.abbreviation}
                onChange={(e) => setForm((p) => ({ ...p, abbreviation: e.target.value.toUpperCase() }))}
                disabled={loading}
                placeholder="BSIT"
                className="w-full px-3 py-2 text-xs sm:text-sm bg-white border border-slate-200 rounded-xl outline-none focus:border-sage-400 font-mono disabled:bg-slate-50"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Used to build section names, for example BSIT-1A.
              </p>
            </div>

            <div>
              <label className="text-[11px] sm:text-xs font-semibold text-slate-600 uppercase tracking-wider block mb-1.5">
                College
              </label>
              <select
                value={form.departmentId}
                onChange={(e) => setForm((p) => ({ ...p, departmentId: e.target.value }))}
                disabled={loading}
                className="w-full px-3 py-2 text-xs sm:text-sm bg-white border border-slate-200 rounded-xl outline-none focus:border-sage-400 cursor-pointer disabled:bg-slate-50"
              >
                <option value="">Select a college</option>
                {departments.map((d) => (
                  <option key={d.department_id} value={d.department_id}>{d.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="px-3.5 sm:px-5 py-3 border-t border-slate-100 flex items-center gap-2">
            <button
              type="submit"
              disabled={saving || loading}
              className="px-3.5 py-2 text-xs sm:text-sm font-medium bg-sage-600 hover:bg-sage-700 text-white rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create program'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/registrar/programlist')}
              className="px-3.5 py-2 text-xs sm:text-sm font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <X className="h-4 w-4" />
              Cancel
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
