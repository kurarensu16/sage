import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import StudentRow from '../../components/StudentRow';
import { 
  ChevronRight, 
  ChevronDown,
  Lock, 
  Search, 
  Download, 
  FileSpreadsheet, 
  AlertTriangle,
  Maximize2,
  Minimize2,
  MessageSquare,
  Send,
  X,
  Check,
  Paperclip,
  Edit3
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { logActivity, resolveActorName } from '../../lib/auditLog';
import { triggerExcelExport } from '../../lib/excelExport';
import ExportPreviewModal from '../../components/ExportPreviewModal';
import html2pdf from 'html2pdf.js';

export default function PostedGradesView() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();
  const classRecordId = new URLSearchParams(location.search).get('id');
  const autoExport = new URLSearchParams(location.search).get('export') === '1';

  const [classInfo, setClassInfo] = useState(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [lockedMilestones, setLockedMilestones] = useState([]);
  const [unlockRequests, setUnlockRequests] = useState([]);
  const [viewMode, setViewMode] = useState('All');
  
  const isSummer = classInfo?.semester === 'Summer';
  const periodsList = isSummer ? ['Midterm', 'Final'] : ['Prelim', 'Midterm', 'Semi-Final', 'Final'];

  const [activities, setActivities] = useState({
    Prelim: [
      { id: 'act1', name: 'FA 1', max: 20 },
      { id: 'act2', name: 'FA 2', max: 20 },
      { id: 'act3', name: 'FA 3', max: 20 },
      { id: 'act4', name: 'FA 4', max: 20 },
      { id: 'act5', name: 'FA 5', max: 20 },
      { id: 'act6', name: 'FA 6', max: 10 }
    ],
    Midterm: [
      { id: 'act1', name: 'FA 1', max: 20 },
      { id: 'act2', name: 'FA 2', max: 20 },
      { id: 'act3', name: 'FA 3', max: 20 },
      { id: 'act4', name: 'FA 4', max: 20 },
      { id: 'act5', name: 'FA 5', max: 20 },
      { id: 'act6', name: 'FA 6', max: 10 }
    ],
    'Semi-Final': [
      { id: 'act1', name: 'FA 1', max: 20 },
      { id: 'act2', name: 'FA 2', max: 20 },
      { id: 'act3', name: 'FA 3', max: 20 },
      { id: 'act4', name: 'FA 4', max: 20 },
      { id: 'act5', name: 'FA 5', max: 20 },
      { id: 'act6', name: 'FA 6', max: 10 }
    ],
    Final: [
      { id: 'act1', name: 'FA 1', max: 20 },
      { id: 'act2', name: 'FA 2', max: 20 },
      { id: 'act3', name: 'FA 3', max: 20 },
      { id: 'act4', name: 'FA 4', max: 20 },
      { id: 'act5', name: 'FA 5', max: 20 },
      { id: 'act6', name: 'FA 6', max: 10 }
    ]
  });

  // Success modals
  const [showPopup, setShowPopup] = useState(false);
  const [popupTitle, setPopupTitle] = useState('');
  const [popupDesc, setPopupDesc] = useState('');

  // Remark override request modal state
  const [showRemarkModal, setShowRemarkModal] = useState(false);
  const [remarkReqStudent, setRemarkReqStudent] = useState('');
  const [remarkReqStudentId, setRemarkReqStudentId] = useState('');
  const [remarkReqFrom, setRemarkReqFrom] = useState('Failed');
  const [remarkReqTo, setRemarkReqTo] = useState('INC');
  const [remarkReqNote, setRemarkReqNote] = useState('');
  const [evidenceFileName, setEvidenceFileName] = useState('');
  const [remarkReqSent, setRemarkReqSent] = useState(false);

  // Maximum items configuration for activities and exams per period
  const [maxItems, setMaxItems] = useState({
    Prelim: { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, char: 100, exam: 40 },
    Midterm: { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, char: 100, exam: 40 },
    'Semi-Final': { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, char: 100, exam: 40 },
    Final: { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, char: 100, exam: 40 }
  });

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

  // Auto-open export modal when navigated with ?export=1
  useEffect(() => {
    if (autoExport && !loading && classInfo && students.length > 0) {
      setShowExportModal(true);
    }
  }, [autoExport, loading, classInfo, students]);

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
    };
    const exporter = typeof html2pdf === 'function' ? html2pdf : (html2pdf && html2pdf.default ? html2pdf.default : html2pdf);
    exporter().from(cloned).set(opt).save();
  };



  useEffect(() => {
    async function loadPostedGradesData() {
      if (!classRecordId || !user) return;
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
            subjects ( 
              code, 
              name, 
              units, 
              computation_id,
              departments ( name ) 
            ),
            sections ( name )
          `)
          .eq('class_record_id', classRecordId)
          .single();

        if (crErr) throw crErr;

        // Fetch computation template separately if subject has computation_id
        if (cr?.subjects?.computation_id) {
          try {
            const { data: compData } = await supabase
              .from('grade_computations')
              .select('name, description, grade_computation_components ( * )')
              .eq('computation_id', cr.subjects.computation_id)
              .maybeSingle();

            if (compData && cr.subjects) {
              cr.subjects.grade_computations = compData;
            }
          } catch (compErr) {
            console.warn('Could not fetch grade_computations for subject:', compErr);
          }
        }

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

        // Seed activities state from grade computations components if exists
        const compList = cr.subjects?.grade_computations?.grade_computation_components || [];
        const dynamicComps = compList.filter(c => c.is_multiple);
        
        if (dynamicComps.length > 0) {
          const loadedActivities = {};
          const isSummer = cr.semester === 'Summer';
          const periodsList = isSummer ? ['Midterm', 'Final'] : ['Prelim', 'Midterm', 'Semi-Final', 'Final'];
          periodsList.forEach(t => {
            loadedActivities[t] = dynamicComps.map((c, index) => ({
              id: `act${index + 1}`,
              name: c.name,
              max: parseFloat(c.max_score) || 20
            }));
          });
          setActivities(loadedActivities);
        }
        
        // Fetch dynamic custom activities from Supabase class_activities table
        try {
          const { data: dbActs } = await supabase
            .from('class_activities')
            .select('*')
            .eq('class_record_id', classRecordId)
            .order('created_at', { ascending: true });

          if (dbActs && dbActs.length > 0) {
            const loadedActivities = { Prelim: [], Midterm: [], 'Semi-Final': [], Final: [] };
            const isSummer = cr.semester === 'Summer';
            const periodsList = isSummer ? ['Midterm', 'Final'] : ['Prelim', 'Midterm', 'Semi-Final', 'Final'];
            periodsList.forEach(t => {
              const termActs = dbActs.filter(a => a.term === t);
              if (termActs.length > 0) {
                loadedActivities[t] = termActs.map(a => ({
                  id: a.activity_id,
                  name: a.name,
                  max: parseFloat(a.max_score) || 20
                }));
              } else if (dynamicComps.length > 0) {
                loadedActivities[t] = dynamicComps.map((c, index) => ({
                  id: `act${index + 1}`,
                  name: c.name,
                  max: parseFloat(c.max_score) || 20
                }));
              }
            });
            setActivities(loadedActivities);
          } else {
            // Restore custom activities from LocalStorage if not in DB
            const localActs = localStorage.getItem(`sage_activities_${classRecordId}`);
            if (localActs) {
              try {
                setActivities(JSON.parse(localActs));
              } catch {
                console.debug('Failed to parse cached activities');
              }
            }
          }
        } catch (actErr) {
          console.warn('Could not query class_activities, fallback to cache:', actErr);
          const localActs = localStorage.getItem(`sage_activities_${classRecordId}`);
          if (localActs) {
            try {
              setActivities(JSON.parse(localActs));
            } catch {
              console.debug('Failed to parse cached activities');
            }
          }
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
              remarksNote: ''
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
        });

        // 5. Fetch posted grades to check customRemarks/overrides and locked milestones
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
              remarksNote: ''
            };
          }
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

        // 6. Fetch unlock requests from database
        const { data: dbReqs } = await supabase
          .from('unlock_requests')
          .select('milestone, status')
          .eq('class_record_id', classRecordId);

        // Fetch unlock requests from localStorage (to merge/sync)
        const localReqs = JSON.parse(localStorage.getItem(`unlock_requests_${classRecordId}`) || '[]');
        const pendingSet = new Set(localReqs);
        (dbReqs || []).forEach(r => {
          if (r.status === 'pending') {
            pendingSet.add(r.milestone);
          } else {
            pendingSet.delete(r.milestone);
          }
        });
        setUnlockRequests(Array.from(pendingSet));

        // 7. Initialize local draft caches
        studentList.forEach(stud => {
          const STORAGE_KEY = `sage_scores_${classRecordId}_${stud.id}`;
          const existingDraft = localStorage.getItem(STORAGE_KEY);
          
          const dbData = scoresByStudent[stud.id] || {};
          let draftPayload = {};
          if (existingDraft) {
            try {
              draftPayload = JSON.parse(existingDraft);
            } catch {
              // Ignore invalid JSON in local storage
            }
          }
          
          const merged = {
            Prelim: { ...draftPayload.Prelim, ...dbData.Prelim },
            Midterm: { ...draftPayload.Midterm, ...dbData.Midterm },
            'Semi-Final': { ...draftPayload['Semi-Final'], ...dbData['Semi-Final'] },
            Final: { ...draftPayload.Final, ...dbData.Final },
            customRemarks: dbData.customRemarks || draftPayload.customRemarks || '',
            remarksNote: dbData.remarksNote || draftPayload.remarksNote || '',
            savedAt: new Date().toISOString()
          };
          
          localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        });

        const compiled = studentList.map(stud => {
          const dbData = scoresByStudent[stud.id] || {};
          const pgRow = (pgData || []).find(r => r.student_id === stud.id && r.grade_period === 'final');
          return {
            ...stud,
            customRemarks: dbData.customRemarks || '',
            remarksNote: dbData.remarksNote || '',
            computedGrade: pgRow ? pgRow.computed_grade : null,
            effectiveGrade: pgRow ? pgRow.effective_grade : null
          };
        });
        setStudents(compiled);

      } catch (err) {
        console.error('Error loading PostedGradesView data:', err);
      } finally {
        setLoading(false);
      }
    }

    loadPostedGradesData();
  }, [classRecordId, user]);

  const handleRequestUnlock = async (milestone) => {
    if (!classRecordId) return;

    try {
      // 1. Database: Insert to unlock_requests
      const { error } = await supabase
        .from('unlock_requests')
        .insert({
          class_record_id: classRecordId,
          milestone: milestone,
          requested_by: user.id,
          status: 'pending'
        });

      if (error) throw error;

      // 2. LocalStorage: Dual-write for Dean UI compatibility
      const localReqs = JSON.parse(localStorage.getItem(`unlock_requests_${classRecordId}`) || '[]');
      if (!localReqs.includes(milestone)) {
        localReqs.push(milestone);
        localStorage.setItem(`unlock_requests_${classRecordId}`, JSON.stringify(localReqs));
      }

      // Update state
      setUnlockRequests(prev => [...prev, milestone]);

      // 3. Log audit activity
      const actorName = resolveActorName(profile, user);
      await logActivity(
        'Unlock Request',
        `Requested unlock of ${milestone} milestone for subject ${classInfo?.subjects?.code}`,
        actorName
      );

      setPopupTitle('Unlock Requested');
      setPopupDesc(`Request to unlock ${milestone} has been sent to the Dean. Modifying scores will be enabled once approved.`);
      setShowPopup(true);
    } catch (err) {
      console.error('Error requesting milestone unlock:', err);
    }
  };

  const handleSubmitRemarkRequest = async () => {
    if (!remarkReqStudent || !remarkReqNote.trim() || !classRecordId) return;

    try {
      const selectedStud = students.find(s => s.id === remarkReqStudentId);
      const compGrade = selectedStud ? selectedStud.computedGrade : null;
      const effGrade = selectedStud ? selectedStud.effectiveGrade : null;

      const subjCode = classInfo?.subjects?.code || '';
      const subjName = classInfo?.subjects?.name || '';
      const sectName = classInfo?.sections?.name || '';
      const actorName = resolveActorName(profile, user);
      // 1. Database: Insert into remark_override_requests (primary store)
      const evidenceUrl = evidenceFileName ? `https://storage.sage.edu.ph/proofs/${evidenceFileName}` : null;
      const { data: rorRow, error: rorErr } = await supabase
        .from('remark_override_requests')
        .insert({
          class_record_id: classRecordId,
          student_id: remarkReqStudentId || null,
          requested_by: user.id,
          subject_name: `${subjCode} - ${subjName}`,
          section_name: sectName,
          faculty_name: actorName,
          computed_grade: compGrade,
          effective_grade: effGrade,
          current_remark: remarkReqFrom,
          requested_remark: 'Pending Edit',
          note: remarkReqNote,
          evidence_url: evidenceUrl,
          status: 'pending'
        })
        .select('request_id')
        .single();

      // 2. LocalStorage: Dual-write fallback for backward compatibility
      const existing = JSON.parse(localStorage.getItem('remark_override_requests') || '[]');
      const newReq = {
        request_id: rorRow?.request_id || `ror-${Date.now()}`,
        id: rorRow?.request_id || `ror-${Date.now()}`,
        class_record_id: classRecordId,
        classCode: classRecordId,
        student_id: remarkReqStudentId,
        studentId: remarkReqStudentId,
        student_name: remarkReqStudent,
        studentName: remarkReqStudent,
        subject_name: `${subjCode} - ${subjName}`,
        subjectName: `${subjCode} - ${subjName}`,
        section_name: sectName,
        section: sectName,
        faculty_name: actorName,
        facultyName: actorName,
        computed_grade: compGrade != null ? compGrade : 5.00,
        effective_grade: effGrade != null ? effGrade : 5.00,
        computedGrade: compGrade != null ? compGrade : '—',
        effectiveGrade: effGrade != null ? effGrade : '—',
        current_remark: remarkReqFrom,
        currentRemark: remarkReqFrom,
        requested_remark: remarkReqTo || 'Pending Edit',
        requestedRemark: remarkReqTo || 'Pending Edit',
        note: remarkReqNote,
        evidence_url: evidenceUrl,
        status: 'pending',
        requested_at: new Date().toISOString()
      };
      if (rorErr) {
        console.warn('DB insert failed, storing to localStorage only:', rorErr.message);
        existing.push(newReq);
        localStorage.setItem('remark_override_requests', JSON.stringify(existing));
      } else {
        existing.push(newReq);
        localStorage.setItem('remark_override_requests', JSON.stringify(existing));
      }

      // 4. Log activity
      await logActivity(
        'Remark Override Request',
        `Requested remark override for student ${remarkReqStudent} (${remarkReqFrom} -> ${remarkReqTo}) in ${subjCode}`,
        actorName
      );

      setRemarkReqSent(true);
      setTimeout(() => {
        setShowRemarkModal(false);
        setRemarkReqSent(false);
        setRemarkReqStudent('');
        setRemarkReqStudentId('');
        setRemarkReqNote('');
        setRemarkReqTo('INC');
        setPopupTitle('Override Submitted');
        setPopupDesc(`Remark change request for ${newReq.studentName} has been submitted to the Dean.`);
        setShowPopup(true);
      }, 1500);

    } catch (err) {
      console.error('Error submitting remark change request:', err);
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
          <p className="text-sm text-slate-500 font-medium font-sans">Loading locked grade logs...</p>
        </div>
      </div>
    );
  }

  const subjectCode = classInfo?.subjects?.code || '';
  const subjectName = classInfo?.subjects?.name || '';
  const sectionName = classInfo?.sections?.name || '';

  const filteredStudents = students.filter(student => 
    student.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <>
      <PageHeader title="View Posted Grades" breadcrumb="Faculty Portal">
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap sm:flex-nowrap">
          <button 
            onClick={() => navigate(`/faculty/scoreinput?id=${classRecordId}`)}
            className="px-2.5 sm:px-4 py-2 text-xs sm:text-sm font-semibold bg-sage-600 hover:bg-sage-700 text-white rounded-xl transition-all shadow-2xs flex items-center gap-1.5 font-sans cursor-pointer"
          >
            <Edit3 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Input Scores</span>
            <span className="sm:hidden">Scores</span>
          </button>
          <button 
            onClick={() => setShowExportModal(true)}
            className="px-2.5 sm:px-4 py-2 text-xs sm:text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-all shadow-2xs flex items-center gap-1.5 font-sans cursor-pointer"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Export Grades</span>
            <span className="sm:hidden">Export</span>
          </button>
          <button 
            onClick={handleExportPdf}
            className="px-2.5 sm:px-4 py-2 text-xs sm:text-sm font-semibold border border-slate-200 text-slate-700 hover:border-sage-300 rounded-xl transition-colors bg-white flex items-center gap-1.5 font-sans cursor-pointer shadow-2xs"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Export PDF</span>
            <span className="sm:hidden">PDF</span>
          </button>
        </div>
      </PageHeader>

      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-4 sm:space-y-6">
        
        {/* Navigation Breadcrumb */}
        <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-slate-500">
          <span className="hover:text-sage-600 cursor-pointer transition-colors" onClick={() => navigate('/faculty/classrecordslist')}>
            Class Records
          </span>
          <ChevronRight className="h-3 w-3 text-slate-400" />
          <span className="font-medium text-slate-900 truncate">{subjectCode} ({sectionName}) — Locked Grades</span>
        </div>

        {/* Dynamic Lock Alert Banner with Dean's Override Panel */}
        <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-3.5 sm:p-5 space-y-3.5 sm:space-y-4 shadow-2xs text-left">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-3 sm:gap-4">
            <div className="flex gap-3">
              <Lock className="h-5 w-5 text-slate-500 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-bold text-xs sm:text-sm text-slate-800">Class Record Registry Lock</h4>
                <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 leading-relaxed">
                  Active registry locks are applied dynamically based on posted term milestones. To modify locked records, Dean approval is required.
                </p>
                <div className="flex flex-wrap gap-2 mt-2.5 sm:mt-3">
                  {!(lockedMilestones.includes('Semestral Grade') || lockedMilestones.includes('Final')) ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-emerald-50 border border-emerald-250 text-emerald-700">
                      Draft Mode (Fully Editable)
                    </span>
                  ) : (
                    <div className="inline-flex items-center gap-2 bg-rose-50/50 border border-rose-200 rounded-xl p-1.5 pr-2.5">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-rose-50 border border-rose-200 text-rose-700 font-mono">
                        Semestral Grades Locked
                      </span>
                      {unlockRequests.includes('Semestral Grade') || unlockRequests.includes('Final') ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-bold bg-amber-50 border border-amber-250 text-amber-700">
                          Unlock Requested
                        </span>
                      ) : (
                        <button
                          onClick={() => handleRequestUnlock('Semestral Grade')}
                          className="px-2 py-0.5 text-[9px] font-bold bg-white border border-slate-200 hover:border-sage-300 text-slate-650 hover:text-sage-700 rounded-lg transition-colors outline-none cursor-pointer"
                        >
                          Request Unlock
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Request Remark Change button */}
            <button
              onClick={() => setShowRemarkModal(true)}
              className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-300 rounded-xl transition-colors shadow-2xs outline-none flex-shrink-0 font-sans cursor-pointer"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Request Remark Change
            </button>
          </div>
        </div>

        {/* Class Selection & Search Toolbar */}
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 sm:gap-4 p-3.5 sm:p-4 rounded-2xl border border-slate-200/90 bg-white shadow-2xs">
          {/* Class Record */}
          <div className="flex flex-col gap-1 flex-1 min-w-0">
            <label className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wider">Class Record</label>
            <div className="text-xs font-bold text-slate-800 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 truncate">
              {subjectCode} - {sectionName} ({subjectName})
            </div>
          </div>

          <div className="w-px h-10 bg-slate-200 hidden md:block"></div>

          {/* Search bar */}
          <div className="flex flex-col gap-1 min-w-[180px]">
            <label className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wider">Search Students</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                <Search className="h-3.5 w-3.5 text-slate-400" />
              </div>
              <input 
                type="text" 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl focus:ring-1 focus:ring-sage-500 focus:border-sage-500 text-xs font-semibold transition-colors outline-none bg-white text-slate-700 shadow-2xs" 
                placeholder="Search student name..." 
              />
            </div>
          </div>

          <div className="w-px h-10 bg-slate-200 hidden md:block"></div>

          {/* View Mode Selector */}
          <div className="flex flex-col gap-1 min-w-[180px]">
            <label className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wider">View Period</label>
            <div className="relative">
              <select
                value={viewMode}
                onChange={(e) => setViewMode(e.target.value)}
                className="appearance-none w-full bg-white border border-slate-200 hover:border-sage-300 px-3 py-2 pr-8 rounded-xl text-xs font-semibold focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none transition-all cursor-pointer text-slate-700 shadow-2xs"
              >
                <option value="All">All Terms (Side-by-Side)</option>
                {periodsList.includes('Prelim') && <option value="Prelim">Preliminary Grade (Only)</option>}
                {periodsList.includes('Midterm') && <option value="Midterm">Midterm Grade (Only)</option>}
                {periodsList.includes('Semi-Final') && <option value="Semi-Final">Semi-Final Grade (Only)</option>}
                {periodsList.includes('Final') && <option value="Final">Final Grade (Only)</option>}
                <option value="MidtermBatch">Midterm Evaluation (Prelim & Midterm)</option>
                <option value="FinalBatch">Final Evaluation (Semis & Finals)</option>
                <option value="Summary">Semestral Grade Summary</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* ── Mobile Student Grades Card Feed (md:hidden) ─────────────────── */}
        <div className="md:hidden space-y-3">
          {filteredStudents.map((student, idx) => {
            const effGwa = student.effectiveGrade != null ? Number(student.effectiveGrade) : null;
            const remarkText = student.customRemarks || (effGwa && effGwa <= 3.00 ? 'Passed' : 'Failed');
            const isPassed = remarkText.toLowerCase() === 'passed';

            return (
              <div key={student.id} className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-3.5 space-y-3 text-left">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-bold text-slate-400">#{idx + 1}</span>
                      <span className="font-bold text-slate-900 font-display text-xs sm:text-sm truncate">{student.name}</span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 block mt-0.5">{student.studentNo}</span>
                  </div>

                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold border flex-shrink-0 ${
                    isPassed 
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                      : 'bg-rose-50 text-rose-700 border-rose-200'
                  }`}>
                    {remarkText}
                  </span>
                </div>

                {/* Score and Effective GWA Details */}
                <div className="flex items-center justify-between py-2 border-y border-slate-100 text-xs font-mono">
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Computed Score</span>
                    <span className="text-sm font-bold text-slate-800">{student.computedGrade != null ? student.computedGrade : '—'}</span>
                  </div>

                  <div className="text-right">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Effective GWA</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-lg inline-block mt-0.5 ${
                      isPassed ? 'bg-emerald-100 text-emerald-900' : 'bg-rose-100 text-rose-900'
                    }`}>
                      {effGwa != null ? effGwa.toFixed(2) : '—'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] pt-0.5">
                  <span className="text-slate-400 text-[10px] flex items-center gap-1 font-mono">
                    <Lock className="h-3 w-3 text-slate-400" /> Locked Record
                  </span>

                  <button
                    onClick={() => {
                      setRemarkReqStudent(student.name);
                      setRemarkReqStudentId(student.id);
                      setRemarkReqFrom(student.customRemarks || 'Passed');
                      setShowRemarkModal(true);
                    }}
                    className="text-violet-600 hover:text-violet-700 font-bold text-[11px] hover:underline cursor-pointer"
                  >
                    Request Override
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Desktop Spreadsheet Table (hidden md:block) ─────────────────── */}
        {isFullScreen && <div className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsFullScreen(false)} />}
        <div className={isFullScreen ? "fixed inset-4 z-50 rounded-xl border border-slate-200 shadow-2xl bg-white overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200" : "hidden md:flex rounded-2xl border border-slate-200 shadow-2xs bg-white overflow-hidden flex-col w-full max-w-full"}>
            {/* Fullscreen header bar */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50/80">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-sage-600" />
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Posted Grades — {subjectCode} ({sectionName})
                </span>
                <span className="text-[10px] font-medium text-slate-400 ml-2">
                  Posted Record · {filteredStudents.length} students
                </span>
              </div>
              <button
                onClick={() => setIsFullScreen(!isFullScreen)}
                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-sage-50 hover:border-sage-300 text-slate-505 hover:text-slate-700 transition-all cursor-pointer"
                title={isFullScreen ? 'Exit fullscreen' : 'View fullscreen'}
              >
                {isFullScreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </button>
            </div>
            <div className={isFullScreen ? "table-container overflow-auto flex-1" : "table-container overflow-x-auto"}>
                <table className={`w-full min-w-max text-left border-collapse ${isFullScreen ? 'fullscreen-table' : ''}`}>
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 text-xs font-bold text-center">
                            <th rowSpan={2} className="px-2 py-3 border-r border-slate-200 w-10 sticky left-0 bg-slate-50 z-30">No.</th>
                            <th rowSpan={2} className="px-2 py-3 border-r border-slate-200 w-24 sticky left-[40px] bg-slate-50 z-30">Student No.</th>
                            <th rowSpan={2} className="px-4 py-3 text-left font-bold uppercase tracking-wider sticky left-[136px] bg-slate-50 border-r border-slate-200 z-30 w-60 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)]">Student Name</th>
                            {(viewMode === 'All' || viewMode === 'Prelim' || viewMode === 'MidtermBatch') && (
                              <th colSpan={(activities.Prelim?.length || 0) + 6} className="px-4 py-2 border-r border-slate-200 bg-sky-50 text-sky-850">PRELIMINARY GRADE</th>
                            )}
                            {(viewMode === 'All' || viewMode === 'Midterm' || viewMode === 'MidtermBatch') && (
                              <th colSpan={(activities.Midterm?.length || 0) + 6} className="px-4 py-2 border-r border-slate-200 bg-indigo-50 text-indigo-850">MIDTERM GRADE</th>
                            )}
                            {(viewMode === 'All' || viewMode === 'Midterm' || viewMode === 'MidtermBatch' || viewMode === 'Summary') && (
                              <th rowSpan={2} className="px-3 py-3 border-r border-slate-200 bg-indigo-100 text-indigo-950 font-bold uppercase tracking-wider w-16">Midterm Rating (MR)</th>
                            )}
                            {(viewMode === 'All' || viewMode === 'Semi-Final' || viewMode === 'FinalBatch') && (
                              <th colSpan={(activities['Semi-Final']?.length || 0) + 6} className="px-4 py-2 border-r border-slate-200 bg-amber-50 text-amber-850">SEMI-FINAL GRADE</th>
                            )}
                            {(viewMode === 'All' || viewMode === 'Final' || viewMode === 'FinalBatch') && (
                              <th colSpan={(activities.Final?.length || 0) + 6} className="px-4 py-2 border-r border-slate-200 bg-orange-50 text-orange-850">FINAL GRADE</th>
                            )}
                            {(viewMode === 'All' || viewMode === 'Final' || viewMode === 'FinalBatch' || viewMode === 'Summary') && (
                              <th rowSpan={2} className="px-3 py-3 border-r border-slate-200 bg-orange-100 text-orange-955 font-bold uppercase tracking-wider w-16">Tentative Final Rating (TFR)</th>
                            )}
                            {(viewMode === 'All' || viewMode === 'Final' || viewMode === 'Summary') && (
                              <th rowSpan={2} className="px-3 py-3 border-r border-slate-200 bg-emerald-50 text-emerald-800 font-extrabold uppercase tracking-wider w-16">Semestral Grade (SG)</th>
                            )}
                            {(viewMode === 'All' || viewMode === 'Final' || viewMode === 'Summary') && (
                              <th rowSpan={2} className="px-3 py-3 border-r border-slate-200 bg-emerald-100 text-emerald-955 font-extrabold uppercase tracking-wider w-16">Equivalent GWA</th>
                            )}
                            {(viewMode === 'All' || viewMode === 'Final' || viewMode === 'Summary') && (
                              <th rowSpan={2} className="px-4 py-3 border-r border-slate-200 bg-emerald-100 text-emerald-950 font-extrabold uppercase tracking-wider w-20">Remarks</th>
                            )}
                        </tr>
                        
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-[9px] font-bold text-center">
                            {(periodsList.includes('Prelim') && (viewMode === 'All' || viewMode === 'Prelim' || viewMode === 'MidtermBatch')) && (
                              <>
                                {(activities.Prelim || []).map((act, index) => (
                                  <th key={act.id} className="px-1 py-1.5 border-r border-slate-100 w-12" title={act.name}>{index + 1}</th>
                                ))}
                                <th className="px-1.5 py-1.5 border-r border-slate-100 bg-slate-100/55 w-12">Total</th>
                                <th className="px-1.5 py-1.5 border-r border-slate-100 bg-slate-100/55 w-12">%</th>
                                <th className="px-1.5 py-1.5 border-r border-slate-100 w-16">Char</th>
                                <th className="px-1.5 py-1.5 border-r border-slate-100 w-12">Exam</th>
                                <th className="px-1.5 py-1.5 border-r border-slate-100 bg-slate-100/55 w-12">%</th>
                                <th className="px-2 py-1.5 border-r border-slate-200 bg-sky-100/30 font-bold w-14 text-slate-800">Rating</th>
                              </>
                            )}

                            {(viewMode === 'All' || viewMode === 'Midterm' || viewMode === 'MidtermBatch') && (
                              <>
                                {(activities.Midterm || []).map((act, index) => (
                                  <th key={act.id} className="px-1 py-1.5 border-r border-slate-100 w-12" title={act.name}>{index + 1}</th>
                                ))}
                                <th className="px-1.5 py-1.5 border-r border-slate-100 bg-slate-100/55 w-12">Total</th>
                                <th className="px-1.5 py-1.5 border-r border-slate-100 bg-slate-100/55 w-12">%</th>
                                <th className="px-1.5 py-1.5 border-r border-slate-100 w-16">Char</th>
                                <th className="px-1.5 py-1.5 border-r border-slate-100 w-12">Exam</th>
                                <th className="px-1.5 py-1.5 border-r border-slate-100 bg-slate-100/55 w-12">%</th>
                                <th className="px-2 py-1.5 border-r border-slate-200 bg-indigo-100/30 font-bold w-14 text-slate-800">Rating</th>
                              </>
                            )}

                            {(periodsList.includes('Semi-Final') && (viewMode === 'All' || viewMode === 'Semi-Final' || viewMode === 'FinalBatch')) && (
                              <>
                                {(activities['Semi-Final'] || []).map((act, index) => (
                                  <th key={act.id} className="px-1 py-1.5 border-r border-slate-100 w-12" title={act.name}>{index + 1}</th>
                                ))}
                                <th className="px-1.5 py-1.5 border-r border-slate-100 bg-slate-100/55 w-12">Total</th>
                                <th className="px-1.5 py-1.5 border-r border-slate-100 bg-slate-100/55 w-12">%</th>
                                <th className="px-1.5 py-1.5 border-r border-slate-100 w-16">Char</th>
                                <th className="px-1.5 py-1.5 border-r border-slate-100 w-12">Exam</th>
                                <th className="px-1.5 py-1.5 border-r border-slate-100 bg-slate-100/55 w-12">%</th>
                                <th className="px-2 py-1.5 border-r border-slate-200 bg-amber-100/30 font-bold w-14 text-slate-800">Rating</th>
                              </>
                            )}

                            {(viewMode === 'All' || viewMode === 'Final' || viewMode === 'FinalBatch') && (
                              <>
                                {(activities.Final || []).map((act, index) => (
                                  <th key={act.id} className="px-1 py-1.5 border-r border-slate-100 w-12" title={act.name}>{index + 1}</th>
                                ))}
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
                        {filteredStudents.length > 0 ? (
                          filteredStudents.map((student, idx) => (
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
                              readOnly={true}
                              classCode={classRecordId}
                              maxItems={maxItems}
                              activities={activities}
                              viewMode={viewMode}
                              periodsList={periodsList}
                              lockedMilestones={lockedMilestones}
                            />
                          ))
                        ) : (
                          <tr>
                            <td colSpan={57} className="py-10 text-center text-slate-400 font-semibold text-xs">
                              No student records found matching search.
                            </td>
                          </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>

      </div>

      {/* ══════ Remark Override Request Modal (Responsive Bottom Sheet) ══════ */}
      {showRemarkModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center animate-in fade-in duration-200 sm:p-4 text-left">
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-xs"
            onClick={() => setShowRemarkModal(false)}
          />

          <div className="relative bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-5 sm:p-6 space-y-4 sm:space-y-5 z-10 animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 max-h-[85vh] overflow-y-auto">
            <div className="sm:hidden w-12 h-1.5 bg-slate-200 rounded-full mx-auto -mt-2 mb-1" />
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-slate-800 text-sm sm:text-base flex items-center gap-2 font-display">
                  <MessageSquare className="h-4 w-4 text-violet-600" />
                  Request Remark Change
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Submit to Dean for approval. Grade row will be unlocked only after Dean approves.
                </p>
              </div>
              <button
                onClick={() => setShowRemarkModal(false)}
                className="p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Student</label>
              <select
                value={remarkReqStudent}
                onChange={e => {
                  setRemarkReqStudent(e.target.value);
                  const selected = students.find(s => s.name === e.target.value);
                  if (selected) {
                    setRemarkReqStudentId(selected.id);
                    setRemarkReqFrom(selected.customRemarks || 'Passed');
                  }
                }}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-xs sm:text-sm font-semibold outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-300 bg-white cursor-pointer shadow-2xs"
              >
                <option value="">— Select a student —</option>
                {students.map(s => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
              </select>
            </div>

            {remarkReqStudent && (
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Current Remark</label>
                <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700">
                  {remarkReqFrom}
                </div>
              </div>
            )}
            {remarkReqTo === 'Passed' && (
              <div className="flex items-start gap-2 bg-violet-50 border border-violet-200 rounded-xl px-3 py-2.5 text-xs text-violet-700">
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-violet-500" />
                <span>Grace Pass: if approved, effective grade will be recorded as <strong>3.00</strong> regardless of computed grade.</span>
              </div>
            )}

            {/* Reason note */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-sans">Reason / Justification <span className="text-rose-500">*</span></label>
              <textarea
                rows={3}
                value={remarkReqNote}
                onChange={e => setRemarkReqNote(e.target.value)}
                placeholder="Explain why this remark change is needed…"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs sm:text-sm outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-300 resize-none bg-white transition-colors shadow-2xs"
              />
            </div>

            {/* Evidence attachment (Capstone Resubmission Policy) */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-sans flex items-center justify-between">
                <span>Proof / Evidence Attachment</span>
                <span className="text-[9px] text-slate-400 font-normal">Optional / Medical & Official docs</span>
              </label>
              <div className="flex items-center gap-2 border border-slate-200 rounded-xl p-2.5 bg-slate-50/50">
                <Paperclip className="h-4 w-4 text-slate-400 flex-shrink-0" />
                <input
                  type="text"
                  value={evidenceFileName}
                  onChange={e => setEvidenceFileName(e.target.value)}
                  placeholder="e.g. medical_certificate_jan2026.pdf"
                  className="w-full text-xs bg-transparent outline-none text-slate-700"
                />
              </div>
              <p className="text-[9px] text-slate-400">Attached evidence will be hosted in Cloudflare R2 bucket for Dean review.</p>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2.5 pt-1">
              <button
                onClick={() => setShowRemarkModal(false)}
                className="flex-1 px-4 py-2.5 text-xs font-bold border border-slate-200 bg-white text-slate-650 hover:bg-slate-50 rounded-xl transition-colors font-sans cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitRemarkRequest}
                disabled={!remarkReqStudent || !remarkReqNote.trim() || remarkReqSent}
                className={cn(
                  'flex-1 px-4 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 font-sans cursor-pointer shadow-2xs',
                  remarkReqSent
                    ? 'bg-emerald-500 text-white'
                    : !remarkReqStudent || !remarkReqNote.trim()
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      : 'bg-violet-600 hover:bg-violet-700 text-white shadow-sm'
                )}
              >
                {remarkReqSent
                  ? 'Request Sent'
                  : <><Send className="h-3.5 w-3.5" /> Submit to Dean</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Excel Export Metadata Input Modal */}
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

      {/* Success Popup Modal */}
      {showPopup && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-end sm:items-center justify-center z-50 animate-in fade-in duration-200 sm:p-4 text-center">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 max-w-sm w-full shadow-2xl border border-slate-100 flex flex-col items-center space-y-4 animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
            <div className="sm:hidden w-12 h-1.5 bg-slate-200 rounded-full -mt-2 mb-1" />
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
              <Check className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base sm:text-lg font-bold text-slate-900 font-display">{popupTitle}</h3>
              <p className="text-xs text-slate-500">{popupDesc}</p>
            </div>
            <button
              onClick={() => setShowPopup(false)}
              className="w-full py-2.5 bg-sage-600 hover:bg-sage-700 text-white font-semibold text-xs sm:text-sm rounded-xl transition-colors shadow-2xs font-sans cursor-pointer"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </>
  );
}
