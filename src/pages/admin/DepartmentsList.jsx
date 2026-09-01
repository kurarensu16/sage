import React, { useState, useEffect, useMemo } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import { Plus, Edit2, Save, X, Building, UserCheck, UserX, CheckCircle2, AlertCircle, Search, ChevronRight, Users, Layers } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { logActivity, resolveActorName } from '../../lib/auditLog';
import { notifyAdminActivity } from '../../lib/notificationDispatcher';
import { cn } from '../../lib/utils';

export default function DepartmentsList() {
  const { user, profile } = useAuth();
  
  // Data lists
  const [departments, setDepartments] = useState([]);
  const [deansList, setDeansList] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'assigned', 'unassigned'

  // Modal/Drawer state
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingDept, setEditingDept] = useState(null); // department object or null for new
  
  // Form fields
  const [name, setName] = useState('');
  const [selectedDeanId, setSelectedDeanId] = useState('');
  
  // Alert logs
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // 1. Fetch departments
      const { data: deptData, error: deptErr } = await supabase
        .from('departments')
        .select('*')
        .order('name');
        
      if (deptErr) throw deptErr;

      // 2. Fetch users with role = 'dean'
      const { data: userData, error: userErr } = await supabase
        .from('users')
        .select('user_id, first_name, last_name, email, department_id')
        .eq('role', 'dean')
        .eq('status', 'active');
        
      if (userErr) throw userErr;

      setDeansList(userData || []);

      // 3. Map deans to departments
      const mapped = (deptData || []).map(dept => {
        const matchingDeans = (userData || []).filter(u => u.department_id === dept.department_id);
        return {
          ...dept,
          deans: matchingDeans
        };
      });

      setDepartments(mapped);
    } catch (err) {
      console.error('Failed to load departments data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenNew = () => {
    setEditingDept(null);
    setName('');
    setSelectedDeanId('');
    setErrorMsg('');
    setSuccessMsg('');
    setShowConfirmModal(false);
    setIsEditorOpen(true);
  };

  const handleOpenEdit = (dept) => {
    setEditingDept(dept);
    setName(dept.name);
    setSelectedDeanId(dept.deans?.[0]?.user_id || '');
    setErrorMsg('');
    setSuccessMsg('');
    setShowConfirmModal(false);
    setIsEditorOpen(true);
  };

  const handleOpenConfirm = (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!name.trim()) {
      setErrorMsg('Please enter a department name.');
      return;
    }

    setShowConfirmModal(true);
  };

  const handleConfirmSave = async () => {
    setShowConfirmModal(false);
    setSaving(true);
    try {
      const actorName = resolveActorName(profile, user);
      let targetDeptId;

      if (editingDept) {
        targetDeptId = editingDept.department_id;
        
        // 1. Update department name
        const { error: deptErr } = await supabase
          .from('departments')
          .update({ name: name.trim() })
          .eq('department_id', targetDeptId);

        if (deptErr) throw deptErr;

        // 2. Update deans relations
        // If a new dean was selected, update their department_id. Remove department_id from other deans of this department.
        if (selectedDeanId) {
          // Reset other deans in this department
          await supabase
            .from('users')
            .update({ department_id: null })
            .eq('role', 'dean')
            .eq('department_id', targetDeptId);

          // Link new dean
          const { error: deanErr } = await supabase
            .from('users')
            .update({ department_id: targetDeptId })
            .eq('user_id', selectedDeanId);

          if (deanErr) throw deanErr;
        }

        await logActivity(
          'Department Update',
          `Modified college department: "${name}".`,
          actorName
        );

        await notifyAdminActivity({
          type: 'system',
          message: `Department Database: Department "${name}" was updated by ${actorName}.`,
          actorName
        });
        setSuccessMsg('College department updated successfully!');
      } else {
        // Create new department
        const { data: inserted, error: deptErr } = await supabase
          .from('departments')
          .insert({ name: name.trim() })
          .select()
          .single();

        if (deptErr) throw deptErr;
        targetDeptId = inserted.department_id;

        // Link Dean if selected
        if (selectedDeanId) {
          const { error: deanErr } = await supabase
            .from('users')
            .update({ department_id: targetDeptId })
            .eq('user_id', selectedDeanId);

          if (deanErr) throw deanErr;
        }

        await logActivity(
          'Department Creation',
          `Created new college department: "${name}".`,
          actorName
        );

        await notifyAdminActivity({
          type: 'system',
          message: `Department Database: New department "${name}" was created by ${actorName}.`,
          actorName
        });
        setSuccessMsg('College department registered successfully!');
      }

      loadData();
      setTimeout(() => {
        setIsEditorOpen(false);
      }, 1500);

    } catch (err) {
      console.error('Failed to save department:', err);
      setErrorMsg('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Filtered list
  const filteredDepartments = useMemo(() => {
    return departments.filter(dept => {
      const matchesSearch = dept.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        dept.deans?.some(d => `${d.first_name} ${d.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) || d.email?.toLowerCase().includes(searchTerm.toLowerCase()));
      
      if (!matchesSearch) return false;

      const hasDean = dept.deans && dept.deans.length > 0;
      if (statusFilter === 'assigned') return hasDean;
      if (statusFilter === 'unassigned') return !hasDean;
      return true;
    });
  }, [departments, searchTerm, statusFilter]);

  const totalCount = departments.length;
  const assignedCount = departments.filter(d => d.deans && d.deans.length > 0).length;
  const unassignedCount = totalCount - assignedCount;

  return (
    <>
      <PageHeader title="Colleges & Departments" breadcrumb="Admin Portal">
        <button 
          onClick={handleOpenNew}
          className="px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-medium bg-sage-600 hover:bg-sage-700 text-white rounded-xl transition-all shadow-xs flex items-center gap-1.5 sm:gap-2 cursor-pointer whitespace-nowrap"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Add New College</span>
          <span className="sm:hidden">Add College</span>
        </button>
      </PageHeader>

      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-3.5 sm:space-y-6">
        
        {/* ── Metric Summary Grid ───────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
          <div className="bg-white rounded-2xl border border-slate-200/90 p-3 sm:p-4 shadow-2xs flex items-center gap-3">
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-sage-50 text-sage-700 flex items-center justify-center flex-shrink-0">
              <Building className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider block truncate">Colleges</span>
              <span className="text-base sm:text-2xl font-bold font-display text-slate-900 leading-tight">{totalCount}</span>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/90 p-3 sm:p-4 shadow-2xs flex items-center gap-3">
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center flex-shrink-0">
              <UserCheck className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider block truncate">Assigned</span>
              <span className="text-base sm:text-2xl font-bold font-display text-emerald-700 leading-tight">{assignedCount}</span>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/90 p-3 sm:p-4 shadow-2xs flex items-center gap-3">
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center flex-shrink-0">
              <UserX className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider block truncate">Unassigned</span>
              <span className="text-base sm:text-2xl font-bold font-display text-amber-700 leading-tight">{unassignedCount}</span>
            </div>
          </div>
        </div>

        {/* ── Search & Filter Controls ──────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4">
          <div className="relative max-w-md w-full">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input 
              type="text" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-9 py-2.5 sm:py-2 border border-slate-200 rounded-xl text-xs sm:text-sm bg-white focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none transition-colors shadow-2xs" 
              placeholder="Search college name or assigned dean..." 
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
            {[
              { id: 'all', label: 'All', count: totalCount },
              { id: 'assigned', label: 'With Dean', count: assignedCount },
              { id: 'unassigned', label: 'No Dean', count: unassignedCount },
            ].map(tab => {
              const isSelected = statusFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer flex-shrink-0",
                    isSelected
                      ? "bg-slate-900 text-white shadow-xs"
                      : "bg-white text-slate-600 border border-slate-200/90 hover:bg-slate-50"
                  )}
                >
                  <span>{tab.label}</span>
                  <span className={cn(
                    "text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full",
                    isSelected ? "bg-slate-800 text-slate-200" : "bg-slate-100 text-slate-500"
                  )}>
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── College Cards Grid ────────────────────────────────────────── */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-sage-600"></div>
            <p className="text-sm text-slate-500 font-medium font-sans">Loading colleges list...</p>
          </div>
        ) : filteredDepartments.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/90 p-8 text-center text-slate-400 text-xs">
            No college departments match your search criteria.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-6">
            {filteredDepartments.map(dept => {
              const hasDean = dept.deans && dept.deans.length > 0;
              const primaryDean = hasDean ? dept.deans[0] : null;

              return (
                <div 
                  key={dept.department_id} 
                  className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs hover:shadow-sm p-4 sm:p-6 flex flex-col justify-between hover:border-sage-350 transition-all text-left space-y-3.5"
                >
                  <div className="space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-sage-100/80 text-sage-800 flex items-center justify-center flex-shrink-0 border border-sage-200">
                          <Building className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-bold text-slate-900 text-sm sm:text-base font-display leading-snug break-words">
                            {dept.name}
                          </h3>
                          <span className="text-[10px] font-mono text-slate-400 block mt-0.5">
                            ID: {dept.department_id}
                          </span>
                        </div>
                      </div>

                      <span className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border flex-shrink-0 whitespace-nowrap",
                        hasDean 
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                          : "bg-amber-50 text-amber-700 border-amber-200"
                      )}>
                        {hasDean ? 'Dean Assigned' : 'Unassigned'}
                      </span>
                    </div>

                    {/* Assigned Dean Box */}
                    <div className="pt-2.5 border-t border-slate-100">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                        Academic Leadership
                      </span>
                      {hasDean && primaryDean ? (
                        <div className="flex items-center gap-2.5 text-xs font-semibold text-slate-800 bg-slate-50/80 p-2.5 rounded-xl border border-slate-200/80">
                          <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs flex-shrink-0 font-display border border-emerald-200">
                            {primaryDean.first_name?.[0] || ''}{primaryDean.last_name?.[0] || ''}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-slate-900 font-bold font-display text-xs truncate">
                              Dean {primaryDean.last_name}, {primaryDean.first_name}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono truncate">
                              {primaryDean.email}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-amber-700 font-medium bg-amber-50/70 p-2.5 rounded-xl border border-amber-200/80 flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                          <span className="text-[11px]">No Dean assigned yet</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Action */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-end">
                    <button 
                      onClick={() => handleOpenEdit(dept)}
                      className="w-full sm:w-auto px-3.5 py-2 border border-slate-200 hover:border-sage-350 text-slate-700 hover:text-sage-700 bg-white hover:bg-slate-50 rounded-xl transition-all flex items-center justify-center gap-1.5 text-xs font-bold shadow-2xs cursor-pointer"
                    >
                      <Edit2 className="h-3.5 w-3.5 text-slate-500" />
                      <span>Configure College & Dean</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* ── College Editor Drawer ───────────────────────────────────────── */}
      {isEditorOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden flex items-end sm:items-stretch sm:justify-end">
          <div 
            onClick={() => !saving && setIsEditorOpen(false)}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity" 
          />

          <div className="relative max-w-md w-full bg-white max-h-[92vh] sm:max-h-full sm:h-full rounded-t-3xl sm:rounded-none shadow-2xl flex flex-col animate-in slide-in-from-bottom sm:slide-in-from-right duration-300 ease-out z-10 overflow-hidden">
            {/* Mobile Grab Handle */}
            <div className="sm:hidden pt-3 pb-1 flex justify-center flex-shrink-0">
              <div className="w-12 h-1.5 bg-slate-200 rounded-full" />
            </div>

            <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 flex-shrink-0">
              <div>
                <h3 className="text-sm sm:text-base font-bold font-display text-slate-900 text-left">
                  {editingDept ? 'Configure College Department' : 'Register New College'}
                </h3>
                <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 text-left">Modify college listings and assign academic deans.</p>
              </div>
              <button 
                onClick={() => setIsEditorOpen(false)}
                disabled={saving}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-900 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleOpenConfirm} className="flex-1 p-4 sm:p-6 space-y-4 sm:space-y-6 flex flex-col justify-between overflow-y-auto">
              <div className="space-y-4 sm:space-y-5 text-left">
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

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">College Name <span className="text-rose-500">*</span></label>
                  <input 
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. College of Computer Studies"
                    className="block w-full px-3.5 py-2.5 border border-slate-200 hover:border-slate-300 focus:border-sage-500 rounded-xl text-xs sm:text-sm outline-none transition-all focus:ring-1 focus:ring-sage-500 shadow-2xs"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Assign Academic Dean</label>
                  <select
                    value={selectedDeanId}
                    onChange={(e) => setSelectedDeanId(e.target.value)}
                    className="block w-full bg-white border border-slate-200 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm hover:border-slate-300 focus:border-sage-500 outline-none transition-all focus:ring-1 focus:ring-sage-500 cursor-pointer shadow-2xs"
                  >
                    <option value="">-- No Dean Selected / Unassigned --</option>
                    {deansList
                      .filter(dean => !dean.department_id || dean.department_id === editingDept?.department_id)
                      .map(dean => (
                        <option key={dean.user_id} value={dean.user_id}>
                          {dean.last_name}, {dean.first_name} ({dean.email})
                        </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-400 leading-normal mt-1">
                    Only active user accounts registered with the role "Dean" who are currently unassigned or assigned to this department are listed.
                  </p>
                </div>
              </div>

              <div className="pt-4 sm:pt-6 border-t border-slate-100 flex items-center gap-3 flex-shrink-0">
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
                  className="flex-1 px-4 py-2.5 bg-sage-600 hover:bg-sage-700 disabled:bg-sage-400 text-white rounded-xl text-xs sm:text-sm font-semibold transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer"
                >
                  <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save College'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Confirmation Modal ─────────────────────────────────────────── */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-2xl p-5 sm:p-6 space-y-4 sm:space-y-5 text-left animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 max-w-md w-full">
            {/* Grab Handle */}
            <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto sm:hidden -mt-1 mb-1" />

            <div className="flex items-start gap-3 sm:gap-4">
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-sage-50 text-sage-600 flex items-center justify-center flex-shrink-0 border border-sage-200">
                <Building className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900 font-display">
                  {editingDept ? 'Confirm Department Changes' : 'Confirm College Registration'}
                </h3>
                <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 sm:mt-1 font-sans">
                  {editingDept 
                    ? 'Please review your changes before updating this college department.' 
                    : 'Are you sure you want to register this new college department?'}
                </p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-3.5 sm:p-4 border border-slate-150 space-y-2 text-xs">
              <div className="flex justify-between items-start gap-3">
                <span className="text-slate-450 font-bold uppercase tracking-wider text-[10px]">College Name:</span>
                <span className="font-bold text-slate-900 text-right">{name.trim()}</span>
              </div>
              <div className="flex justify-between items-start gap-3 pt-2 border-t border-slate-200/60">
                <span className="text-slate-450 font-bold uppercase tracking-wider text-[10px]">Assigned Dean:</span>
                <span className="font-semibold text-slate-800 text-right">
                  {deansList.find(d => d.user_id === selectedDeanId)
                    ? `${deansList.find(d => d.user_id === selectedDeanId).last_name}, ${deansList.find(d => d.user_id === selectedDeanId).first_name}`
                    : 'Unassigned'}
                </span>
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
                {editingDept ? 'Save Changes' : 'Register College'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
