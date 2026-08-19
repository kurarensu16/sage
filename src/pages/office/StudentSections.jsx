import React, { useState, useEffect } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import { Settings2, Search, UserCheck, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { logActivity, resolveActorName } from '../../lib/auditLog';

export default function StudentSections() {
  const { user, profile } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Feedback states
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Fetch sections in the uploader's/admin's department scope
  useEffect(() => {
    async function loadSections() {
      if (!profile) return;
      try {
        const { data, error } = await supabase
          .from('sections')
          .select('*')
          .eq('department_id', profile.department_id)
          .order('name');
        
        if (error) throw error;
        setSections(data || []);
      } catch (err) {
        console.error('Failed to load sections:', err);
      }
    }
    loadSections();
  }, [profile]);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    setSelectedStudent(null);

    try {
      // Find students in the users database belonging to the same department
      const { data, error } = await supabase
        .from('users')
        .select('*, sections(name)')
        .eq('role', 'student')
        .eq('department_id', profile?.department_id)
        .or(`email.ilike.%${searchTerm.trim()}%,first_name.ilike.%${searchTerm.trim()}%,last_name.ilike.%${searchTerm.trim()}%,user_number.ilike.%${searchTerm.trim()}%`);

      if (error) throw error;
      setStudents(data || []);
      
      if (!data || data.length === 0) {
        setErrorMsg('No students found matching search term in your department.');
      }
    } catch (err) {
      console.error('Student search failed:', err);
      setErrorMsg('Search error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateSection = async (studentId, sectionName) => {
    setSaving(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      let targetSectionId = null;
      let logMsg = '';

      if (sectionName !== 'Irregular') {
        const matchedSec = sections.find(s => s.name === sectionName);
        if (!matchedSec) throw new Error('Selected section is invalid.');
        targetSectionId = matchedSec.section_id;
        logMsg = `Transferred student to block section ${sectionName}`;
      } else {
        logMsg = `Assigned student to Irregular status (Unassigned block)`;
      }

      const { error } = await supabase
        .from('users')
        .update({ section_id: targetSectionId })
        .eq('user_id', studentId);

      if (error) throw error;

      // Update local state details
      const studentObj = students.find(s => s.user_id === studentId);
      const updatedStudent = {
        ...studentObj,
        section_id: targetSectionId,
        sections: targetSectionId ? { name: sectionName } : null
      };

      setStudents(prev => prev.map(s => s.user_id === studentId ? updatedStudent : s));
      setSelectedStudent(updatedStudent);
      setSuccessMsg('Student section status modified successfully!');

      // Audit Logging
      const actorName = resolveActorName(profile, user);
      await logActivity(
        'Section Modification',
        `${logMsg} for student ${studentObj.first_name} ${studentObj.last_name} (${studentObj.email}).`,
        actorName
      );
    } catch (err) {
      console.error('Update section failed:', err);
      setErrorMsg('Modification failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader title="Student Sections Modifier" breadcrumb="College Office Portal" />
      <div className="p-8 overflow-y-auto flex-1 max-w-4xl mx-auto w-full space-y-6">
        
        {/* Action Panel Header */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
             <Settings2 className="h-6 w-6 text-sage-600" />
             <div>
               <h3 className="text-lg font-bold text-slate-900 text-left">Modify Student Block Sections</h3>
               <p className="text-xs text-slate-500 mt-0.5 text-left">Transfer students between blocks or convert them to Irregular status.</p>
             </div>
          </div>

          {/* Search Bar Input */}
          <form onSubmit={handleSearch} className="flex gap-2.5">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-3 h-4.5 w-4.5 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search student by Email, Name, or ID number..."
                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 focus:border-sage-500 rounded-lg text-sm outline-none transition-all focus:ring-1 focus:ring-sage-500"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 bg-sage-600 hover:bg-sage-700 disabled:bg-sage-400 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </form>

          {/* Status Message Boxes */}
          {errorMsg && (
            <div className="p-4 bg-rose-50 border border-rose-100 text-rose-700 text-xs font-semibold rounded-lg flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="p-4 bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-semibold rounded-lg flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> {successMsg}
            </div>
          )}
        </div>

        {/* Results layout */}
        {students.length > 0 && !selectedStudent && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-slate-50/50 border-b border-slate-100">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider text-left">Search Results ({students.length})</h4>
            </div>
            <div className="divide-y divide-slate-100 max-h-[300px] overflow-y-auto">
              {students.map(stud => (
                <div 
                  key={stud.user_id} 
                  onClick={() => setSelectedStudent(stud)}
                  className="p-4 hover:bg-slate-50 cursor-pointer flex items-center justify-between text-left transition-colors"
                >
                  <div>
                    <div className="font-bold text-sm text-slate-800">{stud.last_name}, {stud.first_name}</div>
                    <div className="text-xs font-mono text-slate-500 mt-0.5">{stud.user_number || 'No ID Number'} • {stud.email}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={stud.sections?.name 
                      ? "px-2.5 py-1 text-[10px] font-bold bg-slate-100 text-slate-650 rounded-full border border-slate-200"
                      : "px-2.5 py-1 text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 rounded-full"
                    }>
                      {stud.sections?.name || 'Irregular'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Selected Student Action Sheet */}
        {selectedStudent && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
            <div className="flex items-start justify-between">
              <div className="flex gap-4 items-center">
                <div className="p-3 bg-sage-50 rounded-xl text-sage-600">
                  <UserCheck className="h-6 w-6" />
                </div>
                <div className="text-left">
                  <h4 className="font-bold text-slate-900 text-base">{selectedStudent.last_name}, {selectedStudent.first_name}</h4>
                  <p className="text-xs font-mono text-slate-400 mt-0.5">{selectedStudent.email}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedStudent(null)}
                className="text-xs font-bold text-slate-400 hover:text-slate-600 underline"
              >
                Back to results
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
              <div className="space-y-3.5 text-left text-xs font-medium text-slate-500">
                <div>
                  <span className="font-semibold text-slate-400 block uppercase tracking-wider text-[9px]">Current Assigned Block</span>
                  <span className={selectedStudent.sections?.name 
                    ? "mt-1.5 inline-block px-3 py-1 rounded-full bg-slate-100 text-slate-700 font-bold border border-slate-200"
                    : "mt-1.5 inline-block px-3 py-1 rounded-full bg-amber-50 text-amber-700 font-bold border border-amber-200"
                  }>
                    {selectedStudent.sections?.name || 'Irregular Status'}
                  </span>
                </div>
                <div>
                  <span className="font-semibold text-slate-400 block uppercase tracking-wider text-[9px]">Academic Year Level</span>
                  <span className="text-slate-800 text-sm font-bold mt-1 inline-block">{selectedStudent.year_level || '1st Year'}</span>
                </div>
              </div>

              {/* Action Modifiers Dropdown */}
              <div className="flex flex-col gap-2 text-left">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Assign New Status / Section</label>
                <select
                  disabled={saving}
                  value={selectedStudent.sections?.name || 'Irregular'}
                  onChange={(e) => handleUpdateSection(selectedStudent.user_id, e.target.value)}
                  className="block w-full bg-white border border-slate-200 px-3.5 py-2.5 rounded-lg text-sm hover:border-slate-300 focus:border-sage-500 outline-none transition-all focus:ring-1 focus:ring-sage-500 cursor-pointer"
                >
                  <option value="Irregular">Convert to Irregular (Unassigned Block)</option>
                  {sections.map(sec => (
                    <option key={sec.section_id} value={sec.name}>{sec.name}</option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 leading-normal mt-1">
                  Converting to Irregular removes the block section link. Manual enrollment overrides inside the Admin portal can then schedule individual subjects for this student.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
