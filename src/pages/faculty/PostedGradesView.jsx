import { useState, useEffect, useMemo } from 'react';
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
  Edit3,
  FileText
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { TableSkeleton } from '../../components/common/Skeleton';
import { logActivity, resolveActorName } from '../../lib/auditLog';
import { notifyOverrideRequested } from '../../lib/notificationDispatcher';
import { triggerExcelExport } from '../../lib/excelExport';
import ExportPreviewModal from '../../components/ExportPreviewModal';
import html2pdf from 'html2pdf.js';
import {
  getGradingStoragePresentation,
  getTransmutedGrade,
  resolveGradingFormula
} from '../../lib/gradingMath';
import {
  GRADE_MILESTONES,
  collectPostedMilestoneCoverage,
  getCanonicalGradePeriod,
  findPostedMilestone
} from '../../lib/gradeMilestones';
import { cancelSgCorrectionRequest, submitSgCorrectionRequest } from '../../lib/gradeCorrectionService';

const REMARK_TO_DB = Object.freeze({
  Passed: 'passed',
  Failed: 'failed',
  INC: 'incomplete',
  FDA: 'fda',
  Dropped: 'dropped'
});

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
  const [viewMode, setViewMode] = useState('All');
  
  const isSummer = classInfo?.semester === 'Summer';
  const periodsList = isSummer ? ['Midterm', 'Final'] : ['Prelim', 'Midterm', 'Semi-Final', 'Final'];
  const gradingFormula = useMemo(() => {
    const snapshot = classInfo?.grading_formula_snapshot;
    const configuredComponents = snapshot?.components
      || classInfo?.subjects?.grade_computations?.grade_computation_components
      || null;
    return resolveGradingFormula(configuredComponents, {
      formulaAssigned: Boolean(snapshot || classInfo?.subjects?.computation_id)
    });
  }, [classInfo]);
  const gradingPresentation = useMemo(
    () => getGradingStoragePresentation(gradingFormula),
    [gradingFormula]
  );

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
  const [remarkReqComputed, setRemarkReqComputed] = useState('');
  const [remarkReqEffective, setRemarkReqEffective] = useState('');
  const [remarkReqNote, setRemarkReqNote] = useState('');
  const [evidenceReference, setEvidenceReference] = useState('');
  const [remarkReqSent, setRemarkReqSent] = useState(false);
  const [activeCorrectionRequests, setActiveCorrectionRequests] = useState([]);
  const [cancellingCorrectionId, setCancellingCorrectionId] = useState(null);

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
      
      return {
        ...student,
        absences: student.absences ?? 0,
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

    triggerExcelExport(metadata, studentsWithGrades, selectedTab, {
      formula: gradingFormula,
      activities,
      maxItems,
      isSummer
    });
    void logActivity('File Export', `Initiated Excel posted-grade export (${selectedTab}) for ${classInfo.subjects?.code} - ${classInfo.sections?.name}.`, resolveActorName(profile, user));
  };

  const handleExportPdf = (selectedTab) => {
    if (!classInfo || students.length === 0) return;
    void logActivity('File Export', `Initiated PDF posted-grade export (${selectedTab}) for ${classInfo.subjects?.code} - ${classInfo.sections?.name}.`, resolveActorName(profile, user));
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
            grading_formula_snapshot,
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
        if (cr?.subjects?.computation_id && !cr?.grading_formula_snapshot) {
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
        let fetchedDbActs = [];
        try {
          const { data: dbActs } = await supabase
            .from('class_activities')
            .select('*')
            .eq('class_record_id', classRecordId)
            .order('created_at', { ascending: true });

          if (dbActs && dbActs.length > 0) {
            fetchedDbActs = dbActs;
            const loadedActivities = { Prelim: [], Midterm: [], 'Semi-Final': [], Final: [] };
            const isSummer = cr.semester === 'Summer';
            const periodsList = isSummer ? ['Midterm', 'Final'] : ['Prelim', 'Midterm', 'Semi-Final', 'Final'];
            periodsList.forEach(t => {
              const termActs = dbActs.filter(a => a.term === t);
              if (termActs.length > 0) {
                loadedActivities[t] = termActs.map(a => ({
                  id: a.activity_id,
                  dbId: a.activity_id,
                  name: a.name,
                  max: parseFloat(a.max_score) || 20,
                  componentId: a.component_id || null
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

        if (fetchedDbActs.length > 0) {
          const activityIds = fetchedDbActs.map(activity => activity.activity_id);
          const { data: granularScores } = await supabase
            .from('student_activity_scores')
            .select('student_id, activity_id, score')
            .in('activity_id', activityIds);

          const activityTerms = new Map(
            fetchedDbActs.map(activity => [activity.activity_id, activity.term])
          );
          (granularScores || []).forEach(row => {
            const term = activityTerms.get(row.activity_id);
            if (!term) return;
            if (!scoresByStudent[row.student_id]) {
              scoresByStudent[row.student_id] = {
                Prelim: {}, Midterm: {}, 'Semi-Final': {}, Final: {},
                customRemarks: '', remarksNote: ''
              };
            }
            scoresByStudent[row.student_id][term] ||= {};
            scoresByStudent[row.student_id][term][row.activity_id] = Number(row.score) || 0;
          });
        }

        // 5. Fetch posted grades to check customRemarks/overrides and locked milestones
        const { data: pgData } = await supabase
          .from('posted_grades')
          .select('*')
          .eq('class_record_id', classRecordId);

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
          const canonicalPeriod = getCanonicalGradePeriod(row);
          if (canonicalPeriod === GRADE_MILESTONES.SEMESTRAL_GRADE) {
            scoresByStudent[row.student_id].customRemarks = row.remarks === 'passed' ? 'Passed' : row.remarks === 'failed' ? 'Failed' : row.remarks.toUpperCase();
            scoresByStudent[row.student_id].remarksNote = row.remarks_note || '';
          }

        });

        setLockedMilestones(collectPostedMilestoneCoverage(pgData || [], { lockedOnly: true }));

        const { data: correctionRows, error: correctionError } = await supabase
          .from('remark_override_requests')
          .select('request_id, student_id, status, original_computed_grade, original_effective_grade, original_remark, proposed_computed_grade, proposed_effective_grade, proposed_remark, requested_at')
          .eq('class_record_id', classRecordId)
          .in('status', ['pending', 'approved'])
          .order('requested_at', { ascending: false });
        if (correctionError) throw correctionError;
        setActiveCorrectionRequests(correctionRows || []);

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

        // Fetch real absences from attendance_records — this page previously had no
        // writer for its localStorage absence cache at all, so every student here
        // always read 0 absences regardless of their actual record, unless the
        // faculty happened to open ScoreInput for the same class first in the same
        // browser (coincidental, not reliable). The DB is the only source of truth.
        const { data: absenceData } = await supabase
          .from('attendance_records')
          .select('student_id')
          .eq('class_record_id', classRecordId)
          .eq('status', 'Absent');
        const absenceCounts = {};
        (absenceData || []).forEach(rec => {
          absenceCounts[rec.student_id] = (absenceCounts[rec.student_id] || 0) + 1;
        });

        const compiled = studentList.map(stud => {
          const dbData = scoresByStudent[stud.id] || {};
          const pgRow = findPostedMilestone(
            (pgData || []).filter(row => row.student_id === stud.id),
            GRADE_MILESTONES.SEMESTRAL_GRADE
          );
          return {
            ...stud,
            absences: absenceCounts[stud.id] || 0,
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


  const prepareCorrectionRequest = (student) => {
    if (!student) return;
    const currentRemark = student.customRemarks || 'Passed';
    const nextRemark = currentRemark === 'Passed' ? 'INC' : 'Passed';
    const computed = student.computedGrade == null ? '' : String(student.computedGrade);
    const rawGwa = student.computedGrade == null ? student.effectiveGrade : getTransmutedGrade(student.computedGrade);
    const proposedEffective = nextRemark === 'Passed' && Number(rawGwa) > 3
      ? 3
      : rawGwa;
    setRemarkReqStudent(student.name);
    setRemarkReqStudentId(student.id);
    setRemarkReqFrom(currentRemark);
    setRemarkReqTo(nextRemark);
    setRemarkReqComputed(computed);
    setRemarkReqEffective(proposedEffective == null ? '' : String(proposedEffective));
  };

  const handleProposedRemarkChange = (nextRemark) => {
    setRemarkReqTo(nextRemark);
    const selected = students.find(student => student.id === remarkReqStudentId);
    if (!selected || selected.computedGrade == null) return;
    const rawGwa = getTransmutedGrade(selected.computedGrade);
    setRemarkReqEffective(String(nextRemark === 'Passed' && rawGwa > 3 ? 3 : rawGwa));
  };

  const handleSubmitRemarkRequest = async () => {
    const proposedComputedGrade = Number(remarkReqComputed);
    const proposedEffectiveGrade = Number(remarkReqEffective);
    const proposalIsValid = String(remarkReqComputed).trim() !== ''
      && String(remarkReqEffective).trim() !== ''
      && Number.isFinite(proposedComputedGrade)
      && proposedComputedGrade >= 0
      && proposedComputedGrade <= 100
      && Number.isFinite(proposedEffectiveGrade)
      && proposedEffectiveGrade >= 1
      && proposedEffectiveGrade <= 5
      && (!evidenceReference.trim() || /^https:\/\/\S+$/i.test(evidenceReference.trim()));
    if (!remarkReqStudent || !remarkReqTo || !remarkReqNote.trim() || !classRecordId || !proposalIsValid) return;

    try {
      const subjCode = classInfo?.subjects?.code || '';
      const subjName = classInfo?.subjects?.name || '';
      const actorName = resolveActorName(profile, user);
      const evidenceUrl = evidenceReference.trim() || null;
      const correctionRequest = await submitSgCorrectionRequest({
        classRecordId,
        studentId: remarkReqStudentId,
        proposedRemark: REMARK_TO_DB[remarkReqTo],
        reason: remarkReqNote.trim(),
        evidenceUrl,
        proposedComputedGrade,
        proposedEffectiveGrade
      });

      // The secured RPC is the only source of truth. No local fallback can
      // create an authorization record that the database did not accept.
      await logActivity(
        'Remark Override Request',
        `Requested remark override for student ${remarkReqStudent} (${remarkReqFrom} -> ${remarkReqTo}) in ${subjCode}`,
        actorName
      );

      // Dispatch notification to Dean
      await notifyOverrideRequested({
        facultyName: actorName,
        studentName: remarkReqStudent,
        subjectName: `${subjCode} - ${subjName}`,
        currentRemark: remarkReqFrom,
        requestedRemark: remarkReqTo
      });

      setActiveCorrectionRequests(previous => [{
        ...correctionRequest,
        student_id: remarkReqStudentId,
        status: 'pending',
        requested_at: new Date().toISOString()
      }, ...previous.filter(request => request.student_id !== remarkReqStudentId)]);

      setRemarkReqSent(true);
      setTimeout(() => {
        setShowRemarkModal(false);
        setRemarkReqSent(false);
        setRemarkReqStudent('');
        setRemarkReqStudentId('');
        setRemarkReqNote('');
        setRemarkReqTo('INC');
        setRemarkReqComputed('');
        setRemarkReqEffective('');
        setEvidenceReference('');
        setPopupTitle('Override Submitted');
        setPopupDesc(`Remark change request ${correctionRequest.request_id} for ${remarkReqStudent} has been submitted to the Dean.`);
        setShowPopup(true);
      }, 1500);

    } catch (err) {
      console.error('Error submitting remark change request:', err);
      setPopupTitle('Correction Request Failed');
      setPopupDesc(err.message || 'The correction request could not be submitted. No revision permission was created.');
      setShowPopup(true);
    }
  };

  const handleCancelCorrection = async (request) => {
    setCancellingCorrectionId(request.request_id);
    try {
      await cancelSgCorrectionRequest({ requestId: request.request_id });
      setActiveCorrectionRequests(previous => previous.filter(item => item.request_id !== request.request_id));
      setPopupTitle('Correction Request Cancelled');
      setPopupDesc('The unresolved correction request was cancelled. The official SG remains unchanged and locked.');
      setShowPopup(true);
    } catch (err) {
      console.error('Error cancelling SG correction request:', err);
      setPopupTitle('Cancellation Failed');
      setPopupDesc(err.message || 'The correction request could not be cancelled.');
      setShowPopup(true);
    } finally {
      setCancellingCorrectionId(null);
    }
  };


  // Escape key closes fullscreen
  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') setIsFullScreen(false); };
    if (isFullScreen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isFullScreen]);

  if (loading) {
    return <TableSkeleton rows={6} />;
  }

  const subjectCode = classInfo?.subjects?.code || '';
  const subjectName = classInfo?.subjects?.name || '';
  const sectionName = classInfo?.sections?.name || '';

  const filteredStudents = students.filter(student => 
    student.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const proposedComputedNumber = Number(remarkReqComputed);
  const proposedEffectiveNumber = Number(remarkReqEffective);
  const evidenceReferenceIsValid = !evidenceReference.trim() || /^https:\/\/\S+$/i.test(evidenceReference.trim());
  const isCorrectionProposalValid = Boolean(
    remarkReqStudent
    && remarkReqTo
    && remarkReqNote.trim()
    && String(remarkReqComputed).trim() !== ''
    && String(remarkReqEffective).trim() !== ''
    && Number.isFinite(proposedComputedNumber)
    && proposedComputedNumber >= 0
    && proposedComputedNumber <= 100
    && Number.isFinite(proposedEffectiveNumber)
    && proposedEffectiveNumber >= 1
    && proposedEffectiveNumber <= 5
    && evidenceReferenceIsValid
  );

  return (
    <>
      <PageHeader title="Preview Grades" breadcrumb="Faculty Portal">
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap sm:flex-nowrap">
          <button 
            onClick={() => navigate(`/faculty/scoreinput?id=${classRecordId}`)}
            className="px-2.5 sm:px-4 py-2 text-xs sm:text-sm font-semibold border border-slate-200 bg-white text-slate-700 hover:border-sage-300 rounded-xl transition-all shadow-2xs flex items-center gap-1.5 font-sans cursor-pointer"
          >
            <Edit3 className="h-3.5 w-3.5 text-slate-500" />
            <span className="hidden sm:inline">Input Scores</span>
            <span className="sm:hidden">Scores</span>
          </button>
          <button 
            disabled={students.length === 0}
            onClick={() => setShowExportModal(true)}
            className="px-2.5 sm:px-4 py-2 text-xs sm:text-sm font-semibold border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
            <span className="hidden sm:inline">Export</span>
            <span className="sm:hidden">Export</span>
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

        {/* Dynamic Registry Management Banner with Dean's Override Panel */}
        <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-3.5 sm:p-5 space-y-3.5 sm:space-y-4 shadow-2xs text-left">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-3 sm:gap-4">
            <div className="flex gap-3">
              <FileText className="h-5 w-5 text-sage-600 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-bold text-xs sm:text-sm text-slate-800">Class Record Registry &amp; Remark Management</h4>
                <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 leading-relaxed">
                  Posted semestral grades remain official and locked. Submit an exact correction request for Dean review; approval grants one revision, and the student record changes only after faculty reposts the corrected SG.
                </p>
                <div className="flex flex-wrap gap-2 mt-2.5 sm:mt-3">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-emerald-50 border border-emerald-250 text-emerald-700">
                    Posted Ledger (Active)
                  </span>
                </div>
              </div>
            </div>

            {/* Request Remark Change button */}
            <button
              onClick={() => setShowRemarkModal(true)}
              className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-300 rounded-xl transition-colors shadow-2xs outline-none flex-shrink-0 font-sans cursor-pointer"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Request SG Correction
            </button>
          </div>
          {activeCorrectionRequests.length > 0 && (
            <div className="space-y-2 border-t border-slate-200 pt-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Unresolved SG corrections</p>
              {activeCorrectionRequests.map(request => {
                const requestStudent = students.find(student => student.id === request.student_id);
                return (
                  <div key={request.request_id} className="flex flex-col gap-2 rounded-xl border border-violet-200 bg-violet-50/60 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-[11px] text-slate-700">
                      <span className="font-bold">{requestStudent?.name || 'Student'}</span>
                      <span className="mx-1.5 text-slate-400">·</span>
                      <span className="font-mono">{request.original_computed_grade ?? '—'}% → {request.proposed_computed_grade ?? request.original_computed_grade ?? '—'}%</span>
                      <span className="mx-1.5 text-slate-400">·</span>
                      <span className="font-semibold capitalize">{request.status}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCancelCorrection(request)}
                      disabled={cancellingCorrectionId === request.request_id}
                      className="rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-rose-700 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                    >
                      {cancellingCorrectionId === request.request_id ? 'Cancelling…' : 'Cancel Request'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
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
                      prepareCorrectionRequest(student);
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
                              <th colSpan={(activities.Prelim?.length || 0) + (gradingPresentation.hasCharacter ? 6 : 5)} className="px-4 py-2 border-r border-slate-200 bg-sky-50 text-sky-850">PRELIMINARY GRADE</th>
                            )}
                            {(viewMode === 'All' || viewMode === 'Midterm' || viewMode === 'MidtermBatch') && (
                              <th colSpan={(activities.Midterm?.length || 0) + (gradingPresentation.hasCharacter ? 6 : 5)} className="px-4 py-2 border-r border-slate-200 bg-indigo-50 text-indigo-850">MIDTERM GRADE</th>
                            )}
                            {(viewMode === 'All' || viewMode === 'Midterm' || viewMode === 'MidtermBatch' || viewMode === 'Summary') && (
                              <th rowSpan={2} className="px-3 py-3 border-r border-slate-200 bg-indigo-100 text-indigo-950 font-bold uppercase tracking-wider w-16">Midterm Rating (MR)</th>
                            )}
                            {(viewMode === 'All' || viewMode === 'Semi-Final' || viewMode === 'FinalBatch') && (
                              <th colSpan={(activities['Semi-Final']?.length || 0) + (gradingPresentation.hasCharacter ? 6 : 5)} className="px-4 py-2 border-r border-slate-200 bg-amber-50 text-amber-850">SEMI-FINAL GRADE</th>
                            )}
                            {(viewMode === 'All' || viewMode === 'Final' || viewMode === 'FinalBatch') && (
                              <th colSpan={(activities.Final?.length || 0) + (gradingPresentation.hasCharacter ? 6 : 5)} className="px-4 py-2 border-r border-slate-200 bg-orange-50 text-orange-850">FINAL GRADE</th>
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
                                {gradingPresentation.hasCharacter && (
                                  <th className="px-1.5 py-1.5 border-r border-slate-100 w-16" title={gradingPresentation.characterLabel}>{gradingPresentation.characterLabel}</th>
                                )}
                                <th className="px-1.5 py-1.5 border-r border-slate-100 w-12" title={gradingPresentation.examLabel}>{gradingPresentation.examLabel}</th>
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
                                {gradingPresentation.hasCharacter && (
                                  <th className="px-1.5 py-1.5 border-r border-slate-100 w-16" title={gradingPresentation.characterLabel}>{gradingPresentation.characterLabel}</th>
                                )}
                                <th className="px-1.5 py-1.5 border-r border-slate-100 w-12" title={gradingPresentation.examLabel}>{gradingPresentation.examLabel}</th>
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
                                {gradingPresentation.hasCharacter && (
                                  <th className="px-1.5 py-1.5 border-r border-slate-100 w-16" title={gradingPresentation.characterLabel}>{gradingPresentation.characterLabel}</th>
                                )}
                                <th className="px-1.5 py-1.5 border-r border-slate-100 w-12" title={gradingPresentation.examLabel}>{gradingPresentation.examLabel}</th>
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
                                {gradingPresentation.hasCharacter && (
                                  <th className="px-1.5 py-1.5 border-r border-slate-100 w-16" title={gradingPresentation.characterLabel}>{gradingPresentation.characterLabel}</th>
                                )}
                                <th className="px-1.5 py-1.5 border-r border-slate-100 w-12" title={gradingPresentation.examLabel}>{gradingPresentation.examLabel}</th>
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
                              gradingFormula={gradingFormula}
                              showCharacter={gradingPresentation.hasCharacter}
                              viewMode={viewMode}
                              periodsList={periodsList}
                              postedMilestones={lockedMilestones}
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
                  Request SG Correction
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Approval grants one revision. The official student SG remains unchanged until faculty applies the approved correction and reposts it.
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
                    prepareCorrectionRequest(selected);
                  } else {
                    setRemarkReqStudentId('');
                    setRemarkReqComputed('');
                    setRemarkReqEffective('');
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
            {remarkReqStudent && (
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Exact Proposed Remark</label>
                <select
                  value={remarkReqTo}
                  onChange={event => handleProposedRemarkChange(event.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-xs sm:text-sm font-semibold outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-300 bg-white cursor-pointer shadow-2xs"
                >
                  {['Passed', 'Failed', 'INC', 'FDA', 'Dropped']
                    .map(remark => <option key={remark} value={remark}>{remark}</option>)}
                </select>
                <p className="text-[9px] text-slate-400">Dean approval applies only to this proposed remark and does not immediately change the official SG.</p>
              </div>
            )}
            {remarkReqStudent && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Exact SG Percentage</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={remarkReqComputed}
                    onChange={event => setRemarkReqComputed(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-mono outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-300"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Exact Effective GWA</label>
                  <input
                    type="number"
                    min="1"
                    max="5"
                    step="0.01"
                    value={remarkReqEffective}
                    onChange={event => setRemarkReqEffective(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-mono outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-300"
                  />
                </div>
                <p className="col-span-2 text-[9px] leading-relaxed text-slate-400">
                  Enter the exact values expected after the official grading engine recalculates the corrected scores. Reposting is rejected if the result differs from this approved proposal.
                </p>
              </div>
            )}
            {remarkReqTo === 'Passed' && (
              <div className="flex items-start gap-2 bg-violet-50 border border-violet-200 rounded-xl px-3 py-2.5 text-xs text-violet-700">
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-violet-500" />
                <span>Grace Pass: when the recalculated GWA is above 3.00, the grading engine caps the approved Passed result at <strong>3.00</strong>.</span>
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
                <span>Proof / Evidence URL</span>
                <span className="text-[9px] text-slate-400 font-normal">Optional / secure link</span>
              </label>
              <div className="flex items-center gap-2 border border-slate-200 rounded-xl p-2.5 bg-slate-50/50">
                <Paperclip className="h-4 w-4 text-slate-400 flex-shrink-0" />
                <input
                  type="url"
                  value={evidenceReference}
                  onChange={e => setEvidenceReference(e.target.value)}
                  placeholder="https://…/supporting-document.pdf"
                  className="w-full text-xs bg-transparent outline-none text-slate-700"
                />
              </div>
              <p className="text-[9px] text-slate-400">Paste an existing secure document URL. ASPIRE stores the reference for Dean review; this field does not upload a file.</p>
              {!evidenceReferenceIsValid && (
                <p className="text-[9px] font-semibold text-rose-600">Use a complete HTTPS URL or leave this field empty.</p>
              )}
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
                disabled={!isCorrectionProposalValid || remarkReqSent}
                className={cn(
                  'flex-1 px-4 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 font-sans cursor-pointer shadow-2xs',
                  remarkReqSent
                    ? 'bg-emerald-500 text-white'
                    : !isCorrectionProposalValid
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
        activities={activities}
        gradingFormula={gradingFormula}
        isSummer={isSummer}
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
