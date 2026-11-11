// Generates the official DYCI "Office of the Registrar — Class Schedule" form
// as a real .docx, matching the paper template byte-for-byte in layout: a
// weekly time grid on top, the same classes as a flat table underneath, and
// the four signature lines.
//
// SOURCE OF TRUTH: FINALIZED CLASSES ONLY.
// A faculty_load_drafts row that has not been finalized is pre-commit scratch
// work -- reassign_faculty_load can still swap it, find_schedule_conflict can
// still be re-run against it, and it has no class_record_id yet. Printing and
// signing that would put a signature under something that can still change.
// Callers must pass only chips whose state is 'Open' (buildLoadSummary's name
// for "backed by a real, live class_records row").
//
// WHAT IS REAL DATA VS. LETTERHEAD BOILERPLATE
//   College name, faculty name, Registrar name, Dean name, term, every class's
//   subject/section/schedule/room/units -- all fetched, never typed here.
//   The institution's address/phone, the VP Academic Affairs name, and the
//   L.I.V.E./T.A.S.K.S./Onsite legend are static letterhead content: DYCI has
//   no "VP Academic Affairs" role in ASPIRE (only admin/registrar/dean/
//   faculty/student exist), so that one name is a constant below, not a query.

import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, AlignmentType, VerticalAlign, VerticalMergeType,
  ImageRun, ShadingType, HeightRule, TableLayoutType
} from 'docx';
import { formatTimeRange, orderDays } from './classSchedule';
import dyciSealUrl from '../assets/dyci-seal.png';

const INSTITUTION_NAME = "DR. YANGA'S COLLEGES, INC.";
const INSTITUTION_ADDRESS = '182 MacArthur Highway, Wakas, Bocaue, Bulacan PH 3018';
const INSTITUTION_CONTACT = '(044) 617 3419 loc. 141  •  college.registrar@dyci.edu.ph';
// No role for this office exists in ASPIRE (roles are admin/registrar/dean/
// faculty/student) -- it is letterhead content, not system data.
const VP_ACADEMIC_AFFAIRS_NAME = 'DR. HONEY JANE F. SANTIAGO';
const VP_ACADEMIC_AFFAIRS_TITLE = 'Vice President for Academic Affairs';

const DAY_COLUMNS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_LABELS = { Mon: 'MONDAY', Tue: 'TUESDAY', Wed: 'WEDNESDAY', Thu: 'THURSDAY', Fri: 'FRIDAY', Sat: 'SATURDAY' };
// The paper form's grid is 07:00 to 07:00 in 12-hour clock labels -- a
// 12-hour span (7 AM to 7 PM), not a full 24-hour wheel. 24 half-hour rows,
// counted directly off the sample: 07:00-07:30 ... 06:30-07:00.
const GRID_START_MIN = 7 * 60;
const SLOT_MIN = 30;
const SLOT_COUNT = (12 * 60) / SLOT_MIN;

const SAGE_FILL = 'DCE8DC';
const HEADER_FILL = 'D9D9D9';

// "Long bond paper" is Legal size (8.5 x 13 in), not the library's A4
// default -- the previous version never set this, so Word silently laid the
// form out on A4 and nothing after matched the real page.
const PAGE_SIZE = { width: 12240, height: 18720 }; // 8.5in x 13in, in twips
// The specified margins: 0.5in on top, 1in on the other three sides.
const PAGE_MARGIN = { top: 720, bottom: 1440, left: 1440, right: 1440 };
// Usable height on Legal with the margins above is 11.5in (16560 twips). The
// grid's row height is set EXACTLY (not ATLEAST, which would let overflow
// silently grow it back past one page), snug against the font rather than
// padded out -- the paper original is a dense grid, not a spaced-out one.
// Keeping the grid tight is also what leaves room for the summary table to
// hold a genuinely large load (8+ classes) without spilling to a second page.
const GRID_ROW_HEIGHT = 170;
const GRID_HEADER_ROW_HEIGHT = 220;

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** '07:00' style, 12-hour, no AM/PM -- matches the printed form exactly. */
function gridClock(totalMinutes) {
  const normalized = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hour24 = Math.floor(normalized / 60);
  const minute = normalized % 60;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${pad2(hour12)}:${pad2(minute)}`;
}

function buildSlotLabels() {
  const labels = [];
  for (let i = 0; i < SLOT_COUNT; i++) {
    const start = GRID_START_MIN + i * SLOT_MIN;
    labels.push(`${gridClock(start)} – ${gridClock(start + SLOT_MIN)}`);
  }
  return labels;
}

function timeToMinutes(value) {
  if (!value) return null;
  const [h, m] = String(value).split(':');
  const hour = Number(h);
  const minute = Number(m);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/**
 * One entry per day column, each an array of SLOT_COUNT cells:
 *   null                         -- empty
 *   { kind: 'start', span, text } -- first row of a class's block
 *   { kind: 'continue' }         -- a later row of the same block
 *
 * A clash (two classes claiming the same day+slot) cannot reach here in
 * practice -- find_schedule_conflict and find_room_conflict refuse it before
 * Finalize -- but the first class to claim a slot wins rather than throwing,
 * so a pre-existing data oddity produces a slightly wrong document instead of
 * a failed export.
 */
function buildGridCells(classes) {
  const cells = Object.fromEntries(DAY_COLUMNS.map((d) => [d, Array(SLOT_COUNT).fill(null)]));

  for (const cls of classes) {
    const startMin = timeToMinutes(cls.startTime);
    const endMin = timeToMinutes(cls.endTime);
    const days = orderDays(cls.days).filter((d) => DAY_COLUMNS.includes(d));
    if (startMin == null || endMin == null || endMin <= startMin || days.length === 0) continue;

    let relStart = startMin - GRID_START_MIN;
    if (relStart < 0) relStart += 24 * 60;
    let relEnd = relStart + (endMin - startMin);

    const startSlot = clamp(Math.floor(relStart / SLOT_MIN), 0, SLOT_COUNT - 1);
    const endSlot = clamp(Math.ceil(relEnd / SLOT_MIN), startSlot + 1, SLOT_COUNT);

    for (const day of days) {
      const column = cells[day];
      if (column[startSlot]) continue; // already claimed; see note above
      column[startSlot] = {
        kind: 'start',
        span: endSlot - startSlot,
        // One line, not two: a 30-minute block is a single 132-twip-tall row,
        // and a second line would force Word to grow that row past one page.
        text: `${cls.subjectCode} · ${cls.sectionName}`
      };
      for (let s = startSlot + 1; s < endSlot; s++) {
        if (column[s]) break;
        column[s] = { kind: 'continue' };
      }
    }
  }

  return cells;
}

function borderless() {
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  return { top: none, bottom: none, left: none, right: none };
}

function gridBorders() {
  const thin = { style: BorderStyle.SINGLE, size: 2, color: '999999' };
  return { top: thin, bottom: thin, left: thin, right: thin };
}

function textCell(text, { bold = false, align = AlignmentType.LEFT, shading = null, width = null, size = 14, margins = null, line = 190 } = {}) {
  return new TableCell({
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    borders: gridBorders(),
    shading: shading ? { type: ShadingType.CLEAR, fill: shading } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: margins || { top: 10, bottom: 10, left: 30, right: 30 },
    children: [new Paragraph({
      alignment: align,
      spacing: { before: 0, after: 0, line, lineRule: 'exact' },
      children: [new TextRun({ text: String(text ?? ''), bold, size })]
    })]
  });
}

async function fetchLogoImage() {
  const response = await fetch(dyciSealUrl);
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

function buildLetterhead(logoData) {
  const textCellInner = new TableCell({
    borders: borderless(),
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 0 },
        children: [new TextRun({ text: INSTITUTION_NAME, bold: true, size: 24 })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 0 },
        children: [new TextRun({ text: INSTITUTION_ADDRESS, size: 13 })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 0 },
        children: [new TextRun({ text: INSTITUTION_CONTACT, size: 12 })]
      })
    ]
  });

  const logoCell = new TableCell({
    width: { size: 14, type: WidthType.PERCENTAGE },
    borders: borderless(),
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: logoData
        ? [new ImageRun({ data: logoData, transformation: { width: 44, height: 44 }, type: 'png' })]
        : []
    })]
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: borderless(),
    rows: [new TableRow({ children: [logoCell, textCellInner] })]
  });
}

function buildTitleBlock({ collegeName, term, facultyName }) {
  const semesterLabel = term?.semester === '2nd' ? 'Second Semester'
    : term?.semester === '1st' ? 'First Semester'
    : term?.semester === 'summer' ? 'Summer Term'
    : (term?.semester || '');
  return [
    new Paragraph({ spacing: { before: 80, after: 0 }, alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'OFFICE OF THE REGISTRAR', bold: true, size: 19 })] }),
    new Paragraph({ spacing: { before: 0, after: 0 }, alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'CLASS SCHEDULE', bold: true, size: 22 })] }),
    new Paragraph({ spacing: { before: 0, after: 0 }, alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `${semesterLabel}, ${term?.school_year || ''}`, size: 16 })] }),
    new Paragraph({ spacing: { before: 60, after: 0 }, alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: (collegeName || '').toUpperCase(), bold: true, size: 18 })] }),
    new Paragraph({
      spacing: { before: 100, after: 0 },
      alignment: AlignmentType.CENTER,
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000' } },
      children: [new TextRun({ text: facultyName || '', bold: true, size: 17 })]
    }),
    new Paragraph({ spacing: { before: 0, after: 60 }, alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'Faculty', size: 13 })] })
  ];
}

function buildGridTable(classes) {
  const slotLabels = buildSlotLabels();
  const gridCells = buildGridCells(classes);

  const gridCellMargins = { top: 6, bottom: 6, left: 30, right: 30 };

  const headerRow = new TableRow({
    height: { value: GRID_HEADER_ROW_HEIGHT, rule: HeightRule.EXACT },
    // The grid's own total height is fixed at 24 slots regardless of how many
    // classes a faculty member has -- it never grows -- but tableHeader costs
    // nothing and keeps the day labels attached if a page break ever lands
    // inside it for some other reason (a very long faculty name wrapping the
    // title block, for instance).
    tableHeader: true,
    children: [
      textCell('TIME', { bold: true, align: AlignmentType.CENTER, shading: HEADER_FILL, width: 16, size: 14 }),
      ...DAY_COLUMNS.map((d) => textCell(DAY_LABELS[d], { bold: true, align: AlignmentType.CENTER, shading: HEADER_FILL, width: 14, size: 14 }))
    ]
  });

  const rows = [headerRow];
  for (let i = 0; i < SLOT_COUNT; i++) {
    const children = [
      textCell(slotLabels[i], { align: AlignmentType.CENTER, width: 16, size: 12, margins: gridCellMargins, line: 150 })
    ];
    for (const day of DAY_COLUMNS) {
      const cell = gridCells[day][i];
      if (!cell) {
        children.push(textCell('', { width: 14, margins: gridCellMargins, line: 150 }));
      } else if (cell.kind === 'start') {
        children.push(new TableCell({
          width: { size: 14, type: WidthType.PERCENTAGE },
          borders: gridBorders(),
          verticalMerge: VerticalMergeType.RESTART,
          shading: { type: ShadingType.CLEAR, fill: SAGE_FILL },
          verticalAlign: VerticalAlign.CENTER,
          margins: gridCellMargins,
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 0, after: 0, line: 150, lineRule: 'exact' },
            children: [new TextRun({ text: cell.text, bold: true, size: 12 })]
          })]
        }));
      } else {
        children.push(new TableCell({
          width: { size: 14, type: WidthType.PERCENTAGE },
          borders: gridBorders(),
          verticalMerge: VerticalMergeType.CONTINUE,
          shading: { type: ShadingType.CLEAR, fill: SAGE_FILL },
          children: [new Paragraph('')]
        }));
      }
    }
    rows.push(new TableRow({ height: { value: GRID_ROW_HEIGHT, rule: HeightRule.EXACT }, children }));
  }

  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.FIXED, rows });
}

function buildSummaryTable(classes) {
  // tableHeader: true repeats this row at the top of every page the table
  // spans. Without it, a faculty member with enough classes to push this
  // table onto a second page would have an unlabeled continuation -- the
  // reader would have to flip back to page 1 to know which column is which.
  const header = new TableRow({
    height: { value: 220, rule: HeightRule.EXACT },
    tableHeader: true,
    children: ['Code', 'Subject', 'Day', 'Time', 'Room/Lab', 'Section', 'Units', 'Hours']
      .map((label) => textCell(label, { bold: true, align: AlignmentType.CENTER, shading: HEADER_FILL, size: 15 }))
  });

  const rows = [header];
  for (const cls of classes) {
    const days = orderDays(cls.days);
    const dayLabel = days.map((d) => d.slice(0, 3)).join('/');
    const timeLabel = formatTimeRange(cls.startTime, cls.endTime);
    const startMin = timeToMinutes(cls.startTime);
    const endMin = timeToMinutes(cls.endTime);
    const hours = startMin != null && endMin != null && endMin > startMin && days.length > 0
      ? Math.round(((endMin - startMin) / 60) * days.length * 100) / 100
      : '';

    rows.push(new TableRow({
      height: { value: 220, rule: HeightRule.ATLEAST },
      // One class's row never breaks mid-row across a page boundary -- it
      // moves to the next page whole instead.
      cantSplit: true,
      children: [
        textCell(cls.subjectCode, { align: AlignmentType.CENTER, size: 15 }),
        textCell(cls.subjectName, { size: 15 }),
        textCell(dayLabel, { align: AlignmentType.CENTER, size: 15 }),
        textCell(timeLabel, { align: AlignmentType.CENTER, size: 15 }),
        textCell(cls.room || '', { align: AlignmentType.CENTER, size: 15 }),
        textCell(cls.sectionName, { align: AlignmentType.CENTER, size: 15 }),
        textCell(cls.units ?? '', { align: AlignmentType.CENTER, size: 15 }),
        textCell(hours, { align: AlignmentType.CENTER, size: 15 })
      ]
    }));
  }

  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.FIXED, rows });
}

function buildSignatureBlock({ facultyName, registrarName, deanName, collegeName }) {
  const line = (label, name, title) => [
    new TableCell({
      borders: borderless(),
      width: { size: 50, type: WidthType.PERCENTAGE },
      margins: { top: 120, bottom: 40 },
      children: [
        new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun({ text: `${label}:`, size: 14 })] }),
        new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun({ text: name || 'NAME', bold: true, size: 17 })] }),
        new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun({ text: title, size: 13, color: '666666' })] })
      ]
    })
  ];

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: borderless(),
    rows: [
      new TableRow({ children: [
        ...line('Prepared by', facultyName, 'Faculty'),
        ...line('Checked by', registrarName, 'Registrar')
      ] }),
      new TableRow({ children: [
        ...line('Reviewed by', deanName, `Dean, College of ${collegeName || ''}`),
        ...line('Approved by', VP_ACADEMIC_AFFAIRS_NAME, VP_ACADEMIC_AFFAIRS_TITLE)
      ] })
    ]
  });
}

function buildLegend() {
  const entry = (label, body) => new Paragraph({
    spacing: { before: 60, after: 0 },
    children: [
      new TextRun({ text: `${label}  `, bold: true, size: 13 }),
      new TextRun({ text: body, size: 13 })
    ]
  });
  return [
    entry('L.I.V.E.', '(Learning and Instructions through Virtual Engagements) is the online class meetings using real-time modalities such as Google Meet or Zoom applications.'),
    entry('T.A.S.K.S.', '(Time for Activities, Self-study, and Knowledge Synthesis) is the schedule for independent learning and assessments.'),
    entry('ONSITE LEARNING EXPERIENCES', '(includes Laboratory/Shop courses, OJT and Apprenticeship).')
  ];
}

/** One faculty member's page-worth of content, reused by both export modes. */
function buildFacultySection({ collegeName, term, facultyName, registrarName, deanName, classes }, logoData) {
  return [
    buildLetterhead(logoData),
    ...buildTitleBlock({ collegeName, term, facultyName }),
    buildGridTable(classes),
    new Paragraph({ spacing: { before: 60, after: 0 }, children: [] }),
    buildSummaryTable(classes),
    new Paragraph({ spacing: { before: 80, after: 0 }, children: [] }),
    buildSignatureBlock({ facultyName, registrarName, deanName, collegeName }),
    new Paragraph({ spacing: { before: 40, after: 0 }, children: [] }),
    ...buildLegend()
  ];
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function safeName(value) {
  return String(value || '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
}

/**
 * One faculty member's filled form.
 * `classes` must already be filtered to that faculty's FINALIZED load only
 * (buildLoadSummary chips with state === 'Open').
 */
export async function exportFacultyScheduleDocx({ collegeName, term, facultyName, registrarName, deanName, classes }) {
  const logoData = await fetchLogoImage().catch(() => null);
  const doc = new Document({
    sections: [{
      properties: { page: { size: PAGE_SIZE, margin: PAGE_MARGIN } },
      children: buildFacultySection({ collegeName, term, facultyName, registrarName, deanName, classes }, logoData)
    }]
  });
  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, `ASPIRE_Class_Schedule_${safeName(facultyName)}_${safeName(term?.school_year)}_${safeName(term?.semester)}.docx`);
}

/**
 * One .docx for the whole college, one page per faculty member, in the order
 * given. Faculty with no finalized classes are the caller's decision to
 * include or skip -- this function renders whatever list it is handed.
 */
export async function exportCollegeScheduleDocx({ collegeName, term, registrarName, deanName, facultyList }) {
  const logoData = await fetchLogoImage().catch(() => null);
  const sections = facultyList.map((member, index) => ({
    properties: {
      page: { size: PAGE_SIZE, margin: PAGE_MARGIN },
      ...(index > 0 ? { type: 'nextPage' } : {})
    },
    children: buildFacultySection({
      collegeName, term, facultyName: member.name, registrarName, deanName, classes: member.classes
    }, logoData)
  }));
  const doc = new Document({ sections });
  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, `ASPIRE_Class_Schedule_${safeName(collegeName)}_${safeName(term?.school_year)}_${safeName(term?.semester)}.docx`);
}
