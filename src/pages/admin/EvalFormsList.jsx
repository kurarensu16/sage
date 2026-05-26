import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { Search, Plus, Edit2, Trash2, Calendar, FileText } from 'lucide-react';
import { mockDb } from '../../lib/mockDb';

export default function EvalFormsList() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  const loadTemplates = () => {
    setTemplates(mockDb.getEvalTemplates());
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const handleDeleteTemplate = (tmplId, title) => {
    // Check if form is used in any active/scheduled windows
    const windows = mockDb.getEvalWindows();
    const isUsed = windows.some(w => w.templateId === tmplId);

    if (isUsed) {
      alert(`Cannot delete "${title}" template because it is linked to one or more active or scheduled evaluation windows. Remove those windows first.`);
      return;
    }

    if (confirm(`Are you sure you want to delete the "${title}" evaluation template? This will erase all criteria fields.`)) {
      mockDb.deleteEvalTemplate(tmplId);
      loadTemplates();
    }
  };

  const formatDate = (isoString) => {
    const d = new Date(isoString);
    return d.toLocaleDateString() + ' - ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const filteredTemplates = templates.filter(t => 
    t.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <>
      <PageHeader title="Evaluation Forms" breadcrumb="Admin Portal">
        <Link 
          to="/admin/evalformbuilder" 
          className="px-4 py-2 text-sm font-medium bg-sage-600 hover:bg-sage-700 text-white rounded-lg transition-all shadow-sm flex items-center gap-2"
        >
          <Plus className="h-4 w-4" /> Create Form Template
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
              placeholder="Search evaluation forms by title..." 
            />
          </div>
        </div>

        {/* Templates Grid */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="table-container overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Template Title</th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Criteria Count</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Created By</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Created Date</th>
                  <th className="px-6 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {filteredTemplates.length > 0 ? (
                  filteredTemplates.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50/40 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-slate-400" />
                          <span className="font-bold text-slate-900 font-display text-sm">{t.title}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-mono font-medium text-slate-900">
                        {t.criteria ? t.criteria.length : 0}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                        {t.author}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-slate-500">
                        {formatDate(t.createdDate)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end gap-2">
                          <button 
                            onClick={() => navigate(`/admin/evalformbuilder?id=${t.id}`)}
                            title="Edit Template"
                            className="p-1.5 text-slate-600 hover:text-sage-600 hover:bg-slate-50 rounded-md border border-slate-100 transition-colors"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button 
                            onClick={() => handleDeleteTemplate(t.id, t.title)}
                            title="Delete Template"
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
                    <td colSpan="5" className="px-6 py-10 text-center text-slate-400 text-sm">
                      No evaluation forms found.
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
