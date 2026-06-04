import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { Search, Plus, Calendar, Edit2, Trash2, Clock, Trash } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export default function EvalWindowList() {
  const navigate = useNavigate();
  const [windows, setWindows] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  const loadWindows = async () => {
    try {
      const { data: winData, error } = await supabase
        .from('evaluation_windows')
        .select(`
          window_id,
          open_at,
          close_at,
          is_closed,
          faculty:users!evaluation_windows_faculty_id_fkey (
            first_name,
            last_name
          ),
          sections (
            section_id,
            name
          ),
          evaluation_forms (
            title
          ),
          evaluation_responses (
            response_id
          )
        `)
        .order('open_at', { ascending: false });

      if (error) throw error;

      const { data: enrollments, error: enrolErr } = await supabase
        .from('enrollments')
        .select('section_id, student_id');

      if (enrolErr) throw enrolErr;

      const uniqueStudentsBySection = {};
      enrollments?.forEach(e => {
        if (!uniqueStudentsBySection[e.section_id]) {
          uniqueStudentsBySection[e.section_id] = new Set();
        }
        uniqueStudentsBySection[e.section_id].add(e.student_id);
      });

      const countsBySection = {};
      Object.keys(uniqueStudentsBySection).forEach(secId => {
        countsBySection[secId] = uniqueStudentsBySection[secId].size;
      });

      const mapped = (winData || []).map(w => {
        const total = countsBySection[w.sections?.section_id] || 0;
        return {
          id: w.window_id,
          facultyName: w.faculty ? `${w.faculty.first_name} ${w.faculty.last_name}` : 'Unknown Faculty',
          section: w.sections?.name || 'Unknown Section',
          templateTitle: w.evaluation_forms?.title || 'Unknown Template',
          openAt: w.open_at,
          closeAt: w.close_at,
          isClosed: w.is_closed,
          responsesCount: w.evaluation_responses ? w.evaluation_responses.length : 0,
          totalStudents: total
        };
      });

      setWindows(mapped);
    } catch (err) {
      console.error('Failed to load evaluation windows:', err);
    }
  };

  useEffect(() => {
    loadWindows();
  }, []);

  const handleCancelWindow = async (winId) => {
    if (confirm('Are you sure you want to cancel this scheduled evaluation window? This will delete the scheduler entry.')) {
      try {
        const { error } = await supabase
          .from('evaluation_windows')
          .delete()
          .eq('window_id', winId);

        if (error) throw error;
        loadWindows();
      } catch (err) {
        console.error('Error canceling window:', err);
        alert('Error canceling window: ' + err.message);
      }
    }
  };

  const getStatusBadge = (win) => {
    const now = new Date();
    const start = new Date(win.openAt);
    const close = new Date(win.closeAt);
    
    if (win.isClosed || now > close) {
      return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">Closed</span>;
    } else if (now < start) {
      return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">Scheduled</span>;
    } else {
      return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">Active</span>;
    }
  };

  const formatDateTime = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const filteredWindows = windows.filter(win => 
    win.facultyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    win.section.toLowerCase().includes(searchTerm.toLowerCase()) ||
    win.templateTitle.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <>
      <PageHeader title="Evaluation Windows" breadcrumb="Admin Portal">
        <Link 
          to="/admin/evalwindowform" 
          className="px-4 py-2 text-sm font-medium bg-sage-600 hover:bg-sage-700 text-white rounded-lg transition-all shadow-sm flex items-center gap-2"
        >
          <Plus className="h-4 w-4" /> Create Evaluation Window
        </Link>
      </PageHeader>

      <div className="p-8 overflow-y-auto flex-1 space-y-6">
        
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-4">
          <div className="relative max-w-md w-full">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input 
              type="text" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none transition-colors" 
              placeholder="Search by faculty, section, or form template..." 
            />
          </div>
        </div>

        {/* Windows Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="table-container overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Assigned Faculty</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Section</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Form Template</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Start Date & Time</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Close Date & Time</th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Response Rate</th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {filteredWindows.length > 0 ? (
                  filteredWindows.map((win) => (
                    <tr key={win.id} className="hover:bg-slate-50/40 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900 flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-sage-50 border border-sage-200 text-sage-700 font-bold text-[10px] flex items-center justify-center font-mono">
                          {win.facultyName.split(' ').map(n => n[0]).join('')}
                        </div>
                        <span>Prof. {win.facultyName}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                          {win.section}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">
                        {win.templateTitle}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-slate-500">
                        {formatDateTime(win.openAt)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-slate-500">
                        {formatDateTime(win.closeAt)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-mono font-medium text-slate-950">
                        {win.responsesCount} / {win.totalStudents}
                        <span className="text-[10px] text-slate-400 font-normal ml-1">
                          ({win.totalStudents > 0 ? Math.round((win.responsesCount / win.totalStudents) * 100) : 0}%)
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {getStatusBadge(win)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end gap-2">
                          <button 
                            onClick={() => navigate(`/admin/evalwindowform?id=${win.id}`)}
                            title="Edit Evaluation Dates"
                            className="p-1.5 text-slate-600 hover:text-sage-600 hover:bg-slate-50 rounded-md border border-slate-100 transition-colors"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button 
                            onClick={() => handleCancelWindow(win.id)}
                            title="Cancel Window"
                            className="p-1.5 text-rose-600 hover:bg-rose-50 border border-rose-100 rounded-md transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="8" className="px-6 py-10 text-center text-slate-400 text-sm">
                      No evaluation windows scheduled.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </>
  );
}
