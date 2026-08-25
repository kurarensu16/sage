import React, { useState, useEffect } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import { Plus, Trash2, Edit2, Save, X, Settings, ListCollapse, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { logActivity, resolveActorName } from '../../lib/auditLog';

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
  }, []);

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
    setComponents([...components, { name: '', weight: 0, max_score: 10, is_multiple: true }]);
  };

  const handleRemoveComponentRow = (index) => {
    setComponents(components.filter((_, i) => i !== index));
  };

  const handleComponentChange = (index, field, value) => {
    const updated = [...components];
    updated[index][field] = value;
    setComponents(updated);
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

    if (totalWeight !== 100) {
      setErrorMsg(`Total weights must sum to exactly 100%. (Current: ${totalWeight}%)`);
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
      let computationId;
      const actorName = resolveActorName(profile, user);

      if (editingTemplate) {
        computationId = editingTemplate.computation_id;
        
        // Update template header
        const { error: headerErr } = await supabase
          .from('grade_computations')
          .update({ name: name.trim(), description: description.trim() })
          .eq('computation_id', computationId);

        if (headerErr) throw headerErr;

        // Delete existing components and rebuild them to prevent collision mapping
        const { error: deleteErr } = await supabase
          .from('grade_computation_components')
          .delete()
          .eq('computation_id', computationId);

        if (deleteErr) throw deleteErr;

        // Re-insert components
        const componentPayloads = components.map(c => ({
          computation_id: computationId,
          name: c.name.trim(),
          weight: c.weight,
          max_score: c.max_score,
          is_multiple: !!c.is_multiple
        }));

        const { error: compsErr } = await supabase
          .from('grade_computation_components')
          .insert(componentPayloads);

        if (compsErr) throw compsErr;

        await logActivity(
          'Grading Template Edit',
          `Modified grading template: "${name}" (${components.length} components).`,
          actorName
        );
        setSuccessMsg('Grading template updated successfully!');
      } else {
        // Insert new template header
        const { data: insertedHeader, error: headerErr } = await supabase
          .from('grade_computations')
          .insert({ name: name.trim(), description: description.trim() })
          .select()
          .single();

        if (headerErr) throw headerErr;
        computationId = insertedHeader.computation_id;

        // Insert components
        const componentPayloads = components.map(c => ({
          computation_id: computationId,
          name: c.name.trim(),
          weight: c.weight,
          max_score: c.max_score,
          is_multiple: !!c.is_multiple
        }));

        const { error: compsErr } = await supabase
          .from('grade_computation_components')
          .insert(componentPayloads);

        if (compsErr) throw compsErr;

        await logActivity(
          'Grading Template Creation',
          `Created grading template: "${name}" (${components.length} components).`,
          actorName
        );
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

  const handleDeleteTemplate = async (templateId, templateName) => {
    if (!window.confirm(`Are you sure you want to delete the grading template "${templateName}"? All subjects bound to this template will fallback to default configurations.`)) return;

    try {
      const { error } = await supabase
        .from('grade_computations')
        .delete()
        .eq('computation_id', templateId);

      if (error) throw error;

      await logActivity(
        'Grading Template Deletion',
        `Deleted grading template: "${templateName}"`,
        resolveActorName(profile, user)
      );

      loadTemplates();
    } catch (err) {
      console.error('Failed to delete template:', err);
      alert('Delete failed: ' + err.message);
    }
  };

  return (
    <>
      <PageHeader title="Grade Computation Templates" breadcrumb="Admin Portal">
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
                  <button 
                    onClick={() => handleDeleteTemplate(temp.computation_id, temp.name)}
                    className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50/50 rounded-lg transition-colors flex items-center gap-1 text-xs font-semibold"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
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
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
          {/* Backdrop blur */}
          <div 
            onClick={() => !saving && setIsEditorOpen(false)}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity" 
          />

          <div className="relative max-w-xl w-full bg-white shadow-2xl h-full flex flex-col animate-in slide-in-from-right duration-300 ease-out">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="text-base font-bold font-display text-slate-900 text-left">
                  {editingTemplate ? 'Edit Grading Template' : 'Configure New Template'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 text-left">Set calculation weights and default scales for courses.</p>
              </div>
              <button 
                onClick={() => setIsEditorOpen(false)}
                disabled={saving}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-900 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleOpenConfirm} className="flex-1 overflow-y-auto p-6 space-y-6 flex flex-col justify-between">
              <div className="space-y-6 text-left">
                {errorMsg && (
                  <div className="p-3 bg-rose-50 border border-rose-100 text-rose-700 text-xs font-semibold rounded-lg flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}
                {successMsg && (
                  <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-semibold rounded-lg flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                    <span>{successMsg}</span>
                  </div>
                )}

                {/* General Info */}
                <div className="space-y-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Template Name <span className="text-rose-500">*</span></label>
                    <input 
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. General Education Core"
                      className="block w-full px-3.5 py-2 border border-slate-200 hover:border-slate-300 focus:border-sage-500 rounded-lg text-sm outline-none transition-all focus:ring-1 focus:ring-sage-500"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Description</label>
                    <textarea 
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Specify departments or guidelines applying this formula scale..."
                      className="block w-full px-3.5 py-2 border border-slate-200 hover:border-slate-300 focus:border-sage-500 rounded-lg text-sm h-20 resize-none outline-none transition-all focus:ring-1 focus:ring-sage-500"
                    />
                  </div>
                </div>

                {/* Components section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Grading Components Structure</label>
                    <button 
                      type="button"
                      onClick={handleAddComponentRow}
                      className="text-xs text-sage-600 hover:text-sage-700 font-bold flex items-center gap-1.5"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add Component Row
                    </button>
                  </div>

                  {/* Table Row Headers to distinguish Weight and Max Points */}
                  <div className="flex gap-2.5 items-center text-[9px] font-extrabold text-slate-400 uppercase tracking-wider px-1">
                    <div className="flex-1">Component Name</div>
                    <div className="w-20 text-center">Weight %</div>
                    <div className="w-20 text-center">Max Score</div>
                    <div className="w-[78px] text-center">Behavior</div>
                    <div className="w-8"></div>
                  </div>

                  <div className="space-y-2.5">
                    {components.map((comp, idx) => (
                      <div key={idx} className="flex gap-2.5 items-center">
                        <div className="flex-1">
                          <input 
                            type="text"
                            required
                            value={comp.name}
                            onChange={(e) => handleComponentChange(idx, 'name', e.target.value)}
                            placeholder="Component Name (e.g. Written Quiz)"
                            className="block w-full px-3 py-1.5 border border-slate-250 hover:border-slate-300 focus:border-sage-500 rounded-lg text-xs outline-none transition-all"
                          />
                        </div>
                        <div className="w-20">
                          <input 
                            type="number"
                            required
                            min="1"
                            max="100"
                            value={comp.weight}
                            onChange={(e) => handleComponentChange(idx, 'weight', parseInt(e.target.value, 10))}
                            placeholder="Weight %"
                            className="block w-full px-2.5 py-1.5 border border-slate-250 hover:border-slate-300 focus:border-sage-500 rounded-lg text-xs font-mono outline-none text-right"
                          />
                        </div>
                        <div className="w-20">
                          <input 
                            type="number"
                            required
                            min="1"
                            max="500"
                            value={comp.max_score}
                            onChange={(e) => handleComponentChange(idx, 'max_score', parseInt(e.target.value, 10))}
                            placeholder="Max Score"
                            className="block w-full px-2.5 py-1.5 border border-slate-250 hover:border-slate-300 focus:border-sage-500 rounded-lg text-xs font-mono outline-none text-right"
                          />
                        </div>
                        <label className="flex items-center gap-1 cursor-pointer select-none border border-slate-200 rounded-lg px-2 py-1 bg-slate-50/50 hover:bg-slate-50 w-[78px] justify-center">
                          <input 
                            type="checkbox"
                            checked={!!comp.is_multiple}
                            onChange={(e) => handleComponentChange(idx, 'is_multiple', e.target.checked)}
                            className="rounded text-sage-600 focus:ring-sage-500 border-slate-300 w-3.5 h-3.5"
                          />
                          <span className="text-[10px] text-slate-500 font-bold whitespace-nowrap">Multiple?</span>
                        </label>
                        <button 
                          type="button"
                          disabled={components.length <= 1}
                          onClick={() => handleRemoveComponentRow(idx)}
                          className="p-1.5 text-slate-350 hover:text-rose-500 disabled:opacity-30 disabled:hover:text-slate-350 rounded-lg"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Drawer footer details */}
              <div className="pt-6 border-t border-slate-100 flex flex-col gap-4 bg-white mt-10">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Total Weighted Sum:</span>
                  <span className={`font-mono text-sm font-extrabold px-2.5 py-0.5 rounded-full border ${
                    totalWeight === 100 
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
                    className="flex-1 px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg text-sm font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={saving}
                    className="flex-1 px-4 py-2 bg-sage-600 hover:bg-sage-700 disabled:bg-sage-400 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 shadow-sm"
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
        <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-5 text-left animate-in zoom-in-95 duration-200 max-w-md w-full">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-full bg-sage-50 text-sage-600 flex items-center justify-center flex-shrink-0">
                <Settings className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 font-display">
                  {editingTemplate ? 'Confirm Template Changes' : 'Confirm New Grading Template'}
                </h3>
                <p className="text-xs text-slate-500 mt-1 font-sans">
                  {editingTemplate 
                    ? 'Please review the template components and weights before updating.' 
                    : 'Are you sure you want to register this new grading computation template?'}
                </p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 border border-slate-150 space-y-3 text-xs">
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

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSave}
                className="flex-1 px-4 py-2 bg-sage-600 hover:bg-sage-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm flex items-center justify-center gap-1.5"
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
