import * as XLSX from 'xlsx-js-style';

// ---------------------------------------------------------------------------
// Color palette extracted from SAGE_Grading_System_Mock.xlsx
// ---------------------------------------------------------------------------
const COLOR = {
  green:     'E2EFDA', // Subject Profile input cells
  gray:      'D9D9D9', // STUDENT INFO header, Class Standing
  blue:      '8DB4E2', // Term grade headers (Prelim/Midterm/SF/Final)
  darkBlue:  '1F497D', // Rating columns, MR, TFR
  amber:     'FFC000', // Max score row
  white:     'FFFFFF',
};

// ---------------------------------------------------------------------------
// Style helpers
// ---------------------------------------------------------------------------
const solidFill = (rgb) => ({ patternType: 'solid', fgColor: { rgb }, bgColor: { rgb } });

const borderThin = {
  top:    { style: 'thin', color: { rgb: 'D9D9D9' } },
  bottom: { style: 'thin', color: { rgb: 'D9D9D9' } },
  left:   { style: 'thin', color: { rgb: 'D9D9D9' } },
  right:  { style: 'thin', color: { rgb: 'D9D9D9' } }
};

const style = {
  /** Plain centre-aligned bold header */
  headerCenter: { alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, font: { bold: true }, border: borderThin },
  /** Bold left-aligned label */
  label:        { font: { bold: true }, alignment: { vertical: 'center', horizontal: 'left' } },
  /** Input cell with green fill */
  inputGreen:   { fill: solidFill(COLOR.green), alignment: { vertical: 'center', horizontal: 'left' } },
  /** STUDENT INFO / Class Standing — gray */
  headerGray:   { fill: solidFill(COLOR.gray),     font: { bold: true }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: borderThin },
  /** PRELIM / MIDTERM / SF / FINAL — blue */
  headerBlue:   { fill: solidFill(COLOR.blue),     font: { bold: true }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: borderThin },
  /** MR / TFR / Rating col — dark blue + white text */
  headerDark:   { fill: solidFill(COLOR.darkBlue), font: { bold: true, color: { rgb: COLOR.white } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: borderThin },
  /** Max-score row — amber */
  maxScore:     { fill: solidFill(COLOR.amber),    font: { bold: true }, alignment: { horizontal: 'center', vertical: 'center' }, border: borderThin },
  /** Normal centred cell */
  center:       { alignment: { horizontal: 'center', vertical: 'center' }, border: borderThin },
  /** Normal left-aligned cell */
  left:         { alignment: { horizontal: 'left', vertical: 'center' }, border: borderThin },
  /** Normal right-aligned cell */
  right:        { alignment: { horizontal: 'right', vertical: 'center' }, border: borderThin },
  /** Normal number cell */
  number:       { alignment: { horizontal: 'center', vertical: 'center' }, border: borderThin },
};

// ---------------------------------------------------------------------------
// Core cell writer
// ---------------------------------------------------------------------------
const setCell = (ws, r, c, val, isFormula = false, numFormat = null, cellType = null, cellStyle = null) => {
  const ref = XLSX.utils.encode_cell({ r, c });
  if (isFormula) {
    ws[ref] = { f: val, t: cellType || 'n' };
  } else {
    const t = cellType || (typeof val === 'number' ? 'n' : 's');
    ws[ref] = { t, v: val };
  }
  if (numFormat)  ws[ref].z = numFormat;
  if (cellStyle)  ws[ref].s = cellStyle;
};

// ---------------------------------------------------------------------------
// Safe score getter
// ---------------------------------------------------------------------------
const getScore = (student, term, key) => {
  if (!student) return '';
  let termData = student.periods?.[term];
  if (!termData && term === 'Semi-Final') termData = student.periods?.SemiFinal;
  const val = termData?.[key];
  return (val === undefined || val === '') ? '' : Number(val);
};

// ---------------------------------------------------------------------------
// JS-side rating computation (used for single-sheet exports)
// ---------------------------------------------------------------------------
const computeStudentRatings = (student) => {
  if (!student) return { name: '', mr: '', tfr: '', gwa: '' };

  const getTermRating = (termName) => {
    const ts = student.periods?.[termName] || {};
    const csSum = (ts.act1 || 0) + (ts.act2 || 0) + (ts.act3 || 0) +
                  (ts.act4 || 0) + (ts.act5 || 0) + (ts.act6 || 0);
    const csPercent  = (csSum / 110) * 50;
    const charPercent = (ts.char || 0) * 0.1;
    const examPercent = ((ts.exam || 0) / 40) * 40;
    return Math.min(100, Math.max(0, Math.round(csPercent + charPercent + examPercent)));
  };

  const prelim    = getTermRating('Prelim');
  const midterm   = getTermRating('Midterm');
  const semiFinal = getTermRating('Semi-Final');
  const finalTerm = getTermRating('Final');

  const mr  = Math.round((prelim + midterm) / 2);
  const tfr = Math.round((semiFinal + finalTerm) / 2);
  const sgRating = Math.round((mr + tfr) / 2);

  const transmute = (s) => {
    if (s >= 98) return 1.00;
    if (s >= 95) return 1.25;
    if (s >= 92) return 1.50;
    if (s >= 89) return 1.75;
    if (s >= 86) return 2.00;
    if (s >= 83) return 2.25;
    if (s >= 80) return 2.50;
    if (s >= 77) return 2.75;
    if (s >= 75) return 3.00;
    return 5.00;
  };

  const rawGwa = transmute(sgRating);
  const remarkLower = student.customRemarks?.toLowerCase() || '';

  let gwa = rawGwa;
  if      (student.absences >= 4)                            gwa = 5.00;
  else if (remarkLower === 'inc' || remarkLower === 'incomplete') gwa = 'Inc.';
  else if (remarkLower === 'dropped' || remarkLower === 'drp')    gwa = 'Drp.';
  else if (remarkLower === 'passed')  gwa = Math.min(3.00, rawGwa);
  else if (remarkLower === 'failed')  gwa = 5.00;

  return {
    name: student.name.toUpperCase(),
    mr:   mr + '%',
    tfr:  tfr + '%',
    gwa:  typeof gwa === 'number' ? gwa.toFixed(2) : gwa
  };
};

// ===========================================================================
// SUBJECT PROFILE SHEET
// ===========================================================================
export function buildSubjectProfile(ws, metadata, students, isSingleSheet = false) {
  // --- Institution header ---
  setCell(ws, 0, 0, 'SAGE System',  false, null, null, style.headerCenter);
  setCell(ws, 1, 0, 'College Department', false, null, null, style.headerCenter);
  setCell(ws, 2, 0, 'McArthur Highway, Wakas, Bocaue, Bulacan 3018', false, null, null, style.headerCenter);
  setCell(ws, 3, 0, '(044) 123-4567 - www.SAGE-System.com.ph',       false, null, null, style.headerCenter);

  setCell(ws, 6, 2, 'SUBJECT PROFILE', false, null, null, { ...style.headerCenter, font: { bold: true, sz: 14 } });
  setCell(ws, 7, 2, '(Input data in UPPER CASE format)', false, null, null, style.headerCenter);

  // --- Metadata labels + input cells ---
  const labelStyle = style.label;
  const inputStyle = style.inputGreen;

  setCell(ws, 9,  2, 'College:',                  false, null, null, labelStyle);
  setCell(ws, 9,  3, metadata.college || 'College of Computer Studies', false, null, null, inputStyle);
  setCell(ws, 9,  7, 'No.of Units:',              false, null, null, labelStyle);
  setCell(ws, 9,  8, metadata.units || 3,          false, null, null, inputStyle);

  setCell(ws, 11, 2, 'Subject Code:',             false, null, null, labelStyle);
  setCell(ws, 11, 3, metadata.subjectCode || '',   false, null, null, inputStyle);
  setCell(ws, 11, 7, 'Schedule of Classes:',      false, null, null, labelStyle);

  setCell(ws, 13, 2, 'Subject Description:',      false, null, null, labelStyle);
  setCell(ws, 13, 3, metadata.subjectName || '',   false, null, null, inputStyle);
  setCell(ws, 13, 7, 'Day:',                      false, null, null, labelStyle);
  setCell(ws, 13, 8, metadata.day || 'Mon',        false, null, null, inputStyle);

  setCell(ws, 14, 2, 'Semester / Summer',         false, null, null, labelStyle);
  setCell(ws, 14, 3, metadata.semester || '2nd Sem', false, null, null, inputStyle);
  setCell(ws, 14, 7, 'Time/Hour:',                false, null, null, labelStyle);
  setCell(ws, 14, 8, metadata.time || '07:00 - 10:00', false, null, null, inputStyle);

  setCell(ws, 16, 2, 'Academic Year:',            false, null, null, labelStyle);
  setCell(ws, 16, 3, metadata.schoolYear || '2025-2026', false, null, null, inputStyle);

  setCell(ws, 17, 2, 'Course:',                   false, null, null, labelStyle);
  setCell(ws, 17, 3, metadata.course || 'BSIT',   false, null, null, inputStyle);

  setCell(ws, 18, 2, 'Section:',                  false, null, null, labelStyle);
  setCell(ws, 18, 3, metadata.section || '',       false, null, null, inputStyle);

  setCell(ws, 19, 2, 'Student Record Examiner:',  false, null, null, labelStyle);
  setCell(ws, 19, 3, metadata.examiner || 'MYRA R. CRUZ', false, null, null, inputStyle);

  setCell(ws, 20, 2, 'Registrar:',                false, null, null, labelStyle);
  setCell(ws, 20, 3, metadata.registrar || 'VIRGINIA D. SALVADOR, MBA', false, null, null, inputStyle);

  setCell(ws, 21, 2, 'Faculty Name:',             false, null, null, labelStyle);
  setCell(ws, 21, 3, metadata.facultyName || '',   false, null, null, inputStyle);

  setCell(ws, 22, 2, 'Dean:',                     false, null, null, labelStyle);
  setCell(ws, 22, 3, metadata.dean || 'CARL JEROME ABALOS, DIT', false, null, null, inputStyle);

  // --- Roster header ---
  setCell(ws, 26, 0, 'STUDENT NAMES', false, null, null, { ...style.headerGray, font: { bold: true, sz: 12 } });

  for (let i = 0; i < 30; i++) {
    const r = 28 + i;
    setCell(ws, r, 3, i + 1, false, null, null, style.center);

    const leftStudent = students[i];
    if (isSingleSheet) {
      setCell(ws, r, 4, leftStudent ? leftStudent.name.toUpperCase() : '', false, null, 's', style.left);
    } else {
      setCell(ws, r, 4, `'Record Sheet'!C${9 + i}`, true, null, 's', style.left);
    }

    setCell(ws, r, 7, i + 31, false, null, null, style.center);

    const rightStudent = students[i + 30];
    if (isSingleSheet) {
      setCell(ws, r, 8, rightStudent ? rightStudent.name.toUpperCase() : '', false, null, 's', style.left);
    } else {
      setCell(ws, r, 8, `'Record Sheet'!C${9 + i + 30}`, true, null, 's', style.left);
    }
  }

  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 11 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 11 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 11 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: 11 } },
    { s: { r: 6, c: 2 }, e: { r: 6, c: 9 } },
    { s: { r: 7, c: 2 }, e: { r: 7, c: 9 } },
    { s: { r: 9,  c: 3 }, e: { r: 9,  c: 5 } },
    { s: { r: 9,  c: 8 }, e: { r: 9,  c: 9 } },
    { s: { r: 11, c: 3 }, e: { r: 11, c: 5 } },
    { s: { r: 13, c: 3 }, e: { r: 13, c: 5 } },
    { s: { r: 13, c: 8 }, e: { r: 13, c: 9 } },
    { s: { r: 14, c: 3 }, e: { r: 14, c: 5 } },
    { s: { r: 14, c: 8 }, e: { r: 14, c: 9 } },
    { s: { r: 16, c: 3 }, e: { r: 16, c: 5 } },
    { s: { r: 17, c: 3 }, e: { r: 17, c: 5 } },
    { s: { r: 18, c: 3 }, e: { r: 18, c: 5 } },
    { s: { r: 19, c: 3 }, e: { r: 19, c: 5 } },
    { s: { r: 20, c: 3 }, e: { r: 20, c: 5 } },
    { s: { r: 21, c: 3 }, e: { r: 21, c: 5 } },
    { s: { r: 22, c: 3 }, e: { r: 22, c: 5 } },
    { s: { r: 26, c: 0 }, e: { r: 26, c: 11 } },
  ];

  ws['!cols'] = [
    { wch: 6 }, { wch: 10 }, { wch: 25 }, { wch: 6 },
    { wch: 30 }, { wch: 6 }, { wch: 6 }, { wch: 20 },
    { wch: 30 }, { wch: 6 }, { wch: 6 }, { wch: 6 }
  ];

  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 57, c: 11 } });
}

// ===========================================================================
// RECORD SHEET
// ===========================================================================
export function buildRecordSheet(ws, metadata, students, isSingleSheet = false) {
  // Title row
  setCell(ws, 0, 0, 'RECORD SHEET FOR GENERAL EDUCATION SUBJECTS (SAGE-System)',
    false, null, null, { font: { bold: true }, alignment: { horizontal: 'center', vertical: 'center' } });

  // Metadata
  const writeMetaRef = (r, c, staticVal, formula, isStr = true) => {
    if (isSingleSheet) setCell(ws, r, c, staticVal);
    else               setCell(ws, r, c, formula, true, null, isStr ? 's' : null);
  };

  setCell(ws, 1, 0,  'College:',       false, null, null, style.label);
  writeMetaRef(1, 1,  metadata.college || 'College of Computer Studies', `'Subject Profile'!D10`);
  setCell(ws, 1, 14, 'Course:',        false, null, null, style.label);
  writeMetaRef(1, 15, metadata.course || 'BSIT',             `'Subject Profile'!D18`);
  setCell(ws, 1, 40, 'Academic Year:', false, null, null, style.label);
  writeMetaRef(1, 41, metadata.schoolYear || '2025-2026',     `'Subject Profile'!D17`);

  setCell(ws, 2, 0,  'Subject Description:', false, null, null, style.label);
  writeMetaRef(2, 1,  metadata.subjectName || '',             `'Subject Profile'!D14`);
  setCell(ws, 2, 14, 'Section:',       false, null, null, style.label);
  writeMetaRef(2, 15, metadata.section || '',                 `'Subject Profile'!D19`);
  setCell(ws, 2, 40, 'Semester:',      false, null, null, style.label);
  writeMetaRef(2, 41, metadata.semester || '2nd Sem',         `'Subject Profile'!D15`);

  // ---- Row 4: Main section headers ----
  setCell(ws, 4, 0,  'STUDENT INFO',          false, null, null, style.headerGray);
  setCell(ws, 4, 3,  'PRELIMINARY GRADE',     false, null, null, style.headerBlue);
  setCell(ws, 4, 15, 'MIDTERM GRADE',         false, null, null, style.headerBlue);
  setCell(ws, 4, 27, 'MIDTERM RATING',        false, null, null, style.headerDark);
  setCell(ws, 4, 28, 'SEMI-FINAL GRADE',      false, null, null, style.headerBlue);
  setCell(ws, 4, 40, 'FINAL GRADE',           false, null, null, style.headerBlue);
  setCell(ws, 4, 52, 'TENTATIVE FINAL RATING',false, null, null, style.headerDark);
  setCell(ws, 4, 53, 'SEMESTRAL GRADE',       false, null, null, style.headerCenter);

  // ---- Row 5: Subheaders ----
  const setPeriodSubheaders = (startCol) => {
    setCell(ws, 5, startCol,      'Class Standing', false, null, null, style.headerGray);
    setCell(ws, 5, startCol + 8,  'Char',           false, null, null, style.center);
    setCell(ws, 5, startCol + 9,  'Term Exam',      false, null, null, style.center);
    setCell(ws, 5, startCol + 11, 'Rating',         false, null, null, style.headerDark);
  };
  setPeriodSubheaders(3);   // Prelim
  setPeriodSubheaders(15);  // Midterm
  setPeriodSubheaders(28);  // Semi-Final
  setPeriodSubheaders(40);  // Final

  setCell(ws, 5, 53, 'Rating',     false, null, null, style.center);
  setCell(ws, 5, 54, 'Equivalent', false, null, null, style.center);
  setCell(ws, 5, 55, 'Remarks',    false, null, null, style.center);

  // ---- Row 6: CS detail numbers ----
  const setCSDetails = (startCol) => {
    for (let i = 0; i < 6; i++) setCell(ws, 6, startCol + i, i + 1, false, null, null, style.center);
    setCell(ws, 6, startCol + 6,  'Total', false, null, null, style.center);
    setCell(ws, 6, startCol + 7,  '%',     false, null, null, style.center);
    setCell(ws, 6, startCol + 9,  'Raw',   false, null, null, style.center);
    setCell(ws, 6, startCol + 10, '%',     false, null, null, style.center);
  };
  setCSDetails(3);
  setCSDetails(15);
  setCSDetails(28);
  setCSDetails(40);

  // ---- Row 7: Column labels + Max Scores (amber) ----
  setCell(ws, 7, 0, 'No.',         false, null, null, style.label);
  setCell(ws, 7, 1, 'Student No.', false, null, null, style.label);
  setCell(ws, 7, 2, 'NAME',        false, null, null, style.label);

  const setMaxScores = (startCol) => {
    const maxVals = [20, 20, 20, 20, 20, 10];
    maxVals.forEach((v, i) => setCell(ws, 7, startCol + i, v, false, null, null, style.maxScore));

    const startL = XLSX.utils.encode_col(startCol);
    const endL   = XLSX.utils.encode_col(startCol + 5);
    setCell(ws, 7, startCol + 6,  `SUM(${startL}8:${endL}8)`, true, null, null, style.maxScore);
    setCell(ws, 7, startCol + 7,  50,  false, null, null, style.maxScore);
    setCell(ws, 7, startCol + 8,  100, false, null, null, style.maxScore);
    setCell(ws, 7, startCol + 9,  40,  false, null, null, style.maxScore);
    setCell(ws, 7, startCol + 10, 40,  false, null, null, style.maxScore);
    setCell(ws, 7, startCol + 11, 100, false, null, null, style.maxScore);
  };
  setMaxScores(3);
  setMaxScores(15);
  setMaxScores(28);
  setMaxScores(40);

  // ---- Student rows ----
  for (let i = 0; i < 60; i++) {
    const r = 8 + i;
    const rName = r + 1;
    const student = students[i];

    setCell(ws, r, 0, i + 1, false, null, null, style.center);
    if (student) {
      setCell(ws, r, 1, student.studentNo || '', false, null, 's', style.center);
      setCell(ws, r, 2, student.name.toUpperCase(), false, null, 's', style.left);
    } else {
      setCell(ws, r, 1, '', false, null, 's', style.center);
      setCell(ws, r, 2, '', false, null, 's', style.left);
    }

    const terms = [
      { startCol: 3,  startL: 'D',  endL: 'I',  totL: 'J',  csL: 'K',  charL: 'L',  exRawL: 'M',  exPctL: 'N',  ratL: 'O',  termName: 'Prelim'     },
      { startCol: 15, startL: 'P',  endL: 'U',  totL: 'V',  csL: 'W',  charL: 'X',  exRawL: 'Y',  exPctL: 'Z',  ratL: 'AA', termName: 'Midterm'    },
      { startCol: 28, startL: 'AC', endL: 'AH', totL: 'AI', csL: 'AJ', charL: 'AK', exRawL: 'AL', exPctL: 'AM', ratL: 'AN', termName: 'Semi-Final' },
      { startCol: 40, startL: 'AO', endL: 'AT', totL: 'AU', csL: 'AV', charL: 'AW', exRawL: 'AX', exPctL: 'AY', ratL: 'AZ', termName: 'Final'      },
    ];

    terms.forEach(t => {
      if (student) {
        setCell(ws, r, t.startCol,     getScore(student, t.termName, 'act1'), false, null, 'n', style.center);
        setCell(ws, r, t.startCol + 1, getScore(student, t.termName, 'act2'), false, null, 'n', style.center);
        setCell(ws, r, t.startCol + 2, getScore(student, t.termName, 'act3'), false, null, 'n', style.center);
        setCell(ws, r, t.startCol + 3, getScore(student, t.termName, 'act4'), false, null, 'n', style.center);
        setCell(ws, r, t.startCol + 4, getScore(student, t.termName, 'act5'), false, null, 'n', style.center);
        setCell(ws, r, t.startCol + 5, getScore(student, t.termName, 'act6'), false, null, 'n', style.center);
        setCell(ws, r, t.startCol + 8, getScore(student, t.termName, 'char'), false, null, 'n', style.center);
        setCell(ws, r, t.startCol + 9, getScore(student, t.termName, 'exam'), false, null, 'n', style.center);
      } else {
        for (let j = 0; j < 6; j++) setCell(ws, r, t.startCol + j, '', false, null, 's', style.center);
        setCell(ws, r, t.startCol + 8, '', false, null, 's', style.center);
        setCell(ws, r, t.startCol + 9, '', false, null, 's', style.center);
      }

      setCell(ws, r, t.startCol + 6,  `IF($C${rName}="","",SUM(${t.startL}${rName}:${t.endL}${rName}))`, true, null, 'n', style.center);
      setCell(ws, r, t.startCol + 7,  `IF($C${rName}="","",IF(${t.totL}$8>0, (${t.totL}${rName}/${t.totL}$8)*50, 0))`, true, '0.0', 'n', style.center);
      setCell(ws, r, t.startCol + 10, `IF($C${rName}="","",IF(${t.exRawL}$8>0, (${t.exRawL}${rName}/${t.exRawL}$8)*40, 0))`, true, '0.0', 'n', style.center);
      setCell(ws, r, t.startCol + 11, `IF($C${rName}="","",ROUND(${t.csL}${rName}+(${t.charL}${rName}*0.1)+${t.exPctL}${rName},0))`, true, '0', 'n', style.headerDark);
    });

    setCell(ws, r, 27, `IF($C${rName}="","",ROUND(AVERAGE(O${rName},AA${rName}),0))`, true, '0', 'n', style.headerDark);
    setCell(ws, r, 52, `IF($C${rName}="","",ROUND(AVERAGE(AN${rName},AZ${rName}),0))`, true, '0', 'n', style.headerDark);
    setCell(ws, r, 53, `IF($C${rName}="","",ROUND(AVERAGE(AB${rName},BA${rName}),0))`, true, '0', 'n', style.headerDark);

    const remarkLower = student?.customRemarks?.toLowerCase() || '';
    if (student && student.absences >= 4) {
      setCell(ws, r, 54, 5.00, false, '0.00', 'n', style.center);
      setCell(ws, r, 55, 'FDA', false, null, 's', style.center);
    } else if (student && (remarkLower === 'inc' || remarkLower === 'incomplete')) {
      setCell(ws, r, 54, 'Inc.', false, null, 's', style.center);
      setCell(ws, r, 55, 'Inc', false, null, 's', style.center);
    } else if (student && (remarkLower === 'dropped' || remarkLower === 'drp')) {
      setCell(ws, r, 54, 'Drp.', false, null, 's', style.center);
      setCell(ws, r, 55, 'Drp', false, null, 's', style.center);
    } else if (student && remarkLower === 'passed') {
      const base = `IF(BB${rName}>=98,1,IF(BB${rName}>=95,1.25,IF(BB${rName}>=92,1.5,IF(BB${rName}>=89,1.75,IF(BB${rName}>=86,2,IF(BB${rName}>=83,2.25,IF(BB${rName}>=80,2.5,IF(BB${rName}>=77,2.75,IF(BB${rName}>=75,3,5)))))))))`;
      setCell(ws, r, 54, `IF($C${rName}="","",IF(${base}<=3,${base},3.00))`, true, '0.00', 'n', style.center);
      setCell(ws, r, 55, 'Passed', false, null, 's', style.center);
    } else if (student && remarkLower === 'failed') {
      setCell(ws, r, 54, 5.00, false, '0.00', 'n', style.center);
      setCell(ws, r, 55, 'Failed', false, null, 's', style.center);
    } else {
      setCell(ws, r, 54, `IF($C${rName}="","",IF(BB${rName}>=98,1,IF(BB${rName}>=95,1.25,IF(BB${rName}>=92,1.5,IF(BB${rName}>=89,1.75,IF(BB${rName}>=86,2,IF(BB${rName}>=83,2.25,IF(BB${rName}>=80,2.5,IF(BB${rName}>=77,2.75,IF(BB${rName}>=75,3,5))))))))))`, true, '0.00', 'n', style.center);
      setCell(ws, r, 55, `IF($C${rName}="","",IF(BC${rName}<=3,"Passed","Failed"))`, true, null, 's', style.center);
    }
  }

  // Merges
  ws['!merges'] = [
    { s: { r: 0,  c: 0  }, e: { r: 0,  c: 55 } },
    { s: { r: 4,  c: 0  }, e: { r: 6,  c: 2  } },
    { s: { r: 4,  c: 3  }, e: { r: 4,  c: 14 } },
    { s: { r: 4,  c: 15 }, e: { r: 4,  c: 26 } },
    { s: { r: 4,  c: 27 }, e: { r: 6,  c: 27 } },
    { s: { r: 4,  c: 28 }, e: { r: 4,  c: 39 } },
    { s: { r: 4,  c: 40 }, e: { r: 4,  c: 51 } },
    { s: { r: 4,  c: 52 }, e: { r: 6,  c: 52 } },
    { s: { r: 4,  c: 53 }, e: { r: 4,  c: 55 } },
    { s: { r: 5,  c: 3  }, e: { r: 5,  c: 10 } },
    { s: { r: 5,  c: 11 }, e: { r: 6,  c: 11 } },
    { s: { r: 5,  c: 12 }, e: { r: 5,  c: 13 } },
    { s: { r: 5,  c: 14 }, e: { r: 6,  c: 14 } },
    { s: { r: 5,  c: 15 }, e: { r: 5,  c: 22 } },
    { s: { r: 5,  c: 23 }, e: { r: 6,  c: 23 } },
    { s: { r: 5,  c: 24 }, e: { r: 5,  c: 25 } },
    { s: { r: 5,  c: 26 }, e: { r: 6,  c: 26 } },
    { s: { r: 5,  c: 28 }, e: { r: 5,  c: 35 } },
    { s: { r: 5,  c: 36 }, e: { r: 6,  c: 36 } },
    { s: { r: 5,  c: 37 }, e: { r: 5,  c: 38 } },
    { s: { r: 5,  c: 39 }, e: { r: 6,  c: 39 } },
    { s: { r: 5,  c: 40 }, e: { r: 5,  c: 47 } },
    { s: { r: 5,  c: 48 }, e: { r: 6,  c: 48 } },
    { s: { r: 5,  c: 49 }, e: { r: 5,  c: 50 } },
    { s: { r: 5,  c: 51 }, e: { r: 6,  c: 51 } },
    { s: { r: 5,  c: 53 }, e: { r: 6,  c: 53 } },
    { s: { r: 5,  c: 54 }, e: { r: 6,  c: 54 } },
    { s: { r: 5,  c: 55 }, e: { r: 6,  c: 55 } },
  ];

  const cols = [{ wch: 5 }, { wch: 12 }, { wch: 25 }];
  for (let t = 0; t < 4; t++) {
    for (let i = 0; i < 6; i++) cols.push({ wch: 4 });
    cols.push({ wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 7 });
    if (t === 1) cols.push({ wch: 8 });
  }
  cols.push({ wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 10 });
  ws['!cols'] = cols;

  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 67, c: 55 } });
}

// ===========================================================================
// REPORT OF GRADES
// ===========================================================================
export function buildReportOfGrades(ws, metadata, students, isSingleSheet = false) {
  // Grade conversion scale
  const scale = [
    { label: '98-100',    val: 1.00 },
    { label: '95-97',     val: 1.25 },
    { label: '92-94',     val: 1.50 },
    { label: '89-91',     val: 1.75 },
    { label: '86-88',     val: 2.00 },
    { label: '83-85',     val: 2.25 },
    { label: '80-82',     val: 2.50 },
    { label: '77-79',     val: 2.75 },
    { label: '75-76',     val: 3.00 },
    { label: '74 below',  val: 5.00 },
    { label: 'Incomplete',val: 'Inc.' },
    { label: 'Dropped',   val: 'Drp.' },
  ];
  scale.forEach((s, idx) => {
    setCell(ws, 4 + idx, 0, s.label, false, null, 's', style.center);
    setCell(ws, 4 + idx, 1, s.val, false, null, typeof s.val === 'number' ? 'n' : 's', style.center);
  });

  const writeMetaRef = (r, c, staticVal, formula, isStr = true) => {
    if (isSingleSheet) setCell(ws, r, c, staticVal);
    else               setCell(ws, r, c, formula, true, null, isStr ? 's' : null);
  };

  // Registrar block
  setCell(ws, 5, 4, 'OFFICE OF THE REGISTRAR', false, null, null,
    { font: { bold: true, sz: 13 }, alignment: { horizontal: 'center', vertical: 'center' } });
  setCell(ws, 6, 4, 'REPORT OF GRADES', false, null, null,
    { font: { bold: true, sz: 12 }, alignment: { horizontal: 'center', vertical: 'center' } });
  setCell(ws, 9, 4, 'Semester / Summer and School Year', false, null, null, style.center);

  if (isSingleSheet) {
    setCell(ws, 11, 4, `${metadata.semester || ''}   -   ${metadata.schoolYear || ''}`);
  } else {
    setCell(ws, 11, 4, `'Subject Profile'!D15 & "   -   " & 'Subject Profile'!D17`, true, null, 's');
  }

  setCell(ws, 13, 3, 'Course:', false, null, null, style.label);
  writeMetaRef(13, 4, metadata.course || 'BSIT',     `'Subject Profile'!D18`);
  setCell(ws, 13, 7, 'Section:', false, null, null, style.label);
  writeMetaRef(13, 8, metadata.section || '',         `'Subject Profile'!D19`);

  setCell(ws, 4,  11, 'Subject Code:',        false, null, null, style.label);
  writeMetaRef(5,  11, metadata.subjectCode || '',    `'Subject Profile'!D12`);
  setCell(ws, 6,  11, 'Subject Description:', false, null, null, style.label);
  writeMetaRef(7,  11, metadata.subjectName || '',    `'Subject Profile'!D14`);
  setCell(ws, 8,  11, 'College:',             false, null, null, style.label);
  writeMetaRef(9,  11, metadata.college || 'College of Computer Studies', `'Subject Profile'!D10`);
  setCell(ws, 10, 11, 'Schedule of Classes:', false, null, null, style.label);
  setCell(ws, 11, 11, 'Day:',                 false, null, null, style.label);
  writeMetaRef(11, 12, metadata.day || 'Sat',         `'Subject Profile'!I14`);
  setCell(ws, 12, 11, 'Time/Hour:',           false, null, null, style.label);
  writeMetaRef(12, 12, metadata.time || '7:00 - 10:00', `'Subject Profile'!I15`);
  writeMetaRef(14, 13, metadata.units || 3,           `'Subject Profile'!I10`, false);

  // Table header row
  setCell(ws, 16, 0, 'No.',             false, null, null, { ...style.headerGray, font: { bold: true } });
  setCell(ws, 16, 1, "Student's Name",  false, null, null, { ...style.headerGray, font: { bold: true } });
  setCell(ws, 16, 4, 'MR',             false, null, null, { ...style.headerBlue, font: { bold: true } });
  setCell(ws, 16, 5, 'TFR',            false, null, null, { ...style.headerBlue, font: { bold: true } });
  setCell(ws, 16, 6, 'SG',             false, null, null, { ...style.headerDark, font: { bold: true, color: { rgb: COLOR.white } } });
  setCell(ws, 16, 7, 'No.',             false, null, null, { ...style.headerGray, font: { bold: true } });
  setCell(ws, 16, 8, "Student's Name",  false, null, null, { ...style.headerGray, font: { bold: true } });
  setCell(ws, 16, 11, 'MR',            false, null, null, { ...style.headerBlue, font: { bold: true } });
  setCell(ws, 16, 12, 'TFR',           false, null, null, { ...style.headerBlue, font: { bold: true } });
  setCell(ws, 16, 13, 'SG',            false, null, null, { ...style.headerDark, font: { bold: true, color: { rgb: COLOR.white } } });

  // Student rows
  for (let i = 0; i < 30; i++) {
    const leftRow = 17 + i;

    setCell(ws, leftRow, 0, i + 1, false, null, null, style.center);
    const leftStudent = students[i];
    if (isSingleSheet) {
      if (leftStudent) {
        const ratings = computeStudentRatings(leftStudent);
        setCell(ws, leftRow, 1, ratings.name, false, null, 's', style.left);
        setCell(ws, leftRow, 4, ratings.mr, false, null, 's', style.center);
        setCell(ws, leftRow, 5, ratings.tfr, false, null, 's', style.center);
        setCell(ws, leftRow, 6, ratings.gwa, false, null, 's', style.center);
      } else {
        setCell(ws, leftRow, 1, '', false, null, 's', style.left);
        setCell(ws, leftRow, 4, '', false, null, 's', style.center);
        setCell(ws, leftRow, 5, '', false, null, 's', style.center);
        setCell(ws, leftRow, 6, '', false, null, 's', style.center);
      }
    } else {
      setCell(ws, leftRow, 1, `'Record Sheet'!C${9 + i}`, true, null, 's', style.left);
      setCell(ws, leftRow, 4, `IF('Record Sheet'!C${9 + i}="", "", 'Record Sheet'!AB${9 + i}&"%")`, true, null, 's', style.center);
      setCell(ws, leftRow, 5, `IF('Record Sheet'!C${9 + i}="", "", 'Record Sheet'!BA${9 + i}&"%")`, true, null, 's', style.center);
      setCell(ws, leftRow, 6, `IF('Record Sheet'!C${9 + i}="", "", 'Record Sheet'!BC${9 + i})`, true, null, 's', style.center);
    }

    setCell(ws, leftRow, 7, i + 31, false, null, null, style.center);
    const rightStudent = students[i + 30];
    if (isSingleSheet) {
      if (rightStudent) {
        const ratings = computeStudentRatings(rightStudent);
        setCell(ws, leftRow, 8, ratings.name, false, null, 's', style.left);
        setCell(ws, leftRow, 11, ratings.mr, false, null, 's', style.center);
        setCell(ws, leftRow, 12, ratings.tfr, false, null, 's', style.center);
        setCell(ws, leftRow, 13, ratings.gwa, false, null, 's', style.center);
      } else {
        setCell(ws, leftRow, 8, '', false, null, 's', style.left);
        setCell(ws, leftRow, 11, '', false, null, 's', style.center);
        setCell(ws, leftRow, 12, '', false, null, 's', style.center);
        setCell(ws, leftRow, 13, '', false, null, 's', style.center);
      }
    } else {
      setCell(ws, leftRow, 8,  `'Record Sheet'!C${9 + i + 30}`, true, null, 's', style.left);
      setCell(ws, leftRow, 11, `IF('Record Sheet'!C${9 + i + 30}="", "", 'Record Sheet'!AB${9 + i + 30}&"%")`, true, null, 's', style.center);
      setCell(ws, leftRow, 12, `IF('Record Sheet'!C${9 + i + 30}="", "", 'Record Sheet'!BA${9 + i + 30}&"%")`, true, null, 's', style.center);
      setCell(ws, leftRow, 13, `IF('Record Sheet'!C${9 + i + 30}="", "", 'Record Sheet'!BC${9 + i + 30})`, true, null, 's', style.center);
    }
  }

  const merges = [
    { s: { r: 5,  c: 4 }, e: { r: 5,  c: 8 } },
    { s: { r: 6,  c: 4 }, e: { r: 6,  c: 8 } },
    { s: { r: 9,  c: 4 }, e: { r: 9,  c: 8 } },
    { s: { r: 11, c: 4 }, e: { r: 11, c: 8 } },
    { s: { r: 5,  c: 11 }, e: { r: 5, c: 14 } },
    { s: { r: 7,  c: 11 }, e: { r: 7, c: 14 } },
    { s: { r: 9,  c: 11 }, e: { r: 9, c: 14 } },
    { s: { r: 11, c: 11 }, e: { r: 11,c: 14 } },
    { s: { r: 12, c: 11 }, e: { r: 12,c: 14 } },
    { s: { r: 13, c: 12 }, e: { r: 13,c: 14 } },
    { s: { r: 13, c: 4  }, e: { r: 13,c: 5  } },
  ];
  for (let i = 0; i < 30; i++) {
    const leftRow = 17 + i;
    merges.push({ s: { r: leftRow, c: 1 }, e: { r: leftRow, c: 3  } });
    merges.push({ s: { r: leftRow, c: 8 }, e: { r: leftRow, c: 10 } });
  }
  ws['!merges'] = merges;

  ws['!cols'] = [
    { wch: 5  }, // A: No.
    { wch: 18 }, // B: Name col 1 (left)
    { wch: 18 }, // C: Name col 2 (left)
    { wch: 8  }, // D: Name col 3 (left)
    { wch: 8  }, // E: MR
    { wch: 8  }, // F: TFR
    { wch: 8  }, // G: SG / GWA
    { wch: 5  }, // H: No. (right)
    { wch: 18 }, // I: Name col 1 (right)
    { wch: 18 }, // J: Name col 2 (right)
    { wch: 8  }, // K: Name col 3 (right)
    { wch: 8  }, // L: MR (right)
    { wch: 8  }, // M: TFR (right)
    { wch: 8  }, // N: SG (right)
  ];

  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 47, c: 13 } });
}

// ===========================================================================
// TRIGGER EXPORT
// ===========================================================================
export function triggerExcelExport(classroomMetadata, students, selectedTab = 'all') {
  const wb = XLSX.utils.book_new();

  let tabName = 'Gradesheet';
  if (selectedTab === 'profile') tabName = 'Subject_Profile';
  if (selectedTab === 'record')  tabName = 'Record_Sheet';
  if (selectedTab === 'report')  tabName = 'Report_of_Grades';

  const filename = `${classroomMetadata.subjectCode || 'SAGE'}_${classroomMetadata.section || 'Class'}_${tabName}.xlsx`;

  if (selectedTab === 'all' || selectedTab === 'profile') {
    const wsProfile = XLSX.utils.aoa_to_sheet([]);
    buildSubjectProfile(wsProfile, classroomMetadata, students, selectedTab === 'profile');
    XLSX.utils.book_append_sheet(wb, wsProfile, 'Subject Profile');
  }

  if (selectedTab === 'all' || selectedTab === 'record') {
    const wsRecord = XLSX.utils.aoa_to_sheet([]);
    buildRecordSheet(wsRecord, classroomMetadata, students, selectedTab === 'record');
    XLSX.utils.book_append_sheet(wb, wsRecord, 'Record Sheet');
  }

  if (selectedTab === 'all' || selectedTab === 'report') {
    const wsReport = XLSX.utils.aoa_to_sheet([]);
    buildReportOfGrades(wsReport, classroomMetadata, students, selectedTab === 'report');
    XLSX.utils.book_append_sheet(wb, wsReport, 'Report of Grades');
  }

  // Use writeXLSX with cellStyles enabled
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellStyles: true });
  const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
