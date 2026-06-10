import { useState, useEffect } from 'react';
import { FileSpreadsheet, FileText, X, Check } from 'lucide-react';

export default function ExportPreviewModal({
  isOpen,
  onClose,
  classInfo,
  students, // compiled with grades/absences
  maxItems,
  metadata,
  onMetadataChange,
  onExportExcel,
  onExportPdf
}) {
  const [selectedTab, setSelectedTab] = useState('profile'); // 'profile', 'record', 'report'

  if (!isOpen || !classInfo) return null;

  const subjectCode = classInfo.subjects?.code || '';
  const subjectName = classInfo.subjects?.name || '';
  const sectionName = classInfo.sections?.name || '';

  // Helpers to calculate student values
  const getTransmutedGwa = (score) => {
    if (score >= 98) return 1.00;
    if (score >= 95) return 1.25;
    if (score >= 92) return 1.50;
    if (score >= 89) return 1.75;
    if (score >= 86) return 2.00;
    if (score >= 83) return 2.25;
    if (score >= 80) return 2.50;
    if (score >= 77) return 2.75;
    if (score >= 75) return 3.00;
    return 5.00;
  };

  const getComputedStudentRow = (student) => {
    const getTermRating = (termName) => {
      const termScores = student.periods?.[termName] || {};
      const maxT = maxItems[termName] || { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, char: 100, exam: 40 };

      const csSum =
        (termScores.act1 || 0) +
        (termScores.act2 || 0) +
        (termScores.act3 || 0) +
        (termScores.act4 || 0) +
        (termScores.act5 || 0) +
        (termScores.act6 || 0);

      const csMax = maxT.act1 + maxT.act2 + maxT.act3 + maxT.act4 + maxT.act5 + maxT.act6;
      const csPercent = csMax > 0 ? (csSum / csMax) * 50 : 0;
      const charPercent = (termScores.char || 0) * 0.1;
      const examPercent = maxT.exam > 0 ? ((termScores.exam || 0) / maxT.exam) * 40 : 0;

      return Math.min(100, Math.max(0, Math.round(csPercent + charPercent + examPercent)));
    };

    const prelim = getTermRating('Prelim');
    const midterm = getTermRating('Midterm');
    const semiFinal = getTermRating('Semi-Final');
    const finalTerm = getTermRating('Final');

    const mr = Math.round((prelim + midterm) / 2);
    const tfr = Math.round((semiFinal + finalTerm) / 2);
    const sg = Math.round((mr + tfr) / 2);

    const rawGwa = getTransmutedGwa(sg);
    const remarkLower = student.customRemarks?.toLowerCase() || '';

    let gwa = rawGwa;
    let remarks = rawGwa <= 3.00 ? 'Passed' : 'Failed';

    if (student.absences >= 4) {
      gwa = 5.00;
      remarks = 'FDA';
    } else if (remarkLower === 'inc' || remarkLower === 'incomplete') {
      gwa = 'Inc.';
      remarks = 'Inc';
    } else if (remarkLower === 'dropped' || remarkLower === 'drp') {
      gwa = 'Drp.';
      remarks = 'Drp';
    } else if (remarkLower === 'passed') {
      gwa = Math.min(3.00, rawGwa);
      remarks = 'Passed';
    } else if (remarkLower === 'failed') {
      gwa = 5.00;
      remarks = 'Failed';
    }

    return {
      studentNo: student.studentNo || '',
      name: student.name || '',
      prelim,
      midterm,
      mr,
      semiFinal,
      finalTerm,
      tfr,
      sg,
      gwa: typeof gwa === 'number' ? gwa.toFixed(2) : gwa,
      remarks
    };
  };

  const computedStudents = students.map(getComputedStudentRow);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-6xl h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-1.5 font-sans">
              <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
              <span>Grade Sheets Preview & Export Panel</span>
            </h3>
            <p className="text-xs text-slate-500 font-sans mt-0.5">
              Review formatting and signing authorities before generating official Excel or PDF documents.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-650 rounded-lg transition-all"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body Container */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          
          {/* Left Panel - Inputs & Tab Config */}
          <div className="w-80 border-r border-slate-200 bg-slate-50/50 p-6 flex flex-col justify-between overflow-y-auto">
            <div className="space-y-6">
              {/* Worksheet Tab Selection */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-sans">Select Worksheet</label>
                <div className="flex flex-col gap-1.5">
                  {[
                    { id: 'profile', label: 'Subject Profile' },
                    { id: 'record', label: 'Record Sheet' },
                    { id: 'report', label: 'Report of Grades' }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setSelectedTab(tab.id)}
                      className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-left text-xs font-semibold font-sans border transition-all ${
                        selectedTab === tab.id
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700 shadow-sm'
                          : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <FileSpreadsheet className={`h-4 w-4 ${selectedTab === tab.id ? 'text-emerald-600' : 'text-slate-400'}`} />
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Metadata Inputs */}
              <div className="space-y-3 pt-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-sans">Institutional Metadata</label>
                <div className="space-y-2.5">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 font-sans uppercase">Student Record Examiner</label>
                    <input
                      type="text"
                      value={metadata.examiner}
                      onChange={(e) => onMetadataChange({ examiner: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold bg-white text-slate-800 outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 font-sans uppercase">Registrar</label>
                    <input
                      type="text"
                      value={metadata.registrar}
                      onChange={(e) => onMetadataChange({ registrar: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold bg-white text-slate-800 outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 font-sans uppercase">Faculty Name</label>
                    <input
                      type="text"
                      value={metadata.facultyName}
                      onChange={(e) => onMetadataChange({ facultyName: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold bg-white text-slate-800 outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 font-sans uppercase">Dean</label>
                    <input
                      type="text"
                      value={metadata.dean}
                      onChange={(e) => onMetadataChange({ dean: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold bg-white text-slate-800 outline-none focus:border-emerald-500"
                    />
                  </div>
                  {/* Day dropdown */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 font-sans uppercase">Day</label>
                    <select
                      value={metadata.day}
                      onChange={(e) => onMetadataChange({ day: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold bg-white text-slate-800 outline-none focus:border-emerald-500 cursor-pointer"
                    >
                      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>

                  {/* Time range dropdowns */}
                  <div className="space-y-1 col-span-2">
                    <label className="text-[10px] font-bold text-slate-500 font-sans uppercase">Time</label>
                    <div className="flex items-center gap-2">
                      {(() => {
                        const slots = [];
                        for (let h = 7; h <= 20; h++) {
                          ['00', '30'].forEach(m => {
                            if (h === 20 && m === '30') return;
                            const suffix = h < 12 ? 'AM' : 'PM';
                            const display12 = h > 12 ? h - 12 : h;
                            slots.push({ label: `${display12}:${m} ${suffix}`, value: `${String(h).padStart(2,'0')}:${m}` });
                          });
                        }
                        const [fromVal, toVal] = (metadata.time || '07:00 - 10:00').split(' - ');
                        const fmt = (val) => {
                          if (!val) return '';
                          const [hh, mm] = val.trim().split(':');
                          const h = parseInt(hh);
                          const suffix = h < 12 ? 'AM' : 'PM';
                          const h12 = h > 12 ? h - 12 : h;
                          return `${h12}:${mm} ${suffix}`;
                        };
                        return (
                          <>
                            <select
                              value={fromVal?.trim() || '07:00'}
                              onChange={(e) => onMetadataChange({ time: `${e.target.value} - ${toVal?.trim() || '10:00'}` })}
                              className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-semibold bg-white text-slate-800 outline-none focus:border-emerald-500 cursor-pointer"
                            >
                              {slots.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                            <span className="text-xs text-slate-400 font-bold shrink-0">to</span>
                            <select
                              value={toVal?.trim() || '10:00'}
                              onChange={(e) => onMetadataChange({ time: `${fromVal?.trim() || '07:00'} - ${e.target.value}` })}
                              className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-semibold bg-white text-slate-800 outline-none focus:border-emerald-500 cursor-pointer"
                            >
                              {slots.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions Panel */}
            <div className="border-t border-slate-200 pt-4 mt-6 space-y-2">
              <button
                type="button"
                onClick={() => onExportExcel(selectedTab)}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-sm font-sans"
              >
                <FileSpreadsheet className="h-4 w-4" /> Export Grades
              </button>
              <button
                type="button"
                onClick={() => onExportPdf(selectedTab)}
                className="w-full py-2.5 rounded-xl border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 font-sans"
              >
                <FileText className="h-4 w-4 text-rose-500" /> Export PDF
              </button>
              <button
                type="button"
                onClick={() => onExportExcel('all')}
                className="w-full py-2 rounded-xl text-[10px] font-bold text-slate-500 hover:text-slate-850 hover:bg-slate-100 transition-colors border border-slate-150 border-dashed"
              >
                Download Complete Workbook (All Sheets)
              </button>
            </div>
          </div>

          {/* Right Panel - Sheet Live Preview */}
          <div className="flex-1 bg-slate-100 overflow-auto p-6 relative">
            <div className="bg-white border border-slate-200 rounded-xl shadow-md min-w-[750px] p-8 min-h-full flex flex-col justify-between font-sans text-slate-900 text-[11px] leading-normal select-none">
              
              {/* Tab Renders */}
              {selectedTab === 'profile' && (
                <div className="space-y-6">
                  {/* Header Block */}
                  <div className="text-center space-y-1.5">
                    <h1 className="text-lg font-bold uppercase tracking-wide">SAGE System</h1>
                    <h2 className="text-sm font-semibold text-slate-500">College Department</h2>
                    <p className="text-[10px] text-slate-400">McArthur Highway, Wakas, Bocaue, Bulacan 3018</p>
                    <p className="text-[10px] text-slate-400">(044) 123-4567 - www.SAGE-System.com.ph</p>
                  </div>

                  <hr className="border-slate-200" />

                  <div className="text-center py-2">
                    <h3 className="text-base font-extrabold tracking-widest text-slate-850">SUBJECT PROFILE</h3>
                    <p className="text-[10px] text-slate-500 italic mt-0.5">(Input data in UPPER CASE format)</p>
                  </div>

                  {/* Metadata Grid */}
                  <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-xs font-semibold">
                    <div className="space-y-2 border border-slate-150 rounded-lg p-4 bg-slate-50/50">
                      <div className="flex justify-between border-b border-slate-200 pb-1.5">
                        <span className="text-slate-400">College:</span>
                        <span>{metadata.college || 'College of Computer Studies'}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-200 pb-1.5">
                        <span className="text-slate-400">Subject Code:</span>
                        <span>{subjectCode}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-200 pb-1.5">
                        <span className="text-slate-400">Subject Description:</span>
                        <span>{subjectName}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-200 pb-1.5">
                        <span className="text-slate-400">Semester:</span>
                        <span>{classInfo.semester === '1st' ? '1st Sem' : classInfo.semester === '2nd' ? '2nd Sem' : 'Summer'}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-200 pb-1.5">
                        <span className="text-slate-400">Academic Year:</span>
                        <span>{classInfo.school_year || ''}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Course / Section:</span>
                        <span>{metadata.course || 'BSIT'} - {sectionName}</span>
                      </div>
                    </div>

                    <div className="space-y-2 border border-slate-150 rounded-lg p-4 bg-slate-50/50">
                      <div className="flex justify-between border-b border-slate-200 pb-1.5">
                        <span className="text-slate-400">No. of Units:</span>
                        <span>{classInfo.subjects?.units || 3}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-200 pb-1.5">
                        <span className="text-slate-400">Day Schedule:</span>
                        <span>{metadata.day}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-200 pb-1.5">
                        <span className="text-slate-400">Time / Hour:</span>
                        <span>{metadata.time}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-200 pb-1.5">
                        <span className="text-slate-400">Record Examiner:</span>
                        <span>{metadata.examiner}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-200 pb-1.5">
                        <span className="text-slate-400">Registrar:</span>
                        <span>{metadata.registrar}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Dean:</span>
                        <span>{metadata.dean}</span>
                      </div>
                    </div>
                  </div>

                  {/* Student List preview */}
                  <div className="space-y-3 pdf-roster-break">
                    <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Student Roster Summary</h4>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', tableLayout: 'fixed' }}>
                      <colgroup>
                        <col style={{ width: '6%' }} />
                        <col style={{ width: '44%' }} />
                        <col style={{ width: '6%' }} />
                        <col style={{ width: '44%' }} />
                      </colgroup>
                      <thead>
                        <tr style={{ background: '#f1f5f9' }}>
                          <th style={{ padding: '5px 6px', textAlign: 'center', color: '#64748b', fontWeight: 600, borderBottom: '1px solid #cbd5e1', fontSize: '11px' }}>#</th>
                          <th style={{ padding: '5px 6px', textAlign: 'left', color: '#64748b', fontWeight: 600, borderBottom: '1px solid #cbd5e1', borderRight: '1px solid #cbd5e1', fontSize: '11px' }}>Student Name</th>
                          <th style={{ padding: '5px 6px', textAlign: 'center', color: '#64748b', fontWeight: 600, borderBottom: '1px solid #cbd5e1', fontSize: '11px' }}>#</th>
                          <th style={{ padding: '5px 6px', textAlign: 'left', color: '#64748b', fontWeight: 600, borderBottom: '1px solid #cbd5e1', fontSize: '11px' }}>Student Name</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: 30 }).map((_, i) => {
                          const leftName = computedStudents[i]?.name || '';
                          const rightName = computedStudents[i + 30]?.name || '';
                          const rowBg = i % 2 === 1 ? '#f8fafc' : '#ffffff';
                          return (
                            <tr key={i} style={{ background: rowBg }}>
                              <td style={{ padding: '4px 6px', textAlign: 'center', color: '#94a3b8', fontSize: '11px', lineHeight: '1.4' }}>{i + 1}</td>
                              <td style={{ padding: '4px 6px', color: leftName ? '#1e293b' : '#cbd5e1', fontWeight: leftName ? 600 : 400, fontSize: '11px', lineHeight: '1.4', borderRight: '1px solid #e2e8f0' }}>
                                {leftName || '—'}
                              </td>
                              <td style={{ padding: '4px 6px', textAlign: 'center', color: '#94a3b8', fontSize: '11px', lineHeight: '1.4' }}>{i + 31}</td>
                              <td style={{ padding: '4px 6px', color: rightName ? '#1e293b' : '#cbd5e1', fontWeight: rightName ? 600 : 400, fontSize: '11px', lineHeight: '1.4' }}>
                                {rightName || '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {selectedTab === 'record' && (
                <div className="space-y-4">
                  {/* Record Sheet Headers */}
                  <div className="flex justify-between items-end">
                    <h1 className="text-xs font-bold uppercase tracking-wider">RECORD SHEET FOR GENERAL EDUCATION SUBJECTS (SAGE-System)</h1>
                    <span className="text-[10px] text-slate-400">Class: {subjectCode} · {sectionName}</span>
                  </div>

                  <div className="grid grid-cols-3 gap-4 border border-slate-150 rounded-lg p-3 bg-slate-50/50 font-semibold text-[10px]">
                    <div>College: {metadata.college || 'College of Computer Studies'}</div>
                    <div>Course & Section: {metadata.course || 'BSIT'} - {sectionName}</div>
                    <div>Academic Year: {classInfo.school_year || ''}</div>
                    <div>Subject: {subjectName}</div>
                    <div>Semester: {classInfo.semester === '1st' ? '1st Sem' : classInfo.semester === '2nd' ? '2nd Sem' : 'Summer'}</div>
                    <div>Units: {classInfo.subjects?.units || 3}</div>
                  </div>

                  {/* HTML preview of the massive grid */}
                  <div className="overflow-x-auto border border-slate-200 rounded-lg">
                    <table className="w-full border-collapse text-center text-[9px] font-sans">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                          <th className="px-1.5 py-1.5 border-r border-slate-200 w-6">No.</th>
                          <th className="px-2 py-1.5 border-r border-slate-200 text-left w-36">Student Name</th>
                          <th className="px-1 py-1.5 border-r border-slate-200 bg-sky-50 text-sky-850">PR</th>
                          <th className="px-1 py-1.5 border-r border-slate-200 bg-indigo-50 text-indigo-850">MD</th>
                          <th className="px-1.5 py-1.5 border-r border-slate-200 bg-indigo-100 text-indigo-950 font-bold">MR</th>
                          <th className="px-1 py-1.5 border-r border-slate-200 bg-amber-50 text-amber-850">SF</th>
                          <th className="px-1 py-1.5 border-r border-slate-200 bg-orange-50 text-orange-850">FN</th>
                          <th className="px-1.5 py-1.5 border-r border-slate-200 bg-orange-100 text-orange-950 font-bold">TFR</th>
                          <th className="px-1.5 py-1.5 border-r border-slate-200 bg-emerald-50 text-emerald-800 font-bold">SG</th>
                          <th className="px-1.5 py-1.5 border-r border-slate-200 bg-emerald-100 text-emerald-950 font-bold">GWA</th>
                          <th className="px-2 py-1.5 bg-emerald-100 text-emerald-950 font-bold">Remarks</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {computedStudents.map((stud, idx) => (
                          <tr key={idx} className={`hover:bg-slate-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/20'}`}>
                            <td className="px-1.5 py-1 border-r border-slate-100 text-slate-400">{idx + 1}</td>
                            <td className="px-2 py-1 border-r border-slate-100 text-left font-bold text-slate-800 truncate w-36 uppercase">{stud.name || '-'}</td>
                            <td className="px-1 py-1 border-r border-slate-100">{stud.name ? stud.prelim : ''}</td>
                            <td className="px-1 py-1 border-r border-slate-100">{stud.name ? stud.midterm : ''}</td>
                            <td className="px-1.5 py-1 border-r border-slate-100 font-bold bg-slate-50/50">{stud.name ? stud.mr : ''}</td>
                            <td className="px-1 py-1 border-r border-slate-100">{stud.name ? stud.semiFinal : ''}</td>
                            <td className="px-1 py-1 border-r border-slate-100">{stud.name ? stud.finalTerm : ''}</td>
                            <td className="px-1.5 py-1 border-r border-slate-100 font-bold bg-slate-50/50">{stud.name ? stud.tfr : ''}</td>
                            <td className="px-1.5 py-1 border-r border-slate-100 font-bold bg-emerald-50/20 text-emerald-800">{stud.name ? stud.sg : ''}</td>
                            <td className="px-1.5 py-1 border-r border-slate-100 font-bold text-slate-900">{stud.name ? stud.gwa : ''}</td>
                            <td className={`px-2 py-1 font-bold ${
                              stud.remarks === 'Passed' ? 'text-emerald-600' : stud.remarks === 'Failed' || stud.remarks === 'FDA' ? 'text-rose-600' : 'text-slate-500'
                            }`}>{stud.name ? stud.remarks : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {selectedTab === 'report' && (
                <div className="space-y-4">
                  {/* Report of Grades headers */}
                  <div className="text-center space-y-1">
                    <h1 className="text-sm font-bold uppercase tracking-wider">OFFICE OF THE REGISTRAR</h1>
                    <h2 className="text-xs font-semibold text-slate-500">REPORT OF GRADES</h2>
                    <p className="text-[10px] text-slate-400 font-mono">
                      {classInfo.semester === '1st' ? '1st Sem' : classInfo.semester === '2nd' ? '2nd Sem' : 'Summer'} - {classInfo.school_year || ''}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 border border-slate-150 rounded-lg p-3 bg-slate-50/50 text-[10px]">
                    <div className="space-y-1.5">
                      <div><strong>College:</strong> {metadata.college || 'College of Computer Studies'}</div>
                      <div><strong>Course:</strong> {metadata.course || 'BSIT'}</div>
                      <div><strong>Section:</strong> {sectionName}</div>
                    </div>
                    <div className="space-y-1.5">
                      <div><strong>Subject Code:</strong> {subjectCode}</div>
                      <div><strong>Description:</strong> {subjectName}</div>
                      <div><strong>Schedule:</strong> {metadata.day} - {metadata.time}</div>
                    </div>
                  </div>

                  {/* Roster split list with grades */}
                  <div className="grid grid-cols-2 gap-x-6 border border-slate-200 rounded-lg p-3 overflow-x-auto">
                    {/* Left roster */}
                    <table className="w-full text-center text-[9px] border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 font-bold">
                          <th className="px-1 py-1 text-left">No.</th>
                          <th className="px-2 py-1 text-left">Student Name</th>
                          <th className="px-1 py-1">MR</th>
                          <th className="px-1 py-1">TFR</th>
                          <th className="px-1.5 py-1">GWA</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {Array.from({ length: 30 }).map((_, i) => {
                          const stud = computedStudents[i];
                          return (
                            <tr key={i} className="hover:bg-slate-50">
                              <td className="px-1 py-0.5 text-left text-slate-400">{i + 1}</td>
                              <td className="px-2 py-0.5 text-left font-bold text-slate-800 truncate uppercase">{stud?.name || ''}</td>
                              <td className="px-1 py-0.5">{stud?.name ? `${stud.mr}%` : ''}</td>
                              <td className="px-1 py-0.5">{stud?.name ? `${stud.tfr}%` : ''}</td>
                              <td className="px-1.5 py-0.5 font-bold">{stud?.name ? stud.gwa : ''}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {/* Right roster */}
                    <table className="w-full text-center text-[9px] border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 font-bold">
                          <th className="px-1 py-1 text-left">No.</th>
                          <th className="px-2 py-1 text-left">Student Name</th>
                          <th className="px-1 py-1">MR</th>
                          <th className="px-1 py-1">TFR</th>
                          <th className="px-1.5 py-1">GWA</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {Array.from({ length: 30 }).map((_, i) => {
                          const stud = computedStudents[i + 30];
                          return (
                            <tr key={i} className="hover:bg-slate-50">
                              <td className="px-1 py-0.5 text-left text-slate-400">{i + 31}</td>
                              <td className="px-2 py-0.5 text-left font-bold text-slate-800 truncate uppercase">{stud?.name || ''}</td>
                              <td className="px-1 py-0.5">{stud?.name ? `${stud.mr}%` : ''}</td>
                              <td className="px-1 py-0.5">{stud?.name ? `${stud.tfr}%` : ''}</td>
                              <td className="px-1.5 py-0.5 font-bold">{stud?.name ? stud.gwa : ''}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              
              {/* Footer Block */}
              <div className="grid grid-cols-4 gap-4 border-t border-slate-200 pt-6 mt-6 text-[9px] font-sans text-center">
                <div className="space-y-1">
                  <p className="font-semibold text-slate-400">PREPARED BY:</p>
                  <div className="h-4"></div>
                  <p className="font-bold border-t border-slate-300 pt-1 uppercase">{metadata.facultyName}</p>
                  <p className="text-slate-500">FACULTY MEMBER</p>
                </div>
                <div className="space-y-1">
                  <p className="font-semibold text-slate-400">RECOMMENDED BY:</p>
                  <div className="h-4"></div>
                  <p className="font-bold border-t border-slate-300 pt-1 uppercase">{metadata.dean}</p>
                  <p className="text-slate-500">DEAN, CCS</p>
                </div>
                <div className="space-y-1">
                  <p className="font-semibold text-slate-400">CHECKED BY:</p>
                  <div className="h-4"></div>
                  <p className="font-bold border-t border-slate-300 pt-1 uppercase">{metadata.examiner}</p>
                  <p className="text-slate-500">STUDENT RECORD EXAMINER</p>
                </div>
                <div className="space-y-1">
                  <p className="font-semibold text-slate-400">APPROVED BY:</p>
                  <div className="h-4"></div>
                  <p className="font-bold border-t border-slate-300 pt-1 uppercase">{metadata.registrar}</p>
                  <p className="text-slate-500">REGISTRAR</p>
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
