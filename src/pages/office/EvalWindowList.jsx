import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { 
  Search, 
  Plus, 
  Calendar, 
  Edit2, 
  Trash2, 
  Clock, 
  MoreVertical, 
  X, 
  Check, 
  Eye, 
  AlertCircle, 
  Filter, 
  RotateCcw, 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight, 
  Users, 
  CheckCircle2, 
  BarChart2, 
  ShieldCheck,
  Lock
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { logActivity, resolveActorName } from '../../lib/auditLog';
import { notifyEvaluationWindowClosed } from '../../lib/notificationDispatcher';

export default function EvalWindowList() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [windows, setWindows] = useState([]);
  const [loading, setLoading] = useState(true);

  const userDepartmentId = profile?.department_id;
  const userDepartmentName = profile?.departments?.name || 'College of Computer Studies';

  // Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [statusTab, setStatusTab] = useState('all'); // all | active | scheduled | closed
  const [selectedFaculty, setSelectedFaculty] = useState('all');
  const [selectedSection, setSelectedSection] = useState('all');
  const [selectedTemplate, setSelectedTemplate] = useState('all');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Active Dropdown & Modal States
  const [activeDropdownId, setActiveDropdownId] = useState(null);
  const [confirmModalConfig, setConfirmModalConfig] = useState(null);
  const [selectedWindowAnalytics, setSelectedWindowAnalytics] = useState(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (activeDropdownId && !e.target.closest('.dropdown-trigger') && !e.target.closest('.dropdown-menu')) {
        setActiveDropdownId(null);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, [activeDropdownId]);

  const loadWindows = async () => {
    setLoading(true);
    try {
      const { data: winData, error } = await supabase
        .from('evaluation_windows')
        .select(`
          window_id,
          open_at,
          close_at,
          is_closed,
          faculty_id,
          faculty:users!evaluation_windows_faculty_id_fkey (
            user_id,
            first_name,
            last_name,
            department_id,
            departments(name)
          ),
          sections (
            section_id,
            name,
            department_id,
            departments(name)
          ),
          evaluation_forms (
            form_id,
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

      const mapped = (winData || [])
        .filter(w => {
          if (!userDepartmentId) return true;
          const secDeptId = w.sections?.department_id;
          const facDeptId = w.faculty?.department_id;
          return secDeptId === userDepartmentId || facDeptId === userDepartmentId;
        })
        .map(w => {
          const total = countsBySection[w.sections?.section_id] || 0;
          return {
            id: w.window_id,
            facultyId: w.faculty_id || w.faculty?.user_id,
            facultyName: w.faculty ? `${w.faculty.first_name} ${w.faculty.last_name}` : 'Unknown Faculty',
            sectionId: w.section_id || w.sections?.section_id,
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
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWindows();
  }, []);

  const computeWindowStatus = (win) => {
    const now = new Date();
    const start = new Date(win.openAt);
    const close = new Date(win.closeAt);
    
    if (win.isClosed || now > close) {
      return 'closed';
    } else if (now < start) {
      return 'scheduled';
    } else {
      return 'active';
    }
  };

  const getStatusBadge = (win) => {
    const status = computeWindowStatus(win);
    if (status === 'closed') {
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">Closed</span>;
    } else if (status === 'scheduled') {
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">Scheduled</span>;
    } else {
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">Active</span>;
    }
  };

  const formatDateTime = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Trigger Cancel Window with Custom SAGE Confirmation Modal
  const triggerCancelWindowConfirm = (win) => {
    setActiveDropdownId(null);
    setConfirmModalConfig({
      title: 'Cancel Evaluation Window',
      message: (
        <span>
          Are you sure you want to cancel the scheduled evaluation window for{' '}
          <strong className="text-slate-800 font-semibold">Prof. {win.facultyName}</strong> ({win.section})?
          <span className="text-rose-600 block mt-2 text-xs bg-rose-50 border border-rose-200 p-2.5 rounded-lg text-left">
            ⚠️ <strong>Warning:</strong> Deleting this window will remove student access to this survey and permanently cancel any pending response collection.
          </span>
        </span>
      ),
      confirmText: 'Cancel Window',
      confirmBg: 'bg-rose-600 hover:bg-rose-700 focus:ring-rose-500',
      icon: <Trash2 className="h-6 w-6 text-rose-600" />,
      iconBg: 'bg-rose-50',
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from('evaluation_windows')
            .delete()
            .eq('window_id', win.id);

          if (error) throw error;

          const actorName = resolveActorName(profile, user);
          await logActivity(
            'Evaluation Window Cancellation',
            `Cancelled evaluation window for Prof. ${win.facultyName} in section ${win.section}.`,
            actorName
          );

          setConfirmModalConfig(null);
          loadWindows();
        } catch (err) {
          console.error('Error canceling window:', err);
          alert('Error canceling window: ' + err.message);
        }
      }
    });
  };

  // Trigger Close Window with SAGE Confirmation Modal and Notification Dispatch
  const triggerCloseWindowConfirm = (win) => {
    setActiveDropdownId(null);
    setConfirmModalConfig({
      title: 'Close Evaluation Window',
      message: (
        <span>
          Are you sure you want to close the active evaluation window for{' '}
          <strong className="text-slate-800 font-semibold">Prof. {win.facultyName}</strong> ({win.section})?
          <span className="text-amber-800 block mt-2 text-xs bg-amber-50 border border-amber-200 p-2.5 rounded-lg text-left">
            ℹ️ <strong>Notice:</strong> Closing this window will immediately finalize student submissions and notify all enrolled students, the faculty member, and the Dean's Office.
          </span>
        </span>
      ),
      confirmText: 'Close Window Now',
      confirmBg: 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500',
      icon: <Lock className="h-6 w-6 text-amber-600" />,
      iconBg: 'bg-amber-50',
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from('evaluation_windows')
            .update({ is_closed: true, close_at: new Date().toISOString() })
            .eq('window_id', win.id);

          if (error) throw error;

          const actorName = resolveActorName(profile, user);
          await logActivity(
            'Evaluation Window Closed',
            `Officially closed evaluation window for Prof. ${win.facultyName} in section ${win.section}.`,
            actorName
          );

          await notifyEvaluationWindowClosed({
            sectionId: win.sectionId,
            facultyId: win.facultyId,
            subjectName: win.templateTitle,
            sectionName: win.section,
            facultyName: win.facultyName,
            actorId: user?.id
          });

          setConfirmModalConfig(null);
          loadWindows();
        } catch (err) {
          console.error('Error closing window:', err);
          alert('Error closing window: ' + err.message);
        }
      }
    });
  };

  // Filter Logic
  const filteredWindows = windows.filter(win => {
    const status = computeWindowStatus(win);
    
    // Status tab filter
    if (statusTab !== 'all' && status !== statusTab) return false;

    // Faculty dropdown
    if (selectedFaculty !== 'all' && win.facultyName !== selectedFaculty) return false;

    // Section dropdown
    if (selectedSection !== 'all' && win.section !== selectedSection) return false;

    // Template dropdown
    if (selectedTemplate !== 'all' && win.templateTitle !== selectedTemplate) return false;

    // Search query
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const match = 
        win.facultyName.toLowerCase().includes(q) ||
        win.section.toLowerCase().includes(q) ||
        win.templateTitle.toLowerCase().includes(q);
      if (!match) return false;
    }

    return true;
  });

  // Extract unique options for filter dropdowns
  const uniqueFacultyList = [...new Set(windows.map(w => w.facultyName).filter(Boolean))].sort();
  const uniqueSectionList = [...new Set(windows.map(w => w.section).filter(Boolean))].sort();
  const uniqueTemplateList = [...new Set(windows.map(w => w.templateTitle).filter(Boolean))].sort();

  // Active filter count
  const activeFilterCount = 
    (selectedFaculty !== 'all' ? 1 : 0) + 
    (selectedSection !== 'all' ? 1 : 0) + 
    (selectedTemplate !== 'all' ? 1 : 0) + 
    (statusTab !== 'all' ? 1 : 0) +
    (searchTerm.trim() ? 1 : 0);

  const handleClearFilters = () => {
    setSearchTerm('');
    setStatusTab('all');
    setSelectedFaculty('all');
    setSelectedSection('all');
    setSelectedTemplate('all');
    setCurrentPage(1);
  };

  // Pagination Math
  const totalPages = Math.max(1, Math.ceil(filteredWindows.length / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedWindows = filteredWindows.slice(startIndex, startIndex + itemsPerPage);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage]);

  return (
    <>
      <PageHeader title="Evaluation Windows" breadcrumb="College Office Portal">
        <Link 
          to="/office/evalwindowform" 
          className="px-4 py-2 text-sm font-medium bg-sage-600 hover:bg-sage-700 text-white rounded-lg transition-all shadow-sm flex items-center gap-2"
        >
          <Plus className="h-4 w-4" /> Create Evaluation Window
        </Link>
      </PageHeader>

      <div className="p-8 overflow-y-auto flex-1 space-y-6">
        
        {/* Toolbar: Search & Status Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative max-w-md w-full">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input 
              type="text" 
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none transition-colors" 
              placeholder="Search by faculty, section, or form template..." 
            />
          </div>

          {/* Status Tabs Segmented Control */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg p-1">
            {[
              { id: 'all', label: 'All Windows' },
              { id: 'active', label: 'Active' },
              { id: 'scheduled', label: 'Scheduled' },
              { id: 'closed', label: 'Closed' }
            ].map((tab) => (
              <button 
                key={tab.id}
                onClick={() => {
                  setStatusTab(tab.id);
                  setCurrentPage(1);
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  statusTab === tab.id 
                    ? 'bg-sage-50 text-sage-800 font-bold border border-sage-200/60 shadow-xs' 
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Filter Bar: Faculty, Section, Template Dropdowns */}
        <div className="flex flex-wrap items-center gap-3 bg-slate-50 border border-slate-200/80 p-3.5 rounded-xl text-xs">
          <div className="flex items-center gap-1.5 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
            <Filter className="h-3.5 w-3.5 text-sage-600" /> Filters:
          </div>

          {/* Faculty Dropdown */}
          <select
            value={selectedFaculty}
            onChange={(e) => {
              setSelectedFaculty(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-white border border-slate-200 hover:border-slate-300 px-3 py-1.5 rounded-lg text-slate-700 font-medium focus:ring-1 focus:ring-sage-500 outline-none cursor-pointer"
          >
            <option value="all">All Faculty ({uniqueFacultyList.length})</option>
            {uniqueFacultyList.map(name => (
              <option key={name} value={name}>Prof. {name}</option>
            ))}
          </select>

          {/* Section Dropdown */}
          <select
            value={selectedSection}
            onChange={(e) => {
              setSelectedSection(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-white border border-slate-200 hover:border-slate-300 px-3 py-1.5 rounded-lg text-slate-700 font-medium focus:ring-1 focus:ring-sage-500 outline-none cursor-pointer"
          >
            <option value="all">All Sections ({uniqueSectionList.length})</option>
            {uniqueSectionList.map(sec => (
              <option key={sec} value={sec}>{sec}</option>
            ))}
          </select>

          {/* Template Dropdown */}
          <select
            value={selectedTemplate}
            onChange={(e) => {
              setSelectedTemplate(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-white border border-slate-200 hover:border-slate-300 px-3 py-1.5 rounded-lg text-slate-700 font-medium focus:ring-1 focus:ring-sage-500 outline-none cursor-pointer max-w-xs truncate"
          >
            <option value="all">All Form Templates ({uniqueTemplateList.length})</option>
            {uniqueTemplateList.map(tpl => (
              <option key={tpl} value={tpl}>{tpl}</option>
            ))}
          </select>

          {/* Clear Filters Button */}
          {activeFilterCount > 0 && (
            <button
              onClick={handleClearFilters}
              className="ml-auto flex items-center gap-1 text-slate-500 hover:text-rose-600 font-semibold transition-colors px-2 py-1 rounded-md hover:bg-rose-50"
            >
              <RotateCcw className="h-3 w-3" /> Clear Filters ({activeFilterCount})
            </button>
          )}
        </div>

        {/* Windows Feed (Mobile Cards + Desktop Table) */}
        
        {/* Mobile View Card Feed */}
        <div className="md:hidden space-y-3">
          {paginatedWindows.length > 0 ? (
            paginatedWindows.map((win) => {
              const pct = win.totalStudents > 0 ? Math.round((win.responsesCount / win.totalStudents) * 100) : 0;
              return (
                <div key={win.id} className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs space-y-3 text-left">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 font-display text-sm truncate">Prof. {win.facultyName}</span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 font-mono">
                          {win.section}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5 truncate">{win.templateTitle}</p>
                    </div>
                    {getStatusBadge(win)}
                  </div>

                  {/* Survey Participation Meter */}
                  <div className="space-y-1.5 pt-2 border-t border-slate-100">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400 font-medium">Participation Rate</span>
                      <span className="font-mono font-bold text-slate-800">{win.responsesCount} / {win.totalStudents} ({pct}%)</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div 
                        className="bg-sage-600 h-full rounded-full transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                    <div className="text-[10px] text-slate-400 font-mono">
                      Closes: {formatDateTime(win.closeAt)}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setSelectedWindowAnalytics(win)}
                        className="px-2.5 py-1 text-xs font-semibold bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg border border-blue-200 flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="h-3 w-3" /> Analytics
                      </button>
                      <button
                        onClick={() => navigate(`/office/evalwindowform?id=${win.id}`)}
                        className="px-2.5 py-1 text-xs font-semibold bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg border border-slate-200 flex items-center gap-1 cursor-pointer"
                      >
                        <Edit2 className="h-3 w-3" /> Edit
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-8 text-center bg-white border border-slate-200 rounded-2xl text-slate-400 text-xs">
              No evaluation windows found matching your filters.
            </div>
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
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
                {paginatedWindows.length > 0 ? (
                  paginatedWindows.map((win) => (
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
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium relative">
                        <div className="inline-block text-left">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveDropdownId(activeDropdownId === win.id ? null : win.id);
                            }}
                            className="dropdown-trigger p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
                            aria-label="Actions"
                          >
                            <MoreVertical className="h-5 w-5" />
                          </button>

                          {activeDropdownId === win.id && (
                            <div className="dropdown-menu absolute right-6 mt-1 w-56 rounded-lg bg-white border border-slate-200 shadow-lg py-1 z-40 text-left">
                              <button
                                onClick={() => {
                                  setActiveDropdownId(null);
                                  navigate(`/office/evalwindowform?id=${win.id}`);
                                }}
                                className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                              >
                                <Edit2 className="h-3.5 w-3.5 text-sage-600" />
                                Edit Window Schedule
                              </button>

                              <button
                                onClick={() => {
                                  setActiveDropdownId(null);
                                  setSelectedWindowAnalytics(win);
                                }}
                                className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                              >
                                <Eye className="h-3.5 w-3.5 text-blue-500" />
                                View Submissions / Analytics
                              </button>

                              {computeWindowStatus(win) !== 'closed' && (
                                <button
                                  onClick={() => triggerCloseWindowConfirm(win)}
                                  className="w-full text-left px-4 py-2 text-xs font-medium text-amber-700 hover:bg-amber-50/50 flex items-center gap-2"
                                >
                                  <Lock className="h-3.5 w-3.5 text-amber-600" />
                                  Close Window Now
                                </button>
                              )}

                              <div className="border-t border-slate-100 my-1"></div>

                              <button
                                onClick={() => triggerCancelWindowConfirm(win)}
                                className="w-full text-left px-4 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50/50 flex items-center gap-2"
                              >
                                <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                                Cancel Window
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="8" className="px-6 py-10 text-center text-slate-400 text-sm">
                      No evaluation windows found matching your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          {filteredWindows.length > 0 && (
            <div className="px-6 py-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs font-medium text-slate-500">
              <div>
                Showing <span className="font-semibold text-slate-800">{startIndex + 1}</span> to{' '}
                <span className="font-semibold text-slate-800">
                  {Math.min(startIndex + itemsPerPage, filteredWindows.length)}
                </span>{' '}
                of <span className="font-semibold text-slate-800">{filteredWindows.length}</span> evaluation windows
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 transition-colors"
                  title="First Page"
                >
                  <ChevronsLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 transition-colors"
                  title="Previous Page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                {/* Page Number Buttons */}
                <div className="flex items-center gap-1 px-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(page => {
                      if (totalPages <= 5) return true;
                      if (page === 1 || page === totalPages) return true;
                      return Math.abs(page - currentPage) <= 1;
                    })
                    .map((page, idx, array) => {
                      const prev = array[idx - 1];
                      const showEllipsis = prev && page - prev > 1;

                      return (
                        <React.Fragment key={page}>
                          {showEllipsis && <span className="px-1 text-slate-400">...</span>}
                          <button
                            onClick={() => setCurrentPage(page)}
                            className={`min-w-[28px] h-7 rounded-lg text-xs font-semibold transition-colors ${
                              currentPage === page
                                ? 'bg-sage-600 text-white shadow-xs'
                                : 'text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            {page}
                          </button>
                        </React.Fragment>
                      );
                    })}
                </div>

                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 transition-colors"
                  title="Next Page"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 transition-colors"
                  title="Last Page"
                >
                  <ChevronsRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Submissions / Analytics Modal */}
      {selectedWindowAnalytics && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden animate-in slide-in-from-bottom-6 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200">
            <div className="sm:hidden w-12 h-1.5 bg-slate-200 rounded-full mx-auto mt-3 mb-1" />
            
            {/* Header */}
            <div className="px-5 sm:px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <BarChart2 className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold font-display text-slate-900">Window Analytics & Submissions</h3>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">{selectedWindowAnalytics.section}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedWindowAnalytics(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5 text-xs">
              
              {/* Instructor & Template Card */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 space-y-2.5">
                <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                  <span className="text-slate-500 font-medium">Assigned Faculty:</span>
                  <span className="font-semibold text-slate-800">Prof. {selectedWindowAnalytics.facultyName}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                  <span className="text-slate-500 font-medium">Class Section:</span>
                  <span className="font-semibold text-slate-800 font-mono">{selectedWindowAnalytics.section}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                  <span className="text-slate-500 font-medium">Form Template:</span>
                  <span className="font-semibold text-slate-800">{selectedWindowAnalytics.templateTitle}</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-slate-500 font-medium">Current Status:</span>
                  <span>{getStatusBadge(selectedWindowAnalytics)}</span>
                </div>
              </div>

              {/* Response Rate Progress Card */}
              <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700 uppercase tracking-wide text-[11px]">Survey Participation Rate</span>
                  <span className="font-mono font-bold text-sm text-slate-900">
                    {selectedWindowAnalytics.totalStudents > 0 
                      ? Math.round((selectedWindowAnalytics.responsesCount / selectedWindowAnalytics.totalStudents) * 100)
                      : 0}%
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                  <div 
                    className="bg-sage-600 h-full rounded-full transition-all duration-500"
                    style={{ 
                      width: `${selectedWindowAnalytics.totalStudents > 0 
                        ? Math.min(100, Math.round((selectedWindowAnalytics.responsesCount / selectedWindowAnalytics.totalStudents) * 100))
                        : 0}%` 
                    }}
                  />
                </div>

                <div className="flex justify-between text-slate-500 font-medium text-[11px]">
                  <span>{selectedWindowAnalytics.responsesCount} Submitted</span>
                  <span>{selectedWindowAnalytics.totalStudents - selectedWindowAnalytics.responsesCount} Pending</span>
                  <span>{selectedWindowAnalytics.totalStudents} Total Cohort</span>
                </div>
              </div>

              {/* Schedule Timing Card */}
              <div className="grid grid-cols-2 gap-3 bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 text-[11px]">
                <div>
                  <span className="text-slate-400 block font-medium">Open Date & Time:</span>
                  <span className="font-mono text-slate-700 font-semibold block mt-0.5">
                    {formatDateTime(selectedWindowAnalytics.openAt)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Close Date & Time:</span>
                  <span className="font-mono text-slate-700 font-semibold block mt-0.5">
                    {formatDateTime(selectedWindowAnalytics.closeAt)}
                  </span>
                </div>
              </div>

              {/* Fairness / Anonymity Clause Notice */}
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex items-start gap-2.5 text-blue-800 text-[11px]">
                <ShieldCheck className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  <strong>Anonymity Clause Protected:</strong> Individual student identity is cryptographic-hashed per institutional policy. Responses are aggregated to protect student confidentiality.
                </p>
              </div>

            </div>

            {/* Footer */}
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <button
                onClick={() => {
                  const id = selectedWindowAnalytics.id;
                  setSelectedWindowAnalytics(null);
                  navigate(`/office/evalwindowform?id=${id}`);
                }}
                className="text-xs font-semibold text-sage-700 hover:text-sage-900 transition-colors flex items-center gap-1.5"
              >
                <Edit2 className="h-3.5 w-3.5" /> Edit Schedule
              </button>

              <button
                onClick={() => setSelectedWindowAnalytics(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors shadow-xs"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Dynamic Action Confirmation Modal */}
      {confirmModalConfig && (
        <div className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-5 text-center animate-in zoom-in-95 duration-200 max-w-sm w-full">
            <div className={`mx-auto w-14 h-14 rounded-full ${confirmModalConfig.iconBg} flex items-center justify-center shadow-xs animate-pulse duration-[2000ms]`}>
              {confirmModalConfig.icon}
            </div>
            <div className="space-y-1.5 text-center">
              <h3 className="text-base font-bold text-slate-900 font-display">{confirmModalConfig.title}</h3>
              <div className="text-xs text-slate-500 leading-relaxed font-sans font-medium">
                {confirmModalConfig.message}
              </div>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModalConfig(null)}
                className="flex-1 px-4 py-2.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-all duration-150 outline-none cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmModalConfig.onConfirm}
                className={`flex-1 px-4 py-2.5 text-xs font-semibold text-white ${confirmModalConfig.confirmBg} rounded-xl shadow-xs transition-all duration-150 transform hover:scale-[1.02] active:scale-[0.98] outline-none cursor-pointer`}
              >
                {confirmModalConfig.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
