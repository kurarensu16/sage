import { useState, useEffect } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import { Plus, Trash2, Edit2, Save, X, Settings, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { logActivity, resolveActorName } from '../../lib/auditLog';
import { notifyAdminActivity } from '../../lib/notificationDispatcher';
import { WEIGHT_TOLERANCE } from '../../lib/gradingMath';
import { OFFICIAL_DYCI_PRESETS } from '../../lib/officialGradingPresets';

export default function GradeComputationsList() {
  const { user, profile } = useAuth();
  
  // Data lists
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Modal/Drawer state
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null); // template object or null for new
  
  // Form fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  // Empty string means "institutional default", which is stored as NULL.
  const [passingThreshold, setPassingThreshold] = useState('');
  // When an edit takes effect. 'next' is the historical behaviour and stays the
  // default: a class already being graded holds a frozen copy of the formula,
  // so nothing moves unless the Registrar deliberately says so.
  const [applyTo, setApplyTo] = useState('next');
  const [activeTerm, setActiveTerm] = useState(null);
  // What applying now would actually do, read before committing to it.
  const [applyPreview, setApplyPreview] = useState(null);
  const [components, setComponents] = useState([
    { name: 'Class Standing (Formative)', weight: 50, max_score: 20, is_multiple: true },
    { name: 'Major Examination', weight: 40, max_score: 40, is_multiple: false },
    { name: 'Character Rating', weight: 10, max_score: 100, is_multiple: false }
  ]);
  
  // Alert logs
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  useEffect(() => {
    loadTemplates();
    // The term a change could be applied to. Without it the "current term"
    // choice has nothing to point at and is not offered.
    (async () => {
      const { data } = await supabase
        .from('academic_terms')
        .select('term_id, school_year, semester')
        .eq('is_active', true)
        .maybeSingle();
      setActiveTerm(data || null);
    })();
  }, []);

  // What this template currently touches in the running term.
  //
  // Read as soon as the editor opens on an existing template, not only when
  // "Now" is chosen: BOTH options need the figures to say anything concrete.
  // "Classes keep their current formula" means nothing without knowing there
  // are three of them with 39 posted ratings between them.
  useEffect(() => {
    let cancelled = false;
    if (!editingTemplate?.computation_id || !activeTerm?.term_id) {
      setApplyPreview(null);
      return undefined;
    }
    supabase
      .rpc('aspire_preview_template_application', {
        p_computation_id: editingTemplate.computation_id,
        p_term_id: activeTerm.term_id
      })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn('Could not preview the template application:', error.message);
          setApplyPreview(null);
          return;
        }
        setApplyPreview(data || null);
      });
    return () => { cancelled = true; };
  }, [editingTemplate, activeTerm]);

  // "AY 2026-2027 · 2nd Semester". Summer is a term, not a numbered semester,
  // so it does not get the word appended.
  const termLabel = activeTerm
    ? `AY ${activeTerm.school_year} · ${activeTerm.semester === 'Summer' ? 'Summer' : `${activeTerm.semester} Semester`}`
    : '';

  const loadTemplates = async () => {
    try {
      setLoading(true);
      // Fetch templates and their component details in one query
      const { data, error } = await supabase
        .from('grade_computations')
        .select('*, grade_computation_components(*)');
        
      if (error) throw error;
      setTemplates(data || []);
    } catch (err) {
      console.error('Failed to load templates:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenNew = () => {
    setEditingTemplate(null);
    setName('');
    setDescription('');
    setPassingThreshold('');
    // Never carried between editor sessions: applying to a running term is a
    // deliberate choice each time, not a setting that stays switched on.
    setApplyTo('next');
    setApplyPreview(null);
    setComponents([
      { name: 'Class Standing (Formative)', weight: 50, max_score: 20, is_multiple: true },
      { name: 'Major Examination', weight: 40, max_score: 40, is_multiple: false },
      { name: 'Character Rating', weight: 10, max_score: 100, is_multiple: false }
    ]);
    setErrorMsg('');
    setSuccessMsg('');
    setShowConfirmModal(false);
    setIsEditorOpen(true);
  };

  const handleOpenEdit = (temp) => {
    setEditingTemplate(temp);
    setName(temp.name);
    setDescription(temp.description || '');
    setPassingThreshold(temp.passing_threshold ?? '');
    setApplyTo('next');
    setApplyPreview(null);
    // Fetch components
    const mapped = (temp.grade_computation_components || []).map(c => ({
      component_id: c.component_id,
      name: c.name,
      weight: parseFloat(c.weight),
      max_score: parseFloat(c.max_score),
      is_multiple: !!c.is_multiple
    }));
    setComponents(mapped.length > 0 ? mapped : [{ name: '', weight: 0, max_score: 10 }]);
    setErrorMsg('');
    setSuccessMsg('');
    setShowConfirmModal(false);
    setIsEditorOpen(true);
  };

  const handleAddComponentRow = () => {
    if (editingTemplate) return;
    setComponents([...components, { name: '', weight: 0, max_score: 10, is_multiple: true }]);
  };

  const handleRemoveComponentRow = (index) => {
    if (editingTemplate) return;
    setComponents(components.filter((_, i) => i !== index));
  };

  const handleComponentChange = (index, field, value) => {
    const updated = [...components];
    updated[index][field] = value;
    setComponents(updated);
  };

  const handleApplyPreset = (preset) => {
    if (editingTemplate) return;
    setName(preset.name);
    setDescription(preset.description);
    const existingByName = new Map(
      (editingTemplate?.grade_computation_components || []).map(component => [
        component.name.trim().toLowerCase(),
        component.component_id
      ])
    );
    setComponents(preset.components.map(component => ({
      ...component,
      component_id: existingByName.get(component.name.trim().toLowerCase()) || undefined
    })));
    setErrorMsg('');
  };

  // Calculate sum of weights reactively
  const totalWeight = components.reduce((acc, curr) => acc + (parseFloat(curr.weight) || 0), 0);

  const handleOpenConfirm = (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!name.trim()) {
      setErrorMsg('Please enter a template name.');
      return;
    }

    // WEIGHT_TOLERANCE, not a strict !== 100 — floating-point summation of decimal
    // weights (e.g. 41.9 + 48.3 + 9.8) can land on 99.99999999999999, a completely
    // valid 100% split that the grading engine itself accepts via the same
    // tolerance. The strict check was rejecting admin-entered formulas the engine
    // would happily compute. Verified by brute-force search before fixing.
    if (Math.abs(totalWeight - 100) > WEIGHT_TOLERANCE) {
      setErrorMsg(`Total weights must sum to 100%. (Current: ${totalWeight}%)`);
      return;
    }

    // Restrict duplicate names for identical component configs
    const namesSeen = new Set();
    for (const c of components) {
      const nameKey = c.name.trim().toLowerCase();
      if (namesSeen.has(nameKey)) {
        setErrorMsg(`Duplicate component name detected: "${c.name}". Component names must be unique.`);
        return;
      }
      namesSeen.add(nameKey);
    }

    const emptyComponents = components.some(c => !c.name.trim() || c.weight <= 0 || c.max_score <= 0);
    if (emptyComponents) {
      setErrorMsg('Please fill in all components names, weights, and max scores correctly.');
      return;
    }

    setShowConfirmModal(true);
  };

  const handleConfirmSave = async () => {
    setShowConfirmModal(false);
    setSaving(true);
    try {
      const actorName = resolveActorName(profile, user);

      // One database transaction per save (save_grade_template): all weights are
      // saved, or none are, so a template never ends up not totalling 100%.
      const { data: savedId, error: saveErr } = await supabase.rpc('save_grade_template', {
        p_computation_id: editingTemplate ? editingTemplate.computation_id : null,
        p_name: name.trim(),
        p_description: description.trim(),
        p_components: components.map(c => ({
          component_id: c.component_id || null,
          name: c.name.trim(),
          weight: Number(c.weight),
          max_score: Number(c.max_score),
          is_multiple: !!c.is_multiple
        }))
      });
      if (saveErr) throw saveErr;

      // Passing threshold is written separately rather than through the atomic
      // save. It is a scale parameter with no cross-component invariant -- unlike
      // the weights, which must total 100% together and therefore need one
      // transaction. Keeping it out avoids changing that function's signature,
      // which 20261029040940 had to re-point to the registrar gate.
      const targetId = savedId || editingTemplate?.computation_id;
      if (targetId) {
        const parsed = passingThreshold === '' ? null : Number(passingThreshold);
        const { error: thresholdErr } = await supabase
          .from('grade_computations')
          .update({ passing_threshold: parsed })
          .eq('computation_id', targetId);
        if (thresholdErr) throw thresholdErr;
      }

      if (editingTemplate) {
        // Existing templates are structurally immutable. Admin edits update
        // percentages only, preserving component identity and every linked
        // class activity. Structural variants must be created as new templates.

        await logActivity(
          'Grading Template Edit',
          `Modified grading template: "${name}" (${components.length} components).`,
          actorName
        );

        await notifyAdminActivity({
          type: 'system',
          message: `Grade Computation Templates: Template "${name}" was updated by ${actorName}.`,
          actorName
        });
        // Applying to the CURRENT term, when asked for.
        //
        // Editing a template changes nothing for a class already being graded:
        // aspire_calculate_student_grade reads the frozen snapshot on the class,
        // not the live template. That is why a change has always taken effect
        // "next term" -- it was never a rule, just a consequence.
        //
        // CHED and DepEd sometimes mandate a change mid-semester, so the
        // Registrar can now re-pin the formula and have posted ratings
        // recalculated. A class whose Semestral Grade is posted is refused by
        // the RPC, not skipped: that grade is final and belongs to the Registrar
        // override, which the Dean acknowledges.
        if (applyTo === 'current' && activeTerm?.term_id) {
          const { data: applied, error: applyErr } = await supabase.rpc(
            'aspire_apply_template_to_term',
            { p_computation_id: targetId, p_term_id: activeTerm.term_id }
          );
          if (applyErr) throw applyErr;

          await logActivity(
            'Grading Template Applied',
            `Applied "${name}" to ${activeTerm.school_year} ${activeTerm.semester}: ${applied?.classes_updated ?? 0} class(es), ${applied?.grades_recalculated ?? 0} posted rating(s) recalculated.`,
            actorName
          );
          setSuccessMsg(
            `Applied to ${activeTerm.school_year} ${activeTerm.semester}. ` +
            `${applied?.classes_updated ?? 0} class(es) updated, ` +
            `${applied?.grades_recalculated ?? 0} posted rating(s) recalculated.`
          );
        } else {
          setSuccessMsg('Grading template updated. It applies to classes created from the next term onward.');
        }
      } else {
        await logActivity(
          'Grading Template Creation',
          `Created grading template: "${name}" (${components.length} components).`,
          actorName
        );

        await notifyAdminActivity({
          type: 'system',
          message: `Grade Computation Templates: New template "${name}" was created by ${actorName}.`,
          actorName
        });
        setSuccessMsg('Grading template created successfully!');
      }

      loadTemplates();
      setTimeout(() => {
        setIsEditorOpen(false);
      }, 1500);

    } catch (err) {
      console.error('Failed to save template:', err);
      setErrorMsg('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader title="Grading Templates" breadcrumb="Registrar Portal">
        <button 
          onClick={handleOpenNew}
          className="px-4 py-2 text-sm font-medium bg-sage-600 hover:bg-sage-700 text-white rounded-lg transition-all shadow-sm flex items-center gap-2"
        >
          <Plus className="h-4 w-4" /> Add New Template
        </button>
      </PageHeader>

      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-4 sm:space-y-6 md:space-y-8">
        
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-sage-600"></div>
            <p className="text-sm text-slate-500 font-medium">Loading templates...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {templates.map(temp => (
              <div 
                key={temp.computation_id} 
                className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between hover:border-sage-300 hover:shadow-md transition-all text-left"
              >
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-sage-50 text-sage-600 rounded-lg">
                      <Settings className="h-4.5 w-4.5" />
                    </div>
                    <h3 className="font-bold text-slate-900 text-sm font-display">{temp.name}</h3>
                  </div>
                  
                  {temp.description && (
                    <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{temp.description}</p>
                  )}
                  
                  <div className="pt-3 border-t border-slate-100 space-y-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Components Structure</span>
                    <div className="space-y-1.5">
                      {(temp.grade_computation_components || []).map(c => (
                        <div key={c.component_id} className="flex justify-between items-center text-xs font-semibold">
                          <span className="text-slate-650 truncate max-w-[180px]">{c.name}</span>
                          <span className="text-slate-500 font-mono">{parseFloat(c.weight)}% <span className="text-[10px] text-slate-350">(Max: {parseFloat(c.max_score)})</span></span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5 mt-5">
                  <button 
                    onClick={() => handleOpenEdit(temp)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-lg transition-colors flex items-center gap-1 text-xs font-semibold"
                  >
                    <Edit2 className="h-3.5 w-3.5" /> Edit
                  </button>
                  {/* No delete action: every template is referenced by subjects, and a
                      class that has posted grades holds a snapshot of the template it was
                      graded with. Removing one is never the right operation — superseding
                      it with a new template is. */}
                </div>
              </div>
            ))}

            {templates.length === 0 && (
              <div className="col-span-full text-center py-16 bg-white border border-slate-200 rounded-2xl text-slate-400 p-6 text-sm">
                No grading templates defined in the system. Click "Add New Template" to create one.
              </div>
            )}
          </div>
        )}

      </div>

      {/* Templates configuration Drawer Modal */}
      {isEditorOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden flex items-end sm:items-stretch sm:justify-end">
          {/* Backdrop blur */}
          <div 
            onClick={() => !saving && setIsEditorOpen(false)}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity" 
          />

          <div className="relative max-w-xl w-full bg-white shadow-2xl max-h-[92vh] sm:max-h-full sm:h-full rounded-t-3xl sm:rounded-none flex flex-col animate-in slide-in-from-bottom sm:slide-in-from-right duration-300 ease-out z-10 overflow-hidden">
            {/* Mobile Grab Handle */}
            <div className="sm:hidden pt-3 pb-1 flex justify-center">
              <div className="w-10 h-1.25 bg-slate-300 rounded-full" />
            </div>

            <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="text-sm sm:text-base font-bold font-display text-slate-900 text-left">
                  {editingTemplate ? 'Edit Grading Template' : 'Configure New Template'}
                </h3>
                <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 text-left">Set calculation weights and default scales for courses.</p>
              </div>
              <button 
                onClick={() => setIsEditorOpen(false)}
                disabled={saving}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-900 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleOpenConfirm} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6 flex flex-col justify-between">
              <div className="space-y-4 sm:space-y-6 text-left">
                {errorMsg && (
                  <div className="p-3 bg-rose-50 border border-rose-100 text-rose-700 text-xs font-semibold rounded-xl flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}
                {successMsg && (
                  <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-semibold rounded-xl flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                    <span>{successMsg}</span>
                  </div>
                )}

                {/* Official Presets Quick-Select — new templates only.
                    A preset replaces the whole component structure, and an
                    existing template's structure is immutable: save_grade_template
                    refuses anything but a weight change ("components cannot be
                    added or removed; only their weights can change"). Offering
                    the buttons while editing promised something the save would
                    reject. */}
                {!editingTemplate && (
                  <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Official DYCI Presets</span>
                      <span className="text-[10px] text-slate-400 font-medium">Click to populate</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {OFFICIAL_DYCI_PRESETS.map((p) => (
                        <button
                          key={p.name}
                          type="button"
                          onClick={() => handleApplyPreset(p)}
                          className="px-2.5 py-1 text-[11px] font-medium bg-white hover:bg-sage-50 text-slate-700 hover:text-sage-700 border border-slate-200 hover:border-sage-300 rounded-lg transition-colors cursor-pointer shadow-2xs"
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* When the change takes effect.
                    Only on an EDIT: a brand-new template has no classes using
                    it yet, so there is nothing to apply it to. */}
                {editingTemplate && activeTerm && (
                  <div className="space-y-2 border border-slate-200 rounded-xl p-3.5 bg-slate-50">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wide block">
                      Which classes should use this formula
                    </label>
                    <p className="text-[11px] text-slate-500 -mt-1">
                      {applyPreview && applyPreview.class_count > 0
                        ? <>Right now <strong>{applyPreview.class_count} class{applyPreview.class_count === 1 ? '' : 'es'}</strong> in {termLabel} {applyPreview.class_count === 1 ? 'uses' : 'use'} this template, holding <strong>{applyPreview.posted_grades} posted rating{applyPreview.posted_grades === 1 ? '' : 's'}</strong>.</>
                        : <>No classes in {termLabel} use this template yet.</>}
                    </p>

                    <div className="flex flex-col gap-2.5 pt-0.5">
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="applyTo"
                          value="next"
                          checked={applyTo === 'next'}
                          onChange={() => setApplyTo('next')}
                          className="mt-0.5 cursor-pointer"
                        />
                        <span className="text-xs text-slate-700">
                          <strong className="text-slate-900">Only classes created from the next term onward.</strong>
                          <span className="block text-slate-500 mt-0.5">
                            Nothing changes today. The {applyPreview?.class_count ?? 0} class
                            {(applyPreview?.class_count ?? 0) === 1 ? '' : 'es'} in {termLabel} keep
                            the formula {(applyPreview?.class_count ?? 0) === 1 ? 'it was' : 'they were'} graded
                            with, and no student&rsquo;s grade moves.
                          </span>
                        </span>
                      </label>

                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="applyTo"
                          value="current"
                          checked={applyTo === 'current'}
                          onChange={() => setApplyTo('current')}
                          className="mt-0.5 cursor-pointer"
                        />
                        <span className="text-xs text-slate-700">
                          <strong className="text-slate-900">
                            Also the {applyPreview?.class_count ?? 0} class
                            {(applyPreview?.class_count ?? 0) === 1 ? '' : 'es'} already running in {termLabel}.
                          </strong>
                          <span className="block text-slate-500 mt-0.5">
                            Re-grades the {applyPreview?.posted_grades ?? 0} posted rating
                            {(applyPreview?.posted_grades ?? 0) === 1 ? '' : 's'} under the new formula —
                            students&rsquo; Midterm and Tentative Final Ratings will change. Use this only
                            when CHED or DepEd requires it to take effect mid-semester.
                          </span>
                        </span>
                      </label>
                    </div>

                    {/* What that would actually do, before it is done. */}
                    {applyTo === 'current' && applyPreview && (
                      <div className={
                        applyPreview.blocked_by_sg > 0
                          ? 'mt-1 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-[11px] text-rose-900 space-y-1'
                          : 'mt-1 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-900 space-y-1'
                      }>
                        {applyPreview.blocked_by_sg > 0 ? (
                          <>
                            <p>
                              <strong>
                                This cannot be applied: {applyPreview.blocked_by_sg} class
                                {applyPreview.blocked_by_sg === 1 ? '' : 'es'} already
                                {applyPreview.blocked_by_sg === 1 ? ' has' : ' have'} a posted Semestral Grade.
                              </strong>
                            </p>
                            <p>
                              A Semestral Grade is a final, official record. It can only be changed through
                              the Registrar Override, where the Dean acknowledges the change. Saving with
                              this option selected will be refused — choose the first option instead.
                            </p>
                          </>
                        ) : applyPreview.class_count === 0 ? (
                          <p>There is nothing to re-grade — no class in this term uses this template.</p>
                        ) : (
                          <>
                            <p className="font-bold">Which classes are affected</p>
                            <div className="font-mono text-[10px] bg-white/70 border border-amber-200 rounded p-1.5 max-h-20 overflow-y-auto">
                              {applyPreview.classes.slice(0, 10).map((c) => (
                                <div key={c.class_record_id}>
                                  {c.subject_code} · {c.section_name} — {c.posted_count} posted rating
                                  {c.posted_count === 1 ? '' : 's'}
                                </div>
                              ))}
                              {applyPreview.classes.length > 10 && (
                                <div>and {applyPreview.classes.length - 10} more…</div>
                              )}
                            </div>
                            <p>
                              Each instructor and the Dean&rsquo;s Office are notified, and every changed
                              grade records that an institutional policy changed it.{' '}
                              <strong>Students are not notified</strong> — tell them through the usual
                              channel.
                            </p>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* General Info */}
                <div className="space-y-3 sm:space-y-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Template Name <span className="text-rose-500">*</span></label>
                    <input 
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={!!editingTemplate}
                      placeholder="e.g. General Education Core"
                      className="block w-full px-3.5 py-2 border border-slate-200 hover:border-slate-300 focus:border-sage-500 rounded-xl text-xs sm:text-sm outline-none transition-all focus:ring-1 focus:ring-sage-500"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Description</label>
                    <textarea 
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      disabled={!!editingTemplate}
                      placeholder="Specify departments or guidelines applying this formula scale..."
                      className="block w-full px-3.5 py-2 border border-slate-200 hover:border-slate-300 focus:border-sage-500 rounded-xl text-xs sm:text-sm h-16 sm:h-20 resize-none outline-none transition-all focus:ring-1 focus:ring-sage-500"
                    />
                  </div>
                  {/* Passing threshold is editable even on an existing template,
                      unlike the structural fields above. It is a scale parameter,
                      and the snapshot freeze means a change reaches only classes
                      created afterwards -- never a class already running. */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                      Passing Threshold
                    </label>
                    <input
                      type="number"
                      min={50}
                      max={94}
                      step="0.01"
                      value={passingThreshold}
                      onChange={(e) => setPassingThreshold(e.target.value)}
                      placeholder="Institutional default (75%)"
                      className="block w-full px-3.5 py-2 border border-slate-200 hover:border-slate-300 focus:border-sage-500 rounded-xl text-xs sm:text-sm outline-none transition-all focus:ring-1 focus:ring-sage-500 font-mono"
                    />
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      Leave blank to follow the institutional 75%. Setting it rescales the whole
                      GWA ladder from this one number, and applies only to classes created after
                      the change — classes already running keep the policy they started with.
                    </p>
                  </div>
                </div>

                {/* Components section */}
                <div className="space-y-3">
                  {editingTemplate && (
                    <div className="p-3 bg-sage-50 border border-sage-200 text-sage-800 text-xs rounded-xl">
                      Existing templates allow percentage changes only. Create a new template to change names, maximum scores, or component behavior.
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Grading Components Structure</label>
                    <button 
                      type="button"
                      onClick={handleAddComponentRow}
                      disabled={!!editingTemplate}
                      className="text-xs text-sage-600 hover:text-sage-700 font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add Row
                    </button>
                  </div>

                  {/* Table Row Headers */}
                  <div className="hidden sm:flex gap-2.5 items-center text-micro font-extrabold text-slate-400 uppercase tracking-wider px-1">
                    <div className="flex-1">Component Name</div>
                    <div className="w-20 text-center">Weight %</div>
                    <div className="w-20 text-center">Max Score</div>
                    <div className="w-[78px] text-center">Behavior</div>
                    <div className="w-8"></div>
                  </div>

                  <div className="space-y-2.5">
                    {components.map((comp, idx) => (
                      <div key={idx} className="flex flex-wrap sm:flex-nowrap gap-2 items-center p-2.5 sm:p-0 bg-slate-50 sm:bg-transparent rounded-xl sm:rounded-none border sm:border-0 border-slate-200/80">
                        <div className="w-full sm:flex-1">
                          <input 
                            type="text"
                            required
                            value={comp.name}
                            onChange={(e) => handleComponentChange(idx, 'name', e.target.value)}
                            disabled={!!editingTemplate}
                            placeholder="Component Name (e.g. Written Quiz)"
                            className="block w-full px-3 py-1.5 border border-slate-250 hover:border-slate-300 focus:border-sage-500 rounded-lg text-xs outline-none transition-all bg-white"
                          />
                        </div>
                        <div className="flex-1 sm:w-20 sm:flex-none">
                          <input 
                            type="number"
                            required
                            min="1"
                            max="100"
                            value={comp.weight}
                            onChange={(e) => handleComponentChange(idx, 'weight', parseInt(e.target.value, 10))}
                            placeholder="Weight %"
                            className="block w-full px-2.5 py-1.5 border border-slate-250 hover:border-slate-300 focus:border-sage-500 rounded-lg text-xs font-mono outline-none text-right bg-white"
                          />
                        </div>
                        <div className="flex-1 sm:w-20 sm:flex-none">
                          <input 
                            type="number"
                            required
                            min="1"
                            max="500"
                            value={comp.max_score}
                            onChange={(e) => handleComponentChange(idx, 'max_score', parseInt(e.target.value, 10))}
                            disabled={!!editingTemplate}
                            placeholder="Max Score"
                            className="block w-full px-2.5 py-1.5 border border-slate-250 hover:border-slate-300 focus:border-sage-500 rounded-lg text-xs font-mono outline-none text-right bg-white"
                          />
                        </div>
                        <label className="flex items-center gap-1 cursor-pointer select-none border border-slate-200 rounded-lg px-2 py-1.5 bg-white hover:bg-slate-50 w-[78px] justify-center flex-shrink-0">
                          <input 
                            type="checkbox"
                            checked={!!comp.is_multiple}
                            onChange={(e) => handleComponentChange(idx, 'is_multiple', e.target.checked)}
                            disabled={!!editingTemplate}
                            className="rounded text-sage-600 focus:ring-sage-500 border-slate-300 w-3.5 h-3.5"
                          />
                          <span className="text-[10px] text-slate-500 font-bold whitespace-nowrap">Multi?</span>
                        </label>
                        <button 
                          type="button"
                          disabled={components.length <= 1 || !!editingTemplate}
                          onClick={() => handleRemoveComponentRow(idx)}
                          className="p-1.5 text-slate-450 hover:text-rose-500 disabled:opacity-30 rounded-lg cursor-pointer flex-shrink-0"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Drawer footer details */}
              <div className="pt-4 sm:pt-6 border-t border-slate-100 flex flex-col gap-3 sm:gap-4 bg-white mt-6 sm:mt-10">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Total Weighted Sum:</span>
                  <span className={`font-mono text-xs sm:text-sm font-extrabold px-2.5 py-0.5 rounded-full border ${
                    Math.abs(totalWeight - 100) <= WEIGHT_TOLERANCE
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                      : 'bg-rose-50 text-rose-700 border-rose-100'
                  }`}>
                    {totalWeight}% / 100%
                  </span>
                </div>
                
                <div className="flex items-center gap-3">
                  <button 
                    type="button"
                    disabled={saving}
                    onClick={() => setIsEditorOpen(false)}
                    className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl text-xs sm:text-sm font-medium transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={saving}
                    className="flex-1 px-4 py-2.5 bg-sage-600 hover:bg-sage-700 disabled:bg-sage-400 text-white rounded-xl text-xs sm:text-sm font-medium transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer"
                  >
                    <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save Template'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-2xl p-5 sm:p-6 space-y-4 sm:space-y-5 text-left animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 max-w-md w-full">
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-sage-50 text-sage-600 flex items-center justify-center flex-shrink-0">
                <Settings className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900 font-display">
                  {editingTemplate ? 'Confirm Template Changes' : 'Confirm New Grading Template'}
                </h3>
                <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 sm:mt-1 font-sans">
                  {editingTemplate 
                    ? 'Please review the template components and weights before updating.' 
                    : 'Are you sure you want to register this new grading computation template?'}
                </p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-3.5 sm:p-4 border border-slate-150 space-y-2.5 text-xs">
              <div className="flex justify-between items-start gap-3">
                <span className="text-slate-450 font-bold uppercase tracking-wider text-[10px]">Template Name:</span>
                <span className="font-bold text-slate-900 text-right">{name.trim()}</span>
              </div>
              {description.trim() && (
                <div className="flex justify-between items-start gap-3 pt-2 border-t border-slate-200/60">
                  <span className="text-slate-450 font-bold uppercase tracking-wider text-[10px]">Description:</span>
                  <span className="text-slate-600 text-right line-clamp-2 max-w-[220px]">{description.trim()}</span>
                </div>
              )}
              <div className="pt-2 border-t border-slate-200/60 space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-slate-450 font-bold uppercase tracking-wider text-[10px]">Components Breakdown ({components.length}):</span>
                  <span className="font-mono text-emerald-700 font-bold text-[11px]">Sum: {totalWeight}%</span>
                </div>
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {components.map((c, i) => (
                    <div key={i} className="flex justify-between items-center py-1 px-2 rounded-md bg-white border border-slate-200/70 text-xs">
                      <span className="font-semibold text-slate-700 truncate max-w-[200px]">{c.name}</span>
                      <span className="font-mono text-slate-600 font-bold">
                        {c.weight}% <span className="text-[10px] text-slate-400 font-normal">(Max: {c.max_score})</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-1 sm:pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSave}
                className="flex-1 px-4 py-2.5 bg-sage-600 hover:bg-sage-700 text-white rounded-xl text-xs font-semibold transition-colors shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Save className="h-3.5 w-3.5" />
                {editingTemplate ? 'Save Changes' : 'Register Template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
