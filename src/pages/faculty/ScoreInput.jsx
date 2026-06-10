import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import StudentRow from '../../components/StudentRow';
import PageHeader from '../../components/layout/PageHeader';
import { ChevronRight, Save, FileSpreadsheet, ChevronDown, Check, Maximize2, Minimize2, Lock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { logActivity, resolveActorName } from '../../lib/auditLog';
import { triggerExcelExport } from '../../lib/excelExport';
import ExportPreviewModal from '../../components/ExportPreviewModal';
import html2pdf from 'html2pdf.js';

export default function ScoreInput() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();
  const classRecordId = new URLSearchParams(location.search).get('id');

  const [classInfo, setClassInfo] = useState(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('All');
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [lockedMilestones, setLockedMilestones] = useState([]);
  const [savingDrafts, setSavingDrafts] = useState(false);
  const [classesList, setClassesList] = useState([]);

  // Success and posting modals
  const [showPopup, setShowPopup] = useState(false);
  const [popupTitle, setPopupTitle] = useState('');
  const [popupDesc, setPopupDesc] = useState('');
  const [showPostModal, setShowPostModal] = useState(false);
  const [postingGrades, setPostingGrades] = useState(false);

  // Maximum items configuration for activities and exams per period
  const [maxItems, setMaxItems] = useState({
    Prelim: { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, char: 100, exam: 40 },
    Midterm: { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, char: 100, exam: 40 },
    'Semi-Final': { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, char: 100, exam: 40 },
    Final: { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, char: 100, exam: 40 }
  });

  const [editingColumn, setEditingColumn] = useState(null); // { period, key, label, value }

  // Excel export metadata state
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportMetadata, setExportMetadata] = useState({
    examiner: 'MYRA R. CRUZ',
    registrar: 'VIRGINIA D. SALVADOR, MBA',
    facultyName: '',
    dean: '',
    day: 'Mon',
    time: '07:00 - 10:00'
  });

  const periodsList = ['Prelim', 'Midterm', 'Semi-Final', 'Final'];

  // Initialize faculty name when profile loads
  useEffect(() => {
    if (profile) {
      setExportMetadata(prev => ({
        ...prev,
        facultyName: `${profile.first_name} ${profile.last_name}`.toUpperCase()
      }));
    }
  }, [profile]);

  // Auto-lookup dean based on the class's college/department
  useEffect(() => {
    if (!classInfo) return;
    const collegeName = classInfo.subjects?.departments?.name || '';
    if (!collegeName) return;

    async function fetchDean() {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('first_name, last_name, departments ( name )')
          .eq('role', 'dean')
          .eq('status', 'active')
          .limit(10);

        if (error) throw error;

        // Match dean whose department name matches the college
        const matched = (data || []).find(u => {
          const deptName = u.departments?.name || '';
          return deptName.toLowerCase().includes(collegeName.toLowerCase()) ||
                 collegeName.toLowerCase().includes(deptName.toLowerCase());
        }) || data?.[0]; // fallback to first dean if no match

        if (matched) {
          const fullName = `${matched.last_name.toUpperCase()}, ${matched.first_name.toUpperCase()}`;
          setExportMetadata(prev => ({ ...prev, dean: fullName }));
        }
      } catch (err) {
        console.error('Failed to fetch dean:', err);
      }
    }
    fetchDean();
  }, [classInfo]);

  const compileStudentsWithGrades = () => {
    return students.map(student => {
      const STORAGE_KEY = `sage_scores_${classRecordId}_${student.id}`;
      const draftRaw = localStorage.getItem(STORAGE_KEY);
      const draft = draftRaw ? JSON.parse(draftRaw) : {};
      
      const storedAbsences = localStorage.getItem(`sage_absences_${classRecordId}_${student.id}`);
      const absences = storedAbsences !== null ? parseInt(storedAbsences) : 0;

      return {
        ...student,
        absences,
        periods: {
          Prelim: draft.Prelim || {},
          Midterm: draft.Midterm || {},
          'Semi-Final': draft['Semi-Final'] || {},
          Final: draft.Final || {}
        },
        customRemarks: draft.customRemarks || '',
        remarksNote: draft.remarksNote || ''
      };
    });
  };

  const handleExportExcel = (selectedTab) => {
    if (!classInfo || students.length === 0) return;

    const studentsWithGrades = compileStudentsWithGrades();
    const metadata = {
      college: classInfo.subjects?.departments?.name || 'College of Computer Studies',
      course: classInfo.course || 'BSIT',
      subjectCode: classInfo.subjects?.code || '',
      subjectName: classInfo.subjects?.name || '',
      section: classInfo.sections?.name || '',
      semester: classInfo.semester === '1st' ? '1st Sem' : classInfo.semester === '2nd' ? '2nd Sem' : 'Summer',
      schoolYear: classInfo.school_year || '',
      units: classInfo.subjects?.units || 3,
      ...exportMetadata
    };

    triggerExcelExport(metadata, studentsWithGrades, selectedTab);
  };

  const handleExportPdf = (selectedTab) => {
    // 1. Create a single canvas context reused for all color conversions
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
        } catch (e) {
          return match;
        }
      });
    };

    // Convert OKLCH/OKLAB/other advanced colors in all stylesheets at the document level
    // html2canvas parses document stylesheets, so we must clean them to prevent parsing crashes.
    try {
      if (ctx) {
        // Process all <style> tags
        document.querySelectorAll('style').forEach(tag => {
          if (tag.innerHTML && (tag.innerHTML.includes('oklch') || tag.innerHTML.includes('oklab') || tag.innerHTML.includes('lab') || tag.innerHTML.includes('lch'))) {
            tag.innerHTML = convertUnsupportedColorsToStringRgb(tag.innerHTML);
          }
        });

        // Process all accessible stylesheet rules
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
          } catch (e) {
            // Ignore cross-origin stylesheet errors
          }
        });
      }
    } catch (e) {
      console.error('Failed to convert stylesheet colors:', e);
    }

    const previewCard = document.querySelector('.bg-slate-100 .bg-white');
    if (!previewCard) return;

    const cloned = previewCard.cloneNode(true);
    const originalElements = [previewCard, ...Array.from(previewCard.querySelectorAll('*'))];
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

    let tabName = 'Gradesheet';
    if (selectedTab === 'profile') tabName = 'Subject_Profile';
    if (selectedTab === 'record') tabName = 'Record_Sheet';
    if (selectedTab === 'report') tabName = 'Report_of_Grades';

    if (selectedTab === 'profile') {
      // Profile: constrain to A4 width with NO zoom — lets html2pdf paginate naturally
      // so both the metadata (page 1) and roster (page 2) render at full readable size.
      cloned.style.width = '740px';
      cloned.style.minWidth = '740px';
      cloned.style.maxWidth = '740px';
      cloned.style.fontSize = '11px';

      // Inject page break before the roster section
      const rosterEl = cloned.querySelector('.pdf-roster-break');
      if (rosterEl) {
        rosterEl.style.pageBreakBefore = 'always';
        rosterEl.style.breakBefore = 'page';
        rosterEl.style.paddingTop = '32px';
      }
    } else {
      // Record / Report: scale to fit exactly one page (both width + height)
      const originalWidth = previewCard.offsetWidth || 1120;
      const originalHeight = previewCard.offsetHeight || 1000;
      const targetWidth = 740;
      const targetHeight = 1060;

      const widthScale = targetWidth / originalWidth;
      const heightScale = targetHeight / originalHeight;
      const scaleFactor = Math.min(widthScale, heightScale);

      cloned.style.zoom = scaleFactor;
      cloned.style.width = `${originalWidth}px`;
      cloned.style.minWidth = `${originalWidth}px`;
      cloned.style.maxWidth = `${originalWidth}px`;
    }

    const filename = `${classInfo?.subjects?.code || 'SAGE'}_${classInfo?.sections?.name || 'Class'}_${tabName}.pdf`;

    const opt = {
      margin:       [0.3, 0.3, 0.3, 0.3],
      filename:     filename,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, logging: false },
      jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().from(cloned).set(opt).save();
  };

  useEffect(() => {
    async function fetchMyClasses() {
      if (!user) return;
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('class_records')
          .select(`
            class_record_id,
            status,
            school_year,
            semester,
            subjects ( code, name ),
            sections ( name )
          `)
          .eq('faculty_id', user.id)
          .eq('status', 'active');
        if (error) throw error;
        setClassesList(data || []);
      } catch (err) {
        console.error('Error fetching classes:', err);
      } finally {
        setLoading(false);
      }
    }

    async function loadScoreInputData() {
      if (!user) return;
      setLoading(true);
      try {
        // 1. Fetch class record info
        const { data: cr, error: crErr } = await supabase
          .from('class_records')
          .select(`
            class_record_id,
            status,
            school_year,
            semester,
            subject_id,
            section_id,
            subjects ( code, name, units, departments ( name ) ),
            sections ( name )
          `)
          .eq('class_record_id', classRecordId)
          .single();

        if (crErr) throw crErr;
        setClassInfo(cr);

        // 2. Fetch all students enrolled in this subject and section from the enrollments table
        const { data: enrolls, error: studentErr } = await supabase
          .from('enrollments')
          .select(`
            student_id,
            users:student_id (
              user_id,
              first_name,
              last_name,
              email,
              user_number
            )
          `)
          .eq('section_id', cr.section_id)
          .eq('subject_id', cr.subject_id);

        if (studentErr) throw studentErr;

        const studentList = (enrolls || [])
          .map(e => e.users)
          .filter(Boolean)
          .map((u, idx) => ({
            id: u.user_id,
            studentNo: u.user_number || (u.email ? u.email.split('@')[0].toUpperCase() : `STUD-${idx}`),
            name: `${u.last_name}, ${u.first_name}`,
            email: u.email
          }));
        studentList.sort((a, b) => a.name.localeCompare(b.name));
        setStudents(studentList);

        // 3. Fetch column setup configurations
        const { data: cols } = await supabase
          .from('class_grading_columns')
          .select('*')
          .eq('class_record_id', classRecordId);

        const newMax = {
          Prelim: { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, char: 100, exam: 40 },
          Midterm: { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, char: 100, exam: 40 },
          'Semi-Final': { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, char: 100, exam: 40 },
          Final: { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, char: 100, exam: 40 }
        };

        if (cols && cols.length > 0) {
          cols.forEach(row => {
            if (newMax[row.term]) {
              newMax[row.term] = {
                act1: row.act1_max,
                act2: row.act2_max,
                act3: row.act3_max,
                act4: row.act4_max,
                act5: row.act5_max,
                act6: row.act6_max,
                char: 100,
                exam: row.exam_max
              };
            }
          });
        }
        setMaxItems(newMax);

        // Fetch actual absences count from Supabase to sync with StudentRow
        const { data: absenceData } = await supabase
          .from('attendance_records')
          .select('student_id')
          .eq('class_record_id', classRecordId)
          .eq('status', 'Absent');

        if (absenceData) {
          const absenceCounts = {};
          absenceData.forEach(rec => {
            absenceCounts[rec.student_id] = (absenceCounts[rec.student_id] || 0) + 1;
          });
          studentList.forEach(student => {
            const count = absenceCounts[student.id] || 0;
            localStorage.setItem(`sage_absences_${classRecordId}_${student.id}`, count.toString());
          });
        }

        // 4. Fetch saved term scores from db
        const { data: savedScores } = await supabase
          .from('student_term_scores')
          .select('*')
          .eq('class_record_id', classRecordId);

        const scoresByStudent = {};
        (savedScores || []).forEach(row => {
          if (!scoresByStudent[row.student_id]) {
            scoresByStudent[row.student_id] = {
              Prelim: {},
              Midterm: {},
              'Semi-Final': {},
              Final: {},
              customRemarks: '',
              remarksNote: '',
              dbSavedAt: null
            };
          }
          
          scoresByStudent[row.student_id][row.term] = {
            act1: row.act1,
            act2: row.act2,
            act3: row.act3,
            act4: row.act4,
            act5: row.act5,
            act6: row.act6,
            char: row.char_rating,
            exam: row.exam
          };

          const rowTime = row.saved_at ? new Date(row.saved_at).getTime() : 0;
          if (!scoresByStudent[row.student_id].dbSavedAt || rowTime > scoresByStudent[row.student_id].dbSavedAt) {
            scoresByStudent[row.student_id].dbSavedAt = rowTime;
          }
        });

        // 5. Fetch posted grades to check customRemarks/overrides
        const { data: pgData } = await supabase
          .from('posted_grades')
          .select('*')
          .eq('class_record_id', classRecordId);

        const locked = new Set();

        (pgData || []).forEach(row => {
          if (!scoresByStudent[row.student_id]) {
            scoresByStudent[row.student_id] = {
              Prelim: {},
              Midterm: {},
              'Semi-Final': {},
              Final: {},
              customRemarks: '',
              remarksNote: '',
              dbSavedAt: null
            };
          }
          // The final semestral remark override
          if (row.grade_period === 'final') {
            scoresByStudent[row.student_id].customRemarks = row.remarks === 'passed' ? 'Passed' : row.remarks === 'failed' ? 'Failed' : row.remarks.toUpperCase();
            scoresByStudent[row.student_id].remarksNote = row.remarks_note || '';
          }

          if (row.is_locked) {
            if (row.grade_period === 'final') {
              locked.add('Final');
              locked.add('Semestral Grade');
            }
            if (row.locked_milestones) {
              row.locked_milestones.forEach(m => {
                const norm = m.toLowerCase();
                if (norm === 'final' || norm === 'semestral grade' || norm === 'semestral_grade') {
                  locked.add('Final');
                  locked.add('Semestral Grade');
                }
              });
            }
          }
        });

        setLockedMilestones(Array.from(locked));

        // 6. Initialize local draft caches
        studentList.forEach(stud => {
          const STORAGE_KEY = `sage_scores_${classRecordId}_${stud.id}`;
          const existingDraft = localStorage.getItem(STORAGE_KEY);
          
          const dbData = scoresByStudent[stud.id] || {};
          let draftPayload = {};
          let hasLocalDraft = false;
          if (existingDraft) {
            try {
              draftPayload = JSON.parse(existingDraft);
              hasLocalDraft = true;
            } catch {
              // Ignore local storage JSON parse errors
            }
          }

          // Determine if we should prioritize the database scores
          let useDbData = true;
          if (hasLocalDraft && draftPayload.savedAt) {
            const localTime = new Date(draftPayload.savedAt).getTime();
            const dbTime = dbData.dbSavedAt || 0;
            // If local draft is strictly newer than database save, use the local draft
            if (localTime > dbTime) {
              useDbData = false;
            }
          }
          
          const merged = useDbData ? {
            Prelim: dbData.Prelim || {},
            Midterm: dbData.Midterm || {},
            'Semi-Final': dbData['Semi-Final'] || {},
            Final: dbData.Final || {},
            customRemarks: dbData.customRemarks || '',
            remarksNote: dbData.remarksNote || '',
            savedAt: dbData.dbSavedAt ? new Date(dbData.dbSavedAt).toISOString() : new Date().toISOString()
          } : {
            Prelim: { ...dbData.Prelim, ...draftPayload.Prelim },
            Midterm: { ...dbData.Midterm, ...draftPayload.Midterm },
            'Semi-Final': { ...dbData['Semi-Final'], ...draftPayload['Semi-Final'] },
            Final: { ...dbData.Final, ...draftPayload.Final },
            customRemarks: draftPayload.customRemarks || dbData.customRemarks || '',
            remarksNote: draftPayload.remarksNote || dbData.remarksNote || '',
            savedAt: draftPayload.savedAt || new Date().toISOString()
          };
          
          localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        });

      } catch (err) {
        console.error('Error loading ScoreInput data:', err);
      } finally {
        setLoading(false);
      }
    }

    if (classRecordId) {
      loadScoreInputData();
    } else {
      fetchMyClasses();
    }
  }, [classRecordId, user]);

  const handleConfirmMaxItem = async (value) => {
    if (!editingColumn || !classRecordId) return;

    const { period, key } = editingColumn;
    const dbKey = `${key}_max`;

    try {
      // 1. Save maximum item change to DB
      await supabase
        .from('class_grading_columns')
        .select('*')
        .eq('class_record_id', classRecordId)
        .eq('term', period)
        .single();

      const payload = {
        class_record_id: classRecordId,
        term: period,
        [dbKey]: value
      };

      const { error } = await supabase
        .from('class_grading_columns')
        .upsert(payload, { onConflict: 'class_record_id,term' });

      if (error) throw error;

      // 2. Update local state
      setMaxItems(prev => ({
        ...prev,
        [period]: {
          ...prev[period],
          [key]: value
        }
      }));

      // 3. Log audit activity
      const actorName = resolveActorName(profile, user);
      await logActivity(
        'Grade Column Config',
        `Updated ${period} ${editingColumn.label} maximum score to ${value} points for subject ${classInfo?.subjects?.code}`,
        actorName
      );

      setEditingColumn(null);
    } catch (err) {
      console.error('Error updating column max points:', err);
    }
  };

  const handleBulkSave = async () => {
    if (!classRecordId || students.length === 0) return;
    
    setSavingDrafts(true);
    try {
      const upsertScoresRows = [];

      students.forEach(stud => {
        const STORAGE_KEY = `sage_scores_${classRecordId}_${stud.id}`;
        const draftRaw = localStorage.getItem(STORAGE_KEY);
        if (draftRaw) {
          const draft = JSON.parse(draftRaw);
          
          periodsList.forEach(term => {
            const termScores = draft[term] || {};
            upsertScoresRows.push({
              class_record_id: classRecordId,
              student_id: stud.id,
              term,
              act1: termScores.act1 || 0,
              act2: termScores.act2 || 0,
              act3: termScores.act3 || 0,
              act4: termScores.act4 || 0,
              act5: termScores.act5 || 0,
              act6: termScores.act6 || 0,
              char_rating: termScores.char || 0,
              exam: termScores.exam || 0,
              saved_by: user.id
            });
          });
        }
      });

      // Save to db
      const { error: scoresErr } = await supabase
        .from('student_term_scores')
        .upsert(upsertScoresRows, { onConflict: 'class_record_id,student_id,term' });

      if (scoresErr) throw scoresErr;

      // Log activity
      const actorName = resolveActorName(profile, user);
      await logActivity(
        'Save Draft Scores',
        `Saved draft scores for subject ${classInfo?.subjects?.code} - ${classInfo?.sections?.name}`,
        actorName
      );

      // Show success popup
      setPopupTitle('Drafts Saved!');
      setPopupDesc(`All draft scores for ${classInfo?.subjects?.code} (${classInfo?.sections?.name}) have been successfully synced to the database.`);
      setShowPopup(true);
    } catch (err) {
      console.error('Error saving drafts to database:', err);
    } finally {
      setSavingDrafts(false);
    }
  };

  const getTransmutedGrade = (score) => {
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

  const handlePostGrades = async () => {
    if (!classRecordId || students.length === 0) return;

    setPostingGrades(true);
    try {
      const periodParam = 'final';

      // 1. Fetch existing posted grades for this class record and period to match primary keys (prevent constraint errors)
      const { data: existingPg, error: fetchErr } = await supabase
        .from('posted_grades')
        .select('posted_grade_id, student_id')
        .eq('class_record_id', classRecordId)
        .eq('grade_period', periodParam);

      if (fetchErr) throw fetchErr;

      const existingMap = {};
      if (existingPg) {
        existingPg.forEach(row => {
          existingMap[row.student_id] = row.posted_grade_id;
        });
      }

      const postRows = [];
      const updatedLockedMilestones = ['Semestral Grade'];

      const mapRemarkToDb = (remarkStr) => {
        if (!remarkStr) return 'passed';
        const lower = remarkStr.toLowerCase();
        if (lower === 'inc') return 'incomplete';
        return lower; // 'passed', 'failed', 'fda', 'dropped'
      };

      students.forEach(stud => {
        const STORAGE_KEY = `sage_scores_${classRecordId}_${stud.id}`;
        const draft = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        
        const termScores = draft.Final || {};
        const maxT = maxItems.Final || { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, char: 100, exam: 40 };
        
        // CS sum
        const csSum = (termScores.act1 || 0) + (termScores.act2 || 0) + (termScores.act3 || 0) + (termScores.act4 || 0) + (termScores.act5 || 0) + (termScores.act6 || 0);
        const csMax = maxT.act1 + maxT.act2 + maxT.act3 + maxT.act4 + maxT.act5 + maxT.act6;
        const csPercent = csMax > 0 ? (csSum / csMax) * 50 : 0;
        
        // Char
        const charRating = termScores.char || 0;
        const charPercent = charRating * 0.1;
        
        // Exam
        const examScore = termScores.exam || 0;
        const examPercent = maxT.exam > 0 ? (examScore / maxT.exam) * 40 : 0;
        
        const computedTermGrade = Math.min(100, Math.max(0, Math.round(csPercent + charPercent + examPercent)));
        
        const getTermRating = (termName) => {
          const tSc = draft[termName] || {};
          const tMx = maxItems[termName] || { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, char: 100, exam: 40 };
          const tCs = (tSc.act1 || 0) + (tSc.act2 || 0) + (tSc.act3 || 0) + (tSc.act4 || 0) + (tSc.act5 || 0) + (tSc.act6 || 0);
          const tCsMx = tMx.act1 + tMx.act2 + tMx.act3 + tMx.act4 + tMx.act5 + tMx.act6;
          const tCsP = tCsMx > 0 ? (tCs / tCsMx) * 50 : 0;
          const tChP = (tSc.char || 0) * 0.1;
          const tExP = tMx.exam > 0 ? ((tSc.exam || 0) / tMx.exam) * 40 : 0;
          return Math.min(100, Math.max(0, Math.round(tCsP + tChP + tExP)));
        };
        
        const prelimRating = getTermRating('Prelim');
        const midtermRating = getTermRating('Midterm');
        const sfRating = getTermRating('Semi-Final');
        const finalRating = computedTermGrade;
        
        const mr = Math.round((prelimRating + midtermRating) / 2);
        const tfr = Math.round((sfRating + finalRating) / 2);
        const finalSG = Math.round((mr + tfr) / 2);
        
        const rawGWA = getTransmutedGrade(finalSG);
        const autoRemarks = rawGWA <= 3.00 ? 'Passed' : 'Failed';
        const draftRemarks = draft.customRemarks || autoRemarks;
        const remarksLabel = mapRemarkToDb(draftRemarks);
        
        let computedGWA = rawGWA;
        if (remarksLabel === 'passed' && rawGWA > 3.00) {
          computedGWA = 3.00;
        }

        const payloadRow = {
          class_record_id: classRecordId,
          student_id: stud.id,
          grade_period: 'final',
          computed_grade: computedTermGrade,
          effective_grade: computedGWA,
          remarks: remarksLabel,
          remarks_note: draft.remarksNote || null,
          remarks_set_by: user.id,
          remarks_set_at: new Date().toISOString(),
          posted_by: user.id,
          posted_at: new Date().toISOString(),
          is_locked: true,
          locked_milestones: ['Semestral Grade']
        };

        const existingId = existingMap[stud.id];
        if (existingId) {
          payloadRow.posted_grade_id = existingId;
        }

        postRows.push(payloadRow);
      });

      // Post to db
      const { error: postErr } = await supabase
        .from('posted_grades')
        .upsert(postRows);

      if (postErr) throw postErr;

      // Update state
      setLockedMilestones(updatedLockedMilestones);

      // Log activity
      const actorName = resolveActorName(profile, user);
      await logActivity(
        'Grade Posting',
        `Posted and locked Semestral grades for subject ${classInfo?.subjects?.code} - ${classInfo?.sections?.name}`,
        actorName
      );

      setShowPostModal(false);

      setPopupTitle('Grades Posted!');
      setPopupDesc(`Successfully finalized and posted Semestral grades for ${classInfo?.subjects?.code} (${classInfo?.sections?.name}) to the Dean's Office.`);
      setShowPopup(true);

    } catch (err) {
      console.error('Error posting grades to database:', err);
    } finally {
      setPostingGrades(false);
    }
  };

  // Escape key closes fullscreen
  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') setIsFullScreen(false); };
    if (isFullScreen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isFullScreen]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-sage-600"></div>
          <p className="text-sm text-slate-500 font-medium font-sans">Loading spreadsheet data...</p>
        </div>
      </div>
    );
  }

  if (!classRecordId) {
    return (
      <>
        <PageHeader title="Select Class Record" breadcrumb="Faculty Portal" />
        <div className="p-8 overflow-y-auto flex-1 space-y-6">
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900 font-display">Select a Class to Input Scores</h2>
              <p className="text-sm text-slate-500 mt-1">Please select one of your active classes to load its grading spreadsheet.</p>
            </div>

            {classesList.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                <FileSpreadsheet className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                <h3 className="text-base font-bold text-slate-900">No Active Class Records Found</h3>
                <p className="text-sm text-slate-500 mt-2">
                  You do not have any active class records. Please create or configure class records first.
                </p>
                <button
                  onClick={() => navigate('/faculty/classrecordslist')}
                  className="mt-4 px-4 py-2 text-sm font-semibold bg-sage-600 hover:bg-sage-700 text-white rounded-lg transition-all shadow-sm"
                >
                  Go to Class Records
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {classesList.map(cls => (
                  <div
                    key={cls.class_record_id}
                    onClick={() => navigate(`/faculty/scoreinput?id=${cls.class_record_id}`)}
                    className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:border-sage-500 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          {cls.school_year} · Sem {cls.semester}
                        </span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-50 border border-slate-100 text-slate-600">
                          {cls.sections?.name}
                        </span>
                      </div>
                      <div>
                        <h3 className="text-lg font-extrabold text-slate-950 font-display group-hover:text-sage-700 transition-colors">
                          {cls.subjects?.code}
                        </h3>
                        <p className="text-xs text-slate-500 font-medium mt-0.5 line-clamp-1">
                          {cls.subjects?.name}
                        </p>
                      </div>
                    </div>
                    
                    <div className="border-t border-slate-100 pt-3 mt-4 flex items-center justify-between text-xs font-semibold text-sage-700">
                      <span>Open Spreadsheet</span>
                      <ChevronRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  const subjectCode = classInfo?.subjects?.code || '';
  const subjectName = classInfo?.subjects?.name || '';
  const sectionName = classInfo?.sections?.name || '';

  const isLocked = lockedMilestones.includes('Semestral Grade') || lockedMilestones.includes('Final');
  const isPrelimLocked = isLocked;
  const isMidtermLocked = isLocked;
  const isSemiFinalLocked = isLocked;
  const isFinalLocked = isLocked;

  return (
    <>
      {/* Header */}
      <PageHeader title="Log Class Scores" breadcrumb="Faculty Portal">
        <button 
          onClick={() => navigate(`/faculty/postedgradesview?id=${classRecordId}`)}
          className="px-4 py-2 text-sm font-semibold border border-slate-200 bg-white text-slate-700 hover:border-sage-300 rounded-lg transition-all flex items-center gap-1.5"
        >
          🔒 View Posted Grades
        </button>
        <button 
          onClick={() => setShowPostModal(true)}
          className="px-4 py-2 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-all flex items-center gap-1.5 shadow-sm"
        >
          <Lock className="h-4 w-4" /> Post Grades
        </button>
        <button 
          onClick={() => setShowExportModal(true)}
          className="px-4 py-2 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-all flex items-center gap-1.5 shadow-sm"
        >
          <FileSpreadsheet className="h-4 w-4" /> Export Grades
        </button>
        <button 
          disabled={savingDrafts}
          onClick={handleBulkSave}
          className="px-4 py-2 text-sm font-medium bg-sage-600 hover:bg-sage-700 text-white rounded-lg transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
        >
          <Save className="h-4 w-4" /> {savingDrafts ? 'Saving...' : 'Save All Drafts'}
        </button>
      </PageHeader>

      {/* Content */}
      <div className="p-8 overflow-y-auto flex-1 space-y-6">
        
        {/* Navigation Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span className="hover:text-sage-600 cursor-pointer transition-colors" onClick={() => navigate('/faculty/classrecordslist')}>
            Class Records
          </span>
          <ChevronRight className="h-3 w-3" />
          <span className="font-medium text-slate-900">
            Score Spreadsheet — {subjectCode} ({sectionName})
          </span>
        </div>

        {/* selectors bar */}
        <div className="flex flex-wrap items-center gap-4 p-4 rounded-xl border border-slate-200 bg-white shadow-sm">
          
          {/* Class Record Display */}
          <div className="flex flex-col gap-1 flex-1 min-w-[240px]">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Class Record</label>
            <div className="text-xs font-bold text-slate-800 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
              {subjectCode} - {sectionName} ({subjectName})
            </div>
          </div>

          <div className="w-px h-10 bg-slate-200 hidden md:block"></div>

          {/* View Mode Selector */}
          <div className="flex flex-col gap-1 min-w-[200px]">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">View Period</label>
            <div className="relative">
              <select
                value={viewMode}
                onChange={(e) => setViewMode(e.target.value)}
                className="appearance-none w-full bg-white border border-slate-200 hover:border-sage-300 px-3 py-2 pr-8 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none transition-all cursor-pointer text-slate-700"
              >
                <option value="All">All Terms (Side-by-Side)</option>
                <option value="Prelim">Preliminary Grade</option>
                <option value="Midterm">Midterm Grade</option>
                <option value="Semi-Final">Semi-Final Grade</option>
                <option value="Final">Final Grade</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            </div>
          </div>

          <div className="w-px h-10 bg-slate-200 hidden md:block"></div>

          {/* Stats Overview */}
          <div className="flex items-center gap-6">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Enrolled</p>
              <p className="text-xs font-mono font-bold text-slate-800 mt-0.5">{students.length} Students</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Spreadsheet Mode</p>
              <p className="text-xs font-mono font-bold text-emerald-700 mt-0.5">
                {viewMode === 'All' ? 'All 4 Terms (Side-by-Side)' : `${viewMode} View`}
              </p>
            </div>
          </div>

        </div>

        {/* Data Table Card */}
        {isFullScreen && <div className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsFullScreen(false)} />}
        <div className={isFullScreen ? "fixed inset-4 z-50 rounded-xl border border-slate-200 shadow-2xl bg-white overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200" : "rounded-xl border border-slate-200 shadow-sm bg-white overflow-hidden flex flex-col"}>
            {/* Fullscreen header bar */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50/80">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-sage-600" />
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  {subjectCode} — {sectionName}
                </span>
                <span className="text-[10px] font-medium text-slate-400 ml-2">
                  {viewMode === 'All' ? 'All Terms' : `${viewMode} View`} · {students.length} students
                </span>
              </div>
              <button
                onClick={() => setIsFullScreen(!isFullScreen)}
                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-sage-50 hover:border-sage-300 text-slate-500 hover:text-slate-700 transition-all"
                title={isFullScreen ? 'Exit fullscreen' : 'View fullscreen'}
              >
                {isFullScreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </button>
            </div>
            <div className={isFullScreen ? "table-container overflow-auto flex-1" : "table-container overflow-x-auto"}>
                <table className={`w-full min-w-max text-left border-collapse ${isFullScreen ? 'fullscreen-table' : ''}`}>
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 text-xs font-bold text-center">
                            <th rowSpan={2} className="px-2 py-3 border-r border-slate-200 w-10">No.</th>
                            <th rowSpan={2} className="px-2 py-3 border-r border-slate-200 w-24">Student No.</th>
                            <th rowSpan={2} className="px-4 py-3 text-left font-bold uppercase tracking-wider sticky left-0 bg-slate-50 border-r border-slate-200 z-20 w-60 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)]">Student Name</th>
                            
                            {/* Prelim Period */}
                            {(viewMode === 'All' || viewMode === 'Prelim') && (
                              <th colSpan={12} className="px-4 py-2 border-r border-slate-200 bg-sky-50 text-sky-850">PRELIMINARY GRADE</th>
                            )}
                            
                            {/* Midterm Period */}
                            {(viewMode === 'All' || viewMode === 'Midterm') && (
                              <th colSpan={12} className="px-4 py-2 border-r border-slate-200 bg-indigo-50 text-indigo-850">MIDTERM GRADE</th>
                            )}
                            
                            {/* Midterm Rating */}
                            {(viewMode === 'All' || viewMode === 'Midterm') && (
                              <th rowSpan={2} className="px-3 py-3 border-r border-slate-200 bg-indigo-100 text-indigo-950 font-bold uppercase tracking-wider w-16">Midterm Rating (MR)</th>
                            )}
                            
                            {/* Semi-Final Period */}
                            {(viewMode === 'All' || viewMode === 'Semi-Final') && (
                              <th colSpan={12} className="px-4 py-2 border-r border-slate-200 bg-amber-50 text-amber-850">SEMI-FINAL GRADE</th>
                            )}
                            
                            {/* Final Period */}
                            {(viewMode === 'All' || viewMode === 'Final') && (
                              <th colSpan={12} className="px-4 py-2 border-r border-slate-200 bg-orange-50 text-orange-850">FINAL GRADE</th>
                            )}
                            
                            {/* Tentative Final Rating */}
                            {(viewMode === 'All' || viewMode === 'Final') && (
                              <th rowSpan={2} className="px-3 py-3 border-r border-slate-200 bg-orange-100 text-orange-950 font-bold uppercase tracking-wider w-16">Tentative Final Rating (TFR)</th>
                            )}
                            
                            {/* Semestral Grade */}
                            {(viewMode === 'All' || viewMode === 'Final') && (
                              <th rowSpan={2} className="px-3 py-3 border-r border-slate-200 bg-emerald-50 text-emerald-800 font-extrabold uppercase tracking-wider w-16">Semestral Grade (SG)</th>
                            )}
                            
                            {/* Equivalent (GWA) */}
                            {(viewMode === 'All' || viewMode === 'Final') && (
                              <th rowSpan={2} className="px-3 py-3 border-r border-slate-200 bg-emerald-100 text-emerald-950 font-extrabold uppercase tracking-wider w-16">Equivalent GWA</th>
                            )}
                            
                            {/* Remarks */}
                            {(viewMode === 'All' || viewMode === 'Final') && (
                              <th rowSpan={2} className="px-4 py-3 border-r border-slate-200 bg-emerald-100 text-emerald-950 font-extrabold uppercase tracking-wider w-20">Remarks</th>
                            )}
                        </tr>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-[9px] font-bold text-center">
                           {/* Prelim sub-headers */}
                           {(viewMode === 'All' || viewMode === 'Prelim') && (
                             <>
                               <th className="px-1 py-1.5 border-r border-slate-100 w-12">1</th>
                               <th className="px-1 py-1.5 border-r border-slate-100 w-12">2</th>
                               <th className="px-1 py-1.5 border-r border-slate-100 w-12">3</th>
                               <th className="px-1 py-1.5 border-r border-slate-100 w-12">4</th>
                               <th className="px-1 py-1.5 border-r border-slate-100 w-12">5</th>
                               <th className="px-1 py-1.5 border-r border-slate-100 w-12">6</th>
                               <th className="px-1.5 py-1.5 border-r border-slate-100 bg-slate-100/55 w-12">Total</th>
                               <th className="px-1.5 py-1.5 border-r border-slate-100 bg-slate-100/55 w-12">%</th>
                               <th className="px-1.5 py-1.5 border-r border-slate-100 w-16">Char</th>
                               <th className="px-1.5 py-1.5 border-r border-slate-100 w-12">Exam</th>
                               <th className="px-1.5 py-1.5 border-r border-slate-100 bg-slate-100/55 w-12">%</th>
                               <th className="px-2 py-1.5 border-r border-slate-200 bg-sky-100/30 font-bold w-14 text-slate-800">Rating</th>
                             </>
                           )}

                           {/* Midterm sub-headers */}
                           {(viewMode === 'All' || viewMode === 'Midterm') && (
                             <>
                               <th className="px-1 py-1.5 border-r border-slate-100 w-12">1</th>
                               <th className="px-1 py-1.5 border-r border-slate-100 w-12">2</th>
                               <th className="px-1 py-1.5 border-r border-slate-100 w-12">3</th>
                               <th className="px-1 py-1.5 border-r border-slate-100 w-12">4</th>
                               <th className="px-1 py-1.5 border-r border-slate-100 w-12">5</th>
                               <th className="px-1 py-1.5 border-r border-slate-100 w-12">6</th>
                               <th className="px-1.5 py-1.5 border-r border-slate-100 bg-slate-100/55 w-12">Total</th>
                               <th className="px-1.5 py-1.5 border-r border-slate-100 bg-slate-100/55 w-12">%</th>
                               <th className="px-1.5 py-1.5 border-r border-slate-100 w-16">Char</th>
                               <th className="px-1.5 py-1.5 border-r border-slate-100 w-12">Exam</th>
                               <th className="px-1.5 py-1.5 border-r border-slate-100 bg-slate-100/55 w-12">%</th>
                               <th className="px-2 py-1.5 border-r border-slate-200 bg-indigo-100/30 font-bold w-14 text-slate-800">Rating</th>
                             </>
                           )}

                           {/* Semi-Final sub-headers */}
                           {(viewMode === 'All' || viewMode === 'Semi-Final') && (
                             <>
                               <th className="px-1 py-1.5 border-r border-slate-100 w-12">1</th>
                               <th className="px-1 py-1.5 border-r border-slate-100 w-12">2</th>
                               <th className="px-1 py-1.5 border-r border-slate-100 w-12">3</th>
                               <th className="px-1 py-1.5 border-r border-slate-100 w-12">4</th>
                               <th className="px-1 py-1.5 border-r border-slate-100 w-12">5</th>
                               <th className="px-1 py-1.5 border-r border-slate-100 w-12">6</th>
                               <th className="px-1.5 py-1.5 border-r border-slate-100 bg-slate-100/55 w-12">Total</th>
                               <th className="px-1.5 py-1.5 border-r border-slate-100 bg-slate-100/55 w-12">%</th>
                               <th className="px-1.5 py-1.5 border-r border-slate-100 w-16">Char</th>
                               <th className="px-1.5 py-1.5 border-r border-slate-100 w-12">Exam</th>
                               <th className="px-1.5 py-1.5 border-r border-slate-100 bg-slate-100/55 w-12">%</th>
                               <th className="px-2 py-1.5 border-r border-slate-200 bg-amber-100/30 font-bold w-14 text-slate-800">Rating</th>
                             </>
                           )}

                           {/* Final sub-headers */}
                           {(viewMode === 'All' || viewMode === 'Final') && (
                             <>
                               <th className="px-1 py-1.5 border-r border-slate-100 w-12">1</th>
                               <th className="px-1 py-1.5 border-r border-slate-100 w-12">2</th>
                               <th className="px-1 py-1.5 border-r border-slate-100 w-12">3</th>
                               <th className="px-1 py-1.5 border-r border-slate-100 w-12">4</th>
                               <th className="px-1 py-1.5 border-r border-slate-100 w-12">5</th>
                               <th className="px-1 py-1.5 border-r border-slate-100 w-12">6</th>
                               <th className="px-1.5 py-1.5 border-r border-slate-100 bg-slate-100/55 w-12">Total</th>
                               <th className="px-1.5 py-1.5 border-r border-slate-100 bg-slate-100/55 w-12">%</th>
                               <th className="px-1.5 py-1.5 border-r border-slate-100 w-16">Char</th>
                               <th className="px-1.5 py-1.5 border-r border-slate-100 w-12">Exam</th>
                               <th className="px-1.5 py-1.5 border-r border-slate-100 bg-slate-100/55 w-12">%</th>
                               <th className="px-2 py-1.5 border-r border-slate-200 bg-orange-100/30 font-bold w-14 text-slate-800">Rating</th>
                             </>
                           )}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {/* 📐 Max Column Items Configuration Row */}
                        <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-750 font-semibold h-11 select-none">
                          <td className="px-2 py-3 border-r border-slate-200 bg-slate-50/80"></td>
                          <td className="px-2 py-3 border-r border-slate-200 bg-slate-50/80"></td>
                          <td className="px-4 py-3 text-left font-bold text-slate-800 sticky left-0 bg-slate-50 border-r border-slate-200 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                            <div className="flex items-center gap-1 text-sage-800 font-bold uppercase tracking-wider text-[10px]">
                              📐 Max Column Items
                            </div>
                          </td>

                          {/* Prelim Period */}
                          {(viewMode === 'All' || viewMode === 'Prelim') && (
                            <>
                              <td 
                                onClick={isPrelimLocked ? undefined : () => setEditingColumn({ period: 'Prelim', key: 'act1', label: 'Formative Assessment 1', value: maxItems.Prelim.act1 })} 
                                className={`p-1 border-r border-slate-100 w-12 text-center font-mono text-xs font-bold transition-colors ${
                                  isPrelimLocked 
                                    ? 'bg-slate-100/50 text-slate-400' 
                                    : 'bg-sky-50/30 hover:bg-sky-100/50 hover:text-sky-900 cursor-pointer text-slate-800'
                                }`}
                              >
                                {maxItems.Prelim.act1}
                              </td>
                              <td 
                                onClick={isPrelimLocked ? undefined : () => setEditingColumn({ period: 'Prelim', key: 'act2', label: 'Formative Assessment 2', value: maxItems.Prelim.act2 })} 
                                className={`p-1 border-r border-slate-100 w-12 text-center font-mono text-xs font-bold transition-colors ${
                                  isPrelimLocked 
                                    ? 'bg-slate-100/50 text-slate-400' 
                                    : 'bg-sky-50/30 hover:bg-sky-100/50 hover:text-sky-900 cursor-pointer text-slate-800'
                                }`}
                              >
                                {maxItems.Prelim.act2}
                              </td>
                              <td 
                                onClick={isPrelimLocked ? undefined : () => setEditingColumn({ period: 'Prelim', key: 'act3', label: 'Formative Assessment 3', value: maxItems.Prelim.act3 })} 
                                className={`p-1 border-r border-slate-100 w-12 text-center font-mono text-xs font-bold transition-colors ${
                                  isPrelimLocked 
                                    ? 'bg-slate-100/50 text-slate-400' 
                                    : 'bg-sky-50/30 hover:bg-sky-100/50 hover:text-sky-900 cursor-pointer text-slate-800'
                                }`}
                              >
                                {maxItems.Prelim.act3}
                              </td>
                              <td 
                                onClick={isPrelimLocked ? undefined : () => setEditingColumn({ period: 'Prelim', key: 'act4', label: 'Formative Assessment 4', value: maxItems.Prelim.act4 })} 
                                className={`p-1 border-r border-slate-100 w-12 text-center font-mono text-xs font-bold transition-colors ${
                                  isPrelimLocked 
                                    ? 'bg-slate-100/50 text-slate-400' 
                                    : 'bg-sky-50/30 hover:bg-sky-100/50 hover:text-sky-955 cursor-pointer text-slate-800'
                                }`}
                              >
                                {maxItems.Prelim.act4}
                              </td>
                              <td 
                                onClick={isPrelimLocked ? undefined : () => setEditingColumn({ period: 'Prelim', key: 'act5', label: 'Formative Assessment 5', value: maxItems.Prelim.act5 })} 
                                className={`p-1 border-r border-slate-100 w-12 text-center font-mono text-xs font-bold transition-colors ${
                                  isPrelimLocked 
                                    ? 'bg-slate-100/50 text-slate-400' 
                                    : 'bg-sky-50/30 hover:bg-sky-100/50 hover:text-sky-900 cursor-pointer text-slate-800'
                                }`}
                              >
                                {maxItems.Prelim.act5}
                              </td>
                              <td 
                                onClick={isPrelimLocked ? undefined : () => setEditingColumn({ period: 'Prelim', key: 'act6', label: 'Formative Assessment 6', value: maxItems.Prelim.act6 })} 
                                className={`p-1 border-r border-slate-100 w-12 text-center font-mono text-xs font-bold transition-colors ${
                                  isPrelimLocked 
                                    ? 'bg-slate-100/50 text-slate-400' 
                                    : 'bg-sky-50/30 hover:bg-sky-100/50 hover:text-sky-900 cursor-pointer text-slate-800'
                                }`}
                              >
                                {maxItems.Prelim.act6}
                              </td>
                              <td className="px-1.5 py-3 font-mono font-bold bg-slate-100/80 border-r border-slate-200 text-slate-700 w-12 text-center text-[10px]">
                                {maxItems.Prelim.act1 + maxItems.Prelim.act2 + maxItems.Prelim.act3 + maxItems.Prelim.act4 + maxItems.Prelim.act5 + maxItems.Prelim.act6}
                              </td>
                              <td className="px-1.5 py-3 font-mono text-[9px] bg-slate-100/50 border-r border-slate-200 text-slate-400 w-12 text-center">50%</td>
                              <td className="p-1 border-r border-slate-100 w-16 bg-slate-100/50 text-center font-mono text-xs font-bold text-slate-400">
                                {maxItems.Prelim.char}
                              </td>
                              <td 
                                onClick={isPrelimLocked ? undefined : () => setEditingColumn({ period: 'Prelim', key: 'exam', label: 'Exam Max Score', value: maxItems.Prelim.exam })} 
                                className={`p-1 border-r border-slate-100 w-12 text-center font-mono text-xs font-bold transition-colors ${
                                  isPrelimLocked 
                                    ? 'bg-slate-100/50 text-slate-400' 
                                    : 'bg-sky-50/30 hover:bg-sky-100/50 hover:text-sky-900 cursor-pointer text-slate-800'
                                }`}
                              >
                                {maxItems.Prelim.exam}
                              </td>
                              <td className="px-1.5 py-3 font-mono text-[9px] bg-slate-100/50 border-r border-slate-200 text-slate-400 w-12 text-center">40%</td>
                              <td className="px-2 py-3 font-mono font-bold bg-sky-100/80 border-r border-slate-200 text-sky-900 w-14 text-center text-[10px]">100%</td>
                            </>
                          )}

                          {/* Midterm Period */}
                          {(viewMode === 'All' || viewMode === 'Midterm') && (
                            <>
                              <td 
                                onClick={isMidtermLocked ? undefined : () => setEditingColumn({ period: 'Midterm', key: 'act1', label: 'Formative Assessment 1', value: maxItems.Midterm.act1 })} 
                                className={`p-1 border-r border-slate-100 w-12 text-center font-mono text-xs font-bold transition-colors ${
                                  isMidtermLocked 
                                    ? 'bg-slate-100/50 text-slate-400' 
                                    : 'bg-indigo-50/30 hover:bg-indigo-100/55 hover:text-indigo-900 cursor-pointer text-slate-800'
                                }`}
                              >
                                {maxItems.Midterm.act1}
                              </td>
                              <td 
                                onClick={isMidtermLocked ? undefined : () => setEditingColumn({ period: 'Midterm', key: 'act2', label: 'Formative Assessment 2', value: maxItems.Midterm.act2 })} 
                                className={`p-1 border-r border-slate-100 w-12 text-center font-mono text-xs font-bold transition-colors ${
                                  isMidtermLocked 
                                    ? 'bg-slate-100/50 text-slate-400' 
                                    : 'bg-indigo-50/30 hover:bg-indigo-100/55 hover:text-indigo-900 cursor-pointer text-slate-800'
                                }`}
                              >
                                {maxItems.Midterm.act2}
                              </td>
                              <td 
                                onClick={isMidtermLocked ? undefined : () => setEditingColumn({ period: 'Midterm', key: 'act3', label: 'Formative Assessment 3', value: maxItems.Midterm.act3 })} 
                                className={`p-1 border-r border-slate-100 w-12 text-center font-mono text-xs font-bold transition-colors ${
                                  isMidtermLocked 
                                    ? 'bg-slate-100/50 text-slate-400' 
                                    : 'bg-indigo-50/30 hover:bg-indigo-100/55 hover:text-indigo-900 cursor-pointer text-slate-800'
                                }`}
                              >
                                {maxItems.Midterm.act3}
                              </td>
                              <td 
                                onClick={isMidtermLocked ? undefined : () => setEditingColumn({ period: 'Midterm', key: 'act4', label: 'Formative Assessment 4', value: maxItems.Midterm.act4 })} 
                                className={`p-1 border-r border-slate-100 w-12 text-center font-mono text-xs font-bold transition-colors ${
                                  isMidtermLocked 
                                    ? 'bg-slate-100/50 text-slate-400' 
                                    : 'bg-indigo-50/30 hover:bg-indigo-100/55 hover:text-indigo-900 cursor-pointer text-slate-800'
                                }`}
                              >
                                {maxItems.Midterm.act4}
                              </td>
                              <td 
                                onClick={isMidtermLocked ? undefined : () => setEditingColumn({ period: 'Midterm', key: 'act5', label: 'Formative Assessment 5', value: maxItems.Midterm.act5 })} 
                                className={`p-1 border-r border-slate-100 w-12 text-center font-mono text-xs font-bold transition-colors ${
                                  isMidtermLocked 
                                    ? 'bg-slate-100/50 text-slate-400' 
                                    : 'bg-indigo-50/30 hover:bg-indigo-100/55 hover:text-indigo-900 cursor-pointer text-slate-800'
                                }`}
                              >
                                {maxItems.Midterm.act5}
                              </td>
                              <td 
                                onClick={isMidtermLocked ? undefined : () => setEditingColumn({ period: 'Midterm', key: 'act6', label: 'Formative Assessment 6', value: maxItems.Midterm.act6 })} 
                                className={`p-1 border-r border-slate-100 w-12 text-center font-mono text-xs font-bold transition-colors ${
                                  isMidtermLocked 
                                    ? 'bg-slate-100/50 text-slate-400' 
                                    : 'bg-indigo-50/30 hover:bg-indigo-100/55 hover:text-indigo-900 cursor-pointer text-slate-800'
                                }`}
                              >
                                {maxItems.Midterm.act6}
                              </td>
                              <td className="px-1.5 py-3 font-mono font-bold bg-slate-100/80 border-r border-slate-200 text-slate-700 w-12 text-center text-[10px]">
                                {maxItems.Midterm.act1 + maxItems.Midterm.act2 + maxItems.Midterm.act3 + maxItems.Midterm.act4 + maxItems.Midterm.act5 + maxItems.Midterm.act6}
                              </td>
                              <td className="px-1.5 py-3 font-mono text-[9px] bg-slate-100/50 border-r border-slate-200 text-slate-400 w-12 text-center">50%</td>
                              <td className="p-1 border-r border-slate-100 w-16 bg-slate-100/50 text-center font-mono text-xs font-bold text-slate-400">
                                {maxItems.Midterm.char}
                              </td>
                              <td 
                                onClick={isMidtermLocked ? undefined : () => setEditingColumn({ period: 'Midterm', key: 'exam', label: 'Exam Max Score', value: maxItems.Midterm.exam })} 
                                className={`p-1 border-r border-slate-100 w-12 text-center font-mono text-xs font-bold transition-colors ${
                                  isMidtermLocked 
                                    ? 'bg-slate-100/50 text-slate-400' 
                                    : 'bg-indigo-50/30 hover:bg-indigo-100/55 hover:text-indigo-900 cursor-pointer text-slate-800'
                                }`}
                              >
                                {maxItems.Midterm.exam}
                              </td>
                              <td className="px-1.5 py-3 font-mono text-[9px] bg-slate-100/50 border-r border-slate-200 text-slate-400 w-12 text-center">40%</td>
                              <td className="px-2 py-3 font-mono font-bold bg-indigo-100/80 border-r border-slate-200 text-indigo-900 w-14 text-center text-[10px]">100%</td>
                            </>
                          )}

                          {/* Midterm Rating (MR) */}
                          {(viewMode === 'All' || viewMode === 'Midterm') && (
                            <td className="px-3 py-3 border-r border-slate-200 bg-indigo-100/40 text-center"></td>
                          )}

                          {/* Semi-Final Period */}
                          {(viewMode === 'All' || viewMode === 'Semi-Final') && (
                            <>
                              <td 
                                onClick={isSemiFinalLocked ? undefined : () => setEditingColumn({ period: 'Semi-Final', key: 'act1', label: 'Formative Assessment 1', value: maxItems['Semi-Final'].act1 })} 
                                className={`p-1 border-r border-slate-100 w-12 text-center font-mono text-xs font-bold transition-colors ${
                                  isSemiFinalLocked 
                                    ? 'bg-slate-100/50 text-slate-400' 
                                    : 'bg-amber-50/30 hover:bg-amber-100/50 hover:text-amber-900 cursor-pointer text-slate-800'
                                }`}
                              >
                                {maxItems['Semi-Final'].act1}
                              </td>
                              <td 
                                onClick={isSemiFinalLocked ? undefined : () => setEditingColumn({ period: 'Semi-Final', key: 'act2', label: 'Formative Assessment 2', value: maxItems['Semi-Final'].act2 })} 
                                className={`p-1 border-r border-slate-100 w-12 text-center font-mono text-xs font-bold transition-colors ${
                                  isSemiFinalLocked 
                                    ? 'bg-slate-100/50 text-slate-400' 
                                    : 'bg-amber-50/30 hover:bg-amber-100/50 hover:text-amber-900 cursor-pointer text-slate-800'
                                }`}
                              >
                                {maxItems['Semi-Final'].act2}
                              </td>
                              <td 
                                onClick={isSemiFinalLocked ? undefined : () => setEditingColumn({ period: 'Semi-Final', key: 'act3', label: 'Formative Assessment 3', value: maxItems['Semi-Final'].act3 })} 
                                className={`p-1 border-r border-slate-100 w-12 text-center font-mono text-xs font-bold transition-colors ${
                                  isSemiFinalLocked 
                                    ? 'bg-slate-100/50 text-slate-400' 
                                    : 'bg-amber-50/30 hover:bg-amber-100/50 hover:text-amber-900 cursor-pointer text-slate-800'
                                }`}
                              >
                                {maxItems['Semi-Final'].act3}
                              </td>
                              <td 
                                onClick={isSemiFinalLocked ? undefined : () => setEditingColumn({ period: 'Semi-Final', key: 'act4', label: 'Formative Assessment 4', value: maxItems['Semi-Final'].act4 })} 
                                className={`p-1 border-r border-slate-100 w-12 text-center font-mono text-xs font-bold transition-colors ${
                                  isSemiFinalLocked 
                                    ? 'bg-slate-100/50 text-slate-400' 
                                    : 'bg-amber-50/30 hover:bg-amber-100/50 hover:text-amber-900 cursor-pointer text-slate-800'
                                }`}
                              >
                                {maxItems['Semi-Final'].act4}
                              </td>
                              <td 
                                onClick={isSemiFinalLocked ? undefined : () => setEditingColumn({ period: 'Semi-Final', key: 'act5', label: 'Formative Assessment 5', value: maxItems['Semi-Final'].act5 })} 
                                className={`p-1 border-r border-slate-100 w-12 text-center font-mono text-xs font-bold transition-colors ${
                                  isSemiFinalLocked 
                                    ? 'bg-slate-100/50 text-slate-400' 
                                    : 'bg-amber-50/30 hover:bg-amber-100/50 hover:text-amber-900 cursor-pointer text-slate-800'
                                }`}
                              >
                                {maxItems['Semi-Final'].act5}
                              </td>
                              <td 
                                onClick={isSemiFinalLocked ? undefined : () => setEditingColumn({ period: 'Semi-Final', key: 'act6', label: 'Formative Assessment 6', value: maxItems['Semi-Final'].act6 })} 
                                className={`p-1 border-r border-slate-100 w-12 text-center font-mono text-xs font-bold transition-colors ${
                                  isSemiFinalLocked 
                                    ? 'bg-slate-100/50 text-slate-400' 
                                    : 'bg-amber-50/30 hover:bg-amber-100/50 hover:text-amber-900 cursor-pointer text-slate-800'
                                }`}
                              >
                                {maxItems['Semi-Final'].act6}
                              </td>
                              <td className="px-1.5 py-3 font-mono font-bold bg-slate-100/80 border-r border-slate-200 text-slate-700 w-12 text-center text-[10px]">
                                {maxItems['Semi-Final'].act1 + maxItems['Semi-Final'].act2 + maxItems['Semi-Final'].act3 + maxItems['Semi-Final'].act4 + maxItems['Semi-Final'].act5 + maxItems['Semi-Final'].act6}
                              </td>
                              <td className="px-1.5 py-3 font-mono text-[9px] bg-slate-100/50 border-r border-slate-200 text-slate-400 w-12 text-center">50%</td>
                              <td className="p-1 border-r border-slate-100 w-16 bg-slate-100/50 text-center font-mono text-xs font-bold text-slate-400">
                                {maxItems['Semi-Final'].char}
                              </td>
                              <td 
                                onClick={isSemiFinalLocked ? undefined : () => setEditingColumn({ period: 'Semi-Final', key: 'exam', label: 'Exam Max Score', value: maxItems['Semi-Final'].exam })} 
                                className={`p-1 border-r border-slate-100 w-12 text-center font-mono text-xs font-bold transition-colors ${
                                  isSemiFinalLocked 
                                    ? 'bg-slate-100/50 text-slate-400' 
                                    : 'bg-amber-50/30 hover:bg-amber-100/50 hover:text-amber-900 cursor-pointer text-slate-800'
                                }`}
                              >
                                {maxItems['Semi-Final'].exam}
                              </td>
                              <td className="px-1.5 py-3 font-mono text-[9px] bg-slate-100/50 border-r border-slate-200 text-slate-400 w-12 text-center">40%</td>
                              <td className="px-2 py-3 font-mono font-bold bg-amber-100/80 border-r border-slate-200 text-amber-900 w-14 text-center text-[10px]">100%</td>
                            </>
                          )}

                          {/* Final Period */}
                          {(viewMode === 'All' || viewMode === 'Final') && (
                            <>
                              <td 
                                onClick={isFinalLocked ? undefined : () => setEditingColumn({ period: 'Final', key: 'act1', label: 'Formative Assessment 1', value: maxItems.Final.act1 })} 
                                className={`p-1 border-r border-slate-100 w-12 text-center font-mono text-xs font-bold transition-colors ${
                                  isFinalLocked 
                                    ? 'bg-slate-100/50 text-slate-400' 
                                    : 'bg-orange-50/30 hover:bg-orange-100/50 hover:text-orange-900 cursor-pointer text-slate-800'
                                }`}
                              >
                                {maxItems.Final.act1}
                              </td>
                              <td 
                                onClick={isFinalLocked ? undefined : () => setEditingColumn({ period: 'Final', key: 'act2', label: 'Formative Assessment 2', value: maxItems.Final.act2 })} 
                                className={`p-1 border-r border-slate-100 w-12 text-center font-mono text-xs font-bold transition-colors ${
                                  isFinalLocked 
                                    ? 'bg-slate-100/50 text-slate-400' 
                                    : 'bg-orange-50/30 hover:bg-orange-100/50 hover:text-orange-900 cursor-pointer text-slate-800'
                                }`}
                              >
                                {maxItems.Final.act2}
                              </td>
                              <td 
                                onClick={isFinalLocked ? undefined : () => setEditingColumn({ period: 'Final', key: 'act3', label: 'Formative Assessment 3', value: maxItems.Final.act3 })} 
                                className={`p-1 border-r border-slate-100 w-12 text-center font-mono text-xs font-bold transition-colors ${
                                  isFinalLocked 
                                    ? 'bg-slate-100/50 text-slate-400' 
                                    : 'bg-orange-50/30 hover:bg-orange-100/50 hover:text-orange-900 cursor-pointer text-slate-800'
                                }`}
                              >
                                {maxItems.Final.act3}
                              </td>
                              <td 
                                onClick={isFinalLocked ? undefined : () => setEditingColumn({ period: 'Final', key: 'act4', label: 'Formative Assessment 4', value: maxItems.Final.act4 })} 
                                className={`p-1 border-r border-slate-100 w-12 text-center font-mono text-xs font-bold transition-colors ${
                                  isFinalLocked 
                                    ? 'bg-slate-100/50 text-slate-400' 
                                    : 'bg-orange-50/30 hover:bg-orange-100/50 hover:text-orange-900 cursor-pointer text-slate-800'
                                }`}
                              >
                                {maxItems.Final.act4}
                              </td>
                              <td 
                                onClick={isFinalLocked ? undefined : () => setEditingColumn({ period: 'Final', key: 'act5', label: 'Formative Assessment 5', value: maxItems.Final.act5 })} 
                                className={`p-1 border-r border-slate-100 w-12 text-center font-mono text-xs font-bold transition-colors ${
                                  isFinalLocked 
                                    ? 'bg-slate-100/50 text-slate-400' 
                                    : 'bg-orange-50/30 hover:bg-orange-100/50 hover:text-orange-900 cursor-pointer text-slate-800'
                                }`}
                              >
                                {maxItems.Final.act5}
                              </td>
                              <td 
                                onClick={isFinalLocked ? undefined : () => setEditingColumn({ period: 'Final', key: 'act6', label: 'Formative Assessment 6', value: maxItems.Final.act6 })} 
                                className={`p-1 border-r border-slate-100 w-12 text-center font-mono text-xs font-bold transition-colors ${
                                  isFinalLocked 
                                    ? 'bg-slate-100/50 text-slate-400' 
                                    : 'bg-orange-50/30 hover:bg-orange-100/50 hover:text-orange-900 cursor-pointer text-slate-800'
                                }`}
                              >
                                {maxItems.Final.act6}
                              </td>
                              <td className="px-1.5 py-3 font-mono font-bold bg-slate-100/80 border-r border-slate-200 text-slate-700 w-12 text-center text-[10px]">
                                {maxItems.Final.act1 + maxItems.Final.act2 + maxItems.Final.act3 + maxItems.Final.act4 + maxItems.Final.act5 + maxItems.Final.act6}
                              </td>
                              <td className="px-1.5 py-3 font-mono text-[9px] bg-slate-100/50 border-r border-slate-200 text-slate-400 w-12 text-center">50%</td>
                              <td className="p-1 border-r border-slate-100 w-16 bg-slate-100/50 text-center font-mono text-xs font-bold text-slate-400">
                                {maxItems.Final.char}
                              </td>
                              <td 
                                onClick={isFinalLocked ? undefined : () => setEditingColumn({ period: 'Final', key: 'exam', label: 'Exam Max Score', value: maxItems.Final.exam })} 
                                className={`p-1 border-r border-slate-100 w-12 text-center font-mono text-xs font-bold transition-colors ${
                                  isFinalLocked 
                                    ? 'bg-slate-100/50 text-slate-400' 
                                    : 'bg-orange-50/30 hover:bg-orange-100/50 hover:text-orange-900 cursor-pointer text-slate-800'
                                }`}
                              >
                                {maxItems.Final.exam}
                              </td>
                              <td className="px-1.5 py-3 font-mono text-[9px] bg-slate-100/50 border-r border-slate-200 text-slate-400 w-12 text-center">40%</td>
                              <td className="px-2 py-3 font-mono font-bold bg-orange-100/80 border-r border-slate-200 text-orange-900 w-14 text-center text-[10px]">100%</td>
                            </>
                          )}

                          {/* Final calculations placeholders */}
                          {(viewMode === 'All' || viewMode === 'Final') && (
                            <>
                              <td className="px-3 py-3 border-r border-slate-200 bg-orange-100/40 text-center"></td>
                              <td className="px-3 py-3 border-r border-slate-200 bg-emerald-50/40 text-center"></td>
                              <td className="px-3 py-3 border-r border-slate-200 bg-emerald-100/40 text-center"></td>
                              <td className="px-4 py-3 border-r border-slate-200 bg-emerald-100/40 text-center"></td>
                            </>
                          )}
                        </tr>

                        {students.map((student, idx) => (
                          <StudentRow 
                            key={student.id} 
                            student={student} 
                            rowNo={idx + 1}
                            initialPeriods={{
                              Prelim: {},
                              Midterm: {},
                              'Semi-Final': {},
                              Final: {}
                            }}
                            viewMode={viewMode}
                            classCode={classRecordId}
                            maxItems={maxItems}
                            lockedMilestones={lockedMilestones}
                          />
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
        
      </div>

      {/* 📐 Update Column Maximum Score Modal */}
      {editingColumn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 font-sans">
                <span>📐 Update Column Maximum Score</span>
              </h3>
              <button 
                onClick={() => setEditingColumn(null)}
                className="text-slate-400 hover:text-slate-650 transition-colors text-lg font-semibold"
              >
                &times;
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Grading Term & Column</p>
                <p className="text-sm font-bold text-slate-800 mt-1">
                  {editingColumn.period} Period — {editingColumn.label}
                </p>
              </div>
              
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Maximum Points</label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="1"
                    max="500"
                    autoFocus
                    defaultValue={editingColumn.value}
                    id="max-items-modal-input"
                    className="block w-28 border border-slate-200 rounded-lg px-3.5 py-2 text-sm font-mono text-center font-bold text-slate-800 focus:ring-1 focus:ring-sage-500 focus:border-sage-500 transition-all outline-none"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const val = Number(e.currentTarget.value);
                        if (val > 0) handleConfirmMaxItem(val);
                      }
                    }}
                  />
                  <span className="text-xs text-slate-500 font-semibold font-mono">pts</span>
                </div>
              </div>
              
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-[11px] text-amber-800 leading-relaxed">
                <strong>⚠️ Warning:</strong> Confirming this change will instantly update the maximum score for this column and immediately recalculate the grades and ratings of all enrolled students.
              </div>
            </div>
            
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditingColumn(null)}
                className="px-4 py-2 text-xs font-semibold border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const input = document.getElementById('max-items-modal-input');
                  if (input) {
                    const val = Number(input.value);
                    if (val > 0) handleConfirmMaxItem(val);
                  }
                }}
                className="px-4 py-2 text-xs font-semibold bg-sage-600 hover:bg-sage-700 text-white rounded-lg transition-colors shadow-sm"
              >
                Confirm & Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 📊 Export Excel Metadata Prompt Modal */}
      <ExportPreviewModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        classInfo={classInfo}
        students={compileStudentsWithGrades()}
        maxItems={maxItems}
        metadata={exportMetadata}
        onMetadataChange={(updated) => setExportMetadata(prev => ({ ...prev, ...updated }))}
        onExportExcel={handleExportExcel}
        onExportPdf={handleExportPdf}
      />

      {/* 🔒 Post Grades Term Picker and Confirmation Modal */}
      {showPostModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 font-sans">
                <Lock className="h-4 w-4 text-emerald-600" />
                <span>Post Semestral Grades</span>
              </h3>
              <button 
                onClick={() => setShowPostModal(false)}
                className="text-slate-400 hover:text-slate-650 transition-colors text-lg font-semibold"
              >
                &times;
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-[11px] text-amber-800 leading-relaxed space-y-2">
                <p><strong>⚠️ Action is irreversible:</strong> Finalizing and posting will lock this class record across all periods (Prelim, Midterm, Semi-Final, and Final).</p>
                <p>The grades will be officially posted to the Dean's Office and released to students. Any subsequent adjustments will require formal Dean override approval.</p>
              </div>
            </div>
            
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowPostModal(false)}
                className="px-4 py-2 text-xs font-semibold border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors font-sans"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={postingGrades}
                onClick={handlePostGrades}
                className="px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors shadow-sm flex items-center gap-1.5 font-sans disabled:opacity-50"
              >
                {postingGrades ? 'Posting...' : 'Confirm & Post'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shared Success Popup Modal */}
      {showPopup && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl border border-slate-100 flex flex-col items-center text-center space-y-4 animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
              <Check className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-slate-900 font-display">{popupTitle}</h3>
              <p className="text-xs text-slate-500">{popupDesc}</p>
            </div>
            <button
              onClick={() => setShowPopup(false)}
              className="w-full py-2 bg-sage-600 hover:bg-sage-700 text-white font-medium text-sm rounded-xl transition-colors shadow-sm font-sans"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </>
  );
}
