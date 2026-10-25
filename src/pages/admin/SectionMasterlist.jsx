import { useState, useEffect, useMemo } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import { ClipboardList, Download, LoaderCircle, Printer, Users, UserPlus, AlertCircle } from 'lucide-react';
import html2pdf from 'html2pdf.js';
import { supabase } from '../../lib/supabase';
import { getSectionHomeRoster, getSectionIrregularEnrollees } from '../../lib/classRoomService';
import { TableSkeleton } from '../../components/common/Skeleton';
import { useAuth } from '../../lib/AuthContext';
import { logActivity, resolveActorName } from '../../lib/auditLog';

// The official masterlist is the home-section roster (users.section_id), the traditional
// printed class list, which exists independently of any subject offering. Students from
// another block who take one of this section's subjects are a separate companion list,
// never filtered out of a roster anywhere else in the system.
export default function SectionMasterlist() {
  const { user, profile } = useAuth();
  const [sections, setSections] = useState([]);
  const [selectedSectionId, setSelectedSectionId] = useState('');
  const [regularStudents, setRegularStudents] = useState([]);
  const [irregularEnrollees, setIrregularEnrollees] = useState([]);
  const [loadingSections, setLoadingSections] = useState(true);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    async function loadSections() {
      try {
        const { data, error } = await supabase
          .from('sections')
          .select('section_id, name, school_year, semester, departments ( name )')
          .order('school_year', { ascending: false })
          .order('name');
        if (error) throw error;
        setSections(data || []);
      } catch (err) {
        setErrorMsg(err.message || 'Could not load sections.');
      } finally {
        setLoadingSections(false);
      }
    }
    loadSections();
  }, []);

  useEffect(() => {
    if (!selectedSectionId) {
      setRegularStudents([]);
      setIrregularEnrollees([]);
      return;
    }

    let cancelled = false;
    async function loadRoster() {
      setLoadingRoster(true);
      setErrorMsg('');
      try {
        const [roster, companions] = await Promise.all([
          getSectionHomeRoster(selectedSectionId),
          getSectionIrregularEnrollees(selectedSectionId)
        ]);
        if (cancelled) return;
        setRegularStudents(roster);
        setIrregularEnrollees(companions);
      } catch (err) {
        if (cancelled) return;
        setErrorMsg(err.message || 'Could not load this section’s masterlist.');
        setRegularStudents([]);
        setIrregularEnrollees([]);
      } finally {
        if (!cancelled) setLoadingRoster(false);
      }
    }
    loadRoster();
    return () => { cancelled = true; };
  }, [selectedSectionId]);

  const selectedSection = sections.find(sec => sec.section_id === selectedSectionId);

  // One block per subject offering, since a student is an irregular enrollee of a
  // specific subject, not of the section as a whole.
  const irregularBySubject = useMemo(() => {
    const groups = new Map();
    irregularEnrollees.forEach(student => {
      const key = student.subjectCode || student.subjectName || 'Unassigned subject';
      if (!groups.has(key)) groups.set(key, { subjectCode: student.subjectCode, subjectName: student.subjectName, students: [] });
      groups.get(key).students.push(student);
    });
    return Array.from(groups.values()).sort((a, b) => (a.subjectCode || '').localeCompare(b.subjectCode || ''));
  }, [irregularEnrollees]);

  const fullName = (student) => {
    const middle = student.middle_name ? ` ${student.middle_name}` : '';
    return `${student.last_name}, ${student.first_name}${middle}`;
  };

  const getExportFilename = () => {
    const sectionName = selectedSection?.name || 'Section';
    const schoolYear = selectedSection?.school_year || 'School-Year';
    const semester = selectedSection?.semester || 'Semester';
    return `${sectionName}_${schoolYear}_${semester}_Section_Roster`
      .replace(/[^a-z0-9_-]+/gi, '_');
  };

  const handlePrint = () => {
    if (!selectedSectionId || loadingRoster) return;
    void logActivity(
      'File Export',
      `Printed the section roster for ${selectedSection?.name}, ${selectedSection?.semester} Semester A.Y. ${selectedSection?.school_year}.`,
      resolveActorName(profile, user)
    );
    window.print();
  };

  const handleDownloadPdf = async () => {
    const source = document.getElementById('print-container');
    if (!source || !selectedSectionId || loadingRoster || isGeneratingPdf) return;

    setIsGeneratingPdf(true);
    let restoreDocumentStyles = () => {};

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      const advancedColorPattern = /(oklch|oklab|lab|lch|hwb|color)\([^)]+\)/g;
      const toRgb = (text) => {
        if (!context || !text || typeof text !== 'string') return text;
        return text.replace(advancedColorPattern, (color) => {
          try {
            context.clearRect(0, 0, 1, 1);
            context.fillStyle = color;
            context.fillRect(0, 0, 1, 1);
            const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
            return alpha === 255
              ? `rgb(${red}, ${green}, ${blue})`
              : `rgba(${red}, ${green}, ${blue}, ${Number((alpha / 255).toFixed(3))})`;
          } catch {
            return color;
          }
        });
      };

      // html2canvas cannot parse every modern CSS color function. Temporarily
      // normalize generated style tags, then restore them after the export.
      const styleBackups = [];
      const ruleBackups = [];
      document.querySelectorAll('style').forEach((styleElement) => {
        const originalText = styleElement.textContent;
        if (originalText && advancedColorPattern.test(originalText)) {
          advancedColorPattern.lastIndex = 0;
          styleBackups.push({ styleElement, originalText });
          styleElement.textContent = toRgb(originalText);
        }
        advancedColorPattern.lastIndex = 0;
      });

      const normalizeRules = (rules) => {
        Array.from(rules || []).forEach((rule) => {
          if (rule.style) {
            Array.from(rule.style).forEach((property) => {
              const originalValue = rule.style.getPropertyValue(property);
              advancedColorPattern.lastIndex = 0;
              if (!originalValue || !advancedColorPattern.test(originalValue)) return;
              advancedColorPattern.lastIndex = 0;
              ruleBackups.push({
                style: rule.style,
                property,
                originalValue,
                priority: rule.style.getPropertyPriority(property)
              });
              rule.style.setProperty(property, toRgb(originalValue), rule.style.getPropertyPriority(property));
            });
          }
          if (rule.cssRules) normalizeRules(rule.cssRules);
        });
      };

      Array.from(document.styleSheets).forEach((sheet) => {
        try {
          normalizeRules(sheet.cssRules);
        } catch {
          // Cross-origin stylesheets cannot be inspected and are safely skipped.
        }
      });

      restoreDocumentStyles = () => {
        ruleBackups.reverse().forEach(({ style, property, originalValue, priority }) => {
          style.setProperty(property, originalValue, priority);
        });
        styleBackups.forEach(({ styleElement, originalText }) => {
          styleElement.textContent = originalText;
        });
      };

      const cloned = source.cloneNode(true);
      cloned.removeAttribute('id');
      cloned.classList.remove('space-y-5');
      cloned.classList.add('bg-white');
      cloned.style.boxSizing = 'border-box';
      cloned.style.width = '760px';
      cloned.style.minWidth = '760px';
      cloned.style.maxWidth = '760px';
      cloned.style.padding = '24px';

      cloned.querySelectorAll('[data-export-only]').forEach((element) => {
        element.style.display = 'block';
      });
      cloned.querySelectorAll('.overflow-x-auto').forEach((element) => {
        element.style.overflow = 'visible';
      });

      const exporter = typeof html2pdf === 'function'
        ? html2pdf
        : html2pdf?.default;
      if (!exporter) throw new Error('PDF export library is unavailable.');

      await exporter()
        .from(cloned)
        .set({
          margin: [10, 10, 10, 10],
          filename: `${getExportFilename()}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, logging: false },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', '[data-pdf-keep]'] }
        })
        .save();

      void logActivity(
        'File Export',
        `Downloaded the section roster PDF for ${selectedSection?.name}, ${selectedSection?.semester} Semester A.Y. ${selectedSection?.school_year}.`,
        resolveActorName(profile, user)
      );
    } catch (error) {
      console.error('Section roster PDF export failed:', error);
      alert(`Failed to download the section roster PDF: ${error.message}`);
    } finally {
      restoreDocumentStyles();
      setIsGeneratingPdf(false);
    }
  };

  return (
    <>
      <style>{`
        @media print {
          @page {
            size: portrait;
            margin: 0.45in;
          }
          #print-container {
            width: 100% !important;
            padding: 0 !important;
          }
          #print-container .overflow-x-auto {
            overflow: visible !important;
          }
          #print-container table {
            width: 100% !important;
          }
          #print-container tr {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          #print-container [data-pdf-keep] {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>

      <PageHeader title="Section Rosters" breadcrumb="Admin Portal">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={!selectedSectionId || loadingRoster || isGeneratingPdf}
            className="px-3 py-2 bg-white hover:bg-slate-50 disabled:bg-slate-100 disabled:cursor-not-allowed text-sage-700 disabled:text-slate-400 border border-slate-200 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            {isGeneratingPdf
              ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              : <Download className="h-3.5 w-3.5" />}
            <span>{isGeneratingPdf ? 'Generating PDF' : 'Download PDF'}</span>
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={!selectedSectionId || loadingRoster}
            className="px-3 py-2 bg-sage-600 hover:bg-sage-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Printer className="h-3.5 w-3.5" />
            <span>Print</span>
          </button>
        </div>
      </PageHeader>

      <div className="p-4 sm:p-6 md:p-8 overflow-y-auto flex-1">
        <div className="max-w-5xl mx-auto space-y-5">

          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs p-4 sm:p-5 space-y-3">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-sage-600" />
              <h2 className="text-sm font-bold text-slate-900 font-display">Select a Section</h2>
            </div>
            <p className="text-xs text-slate-500">
              The masterlist is the section&rsquo;s home-assigned students. Students from another block who take one of its subjects are listed separately below.
            </p>
            {loadingSections ? (
              <p className="text-xs text-slate-500">Loading sections&hellip;</p>
            ) : (
              <select
                value={selectedSectionId}
                onChange={(event) => setSelectedSectionId(event.target.value)}
                className="block w-full sm:max-w-md bg-white border border-slate-200 hover:border-sage-300 focus:border-sage-500 rounded-xl px-3 py-2.5 text-sm outline-none transition-all cursor-pointer"
              >
                <option value="">Choose a section&hellip;</option>
                {sections.map(sec => (
                  <option key={sec.section_id} value={sec.section_id}>
                    {sec.name} — {sec.school_year} · {sec.semester}
                  </option>
                ))}
              </select>
            )}
          </div>

          {errorMsg && (
            <div className="bg-rose-50 border border-rose-100 text-rose-700 p-4 rounded-xl text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {selectedSectionId && loadingRoster && <TableSkeleton rows={6} />}

          {selectedSectionId && !loadingRoster && (
            <div id="print-container" className="space-y-5">
              <div data-export-only className="hidden print:block text-center border-b-2 border-slate-900 pb-4 mb-5">
                <h1 className="text-base font-bold uppercase tracking-wider text-slate-900">Dr. Yanga&rsquo;s Colleges, Inc.</h1>
                <p className="text-xs font-semibold text-slate-700 mt-1">Official Section Roster</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  {selectedSection?.name} &middot; {selectedSection?.departments?.name} &middot; A.Y. {selectedSection?.school_year} &middot; {selectedSection?.semester} Semester
                </p>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-sage-600" />
                    <h2 className="text-sm font-bold text-slate-900 font-display">
                      Official Masterlist — {selectedSection?.name}
                    </h2>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sage-50 text-sage-700 border border-sage-200 font-mono">
                      {regularStudents.length}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {selectedSection?.departments?.name} · {selectedSection?.school_year} · {selectedSection?.semester}
                  </p>
                </div>

                {regularStudents.length === 0 ? (
                  <div className="p-10 text-center">
                    <Users className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm font-semibold text-slate-700">No students assigned to this section</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Assign a home section to students in Manage Users or through Import Users.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50 border-b border-slate-100">
                        <tr className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          <th className="px-4 sm:px-6 py-3 w-10">#</th>
                          <th className="px-4 sm:px-6 py-3">Student Name</th>
                          <th className="px-4 sm:px-6 py-3">ID Number</th>
                          <th className="px-4 sm:px-6 py-3">Year Level</th>
                          <th className="px-4 sm:px-6 py-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {regularStudents.map((student, index) => (
                          <tr key={student.user_id} className="hover:bg-slate-50/70">
                            <td className="px-4 sm:px-6 py-3 text-xs text-slate-400 font-mono">{index + 1}</td>
                            <td className="px-4 sm:px-6 py-3 text-sm font-medium text-slate-900">{fullName(student)}</td>
                            <td className="px-4 sm:px-6 py-3 text-xs font-mono text-slate-600">{student.user_number || '—'}</td>
                            <td className="px-4 sm:px-6 py-3 text-xs text-slate-600">{student.year_level || '—'}</td>
                            <td className="px-4 sm:px-6 py-3">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold capitalize border ${
                                student.status === 'active'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-slate-100 text-slate-600 border-slate-200'
                              }`}>
                                {student.status || 'active'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <UserPlus className="h-4 w-4 text-amber-600" />
                    <h2 className="text-sm font-bold text-slate-900 font-display">Irregular Enrollees by Subject</h2>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 font-mono">
                      {irregularEnrollees.length}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Students from another home block taking a subject offered under this section. They remain on every official class record; this list is additional, not a filter.
                  </p>
                </div>

                {irregularBySubject.length === 0 ? (
                  <div className="p-10 text-center">
                    <UserPlus className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm font-semibold text-slate-700">No irregular enrollees</p>
                    <p className="text-xs text-slate-500 mt-1">Every student in this section&rsquo;s classes belongs to this block.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {irregularBySubject.map(group => (
                      <div key={group.subjectCode || group.subjectName} data-pdf-keep className="p-4 sm:p-5">
                        <div className="flex items-center gap-2 mb-3">
                          <h3 className="text-xs font-bold text-slate-800 font-mono">{group.subjectCode || '—'}</h3>
                          <span className="text-[11px] text-slate-500">{group.subjectName}</span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 font-mono">
                            {group.students.length}
                          </span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left">
                            <thead>
                              <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                <th className="py-2 pr-4">Student Name</th>
                                <th className="py-2 pr-4">ID Number</th>
                                <th className="py-2 pr-4">Home Section</th>
                                <th className="py-2 pr-4">Year Level</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                              {group.students.map(student => (
                                <tr key={`${student.user_id}-${group.subjectCode}`}>
                                  <td className="py-2.5 pr-4 text-sm font-medium text-slate-900">{fullName(student)}</td>
                                  <td className="py-2.5 pr-4 text-xs font-mono text-slate-600">{student.user_number || '—'}</td>
                                  <td className="py-2.5 pr-4 text-xs text-slate-600">{student.homeSectionName || 'No home section'}</td>
                                  <td className="py-2.5 pr-4 text-xs text-slate-600">{student.year_level || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
