import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { ChevronRight, Save, Calendar, Clock, AlertCircle } from 'lucide-react';
import { mockDb } from '../../lib/mockDb';

export default function EvalWindowForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const windowId = params.get('id');

  const [templates, setTemplates] = useState([]);
  const [facultyUsers, setFacultyUsers] = useState([]);
  const [classrooms, setClassrooms] = useState([]);
  const [filteredClassrooms, setFilteredClassrooms] = useState([]);

  const [formData, setFormData] = useState({
    templateId: '',
    facultyId: '',
    section: '',
    openAt: '',
    closeAt: ''
  });

  const [errorMsg, setErrorMsg] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);

  useEffect(() => {
    // Load lists from mockDb
    const tmpls = mockDb.getEvalTemplates();
    const users = mockDb.getUsers();
    const classes = mockDb.getClassrooms();

    setTemplates(tmpls);
    setFacultyUsers(users.filter(u => u.role === 'faculty' && u.status === 'active'));
    setClassrooms(classes.filter(c => c.status === 'active'));

    if (windowId) {
      setIsEditMode(true);
      const windows = mockDb.getEvalWindows();
      const existing = windows.find(w => w.id === windowId);
      if (existing) {
        setFormData({
          templateId: existing.templateId,
          facultyId: existing.facultyId,
          section: existing.section,
          openAt: existing.openAt,
          closeAt: existing.closeAt
        });
      } else {
        setErrorMsg('Evaluation window scheduler entry not found.');
      }
    }
  }, [windowId]);

  // Dynamically filter sections when facultyId changes
  useEffect(() => {
    if (formData.facultyId) {
      const filtered = classrooms.filter(c => c.facultyId === formData.facultyId);
      setFilteredClassrooms(filtered);
      
      // Auto-reset section if it doesn't belong to the newly selected faculty
      if (filtered.length > 0 && !filtered.some(c => c.section === formData.section)) {
        setFormData(prev => ({ ...prev, section: '' }));
      }
    } else {
      setFilteredClassrooms([]);
      setFormData(prev => ({ ...prev, section: '' }));
    }
  }, [formData.facultyId, classrooms]);

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!formData.templateId || !formData.facultyId || !formData.section || !formData.openAt || !formData.closeAt) {
      setErrorMsg('Please complete all form fields.');
      return;
    }

    const openDate = new Date(formData.openAt);
    const closeDate = new Date(formData.closeAt);

    if (closeDate <= openDate) {
      setErrorMsg('Close Date & Time must be after the Open Date & Time.');
      return;
    }

    // Get student count for selected classroom to set totalStudents count
    const selectedClass = classrooms.find(
      c => c.facultyId === formData.facultyId && c.section === formData.section
    );
    const totalStudentsCount = selectedClass ? selectedClass.enrolledCount : 35; // Fallback to 35 if not matched

    const windowData = {
      templateId: formData.templateId,
      facultyId: formData.facultyId,
      section: formData.section,
      openAt: formData.openAt,
      closeAt: formData.closeAt,
      totalStudents: totalStudentsCount,
      isClosed: false
    };

    if (isEditMode) {
      windowData.id = windowId;
    }

    mockDb.saveEvalWindow(windowData);
    navigate('/admin/evalwindowlist');
  };

  return (
    <>
      <PageHeader 
        title={isEditMode ? "Modify Evaluation Window" : "Schedule Evaluation Window"} 
        breadcrumb="Admin Portal" 
      />

      <div className="p-8 overflow-y-auto flex-1 max-w-2xl mx-auto w-full space-y-6">
        
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span className="hover:text-sage-600 cursor-pointer transition-colors" onClick={() => navigate('/admin/evalwindowlist')}>
            Evaluation Windows
          </span>
          <ChevronRight className="h-3 w-3" />
          <span className="font-medium text-slate-900">
            {isEditMode ? "Edit Scheduler" : "Create Scheduler"}
          </span>
        </div>

        {errorMsg && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 p-4 rounded-lg text-sm font-semibold">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
            <div className="p-2 bg-sage-50 text-sage-600 rounded-lg">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold font-display text-slate-900">Evaluation Window Scheduler</h3>
              <p className="text-xs text-slate-500 mt-0.5 font-sans">Set availability periods for student feedback submissions.</p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Select Template */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Evaluation Form Template <span className="text-rose-500">*</span></label>
              <select
                required
                value={formData.templateId}
                onChange={(e) => setFormData({...formData, templateId: e.target.value})}
                className="block w-full bg-white border border-slate-200 px-3.5 py-2.5 rounded-lg text-sm hover:border-slate-300 focus:border-sage-500 outline-none transition-all cursor-pointer"
              >
                <option value="">Select evaluation template...</option>
                {templates.map((tmpl) => (
                  <option key={tmpl.id} value={tmpl.id}>{tmpl.title}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Select Faculty */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Instructor <span className="text-rose-500">*</span></label>
                <select
                  required
                  value={formData.facultyId}
                  onChange={(e) => setFormData({...formData, facultyId: e.target.value})}
                  className="block w-full bg-white border border-slate-200 px-3.5 py-2.5 rounded-lg text-sm hover:border-slate-300 focus:border-sage-500 outline-none transition-all cursor-pointer"
                >
                  <option value="">Select instructor...</option>
                  {facultyUsers.map((fac) => (
                    <option key={fac.id} value={fac.id}>Prof. {fac.firstName} {fac.lastName}</option>
                  ))}
                </select>
              </div>

              {/* Select Section */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Class Section <span className="text-rose-500">*</span></label>
                <select
                  required
                  disabled={!formData.facultyId}
                  value={formData.section}
                  onChange={(e) => setFormData({...formData, section: e.target.value})}
                  className="block w-full bg-white disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed border border-slate-200 px-3.5 py-2.5 rounded-lg text-sm hover:border-slate-300 focus:border-sage-500 outline-none transition-all cursor-pointer"
                >
                  <option value="">Select section...</option>
                  {filteredClassrooms.map((cls) => (
                    <option key={cls.id} value={cls.section}>
                      {cls.section} - {cls.subjectCode} ({cls.subjectName})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Open Time */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5 text-slate-400" /> Open Date & Time <span className="text-rose-500">*</span>
                </label>
                <input 
                  type="datetime-local" 
                  required
                  value={formData.openAt}
                  onChange={(e) => setFormData({...formData, openAt: e.target.value})}
                  className="block w-full px-3.5 py-2 border border-slate-200 hover:border-slate-300 focus:border-sage-500 rounded-lg text-sm font-mono outline-none transition-all focus:ring-1 focus:ring-sage-500"
                />
              </div>

              {/* Close Time */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5 text-slate-400" /> Close Date & Time <span className="text-rose-500">*</span>
                </label>
                <input 
                  type="datetime-local" 
                  required
                  value={formData.closeAt}
                  onChange={(e) => setFormData({...formData, closeAt: e.target.value})}
                  className="block w-full px-3.5 py-2 border border-slate-200 hover:border-slate-300 focus:border-sage-500 rounded-lg text-sm font-mono outline-none transition-all focus:ring-1 focus:ring-sage-500"
                />
              </div>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex gap-3 text-xs text-slate-500 leading-normal">
            <AlertCircle className="h-5 w-5 text-sage-600 flex-shrink-0 mt-0.5" />
            <div>
              <strong>Scheduler Notice:</strong> Re-scheduling an active window will immediately modify access rules for enrolled students. Notifications will be dispatched to students informing them of changed timelines.
            </div>
          </div>

          {/* Form Buttons */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <button 
              type="button" 
              onClick={() => navigate('/admin/evalwindowlist')}
              className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="px-4 py-2 bg-sage-600 hover:bg-sage-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm"
            >
              <Save className="h-4 w-4" /> Save Scheduler
            </button>
          </div>
        </form>

      </div>
    </>
  );
}
