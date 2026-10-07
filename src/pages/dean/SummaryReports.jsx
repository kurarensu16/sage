import React, { useState, useEffect, useMemo } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import {
  Printer, Filter, Download, Activity, TrendingUp, Users, AlertTriangle,
  CheckCircle, ChevronDown, ChevronRight, FileSpreadsheet, Award, GraduationCap,
  BarChart3, BookOpen
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip as RechartsTooltip,
  CartesianGrid, ResponsiveContainer, Cell, PieChart, Pie, Legend
} from 'recharts';
import { supabase } from '../../lib/supabase';
import html2pdf from 'html2pdf.js';
import * as XLSX from 'xlsx-js-style';
import { DYCI_ACADEMIC_PROGRAMS } from '../../lib/constants';
import { useAuth } from '../../lib/AuthContext';
import { findMostAdvancedPostedGrade } from '../../lib/gradeMilestones';
import { resolveOfficialGwa, computeStudentGwa } from '../../lib/academicPolicy';
import { calculateAcademicRisk } from '../../lib/riskEngine';
import { logActivity, resolveActorName } from '../../lib/auditLog';

// ── Heat map color helpers ──────────────────────────────────────────────────
function passRateColor(rate) {
  if (typeof rate !== 'number' || isNaN(rate)) return 'bg-slate-50 text-slate-700';
  if (rate >= 90) return 'bg-emerald-50 text-emerald-800';
  if (rate >= 75) return 'bg-emerald-50/60 text-emerald-700';
  if (rate >= 60) return 'bg-amber-50 text-amber-800';
  if (rate >= 40) return 'bg-orange-50 text-orange-800';
  return 'bg-rose-50 text-rose-800';
}
function gwaColor(gwa) {
  if (typeof gwa !== 'number' || isNaN(gwa)) return '';
  if (gwa <= 1.50) return 'bg-emerald-50 text-emerald-800';
  if (gwa <= 2.00) return 'bg-emerald-50/60 text-emerald-700';
  if (gwa <= 2.75) return 'bg-amber-50 text-amber-800';
  if (gwa <= 3.00) return 'bg-orange-50 text-orange-800';
  return 'bg-rose-50 text-rose-800';
}
function riskBadge(risk) {
  if (risk === 'Critical Risk') return 'bg-rose-100 text-rose-700 border border-rose-200';
  if (risk === 'High Risk') return 'bg-orange-100 text-orange-700 border border-orange-200';
  if (risk === 'Medium Risk') return 'bg-amber-100 text-amber-700 border border-amber-200';
  return 'bg-slate-100 text-slate-600 border border-slate-200';
}

export default function SummaryReports() {
  const { profile, user } = useAuth();
  const [reportType, setReportType] = useState('grade-distribution');
  const [deptFilter, setDeptFilter] = useState('College of Computer Studies');
  const [semFilter, setSemFilter] = useState('1st');
  const [syFilter, setSyFilter] = useState('2025-2026');

  const [reportData, setReportData] = useState([]);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Semester-over-semester historical data
  const [historicalData, setHistoricalData] = useState([]);

  // Drill-down state
  const [expandedRow, setExpandedRow] = useState(null);
  const [drillDownData, setDrillDownData] = useState([]);

  const [termList, setTermList] = useState([]);

  // Raw data refs for drill-down
  const [rawPostedGrades, setRawPostedGrades] = useState([]);
  const [rawUsers, setRawUsers] = useState([]);

  // Pre-select department filter and active term on load
  useEffect(() => {
    if (profile?.departments?.name) {
      setDeptFilter(profile.departments.name);
    }

    async function loadActiveTerm() {
      const { data: terms } = await supabase
        .from('academic_terms')
        .select('*')
        .order('created_at', { ascending: false });

      if (terms && terms.length > 0) {
        setTermList(terms);
        const active = terms.find(t => t.is_active) || terms[0];
        if (active) {
          setSyFilter(active.school_year);
          setSemFilter(active.semester);
        }
      }
    }
    loadActiveTerm();
  }, [profile]);

  useEffect(() => {
    let cancelled = false;
    setReportData([]); // Clear previous state to prevent cross-rendering during async load
    setExpandedRow(null);
    setDrillDownData([]);
    async function loadReportData() {
      try {
        // Fetch all required data in parallel
        const [
          { data: classroomsData, error: classroomsError },
          { data: usersData, error: usersError },
          { data: postedGradesData, error: postedGradesError },
          { data: enrollmentsData, error: enrollmentsError }
        ] = await Promise.all([
          supabase
            .from('class_records')
            .select('*, subjects(*, departments(name)), sections(*, departments(name)), faculty:users!faculty_id(user_id, first_name, last_name)')
            .eq('status', 'active'),
          supabase.from('users').select('*, departments(name), sections(*, departments(name))'),
          supabase.from('posted_grades').select('*'),
          supabase.from('enrollments').select('*')
        ]);

        if (classroomsError) throw classroomsError;
        if (usersError) throw usersError;
        if (postedGradesError) throw postedGradesError;
        if (enrollmentsError) throw enrollmentsError;

        if (cancelled) return;

        // Store raw data for drill-down
        setRawPostedGrades(postedGradesData || []);
        setRawUsers(usersData || []);

        // Group enrollments count by class section/subject
        const enrollCountMap = {};
        (enrollmentsData || []).forEach(e => {
          const key = `${e.section_id}|${e.subject_id}`;
          enrollCountMap[key] = (enrollCountMap[key] || 0) + 1;
        });

        // Pre-filter active class records for school year and semester
        const termClassRecords = (classroomsData || []).filter(c => {
          const sy = c.sections?.school_year || c.school_year;
          const sem = c.sections?.semester || c.semester;
          return sy === syFilter && sem === semFilter;
        });

        const termClassRecordIds = new Set(termClassRecords.map(c => c.class_record_id));
        const postedRowsByStudentClass = {};
        (postedGradesData || []).forEach(grade => {
          const key = `${grade.student_id}:${grade.class_record_id}`;
          if (!postedRowsByStudentClass[key]) postedRowsByStudentClass[key] = [];
          postedRowsByStudentClass[key].push(grade);
        });
        const advancedPostedGrades = Object.values(postedRowsByStudentClass)
          .map(findMostAdvancedPostedGrade)
          .filter(Boolean);

        // ── Build semester-over-semester historical data ──
        const allSemesters = [...new Set((classroomsData || []).map(c => {
          const sy = c.sections?.school_year || c.school_year;
          const sem = c.sections?.semester || c.semester;
          return `${sy} ${sem}`;
        }))].sort();

        const histPoints = allSemesters.map(label => {
          const [sy, sem] = [label.split(' ').slice(0, -1).join(' '), label.split(' ').pop()];
          const semClasses = (classroomsData || []).filter(c => {
            const csy = c.sections?.school_year || c.school_year;
            const csem = c.sections?.semester || c.semester;
            const deptName = c.sections?.departments?.name || c.subjects?.departments?.name;
            return csy === sy && csem === sem && deptName === deptFilter;
          });
          const semClassIds = new Set(semClasses.map(c => c.class_record_id));
          const semGrades = advancedPostedGrades.filter(g => semClassIds.has(g.class_record_id));
          const gwas = semGrades.map(g => resolveOfficialGwa(g).gwa).filter(g => typeof g === 'number' && !isNaN(g));
          const passed = gwas.filter(g => g <= 3.00).length;
          const rate = gwas.length > 0 ? Math.round((passed / gwas.length) * 100) : 0;
          return { label: `${sem} ${sy}`, passRate: isNaN(rate) ? 0 : rate, totalGraded: gwas.length };
        }).filter(p => p.totalGraded > 0);

        setHistoricalData(histPoints);

        if (reportType === 'grade-distribution') {
          // Map class sections to passing/average metrics filtered by selected college
          const list = termClassRecords
            .filter(c => {
              const deptName = c.sections?.departments?.name || c.subjects?.departments?.name;
              return deptName === deptFilter;
            })
            .map(c => {
              const grades = advancedPostedGrades.filter(g => g.class_record_id === c.class_record_id);
              const gwas = grades.map(g => resolveOfficialGwa(g).gwa).filter(g => typeof g === 'number' && !isNaN(g));
              const sum = gwas.reduce((acc, g) => acc + g, 0);
              const avg = gwas.length > 0 && !isNaN(sum) ? sum / gwas.length : null;
              const passedCount = gwas.filter(g => g <= 3.00).length;
              const enrolled = enrollCountMap[`${c.section_id}|${c.subject_id}`] || c.enrolledCount || 0;

              return {
                classRecordId: c.class_record_id,
                code: c.subjects?.code || '—',
                name: c.subjects?.name || '—',
                section: c.sections?.name || '—',
                faculty: c.faculty ? `${c.faculty.first_name} ${c.faculty.last_name}` : 'Unassigned',
                enrolled: enrolled,
                averageGwa: avg,
                passed: passedCount
              };
            });
          setReportData(list);
        } else if (reportType === 'faculty-ranking') {
          // ── FACULTY PERFORMANCE RANKING ──
          const facultyMap = {};
          termClassRecords
            .filter(c => {
              const deptName = c.sections?.departments?.name || c.subjects?.departments?.name;
              return deptName === deptFilter;
            })
            .forEach(c => {
              const fid = c.faculty?.user_id;
              if (!fid) return;
              if (!facultyMap[fid]) {
                facultyMap[fid] = {
                  name: `${c.faculty.first_name} ${c.faculty.last_name}`,
                  classes: 0,
                  totalEnrolled: 0,
                  totalPassed: 0,
                  gwaSum: 0,
                  gwaCount: 0,
                  subjects: new Set()
                };
              }
              const f = facultyMap[fid];
              f.classes++;
              f.subjects.add(c.subjects?.code || '—');
              const enrolled = enrollCountMap[`${c.section_id}|${c.subject_id}`] || 0;
              f.totalEnrolled += enrolled;
              const grades = advancedPostedGrades.filter(g => g.class_record_id === c.class_record_id);
              const gwas = grades.map(g => resolveOfficialGwa(g).gwa).filter(g => typeof g === 'number' && !isNaN(g));
              f.totalPassed += gwas.filter(g => g <= 3.00).length;
              const sum = gwas.reduce((acc, g) => acc + g, 0);
              f.gwaSum += isNaN(sum) ? 0 : sum;
              f.gwaCount += gwas.length;
            });

          const list = Object.entries(facultyMap)
            .map(([fid, f]) => ({
              facultyId: fid,
              name: f.name,
              classes: f.classes,
              subjects: [...f.subjects].join(', '),
              enrolled: f.totalEnrolled,
              passed: f.totalPassed,
              passRate: f.totalEnrolled > 0 ? Math.round((f.totalPassed / f.totalEnrolled) * 100) : 0,
              avgGwa: f.gwaCount > 0 && !isNaN(f.gwaSum) ? f.gwaSum / f.gwaCount : null
            }))
            .sort((a, b) => b.passRate - a.passRate);

          setReportData(list);
        } else if (reportType === 'enrollment-analytics') {
          // ── ENROLLMENT ANALYTICS ──
          const sectionMap = {};
          termClassRecords
            .filter(c => {
              const deptName = c.sections?.departments?.name || c.subjects?.departments?.name;
              return deptName === deptFilter;
            })
            .forEach(c => {
              const sName = c.sections?.name || '—';
              if (!sectionMap[sName]) {
                sectionMap[sName] = { section: sName, subjects: 0, totalEnrolled: 0, subjectList: [], facultySet: new Set() };
              }
              const enrolled = enrollCountMap[`${c.section_id}|${c.subject_id}`] || 0;
              sectionMap[sName].subjects++;
              sectionMap[sName].totalEnrolled += enrolled;
              sectionMap[sName].subjectList.push({ code: c.subjects?.code || '—', enrolled });
              if (c.faculty) sectionMap[sName].facultySet.add(`${c.faculty.first_name} ${c.faculty.last_name}`);
            });

          const list = Object.values(sectionMap).map(s => ({
            ...s,
            avgPerSubject: s.subjects > 0 ? Math.round(s.totalEnrolled / s.subjects) : 0,
            facultyCount: s.facultySet.size
          })).sort((a, b) => b.totalEnrolled - a.totalEnrolled);

          setReportData(list);
        } else if (reportType === 'intervention-outcomes') {
          // ASPIRE v3.1: Intervention Outcomes & Honor Roll Summary
          const { data: evaluationsData } = await supabase
            .from('student_risk_evaluations')
            .select(`
              *,
              student:users!student_id(user_id, first_name, last_name, email, departments(name), sections(name, departments(name))),
              faculty:users!faculty_id(first_name, last_name),
              class_record:class_records(subjects(code, name), sections(name))
            `);

          const list = (evaluationsData || [])
            .filter(ev => {
              const deptName = ev.student?.departments?.name || ev.student?.sections?.departments?.name;
              return !deptFilter || deptName === deptFilter;
            })
            .map(ev => {
              const bSnapshot = ev.baseline_snapshot || {};
              const fSnapshot = ev.followup_snapshot || null;

              let statusLabel = 'In Intervention';
              if (fSnapshot) {
                const bGwa = parseFloat(bSnapshot.gwa || 3.0);
                const fGwa = parseFloat(fSnapshot.gwa || 3.0);
                if (fGwa < bGwa) statusLabel = 'Recovered / GWA Improved';
                else if (fGwa === bGwa) statusLabel = 'Stabilized';
                else statusLabel = 'Needs Continued Escalation';
              } else if (ev.refer_to_dean) {
                statusLabel = 'Escalated to Dean';
              }

              return {
                studentName: ev.student ? `${ev.student.first_name} ${ev.student.last_name}` : 'Student',
                section: ev.class_record?.sections?.name || ev.student?.sections?.name || '—',
                subject: ev.class_record?.subjects?.code || 'General',
                context: ev.evaluation_context === 'pl_retention' ? "Legacy President's Lister Retention" : ev.evaluation_context === 'passing_recovery' ? 'Legacy Passing Recovery' : 'Academic Intervention',
                initialRisk: `${ev.risk_level?.toUpperCase()} (${ev.risk_score || 0})`,
                baselineGwa: bSnapshot.gwa ? Number(bSnapshot.gwa).toFixed(2) : '—',
                followupGwa: fSnapshot?.gwa ? Number(fSnapshot.gwa).toFixed(2) : 'Under Review',
                outcome: statusLabel,
                faculty: ev.faculty ? `Prof. ${ev.faculty.first_name} ${ev.faculty.last_name}` : 'Assigned Faculty'
              };
            });

          setReportData(list);
        } else {
          // At-risk student audit filtered by selected college (official posted grades only)
          const studentUsers = (usersData || []).filter(u => 
            u.role === 'student' && 
            (u.departments?.name === deptFilter || u.sections?.departments?.name === deptFilter)
          );
          
          // Calculate running GWA from posted grades only for the selected term's class records
          const studentGradesMap = {};
          advancedPostedGrades.forEach(g => {
            if (termClassRecordIds.has(g.class_record_id)) {
              if (!studentGradesMap[g.student_id]) {
                studentGradesMap[g.student_id] = [];
              }
              const resolvedGwa = resolveOfficialGwa(g).gwa;
              if (typeof resolvedGwa === 'number' && !isNaN(resolvedGwa)) studentGradesMap[g.student_id].push(resolvedGwa);
            }
          });

          const list = studentUsers.map(s => {
            const grades = studentGradesMap[s.user_id] || [];
            const gwa = computeStudentGwa(grades).gwa;
            const riskLevel = gwa !== null ? calculateAcademicRisk({ currentGwa: gwa }).risk_level : 'low';
            const risk = { low: 'Low Risk', moderate: 'Medium Risk', high: 'High Risk', critical: 'Critical Risk' }[riskLevel] || 'Low Risk';

            return {
              name: `${s.first_name} ${s.last_name}`,
              email: s.email,
              dept: s.departments?.name || s.sections?.departments?.name || deptFilter,
              gwa: gwa,
              risk: risk
            };
          }).filter(s => s.risk !== 'Low Risk');
          setReportData(list);
        }
      } catch (err) {
        console.error('Error loading report data from Supabase:', err);
      }
    }

    loadReportData();
    return () => {
      cancelled = true;
    };
  }, [reportType, deptFilter, semFilter, syFilter]);

  // ── Drill-down handler ──────────────────────────────────────────────────
  const handleDrillDown = (classRecordId, idx) => {
    if (expandedRow === idx) {
      setExpandedRow(null);
      setDrillDownData([]);
      return;
    }
    // Find per-student grades for this class record
    const classGrades = rawPostedGrades.filter(g => g.class_record_id === classRecordId);
    const studentMap = {};
    classGrades.forEach(g => {
      if (!studentMap[g.student_id]) studentMap[g.student_id] = [];
      studentMap[g.student_id].push(g);
    });

    const rows = Object.entries(studentMap).map(([sid, grades]) => {
      const best = findMostAdvancedPostedGrade(grades);
      const resolved = best ? resolveOfficialGwa(best) : { gwa: null };
      const gwaVal = (resolved && typeof resolved.gwa === 'number' && !isNaN(resolved.gwa)) ? resolved.gwa : null;
      const student = rawUsers.find(u => u.user_id === sid);
      return {
        name: student ? `${student.first_name} ${student.last_name}` : sid,
        gwa: gwaVal,
        passed: gwaVal !== null && gwaVal <= 3.00
      };
    }).sort((a, b) => (a.gwa ?? 99) - (b.gwa ?? 99));

    setDrillDownData(rows);
    setExpandedRow(idx);
  };

  // ── Auto-generated Executive Summary ──────────────────────────────────
  const executiveSummary = useMemo(() => {
    if (reportData.length === 0) return null;

    if (reportType === 'grade-distribution') {
      const totalEnrolled = reportData.reduce((a, r) => a + (r.enrolled || 0), 0);
      const totalPassed = reportData.reduce((a, r) => a + (r.passed || 0), 0);
      const passRate = totalEnrolled > 0 ? Math.round((totalPassed / totalEnrolled) * 100) : 0;
      const worst = [...reportData]
        .filter(r => r.enrolled > 0)
        .sort((a, b) => {
          const ra = a.enrolled > 0 ? (a.passed / a.enrolled) : 1;
          const rb = b.enrolled > 0 ? (b.passed / b.enrolled) : 1;
          return ra - rb;
        })[0];
      const worstRate = worst && worst.enrolled > 0 ? Math.round((worst.passed / worst.enrolled) * 100) : null;
      return `For ${semFilter} Semester A.Y. ${syFilter}, a total of ${totalEnrolled} student-subject enrollments were analyzed across ${reportData.length} class sections in ${deptFilter}. The overall college pass rate stands at ${passRate}%.${worst && worstRate !== null ? ` ${worst.code} (${worst.section}) has the lowest pass rate at ${worstRate}%, requiring immediate academic intervention review.` : ''}`;
    }
    if (reportType === 'faculty-ranking') {
      const top = reportData[0];
      return `Faculty performance ranking for ${semFilter} Semester A.Y. ${syFilter} covers ${reportData.length} instructors in ${deptFilter}.${top ? ` Prof. ${top.name} leads with a ${top.passRate}% pass rate across ${top.classes} class section(s).` : ''}`;
    }
    if (reportType === 'enrollment-analytics') {
      const total = reportData.reduce((a, r) => a + r.totalEnrolled, 0);
      return `Enrollment analytics for ${semFilter} Semester A.Y. ${syFilter} show a total of ${total} student-subject enrollments distributed across ${reportData.length} active sections in ${deptFilter}.`;
    }
    if (reportType === 'intervention-outcomes') {
      const recovered = reportData.filter(d => d.outcome === 'Recovered / GWA Improved').length;
      const escalated = reportData.filter(d => d.outcome === 'Escalated to Dean' || d.outcome === 'Needs Continued Escalation').length;
      return `A total of ${reportData.length} student interventions are tracked for ${deptFilter}. ${recovered} student(s) have shown measurable GWA improvement, while ${escalated} case(s) require continued escalation or Dean-level directives.`;
    }
    if (reportType === 'at-risk-audit') {
      const critical = reportData.filter(d => d.risk === 'Critical Risk').length;
      const high = reportData.filter(d => d.risk === 'High Risk').length;
      return `The at-risk audit for ${semFilter} Semester A.Y. ${syFilter} identified ${reportData.length} students below the academic standing threshold in ${deptFilter}. ${critical} student(s) are classified as Critical Risk and ${high} as High Risk, requiring immediate Dean-level intervention.`;
    }
    return null;
  }, [reportData, reportType, semFilter, syFilter, deptFilter]);

  // ── Excel Export ──────────────────────────────────────────────────────
  const handleExportExcel = () => {
    if (reportData.length === 0) return;

    const wb = XLSX.utils.book_new();
    let wsData = [];

    // Institution header rows
    wsData.push(['Dr. Yanga\'s Colleges, Inc.']);
    wsData.push(['Wakas, Bocaue, Bulacan, Philippines']);
    wsData.push([`Office of the Dean, ${deanCollegeName}`]);
    wsData.push([]);
    wsData.push([getReportTitle()]);
    wsData.push([`Department: ${deptFilter}  |  A.Y. ${syFilter}  |  ${semFilter} Semester`]);
    wsData.push([`Generated: ${new Date().toLocaleDateString()}  |  Author: Dean ${deanFullName}`]);
    wsData.push([]);

    if (reportType === 'grade-distribution') {
      wsData.push(['Subject', 'Section', 'Instructor', 'Enrolled', 'Passed', 'Pass Rate %', 'Average GWA']);
      reportData.forEach(r => {
        const rate = r.enrolled > 0 ? Math.round((r.passed / r.enrolled) * 100) : 0;
        wsData.push([r.code, r.section, `Prof. ${r.faculty}`, r.enrolled, r.passed || 0, rate, typeof r.averageGwa === 'number' ? Number(r.averageGwa.toFixed(2)) : 'N/A']);
      });
    } else if (reportType === 'faculty-ranking') {
      wsData.push(['Rank', 'Faculty Name', 'Classes', 'Subjects', 'Enrolled', 'Passed', 'Pass Rate %', 'Avg GWA']);
      reportData.forEach((r, i) => {
        wsData.push([i + 1, `Prof. ${r.name}`, r.classes, r.subjects, r.enrolled, r.passed, r.passRate, typeof r.avgGwa === 'number' ? Number(r.avgGwa.toFixed(2)) : 'N/A']);
      });
    } else if (reportType === 'enrollment-analytics') {
      wsData.push(['Section', 'Total Subjects', 'Total Enrollments', 'Avg per Subject', 'Faculty Count']);
      reportData.forEach(r => {
        wsData.push([r.section, r.subjects, r.totalEnrolled, r.avgPerSubject, r.facultyCount]);
      });
    } else if (reportType === 'intervention-outcomes') {
      wsData.push(['Student', 'Section', 'Scope', 'Baseline GWA', 'Follow-up GWA', 'Status', 'Faculty']);
      reportData.forEach(r => {
        wsData.push([r.studentName, r.section, r.context, r.baselineGwa, r.followupGwa, r.outcome, r.faculty]);
      });
    } else {
      wsData.push(['Student Name', 'Email', 'Department', 'Running GWA', 'Risk Classification']);
      reportData.forEach(r => {
        wsData.push([r.name, r.email, r.dept, typeof r.gwa === 'number' ? Number(r.gwa.toFixed(2)) : 'N/A', r.risk]);
      });
    }

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Style header rows
    const headerStyle = { font: { bold: true, sz: 14 }, alignment: { horizontal: 'center' } };
    const subHeaderStyle = { font: { bold: true, sz: 10, color: { rgb: '666666' } }, alignment: { horizontal: 'center' } };
    for (let c = 0; c < 7; c++) {
      const col = XLSX.utils.encode_col(c);
      if (ws[`${col}1`]) ws[`${col}1`].s = headerStyle;
      if (ws[`${col}2`]) ws[`${col}2`].s = subHeaderStyle;
      if (ws[`${col}3`]) ws[`${col}3`].s = subHeaderStyle;
      if (ws[`${col}5`]) ws[`${col}5`].s = { font: { bold: true, sz: 12 } };
    }

    // Set column widths
    ws['!cols'] = [
      { wch: 20 }, { wch: 15 }, { wch: 25 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }
    ];

    // Merge institution name row
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 6 } },
      { s: { r: 4, c: 0 }, e: { r: 4, c: 6 } },
      { s: { r: 5, c: 0 }, e: { r: 5, c: 6 } },
      { s: { r: 6, c: 0 }, e: { r: 6, c: 6 } }
    ];

    XLSX.utils.book_append_sheet(wb, ws, getReportTitle().substring(0, 31));
    XLSX.writeFile(wb, `${getReportTitle()}_${deptFilter}_${syFilter}.xlsx`);
    void logActivity('File Export', `Initiated Dean Excel report export: ${getReportTitle()} for ${deptFilter}, ${semFilter} Semester A.Y. ${syFilter}.`, resolveActorName(profile, user));
  };

  // ── PDF Export (preserved from original) ──────────────────────────────
   const handlePrint = () => {
    void logActivity('File Export', `Initiated print export: ${getReportTitle()} for ${deptFilter}, ${semFilter} Semester A.Y. ${syFilter}.`, resolveActorName(profile, user));
    window.print();
  };

  const handleDownloadPDF = () => {
    const element = document.getElementById('print-area');
    if (!element || reportData.length === 0) return;
    void logActivity('File Export', `Initiated Dean PDF report export: ${getReportTitle()} for ${deptFilter}, ${semFilter} Semester A.Y. ${syFilter}.`, resolveActorName(profile, user));
    setIsGeneratingPdf(true);

    // Give state time to render loading modal
    setTimeout(() => {
      let restoreStyles = null;
      try {
        const exporter = typeof html2pdf === 'function' ? html2pdf : (html2pdf && html2pdf.default);
        if (!exporter) {
          console.error('html2pdf library is not loaded properly:', html2pdf);
          alert('PDF Export Library is not loaded. Please try System Print.');
          setIsGeneratingPdf(false);
          return;
        }

        // Create canvas context for color conversions
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        
        const colorFuncRegex = /(oklch|oklab|lab|lch|hwb|color)\([^)]+\)/g;
        const convertUnsupportedColorsToStringRgb = (str) => {
          if (!str || typeof str !== 'string') return str;
          colorFuncRegex.lastIndex = 0;
          if (!colorFuncRegex.test(str)) return str;
          return str.replace(colorFuncRegex, (match) => {
            try {
              if (!ctx) return match;
              ctx.clearRect(0, 0, 1, 1);
              ctx.fillStyle = match;
              ctx.fillRect(0, 0, 1, 1);
              const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
              return a === 255 
                ? `rgb(${r}, ${g}, ${b})` 
                : `rgba(${r}, ${g}, ${b}, ${parseFloat((a / 255).toFixed(3))})`;
            } catch {
              return match;
            }
          });
        };

        // Temporarily patch oklch color declarations to avoid html2canvas crash
        const styleElements = Array.from(document.querySelectorAll('style'));
        const styleOverrides = [];
        
        if (ctx) {
          styleElements.forEach(styleEl => {
            const originalText = styleEl.textContent;
            if (originalText && (originalText.includes('oklch') || originalText.includes('oklab') || originalText.includes('lab') || originalText.includes('lch'))) {
              styleEl.textContent = convertUnsupportedColorsToStringRgb(originalText);
              styleOverrides.push({ styleEl, originalText });
            }
          });

          // Also scan document stylesheets rules
          Array.from(document.styleSheets).forEach(sheet => {
            try {
              const rules = sheet.cssRules || sheet.rules;
              if (!rules) return;
              Array.from(rules).forEach(rule => {
                if (rule.style) {
                  for (let i = 0; i < rule.style.length; i++) {
                    const prop = rule.style[i];
                    const val = rule.style.getPropertyValue(prop);
                    if (val && (val.includes('oklch') || val.includes('oklab') || val.includes('lab') || val.includes('lch'))) {
                      rule.style.setProperty(prop, convertUnsupportedColorsToStringRgb(val));
                    }
                  }
                }
              });
            } catch {
              // Ignore cross-origin stylesheet errors
            }
          });
        }

        restoreStyles = () => {
          styleOverrides.forEach(({ styleEl, originalText }) => {
            styleEl.textContent = originalText;
          });
        };

        // Clone element and convert computed styles to resolve any inline oklch
        const cloned = element.cloneNode(true);
        const originalElements = [element, ...Array.from(element.querySelectorAll('*'))];
        const clonedElements = [cloned, ...Array.from(cloned.querySelectorAll('*'))];

        for (let i = 0; i < originalElements.length; i++) {
          const orig = originalElements[i];
          const clone = clonedElements[i];
          if (!orig || !clone) continue;

          const computed = window.getComputedStyle(orig);
          for (let j = 0; j < computed.length; j++) {
            const prop = computed[j];
            const val = computed.getPropertyValue(prop);
            if (val && typeof val === 'string' && (val.includes('oklch') || val.includes('oklab') || val.includes('lab') || val.includes('lch'))) {
              clone.style.setProperty(prop, convertUnsupportedColorsToStringRgb(val));
            }
          }
        }

        cloned.style.boxSizing = 'border-box';
        cloned.style.width = '1040px';
        cloned.style.minWidth = '1040px';
        cloned.style.maxWidth = '1040px';

        const opt = {
          margin:       [10, 10, 10, 10],
          filename:     `${getReportTitle()}_${deptFilter}_${syFilter}.pdf`,
          image:        { type: 'jpeg', quality: 0.98 },
          html2canvas:  { scale: 2, useCORS: true, logging: false },
          jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' }
        };

        exporter()
          .from(cloned)
          .set(opt)
          .save()
          .then(() => {
            if (restoreStyles) restoreStyles();
            setIsGeneratingPdf(false);
          })
          .catch(err => {
            console.error('html2pdf promise error:', err);
            if (restoreStyles) restoreStyles();
            setIsGeneratingPdf(false);
            alert('Failed to generate PDF: ' + err.message);
          });
      } catch (err) {
        console.error('PDF Export Error:', err);
        if (restoreStyles) restoreStyles();
        setIsGeneratingPdf(false);
        alert('Failed to export PDF: ' + err.message);
      }
    }, 500);
  };

  const getReportTitle = () => {
    switch (reportType) {
      case 'grade-distribution':
        return 'Academic Grade Distribution Summary Report';
      case 'faculty-ranking':
        return 'Faculty Performance Ranking Report';
      case 'enrollment-analytics':
        return 'Section Enrollment Analytics Report';
      case 'intervention-outcomes':
        return 'Student Intervention Outcomes & Academic Honor Standing Report';
      default:
        return 'Student Academic At-Risk Warning Ledger';
    }
  };

  const deanFullName = profile?.first_name ? `${profile.first_name} ${profile.last_name}` : 'Carlos Valdes';
  const deanCollegeName = profile?.departments?.name || deptFilter;

  // ── KPI Cards data ────────────────────────────────────────────────────
  const kpiCards = useMemo(() => {
    if (reportData.length === 0) return [];

    if (reportType === 'grade-distribution') {
      const totalEnrolled = reportData.reduce((a, r) => a + (r.enrolled || 0), 0);
      const totalPassed = reportData.reduce((a, r) => a + (r.passed || 0), 0);
      const passRateRaw = totalEnrolled > 0 ? Math.round((totalPassed / totalEnrolled) * 100) : 0;
      const passRate = isNaN(passRateRaw) ? 0 : passRateRaw;
      return [
        { label: 'Total Enrolled', value: isNaN(totalEnrolled) ? 0 : totalEnrolled, icon: Users, bg: 'bg-slate-50', border: 'border-slate-100', text: 'text-slate-500', valueColor: 'text-slate-800' },
        { label: 'College Pass Rate', value: `${passRate}%`, icon: CheckCircle, bg: 'bg-emerald-50', border: 'border-emerald-100', text: 'text-emerald-600', valueColor: 'text-emerald-700' },
        { label: 'Classes Analyzed', value: reportData.length, icon: BookOpen, bg: 'bg-amber-50', border: 'border-amber-100', text: 'text-amber-600', valueColor: 'text-amber-700' },
      ];
    }
    if (reportType === 'faculty-ranking') {
      const top = reportData[0];
      const avgRateRaw = reportData.length > 0 ? Math.round(reportData.reduce((a, r) => a + (r.passRate || 0), 0) / reportData.length) : 0;
      const avgRate = isNaN(avgRateRaw) ? 0 : avgRateRaw;
      return [
        { label: 'Total Faculty', value: reportData.length, icon: Users, bg: 'bg-slate-50', border: 'border-slate-100', text: 'text-slate-500', valueColor: 'text-slate-800' },
        { label: 'Top Performer', value: top ? `Prof. ${top.name}` : '—', icon: Award, bg: 'bg-emerald-50', border: 'border-emerald-100', text: 'text-emerald-600', valueColor: 'text-emerald-700', small: true },
        { label: 'Avg Pass Rate', value: `${avgRate}%`, icon: TrendingUp, bg: 'bg-blue-50', border: 'border-blue-100', text: 'text-blue-600', valueColor: 'text-blue-700' },
      ];
    }
    if (reportType === 'enrollment-analytics') {
      const totalRaw = reportData.reduce((a, r) => a + (r.totalEnrolled || 0), 0);
      const total = isNaN(totalRaw) ? 0 : totalRaw;
      const avgSecRaw = reportData.length > 0 ? Math.round(total / reportData.length) : 0;
      const avgSec = isNaN(avgSecRaw) ? 0 : avgSecRaw;
      return [
        { label: 'Total Enrollments', value: total, icon: GraduationCap, bg: 'bg-slate-50', border: 'border-slate-100', text: 'text-slate-500', valueColor: 'text-slate-800' },
        { label: 'Active Sections', value: reportData.length, icon: BookOpen, bg: 'bg-blue-50', border: 'border-blue-100', text: 'text-blue-600', valueColor: 'text-blue-700' },
        { label: 'Avg per Section', value: avgSec, icon: BarChart3, bg: 'bg-violet-50', border: 'border-violet-100', text: 'text-violet-600', valueColor: 'text-violet-700' },
      ];
    }
    if (reportType === 'intervention-outcomes') {
      const recovered = reportData.filter(d => d.outcome === 'Recovered / GWA Improved').length;
      const escalated = reportData.filter(d => d.outcome === 'Escalated to Dean' || d.outcome === 'Needs Continued Escalation').length;
      return [
        { label: 'Total Interventions', value: reportData.length, icon: Activity, bg: 'bg-slate-50', border: 'border-slate-100', text: 'text-slate-500', valueColor: 'text-slate-800' },
        { label: 'Recovered / Improved', value: isNaN(recovered) ? 0 : recovered, icon: TrendingUp, bg: 'bg-emerald-50', border: 'border-emerald-100', text: 'text-emerald-600', valueColor: 'text-emerald-700' },
        { label: 'Needs Escalation', value: isNaN(escalated) ? 0 : escalated, icon: AlertTriangle, bg: 'bg-rose-50', border: 'border-rose-100', text: 'text-rose-600', valueColor: 'text-rose-700' },
      ];
    }
    // at-risk-audit
    const highRisk = reportData.filter(d => d.risk === 'High Risk').length;
    const criticalRisk = reportData.filter(d => d.risk === 'Critical Risk').length;
    return [
      { label: 'Total At-Risk', value: reportData.length, icon: Users, bg: 'bg-slate-50', border: 'border-slate-100', text: 'text-slate-500', valueColor: 'text-slate-800' },
      { label: 'High Risk', value: isNaN(highRisk) ? 0 : highRisk, icon: AlertTriangle, bg: 'bg-orange-50', border: 'border-orange-100', text: 'text-orange-600', valueColor: 'text-orange-700' },
      { label: 'Critical Risk', value: isNaN(criticalRisk) ? 0 : criticalRisk, icon: AlertTriangle, bg: 'bg-red-50', border: 'border-red-100', text: 'text-red-600', valueColor: 'text-red-700' },
    ];
  }, [reportData, reportType]);

  return (
    <>
      {/* Premium PDF Loading Modal */}
      {isGeneratingPdf && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in no-print">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full mx-4 shadow-2xl border border-slate-100 flex flex-col items-center text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-sage-50 border border-sage-200 text-sage-600 flex items-center justify-center animate-bounce">
              <Download className="h-6 w-6" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-sm font-bold text-slate-900">Generating PDF Document</h3>
              <p className="text-xs text-slate-500">Compiling report layout and graphics. Your download will start automatically in a moment...</p>
            </div>
            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
              <div className="bg-sage-600 h-full w-2/3 rounded-full animate-pulse" />
            </div>
          </div>
        </div>
      )}

      {/* Injecting CSS media print styling for clean printing directly */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #print-area, #print-area * {
            visibility: visible;
          }
          #print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white !important;
            color: black !important;
            padding: 24px;
            margin: 0;
            box-shadow: none;
            border: none;
          }
        }
      `}</style>

      <PageHeader title="Generate Reports" breadcrumb="Dean Portal" />
      
      <div className="p-8 overflow-y-auto flex-1 space-y-6">
        
        {/* Settings and Filters Grid */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4 no-print">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-sage-600" /> Document Configuration
          </h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            
            {/* Report Type */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Report Category</label>
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                className="block w-full border border-slate-200 px-3 py-2.5 rounded-lg text-xs bg-white outline-none cursor-pointer font-bold text-slate-800"
              >
                <option value="grade-distribution">Grade Distribution Summary</option>
                <option value="faculty-ranking">Faculty Performance Ranking</option>
                <option value="enrollment-analytics">Enrollment Analytics</option>
                <option value="intervention-outcomes">Intervention Outcomes & Honor Status</option>
                <option value="at-risk-audit">At-Risk Student Audit</option>
              </select>
            </div>

            {/* Department */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">College / School</label>
              {profile?.departments?.name ? (
                <div className="block w-full border border-slate-200 px-3 py-2.5 rounded-lg text-xs bg-slate-50 text-slate-500 cursor-not-allowed font-medium">
                  {profile.departments.name}
                </div>
              ) : (
                <select
                  value={deptFilter}
                  onChange={(e) => setDeptFilter(e.target.value)}
                  className="block w-full border border-slate-200 px-3 py-2.5 rounded-lg text-xs bg-white outline-none cursor-pointer"
                >
                  {Object.keys(DYCI_ACADEMIC_PROGRAMS).map(college => (
                    <option key={college} value={college}>{college}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Semester */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Semester</label>
              <select
                value={semFilter}
                onChange={(e) => setSemFilter(e.target.value)}
                className="block w-full border border-slate-200 px-3 py-2.5 rounded-lg text-xs bg-white outline-none cursor-pointer"
              >
                <option value="1st">1st Semester</option>
                <option value="2nd">2nd Semester</option>
                <option value="Summer">Summer Term</option>
              </select>
            </div>

            {/* School Year */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Academic Year</label>
              <select
                value={syFilter}
                onChange={(e) => setSyFilter(e.target.value)}
                className="block w-full border border-slate-200 px-3 py-2.5 rounded-lg text-xs bg-white outline-none cursor-pointer"
              >
                {Array.from(new Set(['2025-2026', '2026-2027', ...termList.map(t => t.school_year)])).map(sy => (
                  <option key={sy} value={sy}>{sy}</option>
                ))}
              </select>
            </div>

          </div>

          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
            <button 
              onClick={handlePrint}
              className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="h-3.5 w-3.5 text-slate-500" /> Print
            </button>
            <button 
              onClick={handleExportExcel}
              disabled={reportData.length === 0}
              className="px-4 py-2 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" /> Export Excel
            </button>
            <button 
              onClick={handleDownloadPDF}
              className="px-4 py-2 bg-sage-600 hover:bg-sage-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" /> Export PDF
            </button>
          </div>
        </div>

        {/* --- KPI DASHBOARD --- */}
        {reportData.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-6 no-print">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Activity className="h-4 w-4 text-sage-600" /> Executive Analytics Dashboard
            </h3>
            
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {kpiCards.map((card, i) => (
                <div key={i} className={`${card.bg} border ${card.border} rounded-xl p-4 flex flex-col gap-2`}>
                  <div className={`text-xs font-bold ${card.text} uppercase tracking-wide flex items-center gap-2`}>
                    <card.icon className="h-4 w-4" /> {card.label}
                  </div>
                  <div className={`${card.small ? 'text-lg' : 'text-2xl'} font-bold ${card.valueColor} truncate`}>{card.value}</div>
                </div>
              ))}
            </div>

            {/* Auto-generated Executive Summary */}
            {executiveSummary && (
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <BookOpen className="h-3.5 w-3.5" /> Executive Summary
                </p>
                <p className="text-sm text-slate-700 leading-relaxed">{executiveSummary}</p>
              </div>
            )}

            {/* Recharts Visualizations */}
            {reportType === 'grade-distribution' && (
              <div className="h-64 mt-4 w-full bg-slate-50 rounded-xl p-4 border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Pass Rate by Subject</p>
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart 
                    data={reportData.map(d => {
                      const rate = (d.enrolled > 0 && typeof d.passed === 'number' && !isNaN(d.passed))
                        ? Math.round((d.passed / d.enrolled) * 100)
                        : 0;
                      return { name: d.code || '—', passRate: isNaN(rate) ? 0 : rate };
                    })} 
                    margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} domain={[0, 100]} />
                    <RechartsTooltip cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }} />
                    <Bar dataKey="passRate" radius={[4, 4, 0, 0]} name="Pass Rate %">
                      {reportData.map((d, i) => {
                        const rate = (d.enrolled > 0 && typeof d.passed === 'number' && !isNaN(d.passed))
                          ? Math.round((d.passed / d.enrolled) * 100)
                          : 0;
                        return <Cell key={i} fill={rate >= 75 ? '#059669' : rate >= 50 ? '#d97706' : '#e11d48'} />;
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {reportType === 'faculty-ranking' && (
              <div className="h-64 mt-4 w-full bg-slate-50 rounded-xl p-4 border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Faculty Pass Rate Comparison</p>
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart 
                    data={reportData.slice(0, 10).map(d => {
                      const pRate = (typeof d.passRate === 'number' && !isNaN(d.passRate)) ? d.passRate : 0;
                      const gwa = (typeof d.avgGwa === 'number' && !isNaN(d.avgGwa)) ? Number(d.avgGwa.toFixed(2)) : 0;
                      return {
                        name: d.name ? String(d.name).split(' ').pop() : 'Faculty',
                        passRate: isNaN(pRate) ? 0 : pRate,
                        avgGwa: isNaN(gwa) ? 0 : gwa
                      };
                    })} 
                    margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} domain={[0, 100]} />
                    <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }} />
                    <Bar dataKey="passRate" radius={[4, 4, 0, 0]} name="Pass Rate %">
                      {reportData.slice(0, 10).map((d, i) => (
                        <Cell key={i} fill={i === 0 ? '#059669' : i === 1 ? '#0284c7' : i === 2 ? '#6366f1' : '#64748b'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {reportType === 'enrollment-analytics' && (
              <div className="h-64 mt-4 w-full bg-slate-50 rounded-xl p-4 border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Enrollment Distribution by Section</p>
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart 
                    data={reportData.map(d => ({
                      name: d.section || '—',
                      enrolled: (typeof d.totalEnrolled === 'number' && !isNaN(d.totalEnrolled)) ? d.totalEnrolled : 0
                    }))} 
                    margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }} />
                    <Bar dataKey="enrolled" fill="#6366f1" radius={[4, 4, 0, 0]} name="Enrollments" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            
            {reportType === 'intervention-outcomes' && (
              <div className="h-64 mt-4 w-full bg-slate-50 rounded-xl p-4 border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Intervention Status Distribution</p>
                <ResponsiveContainer width="100%" height="90%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Recovered / Stabilized', value: reportData.filter(d => ['Recovered / GWA Improved', 'Stabilized'].includes(d.outcome)).length },
                        { name: 'Needs Escalation', value: reportData.filter(d => ['Escalated to Dean', 'Needs Continued Escalation'].includes(d.outcome)).length },
                        { name: 'In Intervention', value: reportData.filter(d => d.outcome === 'In Intervention').length }
                      ].filter(d => d.value > 0)}
                      cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={5} dataKey="value"
                    >
                      <Cell fill="#059669" />
                      <Cell fill="#e11d48" />
                      <Cell fill="#fbbf24" />
                    </Pie>
                    <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }} />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            
            {reportType === 'at-risk-audit' && (
              <div className="h-64 mt-4 w-full bg-slate-50 rounded-xl p-4 border border-slate-100 flex flex-col">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">At-Risk Severity Level Distribution</p>
                <ResponsiveContainer width="100%" height="90%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Critical Risk', value: reportData.filter(d => d.risk === 'Critical Risk').length },
                        { name: 'High Risk', value: reportData.filter(d => d.risk === 'High Risk').length },
                        { name: 'Medium Risk', value: reportData.filter(d => d.risk === 'Medium Risk').length }
                      ].filter(d => d.value > 0)}
                      cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={5} dataKey="value"
                    >
                      <Cell fill="#e11d48" />
                      <Cell fill="#f97316" />
                      <Cell fill="#f59e0b" />
                    </Pie>
                    <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }} />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Semester-over-Semester Trend Line */}
            {historicalData.length > 1 && (
              <div className="h-56 mt-4 w-full bg-slate-50 rounded-xl p-4 border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Semester-over-Semester Pass Rate Trend</p>
                <ResponsiveContainer width="100%" height="85%">
                  <LineChart 
                    data={(historicalData || []).map(d => ({
                      label: d.label || '—',
                      passRate: (typeof d.passRate === 'number' && !isNaN(d.passRate)) ? d.passRate : 0
                    }))} 
                    margin={{ top: 5, right: 20, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }} />
                    <Line type="monotone" dataKey="passRate" stroke="#059669" strokeWidth={2.5} dot={{ r: 4, fill: '#059669' }} activeDot={{ r: 6 }} name="Pass Rate %" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* Live A4 Print Preview Sheet */}
        <div className="flex justify-center bg-slate-100 p-6 rounded-xl border border-slate-200 no-print">
          <div 
            id="print-area" 
            className="w-full max-w-[800px] bg-white border border-slate-350 shadow-md p-8 md:p-12 space-y-8 rounded-md font-sans text-black"
          >
            {/* Institution header */}
            <div className="text-center space-y-1.5 border-b-2 border-slate-900 pb-5">
              <h2 className="text-base font-bold uppercase tracking-wider">Dr. Yanga's Colleges, Inc.</h2>
              <p className="text-[10px] text-slate-500 font-mono">Wakas, Bocaue, Bulacan, Philippines</p>
              <p className="text-xs font-bold text-slate-700">Office of the Dean, {deanCollegeName}</p>
            </div>

            {/* Document Details */}
            <div className="flex justify-between items-start text-xs border-b border-slate-100 pb-4">
              <div className="space-y-1">
                <p className="font-bold text-slate-800 text-sm">{getReportTitle()}</p>
                <p className="text-slate-500 font-medium">Department: {deptFilter}</p>
                <p className="text-slate-500 font-medium">A.Y. {syFilter} &bull; {semFilter} Semester</p>
              </div>
              <div className="text-right space-y-1 font-mono text-[10px] text-slate-400">
                <p>Generated: {new Date().toLocaleDateString()}</p>
                <p>Author: Dean {deanFullName}</p>
                <p>Security Class: Restricted</p>
              </div>
            </div>

            {/* Executive Summary in Print */}
            {executiveSummary && (
              <div className="text-xs text-slate-600 leading-relaxed border-l-4 border-sage-600 pl-3 py-1 bg-slate-50 rounded-r">
                <span className="font-bold text-slate-800">Executive Summary: </span>{executiveSummary}
              </div>
            )}

            {/* Report Data Table Preview */}
            <div className="overflow-x-auto">
              {reportType === 'grade-distribution' && (
                <table className="min-w-full divide-y divide-slate-300 text-xs">
                  <thead>
                    <tr className="font-bold text-slate-700 text-left">
                      <th className="py-2.5">Subject</th>
                      <th className="py-2.5">Section</th>
                      <th className="py-2.5">Instructor</th>
                      <th className="py-2.5 text-center">Enrolled</th>
                      <th className="py-2.5 text-center">Passed (%)</th>
                      <th className="py-2.5 text-center">Average GWA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reportData.map((row, idx) => {
                      const rate = row.enrolled > 0 ? Math.round(((row.passed || 0) / row.enrolled) * 100) : 0;
                      return (
                        <React.Fragment key={idx}>
                          <tr
                            className="text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors"
                            onClick={() => handleDrillDown(row.classRecordId, idx)}
                          >
                            <td className="py-2.5 font-bold flex items-center gap-1.5">
                              {expandedRow === idx ? <ChevronDown className="h-3 w-3 text-sage-600" /> : <ChevronRight className="h-3 w-3 text-slate-400" />}
                              {row.code}
                            </td>
                            <td className="py-2.5">{row.section}</td>
                            <td className="py-2.5">Prof. {row.faculty}</td>
                            <td className="py-2.5 text-center font-mono">{row.enrolled}</td>
                            <td className={`py-2.5 text-center font-mono rounded ${passRateColor(rate)}`}>
                              {row.passed || 0} ({rate}%)
                            </td>
                            <td className={`py-2.5 text-center font-mono font-bold rounded ${typeof row.averageGwa === 'number' ? gwaColor(row.averageGwa) : ''}`}>
                              {typeof row.averageGwa === 'number' ? row.averageGwa.toFixed(2) : 'No grades yet'}
                            </td>
                          </tr>
                          {expandedRow === idx && drillDownData.length > 0 && (
                            <tr>
                              <td colSpan="6" className="py-0 px-0">
                                <div className="bg-slate-50 border border-slate-200 rounded-lg mx-4 my-2 p-3">
                                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">Per-Student Breakdown ({drillDownData.length} students)</p>
                                  <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
                                    {drillDownData.map((s, si) => (
                                      <div key={si} className={`flex items-center justify-between px-2 py-1 rounded text-[10px] ${s.passed ? 'bg-emerald-50 text-emerald-700' : s.gwa !== null ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-500'}`}>
                                        <span className="truncate font-medium">{s.name}</span>
                                        <span className="font-mono font-bold ml-2">{s.gwa !== null ? s.gwa.toFixed(2) : '—'}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              )}

              {reportType === 'faculty-ranking' && (
                <table className="min-w-full divide-y divide-slate-300 text-xs">
                  <thead>
                    <tr className="font-bold text-slate-700 text-left">
                      <th className="py-2.5 w-8 text-center">#</th>
                      <th className="py-2.5">Faculty Name</th>
                      <th className="py-2.5 text-center">Classes</th>
                      <th className="py-2.5">Subjects</th>
                      <th className="py-2.5 text-center">Enrolled</th>
                      <th className="py-2.5 text-center">Pass Rate</th>
                      <th className="py-2.5 text-center">Avg GWA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reportData.map((row, idx) => (
                      <tr key={idx} className={`text-slate-700 ${idx === 0 ? 'bg-emerald-50/40' : idx === 1 ? 'bg-emerald-50/20' : ''}`}>
                        <td className="py-2.5 text-center font-mono font-bold text-slate-400">
                          {idx === 0 ? <Award className="h-4 w-4 text-amber-500 mx-auto" /> : idx + 1}
                        </td>
                        <td className="py-2.5 font-bold">Prof. {row.name}</td>
                        <td className="py-2.5 text-center font-mono">{row.classes}</td>
                        <td className="py-2.5 text-[10px] text-slate-500 max-w-[150px] truncate">{row.subjects}</td>
                        <td className="py-2.5 text-center font-mono">{row.enrolled}</td>
                        <td className={`py-2.5 text-center font-mono font-bold rounded ${passRateColor(row.passRate)}`}>
                          {row.passRate}%
                        </td>
                        <td className={`py-2.5 text-center font-mono font-bold rounded ${typeof row.avgGwa === 'number' ? gwaColor(row.avgGwa) : ''}`}>
                          {typeof row.avgGwa === 'number' ? row.avgGwa.toFixed(2) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {reportType === 'enrollment-analytics' && (
                <table className="min-w-full divide-y divide-slate-300 text-xs">
                  <thead>
                    <tr className="font-bold text-slate-700 text-left">
                      <th className="py-2.5">Section</th>
                      <th className="py-2.5 text-center">Subjects</th>
                      <th className="py-2.5 text-center">Total Enrollments</th>
                      <th className="py-2.5 text-center">Avg / Subject</th>
                      <th className="py-2.5 text-center">Faculty Count</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reportData.map((row, idx) => (
                      <tr key={idx} className="text-slate-700">
                        <td className="py-2.5 font-bold">{row.section}</td>
                        <td className="py-2.5 text-center font-mono">{row.subjects}</td>
                        <td className="py-2.5 text-center font-mono font-bold">{row.totalEnrolled}</td>
                        <td className="py-2.5 text-center font-mono">{row.avgPerSubject}</td>
                        <td className="py-2.5 text-center font-mono">{row.facultyCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {reportType === 'intervention-outcomes' && (
                <table className="min-w-full divide-y divide-slate-300 text-xs">
                  <thead>
                    <tr className="font-bold text-slate-700 text-left">
                      <th className="py-2.5">Student Name</th>
                      <th className="py-2.5">Section</th>
                      <th className="py-2.5">Evaluation Scope</th>
                      <th className="py-2.5 text-center">Baseline GWA</th>
                      <th className="py-2.5 text-center">Follow-up GWA</th>
                      <th className="py-2.5 text-center">Intervention Status</th>
                      <th className="py-2.5">Faculty In-Charge</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reportData.map((row, idx) => (
                      <tr key={idx} className="text-slate-700">
                        <td className="py-2.5 font-bold">{row.studentName}</td>
                        <td className="py-2.5">{row.section}</td>
                        <td className="py-2.5">{row.context}</td>
                        <td className="py-2.5 text-center font-mono">{row.baselineGwa}</td>
                        <td className="py-2.5 text-center font-mono font-bold">{row.followupGwa}</td>
                        <td className="py-2.5 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            row.outcome?.includes('Recovered') || row.outcome?.includes('Maintained')
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : row.outcome?.includes('Escalation') || row.outcome?.includes('Dean')
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}>
                            {row.outcome}
                          </span>
                        </td>
                        <td className="py-2.5">{row.faculty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {reportType === 'at-risk-audit' && (
                <table className="min-w-full divide-y divide-slate-300 text-xs">
                  <thead>
                    <tr className="font-bold text-slate-700 text-left">
                      <th className="py-2.5">Student Name</th>
                      <th className="py-2.5">Department</th>
                      <th className="py-2.5 text-center">Running GWA</th>
                      <th className="py-2.5 text-center">Risk Classification</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reportData.map((row, idx) => (
                      <tr key={idx} className="text-slate-700">
                        <td className="py-2.5 font-bold">{row.name}</td>
                        <td className="py-2.5">{row.dept}</td>
                        <td className={`py-2.5 text-center font-mono font-bold rounded ${typeof row.gwa === 'number' ? gwaColor(row.gwa) : ''}`}>
                          {typeof row.gwa === 'number' ? row.gwa.toFixed(2) : 'No grades yet'}
                        </td>
                        <td className="py-2.5 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${riskBadge(row.risk)}`}>
                            {row.risk}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Formal Signature Block */}
            <div className="pt-10 border-t border-slate-200 mt-8">
              <div className="grid grid-cols-3 gap-8 text-center text-xs">
                <div className="space-y-1">
                  <div className="border-b border-slate-800 pb-1 mb-1 h-10" />
                  <p className="font-bold text-slate-900">Prepared by</p>
                  <p className="text-slate-500">Data Analytics System</p>
                </div>
                <div className="space-y-1">
                  <div className="border-b border-slate-800 pb-1 mb-1 h-10 flex items-end justify-center">
                    <span className="font-bold text-slate-800">Dean {deanFullName}</span>
                  </div>
                  <p className="font-bold text-slate-900">Noted by</p>
                  <p className="text-slate-500">Dean, {deanCollegeName}</p>
                </div>
                <div className="space-y-1">
                  <div className="border-b border-slate-800 pb-1 mb-1 h-10" />
                  <p className="font-bold text-slate-900">Approved by</p>
                  <p className="text-slate-500">VP for Academic Affairs</p>
                </div>
              </div>
              <p className="text-center text-[9px] text-slate-400 font-mono mt-6">
                This document is system-generated by ASPIRE v3.1 — Academic Support and Performance Advising with Intervention, Risk, and Evaluation.
                Confidential. Do not distribute without authorization from the Office of the Dean.
              </p>
            </div>
          </div>
        </div>

      </div>
    </>
  );
}
