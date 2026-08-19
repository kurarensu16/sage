import React, { useState, useEffect } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import { Plus, Edit2, Save, X, Building, UserCheck, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { logActivity, resolveActorName } from '../../lib/auditLog';

export default function DepartmentsList() {
  const { user, profile } = useAuth();
  
  // Data lists
  const [departments, setDepartments] = useState([]);
  const [deansList, setDeansList] = useState([]);
  const [loading, setLoading] = useState(true);
  
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
    setIsEditorOpen(true);
  };

  const handleOpenEdit = (dept) => {
    setEditingDept(dept);
    setName(dept.name);
    setSelectedDeanId(dept.deans?.[0]?.user_id || '');
    setErrorMsg('');
    setSuccessMsg('');
    setIsEditorOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!name.trim()) {
      setErrorMsg('Please enter a department name.');
      return;
    }

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

  return (
    <>
      <PageHeader title="Colleges & Departments Management" breadcrumb="Admin Portal">
        <button 
          onClick={handleOpenNew}
          className="px-4 py-2 text-sm font-medium bg-sage-600 hover:bg-sage-700 text-white rounded-lg transition-all shadow-sm flex items-center gap-2"
        >
          <Plus className="h-4 w-4" /> Add New College
        </button>
      </PageHeader>

      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-4 sm:space-y-6 md:space-y-8">
        
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-sage-600"></div>
            <p className="text-sm text-slate-500 font-medium">Loading colleges list...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {departments.map(dept => (
              <div 
                key={dept.department_id} 
                className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex items-start justify-between hover:border-sage-350 hover:shadow-md transition-all text-left"
              >
                <div className="space-y-4 flex-1 pr-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-sage-50 text-sage-600 rounded-xl">
                      <Building className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm font-display">{dept.name}</h3>
                      <span className="text-[10px] font-mono text-slate-400">ID: {dept.department_id}</span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 space-y-2">
                    <span className="text-[10px] font-bold text-slate-450 uppercase tracking-wider block">Assigned Dean</span>
                    {dept.deans && dept.deans.length > 0 ? (
                      dept.deans.map(dean => (
                        <div key={dean.user_id} className="flex items-center gap-2 text-xs font-semibold text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-150">
                          <UserCheck className="h-4 w-4 text-emerald-600" />
                          <div className="truncate">
                            <div className="text-slate-900 font-bold">{dean.last_name}, {dean.first_name}</div>
                            <div className="text-[10px] text-slate-450 font-mono mt-0.5">{dean.email}</div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-amber-600 font-bold bg-amber-50 p-2.5 rounded-lg border border-amber-100 flex items-center gap-1.5">
                        <AlertCircle className="h-3.5 w-3.5" /> No Dean Assigned
                      </div>
                    )}
                  </div>
                </div>

                <button 
                  onClick={() => handleOpenEdit(dept)}
                  className="px-3 py-1.5 border border-slate-200 hover:border-sage-300 text-slate-600 hover:text-sage-700 bg-white rounded-lg transition-colors flex items-center gap-1 text-xs font-bold shadow-xs"
                >
                  <Edit2 className="h-3.5 w-3.5" /> Configure
                </button>
              </div>
            ))}
          </div>
        )}

      </div>

      {/* College editor drawer */}
      {isEditorOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
          <div 
            onClick={() => !saving && setIsEditorOpen(false)}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity" 
          />

          <div className="relative max-w-md w-full bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 ease-out">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="text-base font-bold font-display text-slate-900 text-left">
                  {editingDept ? 'Configure College Department' : 'Register New College'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 text-left">Modify college listings and assign academic deans.</p>
              </div>
              <button 
                onClick={() => setIsEditorOpen(false)}
                disabled={saving}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-900 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 p-6 space-y-6 flex flex-col justify-between">
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

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">College Name <span className="text-rose-500">*</span></label>
                  <input 
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. College of Computer Studies"
                    className="block w-full px-3.5 py-2 border border-slate-200 hover:border-slate-300 focus:border-sage-500 rounded-lg text-sm outline-none transition-all focus:ring-1 focus:ring-sage-500"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Assign Dean</label>
                  <select
                    value={selectedDeanId}
                    onChange={(e) => setSelectedDeanId(e.target.value)}
                    className="block w-full bg-white border border-slate-200 px-3.5 py-2.5 rounded-lg text-sm hover:border-slate-300 focus:border-sage-500 outline-none transition-all focus:ring-1 focus:ring-sage-500 cursor-pointer"
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

              <div className="pt-6 border-t border-slate-100 flex items-center gap-3">
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
                  <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save College'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
