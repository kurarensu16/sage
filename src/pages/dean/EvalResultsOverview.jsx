import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { Search, Star, ArrowRight, Award, GraduationCap, Filter } from 'lucide-react';
import { mockDb } from '../../lib/mockDb';
import { DYCI_ACADEMIC_PROGRAMS } from '../../lib/constants';

export default function EvalResultsOverview() {
  const navigate = useNavigate();
  
  const [facultyList, setFacultyList] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [deptFilter, setDeptFilter] = useState('');

  useEffect(() => {
    const users = mockDb.getUsers().filter(u => u.role === 'faculty');
    const classrooms = mockDb.getClassrooms();
    
    // Enrich faculty data with classes taught and simulated ratings
    const enriched = users.map(f => {
      const classes = classrooms.filter(c => c.facultyId === f.id && c.status === 'active');
      const subjectCodes = classes.map(c => `${c.subjectCode}-${c.section}`);
      
      // Seed rating: Amanda has 4.75, John has 4.18, others default to 4.50
      let rating = 4.50;
      if (f.id === 'usr-003') rating = 4.75;
      if (f.id === 'usr-004') rating = 4.18;

      return {
        ...f,
        subjectCodes,
        sectionsCount: classes.length,
        rating
      };
    });

    setFacultyList(enriched);
  }, []);

  const filteredFaculty = facultyList.filter(f => {
    const matchesSearch = 
      `${f.firstName} ${f.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      f.email.toLowerCase().includes(searchTerm.toLowerCase());
      
    // Normalise department comparison for legacy data
    let fDept = f.department;
    if (fDept === 'College of IT' || fDept === 'College of CS') {
      fDept = 'College of Computer Studies';
    }
    
    let filterDept = deptFilter;
    if (filterDept === 'College of IT' || filterDept === 'College of CS') {
      filterDept = 'College of Computer Studies';
    }
    
    const matchesDept = !filterDept || fDept === filterDept;

    return matchesSearch && matchesDept;
  });

  return (
    <>
      <PageHeader title="Faculty Evaluation Overview" breadcrumb="Dean Portal" />
      
      <div className="p-8 overflow-y-auto flex-1 space-y-6">
        
        {/* Filters and search */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-sage-600" /> Filter Options
          </h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            
            {/* Search */}
            <div className="sm:col-span-2 relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-slate-400" />
              </div>
              <input 
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search faculty name or email..."
                className="block w-full pl-9 pr-3 py-2 border border-slate-200 focus:border-sage-500 rounded-lg text-xs outline-none bg-slate-50/20 focus:bg-white transition-colors"
              />
            </div>

            {/* Department */}
            <div className="flex flex-col gap-1">
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="block w-full border border-slate-200 px-3 py-2 rounded-lg text-xs bg-white outline-none cursor-pointer"
              >
                <option value="">All Colleges</option>
                {Object.keys(DYCI_ACADEMIC_PROGRAMS).map(college => (
                  <option key={college} value={college}>{college}</option>
                ))}
              </select>
            </div>

          </div>
        </div>

        {/* Directory Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredFaculty.length > 0 ? (
            filteredFaculty.map((f) => (
              <div 
                key={f.id} 
                className="bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition-all p-6 flex flex-col justify-between space-y-5"
              >
                {/* Header info */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-sage-50 border border-sage-200 text-sage-700 font-bold text-xs flex items-center justify-center font-mono">
                      {f.firstName[0]}{f.lastName[0]}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 font-display text-sm">
                        Prof. {f.firstName} {f.lastName}
                      </h4>
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5">{f.email}</p>
                    </div>
                  </div>
                  
                  {/* Rating badge */}
                  <div className="flex items-center gap-1 bg-amber-50 border border-amber-100 text-amber-700 px-2 py-1 rounded-lg text-xs font-mono font-bold">
                    <Star className="h-3.5 w-3.5 fill-current" /> {f.rating.toFixed(2)}
                  </div>
                </div>

                {/* Substats */}
                <div className="space-y-2 border-t border-b border-slate-100 py-3 text-xs leading-normal">
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">Department:</span>
                    <span className="font-bold text-slate-800">{f.department === 'College of IT' || f.department === 'College of CS' ? 'College of Computer Studies' : f.department}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">Active Sections:</span>
                    <span className="font-bold text-slate-800">{f.sectionsCount} classes</span>
                  </div>
                  
                  {/* Sections list */}
                  {f.subjectCodes.length > 0 && (
                    <div className="pt-1 flex flex-wrap gap-1">
                      {f.subjectCodes.map(code => (
                        <span 
                          key={code} 
                          className="px-1.5 py-0.5 bg-slate-100 text-[10px] font-mono font-medium rounded text-slate-600 border border-slate-200"
                        >
                          {code}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Drilldown button */}
                <button
                  onClick={() => navigate(`/dean/evalresultsfaculty?id=${f.id}`)}
                  className="w-full py-2.5 bg-slate-50 hover:bg-sage-600 text-slate-700 hover:text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer border border-slate-200/50 hover:border-transparent"
                >
                  Inspect Ratings Dashboard <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          ) : (
            <div className="col-span-full bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400 text-sm">
              No faculty evaluation overview cards found.
            </div>
          )}
        </div>

      </div>
    </>
  );
}
