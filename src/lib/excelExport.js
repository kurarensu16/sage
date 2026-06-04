import * as XLSX from 'xlsx';

// Safe getter to resolve student term scores
const getScore = (student, term, key) => {
  let termData = student.periods?.[term];
  if (!termData && term === 'Semi-Final') {
    termData = student.periods?.SemiFinal;
  }
  return termData?.[key] ?? 0;
};

// Helper to write cells safely
const setCell = (ws, r, c, val, isFormula = false, numFormat = null) => {
  const ref = XLSX.utils.encode_cell({ r, c });
  if (isFormula) {
    ws[ref] = { t: 'n', f: val };
  } else {
    const t = typeof val === 'number' ? 'n' : 's';
    ws[ref] = { t, v: val };
  }
  if (numFormat) {
    ws[ref].z = numFormat;
  }
};

/**
 * Generates the "Record Sheet" worksheet
 */
export function buildRecordSheet(ws, metadata, students) {
  // Set metadata headers
  setCell(ws, 1, 0, 'College:');
  setCell(ws, 1, 1, metadata.college || 'College of Computer Studies');
  setCell(ws, 1, 12, 'Course:');
  setCell(ws, 1, 13, metadata.course || 'BSIT');

  setCell(ws, 2, 0, 'Subject:');
  setCell(ws, 2, 1, metadata.subjectName || 'Capstone and Research 1');
  setCell(ws, 2, 12, 'Section:');
  setCell(ws, 2, 13, metadata.section || 'IT3A');

  setCell(ws, 1, 20, 'RECORD SHEET FOR GENERAL EDUCATION SUBJECTS');

  // Term Periods Header Definitions (Row 5 to 7: 0-indexed r=4 to r=6)
  const periods = [
    { name: 'PRELIMINARY GRADE', startCol: 3, bg: 'sky' },
    { name: 'MIDTERM GRADE', startCol: 15, bg: 'indigo' },
    { name: 'SEMI-FINAL GRADE', startCol: 28, bg: 'amber' },
    { name: 'FINAL GRADE', startCol: 40, bg: 'orange' }
  ];

  // A5:A7, B5:B7, C5:C7
  setCell(ws, 4, 0, 'No.');
  setCell(ws, 4, 1, 'Student No.');
  setCell(ws, 4, 2, 'NAME');

  periods.forEach(p => {
    setCell(ws, 4, p.startCol, p.name);
    setCell(ws, 5, p.startCol, 'Class Standing');
    for (let i = 0; i < 6; i++) {
      setCell(ws, 6, p.startCol + i, i + 1);
    }
    setCell(ws, 6, p.startCol + 6, 'Total');
    setCell(ws, 6, p.startCol + 7, '%');
    
    setCell(ws, 5, p.startCol + 8, 'Char');
    setCell(ws, 6, p.startCol + 8, 'Char');
    
    setCell(ws, 5, p.startCol + 9, 'Term Exam');
    setCell(ws, 6, p.startCol + 9, 'Raw');
    setCell(ws, 6, p.startCol + 10, '%');
    
    setCell(ws, 5, p.startCol + 11, 'Rating');
    setCell(ws, 6, p.startCol + 11, 'Rating');
  });

  setCell(ws, 4, 27, 'MIDTERM RATING (MR)');
  setCell(ws, 4, 52, 'TENTATIVE FINAL RATING (TFR)');
  setCell(ws, 4, 53, 'SEMESTRAL GRADE (SG)');
  setCell(ws, 4, 54, 'EQUIVALENT GWA');
  setCell(ws, 4, 55, 'REMARKS');

  // Max Scores in Row 8 (0-indexed r=7)
  const setMaxScores = (startCol) => {
    setCell(ws, 7, startCol, 20);
    setCell(ws, 7, startCol + 1, 20);
    setCell(ws, 7, startCol + 2, 20);
    setCell(ws, 7, startCol + 3, 20);
    setCell(ws, 7, startCol + 4, 20);
    setCell(ws, 7, startCol + 5, 10);
    setCell(ws, 7, startCol + 6, 110);
    setCell(ws, 7, startCol + 7, 50);
    setCell(ws, 7, startCol + 8, 100);
    setCell(ws, 7, startCol + 9, 40);
    setCell(ws, 7, startCol + 10, 40);
    setCell(ws, 7, startCol + 11, 100);
  };
  periods.forEach(p => setMaxScores(p.startCol));

  // Write Student Data & Formulas starting at Row 9 (0-indexed r=8)
  students.forEach((student, idx) => {
    const r = 8 + idx; // 0-indexed row index
    const rName = r + 1; // Excel row number (1-indexed)
    
    setCell(ws, r, 0, idx + 1);
    
    // Use student's real student number or fall back to clean mock student ID
    const studentNo = student.studentNo || (student.id === 11 ? '2025-1001' : student.id === 12 ? '2025-1002' : student.id === 13 ? '2025-1003' : `2025-100${student.id}`);
    setCell(ws, r, 1, studentNo);
    setCell(ws, r, 2, student.name.toUpperCase());

    // Terms logic
    const terms = [
      { name: 'Prelim', startCol: 3, startL: 'D', endL: 'I', totL: 'J', csL: 'K', charL: 'L', exRawL: 'M', exPctL: 'N', ratL: 'O' },
      { name: 'Midterm', startCol: 15, startL: 'P', endL: 'U', totL: 'V', csL: 'W', charL: 'X', exRawL: 'Y', exPctL: 'Z', ratL: 'AA' },
      { name: 'Semi-Final', startCol: 28, startL: 'AC', endL: 'AH', totL: 'AI', csL: 'AJ', charL: 'AK', exRawL: 'AL', exPctL: 'AM', ratL: 'AN' },
      { name: 'Final', startCol: 40, startL: 'AO', endL: 'AT', totL: 'AU', csL: 'AV', charL: 'AW', exRawL: 'AX', exPctL: 'AY', ratL: 'AZ' }
    ];

    terms.forEach(t => {
      // CS Activities
      setCell(ws, r, t.startCol, getScore(student, t.name, 'act1'));
      setCell(ws, r, t.startCol + 1, getScore(student, t.name, 'act2'));
      setCell(ws, r, t.startCol + 2, getScore(student, t.name, 'act3'));
      setCell(ws, r, t.startCol + 3, getScore(student, t.name, 'act4'));
      setCell(ws, r, t.startCol + 4, getScore(student, t.name, 'act5'));
      setCell(ws, r, t.startCol + 5, getScore(student, t.name, 'act6'));

      // Totals and Converted Percentages via Formulas
      setCell(ws, r, t.startCol + 6, `IF($C${rName}="","",SUM(${t.startL}${rName}:${t.endL}${rName}))`, true, '0');
      setCell(ws, r, t.startCol + 7, `IF($C${rName}="","",IF(${t.totL}$8>0, (${t.totL}${rName}/${t.totL}$8)*50, 0))`, true, '0.00');
      
      // Char Score
      setCell(ws, r, t.startCol + 8, getScore(student, t.name, 'char'));

      // Exam Raw
      setCell(ws, r, t.startCol + 9, getScore(student, t.name, 'exam'));
      
      // Exam % and Period Rating Formulas
      setCell(ws, r, t.startCol + 10, `IF($C${rName}="","",IF(${t.exRawL}$8>0, (${t.exRawL}${rName}/${t.exRawL}$8)*40, 0))`, true, '0.00');
      setCell(ws, r, t.startCol + 11, `IF($C${rName}="","",ROUND(${t.csL}${rName}+(${t.charL}${rName}*0.1)+${t.exPctL}${rName},0))`, true, '0');
    });

    // Rating average progression formulas
    // MR: `=ROUND(AVERAGE(O9, AA9), 0)`
    setCell(ws, r, 27, `IF($C${rName}="","",ROUND(AVERAGE(O${rName},AA${rName}),0))`, true, '0');
    // TFR: `=ROUND(AVERAGE(AN9, AZ9), 0)`
    setCell(ws, r, 52, `IF($C${rName}="","",ROUND(AVERAGE(AN${rName},AZ${rName}),0))`, true, '0');
    // SG: `=ROUND(AVERAGE(AB9, BA9), 0)`
    setCell(ws, r, 53, `IF($C${rName}="","",ROUND(AVERAGE(AB${rName},BA${rName}),0))`, true, '0');

    // Transmutation scale formula (equivalent GWA)
    const gwaFormula = `IF($C${rName}="","",IF(BB${rName}>=98, 1, IF(BB${rName}>=95, 1.25, IF(BB${rName}>=92, 1.5, IF(BB${rName}>=89, 1.75, IF(BB${rName}>=86, 2, IF(BB${rName}>=83, 2.25, IF(BB${rName}>=80, 2.5, IF(BB${rName}>=77, 2.75, IF(BB${rName}>=75, 3, 5))))))))))`;
    setCell(ws, r, 54, gwaFormula, true, '0.00');

    // Remarks formula
    setCell(ws, r, 55, `IF($C${rName}="","",IF(BC${rName}<=3, "Passed", "Failed"))`, true);
  });

  // Apply layout configurations (Column Merges & Widths)
  const merges = [
    { s: { r: 4, c: 3 }, e: { r: 4, c: 14 } },   // D5:O5 - PRELIM GRADE
    { s: { r: 4, c: 15 }, e: { r: 4, c: 26 } },  // P5:AA5 - MIDTERM GRADE
    { s: { r: 4, c: 28 }, e: { r: 4, c: 39 } },  // AC5:AN5 - SEMI-FINAL GRADE
    { s: { r: 4, c: 40 }, e: { r: 4, c: 51 } },  // AO5:AZ5 - FINAL GRADE
    
    { s: { r: 5, c: 3 }, e: { r: 5, c: 8 } },    // D6:I6 - Class Standing
    { s: { r: 5, c: 12 }, e: { r: 5, c: 13 } },  // M6:N6 - Term Exam
    { s: { r: 5, c: 15 }, e: { r: 5, c: 20 } },  // P6:U6 - Class Standing
    { s: { r: 5, c: 24 }, e: { r: 5, c: 25 } },  // Y6:Z6 - Term Exam
    { s: { r: 5, c: 28 }, e: { r: 5, c: 33 } },  // AC6:AH6 - Class Standing
    { s: { r: 5, c: 37 }, e: { r: 5, c: 38 } },  // AL6:AM6 - Term Exam
    { s: { r: 5, c: 40 }, e: { r: 5, c: 45 } },  // AO6:AT6 - Class Standing
    { s: { r: 5, c: 49 }, e: { r: 5, c: 50 } },  // AX6:AY6 - Term Exam
    
    { s: { r: 4, c: 0 }, e: { r: 6, c: 0 } },    // A5:A7 - No
    { s: { r: 4, c: 1 }, e: { r: 6, c: 1 } },    // B5:B7 - Student No
    { s: { r: 4, c: 2 }, e: { r: 6, c: 2 } },    // C5:C7 - Name
    { s: { r: 4, c: 27 }, e: { r: 6, c: 27 } },  // AB5:AB7 - MR
    { s: { r: 4, c: 52 }, e: { r: 6, c: 52 } },  // BA5:BA7 - TFR
    { s: { r: 4, c: 53 }, e: { r: 6, c: 53 } },  // BB5:BB7 - SG
    { s: { r: 4, c: 54 }, e: { r: 6, c: 54 } },  // BC5:BC7 - GWA
    { s: { r: 4, c: 55 }, e: { r: 6, c: 55 } }   // BD5:BD7 - Remarks
  ];
  ws['!merges'] = merges;

  // Setup Column Widths
  const cols = [{ wch: 5 }, { wch: 12 }, { wch: 25 }];
  for (let t = 0; t < 4; t++) {
    for (let i = 0; i < 6; i++) cols.push({ wch: 4 }); // CS 1-6
    cols.push({ wch: 6 }); // Total
    cols.push({ wch: 6 }); // %
    cols.push({ wch: 6 }); // Char
    cols.push({ wch: 6 }); // Raw
    cols.push({ wch: 6 }); // %
    cols.push({ wch: 7 }); // Rating
    if (t === 1) cols.push({ wch: 8 }); // MR
  }
  cols.push({ wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 10 });
  ws['!cols'] = cols;

  // Range boundary setting
  const maxRow = 8 + Math.max(15, students.length);
  ws['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: maxRow, c: 55 }
  });
}

/**
 * Generates the "Report of Grades" worksheet
 */
export function buildReportOfGrades(ws, metadata, students) {
  // 1. Grade Conversion Scale (Columns A-B, Rows 5-16)
  const scale = [
    { label: '98-100', val: 1.00 },
    { label: '95-97', val: 1.25 },
    { label: '92-94', val: 1.50 },
    { label: '89-91', val: 1.75 },
    { label: '86-88', val: 2.00 },
    { label: '83-85', val: 2.25 },
    { label: '80-82', val: 2.50 },
    { label: '77-79', val: 2.75 },
    { label: '75-76', val: 3.00 },
    { label: '74 below', val: 5.00 },
    { label: 'Incomplete', val: 'Inc.' },
    { label: 'Dropped', val: 'Drp.' }
  ];

  scale.forEach((s, idx) => {
    const r = 4 + idx; // row index (0-indexed, so row 5 to 16)
    setCell(ws, r, 0, s.label);
    setCell(ws, r, 1, s.val);
  });

  // 2. Registrar Headers (Columns E-I, L-N)
  setCell(ws, 5, 4, 'OFFICE OF THE REGISTRAR');
  setCell(ws, 6, 4, 'REPORT OF GRADES');
  setCell(ws, 9, 4, 'Semester / Summer and School Year');
  setCell(ws, 11, 4, `${metadata.semester || '2nd Sem'}   -   ${metadata.schoolYear || '2025-2026'}`);
  
  setCell(ws, 13, 3, 'Course:');
  setCell(ws, 13, 4, metadata.course || 'BSIT');
  setCell(ws, 13, 7, 'Section:');
  setCell(ws, 13, 8, metadata.section || 'IT3A');

  setCell(ws, 4, 11, 'Subject Code:');
  setCell(ws, 5, 11, metadata.subjectCode || 'BSITCPR323');
  setCell(ws, 6, 11, 'Subject Description:');
  setCell(ws, 7, 11, metadata.subjectName || 'Capstone and Research 1');
  setCell(ws, 8, 11, 'College:');
  setCell(ws, 9, 11, metadata.college || 'College of Computer Studies');
  setCell(ws, 10, 11, 'Schedule of Classes:');
  setCell(ws, 11, 11, 'Day:');
  setCell(ws, 11, 12, metadata.day || 'Sat');
  setCell(ws, 12, 11, 'Time/Hour:');
  setCell(ws, 12, 12, metadata.time || '7:00 - 10:00');
  
  // Enrolled count or units placeholder
  setCell(ws, 14, 13, metadata.units || 3);

  // 3. Main Roster Table Header (Row 17)
  setCell(ws, 16, 0, 'No.');
  setCell(ws, 16, 1, "Student's Name");
  setCell(ws, 16, 4, 'MR');
  setCell(ws, 16, 5, 'TFR');
  setCell(ws, 16, 6, 'SG');
  
  setCell(ws, 16, 7, 'No.');
  setCell(ws, 16, 8, "Student's Name");
  setCell(ws, 16, 11, 'MR');
  setCell(ws, 16, 12, 'TFR');
  setCell(ws, 16, 13, 'SG');

  // 4. Populate split student roster (Left for 1-30, Right for 31-60)
  // Generating empty rows up to row 30 is the institutional format
  const totalRosterRows = 30;
  
  for (let i = 0; i < totalRosterRows; i++) {
    const leftRow = 17 + i; // Excel row (1-indexed row 18 to 47)
    
    // Left student (idx: i)
    setCell(ws, leftRow, 0, i + 1);
    const leftStudent = students[i];
    if (leftStudent) {
      setCell(ws, leftRow, 1, leftStudent.name.toUpperCase());
      const recRow = 9 + i; // Corresponding student row in 'Record Sheet'
      setCell(ws, leftRow, 4, `IF('Record Sheet'!C${recRow}="","", 'Record Sheet'!AB${recRow}&"%")`, true);
      setCell(ws, leftRow, 5, `IF('Record Sheet'!C${recRow}="","", 'Record Sheet'!BA${recRow}&"%")`, true);
      setCell(ws, leftRow, 6, `IF('Record Sheet'!C${recRow}="","", 'Record Sheet'!BC${recRow})`, true);
    } else {
      setCell(ws, leftRow, 1, '');
      setCell(ws, leftRow, 4, '');
      setCell(ws, leftRow, 5, '');
      setCell(ws, leftRow, 6, '');
    }

    // Right student (idx: i + 30)
    setCell(ws, leftRow, 7, i + 31);
    const rightStudent = students[i + 30];
    if (rightStudent) {
      setCell(ws, leftRow, 8, rightStudent.name.toUpperCase());
      const recRow = 9 + (i + 30);
      setCell(ws, leftRow, 11, `IF('Record Sheet'!C${recRow}="","", 'Record Sheet'!AB${recRow}&"%")`, true);
      setCell(ws, leftRow, 12, `IF('Record Sheet'!C${recRow}="","", 'Record Sheet'!BA${recRow}&"%")`, true);
      setCell(ws, leftRow, 13, `IF('Record Sheet'!C${recRow}="","", 'Record Sheet'!BC${recRow})`, true);
    } else {
      setCell(ws, leftRow, 8, '');
      setCell(ws, leftRow, 11, '');
      setCell(ws, leftRow, 12, '');
      setCell(ws, leftRow, 13, '');
    }
  }

  // 5. Build Merges
  const merges = [
    { s: { r: 5, c: 4 }, e: { r: 5, c: 6 } },   // E6:G6 - OFFICE OF THE REGISTRAR
    { s: { r: 6, c: 4 }, e: { r: 6, c: 6 } },   // E7:G7 - REPORT OF GRADES
    { s: { r: 9, c: 4 }, e: { r: 9, c: 6 } },   // E10:G10 - Semester label
    { s: { r: 11, c: 4 }, e: { r: 11, c: 6 } }, // E12:G12 - Semester value
    
    { s: { r: 4, c: 11 }, e: { r: 4, c: 13 } },   // L5:N5
    { s: { r: 5, c: 11 }, e: { r: 5, c: 13 } },   // L6:N6
    { s: { r: 6, c: 11 }, e: { r: 6, c: 13 } },   // L7:N7
    { s: { r: 7, c: 11 }, e: { r: 7, c: 13 } },   // L8:N8
    { s: { r: 8, c: 11 }, e: { r: 8, c: 13 } },   // L9:N9
    { s: { r: 9, c: 11 }, e: { r: 9, c: 13 } },   // L10:N10
    { s: { r: 10, c: 11 }, e: { r: 10, c: 13 } }  // L11:N11
  ];

  // Merge student names horizontally across 3 columns (B-D for left, I-K for right)
  for (let i = 0; i < totalRosterRows; i++) {
    const leftRow = 17 + i;
    merges.push({ s: { r: leftRow, c: 1 }, e: { r: leftRow, c: 3 } }); // B-D
    merges.push({ s: { r: leftRow, c: 8 }, e: { r: leftRow, c: 10 } }); // I-K
  }
  
  ws['!merges'] = merges;

  // Setup Column Widths
  ws['!cols'] = [
    { wch: 5 },   // A: No
    { wch: 10 },  // B: Name (col 1)
    { wch: 10 },  // C: Name (col 2)
    { wch: 10 },  // D: Name (col 3)
    { wch: 8 },   // E: MR
    { wch: 8 },   // F: TFR
    { wch: 8 },   // G: SG (Equivalent GWA)
    { wch: 5 },   // H: No (Right)
    { wch: 10 },  // I: Name (Right col 1)
    { wch: 10 },  // J: Name (Right col 2)
    { wch: 10 },  // K: Name (Right col 3)
    { wch: 8 },   // L: MR (Right)
    { wch: 8 },   // M: TFR (Right)
    { wch: 8 }    // N: SG (Right)
  ];

  // Boundaries range setting
  ws['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: 47, c: 13 }
  });
}

/**
 * Triggers Excel Download
 */
export function triggerExcelExport(classroomMetadata, students, mode) {
  const wb = XLSX.utils.book_new();
  const filename = `${classroomMetadata.subjectCode}_${classroomMetadata.section}_Gradesheet.xlsx`;

  if (mode === 'record_sheet' || mode === 'both') {
    const wsRecord = XLSX.utils.aoa_to_sheet([]);
    buildRecordSheet(wsRecord, classroomMetadata, students);
    XLSX.utils.book_append_sheet(wb, wsRecord, 'Record Sheet');
  }

  if (mode === 'report_of_grades' || mode === 'both') {
    const wsReport = XLSX.utils.aoa_to_sheet([]);
    buildReportOfGrades(wsReport, classroomMetadata, students);
    XLSX.utils.book_append_sheet(wb, wsReport, 'Report of Grades');
  }

  // Trigger SheetJS file write
  XLSX.writeFile(wb, filename);
}
